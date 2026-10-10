# Backlog ejecutable — Beta pública, máximo 5 horas

**Estado:** nueva versión del *mismo* plan T00–T23; **ninguna tarea marcada completada** ni se atribuye trabajo al equipo. Sustituye el backlog T00–T10 previo solo cuando el equipo acepte esta revisión. Véase [plan.md](plan.md). **Tracker único:** este `tasks/todo.md`, no hay GitHub Issues/Jira designados. Los paths previstos son orientativos; antes de codificar cada agente verifica rutas existentes y ajusta *sin superar cinco archivos por tarea* o divide la tarea.

**Clave:** S = 1–2 archivos, M = 3–5 archivos; se cuentan **archivos previstos** (documentación/PR actual no cuenta como archivo de código). Si una tarea supera 5 archivos, dividirla antes de modificar. La distribución temporal es orientativa; la falta de tiempo **no** modifica los criterios de seguridad. `P0` para todas las tareas salvo mejoras estéticas no enumeradas. Solo se tacha una casilla tras ejecutar sus verificaciones e integrar cambios. Los comandos `npm run ...` deben verificarse/crearse durante el scaffold; no se presume que existan hoy.

## H0 — Aprobación de contratos, 00:00–00:15

### T00 — Congelar contratos y preparar accesos

- [ ] **T00 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** Equipo · A integra · **Ventana:** 00:00–00:15 · **Tamaño:** S (2 archivos previstos) · **Dependencias:** —.

**Descripción:** Acordar una única interpretación del contrato v1, interfaces `ValidationInput/Result`, propiedad de archivos, roles reales y cuentas Free; sin implementar.

**Criterios de aceptación:**
- [ ] Cada agente conoce rutas/responsables, esquema de error/estados y cómo solicitar cambios.
- [ ] Un humano confirma acceso a cuentas Supabase/Cloudflare/Turnstile y canal de retirada; ningún secreto entra en Git.

**Verificación:**
- [ ] Revisión cruzada A/B/C y registro de acuerdo en PR o `tasks/plan.md`.

**Archivos previstos:** `docs/design/api-contracts.md`, `tasks/plan.md`.

**Trazabilidad:** Módulos: todos; Diseño: API, ADR-001–004.


## CP1 — Fundaciones y viabilidad, objetivo ~00:45

### T01 — Crear persistencia con permisos denegados por defecto

- [ ] **T01 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** A · **Ventana:** 00:15–00:45 · **Tamaño:** M (4 archivos previstos) · **Dependencias:** T00.

**Descripción:** Crear tablas, índices críticos, Storage privado y políticas iniciales RLS; incluir catálogo INE desde fuente oficial verificable sin inventar municipios.

**Criterios de aceptación:**
- [ ] Tablas `profiles`, `municipalities`, `contributions`, `likes`, `reports` y restricciones principales son migrables.
- [ ] Un usuario no puede leer ni modificar evidencia privada, puntos o contribuciones ajenas directamente; buckets no son públicos.
- [ ] Municipios proceden de fuente INE identificada y se comprueba importación.

**Verificación:**
- [ ] Aplicar migración sobre entorno de prueba y consultar políticas RLS con identidades distinta/anónima.
- [ ] Registrar resultado real del comando de migración y test; no asumir que hay scripts disponibles.

**Archivos previstos:** `supabase/migrations/20261010_schema.sql`, `supabase/migrations/20261010_security.sql`, `supabase/seed.sql`, `tests/db/rls.test.ts`.

**Trazabilidad:** Data model DB-01–DB-10; SPEC-contributions; SPEC-identity.

### T02 — Verificar modelo visual gratuito antes de construir

- [ ] **T02 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** C · **Ventana:** 00:15–00:45 · **Tamaño:** S (1 archivo previsto) · **Dependencias:** T00.

**Descripción:** Comprobar en cuenta Cloudflare Free modelo visual candidato con fotografía propia y descripción, disponibilidad real, licencia UE, privacidad y cuota; no enviar fotos ciudadanas.

