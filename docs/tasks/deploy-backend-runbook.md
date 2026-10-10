# Runbook de despliegue del backend — Supabase (+ notas para Cloudflare Pages)

**Subtarea:** T23-A (preparación, parte de A). **No** es la T23 completa: el despliegue real es de C y requiere **autorización humana**. Este documento solo describe los pasos; ningún agente los ejecuta contra staging/prod.

**Para quién:** la persona que despliega un proyecto Supabase **nuevo** (staging o prod) con credenciales propias. Cada paso tiene casilla; anota resultado y evidencia en el [runbook operativo](release-runbook.md). La decisión GO/NO-GO **no** se toma aquí: ver §9.

**Arquitectura:** SPA React/Vite en Cloudflare Pages Free; Supabase Free (Auth, Postgres, Storage privado y una sola Edge Function `api`) — [ADR-001](../design/decisions/ADR-001-arquitectura-serverless.md), [architecture.md](../design/architecture.md). Base de la API: `https://<ref>.supabase.co/functions/v1/api/v1` ([api-contracts.md §1–§4](../design/api-contracts.md)).

**Reglas que no se negocian**

- Ningún valor secreto en el repo, en issues, en capturas ni en logs. Solo nombres.
- Nada de `DROP`, `supabase db reset` ni borrado de buckets/datos sin autorización humana explícita.
- Cuentas Free sin método de pago (ver [release-checklist](../design/release-checklist.md), "Coste cero efectivo").

---

## 1. Requisitos

