/** Circular SAA-02-1079-2026 — utilidades DDS/DDC compartidas en módulos Exélixi. */

export type TipoDiligencia = 'S' | 'C';

export type DiligenciaDocType = 'cedula' | 'licencia' | 'certificado' | 'rif' | 'pasaporte';

export interface DocConfigEntry {
  key: string;
  activo: boolean;
  obligatorio: boolean;
  label?: string;
}

export interface ProductDiligenciaConfig {
  umbralMultiplicador: number;
  fuenteTc: 'bcv' | 'manual';
  pjSiempreDdc: boolean;
  planesMasivos: string[];
}

export interface DiligenciaState {
  itipoDiligencia: TipoDiligencia;
  documentosRequeridos: DiligenciaDocType[];
  camposObligatorios: string[];
  primaAnualBs?: number;
  umbralBs?: number;
  tcBcv?: number;
  documentHashes?: Partial<Record<DiligenciaDocType, string>>;
  clasificadoEn?: 'ocr' | 'formulario' | 'emision';
}

export interface ExpedienteEntry {
  cdocumento: string;
  xruta: string;
  xhash_sha256?: string;
}

const PJ_DOC_TYPES = new Set(['J', 'G', 'C']);

export function isPersonaJuridica(tipoDoc?: string): boolean {
  return PJ_DOC_TYPES.has(String(tipoDoc ?? '').trim().toUpperCase());
}

export const DEFAULT_DILIGENCIA_CONFIG: ProductDiligenciaConfig = {
  umbralMultiplicador: 300,
  fuenteTc: 'bcv',
  pjSiempreDdc: true,
  planesMasivos: ['2', '3', '4', '5', '6', '7', '8', '9'],
};

export const DEFAULT_DOCS_DDS: DocConfigEntry[] = [
  { key: 'cedula', activo: true, obligatorio: true, label: 'Cédula de Identidad' },
  { key: 'pasaporte', activo: true, obligatorio: false, label: 'Pasaporte' },
];

export const DEFAULT_DOCS_DDC: DocConfigEntry[] = [
  { key: 'cedula', activo: true, obligatorio: true, label: 'Cédula de Identidad' },
  { key: 'licencia', activo: true, obligatorio: true, label: 'Licencia de Conducir' },
  { key: 'certificado', activo: true, obligatorio: true, label: 'Certificado de Circulación' },
  { key: 'rif', activo: true, obligatorio: false, label: 'RIF' },
];

function parseDocList(
  ocrConfig: Record<string, unknown> | null | undefined,
  itipoDiligencia: TipoDiligencia,
): DocConfigEntry[] | null {
  const porDil = ocrConfig?.documentosPorDiligencia as
    | Record<string, DocConfigEntry[]>
    | undefined;
  const list = porDil?.[itipoDiligencia];
  if (Array.isArray(list) && list.length > 0) return list;

  const raw = ocrConfig?.documentos;
  if (Array.isArray(raw)) return raw as DocConfigEntry[];
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, DocConfigEntry>).map(([key, v]) => ({
      key,
      label: v.label ?? key,
      activo: !!v.activo,
      obligatorio: !!v.obligatorio,
    }));
  }
  return null;
}

export function getRequiredDocs(
  ocrConfig: Record<string, unknown> | null | undefined,
  itipoDiligencia: TipoDiligencia,
  productFallback: DiligenciaDocType[],
): DiligenciaDocType[] {
  const list = parseDocList(ocrConfig, itipoDiligencia);
  if (list) {
    return list
      .filter((d) => d.activo && d.obligatorio)
      .map((d) => d.key as DiligenciaDocType);
  }
  return itipoDiligencia === 'C'
    ? (['cedula', 'licencia', 'certificado'] as DiligenciaDocType[])
    : productFallback;
}

