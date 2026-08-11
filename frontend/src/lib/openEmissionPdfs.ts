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

function hasLiveReservedPopups(): boolean {
  return reservedPopups.some((popup) => popup && !popup.closed);
}

/** Reserva pestañas en el gesto del usuario, antes del await. Sin noopener (devuelve null). */
export function reserveEmissionPopups(slotCount = MAX_EMISSION_POPUPS): void {
  if (hasLiveReservedPopups()) return;

  discardReservedPopups();
  reservedPopups = Array.from({ length: slotCount }, () =>
    window.open('about:blank', '_blank'),
  );
}

function openUrlDirect(url: string): void {
  window.open(url, '_blank');
}

function scheduleFallbackOpen(url: string, index: number): void {
  if (index === 0) {
    openUrlDirect(url);
    return;
  }
  setTimeout(() => openUrlDirect(url), index * POPUP_DELAY_MS);
}

export function openEmissionPdfs(docs: EmissionPdfDocs): string[] {
  const urls = collectEmissionUrls(docs);
  if (urls.length === 0) return [];

  if (hasLiveReservedPopups()) {
    urls.forEach((url, index) => {
      const popup = reservedPopups[index];
      if (popup && !popup.closed) {
        popup.location.href = url;
        popup.opener = null;
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
