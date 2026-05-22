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

const ENABLED         = process.env.NEXUS_AUTH_ENABLED === 'true';
const SECRET          = process.env.TENANT_TOKEN_SECRET || '';
const EXPECTED_SUBMOD = parseInt(process.env.NEXUS_EXPECTED_SUBMODULO_ID || '0', 10);

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

function nexusAuth(req, res, next) {
  const token = extractToken(req);

  if (!ENABLED) {
    // Modo permissive: intenta decodificar sin verificar para tracking
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && typeof decoded === 'object') {
          req.empresa = { id: decoded.empresaId };
          req.submoduloId = decoded.submoduloId;
        }
      } catch { /* ignore */ }
    }
    return next();
  }

  if (!SECRET) {
    return res.status(500).json({
      success: false,
      code: 'NEXUS_AUTH_MISCONFIGURED',
      message: 'TENANT_TOKEN_SECRET no está configurado en el backend.',
    });
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'NEXUS_TOKEN_MISSING',
      message: 'Token de acceso requerido (Authorization: Bearer <token>).',
    });
  }

  try {
    const payload = jwt.verify(token, SECRET);
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
    if (EXPECTED_SUBMOD > 0 && payload.submoduloId !== EXPECTED_SUBMOD) {
      return res.status(403).json({
        success: false,
        code: 'NEXUS_TOKEN_WRONG_SUBMODULE',
        message: `Token emitido para submódulo ${payload.submoduloId}, este backend espera ${EXPECTED_SUBMOD}.`,
      });
    }
    req.empresa = { id: payload.empresaId };
    req.submoduloId = payload.submoduloId;
    req.nexusToken = token;
    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      code: 'NEXUS_TOKEN_INVALID',
      message: 'Token inválido o expirado.',
    });
  }
}

module.exports = nexusAuth;
