# Runbook operativo — Staging, verificaciones y GO/NO-GO

**Estado:** sin pruebas ejecutadas; todos los resultados iniciales son **PENDIENTES**. Este documento se completa **durante la ejecución**, por un humano con asistencia de los agentes. **Fuente normativa para liberar:** [`docs/design/release-checklist.md`](../docs/design/release-checklist.md). Un resultado aparente de tests nunca constituye, por sí solo, autorización legal ni permiso de desplegar fotos de ciudadanos.

## 0. Preparación humana (T00, minuto 0–15)

- [ ] Designar Dev A, B, C, dueño de integración y persona de **GO/NO-GO**; designar persona que responde a denuncias y solicitudes de retirada/supresión.
- [ ] Confirmar cuentas **Free** Supabase y Cloudflare Pages/Workers AI/Turnstile, sin métodos de pago que habiliten facturación inesperada; cuota y supervisión de consumo visibles.
- [ ] Confirmar URL del proyecto/`pages.dev`, origen/CORS, claves públicas en frontend y secretos solo en Supabase Functions/Cloudflare. **Ninguna clave real en archivos del repo ni en logs.**
- [ ] En Supabase Auth: email/password habilitado, **confirmación de email desactivada**, CAPTCHA de registro configurado, sin dependencia SMTP ni dominio propio. Sin recuperación por email en beta.
- [ ] Obtener y sembrar códigos/nombres municipales desde **fuente oficial INE** (guardar referencia de fuente sin inventar códigos).
- [ ] Aprobar textos públicos mínimos: finalidad de la publicación, condiciones, responsable/contacto operativo, instrucciones sobre fotos de terceros y canal real de retirada/supresión. Mantener un operador disponible tras el lanzamiento.

## 1. Spike del proveedor (T02, antes del minuto 45)

- [ ] `@cf/google/gemma-4-26b-a4b-it` responde a imagen + texto reales desde Workers AI Free en **cuenta del equipo**.
- [ ] Revisadas condiciones/licencia aplicables a entidad en UE, privacidad y tratamiento de imágenes, cuota real, ausencia de facturación/pago automático; verificar compatibilidad de uso de ciudadano real antes de enviar datos.
- [ ] Probar al menos una evidencia propia plausible y una insuficiente para **cada** acción y registrar resultados sin subir fotos personales a commits.
- [ ] 403/429/timeout/JSON no válido resultan en fallo técnico o no aprobación, **nunca** en validación aprobada.

**Si no se cumplen:** bloquear cualquier beta pública; no reemplazar por un mock, otro proveedor ni API de pago sin decisión de cambio. Se puede continuar una demo **restringida** con contenido propio y validación simulada explícitamente rotulada.

## 2. Revisión por checkpoints

| Checkpoint | Momento objetivo | Prueba esencial | Responsable | Resultado/evidencia |
|---|---|---|---|---|
| H0 | 00:15 | permisos, contrato v1 y contacto definidos | Equipo | PENDIENTE |
| CP1 | 00:45 | DB/RLS, SPA build, prueba IA gratuita | A/B/C | PENDIENTE |
| CP2 | 01:25 | registro real sin email de confirmación, alias, salida IA tipada | A/B/C | PENDIENTE |
| CP3 | 02:05 | token Storage privado, galería EXIF, publicación saneada | A/B/C | PENDIENTE |
| CP4 | 02:55 | pending+cooldown+idempotencia+estado seguro | A/B/C | PENDIENTE |
| CP5 | 03:40 | recorrido completo IA real y puntos, staging | Equipo | PENDIENTE |
| CP6 | 04:15 | feed/ranking real, medios/RLS revisados | Equipo | PENDIENTE |
| CP7 | 04:30 | hide+revocación, likes, denuncia operativa | Equipo | PENDIENTE |
| FINAL | 05:00 | release checklist completo y decisión humana | Release owner | PENDIENTE |

La latencia de un agente puede desplazar estos tiempos; **no eliminar checks por retraso**.

## 3. Matriz de pruebas mínimas (registrar evidencia, nunca marcar PASS sin ejecutar)

