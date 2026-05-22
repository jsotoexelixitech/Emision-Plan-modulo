# Guia de contribucion

Gracias por tu interes en mejorar este modulo. Lee esta guia antes de abrir un PR.

---

## Flujo de trabajo

1. Fork el repositorio y crea tu rama desde `main`:
   ```bash
   git checkout -b feat/mi-mejora
   ```
2. Haz tus cambios siguiendo las convenciones del proyecto.
3. Actualiza `CHANGELOG.md` en la seccion `[Unreleased]`.
4. Crea el Pull Request describiendo el problema y la solucion.

---

## Convencion de commits (Conventional Commits)

| Prefijo     | Cuando usarlo                              |
|:------------|:-------------------------------------------|
| `feat:`     | Nueva funcionalidad                        |
| `fix:`      | Correccion de bug                          |
| `docs:`     | Solo documentacion                         |
| `style:`    | Formato, espacios (sin cambio de logica)   |
| `refactor:` | Refactorizacion sin nuevas features        |
| `test:`     | Anadir o corregir tests                    |
| `chore:`    | Mantenimiento, dependencias                |

---

## Ramas

| Rama       | Proposito                     |
|:-----------|:------------------------------|
| `main`     | Codigo estable / productivo   |
| `develop`  | Integracion de features       |
| `feat/*`   | Nuevas funcionalidades        |
| `fix/*`    | Correcciones de bugs          |
| `hotfix/*` | Fixes urgentes en produccion  |

---

## Proceso de revision

- Se requiere al menos 1 aprobacion para mergear a `main`
- Manten los PRs pequenos y enfocados (un proposito por PR)
