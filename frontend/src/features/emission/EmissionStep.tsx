import { Fragment, useState, useRef } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import { Field, Input, Select, Textarea } from '../../components/ui/FormField';
import { IdentityInput } from '../../components/ui/IdentityInput';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { useCatalogs, useCiudades } from '../../hooks/useCatalogs';
import { User, UserPlus, Heart, Wallet } from 'lucide-react';

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
  estado?: string;
  ciudad?: string;
  direccion?: string;
  // Asegurado
  aseg_nombre?: string;
  aseg_apellido?: string;
  aseg_identificacion?: string;
  // Pagador
  pag_nombre?: string;
  pag_apellido?: string;
  pag_identificacion?: string;
  pag_telefono?: string;
  // Beneficiario
  benef_nombre?: string;
  benef_apellido?: string;
  benef_identificacion?: string;
  benef_parentesco?: string;
}

const emailRe   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Limpia el telefono: solo digitos, maximo 11 */
function formatTelefono(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 11);
}

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
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validate = () => {
    const e: ValidationErrors = {};
    const req = (v?: string) => !(v ?? '').trim();

    // ── Tomador ───────────────────────────────────────────────────────────
    if (req(tomador.identificacion)) e.identificacion = 'La identificación es obligatoria';
    if (req(tomador.nombre))         e.nombre         = 'El nombre es obligatorio';
    if (req(tomador.apellido))       e.apellido       = 'El apellido es obligatorio';

    if (req(tomador.telefono)) {
      e.telefono = 'El teléfono es obligatorio';
    } else if (tomador.telefono.replace(/\D/g, '').length < 10) {
      e.telefono = 'Ingresa un teléfono válido (ej. 04121234567)';
    }

    if (req(tomador.email)) {
      e.email = 'El correo electrónico es obligatorio';
    } else if (!emailRe.test(tomador.email.trim())) {
      e.email = 'Ingresa un correo válido';
    }

    if (req(tomador.email2)) {
      e.email2 = 'Confirma tu correo electrónico';
    } else if (tomador.email.trim() !== tomador.email2.trim()) {
      e.email2 = 'Los correos no coinciden';
    }

    if (req(tomador.fechaNac)) e.fechaNac  = 'La fecha de nacimiento es obligatoria';
    if (req(tomador.sexo))     e.sexo      = 'Selecciona el sexo';
    if (req(tomador.estado))   e.estado    = 'El estado es obligatorio';
    if (req(tomador.ciudad))   e.ciudad    = 'La ciudad es obligatoria';
    if (req(tomador.direccion)) e.direccion = 'La dirección es obligatoria';

    // ── Asegurado (solo si está habilitado) ───────────────────────────────
    if (!sameInsured) {
      if (req(asegurado.nombre))        e.aseg_nombre        = 'El nombre es obligatorio';
      if (req(asegurado.apellido))      e.aseg_apellido      = 'El apellido es obligatorio';
      if (req(asegurado.identificacion)) e.aseg_identificacion = 'La identificación es obligatoria';
    }

    // ── Pagador (solo si NO eres quien paga) ──────────────────────────────
    if (differentPayer) {
      if (req(pagador.nombre))         e.pag_nombre         = 'El nombre del pagador es obligatorio';
      if (req(pagador.apellido))       e.pag_apellido       = 'El apellido del pagador es obligatorio';
      if (req(pagador.identificacion)) e.pag_identificacion = 'La identificación del pagador es obligatoria';
      if (req(pagador.telefono)) {
        e.pag_telefono = 'El teléfono del pagador es obligatorio';
      } else if ((pagador.telefono ?? '').replace(/\D/g, '').length < 10) {
        e.pag_telefono = 'Ingresa un teléfono válido (ej. 04121234567)';
      }
    }

    // ── Beneficiario (solo si está habilitado) ────────────────────────────
    if (hasBeneficiary) {
      if (req(beneficiario.nombre))        e.benef_nombre        = 'El nombre es obligatorio';
      if (req(beneficiario.apellido))      e.benef_apellido      = 'El apellido es obligatorio';
      if (req(beneficiario.identificacion)) e.benef_identificacion = 'La identificación es obligatoria';
      if (req(beneficiario.parentesco))    e.benef_parentesco    = 'El parentesco es obligatorio';
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
      <Field label="Teléfono *" error={errors.telefono} hint="Solo dígitos, ej. 04121234567">
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
      <Field label="Estado civil">
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
              <Field label="Correo electrónico (opcional)" full>
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

        {/* Asegurado — oculto a pedido del cliente. En la práctica el tomador
            siempre es el asegurado. Conservamos el código para reactivar a futuro
            sin volver a escribirlo (mismo patrón que "Beneficiario" más abajo). */}
        {false && (
        <SectionCard
          Icon={UserPlus}
          title="¿El seguro es para ti?"
          description="El seguro puede ser para ti o para otra persona. Aquí lo defines."
        >
          <ToggleSwitch
            checked={sameInsured}
            onChange={setSameInsured}
            label="Sí, el seguro es para mí"
            description="Usaremos los datos que ya llenaste arriba. No hay nada más que hacer en esta sección."
          />

          {!sameInsured && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
              <Field label="Nombre *" error={errors.aseg_nombre}>
                <Input
                  value={asegurado.nombre}
                  onChange={(e) => setAsegurado({ nombre: onlyLetters(e.target.value) })}
                  placeholder="Nombre de la otra persona"
                />
              </Field>
              <Field label="Apellido *" error={errors.aseg_apellido}>
                <Input
                  value={asegurado.apellido}
                  onChange={(e) => setAsegurado({ apellido: onlyLetters(e.target.value) })}
                  placeholder="Apellido de la otra persona"
                />
              </Field>
              <Field label="Cédula o documento *" error={errors.aseg_identificacion}>
                <Input
                  value={asegurado.identificacion}
                  onChange={(e) => setAsegurado({ identificacion: e.target.value.replace(/[^0-9A-Za-z]/g, '') })}
                  placeholder="Número de identificación"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Fecha de nacimiento">
                <Input value={asegurado.fechaNac ?? ''} onChange={(e) => setAsegurado({ fechaNac: e.target.value })} type="date" />
              </Field>
            </div>
          )}
        </SectionCard>
        )}

        {/* Beneficiario — oculto temporalmente, conservar codigo */}
        {false && (
        <SectionCard
          Icon={Heart}
          title="Beneficiario"
          description="Persona que recibe beneficios en caso de siniestro"
        >
          <ToggleSwitch
            checked={hasBeneficiary}
            onChange={setHasBeneficiary}
            label="Agregar un beneficiario"
            description="Registra a una persona que reciba los beneficios relacionados con la póliza."
          />

          {hasBeneficiary && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
              <Field label="Nombre *" error={errors.benef_nombre}>
                <Input
                  value={beneficiario.nombre}
                  onChange={(e) => setBeneficiario({ nombre: onlyLetters(e.target.value) })}
                  placeholder="Nombre del beneficiario"
                />
              </Field>
              <Field label="Apellido *" error={errors.benef_apellido}>
                <Input
                  value={beneficiario.apellido}
                  onChange={(e) => setBeneficiario({ apellido: onlyLetters(e.target.value) })}
                  placeholder="Apellido del beneficiario"
                />
              </Field>
              <Field label="Documento *" error={errors.benef_identificacion}>
                <Input
                  value={beneficiario.identificacion}
                  onChange={(e) => setBeneficiario({ identificacion: e.target.value.replace(/[^0-9A-Za-z]/g, '') })}
                  placeholder="Identificación"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Parentesco *" error={errors.benef_parentesco}>
                <Select
                  value={beneficiario.parentesco ?? ''}
                  onChange={(e) => setBeneficiario({ parentesco: e.target.value })}
                >
                  <option value="">— Seleccionar —</option>
                  {catalogs.parentescos.length > 0
                    ? catalogs.parentescos.map((p) => (
                        <option key={String(p.code)} value={String(p.label)}>{p.label}</option>
                      ))
                    : (
                      <>
                        <option value="Cónyuge">Cónyuge</option>
                        <option value="Hijo(a)">Hijo(a)</option>
                        <option value="Padre / Madre">Padre / Madre</option>
                        <option value="Hermano(a)">Hermano(a)</option>
                        <option value="Otro">Otro</option>
                      </>
                    )}
                </Select>
              </Field>
            </div>
          )}
        </SectionCard>
        )}
      </div>
    </div>
  );
}
