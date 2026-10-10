# SPEC — `contributions` (beta del hackathon)

**Estado:** revisada; pendiente de aprobación final · **RQs:** 02, 05, 09–11, 14, 18–25, 36, 42–44, 75, 77 (según alcance).  
**Depende de:** `identity`, `ai-validation`. **Convenciones técnicas:** [capability-map.md](capability-map.md), §5.

## Objetivo y límites

Registrar una acción medioambiental con fotografía y descripción, identificar el municipio y obtener un dictamen seguro de la IA. Mantener una única fuente de verdad de aprobación utilizada por puntos y feed.

**Catálogo inicial fijo:** `RECYCLING` = **10** puntos; `LITTER_COLLECTION` = **20** puntos. Sin consola de administración para modificarlo en el hackathon. La ampliación y versionado de RQ-60–62 quedan diferidos.

## Comportamiento / criterios de aceptación

- **CON-01:** Solo un usuario autenticado puede crear una contribución; se exige tipo permitido, descripción no vacía, una imagen y municipio español seleccionado (RQ-02, 14, 18, 20, 26, 75, 77).
- **CON-02:** El municipio se guarda mediante código identificador INE si el catálogo está disponible; la declaración manual prevalece y no se comprueba con GPS (RQ-09, 44, 77). **Adaptación a confirmar:** el GPS puede omitirse en la beta.
  **Adaptación beta (2026-10-10):** el catálogo cargado se limita a los 311 municipios de la provincia de Barcelona (INE, CPRO 08); ampliar a toda España (RQ-75) consiste en regenerar el catálogo sin filtro.
- **CON-03:** Se registra en servidor una fecha UTC inmutable y se conserva el valor de puntos correspondiente al tipo de acción en el momento del envío (RQ-05, 23, 36, 60).
- **CON-04:** Estados mínimos: `PENDING` → `APPROVED` / `NEEDS_EVIDENCE` / `REJECTED` / `TECHNICAL_ERROR`. Solo `APPROVED` puede entrar en el feed y puntuación (RQ-03–04).
- **CON-05:** No se publicará automáticamente una imagen recibida antes de aprobación. La descripción aprobada no se editará desde la interfaz (RQ-15, 59).
- **CON-06:** Una misma contribución no podrá aprobarse ni generar puntos dos veces por reenvío, recarga o repetición de respuesta del servicio (integridad).
- **CON-07:** Al rechazar o declarar insuficiente una evidencia, mostrar motivo y permitir al usuario comprender el estado. La aportación posterior de nuevas evidencias requiere una interacción definida antes de implementación (RQ-04).
- **CON-08:** **Obligatorio:** tras una contribución aprobada, bloquear nuevas contribuciones del mismo `usuario + tipo` durante 60 minutos desde su registro original en servidor. Rechazadas/canceladas no activan cooldown; el municipio no afecta al cálculo (RQ-10–11, 23, 42).
- **CON-09:** **Obligatorio:** máximo una contribución pendiente por `usuario + tipo`; el usuario puede cancelarla sin puntos ni cooldown y una respuesta tardía de IA no puede reactivarla (RQ-43, 88).
- **CON-10:** **Obligatorio:** fotografía de galería con fecha EXIF válida, no futura y capturada hace como máximo 60 minutos respecto al servidor. Si falta o no es válida, pedir nueva foto mediante cámara web. No buscar similitudes visuales entre fotos (RQ-22, 24–25).
- **CON-11:** El autor puede **ocultar una contribución aprobada** tras un aviso de pérdida de puntos y confirmación expresa. La publicación desaparece de feed/perfil público, se marca retirada internamente (*soft delete*) y revoca sus puntos, conforme a RQ-45. No permite modificar la descripción validada.

## Políticas obligatorias también en la beta

- **Cooldown (RQ-10, 11, 23, 42):** 60 minutos por `usuario + tipo de acción`, desde el registro original de la **última contribución aprobada**. La rechazadas no activan cooldown. No depende del municipio.
- **Máximo pendiente (RQ-43):** una contribución pendiente por usuario y tipo; una cancelación libera bloqueo (RQ-88).
- **Galería (RQ-22, 25):** EXIF de fecha válida, no futura y de antigüedad ≤ 60 min frente al reloj del servidor. Si falta, pedir fotografía nueva desde cámara. No detectar similitud ni reutilización visual (RQ-24). **EXIF puede manipularse y `capture` del navegador no certifica origen.**

**Decisión confirmada para beta:** implementar **sin excepción** cooldown, máximo una pendiente, comprobación EXIF y ocultación de aprobadas por el autor. Si la plataforma web o el proveedor impiden alguna regla, no presentarla como satisfecha ni abrir la beta real hasta resolverla. La cámara web no constituye prueba infalsificable del origen de la imagen.

## Contrato ofrecido a `scoring` y `community`

Leer contribuciones aprobadas con `contributionId`, `authorId`, `actionType`, `awardedPoints`, `municipalityCode`, `submittedAtUtc`, `approvedAtUtc`, `description`, `photoReference` y visibilidad. El contrato lógico no fija todavía la estructura física de tablas.

## Pruebas mínimas

Sin sesión, campos ausentes, municipio inválido, tipos no permitidos, transiciones no autorizadas, doble aprobación, evidencias no aprobadas, imágenes privadas previas a aprobación; **obligatorias:** pruebas límite de EXIF (faltante, futuro, 60/61 min), cooldown (59/60 min), pendientes concurrentes, cancelación vs. respuesta tardía y ocultación vs. concesión/revocación de puntos.

## Pendiente

Verificación práctica del origen de cámara frente a galería en navegadores (sin afirmar que puede certificarse de forma absoluta); cómo recibir evidencias suplementarias con un único registro; qué hacer al bloquear el proveedor gratuito; fuente exacta y disponibilidad del catálogo INE.
