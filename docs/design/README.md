# System Design — Hackathon Beta

**Estado:** diseño documentado / **baseline aprobada**, no implementado. **Fecha:** 2026-10-10.  
**Diseño condicionado** a pruebas técnicas y salvaguardas de la beta pública descritas en `release-checklist.md`.

| Archivo | Propósito |
|---|---|
| [architecture.md](architecture.md) | Diagrama, stack, módulos, flujo de IA, seguridad y consistencia |
| [data-model.md](data-model.md) | Entidades, estados, invariantes PostgreSQL, RLS y puntuaciones derivadas |
| [api-contracts.md](api-contracts.md) | API v1 y DTOs compartidos frontend/backend/IA |
| [release-checklist.md](release-checklist.md) | Puertas para publicar ante ciudadanos reales (NO verificadas) |
| [ADR-001](decisions/ADR-001-arquitectura-serverless.md) | Monolito serverless modular y servicios gratuitos |
| [ADR-002](decisions/ADR-002-auth-sin-confirmacion.md) | Email/contraseña sin email de confirmación ni SMTP |
| [ADR-003](decisions/ADR-003-puntos-derivados-y-ocultacion.md) | Integridad de puntos, cooldown y ocultación |
| [ADR-004](decisions/ADR-004-validacion-visual-gratuita.md) | Modelo visual gratuito sujeto a pruebas reales |

## Confirmado por el usuario

- Beta **pública**, no simple demo; tres desarrolladores; implementación delegada a agentes; infraestructura y AI Keys de coste cero.
- Arquitectura React + Supabase + Cloudflare aprobada, cinco capacidades aprobadas.
- Registro email+contraseña sin confirmación, sin dominio ni SMTP para hackathon.
- Cooldown obligatorio 60 min, máximo una pendiente por tipo, EXIF galería ≤60 min; ocultar una aprobada **revoca puntos**.

## Decisiones de diseño propuestas que deben respetar los agentes

- Un API `/v1` sobre una única Supabase Edge Function; imágenes privadas con media proxy y copias saneadas.
- `submitted_at` y `points_snapshot` inmutables; puntos derivados, sin ledger en beta.
- Validación en segundo plano best effort + reintento manual, sin asumir cola durable.
- Feed global 30 días por likes; ranking global por puntos; auth sin email verificado.

## Estado de cierre

**Cerrado:** responsabilidades, límites de módulos, modelo conceptual, API, reglas de puntuación, ocultación y autenticación simplificada. **Pendiente antes de lanzamiento:** comprobar cuota/licencia/calidad real del proveedor IA, transformación efectiva de imágenes, operación de denuncias/supresiones y pruebas E2E de seguridad. No confundir documentación terminada con beta públicamente segura.

**Siguiente fase SDLC:** Planning → tareas de implementación y verificación por dependencias; **no se ha escrito código**.
