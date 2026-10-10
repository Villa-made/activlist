# ADR-003 — Puntuación derivada y retirada irreversible de visibilidad

- **Estado:** Accepted
- **Fecha:** 2026-10-10
- **Contexto:** puntos por acción aprobada, cooldown obligatorio y ocultación voluntaria con revocación de puntos. Riesgo de duplicados por reintentos y fallos de IA.
- **Decisión:** fijar `points_snapshot` (10/20) en contribución; calcular puntuación/ranking mediante suma de filas `APPROVED AND hidden_at IS NULL`, sin saldo de usuario mutable. Ocultar es *soft delete* mediante `hidden_at` atómico: retira feed/foto y puntos **exactamente una vez**, sin reactivar ni eludir cooldown. Reservar transiciones con versión y comprobar que `CANCELLED`/`HIDDEN` nunca reciben aprobación tardía.
- **Alternativas:** incrementar saldo con cada aprobación/reversión (necesitaría ledger/idempotencia adicional); borrar físicamente (perdería auditoría y cooldown); ocultar sin revocar (rechazado explícitamente por el usuario).
- **Consecuencias:** lectura agregada algo más costosa a escala, pero fuente de verdad única, coherencia por diseño y eliminación sencilla de errores de compensación. Más adelante se podrá materializar una vista derivada manteniendo semántica.
- **Verificación:** doble callback, doble ocultación, ocultación vs respuesta tardía, puntos tras ocultar, cooldown tras ocultar.
