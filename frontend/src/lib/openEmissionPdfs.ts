export type EmissionPdfDocs = {
  urlpoliza?: string;
  url_club_arys?: string;
  url_conductor_habitual?: string;
  url_ingreso_caja?: string;
};

function collectEmissionUrls(docs: EmissionPdfDocs): string[] {
  return [
    docs.urlpoliza,
    docs.url_club_arys,
    docs.url_conductor_habitual,
    docs.url_ingreso_caja,
  ].filter((url): url is string => Boolean(url && String(url).trim()));
}

export function emissionDocsStorageKey(cnpoliza: string): string {
  return `emission-docs-opened:${cnpoliza}`;
}

export function openEmissionPdfs(docs: EmissionPdfDocs): string[] {
  const urls = collectEmissionUrls(docs);
  for (const url of urls) {
    window.open(url, '_blank');
  }
  return urls;
}

export function openEmissionPdfsAfterConfirm(
  docs: EmissionPdfDocs,
  cnpoliza: string,
): string[] {
  const urls = collectEmissionUrls(docs);
  if (urls.length === 0) return [];

  window.alert(
    `Se ha generado exitosamente su emisión bajo el número ${cnpoliza}.\n\n` +
      `Al aceptar se abrirán ${urls.length} documento(s) en nuevas pestañas.`,
  );
  const opened = openEmissionPdfs(docs);
  sessionStorage.setItem(emissionDocsStorageKey(cnpoliza), '1');
  return opened;
}

export function emissionPdfHint(opened: string[]): string {
  if (opened.length === 0) return '';
  if (opened.length === 1) return ' · PDF abierto en nueva pestaña';
  return ` · ${opened.length} documentos abiertos en nuevas pestañas`;
}
