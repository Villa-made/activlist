import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Lock } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ALIAS_RULE,
  TURNSTILE_SITE_KEY,
  createProfile,
  fetchMyProfile,
  hasSession,
  isAuthConfigured,
  signIn,
  signOut as doSignOut,
  signUp,
  subscribeAuth,
  userFacingAuthError,
  validateAdultDeclared,
  validateAlias,
  type Profile,
} from './authService'

type AuthStatus = 'loading' | 'anonymous' | 'needs-profile' | 'ready'

interface AuthState {
  status: AuthStatus
  profile: Profile | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)

  const refresh = useCallback(async () => {
    if (!(await hasSession())) {
      setProfile(null)
      setStatus('anonymous')
      return
    }
    try {
      const p = await fetchMyProfile()
      setProfile(p)
      setStatus(p ? 'ready' : 'needs-profile')
    } catch {
      setProfile(null)
      setStatus('needs-profile')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap de sesión al montar
    void refresh()
    return subscribeAuth(() => {
      void refresh()
    })
  }, [refresh])

  const signOut = useCallback(async () => {
    await doSignOut()
    setProfile(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo(
    () => ({ status, profile, refresh, signOut }),
    [status, profile, refresh, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook exportado junto al provider (tope de archivos T05).
// eslint-disable-next-line react-refresh/only-export-components -- useAuth + AuthProvider
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
        },
      ) => string
      remove: (id: string) => void
    }
  }
}

function TurnstileBox({
  onToken,
  resetKey,
}: {
  onToken: (token: string | null) => void
  resetKey: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return
    let cancelled = false

    function mount() {
      if (cancelled || !ref.current || !window.turnstile) return
      if (widgetId.current) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
      ref.current.innerHTML = ''
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      })
    }

    const existing = document.querySelector('script[data-turnstile]')
    if (window.turnstile) {
      mount()
    } else if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.dataset.turnstile = '1'
      script.onload = () => mount()
      document.head.appendChild(script)
    } else {
      existing.addEventListener('load', mount)
    }

    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
    }
  }, [onToken, resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={ref} />
}

const fieldClass =
  'w-full min-h-[46px] rounded-xl bg-[#070D0A] border border-[#1D3026] px-3 py-2 text-sm text-[#F0F5F2] focus:border-[#7CE83A] outline-none'

