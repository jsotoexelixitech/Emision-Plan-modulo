# 📊 Módulo Emisión / Plan — Exelixi Platform

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![PM2](https://img.shields.io/badge/PM2-ready-2B037A?style=flat-square)

**Paso 4 del flujo RCV · Selección de plan, cotización y emisión de póliza**

[Documentación de la API](#-api-reference) · [Despliegue](#-despliegue) · [Contribuir](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## 📋 Descripción

El módulo Emisión es el **núcleo de negocio** del flujo RCV. Permite seleccionar el plan de cobertura, obtener la cotización de prima en tiempo real contra La Mundial de Seguros y emitir la póliza final con todos los datos del tomador y vehículo.

### Características principales

- ✅ Cotización de prima RCV en tiempo real (API La Mundial)
- ✅ Selección de plan de cobertura con precios actualizados
- ✅ Emisión de póliza contra el motor de La Mundial de Seguros
- ✅ Manejo de errores específicos (`PLATE_ALREADY_INSURED`, `SP_OUTDATED`, etc.)
- ✅ URL de descarga del PDF de la póliza
- ✅ API REST documentada con Swagger/OpenAPI
- ✅ Gestión de procesos con PM2

---

## 🏗️ Arquitectura

```
modulo-emision/
├── frontend/                  # React 18 + Vite 5 + TailwindCSS
│   ├── src/
│   │   ├── features/plans/    # Selector de plan + cotización
│   │   ├── features/emission/ # Datos del tomador
│   │   └── ...
│   └── dist/
├── server/                    # Node.js 20 + Express
│   ├── src/
│   │   ├── routes/            # /api/policies
│   │   ├── services/          # La Mundial adapter
│   │   └── ...
│   ├── .env.example
│   └── ...
├── logs/
├── ecosystem.config.js
├── ecosystem.dev.config.js
└── package.json
```

| Componente | Puerto | Proceso PM2      |
|:-----------|:------:|:----------------:|
| Backend API | `4004` | `emision-api`   |
| Frontend    | `5183` | `emision-web`   |
| Swagger UI  | `4004/docs` | — |

---

## 🚀 Inicio rápido

### Prerrequisitos

| Herramienta | Versión mínima |
|:------------|:--------------:|
| Node.js     | 20.x           |
| npm         | 10.x           |
| PM2         | 5.x            |

### 1. Clonar el repositorio

```bash
git clone https://github.com/jsotoexelixitech/Emision-Plan-modulo.git
cd Emision-Plan-modulo
```

### 2. Instalar dependencias

```bash
npm install --prefix server
npm install --prefix frontend
```

### 3. Configurar variables de entorno

```bash
cp server/.env.example server/.env
```

Edita `server/.env`:

```env
NODE_ENV=production
PORT=4004
CORS_ORIGINS=http://localhost:5183

LAMUNDIAL_BASE_URL=https://qaapisys2000.lamundialdeseguros.com
LAMUNDIAL_APIKEY=TU_APIKEY_AQUI
LAMUNDIAL_PRODUCTOR=80080
LAMUNDIAL_CUSUARIO=4
LAMUNDIAL_RAMO=18
LAMUNDIAL_PLAN_DEFAULT=RCVBAS
LAMUNDIAL_FRECUENCIA_DEFAULT=A
LAMUNDIAL_TIMEOUT_MS=30000
```

> ⚠️ **Nunca comitas el archivo `.env` al repositorio.**

### 4. Compilar el frontend

```bash
npm run build --prefix frontend
```

### 5. Levantar con PM2

```bash
# Producción
pm2 start ecosystem.config.js --env production

# Desarrollo (hot-reload)
pm2 start ecosystem.dev.config.js
```

### 6. Verificar

```bash
curl http://localhost:4004/api/health
# {"status":"ok","module":"emision","upstream":"https://qaapisys2000...","productor":"80080","ramo":"18"}
```

Cotización de prueba:

```bash
curl -X POST http://localhost:4004/api/policies/quote \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "tomador": { "tipoDoc": "V", "identificacion": "12345678", "nombre": "JUAN", "apellido": "PEREZ" },
      "vehicle": { "placa": "ABC123D", "marca": "TOYOTA", "modelo": "COROLLA", "año": "2019", "serial": "8NFBT28B9KW123456" }
    },
    "plan": "RCVBAS",
    "frecuencia": "A"
  }'
```

---

## 📖 API Reference

### `GET /api/health`
Estado del servicio y parámetros del productor.

### `POST /api/policies/quote`
Obtiene la prima anual para un vehículo y plan dados.

**Request body**
```json
{
  "state": { "tomador": {...}, "vehicle": {...} },
  "plan": "RCVBAS",
  "frecuencia": "A"
}
```

**Response `200`**
```json
{
  "mprima": 198114.50,
  "mprimaext": 62.80,
  "ptasa": 3154.72
}
```

### `POST /api/policies/emit`
Emite la póliza final contra La Mundial.

**Response `200`**
```json
{
  "policy": {
    "number": "RCV-2026-001234",
    "cnpoliza": "001234",
    "urlpoliza": "https://..."
  }
}
```

La especificación completa está en **Swagger UI**: `http://localhost:4004/docs`

---

## ⚠️ Errores frecuentes

| Código de error | Causa | Solución |
|:----------------|:------|:---------|
| `LAMUNDIAL_UNAUTHORIZED` | API Key inválida | Verificar `LAMUNDIAL_APIKEY` en `.env` |
| `LAMUNDIAL_SP_OUTDATED` | Proc. almacenado desactualizado | Contactar La Mundial |
| `LAMUNDIAL_PLATE_ALREADY_INSURED` | Placa ya tiene póliza vigente | Verificar datos del vehículo |
| `ECONNREFUSED` en Swagger | Backend no levantó | `pm2 logs emision-api` |

---

## 🛠️ Gestión de procesos (PM2)

```bash
pm2 show emision-api
pm2 show emision-web
pm2 logs emision-api
pm2 restart emision-api
pm2 restart emision-web
pm2 save
```

---

## 📁 Logs en disco

```
logs/
├── emision-api.out.log
├── emision-api.err.log
├── emision-web.out.log
└── emision-web.err.log
```

---

## 🔄 Actualizar el módulo

```bash
git pull origin main
npm install --prefix server
npm run build --prefix frontend
pm2 restart emision-api
pm2 restart emision-web
```

---

## 🗺️ Módulos relacionados

| # | Módulo | Repositorio |
|:-:|:-------|:-----------|
| 1 | OCR | [ocr-documentos-modulo](https://github.com/jsotoexelixitech/ocr-documentos-modulo) |
| 2-3 | Formulario | [Formulario-modulo](https://github.com/jsotoexelixitech/Formulario-modulo) |
| **4** | **Emisión / Plan** ← _estás aquí_ | [Emision-Plan-modulo](https://github.com/jsotoexelixitech/Emision-Plan-modulo) |
| 5-6 | Pagos / Póliza | [Pagos-Poliza-modulo](https://github.com/jsotoexelixitech/Pagos-Poliza-modulo) |

---

## 🤝 Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md) para el flujo de trabajo y convenciones.

---

## 📄 Licencia

Distribuido bajo la licencia **MIT**. Consulta [LICENSE](LICENSE).

---

<div align="center">
Desarrollado por <strong>Exelixi Tech</strong> · 2026
</div>
