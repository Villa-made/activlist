# Contratos API — Beta pública (v1)

**Estado:** contrato propuesto como baseline de diseño, aprobado el stack; pendiente de tests de contrato. La v1 se amplía con perfiles por la decisión D1 (2026-10-10), sin renumerar la versión. **Transport:** HTTPS + JSON salvo subida de imagen. **Base:** `https://<project>.supabase.co/functions/v1/api/v1`. Un único Edge Function `api` puede manejar rutas; el prefijo de Supabase se conserva en el router. No se promete que existan endpoints desplegados todavía.

## 1. Convenciones

- DTO `camelCase`, enums `UPPER_SNAKE`, IDs UUID, fechas ISO-8601 UTC. No exponer referencias privadas de Storage en DTO públicos.
- Autenticado: `Authorization: Bearer <supabase_access_token>`. La función valida el JWT antes de ejecutar cambios y **deriva** `userId` desde el servidor. Lecturas públicas aceptan ausencia de JWT.
- Comandos de crear/reintentar requieren `Idempotency-Key: <uuid>` reutilizada en reintentos de **la misma intención**; jamás recalcular una nueva clave para una respuesta perdida. Una clave ausente o que no sea UUID devuelve `400 INVALID_REQUEST` con `details.field = "Idempotency-Key"`.
- Paginación: `limit` por defecto 20, máximo 50; `cursor` opaco; `nextCursor` nulo al terminar. Búsqueda de municipios por `q` (mínimo 2 caracteres), sin posición GPS obligatoria.
- Todas las respuestas de error: `{ "error": { "code": "MACHINE_CODE", "message": "Texto seguro", "details": {} } }`; no revelar prompts, tokens ni información sensible.
- Fallos: `400` cuerpo malformado, `401` no autenticado, `403` prohibido, `404` inexistente/no autorizado, `409` conflictos temporales/duplicados, `413` imagen demasiado grande, `422` validación de campos/EXIF, `429` límite, `502/503` IA externa, `500` interno.

## 2. Autenticación

Registro, login y logout **a través de Supabase Auth SDK**, sin endpoints REST personalizados. Configuración aprobada: **email/contraseña sin confirmación**, sin SMTP ni dominio. Tras `supabase.auth.signUp`, con la sesión resultante se llama a `POST /profiles`; tras el login se llama a `GET /profiles/me` y, si devuelve `404 PROFILE_REQUIRED`, la UI pide completar el perfil. El alias aplica `trim` y después `^[A-Za-z0-9_.-]{3,24}$`; se guarda con su capitalización, es único sin distinguir mayúsculas y no es editable en la beta. No confiar en metadatos editables como autorización.

**Control del registro:** Supabase Auth CAPTCHA (Turnstile) activado con verificación por proveedor; verificar flujo de alta/sesión y la creación de perfil. Sin recuperación por correo en beta. No publicar email.

## 3. Recursos HTTP

| Método | Ruta desde `/v1` | Auth | Resultado / efecto |
|---|---|---|---|
| `POST` | `/profiles` | Usuario | Crea el perfil propio; `userId` procede del JWT |
| `GET` | `/profiles/me` | Usuario | Devuelve el perfil propio |
| `POST` | `/uploads` | Usuario | Emite `photoPath` temporal de propiedad del autor + `uploadToken` acotado para el bucket privado |
| `POST` | `/contributions` | Usuario | Crea envío una vez; `202` con `id`, `status=PENDING` |
| `GET` | `/contributions/{id}` | Autor | Estado propio, razón de IA y puntos efectivos; no expone token IA |
| `POST` | `/contributions/{id}/evidence` | Autor | Para `NEEDS_EVIDENCE`, reemplaza evidencia desde ruta privada autorizada y vuelve a `PENDING` |
| `POST` | `/contributions/{id}/retry` | Autor | Para `TECHNICAL_ERROR` o `PENDING` con reserva vencida; reintento seguro sin nueva contribución |
| `POST` | `/contributions/{id}/cancel` | Autor | Solo sin resolver; `CANCELLED`, puntos 0, libera pendiente |
| `POST` | `/contributions/{id}/hide` | Autor | Solo `APPROVED` visible; `hiddenAt`, puntos efectivos 0; idempotente |
| `GET` | `/feed` | Público | Feed visible, últimos 30 días, likes ↓, paginado |
| `GET` | `/leaderboard` | Público | Ranking global histórico por puntos ↓ |
| `GET` | `/municipalities?q=` | Público | Códigos/nombres INE para selección manual; en la beta, solo la provincia de Barcelona |
| `PUT` | `/contributions/{id}/like` | Usuario | Crea Me gusta propio si publicación es ajena y visible; idempotente |
| `DELETE` | `/contributions/{id}/like` | Usuario | Elimina Me gusta propio; idempotente |
| `POST` | `/reports` | Público | Denuncia con motivo y token Turnstile validado en servidor; `202` |
| `GET` | `/media/{id}` | Público | Stream de imagen **saneada** solo si sigue visible; `no-store` |

