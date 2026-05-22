import type { Plan } from '../types';

export const PLAN_CATALOG: Record<string, Plan[]> = {
  personal: [
    {
      name: 'Urbano Esencial',
      price: '$38 / mes',
      priceNum: 38,
      tag: 'Uso personal',
      desc: 'Ideal para desplazamientos diarios y cobertura esencial.',
      benefits: ['Responsabilidad civil', 'Asistencia vial', 'Atención de siniestros'],
      sumaAsegurada: 15000,
    },
    {
      name: 'Confort Familiar',
      price: '$57 / mes',
      priceNum: 57,
      tag: 'Más elegido',
      desc: 'Pensado para familias que buscan equilibrio entre costo y protección.',
      benefits: ['Todo lo esencial', 'Grúa ampliada', 'Defensa jurídica', 'Cristales'],
      sumaAsegurada: 25000,
    },
    {
      name: 'Total Plus',
      price: '$79 / mes',
      priceNum: 79,
      tag: 'Cobertura amplia',
      desc: 'Más respaldo y beneficios para una conducción con mayor tranquilidad.',
      benefits: ['Daños propios', 'Vehículo sustituto', 'Asistencia premium', 'Cobertura extendida'],
      sumaAsegurada: 45000,
    },
  ],
  premium: [
    {
      name: 'Elite Drive',
      price: '$95 / mes',
      priceNum: 95,
      tag: 'Premium',
      desc: 'Para clientes que priorizan servicio preferencial y máxima cobertura.',
      benefits: ['Cobertura ampliada', 'Atención prioritaria', 'Asistencia premium', 'Auto sustituto'],
      sumaAsegurada: 60000,
    },
    {
      name: 'Black Signature',
      price: '$128 / mes',
      priceNum: 128,
      tag: 'Alto valor',
      desc: 'Diseñado para vehículos premium y necesidades más exigentes.',
      benefits: ['Mayor límite de cobertura', 'Chofer eventual', 'Defensa jurídica VIP', 'Gestión preferente'],
      sumaAsegurada: 100000,
    },
  ],
  comercial: [
    {
      name: 'Negocio Activo',
      price: '$72 / mes',
      priceNum: 72,
      tag: 'Comercial',
      desc: 'Protección funcional para uso comercial liviano.',
      benefits: ['Responsabilidad civil', 'Asistencia vial', 'Cobertura operativa'],
      sumaAsegurada: 30000,
    },
    {
      name: 'Ruta Segura',
      price: '$89 / mes',
      priceNum: 89,
      tag: 'Operación continua',
      desc: 'Para vehículos con uso frecuente en trabajo y reparto.',
      benefits: ['Mayor asistencia', 'Cobertura ampliada', 'Soporte de siniestros', 'Grúa extendida'],
      sumaAsegurada: 50000,
    },
  ],
  flota: [
    {
      name: 'Flota Base',
      price: '$210 / mes',
      priceNum: 210,
      tag: 'Multiunidad',
      desc: 'Pensado para empresas con varias unidades bajo una misma administración.',
      benefits: ['Gestión simplificada', 'Cobertura conjunta', 'Asistencia coordinada'],
      sumaAsegurada: 80000,
      sumaAseguradaUnit: '/ unidad',
    },
    {
      name: 'Flota Integral',
      price: '$320 / mes',
      priceNum: 320,
      tag: 'Corporativo',
      desc: 'Mayor cobertura para operaciones con múltiples vehículos.',
      benefits: ['Cobertura ampliada', 'Soporte prioritario', 'Atención corporativa', 'Gestión centralizada'],
      sumaAsegurada: 150000,
      sumaAseguradaUnit: '/ unidad',
    },
  ],
};

export const CATEGORY_LABELS: Record<string, string> = {
  personal: 'Uso personal',
  premium: 'Uso premium',
  comercial: 'Uso comercial',
  flota: 'Flota',
};
