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

export function countEmissionDocs(docs: EmissionPdfDocs): number {
  return collectEmissionUrls(docs).length;
}

function clickOpenUrl(url: string): boolean {
  try {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    return Boolean(w);
  }
}

export function openEmissionPdfs(docs: EmissionPdfDocs): string[] {
  const urls = collectEmissionUrls(docs);
  const opened: string[] = [];
  for (const url of urls) {
    if (clickOpenUrl(url)) opened.push(url);
  }
  return opened;
}

export function emissionPdfHint(opened: string[]): string {
  if (opened.length === 0) return '';
  if (opened.length === 1) return ' · PDF abierto en nueva pestaña';
  return ` · ${opened.length} documentos abiertos en nuevas pestañas`;
}
