import type { DocType, DocumentState } from '../types';

type CertOcr = {
  tipoCarnet?: string;
  tipo_carnet?: string;
  tipoPlaca?: string;
  placa?: string;
  linea?: string;
  cilindrada?: string;
  serialMotor?: string;
  vin?: string;
  numeroMotor?: string;
};

function sanitizeOcrString(value?: string | null): string {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  const u = s.toUpperCase();
  if (u === 'NULL' || u === 'N/A' || u === 'NA' || u === 'NONE') return '';
  return s;
}

function looksLikeVePlacaNacional(placa?: string | null): boolean {
  const p = String(placa ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (!p) return false;
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) || /^[A-Z]{2}\d{5}$/.test(p);
}

function looksLikeCoPlaca(placa?: string | null): boolean {
  const p = String(placa ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (!p) return false;
  return /^[A-Z]{3}\d{2,3}[A-Z]?$/.test(p);
}

export function isBinacionalCarnet(cert?: CertOcr | null): boolean {
  if (!cert || typeof cert !== 'object') return false;

  const tipoRaw = String(cert.tipoCarnet || cert.tipo_carnet || '').toLowerCase().trim();
  const placaTipo = String(cert.tipoPlaca || '').toLowerCase().trim();

  const hasLinea = Boolean(sanitizeOcrString(cert.linea));
  const hasCilindrada = Boolean(sanitizeOcrString(cert.cilindrada));
  const hasVin = Boolean(sanitizeOcrString(cert.vin));
  const hasSerialMotor = Boolean(
    sanitizeOcrString(cert.serialMotor) || sanitizeOcrString(cert.numeroMotor),
  );

  const placaNorm = String(cert.placa ?? '').replace(/[\s-]/g, '').toUpperCase();
  const looksVeNacional =
    looksLikeVePlacaNacional(placaNorm)
    && !hasLinea
    && !hasCilindrada;

  const isExplicitColombia =
    tipoRaw === 'binacional'
    || tipoRaw === 'colombia'
    || tipoRaw === 'colombiano'
    || placaTipo === 'binacional';

  if (isExplicitColombia) return true;

  let isBinacional = hasLinea && (hasCilindrada || hasVin || hasSerialMotor);
  if (isBinacional && looksVeNacional) isBinacional = false;
  if (!isBinacional && looksLikeCoPlaca(placaNorm)) {
    isBinacional = true;
  }

  return isBinacional;
}

/**
 * Con carnet binacional (Colombia): solo certificado es obligatorio;
 * cédula y licencia pasan a opcionales.
 */
export function adjustDocsForBinacionalCarnet(
  requiredDocs: DocType[],
  optionalDocs: DocType[],
  documents: Record<DocType, DocumentState>,
  hasVehicle: boolean,
  carnetBinacionalMode = false,
): { requiredDocs: DocType[]; optionalDocs: DocType[] } {
  if (!hasVehicle) {
    return { requiredDocs: [...requiredDocs], optionalDocs: [...optionalDocs] };
  }

  const certState = documents.certificado;
  const cert = certState?.ocr as CertOcr | undefined;
  const certDone = certState?.status === 'done';

  if (!certDone || (!carnetBinacionalMode && !isBinacionalCarnet(cert))) {
    return { requiredDocs: [...requiredDocs], optionalDocs: [...optionalDocs] };
  }

  const required = requiredDocs.filter((d) => d !== 'cedula' && d !== 'licencia');
  if (!required.includes('certificado')) required.push('certificado');

  const optionalSet = new Set(optionalDocs);
  if (requiredDocs.includes('cedula')) optionalSet.add('cedula');
  if (requiredDocs.includes('licencia')) optionalSet.add('licencia');

  return {
    requiredDocs: required,
    optionalDocs: [...optionalSet],
  };
}
