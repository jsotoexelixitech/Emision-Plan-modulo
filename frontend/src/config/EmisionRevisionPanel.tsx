import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Check, X, Loader2, ClipboardList, User, FileText, AlertTriangle,
  History, Clock, CreditCard, ExternalLink, FileDown, ArrowLeft,
  RefreshCw, Mail, Hash,
} from 'lucide-react';
import { AuroraBackground } from '../components/AuroraBackground';
import { readConfigPanelContext, canalDisplayLabel } from './configPanelContext';
import { resolveNexusApiUrl } from '../nexus/nexus-core';

const NEXUS_URL = resolveNexusApiUrl(import.meta.env.VITE_NEXUS_API_URL);
const PANEL = readConfigPanelContext();
const EMPRESA_ID = PANEL.empresaId;

type ScoreLine = {
  questionId: string;
  label: string;
  answer: unknown;
  points: number;
};

type Submission = {
  id: string;
  estado: string;
  sessionId: string;
  canal: string;
  tomadorRif?: string;
  tomadorNombre?: string;
  tomadorEmail?: string;
  cplan: string;
  planName?: string;
  cramo?: number;
  scoreTotal: number;
  scoreBreakdown: ScoreLine[];
  healthAnswers: Record<string, unknown>;
  snapshot: {
    tomador?: Record<string, unknown>;
    asegurado?: Record<string, unknown>;
    beneficiario?: Record<string, unknown>;
    funeral?: {
      frecuencia?: string;
      beneficiarios?: Record<string, unknown>[];
    };
    documents?: Record<string, {
      ocr?: Record<string, unknown>;
      file?: { url?: string; name?: string };
    }>;
    emission?: {
      cnpoliza?: string;
      cnrecibo?: string;
      urlpoliza?: string;
      url_ingreso_caja?: string;
      url_conductor_habitual?: string;
      url_club_arys?: string;
      emittedAt?: string;
    };
    selectedPlan?: { name?: string; cplan?: string };
    quote?: { mprima?: number; mprimaext?: number; ptasa?: number };
    metadataCanal?: Record<string, unknown>;
  };
  paymentUrl?: string | null;
  paymentSid?: string | null;
  paymentExpiresAt?: string | null;
  cnpoliza?: string | null;
  cnrecibo?: string | null;
  urlpoliza?: string | null;
  emittedAt?: string | null;
  rejectReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  emailSent?: boolean;
  emailError?: string;
};

type ListFilter = 'pending' | 'history' | 'all';

const HISTORY_STATES = new Set(['approved', 'rejected', 'paid', 'expired']);

function estadoLabel(estado: string): string {
  const map: Record<string, string> = {
    pending: 'Pendiente',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    paid: 'Pagada',
    expired: 'Expirada',
  };
  return map[estado] ?? estado;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function beneficiaryLines(sub: Submission): string[] {
  const list = sub.snapshot?.funeral?.beneficiarios;
  if (Array.isArray(list) && list.length > 0) {
    return list.map((b) => {
      const pct = b.pporcen != null && String(b.pporcen).trim() !== ''
        ? ` · ${b.pporcen}%`
        : '';
      return `${personLabel(b)}${pct}`;
    });
  }
  const one = personLabel(sub.snapshot?.beneficiario);
  return one === '—' ? [] : [one];
}

function personLabel(p?: Record<string, unknown>): string {
  if (!p) return '—';
  const name = [p.nombre, p.apellido].filter(Boolean).join(' ').trim();
  const doc = [p.tipoDoc, p.identificacion].filter(Boolean).join('-').trim();
  return name || doc || '—';
}

type DocLink = { key: string; label: string; url: string; kind: 'policy' | 'annex' | 'upload' };

const OCR_DOC_LABELS: Record<string, string> = {
  cedula: 'Cédula del tomador',
  cedula_titular: 'Cédula del titular',
  cedula_beneficiario: 'Cédula del beneficiario',
  rif: 'RIF',
  licencia: 'Licencia',
  certificado: 'Certificado médico',
  pasaporte: 'Pasaporte',
};

function resolveDocUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    try {
      return `${window.location.origin}${trimmed}`;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function strUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t || undefined;
}

function isPolicyPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('/pagos/') || lower.includes('wizardstep=5')) return false;
  return true;
}

