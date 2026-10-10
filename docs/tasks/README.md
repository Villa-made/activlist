# Guía del equipo — Beta pública del hackathon

**Estado:** propuesta de replanificación de Fase 5 basada en `planning-and-task-breakdown` · **Timebox:** 5 horas de reloj para implementación, QA y release · **Equipo:** 3 desarrolladores + 3 agentes. **El código todavía no se ha implementado ni desplegado por preparar estos documentos.**

## Inicio de cada compañero (5 minutos)

1. Leer [`plan.md`](plan.md): arquitectura, orden crítico, grafo, horas, seguridad y criterios de entrega.
2. Elegir una responsabilidad (A backend/datos, B React, C IA/QA/deploy) y leer [`agent-instructions.md`](agent-instructions.md). El integrador humano confirma acceso y propiedad de archivos en **T00**.
3. Abrir [`todo.md`](todo.md): las tareas **T00–T23** tienen descripción, 2–3 criterios de aceptación, prueba, archivos máximos y dependencias. Marcar **solo** lo realmente verificado; registrar PR/commit y resultado en su tabla.
4. Antes de habilitar usuarios reales, ejecutar [`release-runbook.md`](release-runbook.md) y [`../docs/design/release-checklist.md`](../docs/design/release-checklist.md). El lanzamiento **GO/NO-GO** lo decide una persona, no un agente.

## Documentos normativos (prioridad)

| Fuente | Responsabilidad |
|---|---|
| [`docs/requirements/mvp-requirements.md`](../docs/requirements/mvp-requirements.md) | 91 RQ del producto **completo**, no todos exigibles aquí |
| [`docs/ideas/product-concept.md`](../docs/ideas/product-concept.md) | Alcance reducido **aprobado** de beta pública |
| [`docs/specs/capability-map.md`](../docs/specs/capability-map.md) + 5 `SPEC-*.md` | Capacidades, reglas y aceptación de beta |
| [`docs/design/api-contracts.md`](../docs/design/api-contracts.md) | APIs y DTOs v1; **no inventar endpoints** |
| [`docs/design/data-model.md`](../docs/design/data-model.md) | Invariantes, esquema y seguridad |
| [`docs/design/architecture.md`](../docs/design/architecture.md) + ADRs | Stack y decisiones justificadas |
| `tasks/` | **Planificación y ejecución**, no redefine requisitos ni diseño |

Cuando una tarea contradice una SPEC o un contrato, **detenerse y actualizar primero la fuente normativa con revisión humana**; después revisar la tarea. No convertir una simplificación temporal en cambio silencioso de negocio.

## Restricciones aprobadas

- React/Vite/TypeScript + Cloudflare Pages Free; Supabase Free (Auth, PostgreSQL, Storage, Edge Functions); Workers AI Free **solo si visión/licencia/cuotas/privacidad se verifican en cuenta real**. Nunca activar pagos.
- Registro email/contraseña y alias, autodeclaración ≥18, **sin confirmación/recovery por email**, sin dominio propio ni SMTP.
- Acciones: reciclaje **10 pts**, recogida de residuos **20 pts**. Dictamen IA real requerido; likes = **0 pts**.
- Galería: EXIF ≤60 min válido desde hora servidor; sin EXIF pedir cámara. Cooldown **60 min por usuario+tipo** desde envío original de última aprobada, persiste al ocultar. Un pendiente/tipo.
- Solo contribuciones aprobadas y no ocultas suman puntos/aparecen públicamente; ocultar revoca inmediatamente puntos, imagen y presencia pública. Fotos originales privadas, copias publicables saneadas.
- Beta pública requiere seguridad RLS, denuncias anónimas protegidas, retirada operativa, privacidad mínima y supervisión humana. Si no se verifica todo, demo cerrada con fotos propias: **NO-GO público**.

## Entregables del equipo

- **Plan:** [`plan.md`](plan.md) — dependencias, vertical slices, checkpoints y riesgos.
- **Backlog:** [`todo.md`](todo.md) — tareas S/M, aceptación, pruebas y estado.
- **Prompts y ownership:** [`agent-instructions.md`](agent-instructions.md).
- **QA y salida pública:** [`release-runbook.md`](release-runbook.md).

**Convención Git:** TBD con ramas `task/Txx-*` muy cortas, PR frecuentes y `main` compilable. Una persona integra contratos y archivos compartidos. No abrir nuevas funcionalidades por iniciativa del agente. **Tamaño máximo por tarea:** cinco archivos de código previstos; si crece, subdividir antes de continuar.

## Aprobación de esta revisión

**Pendiente de aprobación humana.** El equipo puede evaluar esta propuesta sin ejecutar implementación. Reemplaza únicamente el paquete anterior de `tasks/` cuando se apruebe; no sobrescribir cambios que compañeros hayan realizado entretanto.
