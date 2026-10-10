import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Camera, ImageIcon } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../identity/AuthPage'
import { setLastContributionId } from '../shell/lastContribution'
import {
  uploadEvidence,
  type CaptureOrigin,
} from './contributionApi'
import {
  cancelContribution,
  getContribution,
  isTerminalStatus,
  provideEvidence,
  retryContribution,
  shouldPollStatus,
  statusErrorMessage,
  statusLabel,
  type OwnContribution,
} from './statusApi'

const POLL_MS = 4000

function statusBorder(status: OwnContribution['status']): string {
  switch (status) {
    case 'PENDING':
      return 'border-[#22D3EE]/50'
    case 'APPROVED':
      return 'border-[#2EE58D]/50'
    case 'NEEDS_EVIDENCE':
      return 'border-[#F5A623]/50'
    case 'REJECTED':
      return 'border-[#F26457]/50'
    case 'TECHNICAL_ERROR':
      return 'border-[#22D3EE]/40'
    default:
      return 'border-[#1D3026]'
  }
}

function statusKicker(status: OwnContribution['status']): string {
  switch (status) {
    case 'PENDING':
      return 'ANALIZANDO TRAMA ÓPTICA'
    case 'APPROVED':
      return 'INDICIOS VALIDADOS'
    case 'NEEDS_EVIDENCE':
      return 'SE REQUIERE NUEVA EVIDENCIA'
    case 'REJECTED':
      return 'NO SUPERÓ LA EVALUACIÓN'
    case 'TECHNICAL_ERROR':
      return 'ERROR TÉCNICO DE VALIDACIÓN'
    case 'CANCELLED':
      return 'ENVÍO CANCELADO'
  }
}

