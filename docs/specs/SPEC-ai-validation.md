# SPEC — `ai-validation` (beta del hackathon)

**Estado:** revisada; pendiente de aprobación y prueba del proveedor · **RQs:** 03, 04, 18, 21; 89–91 diferidos/adaptados.  
**Convenciones técnicas comunes:** [capability-map.md](capability-map.md), §5.

## Objetivo y límites

Evaluar una **fotografía + descripción escrita** frente a la acción seleccionada y entregar un dictamen estructurado, **sin publicar ni otorgar puntos**. La evaluación indica plausibilidad, no certifica autoría o realización concluyente.

**Dentro:** integración visual mediante servicio backend, dictamen explicable y cierre seguro ante incertidumbre/fallo. **Candidato:** Cloudflare Workers AI + `@cf/google/gemma-4-26b-a4b-it` (Gemma 4 Vision), condicionado a validación real. **No utilizar** Llama 3.2 Vision para este equipo en la UE por sus restricciones de licencia.  
**Diferido:** transcripción de voz, reintentos sofisticados, evaluación asíncrona duradera, moderación por IA adicional.

## Contrato ofrecido a `contributions`

Entrada lógica: `{ actionType, image, description }` (datos provenientes de servidor y storage autorizado).  
Salida lógica: `{ decision: APPROVED | NEEDS_EVIDENCE | REJECTED, reason: string }`.

**Semántica:** `APPROVED` solo ante indicios razonables y coherentes; `NEEDS_EVIDENCE` ante incertidumbre; `REJECTED` cuando contradice claramente la acción o incumple criterios. Respuesta malformada, límite gratuito, error o timeout **nunca** equivalen a `APPROVED`; se devuelven como error técnico no puntuable. Toda salida externa se valida antes de interpretarla.

## Criterios de aceptación

- **AI-01:** Foto y descripción congruentes con reciclaje o recogida de residuos → dictamen explícito; nunca puntuar dentro de este módulo.
- **AI-02:** Fotografía no relacionada, sin descripción o evidencia claramente insuficiente → no aprobar; devolver motivo entendible (RQ-04, 18, 21).
- **AI-03:** Respuesta no parseable, error de cuota, token inválido o fallo de conexión → no aprobar por defecto, sin filtrar secretos.
- **AI-04:** Las credenciales de IA solo existen en el servidor; no aparecen en el bundle del navegador ni en respuestas públicas.
- **AI-05:** Aceptar y verificar licencia Gemma 4, uso del modelo en España y condiciones de tratamiento de imágenes antes de subir fotografías de ciudadanos reales; probar una solicitud visual real en el plan Free. Exceder la cuota no debe habilitar pagos ni aprobar por defecto.

## Pruebas mínimas

Mock del proveedor para tres decisiones y fallo; pruebas con ejemplos positivos, negativos y ambiguos de ambas acciones. Documentar falsos positivos evidentes. **No afirmar garantía antifraude**.

## Pendiente

Verificación efectiva de Gemma 4 Vision con imágenes, respuestas y cuota Free (10.000 neuronas/día según Cloudflare, no una garantía de número de validaciones), licencia y tratamiento de datos; umbral empírico aceptable para la beta, duración máxima/timeout y comportamiento si el usuario abandona la pantalla. Fuentes: https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/ ; https://developers.cloudflare.com/workers-ai/platform/pricing/ ; https://developers.cloudflare.com/workers-ai/platform/data-usage/ ; https://ai.google.dev/gemma/terms/ .
