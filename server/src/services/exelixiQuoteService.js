/**
 * Cotización Exélixi vía product-builder (misma lógica que nest-api product-emission).
 * No depende de Sis2000 ni de nest-api para el paso de cotizar.
 */
const productBuilder = require('./productBuilderClient');

function toMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolvePlan(plans, productName, planName) {
  if (!plans.length) {
    const err = new Error(
      `El producto "${productName}" no tiene planes comerciales configurados en product-builder.`,
    );
    err.status = 400;
    err.code = 'MISSING_PLAN';
    throw err;
  }
  if (planName) {
    const found = plans.find((p) => p.name.toLowerCase() === planName.toLowerCase());
    if (!found) {
      const err = new Error(
        `El plan "${planName}" no existe. Planes disponibles: ${plans.map((p) => p.name).join(', ')}`,
      );
      err.status = 400;
      err.code = 'PLAN_NOT_FOUND';
      throw err;
    }
    return found;
  }
  return plans.find((p) => p.isRecommended) ?? plans[0];
}

function buildCoveragesFromPlan(product, plan) {
  const coverageIds = plan.coverageIds ?? [];
  return coverageIds.map((coverageId, idx) => {
    const coverage = (product.coverages ?? []).find((c) => c.id === coverageId);
    return {
      id: coverageId,
      name: coverage?.name ?? plan.coverageLabels?.[idx] ?? 'Cobertura',
      sumaAsegurada:
        toMoney(coverage?.insuredSumFixed) ?? toMoney(coverage?.insuredSumMax),
      prima: toMoney(coverage?.tariffPremium),
    };
  });
}

function resolvePrimaTotal(product, plan, coberturas) {
  const sumTariffs = coberturas.reduce((acc, c) => acc + (toMoney(c.prima) ?? 0), 0);
  if (sumTariffs > 0) return sumTariffs;

  const commercial = toMoney(product.actuarialData?.commercialPremium);
  if (commercial != null && commercial > 0) return commercial;

  const priceFactor = toMoney(plan.priceFactor) ?? 0;
  if (priceFactor > 1) return priceFactor;
  return priceFactor > 0 ? priceFactor : 0;
}

function assignCoveragePremiums(coberturas, primaTotal) {
  if (!coberturas.length || primaTotal <= 0) return;

  const withPrima = coberturas.filter((c) => c.prima != null && c.prima > 0);
  if (withPrima.length === coberturas.length) return;

  if (coberturas.length === 1) {
    coberturas[0].prima = primaTotal;
    return;
  }

  const each = primaTotal / coberturas.length;
  coberturas.forEach((c) => {
    if (c.prima == null || c.prima <= 0) {
      c.prima = each;
    }
  });
}

async function quoteProductEmission({ productId, planName }) {
  const product = await productBuilder.getProduct(productId);
  let plans = product.productPlans ?? [];

  if (!plans.length) {
    try {
      const plansResponse = await productBuilder.getPlans(productId);
      plans = plansResponse?.plans ?? [];
    } catch {
      /* product-builder puede no exponer /plans; seguir con lista vacía */
    }
  }

  const plan = resolvePlan(plans, product.commercialName, planName);
  const coberturas = buildCoveragesFromPlan(product, plan);
  const primaTotal = resolvePrimaTotal(product, plan, coberturas);
  assignCoveragePremiums(coberturas, primaTotal);

  return {
    productId: product.id,
    productName: product.commercialName,
    productBranch: product.branch,
    moneda: product.currency || 'USD',
    planName: plan.name,
    planesDisponibles: plans.map((p) => p.name),
    primaTotal,
    coberturas: coberturas.map((c) => ({
      name: c.name,
      sumaAsegurada: c.sumaAsegurada,
      prima: c.prima,
    })),
  };
}

module.exports = {
  quoteProductEmission,
};
