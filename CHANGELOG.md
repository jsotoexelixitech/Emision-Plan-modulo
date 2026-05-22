# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.0.0/) y el proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.0.0] — 2026-05-22

### Added
- Cotización de prima RCV en tiempo real contra La Mundial de Seguros
- Selector de plan de cobertura con precios actualizados por vehículo
- Emisión de póliza completa (tomador + vehículo + plan)
- URL de descarga del PDF de la póliza
- Manejo tipado de errores La Mundial: `PLATE_ALREADY_INSURED`, `SP_OUTDATED`, `UNAUTHORIZED`
- API REST documentada con Swagger/OpenAPI 3.0
- Health-check endpoint `GET /api/health`
- Soporte PM2 producción y desarrollo
