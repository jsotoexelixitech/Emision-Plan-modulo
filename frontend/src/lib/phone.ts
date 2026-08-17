/**
 * Prefijos telefónicos válidos en Venezuela (móviles, fijos por estado, servicios).
 * Plan nacional CONATEL — no confundir con prefijos de placa vehicular.
 */
export const VE_PHONE_PREFIXES = [
  '0412', '0422', '0414', '0424', '0416', '0426', '0415', '0417', '0418',
  '0212', '0234', '0235', '0237', '0238', '0239',
  '0240', '0241', '0242', '0243', '0244', '0245', '0246', '0247', '0248', '0249',
  '0251', '0252', '0253', '0254', '0255', '0256', '0257', '0258', '0259',
  '0260', '0261', '0262', '0263', '0264', '0265', '0266', '0267', '0268', '0269',
  '0270', '0271', '0272', '0273', '0274', '0275', '0276', '0277', '0278', '0279',
  '0281', '0282', '0283', '0284', '0285', '0286', '0287', '0288', '0289',
  '0291', '0292', '0293', '0294', '0295',
  '0500', '0501', '0800', '0900',
] as const;

const PREFIX_SET = new Set<string>(VE_PHONE_PREFIXES);

function normalizeDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length > 0 && /^[24589]/.test(d[0])) d = `0${d}`;
  if (d.length >= 1 && d[0] !== '0') return '';
  if (d.length >= 2 && !/^[24589]/.test(d[1])) d = d.slice(0, 1);
  if (d.length >= 3 && d[1] === '4' && !/^[12]/.test(d[2])) d = d.slice(0, 2);
  if (d.length >= 4 && !PREFIX_SET.has(d.slice(0, 4))) d = d.slice(0, 3);
  return d.slice(0, 11);
}

export function formatTelefono(raw: string): string {
  const d = normalizeDigits(raw);
  if (d.length === 0) return '';
  if (d.length <= 4) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 4)}) ${d.slice(4)}`;
  return `(${d.slice(0, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
}

export function isValidPhonePrefix(phone: string): boolean {
  if (!phone) return false;
  const d = phone.replace(/\D/g, '');
  if (d.length !== 11) return false;
  return PREFIX_SET.has(d.slice(0, 4));
}
