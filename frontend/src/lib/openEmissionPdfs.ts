/** Abre PDFs post-emisión con delay para evitar bloqueo de popups. */
export function openEmissionPdfs(docs: {
  urlpoliza?: string;
  url_club_arys?: string;
  url_conductor_habitual?: string;
  url_ingreso_caja?: string;
}): string[] {
  const urls = [
    docs.urlpoliza,
    docs.url_club_arys,
    docs.url_conductor_habitual,
    docs.url_ingreso_caja,
  ].filter((url): url is string => Boolean(url && String(url).trim()));

  urls.forEach((url, index) => {
    setTimeout(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    }, index * 400);
  });

  return urls;
}

export function emissionPdfHint(opened: string[]): string {
  if (opened.length === 0) return '';
  if (opened.length === 1) return ' · PDF abierto en nueva pestaña';
  return ` · ${opened.length} documentos abiertos en nuevas pestañas`;
}
