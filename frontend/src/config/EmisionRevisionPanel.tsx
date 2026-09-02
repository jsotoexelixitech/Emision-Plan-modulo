import { useCallback, useEffect, useState } from 'react';
import {
  Check, X, Loader2, ClipboardList, User, AlertTriangle,
  History, ExternalLink, FileDown, ArrowLeft,
  RefreshCw, Mail, ShieldCheck, Inbox,
} from 'lucide-react';
import { readConfigPanelContext, canalDisplayLabel } from './configPanelContext';
import { resolveNexusApiUrl } from '../nexus/nexus-core';
import { publicAsset } from '../lib/app-base';

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

const PANEL_TOKEN_KEY = 'emision_revision_token';
const REFRESH_MS = 2 * 60 * 1000;

function readPanelToken(): string {
  try {
    const fromUrl = new URL(window.location.href).searchParams.get('token')?.trim();
    if (fromUrl) {
      try {
        sessionStorage.setItem(PANEL_TOKEN_KEY, fromUrl);
      } catch {
        /* ignore */
      }
      return fromUrl;
    }
  } catch {
    /* ignore */
  }
  try {
    return sessionStorage.getItem(PANEL_TOKEN_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

function replacePanelToken(next: string) {
  const token = String(next || '').trim();
  if (!token) return;
  try {
    sessionStorage.setItem(PANEL_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('token', token);
    window.history.replaceState({}, '', url.toString());
  } catch {
    /* ignore */
  }
}

async function postRefresh(path: string, current: string): Promise<string | null> {
  const res = await fetch(`${NEXUS_URL}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: current }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) return null;
  return String(data.token);
}

async function refreshRevisionToken(): Promise<boolean> {
  const current = readPanelToken();
  if (!current) return false;
  try {
    const next =
      (await postRefresh('/api/funeral-submissions/refresh-token', current)) ||
      (await postRefresh('/api/config/refresh-token', current));
    if (!next) return false;
    replacePanelToken(next);
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

function BrandBar({ className = '' }: { className?: string }) {
  return <div className={`revision-brand-bar ${className}`} aria-hidden />;
}

function MundialLogo({ compact = false }: { compact?: boolean }) {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <div className="leading-tight shrink-0">
        <p className={`font-wordmark text-indigo-700 ${compact ? 'text-base' : 'text-xl'}`}>La Mundial</p>
        {!compact && (
          <p className="text-[9px] font-bold tracking-[0.22em] text-slate-400 uppercase">de Seguros</p>
        )}
      </div>
    );
  }
  return (
    <img
      src={publicAsset('logo-lamundial-sidebar.png')}
      alt="La Mundial de Seguros"
      className={
        compact
          ? 'h-8 w-auto object-contain shrink-0'
          : 'h-10 sm:h-11 w-auto max-w-[190px] object-contain shrink-0'
      }
      onError={() => setImgError(true)}
      draggable={false}
    />
  );
}

function DocLinkCard({ doc }: { doc: DocLink }) {
  const isPolicy = doc.kind === 'policy';
  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
        isPolicy
          ? 'border-indigo-200 bg-indigo-50/60 text-indigo-950 hover:border-indigo-300 hover:bg-indigo-50'
          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <span className={`grid place-items-center w-10 h-10 rounded-lg shrink-0 ${
        isPolicy ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
      }`}
      >
        {isPolicy ? <FileDown size={17} /> : <ExternalLink size={15} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-tight">{doc.label}</span>
        <span className="block text-[11px] text-slate-500 truncate mt-0.5">Abrir documento</span>
      </span>
      <span className="text-[11px] font-bold text-indigo-700 shrink-0 group-hover:underline">Ver</span>
    </a>
  );
}

function ScoringCard({ total, breakdown }: { total: number; breakdown: ScoreLine[] }) {
  return (
    <div className="revision-card overflow-hidden min-w-0">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50/90 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-indigo-700 text-white shrink-0">
            <ClipboardList size={13} />
          </span>
          <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-indigo-900">
            Scoring salud
          </h3>
        </div>
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${scoreTone(total)}`}>
          {total} pts
        </span>
      </div>
      <ul className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {breakdown.length === 0 ? (
          <li className="text-sm text-slate-500 py-2 sm:col-span-2">Sin desglose de preguntas.</li>
        ) : (
          breakdown.map((line) => (
            <li
              key={line.questionId}
              className="flex items-start justify-between gap-2 text-xs border-b border-slate-100 pb-1.5"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 leading-snug">{line.label}</p>
                <p className="text-[10px] text-slate-500">Resp: {formatAnswer(line.answer)}</p>
              </div>
              <span className="font-bold text-indigo-700 shrink-0 tabular-nums">+{line.points}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function CompactSummaryCard({
  selected,
  primaLabel,
  beneficiaries,
  polNum,
  recNum,
  emittedWhen,
}: {
  selected: Submission;
  primaLabel: string | null;
  beneficiaries: string[];
  polNum?: string;
  recNum?: string;
  emittedWhen?: string | null;
}) {
  return (
    <div className="revision-card overflow-hidden min-w-0">
      <BrandBar />
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-indigo-700 text-white text-sm font-black shrink-0">
              {initials(selected.tomadorNombre || selected.tomadorRif)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${estadoBadge(selected.estado)}`}>
                  {estadoLabel(selected.estado)}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">#{selected.id.slice(0, 8)}</span>
              </div>
              <h2 className="font-display text-lg sm:text-xl font-black text-indigo-900 leading-tight truncate">
                {selected.tomadorNombre || 'Tomador'}
              </h2>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                {selected.tomadorRif && (
                  <span className="inline-flex items-center gap-1">
                    <User size={11} className="text-indigo-400" />
                    {selected.tomadorRif}
                  </span>
                )}
                {selected.tomadorEmail && (
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <Mail size={11} className="text-indigo-400 shrink-0" />
                    <span className="truncate max-w-[200px] xl:max-w-[320px]">{selected.tomadorEmail}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <div className={`rounded-lg border px-3 py-1.5 text-center min-w-[64px] ${scoreTone(selected.scoreTotal)}`}>
              <p className="text-base font-black tabular-nums leading-none">{selected.scoreTotal}</p>
              <p className="text-[8px] uppercase font-bold mt-0.5 tracking-wider">Score</p>
            </div>
            {primaLabel && (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-center min-w-[64px]">
                <p className="text-base font-black tabular-nums leading-none text-indigo-800">{primaLabel}</p>
                <p className="text-[8px] uppercase font-bold mt-0.5 tracking-wider text-indigo-400">Prima</p>
              </div>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-slate-100 text-xs">
          <div>
            <dt className="text-[9px] font-bold text-slate-400 uppercase">Plan</dt>
            <dd className="font-semibold text-slate-800 mt-0.5 leading-snug">
              {selected.planName || selected.snapshot?.selectedPlan?.name || selected.cplan}
            </dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold text-slate-400 uppercase">Código</dt>
            <dd className="font-semibold text-slate-800 mt-0.5">
              {selected.cplan}
              {selected.cramo != null ? ` · R${selected.cramo}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold text-slate-400 uppercase">Frecuencia</dt>
            <dd className="font-semibold text-slate-800 mt-0.5">
              {selected.snapshot?.funeral?.frecuencia || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold text-slate-400 uppercase">Tomador</dt>
            <dd className="font-medium text-slate-800 mt-0.5 leading-snug">{personLabel(selected.snapshot?.tomador)}</dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold text-slate-400 uppercase">Titular</dt>
            <dd className="font-medium text-slate-800 mt-0.5 leading-snug">{personLabel(selected.snapshot?.asegurado)}</dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold text-slate-400 uppercase">Póliza</dt>
            <dd className="font-medium text-slate-800 mt-0.5">
              {polNum || <span className="text-slate-400 italic">Pendiente</span>}
            </dd>
          </div>
        </dl>

        {beneficiaries.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Beneficiarios</p>
            <ul className="flex flex-wrap gap-1">
              {beneficiaries.map((line) => (
                <li key={line} className="text-[11px] rounded-md bg-slate-50 px-2 py-0.5 text-slate-700">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
          {[
            { label: 'Solicitud', value: formatDate(selected.createdAt) },
            {
              label: 'Revisión',
              value: selected.reviewedAt
                ? formatDate(selected.reviewedAt)
                : 'Pendiente',
            },
            {
              label: 'Emisión',
              value: emittedWhen ? formatDate(emittedWhen) : '—',
            },
          ].map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-100 px-2 py-1 text-[10px] text-slate-600"
            >
              <span className="font-bold text-slate-400 uppercase">{item.label}</span>
              {item.value}
            </span>
          ))}
          {recNum && (
            <span className="inline-flex items-center rounded-lg bg-slate-50 border border-slate-100 px-2 py-1 text-[10px] text-slate-600">
              <span className="font-bold text-slate-400 uppercase mr-1">Recibo</span>
              {recNum}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DecisionPanel({
  acting,
  rejectReason,
  onRejectReason,
  onApprove,
  onReject,
  className = '',
  compact = false,
}: {
  acting: boolean;
  rejectReason: string;
  onRejectReason: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? `min-w-0 w-full ${className}`
          : `revision-decision-card rounded-2xl p-4 sm:p-5 min-w-0 w-full overflow-hidden ${className}`
      }
    >
      {!compact && <BrandBar className="w-full rounded-t-xl mb-4" />}
      <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-800 mb-2">
        Decisión del técnico
      </p>
      <button
        type="button"
        disabled={acting}
        onClick={onApprove}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-700 text-white text-sm font-bold hover:bg-indigo-800 disabled:opacity-50 min-h-[44px] shadow-lg shadow-indigo-700/25 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 mb-2"
      >
        {acting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
        Autorizar pago
      </button>
      <div className="flex flex-col gap-2 w-full min-w-0">
        <input
          type="text"
          placeholder="Motivo de rechazo (opcional)"
          value={rejectReason}
          onChange={(e) => onRejectReason(e.target.value)}
          className="w-full min-w-0 text-sm border border-slate-200 rounded-xl px-3 min-h-[44px] bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none"
        />
        <button
          type="button"
          disabled={acting}
          onClick={onReject}
          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border-2 border-rose-200 bg-white text-rose-700 text-sm font-bold hover:bg-rose-50 disabled:opacity-50 min-h-[44px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"
        >
          <X size={16} /> Rechazar
        </button>
      </div>
    </div>
  );
}

function initials(name?: string | null): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
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

  const applyRows = useCallback(
    (raw: Submission[]) => {
      let rows = raw;
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
    },
    [filter, selected],
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = filter === 'pending' ? '&estado=pending' : '';
      const url = `${NEXUS_URL}/api/funeral-submissions?empresaId=${EMPRESA_ID}${q}&limit=200`;
      let res = await fetch(url, { headers: authHeaders() });
      let data = await res.json().catch(() => ({}));
      if (res.status === 403 && (await refreshRevisionToken())) {
        res = await fetch(url, { headers: authHeaders() });
        data = await res.json().catch(() => ({}));
      }
      if (!res.ok) {
        setError(data.message || `Error HTTP ${res.status}`);
        setList([]);
        return;
      }
      applyRows(data.data ?? []);
    } catch {
      setError('No se pudo conectar con Nexus.');
    } finally {
      setLoading(false);
    }
  }, [filter, applyRows]);

  useEffect(() => {
    void (async () => {
      await refreshRevisionToken();
      await loadList();
    })();
    const id = window.setInterval(() => {
      void refreshRevisionToken();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadList]);

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

  const pendingCount = list.filter((s) => s.estado === 'pending').length;
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

  const primaLabel = quote?.mprimaext != null
    ? `$${Number(quote.mprimaext).toFixed(2)}`
    : quote?.mprima != null
      ? `$${Number(quote.mprima).toFixed(2)}`
      : null;

  return (
    <div className="revision-shell min-h-screen overflow-x-hidden">
      <header className={`sticky top-0 z-30 bg-white shadow-sm ${mobileDetail && selected ? 'hidden lg:block' : ''}`}>
        <BrandBar />
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-4 min-w-0">
              <MundialLogo />
              <div className="hidden sm:block w-px h-11 bg-slate-200 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-[0.18em] text-fuchsia-500 uppercase inline-flex items-center gap-1.5">
                  <ShieldCheck size={11} />
                  Mesa técnica · Funerario
                </p>
                <h1 className="font-display text-xl sm:text-2xl text-indigo-900 leading-tight">
                  Autorización de pólizas
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Empresa #{EMPRESA_ID} · {canalDisplayLabel(PANEL.canal)}
                </p>
              </div>
            </div>
            {filter === 'pending' && !loading && (
              <div className="flex items-center gap-3 rounded-2xl bg-indigo-700 text-white px-5 py-3 shadow-lg shadow-indigo-700/20">
                <div className="text-right">
                  <p className="text-3xl font-black tabular-nums leading-none">{pendingCount}</p>
                  <p className="text-[10px] uppercase tracking-wider text-indigo-200 mt-1 font-bold">
                    Por revisar
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-5 pb-28 lg:pb-8">
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <div className={`flex flex-wrap items-center gap-3 mb-5 ${mobileDetail && selected ? 'hidden lg:flex' : ''}`}>
          <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200 shadow-sm">
            {filterTabs.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                  filter === key
                    ? 'bg-indigo-700 text-white shadow-md'
                    : 'text-slate-600 hover:text-indigo-900 hover:bg-slate-50'
                }`}
              >
                {key === 'history' && <History size={12} />}
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 font-semibold tabular-nums">
            {loading ? '…' : `${list.length} registro${list.length === 1 ? '' : 's'}`}
          </span>
          <button
            type="button"
            onClick={() => void loadList()}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900 min-h-[40px] px-3 rounded-lg border border-indigo-100 bg-white hover:bg-indigo-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            <RefreshCw size={13} />
            Actualizar
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
          <aside className={`lg:col-span-3 xl:col-span-3 revision-card overflow-hidden flex flex-col ${
            mobileDetail && selected ? 'hidden lg:flex' : ''
          }`}
          >
            <div className="px-4 py-3.5 bg-indigo-700 text-white flex items-center gap-2 shrink-0">
              <Inbox size={16} />
              <span className="text-sm font-bold">Bandeja de entrada</span>
              {!loading && (
                <span className="ml-auto text-xs font-bold bg-white/15 rounded-full px-2.5 py-0.5 tabular-nums">
                  {list.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/60 min-h-[200px]">
              {loading ? (
                <div className="py-16 flex justify-center">
                  <Loader2 className="animate-spin text-indigo-600" size={28} />
                </div>
              ) : list.length === 0 ? (
                <p className="py-12 px-4 text-sm text-slate-500 text-center">{emptyMessage}</p>
              ) : (
                list.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => openSubmission(s)}
                    className={`revision-inbox-item w-full text-left rounded-xl p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                      selected?.id === s.id ? 'revision-inbox-item--active' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid place-items-center w-11 h-11 rounded-full bg-indigo-100 text-indigo-800 text-xs font-black shrink-0 ring-2 ring-indigo-50">
                        {initials(s.tomadorNombre || s.tomadorRif)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-bold text-sm text-slate-900 leading-tight truncate">
                            {s.tomadorNombre || s.tomadorRif || 'Sin nombre'}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${estadoBadge(s.estado)}`}>
                            {estadoLabel(s.estado)}
                          </span>
                        </span>
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          {s.planName || `Plan ${s.cplan}`}
                        </p>
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <p className="text-[10px] text-slate-400">{formatDate(s.reviewedAt || s.createdAt)}</p>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${scoreTone(s.scoreTotal)}`}>
                            {s.scoreTotal} pts
                          </span>
                        </div>
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <main className={`lg:col-span-9 xl:col-span-9 min-h-[320px] min-w-0 ${
            !(mobileDetail && selected) ? 'hidden lg:block' : ''
          }`}
          >
            {!selected ? (
              <div className="revision-card p-10 sm:p-14 text-center h-full flex flex-col items-center justify-center min-h-[360px]">
                <span className="revision-empty-icon mx-auto mb-5 grid place-items-center w-20 h-20 rounded-2xl text-indigo-700">
                  <ClipboardList size={36} strokeWidth={1.5} />
                </span>
                <h2 className="font-display text-xl text-indigo-900 mb-2">Selecciona una solicitud</h2>
                <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
                  Revisa identidad, scoring y documentos antes de autorizar el enlace de pago al cliente.
                </p>
                {pendingCount > 0 && (
                  <p className="mt-4 text-xs font-bold text-fuchsia-600 bg-fuchsia-50 border border-fuchsia-100 rounded-full px-3 py-1.5">
                    {pendingCount} pendiente{pendingCount === 1 ? '' : 's'} en bandeja
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setMobileDetail(false)}
                  className="lg:hidden inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 min-h-[40px] px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded-lg"
                >
                  <ArrowLeft size={16} />
                  Volver al listado
                </button>

                {selected.estado === 'paid' && (
                  <p className="text-xs text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                    Póliza pagada y emitida{polNum ? ` · ${polNum}` : ''}.
                  </p>
                )}
                {selected.estado === 'approved' && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                    Aprobada {formatDate(selected.reviewedAt)}.
                    {selected.emailSent
                      ? ' Correo con link de pago enviado.'
                      : selected.emailError
                        ? ` Correo falló: ${selected.emailError}`
                        : ' Link de pago generado.'}
                  </p>
                )}
                {selected.estado === 'rejected' && (
                  <p className="text-xs text-rose-800 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                    Rechazada{selected.reviewedAt ? ` ${formatDate(selected.reviewedAt)}` : ''}.
                    {selected.rejectReason ? ` Motivo: ${selected.rejectReason}` : ''}
                  </p>
                )}
                {selected.estado === 'expired' && (
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    Link expirado{selected.paymentExpiresAt ? ` (${formatDate(selected.paymentExpiresAt)})` : ''}.
                  </p>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start min-w-0">
                  <div className="lg:col-span-8 xl:col-span-9 space-y-4 min-w-0">
                    <CompactSummaryCard
                      selected={selected}
                      primaLabel={primaLabel}
                      beneficiaries={beneficiaries}
                      polNum={polNum}
                      recNum={recNum}
                      emittedWhen={emittedWhen}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ScoringCard
                        total={selected.scoreTotal}
                        breakdown={selected.scoreBreakdown ?? []}
                      />

                      <div className="revision-card overflow-hidden min-w-0">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/90 border-b border-slate-100">
                          <FileDown size={14} className="text-indigo-700" />
                          <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-indigo-900">
                            Documentos y enlaces
                          </h3>
                          <span className="ml-auto text-[10px] font-semibold text-slate-400">
                            {policyDocs.length + uploadDocs.length} archivo
                            {policyDocs.length + uploadDocs.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="p-3">
                          {policyDocs.length === 0 && uploadDocs.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              {selected.estado === 'paid'
                                ? 'Sin PDF de póliza registrado.'
                                : 'Cuadro de póliza y expediente OCR aparecen tras pago/emisión.'}
                            </p>
                          ) : (
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {policyDocs.map((doc) => (
                                <li key={doc.key}>
                                  <DocLinkCard doc={doc} />
                                </li>
                              ))}
                              {uploadDocs.map((doc) => (
                                <li key={doc.key}>
                                  <DocLinkCard doc={doc} />
                                </li>
                              ))}
                            </ul>
                          )}
                          {(selected.paymentUrl || selected.paymentSid || selected.paymentExpiresAt) && (
                            <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 pt-3 mt-3 border-t border-slate-100 text-xs">
                              {selected.paymentUrl && (
                                <div className="sm:col-span-2 xl:col-span-3">
                                  <dt className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Checkout</dt>
                                  <dd>
                                    <a
                                      href={selected.paymentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-indigo-700 font-semibold hover:underline"
                                    >
                                      Abrir link de pago
                                      <ExternalLink size={12} />
                                    </a>
                                  </dd>
                                </div>
                              )}
                              {selected.paymentExpiresAt && (
                                <div>
                                  <dt className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Expira</dt>
                                  <dd className="font-medium text-slate-800">{formatDate(selected.paymentExpiresAt)}</dd>
                                </div>
                              )}
                              {selected.paymentSid && (
                                <div>
                                  <dt className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">SID</dt>
                                  <dd className="font-mono text-[10px] text-slate-700 break-all">{selected.paymentSid}</dd>
                                </div>
                              )}
                            </dl>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <details className="revision-card px-4 py-3 min-w-0">
                        <summary className="text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer flex items-center gap-2">
                          <User size={14} />
                          Datos OCR de cédulas
                          <span className="ml-auto text-[10px] font-semibold text-slate-400 normal-case">
                            {ocrBlocks.length ? `${ocrBlocks.length} doc.` : 'Sin datos'}
                          </span>
                        </summary>
                        <div className="mt-3">
                          {ocrBlocks.length === 0 ? (
                            <p className="text-xs text-slate-500">Sin datos OCR en el snapshot.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {ocrBlocks.map((block) => (
                                <div key={block.key} className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                                  <p className="text-[10px] font-bold text-slate-600 mb-1.5">{block.label}</p>
                                  <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                                    {Object.entries(block.ocr)
                                      .filter(([, v]) => v != null && String(v).trim())
                                      .slice(0, 8)
                                      .map(([k, v]) => (
                                        <div key={k}>
                                          <dt className="text-slate-400 uppercase text-[9px]">{k}</dt>
                                          <dd className="text-xs font-medium text-slate-800">{String(v)}</dd>
                                        </div>
                                      ))}
                                  </dl>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>

                      <details className="revision-card px-4 py-3 min-w-0">
                        <summary
                          className="text-xs font-bold text-slate-500 hover:text-indigo-600 uppercase tracking-wider cursor-pointer"
                          onClick={() => setShowRawSnapshot((v) => !v)}
                        >
                          {showRawSnapshot ? 'Ocultar JSON' : 'Ver snapshot JSON'}
                        </summary>
                        {showRawSnapshot && (
                          <pre className="mt-2 max-h-48 overflow-auto text-[10px] bg-slate-50 rounded-lg p-2 text-slate-700">
                            {JSON.stringify(selected.snapshot, null, 2)}
                          </pre>
                        )}
                      </details>
                    </div>
                  </div>

                  <div className="lg:col-span-4 xl:col-span-3 min-w-0">
                    {selected.estado === 'pending' && (
                      <div className="hidden lg:block lg:sticky lg:top-[7.5rem]">
                        <DecisionPanel
                          acting={acting}
                          rejectReason={rejectReason}
                          onRejectReason={setRejectReason}
                          onApprove={() => void approve(selected.id)}
                          onReject={() => void reject(selected.id)}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {selected.estado === 'pending' && (
                  <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 p-3 shadow-[0_-6px_24px_rgba(9,17,51,0.1)]">
                    <DecisionPanel
                      compact
                      acting={acting}
                      rejectReason={rejectReason}
                      onRejectReason={setRejectReason}
                      onApprove={() => void approve(selected.id)}
                      onReject={() => void reject(selected.id)}
                    />
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
