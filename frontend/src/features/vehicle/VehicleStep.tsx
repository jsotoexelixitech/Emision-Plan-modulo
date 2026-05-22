import { useState, useEffect, useCallback, useRef } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import { Field, Input, Select } from '../../components/ui/FormField';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch';
import { SectionCard } from '../emission/EmissionStep';
import {
  Car, UserCog, Sparkles, ScanLine, ShieldCheck,
  Loader2, AlertTriangle,
} from 'lucide-react';
import { toast } from '../../store/toastStore';
import { cn } from '../../lib/utils';
import { catalogoApi, type InmaMarca, type InmaModelo, type InmaVersion, type CategoriaUso } from '../../lib/api';

const COLOR_SWATCHES: Record<string, string> = {
  blanco: '#F8FAFC', negro: '#0F172A', gris: '#94A3B8', plateado: '#CBD5E1',
  rojo: '#EF4444', azul: '#3B82F6', verde: '#10B981', amarillo: '#F59E0B',
  marrón: '#92400E', beige: '#F5DEB3',
};

function getColorSwatch(name: string): string {
  if (!name) return '#E2E8F0';
  return COLOR_SWATCHES[name.toLowerCase().trim()] ?? '#94A3B8';
}

function normText(s: string) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function findBestMatch<T>(
  list: T[], text: string, key: keyof T
): T | undefined {
  if (!text || !list.length) return undefined;
  const n = normText(text);
  const val = (i: T) => normText(String(i[key] ?? ''));
  return list.find(i => val(i) === n)
    ?? list.find(i => val(i).includes(n) || n.includes(val(i)));
}

interface VehicleErrors {
  placa?: string;
  marca?: string;
  modelo?: string;
  cond_nombre?: string;
  cond_apellido?: string;
  cond_licencia?: string;
}

// ── Hook catálogo INMA ────────────────────────────────────────────────────────
function useInmaCatalog() {
  const [marcas,    setMarcas]    = useState<InmaMarca[]>([]);
  const [modelos,   setModelos]   = useState<InmaModelo[]>([]);
  const [versiones, setVersiones] = useState<InmaVersion[]>([]);
  const [categoriasUso, setCategoriasUso] = useState<CategoriaUso[]>([]);
  const [loadM,  setLoadM]  = useState(false);
  const [loadMo, setLoadMo] = useState(false);
  const [loadV,  setLoadV]  = useState(false);
  const [loadCu, setLoadCu] = useState(false);

  const loadMarcas = useCallback(async (y: number) => {
    if (!y || y < 1990) return;
    setLoadM(true); setMarcas([]); setModelos([]); setVersiones([]); setCategoriasUso([]);
    try { setMarcas((await catalogoApi.marcas(y)).data.data ?? []); } catch { /* silencioso */ }
    finally { setLoadM(false); }
  }, []);

  const loadModelos = useCallback(async (y: number, cmarca: string) => {
    if (!y || !cmarca) return;
    setLoadMo(true); setModelos([]); setVersiones([]); setCategoriasUso([]);
    try { setModelos((await catalogoApi.modelos(y, cmarca)).data.data ?? []); } catch { }
    finally { setLoadMo(false); }
  }, []);

  const loadVersiones = useCallback(async (y: number, cmarca: string, cmodelo: string) => {
    if (!y || !cmarca || !cmodelo) return;
    setLoadV(true); setVersiones([]); setCategoriasUso([]);
    try { setVersiones((await catalogoApi.versiones(y, cmarca, cmodelo)).data.data ?? []); } catch { }
    finally { setLoadV(false); }
  }, []);

  const loadCategoriasUso = useCallback(async (y: number, cmarca: string, cmodelo: string, cversion: string) => {
    if (!y || !cmarca || !cmodelo || !cversion) return;
    setLoadCu(true); setCategoriasUso([]);
    try { setCategoriasUso((await catalogoApi.categoriasUso(y, cmarca, cmodelo, cversion)).data.data ?? []); }
    catch { /* fallback: el formulario muestra opciones genéricas si la lista queda vacía */ }
    finally { setLoadCu(false); }
  }, []);

  const resetModelos  = useCallback(() => { setModelos([]); setVersiones([]); setCategoriasUso([]); }, []);
  const resetVersiones = useCallback(() => { setVersiones([]); setCategoriasUso([]); }, []);
  const resetCategoriasUso = useCallback(() => setCategoriasUso([]), []);

  return {
    marcas, modelos, versiones, categoriasUso,
    loadM, loadMo, loadV, loadCu,
    loadMarcas, loadModelos, loadVersiones, loadCategoriasUso,
    resetModelos, resetVersiones, resetCategoriasUso,
  };
}

