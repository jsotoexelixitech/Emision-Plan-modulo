/** Sis2000 xserialcarroceria / xsercar: NVARCHAR(60). */
export const VEHICLE_SERIAL_MAX_LEN = 60;

export function normalizeVehicleSerial(raw: string): string {
  return String(raw || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, VEHICLE_SERIAL_MAX_LEN);
}

export function validateVehicleSerialMessage(serial?: string | null): string | undefined {
  const s = String(serial ?? '').trim();
  if (!s) return 'El serial del vehículo es obligatorio';
  if (s.length > VEHICLE_SERIAL_MAX_LEN) {
    return `El serial no puede superar ${VEHICLE_SERIAL_MAX_LEN} caracteres`;
  }
  return undefined;
}
