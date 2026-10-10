# Puertas de verificación — Beta pública

**Estado:** diseño cerrado; **ningún control de despliegue se considera superado todavía**. No equivale a auditoría legal o de seguridad. Responsable operativo: equipo del hackathon.

## Imprescindibles antes de abrir registros públicos

- [ ] **Coste cero efectivo:** Supabase Free, Cloudflare Pages Free, Workers AI Free; no método de pago que habilite consumos superiores ni actualizaciones automáticas. Comprobar cuotas y límites en la cuenta real.
- [ ] **Proveedor IA válido:** probar `@cf/google/gemma-4-26b-a4b-it` con imagen + texto reales **de prueba**, revisar licencia/territorio, condiciones de procesado y calidad de aprobación/no aprobación. No enviar fotos de ciudadanos hasta cerrar esta prueba.
- [ ] **Auth sin email:** correo+contraseña registra e inicia sesión sin SMTP; alias único/edad ≥18; CAPTCHA activo, protección ante abuso; UI comunica que el correo **no se verifica** y que no hay recuperación por email.
- [ ] **Control de acceso:** usuario no puede crear/editar actos ajenos, asignar puntos, consultar email de otros o leer fotos privadas. Probar endpoints directamente sin UI. RLS efectiva y secretos solo backend.
- [ ] **Imágenes:** validar EXIF original de galería y límite 60 min (59, 60 y 61); cámara web con flujo diferenciado; transformar para publicar sin metadatos EXIF/GPS; publicación bloqueada si falla limpieza. Comprobar acceso tras ocultación y cabeceras no-cache.
- [ ] **IA e idempotencia:** APROBADA puntúa una vez; RECHAZADA/INSUFICIENTE/FALLO puntúan cero; cancelar vs respuesta tardía; reintentar bloqueo; cooldown 60 minutos incluso tras ocultar aprobada.
- [ ] **Ocultación y denuncia:** autor oculta y revoca puntos, no aparece en feed/ranking; Turnstile + protección de tasa en denuncias anónimas; designar persona del equipo que revisa y puede retirar manualmente contenido desde consola segura.
- [ ] **Privacidad mínima:** aviso de privacidad visible, información de uso, responsable/contacto operativo y canal para solicitudes de supresión; instrucción de no publicar terceros identificables sin base legítima, respuesta viable a retiradas. Determinar retención y cómo borrar datos; no prometer anonimato ni cumplimiento garantizado.
- [ ] **Prueba E2E real:** visitante → registro → subir imagen → aprobación → puntos → ranking/feed → like → ocultación → puntos 0; y casos negativos/sin sesión.
- [ ] **Despliegue:** HTTPS en URL `pages.dev`, CORS autorizado, errores seguros, evidencias de comprobaciones guardadas por el equipo.

## Criterios de decisión

**GO** solo si todos los puntos anteriores se han verificado. **NO-GO** si falta acceso real a IA gratuita, autenticación segura, control de fotos, retirada rápida o condiciones básicas de tratamiento de datos. Alternativa mientras tanto: demo controlada con imágenes de prueba y registros cerrados, **no presentar como beta pública**.

## Riesgos aceptados expresamente (sin fingir mitigación total)

1. Direcciones de email no verificadas y recuperación de cuenta no automatizada; simplificación temporal a corregir antes de producto estable.
2. Validación visual probabilística: fotos/EXIF falsificables, posibles falsos positivos y falsos negativos.
3. Sin cola durable: fallos y reinicios exigen reintento del autor; UX informa de estado real.
4. Cuotas gratuitas y posibles pausas/caídas; no existe SLA de beta.
5. Cachés o capturas externas previamente realizadas no pueden ser retiradas retrospectivamente.

## Fuentes (consultadas 2026-10-10)

- [Supabase — confirmación de email opcional](https://supabase.com/docs/guides/auth/general-configuration)
- [Supabase — cuota Free](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Cloudflare — Workers AI Free](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare — política de datos Workers AI](https://developers.cloudflare.com/workers-ai/platform/data-usage/)
