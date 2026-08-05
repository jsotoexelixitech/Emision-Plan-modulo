/**
 * Mapea el wizardStore del front → EmitGenericPolicyDto (nest-api product-emission).
 */

function formatIdentificacion(tipoDoc, identificacion) {
  const id = String(identificacion ?? '').trim();
  if (!id) return '';
  if (/^[VEJGP]-/i.test(id)) return id.toUpperCase();
  const prefix = String(tipoDoc ?? 'V').toUpperCase().charAt(0);
  const digits = id.replace(/\D/g, '');
  return digits ? `${prefix}-${digits}` : id;
}

function partyFromPerson(person) {
  if (!person) return null;
  const nombre = `${person.nombre ?? ''} ${person.apellido ?? ''}`.trim();
  const identificacion = formatIdentificacion(person.tipoDoc, person.identificacion);
  if (!nombre || !identificacion) return null;
  return {
    nombre,
    identificacion,
    email: person.email || undefined,
    telefono: person.telefono || undefined,
    ciudad: person.ciudad || undefined,
    estado: person.estado || undefined,
    zonaPostal: person.zonaPostal || person.codigoPostal || undefined,
    direccion: person.direccion || undefined,
    parentesco: person.parentesco || undefined,
  };
}

const SEXO_LABELS = {
  M: 'MASCULINO',
  F: 'FEMENINO',
  MASCULINO: 'MASCULINO',
  FEMENINO: 'FEMENINO',
  MALE: 'MASCULINO',
  FEMALE: 'FEMENINO',
};

function sexoLabel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return SEXO_LABELS[raw.toUpperCase()] ?? raw.toUpperCase();
}