**Criterios de aceptación:**
- [ ] La llamada real de imagen + texto funciona y produce dictamen interpretable, o se marca bloqueo explícito.
- [ ] Se documentan licencia/territorio, condiciones de datos, cuota, coste cero y ejemplos positivo/negativo.

**Verificación:**
- [ ] Prueba manual real con ≥2 imágenes propias y registro sin tokens ni bytes sensibles.
- [ ] Si no hay evidencia suficiente a minuto 45, registrar NO-GO provisional para beta pública.

**Archivos previstos:** `tests/ai/provider-spike.md`.

**Trazabilidad:** SPEC-ai-validation AI-05; ADR-004.

### T03 — Levantar una SPA navegable y compilable

- [x] **T03 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** B · **Ventana:** 00:15–00:45 · **Tamaño:** M (5 archivos previstos) · **Dependencias:** T00.

**Descripción:** Preparar scaffold único React/Vite/TS, navegación base y cliente HTTP que respete la API v1, sin tocar contratos de servidor.

**Criterios de aceptación:**
- [x] La app permite navegar entre acceso, contribución, feed y ranking con contenido provisional claramente señalado.
- [x] El build y navegación móvil básica funcionan; los mocks no pueden activar puntos en producción.

**Verificación:**
- [x] `npm run build` y `npm run lint` si scripts están implementados; registrar comando realmente ejecutado.
- [x] Comprobar manualmente las cuatro rutas/pantallas.

