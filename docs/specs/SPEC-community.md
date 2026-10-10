# SPEC — `community` (beta del hackathon)

**Estado:** revisada; pendiente de aprobación final · **RQs:** 15, 26, 30, 34, 54–55 (mínimos), 78–82 (reducidos).  
**Depende de:** `contributions`, `identity`. **Convenciones técnicas:** [capability-map.md](capability-map.md), §5.

## Objetivo y límites

Ofrecer un **feed público global** de contribuciones verificadas, con Me gusta sin puntos y un canal básico para señalar contenidos que deben retirarse.

**Dentro:** exploración pública sin registro, lectura de foto/descripción/autor/acción, Me gusta reversible, formulario mínimo de denuncia y **ocultación por el propio autor de una publicación ya aprobada**, con aviso y retirada de puntos.  
**Diferido:** feed local, panel de moderadores, reclamación formal completa, sustitución/difuminado y resolución de denuncias avanzada.

## Criterios de aceptación

- **COM-01:** Un visitante sin cuenta puede ver el feed global y acceder a publicaciones aprobadas públicamente accesibles (RQ-26, 78, 82).
- **COM-02:** Ninguna contribución pendiente, rechazada, cancelada, oculta o marcada como no publicable aparece en feed público (RQ-15 y salvaguarda mínima).
- **COM-03:** El feed incluye alias, imagen aprobada, descripción y tipo de acción; aplica ventana de **30 días desde aprobación** y orden descendente de Me gusta (RQ-79–81) si el rendimiento de la beta lo permite; de no hacerlo, declarar la adaptación explícitamente.
- **COM-04:** Un usuario autenticado puede dar un Me gusta a una publicación ajena y retirarlo; como máximo uno por pareja usuario/publicación, sin permitir uno propio (RQ-30, 34).
- **COM-05:** Dar o quitar Me gusta no genera ni revoca puntos de ningún tipo (RQ-30).
- **COM-06:** Cualquier visitante puede remitir una denuncia básica anónima indicando el motivo, identificando la publicación; no necesita crear cuenta (RQ-54–55).
- **COM-07:** Existe un procedimiento efectivo de respuesta por parte del equipo para ocultar/retirar contenido problemático; no se promete moderación automática. El formulario debe evitar abusos triviales y la visibilidad se controla en backend.
- **COM-08:** Se muestran información básica de privacidad/uso y un canal para solicitar retirada o supresión; la publicación pública de terceros identificables requiere base adecuada, no basta con una casilla declarativa.
- **COM-09:** El autor autenticado puede ocultar su publicación aprobada tras aviso explícito de **revocación de puntos** y confirmación. Inmediatamente deja de verse en feed y perfil público; los puntos se retiran (RQ-45). Solo el autor o administrador autorizado puede efectuar esta acción.

## Contrato ofrecido

`listPublicContributions()`, `toggleLike(contributionId)`, `submitAnonymousReport(contributionId, reason)`, `hideOwnContribution(contributionId)` (operaciones lógicas, sin asumir endpoints definitivos). Solo se leen imágenes autorizadas para publicación; no se expone almacenamiento privado de evidencias originales.

## Pruebas mínimas

Visita anónima, no publicación de pendiente, Me gusta único/reversible, intento de Me gusta propio, concurrencia simple de Me gusta, denuncia anónima y ocultación por autor comprobada en feed/perfil y ranking. Verificar que los Me gusta no cambian puntos y que una cuenta ajena no puede ocultar publicaciones de otros.

## Pendiente

Procedimiento operativo de moderación y retirada (quién recibe y con qué frecuencia), medidas antispam para denuncias anónimas, tratamiento legítimo de imágenes y datos de terceros. Sin estas decisiones no abrir una beta pública real.