function collectPolicyDocLinks(sub: Submission): DocLink[] {
  const items: DocLink[] = [];
  const emission = sub.snapshot?.emission;

  const push = (key: string, label: string, url: unknown, kind: DocLink['kind']) => {
    const resolved = strUrl(url);
    if (!resolved || !isPolicyPdfUrl(resolved)) return;
    items.push({ key, label, url: resolveDocUrl(resolved), kind });
  };

  push('poliza', 'Cuadro de póliza (PDF)', sub.urlpoliza ?? emission?.urlpoliza, 'policy');
  push('ingreso', 'Ingreso de caja', emission?.url_ingreso_caja, 'annex');
  push('conductor', 'Anexo conductor habitual', emission?.url_conductor_habitual, 'annex');
  push('arys', 'Club Arys', emission?.url_club_arys, 'annex');

  return items;
}

function collectUploadDocLinks(sub: Submission): DocLink[] {
  const items: DocLink[] = [];
  const docs = sub.snapshot?.documents;
  if (!docs || typeof docs !== 'object') return items;

  for (const [docKey, docVal] of Object.entries(docs)) {
    const fileUrl = docVal?.file?.url;
    if (fileUrl) {
      items.push({
        key: `upload-${docKey}`,
        label: OCR_DOC_LABELS[docKey] ?? `Documento ${docKey}`,
        url: resolveDocUrl(fileUrl),
        kind: 'upload',
      });
    }
  }
  return items;
}

function policyNumber(sub: Submission): string | undefined {
  return strUrl(sub.cnpoliza) ?? strUrl(sub.snapshot?.emission?.cnpoliza);
}

function receiptNumber(sub: Submission): string | undefined {
  return strUrl(sub.cnrecibo) ?? strUrl(sub.snapshot?.emission?.cnrecibo);
}

function readPanelToken(): string {
  try {
    return new URL(window.location.href).searchParams.get('token')?.trim() || '';
  } catch {
    return '';
  }
}

function replacePanelToken(next: string) {
  const token = String(next || '').trim();
  if (!token) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('token', token);
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* ignore */
  }
}

const REFRESH_MS = 10 * 60 * 1000;

async function refreshRevisionToken(): Promise<boolean> {
  const current = readPanelToken();
  if (!current) return false;
  try {
    const res = await fetch(`${NEXUS_URL}/api/funeral-submissions/refresh-token`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: current }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) return false;
    replacePanelToken(String(data.token));
    return true;
  } catch {
    return false;
  }
}

function authHeaders(): Record<string, string> {
  const token = readPanelToken();
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    h.Authorization = `Bearer ${token}`;
    h['x-revision-token'] = token;
  }
  const key = import.meta.env.VITE_NEXUS_API_KEY ?? '';
  if (key) h['x-api-key'] = key;
  return h;
}

function formatAnswer(v: unknown): string {
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  if (v == null || v === '') return '—';
  return String(v);
}

function estadoBadge(estado: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    rejected: 'bg-rose-100 text-rose-800 border-rose-200',
    paid: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    expired: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return map[estado] ?? 'bg-slate-100 text-slate-700 border-slate-200';
}

function scoreTone(score: number): string {
  if (score >= 100) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (score >= 50) return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function collectOcrBlocks(sub: Submission): { key: string; label: string; ocr: Record<string, unknown> }[] {
  const docs = sub.snapshot?.documents;
  if (!docs) return [];
  return ['cedula', 'cedula_titular', 'cedula_beneficiario']
    .map((key) => {
      const ocr = docs[key]?.ocr;
      if (!ocr || typeof ocr !== 'object') return null;
      const entries = Object.entries(ocr).filter(([, v]) => v != null && String(v).trim());
      if (!entries.length) return null;
      return { key, label: OCR_DOC_LABELS[key] ?? key, ocr };
    })
    .filter((x): x is { key: string; label: string; ocr: Record<string, unknown> } => x != null);
}

function DocLinkCard({ doc }: { doc: DocLink }) {
  const isPolicy = doc.kind === 'policy';
  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all active:scale-[0.99] ${
        isPolicy
          ? 'border-indigo-200 bg-gradient-to-r from-indigo-50 to-white text-indigo-950 shadow-sm hover:border-indigo-300 hover:shadow'
          : 'border-slate-200/80 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <span className={`grid place-items-center w-11 h-11 rounded-xl shrink-0 ${
        isPolicy ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
      }`}
      >
        {isPolicy ? <FileDown size={18} /> : <ExternalLink size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-tight">{doc.label}</span>
        <span className="block text-[11px] text-slate-500 truncate mt-0.5">
          Abrir en una pestaña nueva
        </span>
      </span>
      <span className="text-[11px] font-bold text-indigo-600 shrink-0">
        Ver
      </span>
    </a>
  );
}

function SectionCard({
  title,
  icon,
  children,
  accent,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${
      accent
        ? 'border-indigo-100 bg-indigo-50/50'
        : 'border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
    }`}
    >
      <h3 className={`text-[11px] font-black uppercase tracking-[0.14em] mb-3.5 flex items-center gap-2 ${
        accent ? 'text-indigo-600' : 'text-slate-500'
      }`}
      >
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-[11px] font-semibold text-slate-400 mb-0.5">{label}</dt>
      <dd className="text-sm font-medium text-slate-800 break-words">{children}</dd>
    </div>
  );
}

