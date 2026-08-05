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
};

function sexoLabel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return SEXO_LABELS[raw.toUpperCase()] ?? raw;
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
  const vehicle = state?.vehicle ?? {};
  const hasVehicle = branch === 'AUTOMOVIL' || branch === 'RCV_OBLIGATORIO';

  // Datos personales del asegurado para el cuadro-póliza (F. Nacimiento / SEXO).
  // La plantilla de nest-api los lee desde riskData.
  const insuredPerson = state?.sameInsured !== false
    ? state?.tomador
    : (state?.asegurado ?? state?.tomador);
  const fechaNac = insuredPerson?.fechaNac || insuredPerson?.fechaNacimiento;
  if (fechaNac) risk.fechaNacimiento = fechaNac;
  const sexo = sexoLabel(insuredPerson?.sexo);
  if (sexo) risk.sexo = sexo;
  if (insuredPerson?.estadoCivil) risk['Estado civil'] = insuredPerson.estadoCivil;

  if (hasVehicle) {
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

  const funeral = state?.funeral;
  if (funeral?.asegurados?.length) {
    risk['Cantidad de asegurados'] = String(funeral.asegurados.length);
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

  const aseguradoParty = state?.sameInsured !== false
    ? tomadorParty
    : (partyFromPerson(state?.asegurado) ?? tomadorParty);

  const beneficiarios = [];
  if (state?.hasBeneficiary && state?.beneficiario) {
    const b = partyFromPerson(state.beneficiario);
    if (b) beneficiarios.push(b);
  }
  if (state?.funeral?.beneficiarios?.length) {
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
