const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Exelixi · Módulo Emisión',
      version: '1.0.0',
      description: `
## Módulo Emisión — Cotización y emisión de pólizas RCV con La Mundial

Gestiona el ciclo completo de vida de una póliza RCV (Responsabilidad Civil Vehicular):

1. **Cotización** \`POST /api/policies/quote\` — calcula la prima sin comprometer nada.
2. **Emisión** \`POST /api/policies/emit\` — cotiza y emite la póliza con La Mundial de Seguros.

### Integración con otros módulos
- Recibe el **estado del wizard** completo desde Módulo Formulario y Módulo Pagos.
- Devuelve el número de póliza, recibo y URL del PDF al Módulo Pagos para mostrar en pantalla de éxito.

### Códigos de error comunes
| Código | Descripción |
|--------|-------------|
| \`LAMUNDIAL_PLATE_ALREADY_INSURED\` | La placa o serial ya tienen póliza vigente |
| \`LAMUNDIAL_SP_OUTDATED\` | Procedimiento almacenado desactualizado en La Mundial |
| \`LAMUNDIAL_UNAUTHORIZED\` | API Key inválida o expirada |
| \`LAMUNDIAL_NETWORK\` | Sin conectividad con La Mundial |
| \`INVALID_PAYLOAD\` | Datos insuficientes o con formato incorrecto |
      `.trim(),
      contact: {
        name: 'Exelixi / La Mundial de Seguros',
        email: 'soporte@lamundialdeseguros.com',
      },
    },
    servers: [
      { url: 'http://localhost:4004', description: 'Desarrollo local' },
    ],
    tags: [
      { name: 'Pólizas', description: 'Cotización y emisión de pólizas RCV' },
      { name: 'Sistema',  description: 'Estado del servicio' },
    ],
    components: {
      schemas: {
        WizardState: {
          type: 'object',
          required: ['tomador', 'vehicle'],
          description: 'Estado completo del wizard recopilado por los módulos OCR y Formulario',
          properties: {
            tomador: {
              type: 'object',
              description: 'Datos del tomador de la póliza',
              properties: {
                tipoDoc:        { type: 'string', enum: ['V','E','J','G','P'], example: 'V' },
                identificacion: { type: 'string', example: '12345678' },
                nombre:         { type: 'string', example: 'JUAN CARLOS' },
                apellido:       { type: 'string', example: 'PEREZ RODRIGUEZ' },
                telefono:       { type: 'string', example: '04141234567' },
                email:          { type: 'string', format: 'email', example: 'juan@email.com' },
                fechaNac:       { type: 'string', format: 'date', example: '1985-06-15' },
                sexo:           { type: 'string', example: 'M' },
                estadoCivil:    { type: 'string', example: 'S' },
                estado:         { type: 'string', example: 'Miranda' },
                estadoCode:     { type: 'integer', example: 10 },
                ciudad:         { type: 'string', example: 'Caracas' },
                ciudadCode:     { type: 'integer', example: 101 },
                direccion:      { type: 'string', example: 'Av. Principal, Piso 3' },
              },
            },
            vehicle: {
              type: 'object',
              description: 'Datos del vehículo',
              properties: {
                placa:    { type: 'string', example: 'ABC123D' },
                tipoPlaca:{ type: 'string', enum: ['nacional','extranjera'], example: 'nacional' },
                marca:    { type: 'string', example: 'TOYOTA' },
                marcaCode:{ type: 'integer', example: 1 },
                modelo:   { type: 'string', example: 'COROLLA' },
                modeloCode:{ type: 'integer', example: 5 },
                año:      { type: 'string', example: '2019' },
                color:    { type: 'string', example: 'BLANCO' },
                serial:   { type: 'string', example: '8NFBT28B9KW123456' },
                uso:      { type: 'string', example: 'Particular' },
              },
            },
            selectedPlan: {
              type: 'object',
              properties: {
                name:    { type: 'string', example: 'Básico' },
                priceNum:{ type: 'number', example: 45.00 },
              },
            },
            paymentMethod: { type: 'string', enum: ['card','transfer','mobile','otp'] },
          },
        },
        QuoteResponse: {
          type: 'object',
          properties: {
            success:    { type: 'boolean', example: true },
            mprima:     { type: 'number', description: 'Prima en Bs', example: 2340.50 },
            mprimaext:  { type: 'number', description: 'Prima en USD', example: 62.80 },
            ptasa:      { type: 'number', description: 'Tasa de cambio aplicada', example: 37.27 },
          },
        },
        EmitResponse: {
          type: 'object',
          properties: {
            success:  { type: 'boolean', example: true },
            message:  { type: 'string', example: 'Póliza emitida exitosamente.' },
            policy: {
              type: 'object',
              properties: {
                number:           { type: 'string', example: 'LM-2026-123456' },
                cnpoliza:         { type: 'string', example: 'LM-2026-123456' },
                cnrecibo:         { type: 'string', example: 'R-2026-789' },
                urlpoliza:        { type: 'string', format: 'uri', example: 'https://lamundial.com/polizas/LM-2026-123456.pdf' },
                ncuota:           { type: 'integer', example: 1 },
                internalPolicyId: { type: 'string' },
                emittedAt:        { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            code:    { type: 'string', example: 'LAMUNDIAL_PLATE_ALREADY_INSURED' },
            message: { type: 'string' },
            details: { type: 'array', items: { type: 'string' } },
            stage:   { type: 'string', enum: ['quote','emit'] },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
