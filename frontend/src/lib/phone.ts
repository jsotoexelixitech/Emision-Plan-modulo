/** Prefijos válidos en Venezuela (móviles + algunos fijos comunes). */
const VE_PHONE_PREFIXES = [
  '0412', '0414', '0416', '0424', '0426',
  '0212', '0241', '0243', '0244', '0245', '0246', '0247',
  '0251', '0252', '0253', '0254', '0255', '0257', '0258', '0259',
  '0261', '0262', '0263', '0264', '0265', '0266', '0267', '0268', '0269',
  '0271', '0272', '0273', '0274', '0275', '0276', '0277', '0278',
  '0281', '0282', '0283', '0284', '0285', '0286', '0287', '0288', '0289',
  '0291', '0292', '0293', '0294', '0295',
] as const;

/** Máscara visual: (0412) 123-4567 */
export function formatTelefono(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 4) return `(${digits}`;
  const a = digits.slice(0, 4);
  const b = digits.slice(4, 7);
  const c = digits.slice(7, 11);
  if (digits.length <= 7) return `(${a}) ${b}`;
  return `(${a}) ${b}-${c}`;
}

export function isValidPhonePrefix(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return false;
  return VE_PHONE_PREFIXES.some((prefix) => digits.startsWith(prefix));
}
