/**
 * Identidad visual Exélixi (manual de marca) para el flujo catálogo genérico.
 * Activa la clase `exelixi-brand` en <html> (ver styles/exelixi-brand.css),
 * cambia favicon, título y theme-color. Los flujos La Mundial no se tocan.
 */
import '../styles/exelixi-brand.css';
import { isExelixiCatalogFlow } from './exelixi-catalog';

const EXELIXI_OXFORD = '#0C133A';

function swapFavicon(): void {
  const base = (import.meta.env.BASE_URL as string | undefined) ?? '/';
  document
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
    )
    .forEach((link) => link.remove());
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = `${base.endsWith('/') ? base : `${base}/`}exelixi-favicon.svg`;
  document.head.appendChild(link);
}

export function applyExelixiBranding(moduleTitle: string): void {
  if (!isExelixiCatalogFlow()) return;
  try {
    document.documentElement.classList.add('exelixi-brand');
    document.title = `Exélixi Technology · ${moduleTitle}`;
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = EXELIXI_OXFORD;
    swapFavicon();
  } catch {
    /* ignore */
  }
}
