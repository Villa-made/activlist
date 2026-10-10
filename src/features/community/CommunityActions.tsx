import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { EyeOff, Flag, Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TURNSTILE_SITE_KEY } from '../identity/authService'
import { useAuth } from '../identity/AuthPage'
import {
  applyLikeToggle,
  canToggleLike,
  communityErrorMessage,
  hideContribution,
  isOwnPost,
  likeContribution,
  reportContribution,
  unlikeContribution,
} from './communityApi'

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

function ReportTurnstile({
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

  if (!TURNSTILE_SITE_KEY) {
    return (
      <p className="text-xs text-[#98ABA2]">
        CAPTCHA no configurado (falta VITE_TURNSTILE_SITE_KEY).
      </p>
    )
  }
  return <div ref={ref} />
}

export interface CommunityActionsProps {
  contributionId: string
  authorAlias: string
  likedByMe: boolean
  likeCount: number
  onLikedChange: (next: { likedByMe: boolean; likeCount: number }) => void
  onHidden: () => void
}

export default function CommunityActions({
  contributionId,
  authorAlias,
  likedByMe,
  likeCount,
  onLikedChange,
  onHidden,
}: CommunityActionsProps) {
  const { status, profile } = useAuth()
  const myAlias = status === 'ready' ? profile?.alias : null
  const own = isOwnPost(authorAlias, myAlias)
  const mayLike = canToggleLike(authorAlias, myAlias)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmHide, setConfirmHide] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [reportOk, setReportOk] = useState(false)

  const onCaptcha = useCallback((token: string | null) => {
    setCaptcha(token)
  }, [])

  async function toggleLike() {
    if (!mayLike || busy) return
    setBusy(true)
    setError(null)
    try {
      if (likedByMe) await unlikeContribution(contributionId)
      else await likeContribution(contributionId)
      onLikedChange(applyLikeToggle(likedByMe, likeCount))
    } catch (e) {
      setError(communityErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmHideAction() {
    if (!own || busy) return
    setBusy(true)
    setError(null)
    try {
      await hideContribution(contributionId)
      onHidden()
    } catch (e) {
      setError(communityErrorMessage(e))
    } finally {
      setBusy(false)
      setConfirmHide(false)
    }
  }

  async function submitReport(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await reportContribution(contributionId, reason, captcha)
      setReportOk(true)
      setReportOpen(false)
      setReason('')
      setCaptcha(null)
      setCaptchaKey((k) => k + 1)
    } catch (err) {
      setError(communityErrorMessage(err))
      setCaptchaKey((k) => k + 1)
      setCaptcha(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {confirmHide ? (
        <div
          role="dialog"
          aria-label="Confirmar ocultación"
          className="p-3.5 rounded-lg bg-[#13201A] border border-[#F26457]/40 space-y-2.5"
        >
          <p className="text-xs text-[#F0F5F2] leading-snug">
            Si ocultas la publicación, dejará de verse en el feed y se revocarán los puntos
            asociados (10 o 20 según el tipo). Esta acción no se puede deshacer desde la app.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmHide(false)}
              className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-[#98ABA2] hover:text-[#F0F5F2] rounded-md"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmHideAction()}
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-[#F26457] text-[#070D0A] hover:bg-[#f57b70] rounded-md"
            >
              {busy ? 'Ocultando…' : 'Confirmar ocultación'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {status === 'anonymous' || status === 'loading' ? (
            <Link
              to="/acceso"
              className="min-h-[44px] px-3 -ml-2 rounded-lg inline-flex items-center gap-2 text-xs font-medium text-[#98ABA2] hover:text-[#F0F5F2] hover:bg-[#13201A] transition-colors"
            >
              Entrar para Me gusta
            </Link>
          ) : own ? (
            <button
              type="button"
              disabled
              title="No puedes dar Me gusta a tu publicación"
              className="min-h-[44px] px-3 -ml-2 rounded-lg inline-flex items-center gap-2 text-xs font-medium text-[#5E7369]"
            >
              <Heart className="w-4 h-4" />
              <span className="font-mono-tech">{likeCount}</span>
              <span className="text-[#5E7369] hidden sm:inline">· propia</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !mayLike}
              onClick={() => void toggleLike()}
              className={`min-h-[44px] px-3 -ml-2 rounded-lg inline-flex items-center gap-2 text-xs font-medium transition-colors ${
                likedByMe
                  ? 'text-[#7CE83A] bg-[#7CE83A]/10'
                  : 'text-[#98ABA2] hover:text-[#F0F5F2] hover:bg-[#13201A]'
              }`}
              aria-label={`Reconocer acción (${likeCount} apoyos, 0 puntos)`}
            >
              <Heart
                className={`w-4 h-4 transition-transform active:scale-125 ${
                  likedByMe ? 'fill-[#7CE83A] text-[#7CE83A]' : ''
                }`}
              />
              <span className="font-mono-tech">{likeCount}</span>
              <span className="text-[#5E7369] hidden sm:inline">· 0 pts</span>
            </button>
          )}

          <div className="flex items-center gap-1">
            {own && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setConfirmHide(true)
                  setError(null)
                }}
                className="min-h-[44px] px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium text-[#98ABA2] hover:text-[#F26457] hover:bg-[#F26457]/10 transition-colors"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Ocultar</span>
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReportOpen((v) => !v)
                setReportOk(false)
                setError(null)
              }}
              className="min-h-[44px] px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium text-[#98ABA2] hover:text-[#F5A623] hover:bg-[#F5A623]/10 transition-colors"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Denunciar</span>
            </button>
          </div>
        </div>
      )}

      {reportOpen && (
        <form
          onSubmit={(ev) => void submitReport(ev)}
          className="p-4 rounded-xl bg-[#13201A] border border-[#1D3026] space-y-3"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[#F0F5F2]">Motivo</span>
            <textarea
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              rows={3}
              required
              className="w-full min-h-[5rem] rounded-xl bg-[#070D0A] border border-[#1D3026] px-3 py-2 text-sm text-[#F0F5F2] focus:border-[#7CE83A] outline-none resize-y"
            />
          </label>
          <ReportTurnstile onToken={onCaptcha} resetKey={captchaKey} />
          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-[44px] rounded-xl bg-[#F5A623] hover:bg-[#f7b44a] text-[#070D0A] text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {busy ? 'Enviando…' : 'Enviar aviso de revisión'}
          </button>
        </form>
      )}

      {reportOk && (
        <p className="text-xs text-[#98ABA2]" role="status">
          Denuncia recibida. El equipo la revisará; no se muestra el resultado.
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-[#161214] border border-[#F26457]/40 px-3 py-2 text-xs text-[#F26457]"
        >
          {error}
        </div>
      )}
    </div>
  )
}
