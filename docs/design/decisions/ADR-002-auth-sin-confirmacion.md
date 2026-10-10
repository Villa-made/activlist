# ADR-002 — Registro sin confirmación de email en la beta

- **Estado:** Accepted (excepción temporal)
- **Fecha:** 2026-10-10
- **Contexto:** registro público necesario; el equipo no posee dominio propio ni quiere un proveedor SMTP. Se pretende reducir tiempo y gastos. Los correos no se necesitan para las acciones medioambientales.
- **Decisión:** Supabase Auth con email+contraseña, desactivando `Confirm Email`. Acceso inmediato; perfil con alias único y declaración ≥18 años. Proteger signup con CAPTCHA Turnstile soportado por Supabase. **No** configurar SMTP, email de verificación ni recuperación por correo para esta entrega.
- **Alternativas:** SMTP con dominio (no disponible); OAuth (aplazado); anónimo (no cumple identidad persistente); bloqueo por invitación (no cumple beta pública).
- **Riesgos/consecuencias:** la dirección no prueba pertenecer al registrante, posibilidad de suplantación/registro con correo ajeno y recuperación manual no garantizada. Informar de esta limitación, limitar abusos y habilitar una vía de privacidad/supresión. Requerir verificación email antes de uso sostenido o ampliación.
- **Verificación:** registrar sin email, iniciar sesión, impedir alias repetido, comprobar CAPTCHA y permisos; verificar que nunca se expone correo.
- **Fuente:** https://supabase.com/docs/guides/auth/general-configuration ; https://supabase.com/docs/guides/auth/auth-captcha
