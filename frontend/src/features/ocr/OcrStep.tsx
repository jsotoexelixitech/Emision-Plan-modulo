import { useEffect, useRef, useState } from 'react';
import {
  Upload, CheckCircle2, AlertCircle, RotateCcw, Eye,
  IdCard, Car, FileText, Building2, Sparkles, ScanLine,
  Wand2, Download, MousePointerClick, Camera, Images,
} from 'lucide-react';
import { useWizardStore } from '../../store/wizardStore';
import { uploadDocument, DocTypeMismatchError } from '../../lib/api';
import { toast } from '../../store/toastStore';
import { Badge } from '../../components/ui/Badge';
import { CircularProgress } from '../../components/ui/CircularProgress';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import type { DocType, DocumentFile } from '../../types';

interface DocConfig {
  type: DocType;
  label: string;
  description: string;
  Icon: React.ElementType;
  optional?: boolean;
  accent: string;
}

const DOCS: DocConfig[] = [
  {
    type: 'cedula',
    label: 'Cédula de identidad',
    description: 'Documento del tomador',
    Icon: IdCard,
    accent: 'from-indigo-500 to-violet-500',
  },
  {
    type: 'licencia',
    label: 'Licencia de conducir',
    description: 'Conductor principal',
    Icon: Car,
    accent: 'from-violet-500 to-fuchsia-500',
  },
  {
    type: 'certificado',
    label: 'Certificado del vehículo',
    description: 'Vehículo a asegurar',
    Icon: FileText,
    accent: 'from-blue-500 to-indigo-500',
  },
  {
    type: 'rif',
    label: 'RIF',
    description: 'Opcional · empresas',
    Icon: Building2,
    optional: true,
    accent: 'from-slate-400 to-slate-500',
  },
];