function CompleteProfile() {
  const { refresh, signOut } = useAuth()
  const [alias, setAlias] = useState('')
  const [adult, setAdult] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      validateAdultDeclared(adult)
      const normalized = validateAlias(alias)
      setBusy(true)
      await createProfile(normalized)
      await refresh()
    } catch (err) {
      setError(userFacingAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <form
        onSubmit={(e) => void submit(e)}
        className="max-w-xl bg-[#0D1612] border border-[#1D3026] rounded-2xl p-6 sm:p-8 space-y-5"
      >
        <div>
          <p className="text-xs font-mono-tech text-[#12D6B0]">PERFIL · ÚLTIMO PASO</p>
          <h1 className="text-2xl font-display font-semibold text-[#F0F5F2] mt-1">
            Completa tu perfil
          </h1>
          <p className="text-sm text-[#98ABA2] mt-1">Elige un alias público para participar.</p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-[#F0F5F2]">Alias público</span>
          <input
            className={fieldClass}
            value={alias}
            onChange={(ev) => setAlias(ev.target.value)}
            autoComplete="nickname"
            required
          />
          <span className="text-xs text-[#5E7369]">{ALIAS_RULE}</span>
        </label>
        <label className="flex gap-3 items-start text-sm text-[#F0F5F2]">
          <input
            type="checkbox"
            checked={adult}
            onChange={(ev) => setAdult(ev.target.checked)}
            className="mt-1 accent-[#7CE83A]"
          />
          <span>
            Declaro que tengo <strong>18 años o más</strong>.
          </span>
        </label>
        {error && (
          <div
            role="alert"
            className="rounded-xl bg-[#161214] border border-[#F26457]/40 px-4 py-3 text-sm text-[#F26457]"
          >
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={busy}
            className="min-h-[48px] px-5 rounded-xl bg-[#7CE83A] hover:bg-[#92F252] text-[#070D0A] font-semibold text-sm disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Guardar alias'}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-[48px] px-5 rounded-xl bg-[#13201A] border border-[#1D3026] text-[#F0F5F2] text-sm"
          >
            Salir
          </button>
        </div>
      </form>
    </section>
  )
}

type Mode = 'login' | 'register'

export default function AuthPage() {
  const { status, refresh } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<Mode>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [alias, setAlias] = useState('')
  const [adult, setAdult] = useState(false)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'loading') {
    return (
      <p className="text-center text-[#98ABA2] py-16 text-sm">Cargando sesión…</p>
    )
  }
  if (status === 'ready') return <Navigate to={from} replace />
  if (status === 'needs-profile') return <CompleteProfile />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isAuthConfigured()) {
      setError(
        'La autenticación no está configurada (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
      )
      return
    }
    try {
      if (mode === 'register') {
        validateAdultDeclared(adult)
        validateAlias(alias)
      }
      if (TURNSTILE_SITE_KEY && !captcha) {
        setError('Completa la verificación anti-bots.')
        return
      }
      setBusy(true)
      if (mode === 'register') {
        await signUp(email.trim(), password, captcha)
        try {
          await createProfile(alias)
        } catch (profileErr) {
          await refresh()
          setError(userFacingAuthError(profileErr))
          setCaptcha(null)
          setCaptchaKey((k) => k + 1)
          return
        }
      } else {
        await signIn(email.trim(), password, captcha)
      }
      await refresh()
      navigate(from, { replace: true })
    } catch (err) {
      setError(userFacingAuthError(err))
      setCaptcha(null)
      setCaptchaKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <form
          onSubmit={(e) => void submit(e)}
          className="lg:col-span-7 bg-[#0D1612] border border-[#1D3026] rounded-2xl p-6 sm:p-8 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06]">
            <div>
              <p className="text-xs font-mono-tech text-[#12D6B0]">IDENTIDAD CIUDADANA · /acceso</p>
              <h1 className="text-2xl font-display font-semibold text-[#F0F5F2] mt-1">
                {mode === 'register' ? 'Crear cuenta pública' : 'Acceder a tu cuenta'}
              </h1>
            </div>
            <div
              role="group"
              aria-label="Modo de acceso"
              className="inline-flex p-1 rounded-xl bg-[#070D0A] border border-[#1D3026]"
            >
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  mode === 'register'
                    ? 'bg-[#13201A] text-[#7CE83A]'
                    : 'text-[#98ABA2] hover:text-[#F0F5F2]'
                }`}
              >
                Registro
              </button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  mode === 'login'
                    ? 'bg-[#13201A] text-[#7CE83A]'
                    : 'text-[#98ABA2] hover:text-[#F0F5F2]'
                }`}
              >
                Entrar
              </button>
            </div>
          </div>

          <p className="text-sm text-[#98ABA2] leading-relaxed">
            Email y contraseña sin confirmación por correo. En esta beta{' '}
            <strong className="text-[#F0F5F2]">no hay recuperación de contraseña por email</strong>.
          </p>

          <div className="flex items-start gap-2 rounded-xl bg-[#13201A] border border-[#F5A623]/30 px-3 py-2.5">
            <Lock className="w-4 h-4 text-[#F5A623] shrink-0 mt-0.5" />
            <p className="text-xs text-[#F5A623] leading-snug">
              Guarda tu contraseña en un gestor seguro: ActivList no ofrece reset por correo en beta.
            </p>
          </div>

          {mode === 'register' && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-[#F0F5F2]">Alias público</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5E7369] font-mono-tech text-sm">
                  @
                </span>
                <input
                  className={`${fieldClass} pl-7`}
                  value={alias}
                  onChange={(ev) => setAlias(ev.target.value)}
                  autoComplete="nickname"
                  required
                />
              </div>
              <span className="text-xs text-[#5E7369]">{ALIAS_RULE}</span>
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[#F0F5F2]">Email</span>
            <input
              className={fieldClass}
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-[#F0F5F2]">Contraseña</span>
            <input
              className={fieldClass}
              type="password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </label>

          {mode === 'register' && (
            <label className="flex gap-3 items-start text-sm text-[#F0F5F2]">
              <input
                type="checkbox"
                checked={adult}
                onChange={(ev) => setAdult(ev.target.checked)}
                className="mt-1 accent-[#7CE83A]"
              />
              <span>
                Declaro que tengo <strong>18 años o más</strong> y resido en España.
              </span>
            </label>
          )}

          <TurnstileBox onToken={setCaptcha} resetKey={captchaKey} />

          {error && (
            <div
              role="alert"
              className="rounded-xl bg-[#161214] border border-[#F26457]/40 px-4 py-3 text-sm text-[#F26457]"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[48px] rounded-xl bg-[#7CE83A] hover:bg-[#92F252] text-[#070D0A] font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {busy
              ? 'Espera…'
              : mode === 'register'
                ? 'Crear cuenta y continuar'
                : 'Entrar en ActivList'}
          </button>
        </form>

        <aside className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#0D1612] border border-[#1D3026] p-6 space-y-3">
            <p className="text-xs font-mono-tech text-[#12D6B0]">QUÉ OBTIENES</p>
            <h2 className="text-lg font-display font-semibold text-[#F0F5F2]">
              Alias público, evidencia privada
            </h2>
            <ul className="space-y-2 text-sm text-[#98ABA2]">
              <li>· Registrar reciclaje (+10) o recogida (+20) con foto saneada</li>
              <li>· Apoyar publicaciones del feed (0 pts)</li>
              <li>· Aparecer en el ranking histórico municipal</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  )
}
