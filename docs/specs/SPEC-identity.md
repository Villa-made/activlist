# SPEC — `identity` (beta del hackathon)

**Estado:** propuesta pendiente de aprobación · **RQs:** 26, 27, 28 (parcial), 29, 65, 66.  
**Convenciones técnicas comunes:** [capability-map.md](capability-map.md), §5.

## Objetivo y límites

Permitir registro e inicio de sesión básicos para ciudadanos adultos, con alias único. **Solo lectura pública** sin iniciar sesión; la identidad del usuario autenticado se usa para autorizar contribuciones y Me gusta.

**Dentro:** email + contraseña, cierre de sesión, alias único, declaración de mayoría de edad, sesión protegida.  
**Diferido:** Google/Apple, recuperación automática de cuentas, perfiles avanzados y administración de usuarios. Debe existir una vía real para solicitar acceso/supresión de datos antes de abrir la beta.

## Comportamiento / criterios de aceptación

- **ID-01:** Dado un visitante sin sesión, cuando intenta publicar o dar Me gusta, el sistema exige autenticación; sí puede ver feed y ranking (RQ-26).
- **ID-02:** Dado un registro válido por email/contraseña, el usuario obtiene una identidad persistente y elige un alias único; no puede apropiarse de uno existente (RQ-27, 28 parcial).
- **ID-03:** Dado que el usuario no confirma tener ≥ 18 años, el registro se bloquea; la declaración no se presenta como verificación de identidad (RQ-65–66).
- **ID-04:** Dado un usuario autenticado, tras cerrar sesión pierde capacidad de crear/alterar contenido sin volver a autenticarse.
- **ID-05:** Ninguna operación de contribución o Me gusta permite suplantar `userId` suministrándolo desde el cliente; la identidad procede de la sesión verificada.
- **ID-06:** El sistema proporciona un canal documentado para solicitudes de retirada/supresión mientras la gestión automatizada permanece diferida.

## Contrato ofrecido a otros módulos

- Consultar identidad autenticada (`userId`, `alias`); comprobar sesión válida.
- Consultar `alias` público para mostrar autor de contribución; **nunca** exponer email en feed ni ranking.

## Pruebas mínimas

Registro, alias duplicado, mayoría de edad no confirmada, sesión caducada, cierre de sesión, visitante y suplantación de usuario. Verificar políticas de acceso reales (no solo ocultación en UI).

## Pendiente

Acordar si el email debe verificarse antes de contribuir; confirmar disponibilidad del correo transaccional gratuito y la vía operativa de supresión. No asumir proveedores OAuth en esta beta.
