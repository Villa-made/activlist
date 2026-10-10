# Hackathon beta — Mapa de capacidades y reglas de especificación

**Estado:** mapa de capacidades aprobado; especificaciones revisadas tras aclaraciones de alcance, **pendientes de validación final y pruebas de proveedor**.  
**Fuente de verdad funcional:** [`../requirements/mvp-requirements.md`](../requirements/mvp-requirements.md) (RQ-01–RQ-91).  
**Alcance aprobado para la entrega:** [`../ideas/product-concept.md`](../ideas/product-concept.md).  
**Regla:** el alcance reducido **no deroga** los RQs del producto completo. Toda simplificación se indica como «diferido» o «adaptación para la beta».

## 1. Capacidades aprobadas

| ID estable | Responsabilidad y frontera | Depende de | Spec |
|---|---|---|---|
| `identity` | Cuenta, sesión, alias y condición de usuario autenticado | — | [SPEC-identity.md](SPEC-identity.md) |
| `ai-validation` | Evaluar imagen y descripción; devolver dictamen estructurado **sin asignar puntos** | — | [SPEC-ai-validation.md](SPEC-ai-validation.md) |
| `contributions` | Catálogo fijo, municipio, fotos, creación, estados, cooldown obligatorio, EXIF y ocultación por el autor | `identity`, `ai-validation` | [SPEC-contributions.md](SPEC-contributions.md) |
| `scoring` | Puntuaciones por acciones aprobadas y ranking global | `contributions` | [SPEC-scoring.md](SPEC-scoring.md) |
| `community` | Feed público, publicaciones aprobadas, Me gusta, recepción básica de denuncias | `contributions`, `identity` | [SPEC-community.md](SPEC-community.md) |

**Orden de dependencias:** (`identity` || `ai-validation`) → `contributions` → (`scoring` || `community`). «Paralelo» describe independencia conceptual, **no** autoriza comenzar implementación antes de aprobar las specs.

**Sin módulos separados en la beta:** municipios (catálogo de referencia gestionado desde `contributions`), moderación avanzada, analítica y panel administrativo (diferidos al producto completo).

## 2. Recorrido imprescindible de aceptación

1. Un visitante abre la web y consulta feed y ranking sin cuenta.
2. Un adulto registra una cuenta mediante email y contraseña, declara ser mayor de 18 años y selecciona un alias único.
3. Un usuario autenticado selecciona **reciclar (10 puntos)** o **recoger residuos (20 puntos)**, indica un municipio español, adjunta fotografía y descripción y envía la contribución.
4. El servidor recibe la solicitud y consulta el modelo de visión a través de un servicio **protegido por credenciales de servidor**. Un resultado no aprobado **nunca** concede puntos ni crea una publicación visible.
5. El backend aplica cooldown obligatorio (60 min por usuario/tipo) y requisitos temporales de fotografías de galería (EXIF ≤60 min; si falta, pedir cámara). Si la IA aprueba la evidencia, se publica y puntúa **una sola vez**. Los Me gusta no alteran puntos.
6. El autor puede cancelar una contribución pendiente u **ocultar una ya aprobada** desde la web, tras confirmar la retirada de puntos según RQ-45. El contenido desaparece del feed/perfil público y los puntos se revocan; queda trazabilidad interna sujeta a la ley. Existe una vía anónima para denunciar y un procedimiento del equipo para retirar contenido.

**Definición de entrega:** web publicada y funcional de extremo a extremo con personas reales; no basta una demo simulada. **Puerta de seguridad de beta pública:** no publicar hasta comprobar acceso, tratamiento de datos, retirada de contenido y condiciones/licencia del proveedor de IA.

## 3. Matriz de alcance y trazabilidad

| Capacidad | RQs implementados/adaptados en beta | Diferidos explícitamente |
|---|---|---|
| `identity` | 26, 27, 29, 65, 66; 28 **solo email + contraseña** | 28 (Google y Apple), 47–49 (eliminación/recuperación automatizadas) |
| `ai-validation` | 03, 04, 18, 21 (versión mínima de dictamen); 91 **adaptado a procesamiento simplificado** | 57–58 (audio), 89–90 (reintentos avanzados), 91 (ejecución asíncrona robusta) |
| `contributions` | 02, 05, 09, 10–11, 14, 18–25, 36, 42–44, 45 (ocultación con revocación), 75 y 77 adaptados: solo provincia de Barcelona, 88 (cancelación) | 46 (política completa de retención), 60–62 (administración/versión de catálogo) |
| `scoring` | 05, 36, 45 (revocación) y ranking **global histórico** (adaptación de 06–08, 37–41) | rankings locales, municipales, semanales, mensuales, desempates (06–08, 37–41, 83–87) |
| `community` | 15, 26, 30, 34, 45 (ocultación por autor), 78–82 **solo feed global**, 54–55 **denuncia mínima** | feed local, moderación completa (12–13, 50–56), perfil/historial completo |