export default function ContributionStatus() {
  const { status: authStatus } = useAuth()
  const { id = '' } = useParams()
  const [item, setItem] = useState<OwnContribution | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [captureOrigin, setCaptureOrigin] = useState<CaptureOrigin>('CAMERA_FLOW')

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return
      try {
        const next = await getContribution(id, signal)
        setItem(next)
        setError(null)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setError(statusErrorMessage(e))
      }
    },
    [id],
  )

  useEffect(() => {
    if (id) setLastContributionId(id)
  }, [id])

  useEffect(() => {
    if (authStatus !== 'ready' || !id) return
    const ctrl = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del estado
    void refresh(ctrl.signal)
    return () => ctrl.abort()
  }, [authStatus, id, refresh])

  useEffect(() => {
    if (!item || !shouldPollStatus(item.status)) return
    const timer = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [item, refresh])

  if (authStatus === 'loading') {
    return <p className="text-center text-[#98ABA2] py-16 text-sm">Cargando sesión…</p>
  }
  if (authStatus !== 'ready') {
    return <Navigate to="/acceso" replace state={{ from: `/contribuciones/${id}` }} />
  }

  async function onRetry() {
    if (!id || !item || isTerminalStatus(item.status) || !item.canRetry) return
    setBusy(true)
    setError(null)
    try {
      setItem(await retryContribution(id))
    } catch (e) {
      setError(statusErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function onCancel() {
    if (!id || !item || isTerminalStatus(item.status) || !item.canCancel) return
    if (!window.confirm('¿Cancelar este envío? No se otorgarán puntos.')) return
    setBusy(true)
    setError(null)
    try {
      setItem(await cancelContribution(id))
    } catch (e) {
      setError(statusErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function onEvidence(e: FormEvent) {
    e.preventDefault()
    if (!id || !item || isTerminalStatus(item.status) || !item.canProvideEvidence) return
    if (!file) {
      setError('Elige una foto nueva (preferible con la cámara).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const photoPath = await uploadEvidence(file)
      setItem(await provideEvidence(id, photoPath, captureOrigin))
      setFile(null)
    } catch (err) {
      setError(statusErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const scanning = item?.status === 'PENDING'

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <div className="pb-6 border-b border-white/[0.08]">
        <p className="text-xs font-mono-tech text-[#12D6B0]">INSPECTOR IA · /contribuciones</p>
        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-[#F0F5F2] mt-1">
          Estado de la contribución
        </h1>
        <p className="text-xs font-mono-tech text-[#5E7369] mt-2">ID · {id}</p>
      </div>

      {!item && !error && (
        <p className="text-sm text-[#98ABA2]">Consultando estado…</p>
      )}

      {item && (
        <div
          className={`relative rounded-2xl bg-[#0D1612] border ${statusBorder(item.status)} p-6 sm:p-8 space-y-5 overflow-hidden`}
        >
          {scanning && (
            <div className="absolute inset-x-0 top-0 h-full pointer-events-none overflow-hidden opacity-40">
              <div className="h-16 w-full bg-gradient-to-b from-transparent via-[#22D3EE]/50 to-transparent animate-vision-scan" />
              <div className="absolute inset-0 bg-sensor-grid" />
            </div>
          )}

          <div className="relative space-y-2">
            <p className="text-xs font-mono-tech text-[#12D6B0]">{statusKicker(item.status)}</p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-display font-semibold text-[#F0F5F2]">
                {statusLabel(item.status)}
              </h2>
              {item.status === 'APPROVED' && (
                <span className="font-mono-tech text-xs font-semibold text-[#2EE58D] px-2 py-1 rounded bg-[#2EE58D]/10 border border-[#2EE58D]/30">
                  +{item.effectivePoints} PTS
                </span>
              )}
            </div>
            {item.reason && (
              <p className="text-sm text-[#98ABA2]">Motivo: {item.reason}</p>
            )}
            <p className="text-xs text-[#5E7369]">
              Enviada: {new Date(item.submittedAt).toLocaleString('es-ES')}
              {item.approvedAt
                ? ` · Aprobada: ${new Date(item.approvedAt).toLocaleString('es-ES')}`
                : ''}
            </p>
            <p className="text-xs text-[#98ABA2]">
              Puntos efectivos (servidor):{' '}
              <strong className="font-mono-tech text-[#F0F5F2]">{item.effectivePoints}</strong> — el
              cliente no suma puntos.
            </p>
          </div>

          {!isTerminalStatus(item.status) && item.canProvideEvidence && (
            <form
              onSubmit={(ev) => void onEvidence(ev)}
              className="relative space-y-3 pt-4 border-t border-white/[0.06]"
            >
              <p className="text-xs font-semibold text-[#F0F5F2]">Aportar evidencia</p>
              <div className="flex flex-wrap gap-2">
                <label className="min-h-[44px] px-4 rounded-xl bg-[#13201A] border border-[#1D3026] text-xs font-medium text-[#F0F5F2] inline-flex items-center gap-2 cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  Cámara
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(ev) => {
                      setFile(ev.target.files?.[0] ?? null)
                      setCaptureOrigin('CAMERA_FLOW')
                    }}
                  />
                </label>
                <label className="min-h-[44px] px-4 rounded-xl bg-[#13201A] border border-[#1D3026] text-xs font-medium text-[#F0F5F2] inline-flex items-center gap-2 cursor-pointer">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Galería
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(ev) => {
                      setFile(ev.target.files?.[0] ?? null)
                      setCaptureOrigin('GALLERY')
                    }}
                  />
                </label>
              </div>
              {file && <p className="text-xs text-[#5E7369]">{file.name}</p>}
              <button
                type="submit"
                disabled={busy}
                className="min-h-[44px] px-5 rounded-xl bg-[#F5A623] hover:bg-[#f7b44a] text-[#070D0A] text-xs font-semibold disabled:opacity-50"
              >
                {busy ? 'Enviando…' : 'Enviar evidencia'}
              </button>
            </form>
          )}

          {!isTerminalStatus(item.status) && (
            <div className="relative flex flex-wrap gap-3 pt-2">
              {item.canRetry && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRetry()}
                  className="min-h-[44px] px-5 rounded-xl bg-[#7CE83A] hover:bg-[#92F252] text-[#070D0A] text-xs font-semibold disabled:opacity-50"
                >
                  Reintentar validación IA
                </button>
              )}
              {item.canCancel && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onCancel()}
                  className="min-h-[44px] px-5 rounded-xl border border-[#F26457]/40 text-[#F26457] text-xs font-semibold hover:bg-[#F26457]/10 disabled:opacity-50"
                >
                  Cancelar envío
                </button>
              )}
            </div>
          )}

          {item.status === 'APPROVED' && (
            <div className="relative flex flex-wrap gap-3 pt-2">
              <Link
                to="/"
                className="min-h-[44px] px-5 rounded-xl bg-[#7CE83A] hover:bg-[#92F252] text-[#070D0A] text-xs font-semibold inline-flex items-center"
              >
                Ver feed
              </Link>
              <Link
                to="/ranking"
                className="min-h-[44px] px-5 rounded-xl bg-[#13201A] border border-[#1D3026] text-[#F0F5F2] text-xs font-medium inline-flex items-center"
              >
                Ver ranking
              </Link>
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-[#161214] border border-[#F26457]/40 px-4 py-3 text-sm text-[#F26457]"
        >
          {error}
        </div>
      )}

      <Link
        to="/contribuir"
        className="inline-flex min-h-[44px] px-5 items-center rounded-xl bg-[#13201A] border border-[#1D3026] text-xs font-medium text-[#F0F5F2] hover:border-[#2A4537]"
      >
        Nueva contribución
      </Link>
    </section>
  )
}