function UploadDocCard({
  config,
  onOpenPreview,
}: {
  config: DocConfig;
  onOpenPreview: (file: DocumentFile, title: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const docState = useWizardStore((s) => s.documents[config.type]);
  const setDocState = useWizardStore((s) => s.setDocState);

  const statusVariant = {
    idle: config.optional ? 'optional' : 'pending',
    uploading: 'uploading',
    processing: 'processing',
    done: 'done',
    error: 'error',
  } as const;

  const statusLabel = {
    idle: config.optional ? 'OPCIONAL' : 'PENDIENTE',
    uploading: 'SUBIENDO',
    processing: 'ANALIZANDO',
    done: 'PROCESADO',
    error: 'ERROR',
  };

  const isLoading = docState.status === 'uploading' || docState.status === 'processing';
  const isDone = docState.status === 'done';
  const isClickable = docState.status === 'idle' || docState.status === 'error';
  const Icon = config.Icon;

  function handleCardClick(e: React.MouseEvent) {
    // En móvil los botones de cámara/galería manejan el click directamente.
    // Solo activar el input genérico si el click viene del área de la tarjeta
    // (no de uno de los botones), y si NO es un dispositivo táctil (desktop).
    if (!isClickable) return;
    const isTouchDevice = window.matchMedia('(hover: none)').matches;
    if (!isTouchDevice) {
      // Desktop: comportamiento original — abre el selector de archivos
      const target = e.target as HTMLElement;
      if (!target.closest('[data-upload-btn]')) {
        inputRef.current?.click();
      }
    }
  }

  function handleCardKey(e: React.KeyboardEvent) {
    if (!isClickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  }

  /**
   * Prepara la imagen para OCR antes de subirla:
   * - Redimensiona al máximo 1600 px (suficiente para que Gemini lea texto)
   * - Convierte todo a JPEG calidad 82 % → documentos quedan ~200-500 KB
   * - HEIC/HEIF (iOS galería), PNG, WebP, Android JPEG → todos → JPEG
   * - PDFs pasan sin cambios
   *
   * Gemini OCR no necesita fotos de alta fidelidad; necesita texto legible.
   */
  async function prepareFile(raw: File): Promise<File> {
    if (raw.type === 'application/pdf') return raw;

    return new Promise((resolve) => {
      const MAX_PX  = 1600;   // suficiente para leer texto en documentos A4/A5
      const QUALITY = 0.82;   // 82 % → texto nítido, tamaño mínimo

      const url = URL.createObjectURL(raw);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);

        let { width, height } = img;

        // Solo escala si supera el máximo; nunca ampliar
        if (width > MAX_PX || height > MAX_PX) {
          if (width >= height) {
            height = Math.round((height * MAX_PX) / width);
            width  = MAX_PX;
          } else {
            width  = Math.round((width * MAX_PX) / height);
            height = MAX_PX;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(raw); return; }

        // Fondo blanco para documentos con transparencia (PNG con fondo vacío)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(raw); return; }
            const name = raw.name.replace(/\.[^.]+$/, '.jpg');
            resolve(new File([blob], name, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          QUALITY,
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(raw); };
      img.src = url;
    });
  }

  async function handleFile(rawFile: File) {
    setDocState(config.type, { status: 'uploading', progress: 0, error: undefined });
    const file = await prepareFile(rawFile);

    try {
      const result = await uploadDocument(file, config.type, (pct) => {
        setDocState(config.type, { progress: pct });
      });

      setDocState(config.type, { status: 'processing', progress: 100 });
      await new Promise((r) => setTimeout(r, 800));

      // Caso degradado: el archivo se subio pero Gemini no pudo leerlo
      // (cuota, calidad de imagen, etc.). NO precargamos datos por defecto:
      // el formulario del siguiente paso quedara vacio para que el usuario
      // lo complete manualmente.
      if (result.ocrFailed) {
        toast.warning(
          `No pudimos leer "${config.label}"`,
          'El archivo quedo cargado, pero tendras que completar los datos a mano en el siguiente paso.',
          7000
        );
        setDocState(config.type, {
          status: 'done',
          progress: 100,
          file: result.file,
          ocr: {},
        });
        return;
      }

      setDocState(config.type, {
        status: 'done',
        progress: 100,
        file: result.file,
        ocr: result.ocr,
      });
    } catch (err: unknown) {
      if (err instanceof DocTypeMismatchError) {
        toast.warning(
          `Documento incorrecto en "${config.label}"`,
          `Detectamos: ${err.detectedLabel}. Esperabamos: ${err.expectedLabel}.`,
          7000
        );
        setDocState(config.type, {
          status: 'error',
          progress: 0,
          error: `Subiste un(a) ${err.detectedLabel}. Aqui va ${err.expectedLabel}.`,
        });
        return;
      }

      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Error al procesar el documento.';
      toast.error(`No pudimos procesar "${config.label}"`, message, 6000);
      setDocState(config.type, { status: 'error', progress: 0, error: message });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : -1}
      aria-label={isClickable ? `Subir ${config.label}` : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKey}
      className={`
        group relative rounded-2xl border-2 transition-all duration-300 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white
        ${dragOver ? 'dropzone-active' : ''}
        ${isDone
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-white cursor-default'
          : docState.status === 'error'
          ? 'border-rose-300 bg-rose-50/30 cursor-pointer hover:border-rose-400 hover:-translate-y-0.5'
          : isLoading
          ? 'border-indigo-200 bg-gradient-to-br from-indigo-50/50 via-white to-violet-50/30 cursor-wait'
          : 'border-slate-200 bg-white hover:border-indigo-400 hover:shadow-[0_18px_40px_-12px_rgba(15, 26, 90,0.22)] hover:-translate-y-0.5 cursor-pointer active:scale-[0.99]'
        }
      `}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Decorative accent corner */}
      {!isDone && !isLoading && docState.status !== 'error' && (
        <div className={`absolute -top-12 -right-12 w-24 h-24 rounded-full bg-gradient-to-br ${config.accent} opacity-[0.08] blur-2xl pointer-events-none`} />
      )}

      {/* Input galería/archivo — acepta imágenes en cualquier formato + PDF */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,image/heic,image/heif,.pdf"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) { handleFile(e.target.files[0]); e.target.value = ''; } }}
      />
      {/* Input cámara — iOS y Android: cámara trasera directamente */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) { handleFile(e.target.files[0]); e.target.value = ''; } }}
      />

      {/* Top bar */}
      <div className="flex items-center justify-between p-4 pb-0 relative">
        <div
          className={`
            w-9 h-9 rounded-xl grid place-items-center transition-all
            ${isDone
              ? 'bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.32)]'
              : isLoading
              ? `bg-gradient-to-br ${config.accent} text-white shadow-[0_4px_14px_rgba(15, 26, 90,0.32)]`
              : config.optional
              ? 'bg-slate-100 text-slate-400'
              : 'bg-indigo-100 text-indigo-600'
            }
          `}
        >
          <Icon size={16} strokeWidth={2.2} />
        </div>
        <Badge variant={statusVariant[docState.status]}>
          {statusLabel[docState.status]}
        </Badge>
      </div>

      {/* Title */}
      <div className="px-4 pt-3 pb-2 relative">
        <h3 className="font-display font-bold text-slate-900 text-sm leading-tight">{config.label}</h3>
        <p className="text-[0.78rem] text-slate-500 mt-0.5">{config.description}</p>
      </div>

      {/* Visual zone */}
      <div className="mx-4 my-3 rounded-xl bg-slate-50 border border-slate-100 min-h-[150px] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Scan line effect when processing */}
        {docState.status === 'processing' && (
          <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_12px_rgba(15, 26, 90,0.6)] pointer-events-none"
            style={{ animation: 'fillTrack 1.4s ease-in-out infinite alternate' }}
          />
        )}

        {docState.status === 'idle' && (
          <div className="flex flex-col items-center gap-2.5 text-slate-400 transition-colors">
            {/* Ícono central — desktop y móvil */}
            <div className="relative w-14 h-14 rounded-2xl bg-white border-2 border-dashed border-slate-300 grid place-items-center group-hover:border-indigo-400 group-hover:bg-indigo-50/60 transition-all pointer-events-none">
              <Upload size={20} strokeWidth={2.2} className="group-hover:scale-110 transition-transform" />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 shadow-[0_4px_12px_rgba(15,26,90,0.4)]">
                <span className="text-[0.6rem] font-black">+</span>
              </span>
            </div>

            {/* Desktop: texto de arrastre */}
            <span className="hidden sm:inline-flex text-xs font-bold items-center gap-1.5 pointer-events-none group-hover:text-indigo-500 transition-colors">
              <MousePointerClick size={11} className="opacity-70" />
              Click o arrastra aquí
            </span>

            {/* Móvil: botones Cámara y Galería */}
            <div className="flex sm:hidden gap-2 mt-1">
              <button
                data-upload-btn
                type="button"
                onClick={(e) => { e.stopPropagation(); cameraRef.current?.click(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow active:scale-95 transition-transform"
              >
                <Camera size={13} />
                Cámara
              </button>
              <button
                data-upload-btn
                type="button"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow active:scale-95 transition-transform"
              >
                <Images size={13} />
                Galería
              </button>
            </div>

            <span className="text-[0.62rem] text-slate-400 font-mono uppercase tracking-wider pointer-events-none">JPG · PNG · PDF</span>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center gap-2.5 z-10 pointer-events-none">
            <CircularProgress progress={docState.progress} size={72} strokeWidth={5}>
              <div className="text-center">
                <p className="text-[1rem] font-black text-indigo-600 leading-none font-mono">
                  {Math.round(docState.progress)}
                </p>
                <p className="text-[0.55rem] text-slate-400 font-bold mt-0.5 tracking-wider">%</p>
              </div>
            </CircularProgress>
            <div className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-indigo-600">
              {docState.status === 'processing' && <ScanLine size={11} className="animate-pulse-soft" />}
              {docState.status === 'uploading' ? 'Subiendo...' : 'Analizando OCR...'}
            </div>
          </div>
        )}

        {isDone && (
          <div className="flex flex-col items-center gap-2 animate-spring-in pointer-events-none">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 grid place-items-center shadow-[0_8px_22px_rgba(16,185,129,0.4)]">
                <CheckCircle2 size={26} className="text-white" strokeWidth={2.5} />
              </div>
              <Sparkles size={12} className="absolute -top-1 -right-1 text-amber-400 animate-pulse-soft" />
            </div>
            <p className="text-xs font-bold text-emerald-700">Verificado</p>
            {docState.file && (
              <p className="text-[0.62rem] text-slate-400 max-w-full truncate px-2 font-mono">
                {docState.file.name}
              </p>
            )}
          </div>
        )}

        {docState.status === 'error' && (
          <div className="flex flex-col items-center gap-1.5 pointer-events-none">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 grid place-items-center">
              <AlertCircle size={24} className="text-rose-500" strokeWidth={2.2} />
            </div>
            <p className="text-xs font-bold text-rose-700">Error · Click para reintentar</p>
            <p className="text-[0.65rem] text-rose-500 max-w-full truncate px-2 text-center">{docState.error}</p>
          </div>
        )}
      </div>

      {/* Action footer (only when done) */}
      {isDone && (
        <div className="p-4 pt-2 flex gap-2">
          {docState.file?.url && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenPreview(docState.file!, config.label); }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
            >
              <Eye size={12} />
              Ver
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDocState(config.type, { status: 'idle', progress: 0, file: undefined, ocr: undefined });
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors"
          >
            <RotateCcw size={12} />
            Cambiar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Documentos demo: 100% client-side. NO pasan por Gemini para no consumir
 * cuota ni provocar `ocrFailed`. Cuando el usuario hace click en
 * "Cargar documentos demo" obtenemos los datos pre-extraidos de DEMO_OCR
 * y mostramos el SVG correspondiente en el preview.
 *
 * Los datos son coherentes entre si (mismo titular, mismo vehiculo) para
 * que el resto del wizard sea creible.
 */
const DEMO_FILES: Record<DocType, { name: string; mimeType: string; url: string }> = {
  cedula: { name: 'cedula-demo.svg', mimeType: 'image/svg+xml', url: '/samples/cedula-demo.svg' },
  licencia: { name: 'licencia-demo.svg', mimeType: 'image/svg+xml', url: '/samples/licencia-demo.svg' },
  certificado: { name: 'certificado-demo.svg', mimeType: 'image/svg+xml', url: '/samples/certificado-demo.svg' },
  rif: { name: 'rif-demo.svg', mimeType: 'image/svg+xml', url: '/samples/rif-demo.svg' },
};

const DEMO_OCR: Record<DocType, Record<string, string>> = {
  cedula: {
    nombre: 'Maria',
    apellido: 'Fernandez',
    identificacion: '18456329',
    tipoDoc: 'V',
    fechaNacimiento: '1990-04-15',
    sexo: 'Femenino',
    estadoCivil: 'Soltero(a)',
  },
  licencia: {
    numeroLicencia: 'LIC-0234567',
    categoria: '5ta',
    vencimiento: '2027-06-30',
  },
  certificado: {
    placa: 'AE123KT',
    marca: 'Toyota',
    modelo: 'Corolla',
    año: '2020',
    serial: 'VIN20TOYCO2020001',
    color: 'Plateado',
  },
  rif: {
    rif: 'V-18456329-0',
    razonSocial: 'Maria Fernandez',
  },
};

function makeDemoFile(type: DocType): DocumentFile {
  const meta = DEMO_FILES[type];
  return {
    id: `demo-${type}-${Date.now()}`,
    name: meta.name,
    size: 0,
    mimeType: meta.mimeType,
    url: meta.url,
  };
}

export function OcrStep() {
  const { documents, ocrDone, setOcrDone, setTomador, setVehicle, setDocState } = useWizardStore();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [preview, setPreview] = useState<{ file: DocumentFile; title: string } | null>(null);

  const requiredDocs: DocType[] = ['cedula', 'licencia', 'certificado'];
  const allRequiredDone = requiredDocs.every((d) => documents[d].status === 'done');

  useEffect(() => {
    if (allRequiredDone && !ocrDone) {
      const cedula = documents.cedula.ocr;
      if (cedula) {
        setTomador({
          nombre: cedula.nombre ?? '',
          apellido: cedula.apellido ?? '',
          identificacion: cedula.identificacion ?? '',
          tipoDoc: cedula.tipoDoc ?? 'V',
          fechaNac: cedula.fechaNacimiento ?? '',
          sexo: cedula.sexo ?? '',
          estadoCivil: cedula.estadoCivil ?? '',
        });
      }
      const cert = documents.certificado.ocr;
      if (cert) {
        setVehicle({
          placa: cert.placa ?? '',
          marca: cert.marca ?? '',
          modelo: cert.modelo ?? '',
          año: cert.año ?? '',
          color: cert.color ?? '',
          serial: cert.serial ?? '',
        });
      }
      setOcrDone(true);
    }
  }, [allRequiredDone, ocrDone, documents.cedula.ocr, documents.certificado.ocr, setTomador, setVehicle, setOcrDone]);

  const completedCount = requiredDocs.filter((d) => documents[d].status === 'done').length;
  const completionPct = (completedCount / requiredDocs.length) * 100;

  /**
   * Carga un documento demo con simulacion visual (uploading -> processing -> done).
   * NO realiza ninguna llamada de red: usa DEMO_OCR como fuente de datos.
   * Esto garantiza que los demos funcionen siempre, incluso si Gemini esta caido
   * o sin cuota.
   */
  async function loadDemoOne(type: DocType) {
    setDocState(type, { status: 'uploading', progress: 0, error: undefined });

    for (let p = 10; p <= 100; p += 18) {
      await new Promise((r) => setTimeout(r, 60));
      setDocState(type, { progress: p });
    }

    setDocState(type, { status: 'processing', progress: 100 });
    await new Promise((r) => setTimeout(r, 600));

    setDocState(type, {
      status: 'done',
      progress: 100,
      file: makeDemoFile(type),
      ocr: DEMO_OCR[type],
    });
  }

  async function loadAllDemos() {
    setLoadingDemo(true);
    try {
      const order: DocType[] = ['cedula', 'licencia', 'certificado', 'rif'];
      for (const t of order) {
        await loadDemoOne(t);
        await new Promise((r) => setTimeout(r, 200));
      }
      toast.success(
        'Documentos demo cargados',
        'Datos pre-cargados para que pruebes el flujo completo. Puedes editarlos en el siguiente paso.',
        4500
      );
    } catch (err) {
      console.error(err);
      toast.error('Error cargando demos', 'No se pudieron cargar los documentos de prueba.', 5000);
    } finally {
      setLoadingDemo(false);
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Hero stat */}
      <div className="mb-7 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 flex flex-col justify-center">
          <p className="text-slate-600 text-sm leading-relaxed">
            Carga tus documentos y los analizaremos con OCR para
            <span className="font-bold text-slate-800"> precargar la información</span> en el siguiente paso.
            Aceptamos JPG, PNG, SVG o PDF.
          </p>
        </div>
        <div className="relative bg-gradient-to-br from-indigo-50 via-violet-50/60 to-white border border-indigo-100 rounded-2xl p-4 overflow-hidden">
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-violet-500/10 blur-2xl" />
          <div className="relative flex items-end gap-3">
            <span className="text-5xl font-display font-black gradient-text-indigo leading-none">
              <AnimatedCounter value={completedCount} />
            </span>
            <div className="pb-1">
              <p className="text-xs text-slate-500 font-semibold leading-tight">
                de <span className="font-mono text-slate-700">3</span> obligatorios
              </p>
              <p className="text-[0.65rem] text-slate-400 mt-0.5">documentos verificados</p>
            </div>
          </div>
          {/* Mini progress */}
          <div className="mt-3 h-1 rounded-full bg-indigo-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500 ease-out"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Demo loader bar */}
      <div className="mb-5 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-violet-50/40 to-fuchsia-50/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center flex-shrink-0 shadow-[0_4px_14px_rgba(15, 26, 90,0.3)]">
            <Wand2 size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-slate-900 text-sm leading-tight">
              ¿No tienes documentos a la mano?
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Carga 4 documentos de muestra para probar el flujo completo en segundos.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href="/samples/cedula-demo.svg"
            download
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-white/70 transition-colors"
          >
            <Download size={12} />
            Descargar uno
          </a>
          <button
            type="button"
            onClick={loadAllDemos}
            disabled={loadingDemo}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white text-xs font-bold shadow-[0_8px_22px_rgba(15, 26, 90,0.32)] hover:shadow-[0_12px_28px_rgba(15, 26, 90,0.42)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:transform-none disabled:cursor-not-allowed"
          >
            {loadingDemo ? (
              <>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin-slow" />
                Cargando demos...
              </>
            ) : (
              <>
                <Sparkles size={13} />
                Cargar documentos demo
              </>
            )}
          </button>
        </div>
      </div>

      {/* Upload grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        {DOCS.map((doc) => (
          <UploadDocCard
            key={doc.type}
            config={doc}
            onOpenPreview={(file, title) => setPreview({ file, title })}
          />
        ))}
      </div>

      {/* OCR success banner */}
      {allRequiredDone && (
        <div className="mt-6 relative rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-[0_24px_48px_rgba(15, 26, 90,0.28)] animate-spring-in overflow-hidden">
          {/* Decorative bg */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-fuchsia-300/15 blur-3xl pointer-events-none" />

          <div className="relative p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md grid place-items-center flex-shrink-0 ring-1 ring-white/20">
                <Sparkles size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="font-display font-black text-base flex items-center gap-2">
                  Datos detectados automáticamente
                  <span className="text-[0.6rem] font-bold bg-white/20 backdrop-blur px-2 py-0.5 rounded-full tracking-wider">
                    OCR · IA
                  </span>
                </p>
                <p className="text-xs text-indigo-100 mt-0.5 leading-relaxed">
                  Hemos precargado la información en el siguiente paso. Podrás revisarla y editarla si es necesario.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Nombre', value: documents.cedula.ocr?.nombre },
                { label: 'Apellido', value: documents.cedula.ocr?.apellido },
                { label: 'Documento', value: `${documents.cedula.ocr?.tipoDoc ?? 'V'}-${documents.cedula.ocr?.identificacion ?? ''}` },
                { label: 'Placa', value: documents.certificado.ocr?.placa },
              ].map(({ label, value }, idx) =>
                value ? (
                  <div
                    key={label}
                    className="bg-white/12 backdrop-blur-sm rounded-xl p-3 border border-white/15 animate-fade-in"
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    <p className="text-[0.62rem] text-indigo-100/90 font-bold mb-1 uppercase tracking-wider">
                      {label}
                    </p>
                    <p className="text-sm font-bold text-white truncate font-mono">{value}</p>
                  </div>
                ) : null
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      <DocumentPreviewModal
        open={!!preview}
        file={preview?.file ?? null}
        title={preview?.title}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
