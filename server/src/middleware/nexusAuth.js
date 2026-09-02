/**
 * Middleware de autenticación multi-tenant via Nexus token.
 *
 * Valida que cada request lleve un `nexus_token` válido firmado por
 * `nexus-api`. Extrae `empresaId` y `submoduloId` del payload y los
 * inyecta en `req.empresa` y `req.submoduloId` para uso aguas abajo.
 *
 * Además valida que el `submoduloId` del token corresponda al submódulo
 * que está corriendo (config NEXUS_EXPECTED_SUBMODULO_ID). Esto evita
 * que un token emitido para el OCR sea usado para llamar al backend
 * del módulo de Pagos, por ejemplo.
 *
 * Permite obtener el token desde:
 *   - Header `Authorization: Bearer <token>`  (preferido)
 *   - Header `x-nexus-token: <token>`
 *   - Query  `?nexus_token=<token>`           (fallback)
 *
 * Configuración (.env):
 *   NEXUS_AUTH_ENABLED=true               # activar/desactivar la validación
 *   TENANT_TOKEN_SECRET=...               # mismo secret que nexus-api
 *   NEXUS_EXPECTED_SUBMODULO_ID=17        # id del submódulo en BD de nexus
 *
 * Si NEXUS_AUTH_ENABLED !== 'true', se omite la validación pero igual
 * se intenta extraer el empresaId para fines de logging/aislamiento.
 */
const jwt = require('jsonwebtoken');
const { restoreMarketplaceActor } = require('../lib/marketplace-actor-cache');

function done(req, _res, next) {
  try { restoreMarketplaceActor(req); } catch { /* ignore */ }
  return next();
}

const ENABLED         = process.env.NEXUS_AUTH_ENABLED === 'true';
const SECRET          = process.env.TENANT_TOKEN_SECRET || '';
// Un mismo backend puede atender varios submódulos (p.ej. el mismo backend para
// el flujo RCV y el flujo Funerario). Se aceptan varios ids vía
// NEXUS_EXPECTED_SUBMODULO_IDS=19,23 (lista) o el legacy NEXUS_EXPECTED_SUBMODULO_ID.
const EXPECTED_SUBMODS = (
  process.env.NEXUS_EXPECTED_SUBMODULO_IDS ||
  process.env.NEXUS_EXPECTED_SUBMODULO_ID ||
  ''
)
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isInteger(n) && n > 0);