export function getOptionalDocs(
  ocrConfig: Record<string, unknown> | null | undefined,
  itipoDiligencia: TipoDiligencia,
  productFallback: DiligenciaDocType[],
): DiligenciaDocType[] {
  const list = parseDocList(ocrConfig, itipoDiligencia);
  if (list) {
    return list
      .filter((d) => d.activo && !d.obligatorio)
      .map((d) => d.key as DiligenciaDocType);
  }
  return productFallback;
}

export function preClasificarDiligencia(tipoDoc?: string): TipoDiligencia {
  return isPersonaJuridica(tipoDoc) ? 'C' : 'S';
}

export function diligenciaLabel(tipo: TipoDiligencia): string {
  return tipo === 'S' ? 'Diligencia simplificada (DDS)' : 'Diligencia completa (DDC)';
}

export function buildDiligenciaState(params: {
  itipoDiligencia: TipoDiligencia;
  ocrConfig?: Record<string, unknown> | null;
  productFallbackRequired?: DiligenciaDocType[];
  productFallbackOptional?: DiligenciaDocType[];
  clasificadoEn?: DiligenciaState['clasificadoEn'];
  documentHashes?: DiligenciaState['documentHashes'];
  primaAnualBs?: number;
  umbralBs?: number;
  tcBcv?: number;
}): DiligenciaState {
  const requiredFallback = params.productFallbackRequired ?? ['cedula', 'certificado'];
  return {
    itipoDiligencia: params.itipoDiligencia,
    documentosRequeridos: getRequiredDocs(
      params.ocrConfig,
      params.itipoDiligencia,
      requiredFallback,
    ),
    camposObligatorios: ['direccion'],
    clasificadoEn: params.clasificadoEn,
    documentHashes: params.documentHashes,
    primaAnualBs: params.primaAnualBs,
    umbralBs: params.umbralBs,
    tcBcv: params.tcBcv,
  };
}

export function clasificarPostQuote(params: {
  tipoDoc?: string;
  planCode?: string;
  mprima?: number;
  ptasa?: number;
  config?: Partial<ProductDiligenciaConfig>;
}): {
  itipoDiligencia: TipoDiligencia;
  primaAnualBs: number;
  umbralBs: number;
  tcBcv: number;
} {
  const cfg = { ...DEFAULT_DILIGENCIA_CONFIG, ...params.config };
  const tcBcv = Number(params.ptasa) > 0 ? Number(params.ptasa) : 1;
  const primaAnualBs = Number(params.mprima) || 0;
  const umbralBs = cfg.umbralMultiplicador * tcBcv;

  if (cfg.pjSiempreDdc && isPersonaJuridica(params.tipoDoc)) {
    return { itipoDiligencia: 'C', primaAnualBs, umbralBs, tcBcv };
  }

  const planDigit = String(params.planCode ?? '').replace(/\D/g, '');
  const esMasivo = cfg.planesMasivos.some((p) => planDigit === p || planDigit.endsWith(p));

  if (esMasivo && primaAnualBs > 0 && primaAnualBs <= umbralBs) {
    return { itipoDiligencia: 'S', primaAnualBs, umbralBs, tcBcv };
  }

  return { itipoDiligencia: 'C', primaAnualBs, umbralBs, tcBcv };
}

export function buildExpedienteFromDocuments(
  documents: Partial<Record<DiligenciaDocType, { file?: { url?: string }; hash?: string }>>,
): ExpedienteEntry[] {
  const map: Record<DiligenciaDocType, string> = {
    cedula: 'CEDULA',
    pasaporte: 'PASAPORTE',
    licencia: 'LICENCIA',
    certificado: 'CERTIFICADO',
    rif: 'RIF',
  };
  const out: ExpedienteEntry[] = [];
  for (const [key, label] of Object.entries(map) as [DiligenciaDocType, string][]) {
    const doc = documents[key];
    if (!doc?.file?.url) continue;
    out.push({
      cdocumento: label,
      xruta: doc.file.url,
      xhash_sha256: doc.hash,
    });
  }
  return out;
}