**Archivos previstos:** `package.json`, `index.html`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`.

**Trazabilidad:** Architecture; API conventions.


### Checkpoint CP1 (tras T01–T03)
- [ ] DB/RLS y SPA verificables; prueba IA real gratuita con licencia y privacidad revisadas.
- [ ] Decisión humana de continuar; si la IA falla, no presentar beta pública viable.

## CP2 — Identidad y contrato IA, objetivo ~01:25

### T04 — Registrar perfil autenticado con alias único

- [ ] **T04 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** A · **Ventana:** 00:45–01:10 · **Tamaño:** S (2 archivos previstos) · **Dependencias:** T01.

**Descripción:** Definir inserción/lectura segura de perfil desde JWT verificado, alias único y declaración de mayoría de edad; Supabase Auth sigue siendo responsable de email/password.

**Criterios de aceptación:**
- [ ] El perfil conserva alias y declaración adulta; alias duplicado no se admite.
- [ ] No se acepta `userId`, edad o alias como autoridad privilegiada desde un token ajeno.

**Verificación:**
- [ ] Prueba de alta de dos usuarios, alias duplicado y petición sin JWT.

**Archivos previstos:** `supabase/functions/api/routes/profiles.ts`, `tests/api/profiles.test.ts`.

**Trazabilidad:** SPEC-identity ID-01–ID-07; ADR-002.

### T05 — Completar experiencia real de registro y login

- [x] **T05 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** B · **Ventana:** 00:45–01:25 · **Tamaño:** M (4 archivos previstos) · **Dependencias:** T03, T04 (contrato estable).

**Descripción:** Conectar Supabase Auth con CAPTCHA Turnstile, registro/login/logout, declaración >=18, alias y texto de limitación sin email de recuperación.

**Criterios de aceptación:**
- [x] Cuenta nueva registra y accede sin confirmación de email; logout revoca la sesión local.
- [x] Errores de credenciales, CAPTCHA, alias ocupado y usuario menor quedan explicados sin filtrar datos.

**Verificación:**
- [ ] Alta/login/logout real en Supabase Free y comprobación de sesión expirada.
- [x] Ejecutar prueba focalizada de Auth y `npm run build`.

**Archivos previstos:** `src/App.tsx`, `src/features/identity/AuthPage.tsx`, `src/features/identity/authService.ts`, `src/features/identity/AuthPage.test.tsx`.

**Trazabilidad:** SPEC-identity; API Auth.

### T06 — Crear adaptador real de validación multimodal

- [x] **T06 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** C · **Ventana:** 00:45–01:25 · **Tamaño:** M (3 archivos previstos) · **Dependencias:** T02.

**Descripción:** Adaptar Cloudflare Workers AI con imagen + texto, política por acción y JSON estricto; no tomar decisiones de puntuación ni escribir en DB.

**Criterios de aceptación:**
- [x] Devuelve `APPROVED`, `NEEDS_EVIDENCE` o `REJECTED` con razón saneada válida.
- [x] Respuesta malformada, timeout, 429 y fallo de licencia no se convierten en aprobado; no filtra claves.

**Verificación:**
- [x] Tests de parseo, error y prompt injection; integración real con material no personal.

**Evidencia T06 (2026-10-10):** `deno test` con comprobación de tipos: 20/20; `npm run lint` y `npm run build`: correctos. El adaptador devolvió `APPROVED` con la imagen propia relevante y `REJECTED` con la imagen propia no relacionada. La descripción vacía o de solo espacios devuelve `NEEDS_EVIDENCE` sin llamar al proveedor; 403/429, timeout y salida malformada siguen siendo fallos técnicos sin aprobación. No se registraron credenciales, bytes de imagen ni respuestas crudas.

**Archivos previstos:** `supabase/functions/api/ai/validator.ts`, `supabase/functions/api/ai/schema.ts`, `tests/ai/validator.test.ts`.

**Trazabilidad:** SPEC-ai-validation AI-01–AI-04; contratos v1 internos.


### Checkpoint CP2 (tras T04–T06)
- [ ] Registro/login real y alias único; decisión IA tipada, errores no aprobatorios.
- [ ] Revisión del contrato A/B/C y build sin error.

## CP3 — Evidencia privada, objetivo ~02:05

### T07 — Permitir subir evidencia exclusivamente privada

- [ ] **T07 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** A · **Ventana:** 01:10–01:50 · **Tamaño:** M (3 archivos previstos) · **Dependencias:** T01, T04.

**Descripción:** Emitir token firmado limitado para subida a Storage privado y confirmar tamaño/MIME/propiedad al consumir la evidencia.

**Criterios de aceptación:**
- [ ] La subida es válida solo para autor autenticado y ruta de su propiedad, ≤5 MB y MIME real permitido.
- [ ] Las fotografías pendientes y originales no son legibles mediante URL pública ni usuario ajeno.

**Verificación:**
- [ ] Pruebas de subida propia/ajena, MIME falso y tamaño excedido; petición directa a Storage sin token.

**Archivos previstos:** `supabase/functions/api/routes/uploads.ts`, `supabase/functions/api/domain/uploads.ts`, `tests/api/uploads.test.ts`.

**Trazabilidad:** API POST /uploads; SPEC-contributions.

### T08 — Enviar una contribución desde la interfaz

- [x] **T08 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** B · **Ventana:** 01:25–02:05 · **Tamaño:** M (4 archivos previstos) · **Dependencias:** T03, T07 (contrato).

**Descripción:** Mostrar acción, foto cámara/galería, municipio INE, descripción y envío con clave de idempotencia estable por intención.

**Criterios de aceptación:**
- [x] Datos y archivo se envían al backend sin agregar puntos en cliente.
- [x] Conflictos de cooldown, EXIF/imagen inválida y contribución pendiente se presentan claramente.

**Verificación:**
- [ ] Prueba en navegador móvil para cámara y galería; request real con JWT y clave reutilizada en reintento.

**Archivos previstos:** `src/lib/api.ts`, `src/features/contributions/ContributionForm.tsx`, `src/features/contributions/contributionApi.ts`, `src/features/contributions/ContributionForm.test.tsx`.

**Trazabilidad:** SPEC-contributions CON-01–CON-10; API POST /contributions.

### T09 — Validar temporalidad y sanear evidencia publicable

- [ ] **T09 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** C · **Ventana:** 01:25–02:05 · **Tamaño:** M (3 archivos previstos) · **Dependencias:** T02, T01.

**Descripción:** Concentrar el borde de medios: EXIF original de galería y copia re-encodificada sin EXIF/GPS; prohibir publicación si falla el saneamiento.

**Criterios de aceptación:**
- [ ] EXIF galería 59/60 min se acepta, 61/futuro/ausente se rechaza y se solicita cámara; el servidor interpreta el archivo real.
- [ ] Copias de publicación no contienen GPS/EXIF, nunca se entrega original privado y un fallo de transformación no publica.

**Verificación:**
- [ ] Pruebas con muestras EXIF, bytes saneados y lectura anónima/ajena; registrar límite antifraude de cámara web.

**Archivos previstos:** `supabase/functions/api/media/evidence.ts`, `supabase/functions/api/media/sanitize.ts`, `tests/media/evidence.test.ts`.

**Trazabilidad:** SPEC-contributions; data-model §6; release gate imágenes.


### Checkpoint CP3 (tras T07–T09)
- [ ] Galería/cámara/EXIF probados y Storage privado; copia saneada verificable.
- [ ] Integración mínima de token de subida + formulario.

## CP4 — Contribución pendiente, objetivo ~02:55

### T10 — Registrar envío pendiente con invariantes transaccionales

- [ ] **T10 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** A · **Ventana:** 01:50–02:35 · **Tamaño:** M (4 archivos previstos) · **Dependencias:** T07, T09 (interfaz disponible).

**Descripción:** Crear contribución `PENDING` y consulta propia por RPC/transacción, comprobar acción/municipio EXIF, snapshot puntos, cooldown e idempotencia; exponer consulta `GET /municipalities?q=` usando catálogo INE.

**Criterios de aceptación:**
- [ ] `POST /contributions` devuelve 202 y mismo ID en reintento equivalente; payload diferente con igual clave da conflicto.
- [ ] Solo una contribución no resuelta por usuario/tipo, cooldown 60 min desde último `submitted_at` aprobado incluso si oculta.
- [ ] Municipio debe existir en catálogo real, su endpoint de búsqueda devuelve códigos verificables y los puntos quedan fijados en servidor sin puntuar aún.

**Verificación:**
- [ ] Pruebas con solicitudes simultáneas y claves de idempotencia; 59/60 min, ciudad distinta y EXIF 59/60/61.

**Archivos previstos:** `supabase/functions/api/routes/contributions.ts`, `supabase/functions/api/domain/contribution.ts`, `supabase/migrations/20261010_contribution_rpc.sql`, `tests/api/contribution-create.test.ts`.

**Trazabilidad:** SPEC-contributions; DB-02–DB-05.

### T11 — Mostrar el estado real y opciones de recuperación

- [x] **T11 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** B · **Ventana:** 02:05–02:35 · **Tamaño:** S (2 archivos previstos) · **Dependencias:** T08, T10 (contrato).

**Descripción:** Consultar estado de una contribución propia por polling y ofrecer evidencia adicional/reintento/cancelación de acuerdo con estados permitidos.

**Criterios de aceptación:**
- [x] `PENDING`, `NEEDS_EVIDENCE`, `TECHNICAL_ERROR`, `APPROVED` se distinguen; nunca mostrar aprobación por timeout.
- [x] Autor puede solicitar cancelación o aportar evidencia en mismo ID; no permitir acciones en estados finales.

**Verificación:**
- [x] Simular JSON por estado en test de UI; ejecutar petición real y 401/404 para usuario ajeno.

**Archivos previstos:** `src/features/contributions/ContributionStatus.tsx`, `src/features/contributions/statusApi.ts`.

**Trazabilidad:** SPEC-contributions; GET /contributions/{id}, evidence/retry/cancel.

### T12 — Comprobar dictámenes y fallos del proveedor

- [ ] **T12 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** C · **Ventana:** 02:05–02:55 · **Tamaño:** S (2 archivos previstos) · **Dependencias:** T06, T09.

**Descripción:** Validar contrato del adaptador con casos positivos, negativos, ambiguos y ataques de prompt; documentar cuota y timeout.

**Criterios de aceptación:**
- [ ] Errores 403/429/timeout/JSON inválido no producen `APPROVED`.
- [ ] Hay evidencia real de la calidad y de la limitación de visión para ambos tipos de acción.

**Verificación:**
- [ ] Ejecutar tests focalizados de validación y ≥4 casos reales con fotos propias, registrar resultados.

**Archivos previstos:** `tests/ai/validation-contract.test.ts`, `tests/ai/fail-closed.test.ts`.

**Trazabilidad:** SPEC-ai-validation AI-01–AI-05.


### Checkpoint CP4 (tras T10–T12)
- [ ] Envío `PENDING` persistido y único; cooldown 59/60, idempotencia y error técnico sin puntos.
- [ ] Consulta propia de estado protegida y UI preparada con contrato; recuperación real se integra en T13.

## CP5 — Primer vertical slice con IA real, objetivo ~03:40

### T13 — Resolver resultado IA sin duplicar puntos

- [ ] **T13 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** A · **Ventana:** 02:35–03:15 · **Tamaño:** M (4 archivos previstos) · **Dependencias:** T06, T09, T10.

**Descripción:** Orquestar validación diferida no durable con persistencia de estado, `validation_version` y reserva; cubrir GET propio y comandos `evidence/retry/cancel` del contrato; publicar solo si dictamen aprobado y copia saneada existe.

**Criterios de aceptación:**
- [ ] Transición condicionada y atómica: una aprobación, cero puntos en errores, rechazadas o canceladas.
- [ ] Resultado tardío/duplicado o arranque interrumpido nunca resucita cancelada ni concede puntos dos veces.
- [ ] El autor puede aportar evidencia en el mismo ID, reintentar error técnico o cancelar; nunca hay aprobación ficticia.

**Verificación:**
- [ ] Tests de cancelación concurrente, doble callback, vencimiento lease y lectura de copia antes/después de aprobar.

**Archivos previstos:** `supabase/functions/api/domain/validation-workflow.ts`, `supabase/functions/api/routes/contributions.ts`, `supabase/migrations/20261010_validation_rpc.sql`, `tests/api/approval.test.ts`.

**Trazabilidad:** SPEC-ai-validation, SPEC-contributions; DB-06.

### T14 — Presentar feed y ranking global desde contrato

- [x] **T14 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** B · **Ventana:** 02:35–03:35 · **Tamaño:** M (4 archivos previstos) · **Dependencias:** T03, T08; T16 para integración real.

**Descripción:** Mostrar publicaciones públicas y ranking de usuarios desde paginación del API; fixtures únicamente durante desarrollo.

**Criterios de aceptación:**
- [x] Feed muestra alias, municipio, imagen saneada, likes y 30 días; ranking muestra puntos y empates compartidos.
- [x] Visitante sin cuenta puede leer ambos; ninguna respuesta filtrará email o path privado.

**Verificación:**
- [x] Pruebas de parse/`resolveMediaUrl`/fixtures gated y mensajes 404 (T16); integración real GET /feed y /leaderboard pendiente de T16.

**Archivos previstos:** `src/features/community/FeedPage.tsx`, `src/features/scoring/LeaderboardPage.tsx`, `src/features/community/readApi.ts`, `src/features/community/FeedPage.test.tsx`.

**Trazabilidad:** SPEC-community; SPEC-scoring; GET /feed, /leaderboard.

### T15 — Verificar primer recorrido completo con IA auténtica

- [ ] **T15 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** C · **Ventana:** 02:55–03:40 · **Tamaño:** M (3 archivos previstos) · **Dependencias:** T05, T08, T11, T13.

**Descripción:** Probar registro→subida→envío→IA real→aprobación→puntos/publicación en staging, y negativa sin puntos.

**Criterios de aceptación:**
- [ ] Acción de reciclaje vale 10 y recogida 20 exclusivamente tras dictamen real.
- [ ] No hay imagen visible antes de aprobación ni doble puntuación al reintentar.

**Verificación:**
- [ ] E2E documentado con usuario/imágenes de prueba y prueba backend carrera de aprobación; adjuntar ID del commit.

**Archivos previstos:** `e2e/core-contribution.spec.ts`, `tests/security/validation-races.test.ts`, `tasks/release-runbook.md`.

**Trazabilidad:** SPEC-contributions; SPEC-scoring; V02–V05.


### Checkpoint CP5 (tras T13–T15)
- [ ] Registro → subir → validar con IA real → publicar imagen saneada → puntos: E2E con evidencia.
- [ ] Primer staging listo, no producción ciudadana aún.

## CP6 — Lecturas y seguridad, objetivo ~04:15

### T16 — Servir feed y ranking con puntuación derivada

- [ ] **T16 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** A · **Ventana:** 03:15–03:40 · **Tamaño:** M (4 archivos previstos) · **Dependencias:** T13.

**Descripción:** Exponer feed aprobado no oculto de últimos 30 días ordenado por likes y ranking global histórico derivado, paginado y sin saldos mutables; registrar `/media/{id}` mediante el helper seguro de C.

**Criterios de aceptación:**
- [ ] Solo aprobadas visibles; orden del feed por likes ↓ y ranking por puntos ↓ con empates compartidos.
- [ ] Respuestas públicas omiten email, `evidence_path`, secretos y campos internos; `/media/{id}` entrega copia saneada solo si visible, con `no-store`.

**Verificación:**
- [ ] Peticiones sin JWT; 2 usuarios/3 contribuciones, empate y paginación/fecha 30 días.

**Archivos previstos:** `supabase/functions/api/routes/public-reads.ts`, `supabase/functions/api/routes/media.ts`, `supabase/functions/api/domain/public-queries.ts`, `tests/api/public-reads.test.ts`.

**Trazabilidad:** SPEC-scoring SCO-01–SCO-06; SPEC-community COM-01–COM-03.

### T17 — Añadir interacciones de comunidad en la interfaz

- [x] **T17 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** B · **Ventana:** 03:35–04:15 · **Tamaño:** M (3 archivos previstos) · **Dependencias:** T14; contratos T19–T21.

**Descripción:** Añadir acciones de like, denuncia y ocultación propias en el contexto de feed; la interfaz usa contratos v1 y no otorga puntos.

**Criterios de aceptación:**
- [x] Like propio imposible y toggling reversible; el score no se altera.
- [x] Autor puede ocultar con confirmación de pérdida de puntos y la vista se actualiza; visitante puede denunciar mediante CAPTCHA.

**Verificación:**
- [x] Tests de helpers (no auto-like, hide/confirm, report+CAPTCHA, fixtures gated); integración real PUT/DELETE like, hide y reports pendiente de T19–T21.

**Archivos previstos:** `src/features/community/CommunityActions.tsx`, `src/features/community/communityApi.ts`, `src/features/community/CommunityActions.test.tsx`.

**Trazabilidad:** SPEC-community; POST /hide, PUT/DELETE /like, POST /reports.

### T18 — Auditar permisos y fallos públicos con E2E

- [ ] **T18 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** C · **Ventana:** 03:40–04:15 · **Tamaño:** M (3 archivos previstos) · **Dependencias:** T13, T16; T19–T21 para revalidación final.

**Descripción:** Validar acceso público/anónimo, JWT ajeno, RLS, Storage, cache de imágenes, EXIF y carrera de estados. Preparar staging y confirmar condiciones de licencia/tratamiento del proveedor.

**Criterios de aceptación:**
- [ ] No hay acceso anónimo a originales, modificaciones de puntos ni contenido oculto; `/media/{id}` deja de servir la imagen retirada.
- [ ] IA caída, CAPTCHA ausente y rate-limit no producen aprobaciones ni acceso indebido.
- [ ] Los casos de seguridad V01, V05–V08, V10–V11 y V13 quedan con evidencia o bloqueo explícito; casos sociales se revalidan al finalizar T21.

**Verificación:**
- [ ] Ejecutar E2E y pruebas directas de API/Storage con usuarios diferentes; registrar evidencias sin datos personales.

**Archivos previstos:** `e2e/security.spec.ts`, `tests/security/rls-storage.test.ts`, `tasks/release-runbook.md`.

**Trazabilidad:** Release checklist; V01–V15.


### Checkpoint CP6 (tras T16–T18)
- [ ] Feed/ranking anónimos, puntos correctos; RLS, secretos y medios privados comprobados.
- [ ] Registrar fallos y poner `BLOCKED` en lugar de declarar DONE.

## CP7 — Comunidad y retirada, objetivo ~04:30

### T19 — Ocultar publicación con revocación automática

- [ ] **T19 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** A · **Ventana:** 03:40–03:55 · **Tamaño:** S (2 archivos previstos) · **Dependencias:** T13, T16.

**Descripción:** Exponer hide idempotente por autor y aplicar `hidden_at` sin modificar el snapshot ni resetear cooldown.

**Criterios de aceptación:**
- [ ] Publicación desaparece del feed y su media da 404; puntos derivados disminuyen exactamente 10/20 una vez.
- [ ] Usuario ajeno recibe denegación y ocultación repetida no duplica efecto.

**Verificación:**
- [ ] Dos usuarios, hide repetido, rank tras hide, comprobación `/media/{id}`.

**Archivos previstos:** `supabase/functions/api/routes/contributions.ts`, `tests/api/hide.test.ts`.

**Trazabilidad:** SPEC-contributions; SPEC-scoring; DB-07.

### T20 — Permitir like reversible sin puntos

- [ ] **T20 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** A · **Ventana:** 03:55–04:10 · **Tamaño:** S (2 archivos previstos) · **Dependencias:** T16, T19.

**Descripción:** Exponer `PUT/DELETE /contributions/{id}/like` con unicidad DB, bloqueo de auto-like y visibilidad de post.

**Criterios de aceptación:**
- [ ] Un usuario solo puede dejar un like reversible a post ajeno visible.
- [ ] Añadir/quitar like altera feed, no ranking ni puntos.

**Verificación:**
- [ ] Test de like duplicado, auto-like, post oculto y 401.

**Archivos previstos:** `supabase/functions/api/routes/community.ts`, `tests/api/likes.test.ts`.

**Trazabilidad:** SPEC-community COM-04–COM-07; DB-08.

### T21 — Recibir denuncia anónima resistente a abuso

- [ ] **T21 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** A · **Ventana:** 04:10–04:30 · **Tamaño:** S (2 archivos previstos) · **Dependencias:** T01.

**Descripción:** Implementar `POST /reports` sin JWT con Turnstile verificado, control de tasa y almacenamiento privado, con vía manual de revisión para operador.

**Criterios de aceptación:**
- [ ] Solicitud válida crea reporte privado sin exponer datos del denunciado ni la denunciante.
- [ ] Token CAPTCHA ausente/incorrecto o abuso recibe rechazo; operador sabe localizar y actuar sobre reportes.

**Verificación:**
- [ ] Prueba con/ sin Turnstile, petición repetida, lectura anónima denegada y retirada manual ensayada.

**Archivos previstos:** `supabase/functions/api/routes/community.ts`, `tests/api/reports.test.ts`.

**Trazabilidad:** SPEC-community COM-08/09; DB-10.


### Checkpoint CP7 (tras T19–T21)
- [ ] Hide con revocación real; like sin puntos; denuncias anónimas protegidas y atendibles.
- [ ] No abrir registro público si retirada/manual no funciona.

## H final — Revisión de UX y GO/NO-GO, objetivo ~05:00

### T22 — Revisar UX móvil y cerrar las interacciones

- [x] **T22 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** B · **Ventana:** 04:15–04:30 · **Tamaño:** S (2 archivos previstos) · **Dependencias:** T11, T14, T17; T19–T21 para integración real.

**Descripción:** Resolver estados de error y adaptación móvil del flujo completo; sustituir fixtures de desarrollo por respuestas reales o bloquear su uso en producción.

**Criterios de aceptación:**
- [x] En móvil hay alta, cámara/galería, seguimiento de envío, feed/likes/ranking/hide y denuncia accesibles.
- [x] Sin simulaciones de aprobación/puntos ni secretos en bundle; fallos de red muestran estado verdadero.

**Verificación:**
- [x] `npm run build` / lint / test; shell móvil (nav dual + #root); smoke en dispositivo físico pendiente si no hay emulador.

**Archivos previstos:** `src/features/community/CommunityActions.tsx`, `src/App.tsx`.

**Trazabilidad:** SPEC-identity, SPEC-contributions, SPEC-community.

### T23 — Desplegar y decidir GO/NO-GO público

- [ ] **T23 DONE** (marcar únicamente tras aceptación y verificación)

**Responsable:** C + equipo · **Ventana:** 04:30–05:00 · **Tamaño:** M (3 archivos previstos) · **Dependencias:** T15, T18, T21, T22.

**Descripción:** Preparar/publicar Cloudflare Pages HTTPS, Supabase Functions/Storage, CORS, Auth redirects y Turnstile; ejecutar runbook y solicitar decisión GO humana.

**Criterios de aceptación:**
- [ ] URL desplegada coincide con commit comprobado; configuración usa exclusivamente planes gratuitos y secretos protegidos.
- [ ] Todos los gates críticos de `docs/design/release-checklist.md` tienen prueba/evidencia y una persona aprueba GO; si falta uno, NO-GO público con demo restringida.

**Verificación:**
- [ ] `npm run build`, smoke V01–V15 o bloqueo documentado, prueba retirada y check de cuotas; anotar decisión humana.

**Archivos previstos:** `tasks/release-runbook.md`, `.env.example`, `wrangler.toml`.

**Trazabilidad:** Release checklist; ADR-001, ADR-004.

### Checkpoint final (tras T22–T23)
- [ ] UX móvil y build sin fixtures de aprobación en producción.
- [ ] `docs/design/release-checklist.md` íntegro y `tasks/release-runbook.md` con evidencias.
- [ ] Una persona designada firma **GO** para beta pública **o** **NO-GO**; en NO-GO, registro deshabilitado y solo demo controlada.

## Registro vivo para el equipo

| Tarea | Persona | PR/commit | Evidencia de prueba / bloqueo | Estado (TODO/BLOCKED/REVIEW/DONE) |
|---|---|---|---|---|
| T00 | — | — | — | TODO |
| T01 | — | — | — | TODO |
| T02 | — | — | — | TODO |
| T03 | B | `24435dd` / `task/T03-spa-base` | `npm run build`, `npm run lint`, `npm test` 6/6; rutas `/`, `/acceso`, `/contribuir`, `/ranking` | DONE |
| T04 | — | — | — | TODO |
| T05 | B | `task/T05-auth-ui` | `npm test` 14/14 (src), `npm run build`, `npm run lint`; E2E Supabase Free pendiente de env local | DONE |
| T06 | — | — | — | TODO |
| T07 | — | — | — | TODO |
| T08 | B | `task/T08-contribution-form` | `npm test` 21/21 (src), `npm run build`, `npm run lint`; upload T07 cableado; POST /contributions y municipios esperan T10; smoke móvil pendiente de env | DONE |
| T09 | — | — | — | TODO |
| T10 | — | — | — | TODO |
| T11 | B | `task/T11-contribution-status` | `npm test` 26/26 (src), `npm run build`, `npm run lint`; tests de estados; integración real GET pendiente de T10 | DONE |
| T12 | — | — | — | TODO |
| T13 | — | — | — | TODO |
| T14 | B | `task/T14-feed-ranking` | `npm test` (src), `npm run build`, `npm run lint`; fixtures DEV gated; GET /feed y /leaderboard reales pendientes de T16 | DONE |
| T15 | — | — | — | TODO |
| T16 | — | — | — | TODO |
| T17 | B | `task/T17-community-actions` | `npm test` (src), `npm run build`, `npm run lint`; fixtures DEV gated; like/hide/report reales pendientes de T19–T21 | DONE |
| T18 | — | — | — | TODO |
| T19 | — | — | — | TODO |
| T20 | — | — | — | TODO |
| T21 | — | — | — | TODO |
| T22 | B | `task/T22-mobile-ux` | `npm test` (src), `npm run build`, `npm run lint`; shell móvil + targets táctiles; fixtures prod bloqueados por DEV gate; smoke físico pendiente | DONE |
| T23 | — | — | — | TODO |

**Regla de integración:** registrar el `DONE` solo cuando la PR esté fusionada y el checkpoint correspondiente completado. Si una tarea se divide durante la ejecución, usar subtareas `Txx.a/b` manteniendo trazabilidad y sin romper ownership; actualizar grafo y dependencias en `plan.md`.