| ID | Escenario | Resultado | Comando/pasos/commit |
|---|---|---|---|
| V01 | Anónimo consulta feed y ranking sin JWT | PENDIENTE | — |
| V02 | Registro con email/password sin confirmación, alias único, >=18, CAPTCHA y logout | PENDIENTE | — |
| V03 | Subida privada + foto/municipio/descripción → `PENDING` (202); original no público | PENDIENTE | — |
| V04 | IA real aprueba → copia saneada visible, 10/20 puntos una sola vez | PENDIENTE | — |
| V05 | Foto incongruente, `NEEDS_EVIDENCE`, `REJECTED`, timeout o cuota → 0 puntos | PENDIENTE | — |
| V06 | EXIF galería: 59/60/61 min, futuro y ausente; cámara diferenciada | PENDIENTE | — |
| V07 | Cooldown 59/60 min, municipio distinto, ocultación posterior; un pendiente/tipo con carreras | PENDIENTE | — |
| V08 | Cancelación vs retorno IA tardío, versión/lease e idempotencia de reintentos | PENDIENTE | — |
| V09 | Like reversible, sin auto-like ni puntos; orden feed 30 días, ranking con empates | PENDIENTE | — |
| V10 | Hide del autor revoca 10/20 y oculta feed/imagen (`404`, `no-store`), sin restauración | PENDIENTE | — |
| V11 | Anónimo/usuario B no acceden a originales, cambios de estado/puntos/identidad de A; RLS efectiva | PENDIENTE | — |
| V12 | Report anónimo con Turnstile válido; sin token/flood rechazado; operador revisa y retira manualmente | PENDIENTE | — |
| V13 | Imagen publicada sin EXIF/GPS, sin URLs permanentes a Storage, errores sin filtración de tokens | PENDIENTE | — |
| V14 | Interfaz usable en móvil: cámara/galería, estados, mensaje de pérdida de puntos | PENDIENTE | — |
| V15 | Pages HTTPS + Supabase API y CORS; scripts build/tests registrados; sin pago | PENDIENTE | — |

**Importante sobre medios:** si se dispone de un endpoint GET `/media/{id}`, el backend comprueba visibilidad **en cada acceso** y responde `Cache-Control: no-store`. Retirar una publicación no borra copias que ya tengan terceros. Los originales están siempre privados.

## 4. Comandos (comprobar antes de ejecutar)

Los scripts constituyen objetivos de arquitectura, **no se han verificado como existentes** en este turno. Usar comandos reales del repositorio una vez creados; registrar resultado exacto y variante equivalente en caso de no existir.

```bash
npm run build
npm run lint
npm test
npm run test:e2e
```

Se aplicarán migraciones PostgreSQL/Edge Functions con CLI oficial mediante credenciales humanas, revisión previa y entorno de prueba, no con comandos adivinados. Documentar URL, commit y método real utilizado. Si no existe la configuración de CI, hacer revisión humana y ejecutar verificaciones manuales, marcando riesgos explícitamente.

## 5. Comprobación de release público

- [ ] **Funcionamiento:** flujo V01–V15 verificado o todos los fallos/bloqueos resueltos; stack y endpoint correctos.
- [ ] **Acceso y datos:** RLS, buckets privados, sanitización, CAPTCHA, privacidad y retención mínima, canal de retirada y operador real disponibles.
- [ ] **IA/coste:** modelo/condiciones Free, evidencia visual real, tratamiento de imágenes, fallo seguro y cuota comprobados.
- [ ] **Negocio:** estados, 10/20 puntos aprobados una vez, cooldown 60 min, EXIF, hide revoca puntos.
- [ ] **Responsables:** decisor humano completa campos de abajo y asigna operador para primera ventana de funcionamiento.

**Regla innegociable:** cualquier gate crítico del [`release-checklist`](../docs/design/release-checklist.md) no satisfecho = **NO-GO público**. La alternativa es demo cerrada con fotos propias y registro externo deshabilitado. No llamar “beta pública” a una simulación.

| Campo | Valor humano / evidencia |
|---|---|
| Responsable GO/NO-GO | PENDIENTE |
| Fecha y hora | PENDIENTE |
| Commit exacto y URL desplegada | PENDIENTE |
| Evidencia de IA Free, licencia y tratamiento | PENDIENTE |
| Evidencia de RLS/privacidad/retirada | PENDIENTE |
| Canal y responsable de denuncias | PENDIENTE |
| Decisión | **PENDIENTE — beta pública no autorizada** |
| Bloqueantes o riesgos aceptados | PENDIENTE |

## 6. Operación posterior y rollback

- Si la IA gratuita llega a su cuota, **no** habilitar facturación ni validaciones optimistas: mantener error técnico y acceso a reintento si procede.
- Si hay fuga de originales, incumplimiento de privacidad o moderación imposible, deshabilitar envíos/registro público y retirar exposición de publicaciones afectadas; escalar al operador.
- Si se detecta acceso o puntuación indebida, restringir API y revocar secretos comprometidos; investigar antes de reabrir.
- Si el flujo principal no llega a los checkpoints, la decisión es NO-GO público y el equipo prepara demo restringida claramente identificada.
