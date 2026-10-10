# Concepto de producto — Beta pública del hackathon

**Estado:** alcance del hackathon aprobado · **Fase:** `idea-refine` · **Requisitos de referencia:** [`mvp-requirements.md`](../requirements/mvp-requirements.md) (`RQ-01`–`RQ-91`).

## Problema y propuesta de valor

¿Cómo motivar a ciudadanos a realizar **acciones medioambientales recurrentes**, haciendo visible y reconociendo su contribución a la comunidad?

La propuesta combina **evidencias fotográficas, validación asistida por IA y reconocimiento público** mediante puntos, rankings y publicaciones. La IA evalúa indicios razonables, **no certifica** de forma concluyente que la persona haya realizado la acción.

## Dirección aprobada

Lanzar una **beta pública web responsive**, accesible a ciudadanos reales, mediante una **vertical slice** completa. No intentar implementar los 91 requisitos en el hackathon: estos permanecen como alcance objetivo del producto futuro. Descartamos tanto desarrollar el MVP completo en 8 horas como limitar la entrega a una maqueta sin flujo funcional.

**Restricciones:** 3 desarrolladores supervisando agentes de IA; 8 horas para definir, implementar, probar y presentar; **0 € en alojamiento, base de datos y API de IA** dentro de cuotas gratuitas. Priorizar tecnologías bien documentadas, baja complejidad y despliegue sencillo. La elección definitiva del proveedor de IA y sus condiciones de uso público queda pendiente de validación.

## Alcance mínimo de la beta

1. **Identidad:** registro/inicio de sesión simplificado y alias público para aportar acciones; lectura pública sin cuenta (`RQ-26`, `RQ-27`, `RQ-29`).
2. **Contribución:** elegir entre **reciclar** (10 puntos) y **recoger residuos** (20 puntos), aportar fotografía y descripción, e indicar municipio (`RQ-02`, `RQ-14`, `RQ-18`–`RQ-20`, `RQ-36`, `RQ-77`).
3. **Validación:** enviar imagen y texto a un servicio de IA; **no otorgar puntos sin aprobación** y mostrar un resultado comprensible (`RQ-03`, `RQ-04`, `RQ-21`).
4. **Reconocimiento:** sumar puntos de acciones aprobadas y mostrarlos en un **ranking consultable**; los Me gusta, si se incluyen, **no puntúan** (`RQ-05`, `RQ-30`, `RQ-36`–`RQ-40`).
5. **Comunidad:** mostrar contribuciones aprobadas con fotografía, descripción y autor en un **feed público** (`RQ-15`, `RQ-78`).

**Criterio de entrega del hackathon:** un visitante puede ver el feed/ranking y un usuario real puede completar el recorrido **registro → evidencia → validación → publicación → puntos/ranking** en una web desplegada. No se considerará suficiente una demostración exclusivamente simulada.

## No implementar en la entrega inicial

- Panel administrativo completo, gestión avanzada de catálogo y estadísticas CSV (`RQ-61`–`RQ-62`, `RQ-72`–`RQ-74`): no son esenciales para demostrar el recorrido.
- Rankings en todas las modalidades, analítica, período de evaluación y funcionalidades avanzadas de comunidad (`RQ-37`–`RQ-41`, `RQ-67`–`RQ-87`): quedan en el producto objetivo.
- OAuth con todos los proveedores, recuperación de cuentas, complejidad completa de estados/reintentos y moderación avanzada (`RQ-28`, `RQ-43`, `RQ-48`–`RQ-49`, `RQ-88`–`RQ-91`): fuera de la vertical slice salvo necesidad operativa.
- Apps nativas, rachas, insignias y puntos por Me gusta: excluidos también del MVP objetivo (`RQ-29`, `RQ-30`, `RQ-64`).

> **No posponer las salvaguardas indispensables para una beta pública:** controles de acceso, secretos en servidor, información básica de privacidad, retirada/denuncia de contenido y posibilidad de atender solicitudes de supresión. Las imágenes identificables de terceros requieren tratamiento legítimo. La autorización de una demo no exime de las obligaciones legales.

## Hipótesis y cómo comprobarlas

- [ ] **Adopción:** ciudadanos reales completan el flujo sin ayuda → observar registros y contribuciones aprobadas durante la beta.
- [ ] **Fricción tolerable:** fotografiar y describir una acción no impide participar → observar abandonos y feedback de usuarios.
- [ ] **IA útil:** la validación distingue ejemplos válidos de pruebas insuficientes → probar casos reales y casos negativos etiquetados, revisar errores antes de abrir la beta.
- [ ] **Interés sostenido:** el reconocimiento favorece la repetición → medir después del lanzamiento la retención semanal según `RQ-67`–`RQ-71` (objetivo del producto: media ≥ 30 % en ocho semanas completas; **no evaluable dentro de las ocho horas del hackathon**).

## Riesgos y decisiones aún abiertas

- **IA gratuita y privacidad:** confirmar un modelo visual gratuito que permita legalmente una **beta pública en España**, sus cuotas, licencias y el tratamiento de las fotografías. No subir imágenes reales de ciudadanos a un proveedor sin esta comprobación.
- **Fiabilidad y abuso:** una foto aislada, sus EXIF y un municipio declarado no prueban la acción; la beta debe comunicar la incertidumbre y no presentar los puntos como impacto auditado.
- **Lanzamiento público:** definir el mecanismo mínimo de denuncias/retirada, consentimiento/información, retención y protección de terceros **antes de abrir registros reales**.
- **Especificación siguiente:** concretar contratos, pruebas de aceptación y el conjunto exacto de RQs implementados, simplificados o diferidos en `spec-driven-development`.