**Atención:** RQ-31, RQ-32, RQ-33 y RQ-35 están sustituidos: **los Me gusta nunca otorgan puntos**. Todo lo diferido continúa definido en `mvp-requirements.md` y no se considera entregado en la beta.

## 4. Supuestos técnicos propuestos — NO aprobados aún

- **Stack candidato:** React + Vite + TypeScript; Supabase Free (Auth, PostgreSQL, Storage, Edge Functions); Cloudflare Pages Free; Cloudflare Workers AI con modelo visual. La compatibilidad real de integración y las cuotas deben probarse antes del lanzamiento.
- **Arquitectura:** web SPA + servicios gestionados, sin microservicios ni segundo backend independiente. La API y los permisos de acceso se concretarán en *System Design*.
- **Ubicación:** código INE del municipio aportado por usuario, sin verificar ubicación real; GPS puede ser una mejora diferida.
- **IA:** `@cf/google/gemma-4-26b-a4b-it` (Gemma 4 Vision) en Cloudflare Workers AI es **candidato preferente**, condicionado a prueba efectiva de visión/entrada de imagen, acceso real desde la cuenta Free, revisión de licencia Gemma 4 y tratamiento de datos para beta pública española. La oferta Free contempla 10.000 neuronas/día, no capacidad ilimitada. **Descartado** `@cf/meta/llama-3.2-11b-vision-instruct` por las restricciones europeas de licencia de la modalidad visual. Sin fallback automático a pago.

Fuentes: [Gemma 4 Vision en Cloudflare](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/), [Cloudflare Workers AI — precios y cuota gratuita](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Cloudflare — tratamiento de datos](https://developers.cloudflare.com/workers-ai/platform/data-usage/), [licencia Gemma](https://ai.google.dev/gemma/terms/), [restricción UE de Llama 3.2 visual](https://dev.meta.ai/llama/llama3_2/use-policy), [Supabase Free](https://supabase.com/pricing).

## 5. Estándar compartido de ingeniería (propuesta para aprobar con estas specs)

- **Estructura orientativa (no creada ni verificada):** `src/` UI y módulos, `supabase/functions/` funciones privilegiadas, `supabase/migrations/` migraciones, `tests/` unitarias/integración, `e2e/` flujo público, `docs/specs/` contratos.
- **Comandos objetivo:** `npm run dev`, `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`. Son **contratos a configurar**, no comandos ya verificados en un repositorio existente.
- **Estilo:** TypeScript estricto, nombres explícitos (`ContributionStatus`, `awardPoints`), contratos tipados; validación de datos en fronteras externas. Ejemplo de contrato de dominio (ilustrativo, no código a implementar ahora): `type ValidationDecision = 'APPROVED' | 'NEEDS_EVIDENCE' | 'REJECTED'`.
- **Pruebas:** unitarias para invariantes (puntos, permisos, cooldown); integración para auth/RLS, persistencia y dictamen inválido; E2E para flujo visitante → alta → envío → aprobación → ranking → feed; pruebas manuales con imágenes positivas y negativas.
- **Always:** secretos solo servidor, autorización en backend, cierre por defecto ante error de IA, pruebas antes de commits, no imágenes públicas antes de validación, cambios trazados a RQ.
- **Ask first:** cambiar alcance, añadir servicios de pago, proveedor de IA, políticas de datos, migraciones destructivas o reglas de puntuación.
- **Never:** publicar claves, permitir escrituras públicas en puntos, subir imágenes de terceros al modelo sin condiciones de uso compatibles, tratar una imagen como prueba concluyente.

## 6. Decisiones abiertas que bloquean o condicionan la beta pública

1. **Comprobar Cloudflare Workers AI + Gemma 4 Vision en una cuenta Free** para una beta en España: aceptación de licencia, imagen real de prueba, cuota y privacidad. Hasta completar esta prueba, el proveedor/modelo no se considera definitivamente validado.
2. **Requisitos obligatorios de lanzamiento confirmados:** cooldown de 60 minutos y EXIF temporal válido de galería (≤ 60 minutos); bloqueo de una contribución pendiente por tipo; ocultación de publicaciones aprobadas por el autor con revocación de puntos (RQ-45). Falta verificar técnicamente lectura EXIF, cámara web y atomicidad ante concurrencia.
3. **Flujo de IA:** evaluar si el servicio gratuito permite una validación no bloqueante dentro del plazo. En esta entrega no se promete una cola asíncrona duradera ni reintentos complejos.
4. **Seguridad y derechos:** confirmar texto de privacidad, base jurídica, cómo se tramitan denuncias anónimas, retirada rápida de contenido y solicitudes de supresión. Un simple consentimiento declarado no sustituye el cumplimiento.
5. **Calidad del modelo:** definir lote pequeño de ejemplos reales/negativos y criterio mínimo para permitir la beta pública. Una fotografía no demuestra autoría ni impacto ambiental real.

**Gate:** los cinco archivos `SPEC-*.md` incorporan las aclaraciones del usuario, pero continúan sujetos a aprobación explícita. No iniciar implementación hasta completar la prueba de proveedor, decidir medidas mínimas de privacidad para beta pública y aceptar las specs.