**No existe un endpoint público para:** cambiar `status`, asignar puntos, modificar fecha, consultar originales de terceros, aprobar manualmente, ver emails o descargar denuncias. El procedimiento excepcional de moderación por equipo utiliza acceso administrativo seguro, fuera de esta API pública.

## 4. Payloads principales

**Crear perfil:** `POST /profiles`

```json
{ "alias": "EcoUsuario", "adultDeclared": true }
```

Respuesta `201`:

```json
{ "userId": "<uuid>", "alias": "EcoUsuario" }
```

**Consultar perfil propio:** `GET /profiles/me`

Respuesta `200`:

```json
{ "userId": "<uuid>", "alias": "EcoUsuario" }
```

**Emitir token de subida:** `POST /uploads`

```json
{ "contentType": "image/jpeg", "sizeBytes": 1548320 }
```

Respuesta `201` (esquema conceptual, el adaptador puede mapear nombres del SDK de Storage):

```json
{ "photoPath": "staging/<user-id>/<uuid>", "uploadToken": "short-lived-token", "expiresAt": "2026-10-10T10:00:00Z" }
```

El navegador sube el archivo a Supabase Storage usando el SDK y **ese token**; `POST /contributions` comprueba propiedad, existencia, tipo y EXIF en el **archivo real**. La concesión del token no supone que la imagen sea válida. `photoPath` solo se acepta del usuario propietario y la propia función decide el destino privado.

**Crear contribución:** `POST /contributions`, con `Idempotency-Key`

```json
{
  "actionType": "LITTER_COLLECTION",
  "description": "He recogido residuos del parque",
  "municipalityCode": "08019",
  "photoPath": "staging/<user-id>/<uuid>",
  "captureOrigin": "GALLERY"
}
```

`description` debe tener entre 1 y 500 caracteres después de aplicar `trim`.

**Respuesta:** `202 Accepted`

```json
{
  "id": "<uuid>", "status": "PENDING",
  "submittedAt": "2026-10-10T08:42:00Z",
  "pointsIfApproved": 20
}
```

`pointsIfApproved` es informativo; **no son puntos concedidos**.

**Consulta de un envío propio:** `GET /contributions/{id}`

```json
{
  "id": "<uuid>", "actionType": "LITTER_COLLECTION",
  "status": "NEEDS_EVIDENCE", "reason": "La foto no permite ver los residuos recogidos",
  "submittedAt": "2026-10-10T08:42:00Z", "approvedAt": null,
  "isHidden": false, "effectivePoints": 0,
  "canRetry": false, "canProvideEvidence": true, "canCancel": true
}
```

`POST /contributions/{id}/evidence`: `{ "photoPath": "staging/<user-id>/<uuid>", "captureOrigin": "CAMERA_FLOW" }`, con nueva idempotencia de la acción de aporte. `POST /.../retry`, `/cancel`, `/hide` admiten cuerpo vacío e idempotencia.

**Feed:** `GET /feed?limit=20&cursor=...`

El campo `imageUrl` es una ruta **relativa a la base de la API**, no al origen de Cloudflare Pages; el cliente HTTP debe resolverla con el origen de Supabase de forma explícita.

```json
{
  "items": [{ "id": "<uuid>", "authorAlias": "EcoUsuario", "actionType": "RECYCLING",
    "description": "Separé envases", "municipality": { "code": "08019", "name": "Barcelona" },
    "imageUrl": "/v1/media/<uuid>", "publishedAt": "2026-10-10T08:44:00Z",
    "likeCount": 4, "likedByMe": false }],
  "nextCursor": null
}
```

**Me gusta:** `PUT /contributions/{id}/like` y `DELETE /contributions/{id}/like` (cuerpo vacío). Ambos son idempotentes y responden `200` con el estado final; los likes no dan puntos. La publicación debe estar visible (`APPROVED` y no oculta, sin ventana de 30 días); si no existe o no es visible → `404 NOT_FOUND`; si es propia → `403 CANNOT_LIKE_OWN`.

```json
{ "liked": true, "likeCount": 4 }
```

**Ranking:** `GET /leaderboard?limit=20&cursor=...`

```json
{ "items": [{ "rank": 1, "userId": "<uuid>", "alias": "EcoUsuario", "points": 30 }], "nextCursor": null }
```

**Municipios:** `GET /municipalities?q=&limit=`

```json
{ "items": [{ "code": "08019", "name": "Barcelona", "provinceName": "Barcelona" }], "nextCursor": null }
```

`q` es obligatorio y debe tener al menos 2 caracteres tras `trim` (si no, `400 INVALID_REQUEST` con `details.field = "q"`). `limit` va de 1 a 50 (por defecto 20; fuera de rango o no numérico, `400 INVALID_REQUEST` con `details.field = "limit"`). La búsqueda no distingue mayúsculas ni acentos, se aplica al nombre (y al prefijo del código si `q` son solo dígitos) y el orden es alfabético. `nextCursor` es siempre `null`: no hay paginación.

