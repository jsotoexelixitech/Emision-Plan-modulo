import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ExternalLink, Download, FileText, ImageIcon, FileWarning,
  ZoomIn, ZoomOut, RotateCcw, ScanLine,
} from 'lucide-react';
import type { DocumentFile } from '../types';

interface Props {
  open: boolean;
  file: DocumentFile | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

function getFileKind(mime: string): 'image' | 'pdf' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

export function DocumentPreviewModal({ open, file, title, subtitle, onClose }: Props) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.2, 3));
      if (e.key === '-') setZoom((z) => Math.max(z - 0.2, 0.5));
      if (e.key === '0') setZoom(1);
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) setZoom(1);
  }, [open, file?.id]);

  if (!open || !file) return null;

  const kind = getFileKind(file.mimeType);
  const sizeKb = (file.size / 1024).toFixed(1);

  const KindIcon = kind === 'image' ? ImageIcon : kind === 'pdf' ? FileText : FileWarning;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Vista previa del documento'}
      className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center p-0 sm:p-4 lg:p-6 animate-fade-in"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-md cursor-default"
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-4xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col bg-white sm:rounded-2xl shadow-[0_32px_80px_-12px_rgba(15,23,42,0.6)] overflow-hidden animate-spring-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center text-white shadow-[0_4px_14px_rgba(15, 26, 90,0.32)] flex-shrink-0">
            <KindIcon size={16} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-slate-900 text-sm truncate leading-tight">
              {title ?? file.name}
            </p>
            <p className="text-[0.66rem] text-slate-500 mt-0.5 truncate font-mono">
              {subtitle ?? `${file.name} · ${sizeKb} KB · ${file.mimeType}`}
            </p>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {kind === 'image' && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))}
                  className="hidden sm:inline-flex w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 items-center justify-center transition-colors"
                  aria-label="Reducir"
                >
                  <ZoomOut size={15} />
                </button>
                <span className="hidden sm:inline-flex text-[0.66rem] font-mono font-bold text-slate-500 w-10 text-center select-none">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}
                  className="hidden sm:inline-flex w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 items-center justify-center transition-colors"
                  aria-label="Acercar"
                >
                  <ZoomIn size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="hidden md:inline-flex w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 items-center justify-center transition-colors"
                  aria-label="Restablecer zoom"
                >
                  <RotateCcw size={14} />
                </button>
                <span className="hidden md:inline-block w-px h-5 bg-slate-200 mx-1" />
              </>
            )}

            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 items-center justify-center transition-colors"
              aria-label="Abrir en nueva pestaña"
            >
              <ExternalLink size={15} />
            </a>
            <a
              href={file.url}
              download={file.name}
              className="hidden sm:inline-flex w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 items-center justify-center transition-colors"
              aria-label="Descargar"
            >
              <Download size={15} />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center justify-center transition-colors"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto bg-[radial-gradient(ellipse_at_top,#F1F5F9,white_60%)]">
          <div className="min-h-full w-full grid place-items-center p-4 sm:p-8">
            {kind === 'image' && (
              <img
                src={file.url}
                alt={file.name}
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                className="max-w-full h-auto rounded-xl shadow-[0_20px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-slate-200 transition-transform duration-200"
              />
            )}

            {kind === 'pdf' && (
              <iframe
                src={file.url}
                title={file.name}
                className="w-full h-[75vh] sm:h-[80vh] rounded-xl shadow-[0_20px_60px_-12px_rgba(15,23,42,0.25)] ring-1 ring-slate-200 bg-white"
              />
            )}

            {kind === 'other' && (
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-4">
                  <FileWarning size={28} className="text-slate-400" />
                </div>
                <p className="font-display font-bold text-slate-900 mb-2">
                  No se puede previsualizar
                </p>
                <p className="text-sm text-slate-500 mb-5 leading-relaxed">
                  El tipo de archivo <span className="font-mono text-slate-700">{file.mimeType}</span> no
                  permite vista previa en el navegador.
                </p>
                <a
                  href={file.url}
                  download={file.name}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white text-xs font-bold shadow-[0_8px_22px_rgba(15, 26, 90,0.32)] transition-all"
                >
                  <Download size={13} />
                  Descargar archivo
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50/70 flex-shrink-0">
          <div className="flex items-center gap-2 text-[0.66rem] text-slate-500 min-w-0">
            <ScanLine size={11} className="text-emerald-500 flex-shrink-0" />
            <span className="font-semibold truncate">Documento procesado por OCR</span>
          </div>
          <div className="flex items-center gap-2 sm:hidden">
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 items-center justify-center"
              aria-label="Abrir"
            >
              <ExternalLink size={14} />
            </a>
            <a
              href={file.url}
              download={file.name}
              className="inline-flex w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-600 items-center justify-center"
              aria-label="Descargar"
            >
              <Download size={14} />
            </a>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="px-2 py-1 rounded-md bg-white border border-slate-200 text-[0.6rem] font-mono font-bold text-slate-500">
              ESC para cerrar
            </span>
            {kind === 'image' && (
              <span className="px-2 py-1 rounded-md bg-white border border-slate-200 text-[0.6rem] font-mono font-bold text-slate-500">
                + / − zoom
              </span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
