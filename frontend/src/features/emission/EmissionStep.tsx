import { Fragment, useState, useRef } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import { Field, Input, Textarea } from '../../components/ui/FormField';
import { IdentityInput } from '../../components/ui/IdentityInput';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { useCatalogs, useCiudades } from '../../hooks/useCatalogs';
import { User, UserPlus, Heart, Wallet, ShieldAlert } from 'lucide-react';
import { formatTelefono, isValidPhonePrefix } from '@exelixi/shared';


export function SectionCard({
  title,
  description,
  Icon,
  children,
  statusLabel,
  statusTone = 'neutral',
}: {
  title: string;
  description?: string;
  Icon: React.ElementType;
  children: React.ReactNode;
  statusLabel?: string;
  statusTone?: 'neutral' | 'warning' | 'success';
}) {
  const toneClasses =
    statusTone === 'warning'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : statusTone === 'success'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 transition-colors">
      <div className="flex items-start gap-3 p-4 sm:p-5 pb-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center flex-shrink-0 shadow-[0_4px_14px_rgba(15, 26, 90,0.3)]">
          <Icon size={16} className="text-white" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-slate-900 text-[0.95rem] leading-tight">{title}</h3>
          {description && (
            <p className="text-[0.78rem] text-slate-500 mt-1 leading-relaxed">{description}</p>
          )}
        </div>
        {statusLabel && (
          <div className="flex-shrink-0">
            <span
              className={`inline-flex items-center px-2 py-1 rounded-md border text-[0.6rem] font-bold uppercase tracking-wider ${toneClasses}`}
            >
              {statusLabel}
            </span>
          </div>
        )}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

interface ValidationErrors {
  nombre?: string;
  apellido?: string;
  identificacion?: string;
  telefono?: string;
  email?: string;
  email2?: string;
  fechaNac?: string;
  sexo?: string;
  estadoCivil?: string;
  estado?: string;
  ciudad?: string;
  direccion?: string;
  // Pagador
  pag_nombre?: string;
  pag_apellido?: string;
  pag_identificacion?: string;
  pag_telefono?: string;
  pag_email?: string;
  // Asegurado
  aseg_nombre?: string;
  aseg_apellido?: string;
  aseg_identificacion?: string;
  aseg_telefono?: string;
  aseg_email?: string;
  aseg_sexo?: string;
  aseg_estadoCivil?: string;
  aseg_estado?: string;
  aseg_ciudad?: string;
  aseg_direccion?: string;
  // Beneficiario
  benef_nombre?: string;
  benef_apellido?: string;
  benef_identificacion?: string;
  benef_telefono?: string;
  benef_email?: string;
  benef_sexo?: string;
  benef_estadoCivil?: string;
  benef_estado?: string;
  benef_ciudad?: string;
  benef_direccion?: string;
}

const emailRe   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Solo letras, tildes, ñ y espacios */
function onlyLetters(v: string): string {
  return v.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]/g, '');
}

