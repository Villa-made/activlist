# SPEC — `scoring` (beta del hackathon)

**Estado:** revisada; pendiente de aprobación final · **RQs:** 05, 07, 30–36, 37–41 (reducidos), 86–87 (diferidos).  
**Depende de:** `contributions`. **Convenciones técnicas:** [capability-map.md](capability-map.md), §5.

## Objetivo y límites

Mostrar un **ranking global histórico de ciudadanos**, derivado solo de sus contribuciones aprobadas, sin recompensas por popularidad.

**Dentro:** puntos fijos por tipo y clasificación global por total de puntos.  
**Diferido:** rankings por municipio, municipios entre sí, cortes semanales/mensuales, desempates avanzados y panel de puntuación configurables.

## Criterios de aceptación

- **SCO-01:** Reciclaje aprobado aporta **10** puntos; recogida aprobada **20**. Rechazada/pendiente aporta **0** (RQ-05, 36).
- **SCO-02:** Una contribución aprobada cuenta **exactamente una vez**, aunque se repita la operación o recarga (integridad).
- **SCO-03:** El ranking global suma puntos de las contribuciones aprobadas por autor y ordena por puntuación descendente; muestra alias y total (RQ-26–27, 37 adaptado).
- **SCO-04:** Dar o retirar un Me gusta **no cambia puntos** ni ranking (RQ-30; RQ-31–33, 35 sustituidos).
- **SCO-05:** Al ocultar/retirar una publicación aprobada a petición del autor (RQ-45), revocar sus puntos **exactamente una vez** y actualizar el ranking global. El usuario confirma tras ver el aviso de pérdida de puntos. Los Me gusta se mantienen desvinculados de puntos.
- **SCO-06:** Los clientes no pueden escribir directamente puntos ni estados de aprobación, ni alterar clasificaciones mediante campos enviados desde el navegador.

## Contrato ofrecido

`getGlobalLeaderboard() -> [{ rank, userId, alias, points }]` (forma lógica; paginación/interfaz se concreta en *API Design*). La puntuación se obtiene de aprobaciones verificadas; no se confía en totales calculados en el navegador.

## Pruebas mínimas

Dos usuarios y tres acciones con puntos esperados, empate simple, un envío duplicado, aprobación denegada y Me gusta. **Ocultación** de una acción aprobada con revocación exactamente una vez; verificar que no aparece ni puntúa, incluso después de recarga o respuesta IA tardía. Verificar que un usuario no modifica su puntuación desde el navegador.

## Pendiente

Orden secundario en empate para beta (propuesta: alias estable; no afirmar cumplimiento del desempate completo RQ-86/87). Implementar revocación mínima vinculada a RQ-45, sin un módulo administrativo específico.