- [ ] Cuenta Supabase en plan **Free**, sin método de pago registrado. Proyecto nuevo creado por el humano; anota su `project-ref` (subdominio de `https://<ref>.supabase.co`) y guarda la contraseña de la base de datos en tu gestor de contraseñas, no en el repo.
- [ ] Cuenta Cloudflare Free sin método de pago (Pages + Turnstile).
- [ ] [Supabase CLI](https://supabase.com/docs/reference/cli/introduction) instalada y sesión iniciada (`supabase login`).
- [ ] [Deno](https://docs.deno.com/runtime/getting_started/installation/) 2.x (para el smoke test, §7).
- [ ] Trabajar desde un checkout limpio del commit que se va a publicar (`git status` limpio, `git log -1` anotado en el runbook operativo).
- [ ] Enlazar el proyecto desde la raíz del repo:

```bash
supabase link --project-ref <ref>
```

Pide la contraseña de la base de datos de forma interactiva (también admite `-p`, pero no la pongas en el historial de la shell). Comprueba que el `ref` es el del proyecto **nuevo** y no el de DEV (`eaxcrsddddjodibuvaol`).

## 2. Base de datos: migraciones

Las migraciones del repo se aplican **todas y en orden** (por su prefijo de fecha). Lista explícita:

- [ ] `20261010000100_schema.sql` — tablas `profiles`, `municipalities`, `contributions`, `likes`, `reports`; invariantes y trigger de campos inmutables; RLS activada sin políticas.
- [ ] `20261010000200_security.sql` — revoca todo a `anon`/`authenticated`, única política `profiles_select_own`, privilegios por defecto sin EXECUTE y buckets privados `evidence-private` / `published-private`.
- [ ] `20261010000300_municipalities_ine_barcelona.sql` — catálogo INE oficial, 311 municipios de la provincia de Barcelona.
- [ ] `20261010000400_contribution_create_rpc.sql` — RPC `create_contribution` (cooldown, pendiente única, idempotencia).
- [ ] `20261010000500_validation_rpc.sql` — RPC de validación: `complete_validation`, `mark_technical_error`, `cancel_contribution`, `retry_validation`, `submit_evidence`.
- [ ] `20261010000600_public_reads.sql` — `get_feed`, `get_leaderboard` e índice de likes.
- [ ] `20261010000700_hide_rpc.sql` — `hide_contribution`.
- [ ] `20261010000800_likes_rpc.sql` — `set_like`.
- [ ] `20261010000900_reports_rpc.sql` — tabla `rate_limits` y `submit_report`.

**Cómo:** primero en seco y después de verdad:

```bash
supabase db push --dry-run
supabase db push
```

`--dry-run` imprime las migraciones que se aplicarían sin aplicarlas: deben salir las 9 de la lista. `db push` registra cada una en `supabase_migrations.schema_migrations` con su prefijo como versión y omite las ya registradas ([docs](https://supabase.com/docs/reference/cli/supabase-db-push)).

> **Nota sobre DEV:** en el proyecto DEV las migraciones se aplicaron con el MCP de Supabase (`apply_migration`), que registra versiones remotas distintas del prefijo del fichero (p. ej. `000300` equivale a cuatro versiones remotas `municipalities_*`). Por eso en DEV **no** se usa `db push` (riesgo documentado en [dev-a-subtasks.md §7](dev-a-subtasks.md)). En un proyecto **nuevo** no hay historial previo: se usa `supabase db push` y no se mezcla con el MCP.

Si `db push` falla a mitad, **no** reintentes a ciegas ni borres nada: anota la migración que falló y el error, y escala. Las ya aplicadas quedan registradas; corregir el historial (`supabase migration repair`) solo con decisión humana.

### 2.1 Verificación posterior (SQL Editor del dashboard, solo lectura)

- [ ] **RLS activa en todas las tablas** — esperado: 6 filas, todas `true` (`contributions`, `likes`, `municipalities`, `profiles`, `rate_limits`, `reports`).

```sql
select c.relname as tabla, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;
```

- [ ] **0 políticas salvo la de profiles** — esperado: exactamente 1 fila, `public | profiles | profiles_select_own | SELECT`. Ninguna en `storage.objects`.

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname in ('public', 'storage')
order by 1, 2, 3;
```

- [ ] **Funciones de negocio sin EXECUTE para anon/authenticated** — esperado: 11 filas, todas `false | false`.

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_contribution', 'complete_validation', 'mark_technical_error',
                    'cancel_contribution', 'retry_validation', 'submit_evidence', 'get_feed',
                    'get_leaderboard', 'hide_contribution', 'set_like', 'submit_report')
order by 1;
```

Si además listas todas las funciones de `public`, `contributions_prevent_immutable_update` aparece con `true/true`: es la función del trigger (`returns trigger`), PostgREST no la expone como RPC y no se puede invocar directamente; es esperado. Si existe `rls_auto_enable` (opción "automatic RLS" del proyecto), debe salir `false/false` (lo revoca `000200`).

- [ ] **Buckets privados, 5 MB, jpeg/png/webp** — esperado: 2 filas, `public = false`, `file_size_limit = 5242880`, `{image/jpeg,image/png,image/webp}`.

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('evidence-private', 'published-private')
order by id;
```

- [ ] **311 municipios** — esperado: `311 | 311`.

```sql
select count(*) as total, count(*) filter (where code like '08%') as barcelona
from public.municipalities;
```

Estas consultas se validaron en DEV el 2026-10-10 (solo lectura) con exactamente los resultados esperados.

## 3. Edge Function `api`

- [ ] Desplegar desde la raíz del repo, con el proyecto enlazado:

```bash
supabase functions deploy api --no-verify-jwt
```

`--no-verify-jwt` desactiva la verificación de JWT de la pasarela ([docs](https://supabase.com/docs/reference/cli/supabase-functions-deploy)). **Es intencional** y coincide con `supabase/config.toml` (`[functions.api] verify_jwt = false`): la API tiene rutas públicas sin sesión (`/feed`, `/leaderboard`, `/municipalities`, `/media/{id}`, `/reports`) y el preflight `OPTIONS` del navegador no lleva token. La autenticación se hace **dentro** de la función, ruta a ruta: cada escritura valida el `Bearer` con Supabase Auth y deriva el `userId` en el servidor (`401 AUTH_REQUIRED` si falta). El smoke test (§7) comprueba que esas rutas siguen respondiendo 401 sin token.

Si no tienes Docker, el CLI ofrece `--use-api` ("bundle functions server-side without using Docker", misma página de docs).

- [ ] Anota en el runbook operativo el commit desplegado y la versión que muestra el dashboard (Edge Functions → `api`).

## 4. Secretos de la función

Se configuran **solo** como secretos de Edge Functions (dashboard → Edge Functions → Secrets, o CLI). Nunca en el repo, ni en `.env.example` con valor, ni en el front. No hace falta redesplegar: la función lee el valor nuevo al momento ([docs](https://supabase.com/docs/guides/functions/secrets)).

| Secreto | Valor | Si falta o es incorrecto |
|---|---|---|
| `ALLOWED_ORIGINS` | Origen exacto del front, sin barra final ni ruta: `https://<proyecto>.pages.dev`. Lista separada por comas. **Solo en staging** se añade `http://localhost:5173`; nunca en prod. | El navegador bloquea las peticiones por CORS (no se emite `Access-Control-Allow-Origin`). La API sigue respondiendo a clientes sin navegador. Smoke: FAIL "revisa ALLOWED_ORIGINS". |
| `TURNSTILE_SECRET_KEY` | Secret key del widget Turnstile (Cloudflare dashboard → Turnstile). Para pruebas, las claves dummy oficiales: <https://developers.cloudflare.com/turnstile/troubleshooting/testing/>. | `POST /reports` responde `500 INTERNAL` (falla cerrado: nunca acepta denuncias sin verificar). Smoke: FAIL "faltan TURNSTILE_SECRET_KEY / REPORT_RATE_SALT". |
| `REPORT_RATE_SALT` | Aleatorio, 32 bytes: `openssl rand -hex 32` (o `deno eval "console.log(Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''))"`). Distinto en cada proyecto. | `POST /reports` con un token Turnstile **válido** responde `500` (falla cerrado: no hay límite de tasa sin sal). |

```bash
supabase secrets set ALLOWED_ORIGINS=https://<proyecto>.pages.dev
supabase secrets set TURNSTILE_SECRET_KEY=<valor>
supabase secrets set REPORT_RATE_SALT=<valor>
supabase secrets list
```

Escribe los valores directamente en la terminal o usa `--env-file <fichero fuera del repo>` ([docs](https://supabase.com/docs/reference/cli/supabase-secrets-set)); `secrets list` sirve para comprobar que aparecen los tres nombres. Borra el historial de la shell si has pegado valores.

**No se configuran:** `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase en la función; un secreto no puede empezar por `SUPABASE_` ([docs](https://supabase.com/docs/guides/functions/secrets)).

**Límite del smoke:** con `turnstileToken: "invalid"` la función se detiene en Turnstile (`403`) antes de leer `REPORT_RATE_SALT`, así que el smoke **no** detecta que falte la sal. Compruébalo con `supabase secrets list` (deben aparecer los tres nombres) y con la prueba V12 del runbook operativo (denuncia real con Turnstile válido → `202`).

## 5. Auth (dashboard de Supabase)

- [ ] **Email/password activado** — Authentication → Sign In / Providers → Email ([docs](https://supabase.com/docs/guides/auth/general-configuration)). "Allow new users to sign up" activado solo cuando el equipo abra el registro.
- [ ] **Confirmación de email desactivada** — mismo proveedor Email, "Confirm email" desactivado (decisión del [runbook operativo §0](release-runbook.md) y ADR-002: sin SMTP ni dominio; riesgo aceptado en el release-checklist).
- [ ] **CAPTCHA Turnstile** — Project Settings → Authentication → Bot and Abuse Protection → "Enable CAPTCHA protection", proveedor Turnstile, Secret key del widget ([docs](https://supabase.com/docs/guides/auth/auth-captcha)). Protege registro, login y reset; el front envía `captchaToken` (site key = `VITE_TURNSTILE_SITE_KEY`). En el widget de Cloudflare, el hostname permitido es el dominio `pages.dev` (y `localhost` solo en staging).
- [ ] **Site URL y Redirect URLs** = origen `pages.dev` — Authentication → URL Configuration ([docs](https://supabase.com/docs/guides/auth/redirect-urls)). Site URL `https://<proyecto>.pages.dev`; en Redirect URLs, la URL exacta (las docs recomiendan rutas exactas en producción; comodines solo para local/previews). Sustituye el `http://localhost:3000` por defecto.
- [ ] **Leaked password protection** — Authentication → Providers → Email → contraseñas filtradas. **Según las docs solo está disponible en Pro o superior** ([docs](https://supabase.com/docs/guides/auth/password-security)); en Free **no** se puede activar: queda como **aviso aceptado** (el advisor de seguridad lo seguirá mostrando). Sí se puede fijar longitud mínima ≥ 8 y requisitos de caracteres en la misma página.
- [ ] **Sin recuperación por email** — no configurar SMTP ni plantilla de reset, y la UI no ofrece "olvidé mi contraseña" (release-checklist, "Auth sin email").

## 6. Front en Cloudflare Pages (solo documentación, para B y C)

A **no** conecta Cloudflare ni crea ficheros en `public/` (es de B). Pages dashboard → Workers & Pages → proyecto → Settings → Environment variables ([docs](https://developers.cloudflare.com/pages/configuration/build-configuration/)).

| Variable (Production) | Valor | Nota |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Sin barra final; `src/lib/api.ts` añade `/functions/v1/api`. |
| `VITE_SUPABASE_ANON_KEY` | anon/publishable key del proyecto | **Pública por diseño**: va embebida en el JS. Nunca la service role. |
| `VITE_TURNSTILE_SITE_KEY` | site key del widget Turnstile | Pública. El secreto va en Supabase (§4, §5). |
| `VITE_USE_FIXTURES` | **NO definir** | En producción no debe existir; activa datos falsos en el cliente. |
| `NODE_VERSION` | `22.16.0` (opcional) | Es la versión por defecto de la imagen de build v3; fijarla evita cambios silenciosos ([docs](https://developers.cloudflare.com/pages/configuration/build-image/)). |

Las variables `VITE_*` se **incrustan en el bundle en tiempo de build** y son visibles para cualquiera ([Vite docs](https://vite.dev/guide/env-and-mode)): nunca poner secretos. Cambiar una variable exige **nuevo build**.

- Build command: `npm run build` (`tsc -b && vite build`). Build output directory: `dist` ([guía React/Vite de Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)).
- **SPA fallback:** Pages trata el proyecto como SPA cuando **no** hay un `404.html` en la raíz del output: toda ruta desconocida sirve `/` ([Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)). Hoy `public/` solo tiene `favicon.svg` e `icons.svg`, así que **no hace falta `public/_redirects`**. Recomendación para B: no crear `_redirects` con `/* /index.html 200` (redundante) ni un `404.html`; si se añade un `404.html`, entonces sí haría falta revisar el enrutado. Comprobación tras el despliegue: recargar una ruta interna (p. ej. `/feed`) debe devolver la SPA, no un 404.
- Tras conocer el dominio `pages.dev`, volver a §4 (`ALLOWED_ORIGINS`) y §5 (URL Configuration, hostname del widget Turnstile).

## 7. Prueba rápida (smoke)

Solo peticiones anónimas que no crean datos; sin secretos ni token.

```bash
deno run --allow-net scripts/smoke-api.ts https://<ref>.supabase.co/functions/v1/api/v1 --origin https://<proyecto>.pages.dev
```

- [ ] Resultado esperado: todas las líneas `PASS`, `Resumen: 14 PASS, 0 FAIL, 0 SKIP` y código de salida 0. Sin `--origin` la comprobación CORS sale como `SKIP`.
- Comprueba: `/feed` y `/leaderboard` (200 `{items,nextCursor}`), `limit=99` (400 `field=limit`), `/municipalities?q=sabad` (Sabadell 08187), `/media` (404 idéntico para UUID y no-UUID), 6 rutas protegidas sin token (401 `AUTH_REQUIRED`), `POST /reports` con token inválido (403 `CAPTCHA_FAILED`), preflight CORS (204 con el origin y métodos `PUT`/`DELETE`) y que ninguna respuesta de error contenga `stack`, `service_role` ni rutas internas.
- Pistas de FAIL: `faltan TURNSTILE_SECRET_KEY / REPORT_RATE_SALT` (500 en `/reports`), `la función desplegada no incluye /reports` (404: función antigua), `revisa ALLOWED_ORIGINS` (preflight sin cabeceras).
- Pega la salida en el runbook operativo (fila V15). El smoke **no** sustituye las pruebas V01–V15 ni la prueba E2E.

Referencia (DEV, 2026-10-10, función v4 sin T21 y sin `ALLOWED_ORIGINS`): 12 PASS y 2 FAIL esperados (`/reports` → 404 y preflight sin `Access-Control-Allow-Origin`).

## 8. Rollback

- **Función:** volver a desplegar desde el commit anterior conocido como bueno:

```bash
git switch --detach <commit_previo>
supabase functions deploy api --no-verify-jwt
git switch -
```

  y repetir el smoke (§7). Los secretos no cambian con un redespliegue.
- **Front:** en Pages, "Rollback" a un deployment anterior del dashboard (lo decide C).
- **Lo que NO se revierte automáticamente:** las **migraciones**. Un redespliegue de la función no deshace cambios de esquema ni datos. Las migraciones de este repo son aditivas; si una versión vieja de la función no encaja con el esquema nuevo, se arregla **hacia delante** con una migración nueva revisada.
- **Prohibido** sin autorización humana explícita: `DROP`, `TRUNCATE`, `delete` masivo, `supabase db reset`, borrar buckets o pausar/borrar el proyecto. Ante una incidencia de privacidad, seguir [release-runbook §6](release-runbook.md) (deshabilitar envíos/registro y retirar exposición) y la sección "Operador: denuncias" de [dev-a-subtasks.md](dev-a-subtasks.md) para ocultar contenido concreto.

## 9. GO/NO-GO

Este runbook solo deja el backend desplegable y comprobable. La decisión de abrir la beta es del equipo y se registra en:

- [docs/tasks/release-runbook.md](release-runbook.md) — checkpoints, matriz V01–V15 y tabla de decisión.
- [docs/design/release-checklist.md](../design/release-checklist.md) — puertas imprescindibles y riesgos aceptados.

Estado conocido que afecta al GO (2026-10-10): T13.d pendiente (el validador IA, el inspector EXIF y el saneador fallan cerrado, así que ninguna contribución llega a `APPROVED`); leaked password protection no disponible en Free.

## Fuentes (consultadas 2026-10-10)

- Supabase CLI: [`supabase link`](https://supabase.com/docs/reference/cli/supabase-link) · [`supabase db push`](https://supabase.com/docs/reference/cli/supabase-db-push) · [`supabase functions deploy`](https://supabase.com/docs/reference/cli/supabase-functions-deploy) · [`supabase secrets set`](https://supabase.com/docs/reference/cli/supabase-secrets-set)
- Supabase Edge Functions: [secretos y variables por defecto](https://supabase.com/docs/guides/functions/secrets) · [routing](https://supabase.com/docs/guides/functions/routing)
- Supabase Auth: [configuración general](https://supabase.com/docs/guides/auth/general-configuration) · [Redirect URLs / Site URL](https://supabase.com/docs/guides/auth/redirect-urls) · [CAPTCHA (Turnstile)](https://supabase.com/docs/guides/auth/auth-captcha) · [seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security)
- Cloudflare Pages: [guía React (Vite)](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/) · [build configuration y variables](https://developers.cloudflare.com/pages/configuration/build-configuration/) · [build image / Node](https://developers.cloudflare.com/pages/configuration/build-image/) · [Serving Pages (SPA)](https://developers.cloudflare.com/pages/configuration/serving-pages/) · [`_redirects`](https://developers.cloudflare.com/pages/configuration/redirects/)
- Cloudflare Turnstile: [claves de prueba](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- Vite: [variables de entorno](https://vite.dev/guide/env-and-mode)
