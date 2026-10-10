# ADR-001 — Arquitectura serverless modular con servicios gratuitos

- **Estado:** Accepted
- **Fecha:** 2026-10-10
- **Contexto:** beta pública en España, 3 desarrolladores+agentes, ocho horas iniciales y cuota monetaria 0 €. Cinco capacidades aprobadas (`identity`, `ai-validation`, `contributions`, `scoring`, `community`).
- **Decisión:** SPA React/Vite/TypeScript/Tailwind+shadcn/ui desplegada en Cloudflare Pages Free. Backend de negocio en Supabase Edge Functions (un único API HTTP versionado). Supabase Free aporta Auth, PostgreSQL y Storage privado. Separar módulos **lógicamente**, no en microservicios.
- **Alternativas:** React+FastAPI (más despliegues/integración), Next.js+Vercel (acoplamiento servidor/hosting y condiciones de uso del plan), backend autohospedado (operaciones fuera de plazo).
- **Consecuencias:** menos despliegues/servicios y más trabajo paralelo de UI/backend/IA, a cambio de límites serverless, dependencia de plataformas, falta de garantías de disponibilidad y restricciones gratuitas. Contratos y RLS antes de agentes.
- **Revisión:** si la beta supera cuotas o requiere cola durable, revisar sin rehacer reglas del dominio.
- **Fuentes:** https://supabase.com/docs/guides/functions/routing ; https://supabase.com/docs/guides/platform/billing-on-supabase ; https://developers.cloudflare.com/pages/platform/limits/