export function EmissionStep() {
  const {
    tomador, setTomador,
    sameInsured, setSameInsured,
    asegurado, setAsegurado,
    differentPayer, setDifferentPayer,
    pagador, setPagador,
    hasBeneficiary, setHasBeneficiary,
    beneficiario, setBeneficiario,
  } = useWizardStore();

  const catalogs = useCatalogs();
  const ciudadesState = useCiudades(tomador.cestado);
  const aseguradoCiudades = useCiudades(asegurado.cestado);
  const beneficiarioCiudades = useCiudades(beneficiario.cestado);
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validate = () => {
    const e: ValidationErrors = {};
    const req  = (v?: string) => !(v ?? '').trim();
    const len  = (v?: string) => (v ?? '').trim().length;
    const digs = (v?: string) => (v ?? '').replace(/\D/g, '').length;

    // ── Tomador ───────────────────────────────────────────────────────────
    if (req(tomador.identificacion)) {
      e.identificacion = 'La identificación es obligatoria';
    } else if (digs(tomador.identificacion) < 6) {
      e.identificacion = 'La identificación debe tener al menos 6 dígitos';
    } else if (digs(tomador.identificacion) > 9) {
      e.identificacion = 'La identificación no puede tener más de 9 dígitos';
    }

    if (req(tomador.nombre)) {
      e.nombre = 'El nombre es obligatorio';
    } else if (len(tomador.nombre) < 2) {
      e.nombre = 'El nombre debe tener al menos 2 caracteres';
    } else if (len(tomador.nombre) > 50) {
      e.nombre = 'El nombre no puede superar 50 caracteres';
    }

    if (req(tomador.apellido)) {
      e.apellido = 'El apellido es obligatorio';
    } else if (len(tomador.apellido) < 2) {
      e.apellido = 'El apellido debe tener al menos 2 caracteres';
    } else if (len(tomador.apellido) > 50) {
      e.apellido = 'El apellido no puede superar 50 caracteres';
    }

    if (req(tomador.sexo))       e.sexo        = 'Selecciona el sexo';
    if (req(tomador.estadoCivil)) e.estadoCivil = 'Selecciona el estado civil';

    if (req(tomador.telefono)) {
      e.telefono = 'El teléfono es obligatorio';
    } else if (digs(tomador.telefono) !== 11) {
      e.telefono = 'El teléfono debe tener exactamente 11 dígitos (ej. 04121234567)';
    } else if (!isValidPhonePrefix(tomador.telefono || '')) {
      e.telefono = 'El prefijo debe ser válido en Venezuela (ej. 0414, 0412, 0212)';
    }

    if (req(tomador.email)) {
      e.email = 'El correo electrónico es obligatorio';
    } else if (len(tomador.email) < 5) {
      e.email = 'El correo debe tener al menos 5 caracteres';
    } else if (len(tomador.email) > 50) {
      e.email = 'El correo no puede superar 50 caracteres';
    } else if (!emailRe.test(tomador.email.trim())) {
      e.email = 'Ingresa un correo válido (ej. usuario@dominio.com)';
    }

    if (req(tomador.email2)) {
      e.email2 = 'Confirma tu correo electrónico';
    } else if (!emailRe.test(tomador.email2.trim())) {
      e.email2 = 'Ingresa un correo válido para confirmar';
    } else if (tomador.email.trim() !== tomador.email2.trim()) {
      e.email2 = 'Los correos no coinciden';
    }

    if (req(tomador.fechaNac)) e.fechaNac = 'La fecha de nacimiento es obligatoria';
    if (req(tomador.estado))   e.estado   = 'El estado es obligatorio';
    if (req(tomador.ciudad))   e.ciudad   = 'La ciudad es obligatoria';

    if (req(tomador.direccion)) {
      e.direccion = 'La dirección es obligatoria';
    } else if (len(tomador.direccion) < 5) {
      e.direccion = 'La dirección debe tener al menos 5 caracteres';
    } else if (len(tomador.direccion) > 200) {
      e.direccion = 'La dirección no puede superar 200 caracteres';
    }

    // ── Asegurado (solo si está habilitado) ───────────────────────────────
    if (!sameInsured) {
      if (req(asegurado.nombre))         e.aseg_nombre         = 'El nombre es obligatorio';
      if (req(asegurado.apellido))       e.aseg_apellido       = 'El apellido es obligatorio';
      if (req(asegurado.identificacion)) e.aseg_identificacion = 'La identificación es obligatoria';
      if (req(asegurado.telefono))       e.aseg_telefono       = 'El teléfono es obligatorio';
      if (req(asegurado.sexo))           e.aseg_sexo           = 'El sexo es obligatorio';
      if (req(asegurado.estadoCivil))    e.aseg_estadoCivil    = 'El estado civil es obligatorio';
      if (req(asegurado.estado))         e.aseg_estado         = 'El estado es obligatorio';
      if (req(asegurado.ciudad))         e.aseg_ciudad         = 'La ciudad es obligatoria';
      if (req(asegurado.direccion))      e.aseg_direccion      = 'La dirección es obligatoria';
    }

    // ── Pagador (solo si NO eres quien paga) ──────────────────────────────
    if (differentPayer) {
      if (req(pagador.nombre)) {
        e.pag_nombre = 'El nombre del pagador es obligatorio';
      } else if (len(pagador.nombre) < 2) {
        e.pag_nombre = 'El nombre debe tener al menos 2 caracteres';
      }

      if (req(pagador.apellido)) {
        e.pag_apellido = 'El apellido del pagador es obligatorio';
      } else if (len(pagador.apellido) < 2) {
        e.pag_apellido = 'El apellido debe tener al menos 2 caracteres';
      }

      if (req(pagador.identificacion)) {
        e.pag_identificacion = 'La identificación del pagador es obligatoria';
      } else if (digs(pagador.identificacion) < 6) {
        e.pag_identificacion = 'La identificación debe tener al menos 6 dígitos';
      }

      if (req(pagador.telefono)) {
        e.pag_telefono = 'El teléfono del pagador es obligatorio';
      } else if (digs(pagador.telefono) !== 11) {
        e.pag_telefono = 'El teléfono debe tener exactamente 11 dígitos (ej. 04121234567)';
      } else if (!isValidPhonePrefix(pagador.telefono || '')) {
        e.pag_telefono = 'El prefijo debe ser válido en Venezuela (ej. 0414, 0412, 0212)';
      }

      const pagEmail = (pagador.email ?? '').trim();
      if (pagEmail && !emailRe.test(pagEmail)) {
        e.pag_email = 'Ingresa un correo válido o deja el campo vacío';
      }
    }

    // ── Beneficiario (solo si está habilitado) ────────────────────────────
    if (hasBeneficiary) {
      if (req(beneficiario.nombre))         e.benef_nombre         = 'El nombre es obligatorio';
      if (req(beneficiario.apellido))       e.benef_apellido       = 'El apellido es obligatorio';
      if (req(beneficiario.identificacion)) e.benef_identificacion = 'La identificación es obligatoria';
      if (req(beneficiario.telefono))       e.benef_telefono       = 'El teléfono es obligatorio';
      if (req(beneficiario.sexo))           e.benef_sexo           = 'El sexo es obligatorio';
      if (req(beneficiario.estadoCivil))    e.benef_estadoCivil    = 'El estado civil es obligatorio';
      if (req(beneficiario.estado))         e.benef_estado         = 'El estado es obligatorio';
      if (req(beneficiario.ciudad))         e.benef_ciudad         = 'La ciudad es obligatoria';
      if (req(beneficiario.direccion))      e.benef_direccion      = 'La dirección es obligatoria';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Orden fijo de campos ────────────────────────────────────────────────
  // Se calcula UNA SOLA VEZ al montar (con datos OCR que ya estaban pre-
  // cargados). De esta forma los campos nunca saltan de posición mientras
  // el usuario escribe. Si el campo estaba lleno al abrir → va arriba;
  // si estaba vacío → va abajo. Esa posición no vuelve a cambiar.
  const has = (v?: string) => Boolean((v ?? '').trim());
  const initialOrderRef = useRef<string[] | null>(null);
  if (initialOrderRef.current === null) {
    const ALL_KEYS = [
      'identificacion', 'nombre', 'apellido', 'telefono',
      'email', 'email2', 'fechaNac', 'sexo', 'estadoCivil',
      'estado', 'ciudad', 'direccion',
    ];
    const filled  = ALL_KEYS.filter((k) => {
      if (k === 'email2') return has(tomador.email);
      return has((tomador as unknown as Record<string, string>)[k]);
    });
    const unfilled = ALL_KEYS.filter((k) => !filled.includes(k));
    initialOrderRef.current = [...filled, ...unfilled];
  }
  const fieldOrder = initialOrderRef.current;

  (window as unknown as Record<string, unknown>).__validateStep2 = validate;

  // ── Mapa de campos del tomador ────────────────────────────────────────
  const tomadorFieldMap: Record<string, React.ReactNode> = {
    identificacion: (
      <Field label="Identificación *" error={errors.identificacion}>
        <IdentityInput
          tipoDoc={tomador.tipoDoc}
          identificacion={tomador.identificacion}
          onTipoDocChange={(v) => setTomador({ tipoDoc: v })}
          onIdentificacionChange={(v) => setTomador({ identificacion: v })}
        />
      </Field>
    ),
    nombre: (
      <Field label="Nombre *" error={errors.nombre}>
        <Input
          value={tomador.nombre}
          onChange={(e) => setTomador({ nombre: onlyLetters(e.target.value) })}
          placeholder="Nombre"
          autoComplete="given-name"
        />
      </Field>
    ),
    apellido: (
      <Field label="Apellido *" error={errors.apellido}>
        <Input
          value={tomador.apellido}
          onChange={(e) => setTomador({ apellido: onlyLetters(e.target.value) })}
          placeholder="Apellido"
          autoComplete="family-name"
        />
      </Field>
    ),
    telefono: (
      <Field label="Teléfono *" error={errors.telefono} hint="Exactamente 11 dígitos, ej. 04121234567">
        <Input
          value={tomador.telefono}
          onChange={(e) => setTomador({ telefono: formatTelefono(e.target.value) })}
          placeholder="04121234567"
          type="tel"
          inputMode="numeric"
          maxLength={11}
        />
      </Field>
    ),
    email: (
      <Field label="Correo electrónico *" error={errors.email}>
        <Input
          value={tomador.email}
          onChange={(e) => setTomador({ email: e.target.value })}
          placeholder="correo@ejemplo.com"
          type="email"
          inputMode="email"
        />
      </Field>
    ),
    email2: (
      <Field label="Repite tu correo *" error={errors.email2}>
        <Input
          value={tomador.email2}
          onChange={(e) => setTomador({ email2: e.target.value })}
          placeholder="Escribe el correo otra vez"
          type="email"
          inputMode="email"
        />
      </Field>
    ),
    fechaNac: (
      <Field label="Fecha de nacimiento *" error={errors.fechaNac}>
        <Input
          value={tomador.fechaNac}
          onChange={(e) => setTomador({ fechaNac: e.target.value })}
          type="date"
          max={new Date().toISOString().split('T')[0]}
        />
      </Field>
    ),
    sexo: (
      <Field label="Sexo *" error={errors.sexo}>
        <SearchSelect
          value={tomador.sexo}
          options={
            catalogs.sexos.length > 0
              ? catalogs.sexos.map((s) => ({ value: String(s.label), label: s.label }))
              : [
                  { value: 'Femenino',  label: 'Femenino'  },
                  { value: 'Masculino', label: 'Masculino' },
                ]
          }
          onChange={(value) => setTomador({ sexo: value })}
          placeholder="— Seleccionar —"
          loading={catalogs.loading}
        />
      </Field>
    ),
    estadoCivil: (
      <Field label="Estado civil *" error={errors.estadoCivil}>
        <SearchSelect
          value={tomador.estadoCivil}
          options={
            catalogs.estadosCivil.length > 0
              ? catalogs.estadosCivil.map((s) => ({ value: String(s.label), label: s.label }))
              : [
                  { value: 'Soltero(a)',     label: 'Soltero(a)'     },
                  { value: 'Casado(a)',      label: 'Casado(a)'      },
                  { value: 'Divorciado(a)',  label: 'Divorciado(a)'  },
                  { value: 'Viudo(a)',       label: 'Viudo(a)'       },
                ]
          }
          onChange={(value) => setTomador({ estadoCivil: value })}
          placeholder="— Seleccionar —"
          loading={catalogs.loading}
        />
      </Field>
    ),
    estado: (
      <Field label="Estado donde vives *" error={errors.estado}>
        <SearchSelect
          value={tomador.cestado}
          options={catalogs.estados.map((s) => ({ value: String(s.code), label: s.label }))}
          onChange={(code, label) => {
            setTomador({
              estado : label,
              cestado: code ? Number(code) : undefined,
              ciudad : '',
              cciudad: undefined,
            });
          }}
          placeholder="Escribe para buscar tu estado…"
          loading={catalogs.loading}
        />
      </Field>
    ),
    ciudad: (
      <Field
        label="Ciudad donde vives *"
        error={errors.ciudad}
        hint={tomador.cestado ? 'Escribe para filtrar la ciudad' : 'Selecciona primero el estado'}
      >
        <SearchSelect
          value={tomador.cciudad}
          options={ciudadesState.ciudades.map((c) => ({ value: String(c.code), label: c.label }))}
          onChange={(code, label) => {
            setTomador({
              ciudad : label,
              cciudad: code ? Number(code) : undefined,
            });
          }}
          placeholder={tomador.cestado ? 'Escribe para buscar la ciudad…' : 'Selecciona primero el estado'}
          disabled={!tomador.cestado}
          loading={ciudadesState.loading}
        />
      </Field>
    ),
    direccion: (
      <Field label="Tu dirección completa *" error={errors.direccion} full>
        <Textarea
          value={tomador.direccion}
          onChange={(e) => setTomador({ direccion: e.target.value })}
          placeholder="Calle, urbanización, municipio..."
          rows={3}
        />
      </Field>
    ),
  };

  return (
    <div className="animate-fade-in">
      <div className="space-y-5">
        {/* Tomador */}
        <SectionCard
          Icon={User}
          title="Tus datos personales"
          description="Necesitamos saber quién está contratando el seguro"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fieldOrder.map((key) => (
              <Fragment key={key}>{tomadorFieldMap[key]}</Fragment>
            ))}
          </div>
        </SectionCard>

        {/* Persona Políticamente Expuesta — declaración legal requerida por La Mundial */}
        <SectionCard
          Icon={ShieldAlert}
          title="Declaración legal"
          description="Requerida por la Superintendencia de la Actividad Aseguradora (SUDEASEG)"
        >
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-800 leading-relaxed mb-4">
            <strong>¿Qué es una Persona Políticamente Expuesta (PPE)?</strong> Es aquella que desempeña o ha desempeñado
            funciones públicas prominentes (cargos de gobierno, altos funcionarios, directivos de empresas estatales,
            diplomáticos, etc.) en Venezuela o en el extranjero, en los últimos 5 años.
          </div>
          <ToggleSwitch
            checked={tomador.personaPoliticamenteExpuesta}
            onChange={(v) => setTomador({ personaPoliticamenteExpuesta: v })}
            label="Soy una Persona Políticamente Expuesta (PPE)"
            description="Declaro que ejerzo o he ejercido funciones públicas prominentes en los últimos 5 años."
          />
        </SectionCard>

        {/* Pagador */}
        <SectionCard
          Icon={Wallet}
          title="¿Eres quien paga la póliza?"
          description="Si otra persona pagará por ti, registramos sus datos para asociarlos al pago."
        >
          <ToggleSwitch
            checked={!differentPayer}
            onChange={(v) => setDifferentPayer(!v)}
            label="Sí, yo voy a pagar la póliza"
            description="Usaremos los datos personales que llenaste arriba para asociar el pago."
          />

          {differentPayer && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
              <Field label="Nombre del pagador *" error={errors.pag_nombre}>
                <Input
                  value={pagador.nombre}
                  onChange={(e) => setPagador({ nombre: onlyLetters(e.target.value) })}
                  placeholder="Nombre"
                />
              </Field>
              <Field label="Apellido del pagador *" error={errors.pag_apellido}>
                <Input
                  value={pagador.apellido}
                  onChange={(e) => setPagador({ apellido: onlyLetters(e.target.value) })}
                  placeholder="Apellido"
                />
              </Field>
              <Field label="Cédula o documento *" error={errors.pag_identificacion}>
                <IdentityInput
                  tipoDoc={pagador.tipoDoc ?? 'V'}
                  identificacion={pagador.identificacion}
                  onTipoDocChange={(v) => setPagador({ tipoDoc: v })}
                  onIdentificacionChange={(v) => setPagador({ identificacion: v })}
                />
              </Field>
              <Field label="Teléfono del pagador *" error={errors.pag_telefono} hint="Solo dígitos, ej. 04121234567">
                <Input
                  value={pagador.telefono ?? ''}
                  onChange={(e) => setPagador({ telefono: formatTelefono(e.target.value) })}
                  placeholder="04121234567"
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                />
              </Field>
              <Field label="Correo electrónico (opcional)" error={errors.pag_email} full>
                <Input
                  value={pagador.email ?? ''}
                  onChange={(e) => setPagador({ email: e.target.value })}
                  placeholder="correo@ejemplo.com"
                  type="email"
                  inputMode="email"
                />
              </Field>
            </div>
          )}
        </SectionCard>

        {true && (
        <SectionCard
          Icon={UserPlus}
          title="Datos de la persona que será asegurada (Titular)"
          description="Completa la información de la persona asegurada."
        >
          <ToggleSwitch
            checked={!sameInsured}
            onChange={(v) => setSameInsured(!v)}
            label="¿La persona que pagará la Póliza es diferente a la que será asegurada?"
          />

          {!sameInsured && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
              <Field label="Cédula o documento *" error={errors.aseg_identificacion}>
                <IdentityInput
                  tipoDoc={asegurado.tipoDoc ?? 'V'}
                  identificacion={asegurado.identificacion}
                  onTipoDocChange={(v) => setAsegurado({ tipoDoc: v })}
                  onIdentificacionChange={(v) => setAsegurado({ identificacion: v })}
                />
              </Field>
              <div className="hidden sm:block"></div>
              <Field label="Nombre *" error={errors.aseg_nombre}>
                <Input value={asegurado.nombre} onChange={(e) => setAsegurado({ nombre: onlyLetters(e.target.value) })} placeholder="Nombre" />
              </Field>
              <Field label="Apellido *" error={errors.aseg_apellido}>
                <Input value={asegurado.apellido} onChange={(e) => setAsegurado({ apellido: onlyLetters(e.target.value) })} placeholder="Apellido" />
              </Field>
              <Field label="Teléfono *" error={errors.aseg_telefono}>
                <Input value={asegurado.telefono ?? ''} onChange={(e) => setAsegurado({ telefono: formatTelefono(e.target.value) })} placeholder="04121234567" type="tel" maxLength={11} />
              </Field>
              <Field label="Correo electrónico" error={errors.aseg_email}>
                <Input value={asegurado.email ?? ''} onChange={(e) => setAsegurado({ email: e.target.value })} placeholder="correo@ejemplo.com" type="email" />
              </Field>
              <Field label="Estado donde vive *" error={errors.aseg_estado}>
                <SearchSelect
                  value={asegurado.cestado}
                  options={catalogs.estados.map((s) => ({ value: String(s.code), label: s.label }))}
                  onChange={(code, label) => setAsegurado({ estado: label, cestado: code ? Number(code) : undefined, ciudad: '', cciudad: undefined })}
                  placeholder="Escribe para buscar estado..." loading={catalogs.loading}
                />
              </Field>
              <Field label="Ciudad donde vive *" error={errors.aseg_ciudad} hint={asegurado.cestado ? '' : 'Selecciona primero el estado'}>
                <SearchSelect
                  value={asegurado.cciudad}
                  options={aseguradoCiudades.ciudades.map((c) => ({ value: String(c.code), label: c.label }))}
                  onChange={(code, label) => setAsegurado({ ciudad: label, cciudad: code ? Number(code) : undefined })}
                  placeholder={asegurado.cestado ? 'Escribe para buscar ciudad...' : 'Selecciona primero el estado'}
                  disabled={!asegurado.cestado} loading={aseguradoCiudades.loading}
                />
              </Field>
              <Field label="Fecha de nacimiento *">
                <Input value={asegurado.fechaNac ?? ''} onChange={(e) => setAsegurado({ fechaNac: e.target.value })} type="date" />
              </Field>
              <Field label="Sexo *" error={errors.aseg_sexo}>
                <SearchSelect
                  value={asegurado.sexo}
                  options={catalogs.sexos.length > 0 ? catalogs.sexos.map((s) => ({ value: String(s.label), label: s.label })) : [{ value: 'Femenino', label: 'Femenino' }, { value: 'Masculino', label: 'Masculino' }]}
                  onChange={(value) => setAsegurado({ sexo: value })} placeholder="— Seleccionar —" loading={catalogs.loading}
                />
              </Field>
              <Field label="Estado civil *" error={errors.aseg_estadoCivil}>
                <SearchSelect
                  value={asegurado.estadoCivil}
                  options={catalogs.estadosCivil.length > 0 ? catalogs.estadosCivil.map((s) => ({ value: String(s.label), label: s.label })) : [{ value: 'Soltero(a)', label: 'Soltero(a)' }, { value: 'Casado(a)', label: 'Casado(a)' }, { value: 'Divorciado(a)', label: 'Divorciado(a)' }, { value: 'Viudo(a)', label: 'Viudo(a)' }]}
                  onChange={(value) => setAsegurado({ estadoCivil: value })} placeholder="— Seleccionar —" loading={catalogs.loading}
                />
              </Field>
              <div className="hidden sm:block"></div>
              <Field label="Dirección *" error={errors.aseg_direccion} full>
                <Textarea value={asegurado.direccion ?? ''} onChange={(e) => setAsegurado({ direccion: e.target.value })} placeholder="Dirección completa" rows={2} />
              </Field>
            </div>
          )}
        </SectionCard>
        )}

        {true && (
        <SectionCard
          Icon={Heart}
          title="Datos del Beneficiario Preferencial"
          description="Persona que recibe beneficios en caso de siniestro"
        >
          <ToggleSwitch
            checked={hasBeneficiary}
            onChange={setHasBeneficiary}
            label="¿Desea agregar un beneficiario preferencial a la póliza?"
          />

          {hasBeneficiary && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
              <Field label="Cédula o documento *" error={errors.benef_identificacion}>
                <IdentityInput
                  tipoDoc={beneficiario.tipoDoc ?? 'V'}
                  identificacion={beneficiario.identificacion}
                  onTipoDocChange={(v) => setBeneficiario({ tipoDoc: v })}
                  onIdentificacionChange={(v) => setBeneficiario({ identificacion: v })}
                />
              </Field>
              <div className="hidden sm:block"></div>
              <Field label="Nombre *" error={errors.benef_nombre}>
                <Input value={beneficiario.nombre} onChange={(e) => setBeneficiario({ nombre: onlyLetters(e.target.value) })} placeholder="Nombre" />
              </Field>
              <Field label="Apellido *" error={errors.benef_apellido}>
                <Input value={beneficiario.apellido} onChange={(e) => setBeneficiario({ apellido: onlyLetters(e.target.value) })} placeholder="Apellido" />
              </Field>
              <Field label="Teléfono *" error={errors.benef_telefono}>
                <Input value={beneficiario.telefono ?? ''} onChange={(e) => setBeneficiario({ telefono: formatTelefono(e.target.value) })} placeholder="04121234567" type="tel" maxLength={11} />
              </Field>
              <Field label="Correo electrónico" error={errors.benef_email}>
                <Input value={beneficiario.email ?? ''} onChange={(e) => setBeneficiario({ email: e.target.value })} placeholder="correo@ejemplo.com" type="email" />
              </Field>
              <Field label="Estado *" error={errors.benef_estado}>
                <SearchSelect
                  value={beneficiario.cestado}
                  options={catalogs.estados.map((s) => ({ value: String(s.code), label: s.label }))}
                  onChange={(code, label) => setBeneficiario({ estado: label, cestado: code ? Number(code) : undefined, ciudad: '', cciudad: undefined })}
                  placeholder="Escribe para buscar estado..." loading={catalogs.loading}
                />
              </Field>
              <Field label="Ciudad *" error={errors.benef_ciudad} hint={beneficiario.cestado ? '' : 'Selecciona primero el estado'}>
                <SearchSelect
                  value={beneficiario.cciudad}
                  options={beneficiarioCiudades.ciudades.map((c) => ({ value: String(c.code), label: c.label }))}
                  onChange={(code, label) => setBeneficiario({ ciudad: label, cciudad: code ? Number(code) : undefined })}
                  placeholder={beneficiario.cestado ? 'Escribe para buscar ciudad...' : 'Selecciona primero el estado'}
                  disabled={!beneficiario.cestado} loading={beneficiarioCiudades.loading}
                />
              </Field>
              <Field label="Fecha de nacimiento *">
                <Input value={beneficiario.fechaNac ?? ''} onChange={(e) => setBeneficiario({ fechaNac: e.target.value })} type="date" />
              </Field>
              <Field label="Sexo *" error={errors.benef_sexo}>
                <SearchSelect
                  value={beneficiario.sexo}
                  options={catalogs.sexos.length > 0 ? catalogs.sexos.map((s) => ({ value: String(s.label), label: s.label })) : [{ value: 'Femenino', label: 'Femenino' }, { value: 'Masculino', label: 'Masculino' }]}
                  onChange={(value) => setBeneficiario({ sexo: value })} placeholder="— Seleccionar —" loading={catalogs.loading}
                />
              </Field>
              <Field label="Estado civil *" error={errors.benef_estadoCivil}>
                <SearchSelect
                  value={beneficiario.estadoCivil}
                  options={catalogs.estadosCivil.length > 0 ? catalogs.estadosCivil.map((s) => ({ value: String(s.label), label: s.label })) : [{ value: 'Soltero(a)', label: 'Soltero(a)' }, { value: 'Casado(a)', label: 'Casado(a)' }, { value: 'Divorciado(a)', label: 'Divorciado(a)' }, { value: 'Viudo(a)', label: 'Viudo(a)' }]}
                  onChange={(value) => setBeneficiario({ estadoCivil: value })} placeholder="— Seleccionar —" loading={catalogs.loading}
                />
              </Field>
              <div className="hidden sm:block"></div>
              <Field label="Dirección *" error={errors.benef_direccion} full>
                <Textarea value={beneficiario.direccion ?? ''} onChange={(e) => setBeneficiario({ direccion: e.target.value })} placeholder="Dirección completa" rows={2} />
              </Field>
            </div>
          )}
        </SectionCard>
        )}
      </div>
    </div>
  );
}
