import { useCallback, useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../identity/AuthPage'
import {
  fetchLeaderboard,
  readErrorMessage,
  areDevFixturesEnabled,
  type LeaderboardEntry,
} from '../community/readApi'

export default function LeaderboardPage() {
  const { status, profile } = useAuth()
  const [items, setItems] = useState<LeaderboardEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async (nextCursor?: string | null, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const page = await fetchLeaderboard(20, nextCursor ?? null)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del ranking
    void load(null, false)
  }, [load])

  const myAlias = status === 'ready' ? profile?.alias : null
  const totalPoints = items.reduce((acc, row) => acc + row.points, 0)

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/[0.08]">
        <div>
          <p className="text-xs font-mono-tech text-[#12D6B0]">
            CLASIFICACIÓN HISTÓRICA · /ranking
            {areDevFixturesEnabled() ? ' · FIXTURES DEV' : ''}
          </p>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold text-[#F0F5F2] mt-1">
            Registro público de impacto ciudadano
          </h1>
          <p className="text-sm text-[#98ABA2] mt-1 max-w-2xl">
            Ordenación histórica por puntos consolidados (Reciclar = 10 pts · Recoger residuos = 20
            pts). Las puntuaciones idénticas comparten posición oficial.
          </p>
        </div>
        <Link
          to="/contribuir"
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#7CE83A] hover:bg-[#92F252] text-[#070D0A] text-xs font-semibold inline-flex items-center gap-2 self-start md:self-auto"
        >
          <span>Registrar acción</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-[#0D1612] border border-[#1D3026]">
          <span className="text-xs text-[#98ABA2]">Puntos en esta página</span>
          <p className="font-mono-tech text-2xl font-bold text-[#7CE83A] mt-1">
            {totalPoints.toLocaleString('es-ES')} PTS
          </p>
          <span className="text-[11px] text-[#5E7369]">Derivados en servidor</span>
        </div>
        <div className="p-5 rounded-xl bg-[#0D1612] border border-[#1D3026]">
          <span className="text-xs text-[#98ABA2]">Participantes visibles</span>
          <p className="font-mono-tech text-2xl font-bold text-[#F0F5F2] mt-1">{items.length}</p>
          <span className="text-[11px] text-[#5E7369]">Página actual del ranking</span>
        </div>
        <div className="p-5 rounded-xl bg-[#0D1612] border border-[#1D3026]">
          <span className="text-xs text-[#98ABA2]">Tu posición</span>
          <p className="font-mono-tech text-2xl font-bold text-[#12D6B0] mt-1">
            {myAlias
              ? (() => {
                  const mine = items.find((r) => r.alias === myAlias)
                  return mine ? `#${String(mine.rank).padStart(2, '0')}` : '—'
                })()
              : '—'}
          </p>
          <span className="text-[11px] text-[#5E7369]">
            {myAlias ? `@${myAlias}` : 'Inicia sesión para ver tu fila'}
          </span>
        </div>
      </div>

      {loading && <p className="text-sm text-[#98ABA2]">Cargando…</p>}

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-[#161214] border border-[#F26457]/40 px-4 py-3 text-sm text-[#F26457]"
        >
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-[#98ABA2]">Aún no hay puntuaciones públicas.</p>
      )}

      {items.length > 0 && (
        <div className="rounded-2xl bg-[#0D1612] border border-[#1D3026] overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-[#5E7369] border-b border-white/[0.06]">
                <th className="px-4 py-3 font-mono-tech font-medium">#</th>
                <th className="px-4 py-3 font-medium">Alias</th>
                <th className="px-4 py-3 font-medium text-right">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const mine = myAlias != null && row.alias === myAlias
                return (
                  <tr
                    key={`${row.rank}-${row.userId}`}
                    className={`border-b border-white/[0.04] last:border-0 ${
                      mine ? 'bg-[#13201A] outline outline-1 outline-[#7CE83A]/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-mono-tech text-[#12D6B0]">
                      #{String(row.rank).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-3 text-[#F0F5F2]">
                      @{row.alias}
                      {mine ? (
                        <span className="text-[#7CE83A] font-medium"> · tú</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tech font-bold text-[#7CE83A]">
                      {row.points}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {cursor && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void load(cursor, true)}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#13201A] border border-[#1D3026] hover:border-[#2A4537] text-xs font-medium text-[#F0F5F2] disabled:opacity-50"
        >
          {loadingMore ? 'Cargando…' : 'Ver más'}
        </button>
      )}
    </section>
  )
}