/** Normaliza fecha a DD/MM/YYYY (cuadro-póliza VE). Acepta ISO, YYYY-MM-DD y MM/DD/YYYY. */
function formatFechaNacimientoVe(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [a, b, y] = raw.split('/').map(Number);
    // Si el primer grupo > 12 es ya DD/MM; si no, tratar como MM/DD (input type=date en en-US).
    if (a > 12) return raw;
    if (b > 12) return `${String(a).padStart(2, '0')}/${String(b).padStart(2, '0')}/${y}`;
    // Ambiguo pero el form usa type=date → valor real suele llegar como YYYY-MM-DD;
    // si llega MM/DD/YYYY (como en captura), priorizar US → VE.
    return `${String(b).padStart(2, '0')}/${String(a).padStart(2, '0')}/${y}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return raw;
}

/**
 * Elige plantilla HTML del cuadro-póliza (layout). El rótulo "RAMO PÓLIZA"
 * lo resuelve nest-api desde el branch (PATRIMONIAL, VIDA, etc.) — no se
 * fuerza "ACCIDENTES PERSONALES" solo por usar la plantilla genérica.
 */
function inferPolicyTemplate(branch, productName) {
  const name = String(productName ?? '').toLowerCase();
  if (name.includes('funerar') || name.includes('funeral')) return 'funerario';
  if (branch === 'AUTOMOVIL' || branch === 'RCV_OBLIGATORIO') return 'automovil';
  if (branch === 'SALUD') return 'salud';
  // Layout genérico (sin sección vehículo) para VIDA, PATRIMONIAL, INCLUSIVO…
  return 'personas';
}

function buildRiskData(state, branch) {
  const risk = {};
  const hasVehicle = branch === 'AUTOMOVIL' || branch === 'RCV_OBLIGATORIO';

  // Datos personales del asegurado para el cuadro-póliza (F. Nacimiento / SEXO).
  // Solo del tomador/asegurado activo — no se inventan datos de otros formularios.
  const insuredPerson = state?.sameInsured !== false
    ? state?.tomador
    : (state?.asegurado ?? state?.tomador);
  const fechaNac = formatFechaNacimientoVe(
    insuredPerson?.fechaNac || insuredPerson?.fechaNacimiento,
  );
  if (fechaNac) risk.fechaNacimiento = fechaNac;
  const sexo = sexoLabel(insuredPerson?.sexo);
  if (sexo) risk.sexo = sexo;
  if (insuredPerson?.estadoCivil) risk['Estado civil'] = insuredPerson.estadoCivil;

  // Vehículo SOLO en ramos auto — evita contaminar PDF de personas/patrimonial
  // con restos de sessionStorage de un flujo RCV anterior.
  if (hasVehicle) {
    const vehicle = state?.vehicle ?? {};
    if (vehicle.placa) risk.Placa = vehicle.placa;
    if (vehicle.marca) risk.Marca = vehicle.marca;
    if (vehicle.modelo) risk.Modelo = vehicle.modelo;
    if (vehicle.año) risk.Año = vehicle.año;
    if (vehicle.color) risk.Color = vehicle.color;
    if (vehicle.serial) risk.Serial = vehicle.serial;
    if (vehicle.serialMotor) risk.SerialMotor = vehicle.serialMotor;
    if (vehicle.uso) risk.Uso = vehicle.uso;
    if (vehicle.xcategoria_uso) risk['Categoría de uso'] = vehicle.xcategoria_uso;
    if (vehicle.ntoneladas != null && vehicle.ntoneladas !== '') {
      risk.Peso = `${vehicle.ntoneladas} Ton`;
    }
  }

  const isFuneral = String(state?.builderProduct?.commercialName ?? '')
    .toLowerCase()
    .includes('funerar')
    || String(state?.builderProduct?.commercialName ?? '')
      .toLowerCase()
      .includes('funeral');
  if (isFuneral && state?.funeral?.asegurados?.length) {
    risk['Cantidad de asegurados'] = String(state.funeral.asegurados.length);
  }

  return risk;
}

function resolveBuilderProduct(state) {
  if (state?.builderProduct?.id) return state.builderProduct;
  return null;
}

function mapWizardToEmitDto(state) {
  const builder = resolveBuilderProduct(state);
  if (!builder?.id) {
    const err = new Error('Falta el producto del catálogo Exélixi (builderProduct.id).');
    err.code = 'MISSING_BUILDER_PRODUCT';
    err.status = 400;
    throw err;
  }

  const planName = state?.selectedPlan?.name;
  if (!planName) {
    const err = new Error('Selecciona un plan comercial antes de emitir.');
    err.code = 'MISSING_PLAN';
    err.status = 400;
    throw err;
  }

  const tomadorParty = partyFromPerson(state?.tomador);
  if (!tomadorParty) {
    const err = new Error('Datos del tomador incompletos (nombre e identificación).');
    err.code = 'INVALID_TOMADOR';
    err.status = 400;
    throw err;
  }

  // Como La Mundial: si el toggle "tomador ≠ asegurado" está apagado,
  // el asegurado es el mismo tomador (no se exige ni envía otro formulario).
  const sameInsured = state?.sameInsured !== false;
  const aseguradoParty = sameInsured
    ? tomadorParty
    : (partyFromPerson(state?.asegurado) ?? tomadorParty);

  // Beneficiario solo si el usuario activó el toggle y completó datos.
  const beneficiarios = [];
  if (state?.hasBeneficiary && state?.beneficiario) {
    const b = partyFromPerson(state.beneficiario);
    if (b) beneficiarios.push(b);
  }
  const isFuneralLike = inferPolicyTemplate(
    builder.branch ?? builder.productBranch,
    builder.commercialName,
  ) === 'funerario';
  if (isFuneralLike && state?.funeral?.beneficiarios?.length) {
    for (const p of state.funeral.beneficiarios) {
      const b = partyFromPerson(p);
      if (b) beneficiarios.push(b);
    }
  }

  const paymentVerified = Boolean(state?.paymentVerified);
  const branch = builder.branch ?? builder.productBranch;

  return {
    productId: builder.id,
    planName,
    tomador: tomadorParty,
    asegurado: aseguradoParty,
    beneficiarios: beneficiarios.length ? beneficiarios : undefined,
    riskData: buildRiskData(state, branch),
    estatus: paymentVerified ? 'PAGADO' : 'PENDIENTE',
    policyTemplate: inferPolicyTemplate(branch, builder.commercialName),
  };
}

module.exports = {
  mapWizardToEmitDto,
};
