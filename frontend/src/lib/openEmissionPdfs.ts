export type EmissionPdfDocs = {
  urlpoliza?: string;
  url_club_arys?: string;
  url_conductor_habitual?: string;
  url_ingreso_caja?: string;
};

const POPUP_DELAY_MS = 400;
const MAX_EMISSION_POPUPS = 4;

let reservedPopups: (Window | null)[] = [];

function collectEmissionUrls(docs: EmissionPdfDocs): string[] {
  return [
    docs.urlpoliza,
    docs.url_club_arys,
    docs.url_conductor_habitual,
    docs.url_ingreso_caja,
  ].filter((url): url is string => Boolean(url && String(url).trim()));
}

function discardReservedPopups(): void {
  reservedPopups.forEach((popup) => {
    if (popup && !popup.closed) popup.close();
  });
  reservedPopups = [];
}

/** Reserva pestañas en el gesto del usuario (clic emitir/verificar), antes del await. */
export function reserveEmissionPopups(slotCount = MAX_EMISSION_POPUPS): void {
  discardReservedPopups();
  reservedPopups = Array.from({ length: slotCount }, () =>
    window.open('about:blank', '_blank', 'noopener,noreferrer'),
  );
}

function scheduleFallbackOpen(url: string, index: number): void {
  setTimeout(() => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, index * POPUP_DELAY_MS);
}

/** Abre documentos post-emisión usando pestañas reservadas o fallback con delay. */
export function openEmissionPdfs(docs: EmissionPdfDocs): string[] {
  const urls = collectEmissionUrls(docs);
  if (urls.length === 0) return [];

  if (reservedPopups.length > 0) {
    urls.forEach((url, index) => {
      const popup = reservedPopups[index];
      if (popup && !popup.closed) {
        popup.location.href = url;
        return;
      }
      scheduleFallbackOpen(url, index);
    });

    for (let i = urls.length; i < reservedPopups.length; i += 1) {
      const extra = reservedPopups[i];
      if (extra && !extra.closed) extra.close();
    }
    reservedPopups = [];
    return urls;
  }

  urls.forEach((url, index) => scheduleFallbackOpen(url, index));
  return urls;
}

export function emissionPdfHint(opened: string[]): string {
  if (opened.length === 0) return '';
  if (opened.length === 1) return ' · PDF abierto en nueva pestaña';
  return ` · ${opened.length} documentos abiertos en nuevas pestañas`;
}