function extractToken(req) {
  const auth = req.headers.authorization || req.headers['x-nexus-token'];
  if (auth && typeof auth === 'string') {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  if (req.query && req.query.nexus_token) {
    return String(req.query.nexus_token);
  }
  return null;
}

async function nexusAuth(req, res, next) {
  const token = extractToken(req);

  // Llamadas desde localhost (pagos-api proxy o Vite dev proxy) son confiables —
  // ya pasaron por el auth del módulo de origen. Se omite el check de submodule
  // pero se sigue verificando que el token sea un tenant_access válido.
  const remoteAddr = req.socket?.remoteAddress ?? req.connection?.remoteAddress ?? '';
  const isInternalProxy =
    remoteAddr === '127.0.0.1' ||
    remoteAddr === '::ffff:127.0.0.1';

  // --- BYPASS PARA LA MUNDIAL Y QA ---
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  const whitelistedOrigins = (process.env.WHITELISTED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  let isBypass = false;
  for (const w of whitelistedOrigins) {
    if (origin.includes(w) || referer.includes(w) || remoteAddr.includes(w)) {
      isBypass = true;
      break;
    }
  }

  if (isBypass) {
    req.empresa = { id: 1 };
    req.submoduloId = EXPECTED_SUBMODS.length > 0 ? EXPECTED_SUBMODS[0] : 17;

    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && typeof decoded === 'object') {
          req.nexusMetadata = decoded.metadata || {};
        }
      } catch { /* ignorar token malformado en bypass */ }
    }

    return done(req, res, next);
  }
  // -----------------------------------

  if (!ENABLED) {
    // Modo permissive: intenta decodificar sin verificar para tracking + metadata SSO
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && typeof decoded === 'object') {
          req.empresa = { id: decoded.empresaId };
          req.submoduloId = decoded.submoduloId;
          req.nexusMetadata = decoded.metadata || {};
        }
      } catch { /* ignore */ }
    }
    return done(req, res, next);
  }

  if (!SECRET) {
    return res.status(500).json({
      success: false,
      code: 'NEXUS_AUTH_MISCONFIGURED',
      message: 'TENANT_TOKEN_SECRET no está configurado en el backend.',
    });
  }

  if (!token) {
    if (isInternalProxy) return done(req, res, next);
    return res.status(401).json({
      success: false,
      code: 'NEXUS_TOKEN_MISSING',
      message: 'Token de acceso requerido (Authorization: Bearer <token>).',
    });
  }

  try {
    const payload = jwt.verify(token, SECRET, { ignoreExpiration: true });

    // Token del parametrizador (Nexus Admin): solo lecturas de catálogo (planes).
    // No es tenant_access; no pasa por heartbeat SSO.
    if (payload.scope === 'config-panel') {
      const path = String(req.path || '');
      const url = String(req.originalUrl || '');
      const isPlanesCatalog =
        req.method === 'GET' &&
        (path === '/planes' ||
          path.endsWith('/planes') ||
          /\/personas\/planes(\?|$)/.test(url));
      if (!isPlanesCatalog) {
        return res.status(403).json({
          success: false,
          code: 'NEXUS_CONFIG_PANEL_READ_ONLY',
          message: 'El token del parametrizador solo permite consultar catálogo de planes.',
        });
      }
      req.empresa = { id: Number(payload.empresaId) || 1 };
      req.nexusMetadata = payload.metadata || {};
      if (payload.canal) {
        req.nexusMetadata = { ...req.nexusMetadata, canal: payload.canal };
      }
      return done(req, res, next);
    }

    if (payload.type !== 'tenant_access') {
      return res.status(401).json({
        success: false,
        code: 'NEXUS_TOKEN_INVALID_TYPE',
        message: 'Tipo de token inválido.',
      });
    }
    if (!payload.empresaId || !payload.submoduloId) {
      return res.status(401).json({
        success: false,
        code: 'NEXUS_TOKEN_INCOMPLETE',
        message: 'El token no contiene empresaId/submoduloId.',
      });
    }
    // Proxy interno: saltar verificación de submódulo — el caller ya autenticó al usuario
    if (!isInternalProxy && EXPECTED_SUBMODS.length > 0 && !EXPECTED_SUBMODS.includes(payload.submoduloId)) {
      return res.status(403).json({
        success: false,
        code: 'NEXUS_TOKEN_WRONG_SUBMODULE',
        message: `Token emitido para submódulo ${payload.submoduloId}, este backend espera ${EXPECTED_SUBMODS.join(', ')}.`,
      });
    }
    req.empresa = { id: payload.empresaId };
    req.submoduloId = payload.submoduloId;
    req.nexusToken = token;
    req.nexusMetadata = payload.metadata || {};

    // ── Heartbeat: renueva el token en BD, verifica empresa activa y
    //    obtiene un nuevo access_token (1h) con la misma metadata original.
    //    Si el servidor devuelve access_token, se reemplaza en req.nexusToken
    //    para que las capas siguientes (y el cliente via header) usen el fresco.
    const NEXUS_API = (process.env.NEXUS_API_URL || 'http://192.168.8.120:3092').replace(/\/$/, '');
    try {
      const hbRes = await fetch(`${NEXUS_API}/api/access/heartbeat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (hbRes.ok) {
        const hb = await hbRes.json();
        if (hb.active === false) {
          return res.status(403).json({ success: false, code: 'ACCESS_SUSPENDED', message: hb.reason || 'Acceso suspendido. Contacte a su administrador.' });
        }
        // Token renovado: actualizar en req para que rutas aguas abajo lo lean
        if (hb.access_token) {
          req.nexusToken = hb.access_token;
          res.setHeader('X-Nexus-Token-Refreshed', hb.access_token);
          res.setHeader('Access-Control-Expose-Headers', 'X-Nexus-Token-Refreshed');
        }
      }
    } catch { /* heartbeat no crítico: continuar si nexus-api no responde */ }
    // ────────────────────────────────────────────────────────────────────────

    return done(req, res, next);
  } catch (err) {
    return res.status(401).json({
      success: false,
      code: 'NEXUS_TOKEN_INVALID',
      message: 'Token inválido o expirado.',
    });
  }
}

module.exports = nexusAuth;
