import { useCallback, useEffect, useState } from 'react';
import {
  Check, X, Loader2, ClipboardList, User, FileText, AlertTriangle,
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
  scoreTotal: number;
  scoreBreakdown: ScoreLine[];
  healthAnswers: Record<string, unknown>;
  snapshot: {
    tomador?: Record<string, unknown>;
    documents?: Record<string, { ocr?: Record<string, unknown> }>;
    selectedPlan?: { name?: string };
    quote?: { mprimaext?: number };
  };
  paymentUrl?: string | null;
  paymentExpiresAt?: string | null;
  createdAt: string;
  emailSent?: boolean;
  emailError?: string;
};

function readPanelToken(): string {
  try {
    return new URL(window.location.href).searchParams.get('token')?.trim() || '';
  } catch {
    return '';
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
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = filter === 'pending' ? '&estado=pending' : '';
      const res = await fetch(
        `${NEXUS_URL}/api/funeral-submissions?empresaId=${EMPRESA_ID}${q}`,
        { headers: authHeaders() },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || `Error HTTP ${res.status}`);
        setList([]);
        return;
      }
      setList(data.data ?? []);
      if (selected && !(data.data ?? []).find((s: Submission) => s.id === selected.id)) {
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

        <div className="flex gap-2 mb-4">
          {(['pending', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                filter === f ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {f === 'pending' ? 'Pendientes' : 'Todas'}
            </button>
          ))}
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
              <p className="p-8 text-sm text-slate-500 text-center">No hay solicitudes.</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
                {list.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(s);
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
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${estadoBadge(s.estado)}`}>
                          {s.estado}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {s.planName || `Plan ${s.cplan}`} · score {s.scoreTotal}
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

                <section className="rounded-xl border border-slate-100 p-4 text-xs text-slate-600">
                  <FileText size={13} className="inline mr-1 text-slate-400" />
                  Plan: <strong>{selected.planName || selected.cplan}</strong>
                  {selected.snapshot?.quote?.mprimaext != null && (
                    <>
                      {' '}
                      · Prima ${Number(selected.snapshot.quote.mprimaext).toFixed(2)}
                    </>
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
                      Aprobada.
                      {(selected as Submission).emailSent
                        ? ' Se envió el correo con el link de pago al cliente.'
                        : (selected as Submission).emailError
                          ? ` Link generado pero el correo falló: ${(selected as Submission).emailError}`
                          : ' Link de pago generado.'}
                    </p>
                    {selected.paymentUrl && (
                      <a
                        href={selected.paymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-indigo-600 hover:underline break-all px-1"
                      >
                        {selected.paymentUrl}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