**Denuncia:** `POST /reports`:

```json
{ "contributionId": "<uuid>", "reason": "Contiene un rostro identificable", "turnstileToken": "<token>" }
```

Respuesta `202 { "accepted": true }`, sin revelar la resolución ni detalles del equipo. Es público (sin sesión). Orden: 1) cuerpo, `contributionId` UUID y `reason` de 1 a 500 caracteres tras `trim` → `400 INVALID_REQUEST` con `details.field`; 2) token Turnstile vacío o inválido → `403 CAPTCHA_FAILED`, sin tocar la base de datos; 3) límite de 5 denuncias/hora por clave y 3/hora por (clave, contribución) → `429 RATE_LIMITED`. Una contribución inexistente o no visible responde `202` igualmente, sin crear denuncia (el intento consume límite).

## 5. Contrato de validación de IA (interno, no endpoint público)

```ts
type ActionType = 'RECYCLING' | 'LITTER_COLLECTION';
type Decision = 'APPROVED' | 'NEEDS_EVIDENCE' | 'REJECTED';
interface ValidationInput { actionType: ActionType; description: string; originalImageBytes: Uint8Array; }
interface ValidationResult { decision: Decision; reason: string; }
```

- Prompt específico por acción; impedir que texto en la imagen/instrucciones del usuario redefinan la política. Validar salida JSON/enums/tamaños. `APPROVED` significa **plausibilidad suficiente**, nunca hecho probado.
- Timeout, error de cuota, 403, 429, formato inesperado ⇒ **fallo técnico sin aprobación** y estado `TECHNICAL_ERROR`/reintento manual. No fallback automático a pago ni proveedor distinto sin decisión explícita.
- El adaptador usa token/Account ID de Cloudflare en secretos de Supabase Edge Functions. Guardar en DB solo dictamen y razón sanitizada, no respuestas crudas ni imagen en logs.

## 6. Errores de dominio: ejemplos

| HTTP | `error.code` | Cuándo |
|---|---|---|
| `400` | `INVALID_REQUEST` | Cuerpo malformado o tipos incorrectos |
| `401` | `AUTH_REQUIRED` | Publicación/like sin sesión |
| `403` | `NOT_OWNER` | Intento de modificar aportación ajena |
| `403` | `PROFILE_REQUIRED` | Escritura sin perfil |
| `403` | `CANNOT_LIKE_OWN` | Me gusta (PUT/DELETE) sobre una publicación propia |
| `403` | `CAPTCHA_FAILED` | `POST /reports` con token Turnstile vacío o inválido |
| `429` | `RATE_LIMITED` | `POST /reports` supera el límite por hora |
| `404` | `PROFILE_REQUIRED` | `GET /profiles/me` sin perfil |
| `409` | `ALIAS_TAKEN` | El alias ya pertenece a otro perfil, sin distinguir mayúsculas |
| `409` | `PROFILE_EXISTS` | Segundo `POST /profiles` del mismo usuario |
| `409` | `PENDING_CONTRIBUTION_EXISTS` | Ya existe envío no resuelto del mismo tipo |
| `409` | `COOLDOWN_ACTIVE` | Último aprobado enviado hace < 60 min; `details.retryAt` |
| `409` | `INVALID_STATE` | Reintento/ocultación/cancelación fuera de estado permitido |
| `409` | `IDEMPOTENCY_CONFLICT` | Misma clave, payload diferente |
| `409` | `PHOTO_ALREADY_USED` | La foto ya está asociada a otra contribución |
| `413` | `IMAGE_TOO_LARGE` | `sizeBytes` supera 5 MB |
| `422` | `EXIF_REQUIRED` | Galería sin EXIF válido; pedir cámara |
| `422` | `INVALID_ALIAS` | Alias inválido después de aplicar `trim` |
| `422` | `ADULT_DECLARATION_REQUIRED` | `adultDeclared` ausente o distinto de `true` |
| `422` | `PHOTO_TOO_OLD` | EXIF anterior a 60 min o futuro |
| `422` | `PHOTO_NOT_FOUND` | `photoPath` no existe en el almacenamiento privado |
| `422` | `INVALID_MUNICIPALITY` | Código no existe en catálogo cargado |
| `422` | `UNSUPPORTED_MEDIA` | `contentType` no es JPEG, PNG ni WebP |
| `503` | `AI_UNAVAILABLE` | Proveedor no disponible (en reintento se refleja también en estado) |

**Contrato entre agentes:** interfaz común y esquemas de DTO en un único lugar; frontend nunca infiere puntos del tipo para agregarlos al ranking; solo renderiza la respuesta. Las rutas anteriores son la **versión 1** y cualquier cambio de semántica requiere actualizar este documento y criterios de aceptación antes de implementar.

## Fuentes

- [Supabase — routing de funciones](https://supabase.com/docs/guides/functions/routing)
- [Supabase — Auth CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
- [Cloudflare — Workers AI REST API](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
