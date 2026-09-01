import { useCallback, useEffect, useState } from 'react';
import {
  Check, X, Loader2, ClipboardList, User, FileText, AlertTriangle,
  History, Clock, CreditCard, ExternalLink, FileDown,
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
    funeral?: { frecuencia?: string };
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

function personLabel(p?: Record<string, unknown>): string {
  if (!p) return '—';
  const name = [p.nombre, p.apellido].filter(Boolean).join(' ').trim();
  const doc = [p.tipoDoc, p.identificacion].filter(Boolean).join('-').trim();
  return name || doc || '—';
}

type DocLink = { key: string; label: string; url: string; kind: 'policy' | 'annex' | 'upload' };

const OCR_DOC_LABELS: Record<string, string> = {
  cedula: 'Cédula escaneada',
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

export function EmisionRevisionPanel() {
  const [list, setList] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [filter, setFilter] = useState<ListFilter>('pending');
  const [showRawSnapshot, setShowRawSnapshot] = useState(false);

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

  const cedulaOcr = selected?.snapshot?.documents?.cedula?.ocr as Record<string, unknown> | undefined;
  const quote = selected?.snapshot?.quote;
  const emission = selected?.snapshot?.emission;
  const policyDocs = selected ? collectPolicyDocLinks(selected) : [];
  const uploadDocs = selected ? collectUploadDocLinks(selected) : [];
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

  return (
    <div className="min-h-screen relative">
      <AuroraBackground />
      <div className="pt-[40px] px-4 sm:px-6 lg:px-10 pb-12 max-w-6xl mx-auto relative z-10">
        <header className="mb-8">
          <p className="text-[0.68rem] font-black tracking-[0.22em] text-violet-500 uppercase mb-2">
            Revisión técnica · funerario
          </p>
          <h1 className="font-display text-3xl font-black text-slate-900">
            Autorización de pólizas
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Empresa #{EMPRESA_ID} · canal {canalDisplayLabel(PANEL.canal)}
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {filterTabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                filter === key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {key === 'history' && <History size={12} />}
              {label}
            </button>
          ))}
          <span className="text-xs text-slate-400 ml-1">
            {loading ? '…' : `${list.length} registro${list.length === 1 ? '' : 's'}`}
          </span>
          <button
            type="button"
            onClick={loadList}
            className="ml-auto text-xs font-semibold text-indigo-600 hover:underline"
          >
            Actualizar
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 bg-white/90 rounded-2xl border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="animate-spin text-indigo-500" />
              </div>
            ) : list.length === 0 ? (
              <p className="p-8 text-sm text-slate-500 text-center">{emptyMessage}</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
                {list.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(s);
                        setShowRawSnapshot(false);
                        loadDetail(s.id);
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-indigo-50/50 transition-colors ${
                        selected?.id === s.id ? 'bg-indigo-50' : ''
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
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {s.planName || `Plan ${s.cplan}`} · score {s.scoreTotal}
                        {policyNumber(s) ? ` · ${policyNumber(s)}` : ''}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {formatDate(s.reviewedAt || s.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-3 bg-white/90 rounded-2xl border border-slate-200 p-5 min-h-[320px]">
            {!selected ? (
              <p className="text-sm text-slate-500 text-center py-16">
                Selecciona una solicitud para ver el detalle.
              </p>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${estadoBadge(selected.estado)}`}>
                        {estadoLabel(selected.estado)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
                        {selected.id.slice(0, 8)}…
                      </span>
                    </div>
                    <h2 className="font-display text-xl font-black text-slate-900">
                      {selected.tomadorNombre || 'Tomador'}
                    </h2>
                    <p className="text-sm text-slate-500">{selected.tomadorRif}</p>
                    <p className="text-sm text-slate-500">{selected.tomadorEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-indigo-700 tabular-nums">{selected.scoreTotal}</p>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Puntaje</p>
                  </div>
                </div>

                <section className="rounded-xl border border-slate-100 p-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <Clock size={13} /> Historial de la solicitud
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-slate-400">Creada</dt>
                      <dd className="font-medium text-slate-800">{formatDate(selected.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Revisada</dt>
                      <dd className="font-medium text-slate-800">{formatDate(selected.reviewedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Revisor</dt>
                      <dd className="font-medium text-slate-800">{selected.reviewedBy || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Sesión</dt>
                      <dd className="font-medium text-slate-800 font-mono text-[10px] break-all">{selected.sessionId || '—'}</dd>
                    </div>
                    {selected.rejectReason && (
                      <div className="col-span-2">
                        <dt className="text-slate-400">Motivo rechazo</dt>
                        <dd className="font-medium text-rose-700">{selected.rejectReason}</dd>
                      </div>
                    )}
                  </dl>
                </section>

                <section className="rounded-xl border border-slate-100 p-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <FileText size={13} /> Datos guardados (póliza)
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <dt className="text-slate-400">Plan</dt>
                      <dd className="font-medium text-slate-800">
                        {selected.planName || selected.snapshot?.selectedPlan?.name || selected.cplan}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">cplan / ramo</dt>
                      <dd className="font-medium text-slate-800">
                        {selected.cplan}
                        {selected.cramo != null ? ` · ramo ${selected.cramo}` : ''}
                      </dd>
                    </div>
                    {polNum ? (
                      <div>
                        <dt className="text-slate-400">Nº póliza</dt>
                        <dd className="font-mono font-semibold text-slate-900">{polNum}</dd>
                      </div>
                    ) : (
                      <div>
                        <dt className="text-slate-400">Nº póliza</dt>
                        <dd className="text-slate-400 italic">
                          {selected.estado === 'paid' ? 'No registrado' : 'Se genera al pagar y emitir'}
                        </dd>
                      </div>
                    )}
                    {recNum && (
                      <div>
                        <dt className="text-slate-400">Recibo</dt>
                        <dd className="font-mono font-medium text-slate-800">{recNum}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-slate-400">Frecuencia</dt>
                      <dd className="font-medium text-slate-800">
                        {selected.snapshot?.funeral?.frecuencia || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Prima</dt>
                      <dd className="font-medium text-slate-800">
                        {quote?.mprimaext != null
                          ? `$${Number(quote.mprimaext).toFixed(2)}`
                          : quote?.mprima != null
                            ? `$${Number(quote.mprima).toFixed(2)}`
                            : '—'}
                        {quote?.ptasa != null ? ` · tasa ${quote.ptasa}` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Tomador</dt>
                      <dd className="font-medium text-slate-800">
                        {personLabel(selected.snapshot?.tomador)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Asegurado</dt>
                      <dd className="font-medium text-slate-800">
                        {personLabel(selected.snapshot?.asegurado)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-400">Beneficiario</dt>
                      <dd className="font-medium text-slate-800">
                        {personLabel(selected.snapshot?.beneficiario)}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-xl border border-slate-100 p-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <FileDown size={13} /> Documentos de póliza emitida
                  </h3>
                  {policyDocs.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      {selected.estado === 'paid'
                        ? 'Sin PDF de póliza registrado.'
                        : selected.estado === 'approved'
                          ? 'Aún no hay póliza: el cliente debe pagar en el link de la sección «Pago». Tras la emisión aparecerá el cuadro de póliza (PDF La Mundial) y el número oficial.'
                          : 'El cuadro de póliza y anexos se guardan al completar pago + emisión.'}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {policyDocs.map((doc) => (
                        <li key={doc.key}>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border transition-colors ${
                              doc.kind === 'policy'
                                ? 'border-indigo-200 bg-indigo-50/60 text-indigo-800 hover:bg-indigo-50'
                                : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <ExternalLink size={13} className="shrink-0 mt-0.5" />
                            <span className="min-w-0">
                              <span className="font-bold block">{doc.label}</span>
                              <span className="break-all opacity-80">{doc.url}</span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {emittedWhen && (
                    <p className="text-[10px] text-slate-400 mt-3">
                      Emitida {formatDate(emittedWhen)}
                      {polNum ? ` · ${polNum}` : ''}
                    </p>
                  )}
                </section>

                {uploadDocs.length > 0 && (
                  <section className="rounded-xl border border-slate-100 p-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                      <FileText size={13} /> Expediente OCR
                    </h3>
                    <ul className="space-y-2">
                      {uploadDocs.map((doc) => (
                        <li key={doc.key}>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2 text-xs rounded-lg px-3 py-2 border border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <ExternalLink size={13} className="shrink-0 mt-0.5" />
                            <span className="min-w-0">
                              <span className="font-bold block">{doc.label}</span>
                              <span className="break-all opacity-80">{doc.url}</span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {(selected.paymentUrl || selected.paymentSid || selected.paymentExpiresAt) && (
                  <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-indigo-600 mb-3 flex items-center gap-1.5">
                      <CreditCard size={13} /> Checkout de pago (no es la póliza)
                    </h3>
                    <dl className="space-y-2 text-xs">
                      {selected.paymentSid && (
                        <div>
                          <dt className="text-slate-400">SID checkout</dt>
                          <dd className="font-mono text-[10px] text-slate-700 break-all">{selected.paymentSid}</dd>
                        </div>
                      )}
                      {selected.paymentExpiresAt && (
                        <div>
                          <dt className="text-slate-400">Link expira</dt>
                          <dd className="font-medium text-slate-800">{formatDate(selected.paymentExpiresAt)}</dd>
                        </div>
                      )}
                      {selected.paymentUrl && (
                        <div>
                          <dt className="text-slate-400 mb-0.5">URL de pago</dt>
                          <dd>
                            <a
                              href={selected.paymentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:underline break-all"
                            >
                              {selected.paymentUrl}
                            </a>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>
                )}

                <section className="rounded-xl border border-slate-100 p-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <User size={13} /> Cédula / OCR
                  </h3>
                  {cedulaOcr ? (
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(cedulaOcr)
                        .filter(([, v]) => v != null && String(v).trim())
                        .slice(0, 12)
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-slate-400 uppercase text-[10px]">{k}</dt>
                            <dd className="font-medium text-slate-800">{String(v)}</dd>
                          </div>
                        ))}
                    </dl>
                  ) : (
                    <p className="text-xs text-slate-500">Sin datos OCR de cédula en el snapshot.</p>
                  )}
                </section>

                <section className="rounded-xl border border-slate-100 p-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <ClipboardList size={13} /> Scoring y preguntas
                  </h3>
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {(selected.scoreBreakdown ?? []).map((line) => (
                      <li
                        key={line.questionId}
                        className="flex items-start justify-between gap-2 text-xs border-b border-slate-50 pb-2"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{line.label}</p>
                          <p className="text-slate-500">Resp: {formatAnswer(line.answer)}</p>
                        </div>
                        <span className="font-bold text-indigo-600 shrink-0">+{line.points}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-xl border border-slate-100 p-4">
                  <button
                    type="button"
                    onClick={() => setShowRawSnapshot((v) => !v)}
                    className="text-xs font-bold text-slate-500 hover:text-indigo-600 uppercase tracking-wider"
                  >
                    {showRawSnapshot ? '▾ Ocultar snapshot JSON' : '▸ Ver snapshot JSON completo'}
                  </button>
                  {showRawSnapshot && (
                    <pre className="mt-3 max-h-48 overflow-auto text-[10px] bg-slate-50 rounded-lg p-3 text-slate-700">
                      {JSON.stringify(selected.snapshot, null, 2)}
                    </pre>
                  )}
                </section>

                {selected.estado === 'pending' && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <button
                      type="button"
                      disabled={acting}
                      onClick={() => approve(selected.id)}
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
                        onClick={() => reject(selected.id)}
                        className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50"
                      >
                        <X size={16} /> Rechazar
                      </button>
                    </div>
                  </div>
                )}

                {selected.estado === 'approved' && (
                  <div className="space-y-2">
                    <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">
                      Aprobada el {formatDate(selected.reviewedAt)}.
                      {selected.emailSent
                        ? ' Se envió el correo con el link de pago al cliente.'
                        : selected.emailError
                          ? ` Link generado pero el correo falló: ${selected.emailError}`
                          : ' Link de pago generado.'}
                    </p>
                  </div>
                )}

                {selected.estado === 'paid' && (
                  <p className="text-sm text-indigo-700 bg-indigo-50 rounded-xl px-4 py-3">
                    Póliza pagada y emitida. Registro en histórico.
                  </p>
                )}

                {selected.estado === 'rejected' && (
                  <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-4 py-3">
                    Solicitud rechazada
                    {selected.reviewedAt ? ` el ${formatDate(selected.reviewedAt)}` : ''}.
                    {selected.rejectReason ? ` Motivo: ${selected.rejectReason}` : ''}
                  </p>
                )}

                {selected.estado === 'expired' && (
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3">
                    Link de pago expirado
                    {selected.paymentExpiresAt ? ` (${formatDate(selected.paymentExpiresAt)})` : ''}.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
