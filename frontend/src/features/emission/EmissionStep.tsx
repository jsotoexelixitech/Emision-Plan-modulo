import { useState } from 'react';
import { useWizardStore } from '../../store/wizardStore';
import { Field, Input, Textarea } from '../../components/ui/FormField';
import { IdentityInput } from '../../components/ui/IdentityInput';
import { ToggleSwitch } from '../../components/ui/ToggleSwitch';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { useCatalogs, useCiudades } from '../../hooks/useCatalogs';
import { User, Heart, ShieldAlert, FileText } from 'lucide-react';
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
  [key: string]: string;
}

const emailRe   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function onlyLetters(v: string): string {
  return v.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]/g, '');
}

export function EmissionStep() {
  const {
    tomador, setTomador,
    sameInsured, setSameInsured,
    asegurado, setAsegurado,
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

    const validatePerson = (person: any, prefix: string) => {
      if (req(person.identificacion)) {
        e[`${prefix}identificacion`] = 'La identificación es obligatoria';
      } else if (digs(person.identificacion) < 6) {
        e[`${prefix}identificacion`] = 'La identificación debe tener al menos 6 dígitos';
      } else if (digs(person.identificacion) > 9) {
        e[`${prefix}identificacion`] = 'La identificación no puede tener más de 9 dígitos';
      }

      if (req(person.nombre)) {
        e[`${prefix}nombre`] = 'El nombre es obligatorio';
      } else if (len(person.nombre) < 2) {
        e[`${prefix}nombre`] = 'El nombre debe tener al menos 2 caracteres';
      }

      if (req(person.apellido)) {
        e[`${prefix}apellido`] = 'El apellido es obligatorio';
      } else if (len(person.apellido) < 2) {
        e[`${prefix}apellido`] = 'El apellido debe tener al menos 2 caracteres';
      }

      if (req(person.sexo))       e[`${prefix}sexo`]        = 'Selecciona el sexo';
      if (req(person.estadoCivil)) e[`${prefix}estadoCivil`] = 'Selecciona el estado civil';

      if (req(person.telefono)) {
        e[`${prefix}telefono`] = 'El teléfono es obligatorio';
      } else if (digs(person.telefono) !== 11) {
        e[`${prefix}telefono`] = 'El teléfono debe tener exactamente 11 dígitos';
      } else if (!isValidPhonePrefix(person.telefono || '')) {
        e[`${prefix}telefono`] = 'El prefijo debe ser válido en Venezuela';
      }

      if (req(person.email)) {
        e[`${prefix}email`] = 'El correo electrónico es obligatorio';
      } else if (!emailRe.test((person.email || '').trim())) {
        e[`${prefix}email`] = 'Ingresa un correo válido';
      }

      if (req(person.fechaNac)) e[`${prefix}fechaNac`] = 'La fecha de nacimiento es obligatoria';
      if (req(person.estado))   e[`${prefix}estado`]   = 'El estado es obligatorio';
      if (req(person.ciudad))   e[`${prefix}ciudad`]   = 'La ciudad es obligatoria';

      if (req(person.direccion)) {
        e[`${prefix}direccion`] = 'La dirección es obligatoria';
      } else if (len(person.direccion) < 5) {
        e[`${prefix}direccion`] = 'La dirección debe tener al menos 5 caracteres';
      }
    };

    validatePerson(tomador, 'tom_');
    if (!sameInsured) validatePerson(asegurado, 'aseg_');
    if (hasBeneficiary) validatePerson(beneficiario, 'benef_');

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  (window as any).__validateStep2 = validate;

  const renderPersonForm = (person: any, setPerson: any, prefix: string, ciuState: any) => (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
      <Field label="Cédula o documento *" error={errors[`${prefix}identificacion`]}>
        <IdentityInput
          tipoDoc={person.tipoDoc ?? 'V'}
          identificacion={person.identificacion ?? ''}
          onTipoDocChange={(v) => setPerson({ tipoDoc: v })}
          onIdentificacionChange={(v) => setPerson({ identificacion: v })}
        />
      </Field>
      <div className="hidden sm:block"></div>
      <Field label="Nombre *" error={errors[`${prefix}nombre`]}>
        <Input
          value={person.nombre ?? ''}
          onChange={(e) => setPerson({ nombre: onlyLetters(e.target.value) })}
          placeholder="Nombre"
        />
      </Field>
      <Field label="Apellido *" error={errors[`${prefix}apellido`]}>
        <Input
          value={person.apellido ?? ''}
          onChange={(e) => setPerson({ apellido: onlyLetters(e.target.value) })}
          placeholder="Apellido"
        />
      </Field>
      <Field label="Teléfono *" error={errors[`${prefix}telefono`]} hint="Exactamente 11 dígitos, ej. 04121234567">
        <Input
          value={formatTelefono(person.telefono ?? '')}
          onChange={(e) => setPerson({ telefono: formatTelefono(e.target.value) })}
          placeholder="(0412) 123-4567"
          type="tel"
          inputMode="numeric"
          maxLength={15}
        />
      </Field>
      <Field label="Correo electrónico *" error={errors[`${prefix}email`]}>
        <Input
          value={person.email ?? ''}
          onChange={(e) => setPerson({ email: e.target.value })}
          placeholder="correo@ejemplo.com"
          type="email"
          inputMode="email"
        />
      </Field>
      <Field label="Estado *" error={errors[`${prefix}estado`]}>
        <SearchSelect
          value={person.cestado}
          options={catalogs.estados.map((s) => ({ value: String(s.code), label: s.label }))}
          onChange={(code, label) => {
            setPerson({
              estado : label,
              cestado: code ? Number(code) : undefined,
              ciudad : '',
              cciudad: undefined,
            });
          }}
          placeholder="Seleccione Estado"
          loading={catalogs.loading}
        />
      </Field>
      <Field
        label="Ciudad *"
        error={errors[`${prefix}ciudad`]}
        hint={person.cestado ? 'Escribe para filtrar la ciudad' : 'Selecciona primero el estado'}
      >
        <SearchSelect
          value={person.cciudad}
          options={ciuState.ciudades.map((c: any) => ({ value: String(c.code), label: c.label }))}
          onChange={(code, label) => {
            setPerson({
              ciudad : label,
              cciudad: code ? Number(code) : undefined,
            });
          }}
          placeholder={person.cestado ? 'Seleccione Ciudad' : 'Selecciona primero el estado'}
          disabled={!person.cestado}
          loading={ciuState.loading}
        />
      </Field>
      <Field label="Fecha de Nac. *" error={errors[`${prefix}fechaNac`]}>
        <Input
          value={person.fechaNac ?? ''}
          onChange={(e) => setPerson({ fechaNac: e.target.value })}
          type="date"
          max={new Date().toISOString().split('T')[0]}
        />
      </Field>
      <Field label="Sexo *" error={errors[`${prefix}sexo`]}>
        <SearchSelect
          value={person.sexo}
          options={
            catalogs.sexos.length > 0
              ? catalogs.sexos.map((s) => ({ value: String(s.label), label: s.label }))
              : [
                  { value: 'Femenino',  label: 'Femenino'  },
                  { value: 'Masculino', label: 'Masculino' },
                ]
          }
          onChange={(value) => setPerson({ sexo: value })}
          placeholder="— Seleccionar —"
          loading={catalogs.loading}
        />
      </Field>
      <Field label="Estado Civil *" error={errors[`${prefix}estadoCivil`]}>
        <SearchSelect
          value={person.estadoCivil}
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
          onChange={(value) => setPerson({ estadoCivil: value })}
          placeholder="— Seleccionar —"
          loading={catalogs.loading}
        />
      </Field>
      <div className="hidden sm:block"></div>
      <Field label="Dirección *" error={errors[`${prefix}direccion`]} full>
        <Textarea
          value={person.direccion ?? ''}
          onChange={(e) => setPerson({ direccion: e.target.value })}
          placeholder="Dirección completa"
          rows={3}
        />
      </Field>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <div className="space-y-5">
        {/* Tomador (Base) */}
        <SectionCard
          Icon={User}
          title="Datos de la persona que pagará la Póliza (Tomador)"
        >
          {renderPersonForm(tomador, setTomador, 'tom_', ciudadesState)}
        </SectionCard>

        {/* Declaración Legal */}
        <SectionCard
          Icon={ShieldAlert}
          title="Declaración legal"
          description="Requerida por la Superintendencia de la Actividad Aseguradora (SUDEASEG)"
        >
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-800 leading-relaxed mb-4">
            <strong>¿Qué es una Persona Políticamente Expuesta (PPE)?</strong> Es aquella que desempeña o ha desempeñado
            funciones públicas prominentes en Venezuela o en el extranjero, en los últimos 5 años.
          </div>
          <ToggleSwitch
            checked={tomador.personaPoliticamenteExpuesta}
            onChange={(v) => setTomador({ personaPoliticamenteExpuesta: v })}
            label="Soy una Persona Políticamente Expuesta (PPE)"
          />
        </SectionCard>

        {/* Asegurado (Titular) */}
        <SectionCard
          Icon={FileText}
          title="Datos de la persona que será asegurada (Titular)"
        >
          <ToggleSwitch
            checked={!sameInsured}
            onChange={(v) => setSameInsured(!v)}
            label="¿La persona que pagará la Póliza es diferente a la que será asegurada?"
          />
          {!sameInsured && renderPersonForm(asegurado, setAsegurado, 'aseg_', aseguradoCiudades)}
        </SectionCard>

        {/* Beneficiario */}
        <SectionCard
          Icon={Heart}
          title="Datos del Beneficiario Preferencial"
        >
          <ToggleSwitch
            checked={hasBeneficiary}
            onChange={setHasBeneficiary}
            label="¿Desea agregar un beneficiario preferencial a la póliza?"
          />
          {hasBeneficiary && renderPersonForm(beneficiario, setBeneficiario, 'benef_', beneficiarioCiudades)}
        </SectionCard>
      </div>
    </div>
  );
}
