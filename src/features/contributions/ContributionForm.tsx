import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, ImageIcon } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../identity/AuthPage'
import { setLastContributionId } from '../shell/lastContribution'
import {
  clearIdempotencyKey,
  contributionErrorMessage,
  createContribution,
  getOrCreateIdempotencyKey,
  searchMunicipalities,
  uploadEvidence,
  validateDescription,
  type ActionType,
  type CaptureOrigin,
  type Municipality,
} from './contributionApi'

const fieldClass =
  'w-full min-h-[46px] rounded-xl bg-[#070D0A] border border-[#1D3026] px-3 py-2 text-sm text-[#F0F5F2] focus:border-[#7CE83A] outline-none'

export default function ContributionForm() {
  const { status } = useAuth()
  const navigate = useNavigate()

  const [actionType, setActionType] = useState<ActionType>('RECYCLING')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  const [captureOrigin, setCaptureOrigin] = useState<CaptureOrigin>('GALLERY')
  const [muniQuery, setMuniQuery] = useState('')
  const [muniOptions, setMuniOptions] = useState<Municipality[]>([])
  const [municipality, setMunicipality] = useState<Municipality | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  useEffect(() => {
    const q = muniQuery.trim()
    if (q.length < 2) return
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      void searchMunicipalities(q, ctrl.signal)
        .then(setMuniOptions)
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setMuniOptions([])
        })
    }, 250)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [muniQuery])

  if (status === 'loading') {
    return <p className="text-center text-[#98ABA2] py-16 text-sm">Cargando sesión…</p>
  }
  if (status !== 'ready') {
    return <Navigate to="/acceso" replace state={{ from: '/contribuir' }} />
  }

  function onPickFile(next: FileList | null, origin: CaptureOrigin) {
    const chosen = next?.[0] ?? null
    setFile(chosen)
    setCaptureOrigin(origin)
    setError(null)
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const nextUrl = chosen ? URL.createObjectURL(chosen) : null
    previewRef.current = nextUrl
    setPreviewUrl(nextUrl)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const desc = validateDescription(description)
      if (!file) throw new Error('Añade una foto desde la cámara o la galería.')
      if (!municipality) throw new Error('Selecciona un municipio de la lista.')

      setBusy(true)
      const photoPath = await uploadEvidence(file)
      const idempotencyKey = getOrCreateIdempotencyKey(actionType)
      const created = await createContribution(
        {
          actionType,
          description: desc,
          municipalityCode: municipality.code,
          photoPath,
          captureOrigin,
        },
        idempotencyKey,
      )
      clearIdempotencyKey(actionType)
      setLastContributionId(created.id)
      navigate(`/contribuciones/${created.id}`, { replace: true })
    } catch (err) {
      setError(contributionErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const points = actionType === 'LITTER_COLLECTION' ? 20 : 10

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <form onSubmit={(ev) => void submit(ev)} className="space-y-8">
        <div className="pb-6 border-b border-white/[0.08]">
          <p className="text-xs font-mono-tech text-[#12D6B0]">REGISTRO DE EVIDENCIA · /contribuir</p>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold text-[#F0F5F2] mt-1">
            Nueva contribución
          </h1>
          <p className="text-sm text-[#98ABA2] mt-1 max-w-2xl">
            Subiremos la foto de forma privada y el servidor decidirá el resultado. Los puntos
            informativos no se otorgan en el navegador.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-6">
            <fieldset className="space-y-3">
              <legend className="text-xs font-mono-tech text-[#12D6B0]">01 · TIPO DE ACCIÓN</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActionType('RECYCLING')}
                  className={`text-left p-5 rounded-2xl border transition-colors ${
                    actionType === 'RECYCLING'
                      ? 'bg-[#13201A] border-[#7CE83A] ring-1 ring-[#7CE83A]/40'
                      : 'bg-[#0D1612] border-[#1D3026] hover:border-[#2A4537]'
                  }`}
                >
                  <p className="font-display font-semibold text-[#F0F5F2]">Reciclar</p>
                  <p className="font-mono-tech text-sm text-[#7CE83A] mt-1">+10 PTS</p>
                  <p className="text-xs text-[#98ABA2] mt-2">Envases, vidrio, papel, punto limpio</p>
                </button>
                <button
                  type="button"
                  onClick={() => setActionType('LITTER_COLLECTION')}
                  className={`text-left p-5 rounded-2xl border transition-colors ${
                    actionType === 'LITTER_COLLECTION'
                      ? 'bg-[#13201A] border-[#7CE83A] ring-1 ring-[#7CE83A]/40'
                      : 'bg-[#0D1612] border-[#1D3026] hover:border-[#2A4537]'
                  }`}
                >
                  <p className="font-display font-semibold text-[#F0F5F2]">Recoger</p>
                  <p className="font-mono-tech text-sm text-[#7CE83A] mt-1">+20 PTS</p>
                  <p className="text-xs text-[#98ABA2] mt-2">Residuos en vía, costa o sendero</p>
                </button>
              </div>
            </fieldset>

            <div className="space-y-2">
              <p className="text-xs font-mono-tech text-[#12D6B0]">02 · MUNICIPIO INE</p>
              <label className="block space-y-1.5">
                <span className="sr-only">Municipio</span>
                <input
                  className={fieldClass}
                  value={municipality ? `${municipality.name} (${municipality.code})` : muniQuery}
                  onChange={(ev) => {
                    setMunicipality(null)
                    setMuniOptions([])
                    setMuniQuery(ev.target.value)
                  }}
                  placeholder="Escribe al menos 2 caracteres"
                  autoComplete="off"
                />
              </label>
              {muniQuery.trim().length >= 2 && muniOptions.length > 0 && !municipality && (
                <ul className="rounded-xl border border-[#1D3026] bg-[#0D1612] max-h-40 overflow-auto">
                  {muniOptions.map((m) => (
                    <li key={m.code}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-sm text-[#F0F5F2] hover:bg-[#13201A]"
                        onClick={() => {
                          setMunicipality(m)
                          setMuniQuery('')
                          setMuniOptions([])
                        }}
                      >
                        {m.name} · {m.code}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-[#5E7369]">Beta: catálogo de la provincia de Barcelona vía API.</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-mono-tech text-[#12D6B0]">03 · DESCRIPCIÓN</p>
              <textarea
                className={`${fieldClass} min-h-[6rem] resize-y`}
                value={description}
                onChange={(ev) => setDescription(ev.target.value)}
                maxLength={500}
                required
              />
              <p className="text-xs font-mono-tech text-[#5E7369]">
                {description.trim().length}/500
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <p className="text-xs font-mono-tech text-[#12D6B0]">04 · CAPTURA</p>
            <div className="rounded-2xl bg-[#0D1612] border border-[#1D3026] overflow-hidden">
              <div className="relative aspect-[4/3] bg-[#13201A] bg-sensor-grid">
                {previewUrl ? (
                  <>
                    <img
                      src={previewUrl}
                      alt="Vista previa de evidencia"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-3 pointer-events-none border border-[#22D3EE]/40">
                      <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#22D3EE]" />
                      <span className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#22D3EE]" />
                      <span className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#22D3EE]" />
                      <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#22D3EE]" />
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <span className="inline-block px-2 py-1 rounded bg-[#070D0A]/85 text-[10px] font-mono-tech text-[#22D3EE] border border-white/10">
                        Evidencia privada hasta aprobación · {captureOrigin}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[#98ABA2]">
                    <Camera className="w-8 h-8 opacity-60" />
                    <p className="text-xs font-mono-tech">Sin captura óptica</p>
                  </div>
                )}
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                <label className="min-h-[44px] px-4 rounded-xl bg-[#13201A] border border-[#1D3026] hover:border-[#7CE83A]/40 text-xs font-medium text-[#F0F5F2] inline-flex items-center gap-2 cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  Cámara
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(ev) => onPickFile(ev.target.files, 'CAMERA_FLOW')}
                  />
                </label>
                <label className="min-h-[44px] px-4 rounded-xl bg-[#13201A] border border-[#1D3026] hover:border-[#7CE83A]/40 text-xs font-medium text-[#F0F5F2] inline-flex items-center gap-2 cursor-pointer">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Galería
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(ev) => onPickFile(ev.target.files, 'GALLERY')}
                  />
                </label>
              </div>
              {file && (
                <p className="px-4 pb-4 text-xs text-[#5E7369]">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>

            <div className="rounded-xl bg-[#13201A] border border-[#1D3026] px-4 py-3 text-xs text-[#98ABA2]">
              Si el envío falla por cooldown, EXIF o contribución pendiente, verás el motivo aquí. No
              hay aprobación simulada.
            </div>
          </div>
        </div>

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
          className="min-h-[48px] px-6 rounded-xl bg-[#7CE83A] hover:bg-[#92F252] text-[#070D0A] font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {busy ? 'Cifrando y enviando trama óptica…' : `Enviar evidencia (+${points} pts)`}
        </button>
      </form>
    </section>
  )
}
