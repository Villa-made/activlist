import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, RotateCcw, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import CommunityActions from './CommunityActions'
import {
  fetchFeed,
  mediaSrc,
  readErrorMessage,
  areDevFixturesEnabled,
  type FeedItem,
} from './readApi'

type FeedFilter = 'ALL' | 'CLEANUP' | 'RECYCLE'

function actionLabel(t: FeedItem['actionType']): string {
  return t === 'RECYCLING' ? 'Reciclaje selectivo' : 'Recogida de residuos'
}

function pointsFor(t: FeedItem['actionType']): number {
  return t === 'RECYCLING' ? 10 : 20
}

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('ALL')

  const load = useCallback(async (nextCursor?: string | null, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const page = await fetchFeed(20, nextCursor ?? null)
      setItems((prev) => (append ? [...prev, ...page.items] : page.items))
      setCursor(page.nextCursor)
      setError(null)
    } catch (e) {
      setError(readErrorMessage(e))
      if (!append) setItems([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del feed
    void load(null, false)
  }, [load])

  const filtered = useMemo(() => {
    if (feedFilter === 'ALL') return items
    if (feedFilter === 'CLEANUP') {
      return items.filter((i) => i.actionType === 'LITTER_COLLECTION')
    }
    return items.filter((i) => i.actionType === 'RECYCLING')
  }, [items, feedFilter])

  return (
    <div>
      <section className="relative min-h-[78vh] w-full flex items-end overflow-hidden border-b border-white/[0.08]">
        <div className="absolute inset-0 bg-[#070D0A] bg-sensor-grid" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070D0A] via-[#070D0A]/75 to-[#070D0A]/30" />
        <div className="absolute inset-0 bg-forest-circuit-gradient pointer-events-none" />

        <div className="relative z-10 w-full max-w-6xl mx-auto px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-2xl space-y-6">
            <div className="font-mono-tech text-xs sm:text-sm tracking-widest text-[#7CE83A]">
              ACTIVLIST — ESPAÑA
            </div>
            <h1
              className="font-display font-bold text-[#F0F5F2] tracking-tight leading-[1.08]"
              style={{
                fontSize: 'clamp(2.25rem, 4.2vw, 3.75rem)',
                textWrap: 'balance',
              }}
            >
              Reconocimiento público para cada acción ambiental real.
            </h1>
            <p className="text-base sm:text-lg text-[#F0F5F2]/85 leading-relaxed max-w-xl">
              Registra tu reciclaje (+10 pts) o recogida de residuos (+20 pts) en cualquier municipio
              de España: nuestra visión artificial evalúa indicios plausibles y sanea tu fotografía
              antes de publicarla.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-4">
              <Link
                to="/contribuir"
                className="min-h-[48px] px-6 py-3 rounded-xl bg-[#7CE83A] hover:bg-[#92F252] text-[#070D0A] font-semibold text-sm inline-flex items-center gap-2.5 transition-colors"
              >
                <span>Registrar acción</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/ranking"
                className="min-h-[48px] px-5 py-3 rounded-xl bg-[#0D1612]/85 hover:bg-[#13201A] border border-white/15 text-[#F0F5F2] font-medium text-sm transition-colors"
              >
                Ver ranking histórico
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-8 py-12 sm:py-16 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/[0.08]">
          <div className="space-y-1">
            <p className="text-xs font-mono-tech text-[#12D6B0]">
              EVIDENCIAS VERIFICADAS · ACCESO PÚBLICO SIN CUENTA
              {areDevFixturesEnabled() ? ' · FIXTURES DEV' : ''}
            </p>
            <h2 className="text-2xl sm:text-3xl font-display font-semibold text-[#F0F5F2]">
              Actividad reciente en municipios españoles
            </h2>
            <p className="text-sm text-[#98ABA2]">
              Cada imagen mostrada ha superado la evaluación de indicios visuales y ha sido
              desprovista de coordenadas GPS exactas.
            </p>
          </div>

          <div
            role="group"
            aria-label="Filtrar publicaciones por tipo de acción"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0D1612] border border-[#1D3026] self-start"
          >
            {(
              [
                { id: 'ALL' as const, label: `Todas (${items.length})` },
                { id: 'CLEANUP' as const, label: 'Recogida (+20 pts)' },
                { id: 'RECYCLE' as const, label: 'Reciclaje (+10 pts)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFeedFilter(opt.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  feedFilter === opt.id
                    ? 'bg-[#13201A] text-[#7CE83A]'
                    : 'text-[#98ABA2] hover:text-[#F0F5F2]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <p className="text-sm text-[#98ABA2]">Cargando evidencias…</p>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-[#161214] border border-[#F26457]/40 px-4 py-3 text-sm text-[#F26457]"
          >
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-2xl bg-[#0D1612] border border-[#1D3026] bg-sensor-grid p-10 sm:p-14 text-center max-w-2xl mx-auto space-y-5">
            <div className="w-12 h-12 rounded-xl bg-[#13201A] border border-[#7CE83A]/30 mx-auto flex items-center justify-center font-mono-tech text-xs text-[#7CE83A]">
              00
            </div>
            <div className="space-y-2">
              <p className="text-xs font-mono-tech text-[#12D6B0]">
                SIN REGISTROS EN ESTE FILTRO MUNICIPAL
              </p>
              <h3 className="text-xl font-display font-semibold text-[#F0F5F2]">
                Aún no hay evidencias aprobadas con este criterio
              </h3>
              <p className="text-sm text-[#98ABA2] max-w-md mx-auto leading-relaxed">
                Sé la primera persona en registrar una acción de reciclaje o recogida de residuos en
                tu municipio o restablece la vista general.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setFeedFilter('ALL')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#13201A] hover:bg-[#192B23] text-xs font-medium text-[#F0F5F2] inline-flex items-center gap-2 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Ver todas las publicaciones
              </button>
              <Link
                to="/contribuir"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#7CE83A] hover:bg-[#92F252] text-[#070D0A] text-xs font-semibold transition-colors"
              >
                Registrar primera acción
              </Link>
            </div>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.map((item) => (
              <FeedCard
                key={item.id}
                item={item}
                onLikedChange={(next) => {
                  setItems((prev) =>
                    prev.map((row) =>
                      row.id === item.id
                        ? { ...row, likedByMe: next.likedByMe, likeCount: next.likeCount }
                        : row,
                    ),
                  )
                }}
                onHidden={() => {
                  setItems((prev) => prev.filter((row) => row.id !== item.id))
                }}
              />
            ))}
          </div>
        )}

        {cursor && (
          <div className="flex justify-center pt-4">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void load(cursor, true)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#13201A] border border-[#1D3026] hover:border-[#2A4537] text-xs font-medium text-[#F0F5F2] transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Cargando…' : 'Ver más'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function FeedCard({
  item,
  onLikedChange,
  onHidden,
}: {
  item: FeedItem
  onLikedChange: (next: { likedByMe: boolean; likeCount: number }) => void
  onHidden: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const pts = pointsFor(item.actionType)

  return (
    <article className="group bg-[#0D1612] border border-[#1D3026] rounded-xl overflow-hidden transition-colors duration-150 hover:border-[#2A4537] flex flex-col">
      <div className="relative aspect-[4/3] w-full bg-[#13201A] overflow-hidden">
        {!imgError ? (
          <img
            src={mediaSrc(item.imageUrl)}
            alt={`${actionLabel(item.actionType)} en ${item.municipality.name} por ${item.authorAlias}`}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-sensor-grid">
            <Sparkles className="w-8 h-8 text-[#12D6B0] mb-2 opacity-75" />
            <p className="text-xs font-mono-tech text-[#98ABA2]">
              Evidencia óptica verificada · {item.municipality.name}
            </p>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#070D0A]/90 via-[#070D0A]/20 to-transparent pointer-events-none" />

        <div className="absolute top-3 right-3 px-2.5 py-1 rounded bg-[#070D0A]/85 backdrop-blur-md border border-white/10">
          <span className="font-mono-tech text-xs font-semibold text-[#7CE83A]">+{pts} PTS</span>
        </div>

        <div className="absolute bottom-3 left-4 right-4 flex items-baseline justify-between gap-2">
          <div className="text-xs text-[#F0F5F2]/90 font-medium tracking-tight truncate">
            <span>{actionLabel(item.actionType)}</span>
            <span className="mx-1.5 text-[#5E7369]" aria-hidden="true">
              ·
            </span>
            <span className="text-[#12D6B0]">{item.municipality.name}</span>
            <span className="text-[#98ABA2]"> ({item.municipality.code})</span>
          </div>
          <span className="text-[11px] font-mono-tech text-[#98ABA2] shrink-0">EXIF saneado</span>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-[#98ABA2] mb-2 truncate">
            <span className="font-mono-tech font-medium text-[#F0F5F2]">@{item.authorAlias}</span>
            <span aria-hidden="true">·</span>
            <span>{new Date(item.publishedAt).toLocaleString('es-ES')}</span>
          </div>
          <p className="text-sm text-[#F0F5F2]/90 leading-relaxed line-clamp-3">
            {item.description}
          </p>
        </div>

        <div className="pt-3 border-t border-white/[0.06]">
          <CommunityActions
            contributionId={item.id}
            authorAlias={item.authorAlias}
            likedByMe={item.likedByMe}
            likeCount={item.likeCount}
            onLikedChange={onLikedChange}
            onHidden={onHidden}
          />
        </div>
      </div>
    </article>
  )
}