export function EmisionRevisionPanel() {
  const [list, setList] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [filter, setFilter] = useState<ListFilter>('pending');
  const [showRawSnapshot, setShowRawSnapshot] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = filter === 'pending' ? '&estado=pending' : '';
      const res = await fetch(
        `${NEXUS_URL}/api/funeral-submissions?empresaId=${EMPRESA_ID}${q}&limit=200`,
        { headers: authHeaders() },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || `Error HTTP ${res.status}`);
        setList([]);
        return;
      }
      let rows: Submission[] = data.data ?? [];
      if (filter === 'history') {
        rows = rows.filter((s) => HISTORY_STATES.has(s.estado));
        rows.sort((a, b) => {
          const dateA = Date.parse(a.reviewedAt || a.updatedAt || a.createdAt);
          const dateB = Date.parse(b.reviewedAt || b.updatedAt || b.createdAt);
          return dateB - dateA;
        });
      }
      setList(rows);
      if (selected && !rows.find((s) => s.id === selected.id)) {
        setSelected(null);
        setMobileDetail(false);
      }
    } catch {
      setError('No se pudo conectar con Nexus.');
    } finally {
      setLoading(false);
    }
  }, [filter, selected]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    void refreshRevisionToken();
    const id = window.setInterval(() => {
      void refreshRevisionToken();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  async function loadDetail(id: string) {
    const res = await fetch(
      `${NEXUS_URL}/api/funeral-submissions/${id}?empresaId=${EMPRESA_ID}`,
      { headers: authHeaders() },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.data) setSelected(data.data);
  }

  async function approve(id: string) {
    setActing(true);
    try {
      const res = await fetch(`${NEXUS_URL}/api/funeral-submissions/${id}/approve`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedBy: 'tecnico-panel' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'No se pudo aprobar');
        return;
      }
      await loadList();
      setSelected(data.data);
    } finally {
      setActing(false);
    }
  }

  async function reject(id: string) {
    setActing(true);
    try {
      const res = await fetch(`${NEXUS_URL}/api/funeral-submissions/${id}/reject`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedBy: 'tecnico-panel', reason: rejectReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'No se pudo rechazar');
        return;
      }
      setRejectReason('');
      await loadList();
      setSelected(data.data);
    } finally {
      setActing(false);
    }
  }

  const quote = selected?.snapshot?.quote;
  const emission = selected?.snapshot?.emission;
  const policyDocs = selected ? collectPolicyDocLinks(selected) : [];
  const uploadDocs = selected ? collectUploadDocLinks(selected) : [];
  const ocrBlocks = selected ? collectOcrBlocks(selected) : [];
  const beneficiaries = selected ? beneficiaryLines(selected) : [];
  const polNum = selected ? policyNumber(selected) : undefined;
  const recNum = selected ? receiptNumber(selected) : undefined;
  const emittedWhen = selected?.emittedAt ?? emission?.emittedAt;
  const emptyMessage =
    filter === 'pending'
      ? 'No hay solicitudes pendientes de revisión.'
      : filter === 'history'
        ? 'No hay registros en el histórico (aprobadas, rechazadas o pagadas).'
        : 'No hay solicitudes registradas para esta empresa.';

  const filterTabs: { key: ListFilter; label: string }[] = [
    { key: 'pending', label: 'Pendientes' },
    { key: 'history', label: 'Histórico' },
    { key: 'all', label: 'Todas' },
  ];

  const openSubmission = (s: Submission) => {
    setSelected(s);
    setShowRawSnapshot(false);
    setMobileDetail(true);
    void loadDetail(s.id);
  };

  return (
    <div className="min-h-screen relative">
      <AuroraBackground />
      <div className="pt-6 sm:pt-8 px-3 sm:px-6 lg:px-10 pb-28 lg:pb-12 max-w-6xl mx-auto relative z-10">
        <header className={`mb-5 sm:mb-8 ${mobileDetail && selected ? 'hidden lg:block' : ''}`}>
          <p className="text-[0.68rem] font-black tracking-[0.22em] text-violet-500 uppercase mb-2">
            Revisión técnica · funerario
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Autorización de pólizas
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Empresa #{EMPRESA_ID} · canal {canalDisplayLabel(PANEL.canal)}
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <div className={`flex flex-wrap items-center gap-2 mb-4 ${mobileDetail && selected ? 'hidden lg:flex' : ''}`}>
          <div className="flex p-1 rounded-xl bg-white/80 border border-slate-200/80 shadow-sm">
            {filterTabs.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                  filter === key ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {key === 'history' && <History size={12} />}
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400">
            {loading ? '…' : `${list.length} registro${list.length === 1 ? '' : 's'}`}
          </span>
          <button
            type="button"
            onClick={() => void loadList()}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            <RefreshCw size={12} />
            Actualizar
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
          <div className={`lg:col-span-2 bg-white/90 backdrop-blur rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm ${
            mobileDetail && selected ? 'hidden lg:block' : ''
          }`}
          >
            {loading ? (
              <div className="p-10 flex justify-center">
                <Loader2 className="animate-spin text-indigo-500" />
              </div>
            ) : list.length === 0 ? (
              <p className="p-8 text-sm text-slate-500 text-center">{emptyMessage}</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[min(70vh,720px)] overflow-y-auto">
                {list.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => openSubmission(s)}
                      className={`w-full text-left px-4 py-3.5 hover:bg-indigo-50/60 transition-colors ${
                        selected?.id === s.id ? 'bg-indigo-50/90 border-l-4 border-indigo-500' : 'border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {s.tomadorNombre || s.tomadorRif || 'Sin nombre'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${estadoBadge(s.estado)}`}>
                          {estadoLabel(s.estado)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate">
                        {s.planName || `Plan ${s.cplan}`}
                        {policyNumber(s) ? ` · ${policyNumber(s)}` : ''}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-[10px] text-slate-400">
                          {formatDate(s.reviewedAt || s.createdAt)}
                        </p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${scoreTone(s.scoreTotal)}`}>
                          {s.scoreTotal} pts
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`lg:col-span-3 min-h-[280px] ${
            !(mobileDetail && selected) ? 'hidden lg:block' : ''
          }`}
          >
            {!selected ? (
              <div className="bg-white/80 rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                <ClipboardList className="mx-auto mb-3 text-slate-300" size={32} />
                <p className="text-sm text-slate-500">
                  Selecciona una solicitud para ver el detalle.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setMobileDetail(false)}
                  className="lg:hidden inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600"
                >
                  <ArrowLeft size={16} />
                  Volver al listado
                </button>

                <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${estadoBadge(selected.estado)}`}>
                          {estadoLabel(selected.estado)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono inline-flex items-center gap-1">
                          <Hash size={10} />
                          {selected.id.slice(0, 8)}
                        </span>
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-black text-slate-900 leading-tight">
                        {selected.tomadorNombre || 'Tomador'}
                      </h2>
                      <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-1.5 sm:gap-3 text-sm text-slate-500">
                        {selected.tomadorRif && (
                          <span className="inline-flex items-center gap-1.5">
                            <User size={13} className="text-slate-400" />
                            {selected.tomadorRif}
                          </span>
                        )}
                        {selected.tomadorEmail && (
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <Mail size={13} className="text-slate-400 shrink-0" />
                            <span className="truncate">{selected.tomadorEmail}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`rounded-2xl border px-4 py-3 text-center min-w-[88px] ${scoreTone(selected.scoreTotal)}`}>
                      <p className="text-2xl font-black tabular-nums leading-none">{selected.scoreTotal}</p>
                      <p className="text-[10px] uppercase font-bold mt-1 tracking-wider">Puntaje</p>
                    </div>
                  </div>
                </div>

                {selected.estado === 'paid' && (
                  <p className="text-sm text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
                    Póliza pagada y emitida. Quedó registrada en el histórico
                    {polNum ? ` · ${polNum}` : ''}.
                  </p>
                )}
                {selected.estado === 'approved' && (
                  <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                    Aprobada el {formatDate(selected.reviewedAt)}.
                    {selected.emailSent
                      ? ' Se envió el correo con el link de pago al cliente.'
                      : selected.emailError
                        ? ` Link generado pero el correo falló: ${selected.emailError}`
                        : ' Link de pago generado.'}
                  </p>
                )}
                {selected.estado === 'rejected' && (
                  <p className="text-sm text-rose-800 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
                    Solicitud rechazada
                    {selected.reviewedAt ? ` el ${formatDate(selected.reviewedAt)}` : ''}.
                    {selected.rejectReason ? ` Motivo: ${selected.rejectReason}` : ''}
                  </p>
                )}
                {selected.estado === 'expired' && (
                  <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                    Link de pago expirado
                    {selected.paymentExpiresAt ? ` (${formatDate(selected.paymentExpiresAt)})` : ''}.
                  </p>
                )}

                <SectionCard title="Documentos de póliza emitida" icon={<FileDown size={14} />}>
                  {policyDocs.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {selected.estado === 'paid'
                        ? 'Sin PDF de póliza registrado. La URL se guarda al completar la emisión.'
                        : selected.estado === 'approved'
                          ? 'Aún no hay póliza: el cliente debe pagar. Tras la emisión aparecerán el cuadro de póliza y el número oficial.'
                          : 'El cuadro de póliza y anexos se guardan aquí al completar pago + emisión.'}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {policyDocs.map((doc) => (
                        <li key={doc.key}>
                          <DocLinkCard doc={doc} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {emittedWhen && (
                    <p className="text-[11px] text-slate-400 mt-3">
                      Emitida {formatDate(emittedWhen)}
                      {polNum ? ` · ${polNum}` : ''}
                    </p>
                  )}
                </SectionCard>

                <SectionCard title="Datos de la póliza" icon={<FileText size={14} />}>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Field label="Plan" wide>
                      {selected.planName || selected.snapshot?.selectedPlan?.name || selected.cplan}
                    </Field>
                    <Field label="Código / ramo">
                      {selected.cplan}
                      {selected.cramo != null ? ` · ramo ${selected.cramo}` : ''}
                    </Field>
                    <Field label="Nº póliza">
                      {polNum || (
                        <span className="text-slate-400 italic font-normal">
                          {selected.estado === 'paid' ? 'No registrado' : 'Se genera al pagar y emitir'}
                        </span>
                      )}
                    </Field>
                    {recNum && <Field label="Recibo">{recNum}</Field>}
                    <Field label="Frecuencia">
                      {selected.snapshot?.funeral?.frecuencia || '—'}
                    </Field>
                    <Field label="Prima">
                      {quote?.mprimaext != null
                        ? `$${Number(quote.mprimaext).toFixed(2)}`
                        : quote?.mprima != null
                          ? `$${Number(quote.mprima).toFixed(2)}`
                          : '—'}
                      {quote?.ptasa != null ? ` · tasa ${quote.ptasa}` : ''}
                    </Field>
                    <Field label="Tomador">{personLabel(selected.snapshot?.tomador)}</Field>
                    <Field label="Asegurado / titular">{personLabel(selected.snapshot?.asegurado)}</Field>
                    <Field label="Beneficiarios" wide>
                      {beneficiaries.length === 0 ? (
                        '—'
                      ) : (
                        <ul className="space-y-1">
                          {beneficiaries.map((line) => (
                            <li key={line} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm">
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Field>
                  </dl>
                </SectionCard>

                <SectionCard title="Historial de la solicitud" icon={<Clock size={14} />}>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Field label="Creada">{formatDate(selected.createdAt)}</Field>
                    <Field label="Revisada">{formatDate(selected.reviewedAt)}</Field>
                    <Field label="Revisor">{selected.reviewedBy || '—'}</Field>
                    <Field label="Sesión">
                      <span className="font-mono text-[11px]">{selected.sessionId || '—'}</span>
                    </Field>
                    {selected.rejectReason && (
                      <Field label="Motivo rechazo" wide>
                        <span className="text-rose-700">{selected.rejectReason}</span>
                      </Field>
                    )}
                  </dl>
                </SectionCard>

                {uploadDocs.length > 0 && (
                  <SectionCard title="Expediente OCR" icon={<FileText size={14} />}>
                    <ul className="space-y-2">
                      {uploadDocs.map((doc) => (
                        <li key={doc.key}>
                          <DocLinkCard doc={doc} />
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                )}

                {(selected.paymentUrl || selected.paymentSid || selected.paymentExpiresAt) && (
                  <SectionCard title="Checkout de pago (no es la póliza)" icon={<CreditCard size={14} />} accent>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selected.paymentSid && (
                        <Field label="SID checkout">
                          <span className="font-mono text-[11px] break-all">{selected.paymentSid}</span>
                        </Field>
                      )}
                      {selected.paymentExpiresAt && (
                        <Field label="Link expira">{formatDate(selected.paymentExpiresAt)}</Field>
                      )}
                      {selected.paymentUrl && (
                        <Field label="URL de pago" wide>
                          <a
                            href={selected.paymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-indigo-700 font-semibold hover:underline"
                          >
                            Abrir checkout
                            <ExternalLink size={13} />
                          </a>
                        </Field>
                      )}
                    </dl>
                  </SectionCard>
                )}

                <SectionCard title="Datos OCR de cédulas" icon={<User size={14} />}>
                  {ocrBlocks.length === 0 ? (
                    <p className="text-sm text-slate-500">Sin datos OCR de cédula en el snapshot.</p>
                  ) : (
                    <div className="space-y-4">
                      {ocrBlocks.map((block) => (
                        <div key={block.key}>
                          <p className="text-xs font-bold text-slate-600 mb-2">{block.label}</p>
                          <dl className="grid grid-cols-2 gap-2">
                            {Object.entries(block.ocr)
                              .filter(([, v]) => v != null && String(v).trim())
                              .slice(0, 12)
                              .map(([k, v]) => (
                                <div key={k}>
                                  <dt className="text-slate-400 uppercase text-[10px]">{k}</dt>
                                  <dd className="text-sm font-medium text-slate-800">{String(v)}</dd>
                                </div>
                              ))}
                          </dl>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Scoring y preguntas" icon={<ClipboardList size={14} />}>
                  <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(selected.scoreBreakdown ?? []).map((line) => (
                      <li
                        key={line.questionId}
                        className="flex items-start justify-between gap-2 text-sm border-b border-slate-100 last:border-0 pb-2"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{line.label}</p>
                          <p className="text-xs text-slate-500">Resp: {formatAnswer(line.answer)}</p>
                        </div>
                        <span className="font-bold text-indigo-600 shrink-0">+{line.points}</span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>

                <details className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                  <summary
                    className="text-xs font-bold text-slate-500 hover:text-indigo-600 uppercase tracking-wider cursor-pointer"
                    onClick={() => setShowRawSnapshot((v) => !v)}
                  >
                    {showRawSnapshot ? 'Ocultar snapshot JSON' : 'Ver snapshot JSON completo'}
                  </summary>
                  {showRawSnapshot && (
                    <pre className="mt-3 max-h-48 overflow-auto text-[10px] bg-slate-50 rounded-xl p-3 text-slate-700">
                      {JSON.stringify(selected.snapshot, null, 2)}
                    </pre>
                  )}
                </details>

                {selected.estado === 'pending' && (
                  <div className="hidden lg:flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      disabled={acting}
                      onClick={() => void approve(selected.id)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {acting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Aprobar
                    </button>
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        placeholder="Motivo rechazo (opcional)"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="flex-1 text-sm border border-slate-200 rounded-xl px-3"
                      />
                      <button
                        type="button"
                        disabled={acting}
                        onClick={() => void reject(selected.id)}
                        className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50"
                      >
                        <X size={16} /> Rechazar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {selected?.estado === 'pending' && mobileDetail && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          <input
            type="text"
            placeholder="Motivo rechazo (opcional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 mb-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={acting}
              onClick={() => void approve(selected.id)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
            >
              {acting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Aprobar
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => void reject(selected.id)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-50"
            >
              <X size={16} /> Rechazar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