// ── Componente principal ──────────────────────────────────────────────────────
export function VehicleStep() {
  const {
    vehicle, setVehicle,
    hasDriver, setHasDriver,
    conductor, setConductor,
    documents,
  } = useWizardStore();

  const [errors, setErrors] = useState<VehicleErrors>({});
  const [verified, setVerified] = useState(false);

  // Rango de años del catálogo INMA
  const [anios, setAnios] = useState<number[]>([]);

  // Refs para controlar el auto-select por OCR (no sobrescribir selección manual)
  const autoSelectedMarca  = useRef(false);
  const autoSelectedModelo = useRef(false);

  const {
    marcas, modelos, versiones, categoriasUso,
    loadM, loadMo, loadV, loadCu,
    loadMarcas, loadModelos, loadVersiones, loadCategoriasUso,
    resetModelos, resetVersiones,
  } = useInmaCatalog();

  const ocrCert     = documents.certificado.ocr;
  const hasOcr      = !!(ocrCert?.marca || ocrCert?.modelo || ocrCert?.placa);
  const hasOcrCodes = !!(vehicle.cmarca && vehicle.cmodelo);

  // ── Cargar rango de años al montar ────────────────────────────────────────
  useEffect(() => {
    catalogoApi.anios()
      .then(r => {
        const { min = 2000, max = new Date().getFullYear() + 1 } = r.data as { min?: number; max?: number };
        const y: number[] = [];
        for (let yr = max; yr >= min; yr--) y.push(yr);
        setAnios(y);
        // Si el OCR trajo año pero no está seteado, usarlo
        if (!vehicle.año && ocrCert?.año) {
          setVehicle({ año: String(ocrCert.año) });
        }
      })
      .catch(() => {
        const y: number[] = [];
        for (let yr = new Date().getFullYear() + 1; yr >= 1990; yr--) y.push(yr);
        setAnios(y);
      });
  // Solo al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cuando cambia el año: cargar marcas y resetear refs de auto-select ────
  useEffect(() => {
    const y = parseInt(vehicle.año, 10);
    if (!y || y < 1990) return;
    autoSelectedMarca.current  = false;
    autoSelectedModelo.current = false;
    resetModelos();
    loadMarcas(y);
  }, [vehicle.año, loadMarcas, resetModelos]);

  // ── Cuando cargan las marcas: auto-seleccionar OCR marca ─────────────────
  useEffect(() => {
    if (!marcas.length) return;
    if (autoSelectedMarca.current) return;
    if (vehicle.cmarca) return; // usuario ya eligió
    if (!ocrCert?.marca) return;

    const match = findBestMatch(marcas, ocrCert.marca, 'xmarca' as keyof InmaMarca);
    if (match) {
      autoSelectedMarca.current = true;
      setVehicle({ cmarca: match.cmarca, marca: match.xmarca, cmodelo: '', modelo: '', cversion: '', ccategoria_uso: undefined, xcategoria_uso: '' });
    }
  // Solo cuando marcas cambia
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcas]);

  // ── Cuando cambia cmarca: cargar modelos ─────────────────────────────────
  useEffect(() => {
    const y = parseInt(vehicle.año, 10);
    if (!vehicle.cmarca || !y) return;
    autoSelectedModelo.current = false;
    resetVersiones();
    loadModelos(y, vehicle.cmarca);
  }, [vehicle.cmarca, vehicle.año, loadModelos, resetVersiones]);

  // ── Cuando cargan los modelos: auto-seleccionar OCR modelo ───────────────
  useEffect(() => {
    if (!modelos.length) return;
    if (autoSelectedModelo.current) return;
    if (vehicle.cmodelo) return;
    if (!ocrCert?.modelo) return;

    const match = findBestMatch(modelos, ocrCert.modelo, 'xmodelo' as keyof InmaModelo);
    if (match) {
      autoSelectedModelo.current = true;
      setVehicle({ cmodelo: match.cmodelo, modelo: match.xmodelo, cversion: '', ccategoria_uso: undefined, xcategoria_uso: '' });
    } else {
      // Fallback: informar que no se encontró el modelo exacto
      toast.warning(
        'Modelo no encontrado',
        `No encontramos "${ocrCert.modelo}" en el catálogo. Selecciónalo manualmente.`,
        5000,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelos]);

  // ── Cuando cambia cmodelo: cargar versiones ───────────────────────────────
  useEffect(() => {
    const y = parseInt(vehicle.año, 10);
    if (!vehicle.cmarca || !vehicle.cmodelo || !y) return;
    loadVersiones(y, vehicle.cmarca, vehicle.cmodelo);
  }, [vehicle.cmodelo, vehicle.cmarca, vehicle.año, loadVersiones]);

  // ── Cuando cambia cversion: cargar categorías de uso (depende de la versión)
  useEffect(() => {
    const y = parseInt(vehicle.año, 10);
    if (!vehicle.cmarca || !vehicle.cmodelo || !vehicle.cversion || !y) return;
    loadCategoriasUso(y, vehicle.cmarca, vehicle.cmodelo, vehicle.cversion);
  }, [vehicle.cversion, vehicle.cmodelo, vehicle.cmarca, vehicle.año, loadCategoriasUso]);

  // ── Auto-seleccionar categoría única cuando solo hay una opción ───────────
  useEffect(() => {
    if (categoriasUso.length === 1 && !vehicle.ccategoria_uso) {
      const c = categoriasUso[0];
      setVehicle({
        ccategoria_uso: c.ccategoria_uso,
        xcategoria_uso: c.xcategoria_uso,
        uso: c.xcategoria_uso,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriasUso]);

  // ── Validación ────────────────────────────────────────────────────────────
  const validate = () => {
    const e: VehicleErrors = {};
    if (!vehicle.placa.trim())  e.placa  = 'La placa es obligatoria';
    if (!vehicle.marca.trim())  e.marca  = 'La marca es obligatoria';
    if (!vehicle.modelo.trim()) e.modelo = 'El modelo es obligatorio';

    if (hasDriver) {
      if (!(conductor.nombre ?? '').trim())   e.cond_nombre   = 'El nombre del conductor es obligatorio';
      if (!(conductor.apellido ?? '').trim()) e.cond_apellido = 'El apellido del conductor es obligatorio';
      if (!(conductor.licencia ?? '').trim()) e.cond_licencia = 'El número de licencia es obligatorio';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };
  (window as unknown as Record<string, unknown>).__validateStep3 = validate;

  const codesReady = !!(vehicle.cmarca && vehicle.cmodelo && vehicle.cversion);

  return (
    <div className="animate-fade-in space-y-5">

      {/* ── Banner OCR ────────────────────────────────────────────────────────── */}
      {hasOcr && (
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white p-4 sm:p-5 shadow-[0_18px_40px_-12px_rgba(15,26,90,0.32)] relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-32 h-32 rounded-full bg-fuchsia-300/15 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md grid place-items-center flex-shrink-0 ring-1 ring-white/20">
                {(loadM || loadMo) ? (
                  <Loader2 size={18} className="animate-spin text-white" />
                ) : (
                  <ScanLine size={18} className="text-white" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display font-black text-sm flex items-center gap-2 flex-wrap">
                  Datos precargados del documento
                  {(loadM || loadMo) && (
                    <span className="text-[0.6rem] font-bold bg-white/20 px-2 py-0.5 rounded-full tracking-wider animate-pulse">
                      Cargando catálogo…
                    </span>
                  )}
                  {!loadM && !loadMo && hasOcrCodes && (
                    <span className="text-[0.6rem] font-bold bg-white/20 px-2 py-0.5 rounded-full tracking-wider">
                      IA ✓
                    </span>
                  )}
                </p>
                <p className="text-xs text-indigo-100 mt-0.5 leading-relaxed">
                  {hasOcrCodes
                    ? 'Marca y modelo identificados en el catálogo. Solo confirma la versión.'
                    : 'Revisa los campos y completa lo que falte. Puedes cambiar cualquier valor.'}
                </p>
              </div>
            </div>
            {hasOcrCodes && !verified && (
              <button
                type="button"
                onClick={() => {
                  setVerified(true);
                  toast.success(
                    'Datos confirmados',
                    'Marca, modelo y año quedan bloqueados. Pulsa "Editar" si necesitas cambiarlos.',
                    3500,
                  );
                }}
                className="self-start sm:self-auto flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/95 hover:bg-white text-indigo-700 text-xs font-bold shadow-[0_6px_16px_rgba(0,0,0,0.15)] transition-all active:scale-95"
              >
                <ShieldCheck size={14} /> Confirmar datos
              </button>
            )}
            {verified && (
              <div className="self-start sm:self-auto flex-shrink-0 flex items-center gap-2">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-400/95 text-emerald-950 text-xs font-bold ring-1 ring-emerald-300">
                  <ShieldCheck size={14} /> Verificado
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setVerified(false);
                    toast.info('Datos desbloqueados', 'Ya puedes modificar marca, modelo y año.', 2500);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold ring-1 ring-white/30 transition-all active:scale-95"
                  title="Desbloquear y editar"
                >
                  Editar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Formulario del vehículo ────────────────────────────────────────────── */}
      <SectionCard Icon={Car} title="¿Cuál es tu vehículo?" description="Cuéntanos sobre el vehículo que deseas asegurar">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Placa con selector de tipo (Nacional / Extranjera) */}
          <Field
            label={
              <span className="flex items-center justify-between gap-2 w-full">
                <span>Placa</span>
                <span className="inline-flex items-center gap-0 rounded-lg bg-slate-100 p-0.5 text-[0.65rem] font-bold border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setVehicle({ tipoPlaca: 'nacional' })}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-all',
                      vehicle.tipoPlaca === 'nacional'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    ✓ Nacional
                  </button>
                  <button
                    type="button"
                    onClick={() => setVehicle({ tipoPlaca: 'extranjera' })}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-all',
                      vehicle.tipoPlaca === 'extranjera'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    Extranjera
                  </button>
                </span>
              </span> as unknown as string
            }
            error={errors.placa}
          >
            <Input
              value={vehicle.placa}
              onChange={(e) => setVehicle({ placa: e.target.value.toUpperCase() })}
              placeholder={vehicle.tipoPlaca === 'extranjera' ? 'ABC-1234' : 'AE123KT'}
              className="uppercase font-mono tracking-wider"
              maxLength={vehicle.tipoPlaca === 'extranjera' ? 12 : 8}
            />
          </Field>

          {/* Año — selector del catálogo INMA */}
          <Field label="Año del vehículo">
            {anios.length > 0 ? (
              <Select
                value={vehicle.año}
                disabled={verified}
                onChange={(e) => {
                  setVehicle({ año: e.target.value, cmarca: '', marca: '', cmodelo: '', modelo: '', cversion: '', ccategoria_uso: undefined, xcategoria_uso: '' });
                }}
              >
                <option value="">— Selecciona año —</option>
                {anios.map(y => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </Select>
            ) : (
              <div className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin shrink-0" />
                Cargando años…
              </div>
            )}
          </Field>

          {/* Marca */}
          <Field
            label={
              <span className="flex items-center gap-1.5">
                Marca
                {loadM && <Loader2 size={11} className="animate-spin text-indigo-400" />}
                {vehicle.cmarca && !loadM && <span className="text-[0.6rem] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓</span>}
              </span> as unknown as string
            }
            error={errors.marca}
          >
            {marcas.length > 0 ? (
              <Select
                value={vehicle.cmarca ?? ''}
                disabled={verified}
                onChange={(e) => {
                  const cmarca = e.target.value;
                  const xmarca = marcas.find(m => m.cmarca === cmarca)?.xmarca ?? '';
                  autoSelectedMarca.current = true;
                  autoSelectedModelo.current = false;
                  setVehicle({ cmarca, marca: xmarca, cmodelo: '', modelo: '', cversion: '', ccategoria_uso: undefined, xcategoria_uso: '' });
                }}
              >
                <option value="">— Selecciona marca —</option>
                {marcas.map(m => (
                  <option key={m.cmarca} value={m.cmarca}>{m.xmarca}</option>
                ))}
              </Select>
            ) : vehicle.año ? (
              loadM ? (
                <div className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin shrink-0" /> Cargando marcas…
                </div>
              ) : (
                <Input
                  value={vehicle.marca}
                  onChange={(e) => setVehicle({ marca: e.target.value, cmarca: '' })}
                  placeholder="Primero selecciona el año"
                />
              )
            ) : (
              <div className="w-full px-3.5 py-2.5 border border-dashed border-slate-300 rounded-xl bg-slate-50 text-xs text-slate-400 flex items-center gap-2">
                <AlertTriangle size={13} className="shrink-0 text-amber-400" />
                Selecciona el año primero
              </div>
            )}
          </Field>

          {/* Modelo */}
          <Field
            label={
              <span className="flex items-center gap-1.5">
                Modelo
                {loadMo && <Loader2 size={11} className="animate-spin text-indigo-400" />}
                {vehicle.cmodelo && !loadMo && <span className="text-[0.6rem] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓</span>}
              </span> as unknown as string
            }
            error={errors.modelo}
          >
            {modelos.length > 0 ? (
              <Select
                value={vehicle.cmodelo ?? ''}
                disabled={verified}
                onChange={(e) => {
                  const cmodelo = e.target.value;
                  const xmodelo = modelos.find(m => m.cmodelo === cmodelo)?.xmodelo ?? '';
                  autoSelectedModelo.current = true;
                  setVehicle({ cmodelo, modelo: xmodelo, cversion: '', ccategoria_uso: undefined, xcategoria_uso: '' });
                }}
              >
                <option value="">— Selecciona modelo —</option>
                {modelos.map(m => (
                  <option key={m.cmodelo} value={m.cmodelo}>{m.xmodelo}</option>
                ))}
              </Select>
            ) : vehicle.cmarca ? (
              loadMo ? (
                <div className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin shrink-0" /> Cargando modelos…
                </div>
              ) : (
                <Input
                  value={vehicle.modelo}
                  onChange={(e) => setVehicle({ modelo: e.target.value, cmodelo: '' })}
                  placeholder="Corolla, Aveo…"
                />
              )
            ) : (
              <div className="w-full px-3.5 py-2.5 border border-dashed border-slate-300 rounded-xl bg-slate-50 text-xs text-slate-400 flex items-center gap-2">
                <AlertTriangle size={13} className="shrink-0 text-amber-400" />
                Selecciona la marca primero
              </div>
            )}
          </Field>

          {/* Versión + Uso — emparejados en la misma fila (cada uno media columna) */}
          {(vehicle.cmodelo || loadV) && (
            <Field
              label={
                <span className="flex items-center gap-1.5">
                  Versión
                  {loadV && <Loader2 size={11} className="animate-spin text-indigo-400" />}
                  {!vehicle.cversion && !loadV && (
                    <span className="text-[0.6rem] font-bold text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
                      requerido
                    </span>
                  )}
                </span> as unknown as string
              }
            >
              {versiones.length > 0 ? (
                <Select
                  value={vehicle.cversion ?? ''}
                  onChange={(e) => setVehicle({
                    cversion: e.target.value,
                    // Reset categoría de uso para forzar al usuario a elegir una válida para esta versión
                    ccategoria_uso: undefined,
                    xcategoria_uso: '',
                  })}
                  className={!vehicle.cversion ? 'border-violet-300 focus:border-violet-500 ring-2 ring-violet-100' : ''}
                >
                  <option value="">— Selecciona la versión —</option>
                  {versiones.map(v => (
                    <option key={v.cversion} value={v.cversion}>{v.xversion}</option>
                  ))}
                </Select>
              ) : loadV ? (
                <div className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin shrink-0" /> Cargando versiones…
                </div>
              ) : null}
            </Field>
          )}

          {/* Uso — categorías dinámicas según la versión seleccionada */}
          <Field
            label={
              <span className="flex items-center gap-1.5">
                ¿Para qué usas el vehículo?
                {loadCu && <Loader2 size={11} className="animate-spin text-indigo-400" />}
                {vehicle.ccategoria_uso != null && vehicle.ccategoria_uso !== '' && !loadCu && (
                  <span className="text-[0.6rem] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓</span>
                )}
                {!vehicle.cversion && (
                  <span className="text-[0.6rem] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                    elige versión
                  </span>
                )}
              </span> as unknown as string
            }
            hint={!vehicle.cversion ? 'Selecciona la versión del vehículo para ver las categorías.' : undefined}
          >
            {!vehicle.cversion ? (
              <div className="w-full px-3.5 py-2.5 border border-dashed border-slate-300 rounded-xl bg-slate-50 text-xs text-slate-400 flex items-center gap-2">
                <AlertTriangle size={13} className="shrink-0 text-amber-400" />
                Selecciona la versión primero
              </div>
            ) : loadCu ? (
              <div className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm text-slate-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin shrink-0" /> Cargando categorías…
              </div>
            ) : categoriasUso.length > 0 ? (
              <Select
                value={vehicle.ccategoria_uso != null ? String(vehicle.ccategoria_uso) : ''}
                onChange={(e) => {
                  const code = e.target.value;
                  const match = categoriasUso.find(c => String(c.ccategoria_uso) === code);
                  setVehicle({
                    ccategoria_uso: match ? match.ccategoria_uso : undefined,
                    xcategoria_uso: match?.xcategoria_uso ?? '',
                    // Mantenemos `uso` (texto) sincronizado para retrocompatibilidad de UI/store
                    uso: match?.xcategoria_uso ?? vehicle.uso,
                  });
                }}
                className={vehicle.ccategoria_uso == null ? 'border-violet-300 focus:border-violet-500 ring-2 ring-violet-100' : ''}
              >
                <option value="">— Selecciona la categoría de uso —</option>
                {categoriasUso.map(c => (
                  <option key={c.ccategoria_uso} value={String(c.ccategoria_uso)}>{c.xcategoria_uso}</option>
                ))}
              </Select>
            ) : (
              <Select value={vehicle.uso} onChange={(e) => setVehicle({ uso: e.target.value })}>
                <option value="Particular">Uso personal / familiar</option>
                <option value="Comercial">Negocio o empresa</option>
                <option value="Carga">Carga y transporte</option>
                <option value="Transporte público">Transporte de pasajeros</option>
              </Select>
            )}
          </Field>

          {/* Confirmación amigable cuando el vehículo está completo */}
          {codesReady && (
            <div className="sm:col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
              <ShieldCheck size={14} className="shrink-0 text-emerald-500" />
              <span>
                <strong>{vehicle.marca} {vehicle.modelo}</strong> listo para cotización — selecciona el plan en el siguiente paso.
              </span>
            </div>
          )}

          {/* Color */}
          <Field label="Color">
            <div className="relative">
              <Input
                value={vehicle.color}
                onChange={(e) => setVehicle({ color: e.target.value })}
                placeholder="Plateado"
                style={{ paddingLeft: '2.25rem' }}
              />
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-slate-300 shadow-inner pointer-events-none"
                style={{ background: getColorSwatch(vehicle.color) }}
                aria-hidden
              />
            </div>
          </Field>

          {/* Serial */}
          <Field label="Serial del vehículo (VIN)" hint="Son los 17 caracteres que aparecen en el documento del vehículo">
            <Input
              value={vehicle.serial}
              onChange={(e) => setVehicle({ serial: e.target.value.toUpperCase() })}
              placeholder="1HGBH41JXMN109186"
              className="font-mono uppercase tracking-wider"
              maxLength={17}
            />
          </Field>
        </div>

        {/* Vista previa de placa */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex items-center gap-3 sm:gap-4 flex-wrap">
          <p className="text-[0.62rem] font-black text-slate-500 uppercase tracking-widest inline-flex items-center gap-1.5">
            <Sparkles size={11} className="text-indigo-500" /> Vista previa
          </p>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <div className="rounded-md bg-white border-2 border-slate-900 px-3 py-1.5 font-mono font-black text-slate-900 text-sm tracking-widest shadow-sm">
              {vehicle.placa || 'AAA000'}
            </div>
            <span className="text-sm text-slate-700 font-bold truncate max-w-[200px]">
              {[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ') || 'Marca · Modelo'}
            </span>
            {vehicle.año && <span className="text-xs text-slate-400 font-mono">{vehicle.año}</span>}
            {vehicle.color && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 capitalize">
                <span className="w-3 h-3 rounded-full ring-1 ring-slate-300" style={{ background: getColorSwatch(vehicle.color) }} />
                {vehicle.color}
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Conductor habitual ─────────────────────────────────────────────────── */}
      <SectionCard Icon={UserCog} title="¿Hay otro conductor?" description="Si alguien más conduce este vehículo con frecuencia, regístralo aquí">
        <ToggleSwitch
          checked={hasDriver} onChange={setHasDriver}
          label="Sí, hay otra persona que lo maneja"
          description="Puede ser un familiar, empleado o cualquier persona que utilice el vehículo con regularidad."
        />
        {hasDriver && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
            <Field label="Nombre del conductor *" error={errors.cond_nombre}>
              <Input
                value={conductor.nombre}
                onChange={(e) => setConductor({ nombre: e.target.value.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]/g, '') })}
                placeholder="Nombre"
              />
            </Field>
            <Field label="Apellido del conductor *" error={errors.cond_apellido}>
              <Input
                value={conductor.apellido}
                onChange={(e) => setConductor({ apellido: e.target.value.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]/g, '') })}
                placeholder="Apellido"
              />
            </Field>
            <Field label="Número de licencia de conducir *" error={errors.cond_licencia}>
              <Input
                value={conductor.licencia ?? ''}
                onChange={(e) => setConductor({ licencia: e.target.value.toUpperCase() })}
                placeholder="Ej. LIC-0234567"
                className="uppercase font-mono tracking-wider"
              />
            </Field>
            <Field label="¿Qué relación tiene contigo?">
              <Input value={conductor.relacion ?? ''} onChange={(e) => setConductor({ relacion: e.target.value })} placeholder="Ej. hijo, esposa, empleado..." />
            </Field>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
