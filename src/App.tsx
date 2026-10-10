import { useState } from 'react'
import {
  AlertCircle,
  Compass,
  Layers,
  PlusCircle,
  Trophy,
  User,
  X,
} from 'lucide-react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import FeedPage from './features/community/FeedPage'
import ContributionForm from './features/contributions/ContributionForm'
import ContributionStatus from './features/contributions/ContributionStatus'
import AuthPage, { AuthProvider, useAuth } from './features/identity/AuthPage'
import LeaderboardPage from './features/scoring/LeaderboardPage'
import ComingSoonPage from './features/shell/ComingSoonPage'
import EstadoPage from './features/shell/EstadoPage'

export interface CalmToast {
  id: string
  code?: number
  title: string
  message: string
  tone: 'info' | 'warning' | 'success'
}

const DESKTOP_NAV = [
  { to: '/', label: 'Comunidad', end: true },
  { to: '/ranking', label: 'Ranking', end: false },
  { to: '/estado', label: 'Estado IA', end: false },
  { to: '/acceso', label: 'Acceso', end: false },
] as const

const MOBILE_NAV = [
  { to: '/', label: 'Feed', end: true, Icon: Compass },
  { to: '/contribuir', label: 'Contribuir', end: false, Icon: PlusCircle },
  { to: '/estado', label: 'Estado IA', end: false, Icon: Layers },
  { to: '/ranking', label: 'Ranking', end: false, Icon: Trophy },
  { to: '/acceso', label: 'Acceso', end: false, Icon: User },
] as const

function HeaderAuth({
  onToast,
}: {
  onToast: (t: Omit<CalmToast, 'id'>) => void
}) {
  const { status, profile, signOut } = useAuth()

  if (status === 'ready' && profile) {
    return (
      <div className="hidden md:flex items-center gap-2 text-sm">
        <span className="font-mono-tech text-[#F0F5F2] max-w-[9rem] truncate">
          @{profile.alias}
        </span>
        <button
          type="button"
          className="min-h-[38px] px-3 text-xs text-[#98ABA2] hover:text-[#F0F5F2] transition-colors"
          onClick={() => {
            void signOut().then(() =>
              onToast({
                title: 'Has cerrado tu sesión',
                message: 'Navegas en modo visitante público.',
                tone: 'info',
              }),
            )
          }}
        >
          Salir
        </button>
      </div>
    )
  }

  if (status === 'needs-profile') {
    return (
      <Link
        to="/acceso"
        className="min-h-[38px] px-4 py-2 text-xs font-semibold rounded-lg bg-[#F5A623] text-[#070D0A] hover:bg-[#f7b44a] transition-colors whitespace-nowrap"
      >
        Completa perfil
      </Link>
    )
  }

  if (status === 'anonymous') {
    return (
      <Link
        to="/acceso"
        className="md:hidden min-h-[38px] px-4 py-2 text-xs font-semibold text-[#070D0A] bg-[#7CE83A] hover:bg-[#92F252] rounded-lg transition-colors"
      >
        Entrar
      </Link>
    )
  }

  return null
}

function ShellLayout() {
  const [toast, setToast] = useState<CalmToast | null>(null)

  const showToast = (next: Omit<CalmToast, 'id'>) => {
    setToast({ ...next, id: String(Date.now()) })
  }

  return (
    <div className="min-h-svh flex flex-col bg-[#070D0A] text-[#F0F5F2] font-sans pb-16 md:pb-0">
      <header className="sticky top-0 z-40 h-14 flex items-center justify-between gap-3 px-4 sm:px-6 bg-[#0D1612]/92 backdrop-blur-md border-b border-white/[0.08]">
        <Link
          to="/"
          className="font-display font-bold text-sm sm:text-base text-[#F0F5F2] tracking-tight shrink-0 hover:text-[#7CE83A] transition-colors"
        >
          ActivList
        </Link>

        <nav
          aria-label="Principal"
          className="hidden md:flex items-center gap-5 text-xs font-medium text-[#98ABA2]"
        >
          {DESKTOP_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `py-1 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-[#F0F5F2] underline decoration-[#7CE83A] decoration-2 underline-offset-8'
                    : 'hover:text-[#F0F5F2]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <HeaderAuth onToast={showToast} />
          <Link
            to="/contribuir"
            className="min-h-[38px] px-4 py-2 text-xs font-semibold text-[#070D0A] bg-[#7CE83A] hover:bg-[#92F252] rounded-lg transition-colors whitespace-nowrap"
          >
            Registrar acción
          </Link>
        </div>
      </header>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 right-4 z-50 max-w-sm w-[calc(100%-2rem)] bg-[#0D1612] border border-[#1D3026] shadow-2xl rounded-xl p-4 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                toast.tone === 'success'
                  ? 'text-[#2EE58D]'
                  : toast.tone === 'warning'
                    ? 'text-[#F5A623]'
                    : 'text-[#22D3EE]'
              }`}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {toast.code != null && (
                  <span className="font-mono-tech text-[11px] text-[#12D6B0]">
                    HTTP {toast.code}
                  </span>
                )}
                <p className="text-xs font-semibold text-[#F0F5F2]">{toast.title}</p>
              </div>
              <p className="text-xs text-[#98ABA2] leading-snug">{toast.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-[#98ABA2] hover:text-[#F0F5F2] p-1"
            aria-label="Cerrar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <main className="flex-1 w-full">
        <Routes>
          <Route index element={<FeedPage />} />
          <Route path="ranking" element={<LeaderboardPage />} />
          <Route path="contribuir" element={<ContributionForm />} />
          <Route path="contribuciones/:id" element={<ContributionStatus />} />
          <Route path="acceso" element={<AuthPage />} />
          <Route path="estado" element={<EstadoPage />} />
          <Route
            path="privacidad"
            element={
              <ComingSoonPage
                title="Privacidad y contacto de retirada"
                kicker="LEGAL · /privacidad"
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="border-t border-white/[0.08] bg-[#070D0A] py-10 px-4 sm:px-8 mt-16 mb-4 md:mb-0">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-[#98ABA2]">
          <div className="space-y-1">
            <p className="font-display font-bold text-[#F0F5F2] text-sm">ActivList</p>
            <p className="text-[#5E7369]">
              Registro ciudadano de acción ambiental en España · La IA evalúa indicios visuales, no
              certifica impacto absoluto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Link to="/privacidad" className="hover:text-[#F0F5F2] transition-colors">
              Privacidad y contacto de retirada
            </Link>
            <span className="font-mono-tech text-[#5E7369]">retirada@activlist.es</span>
          </div>
        </div>
      </footer>

      <nav
        aria-label="Navegación móvil inferior"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0D1612]/95 backdrop-blur-md border-t border-white/[0.08] grid grid-cols-5 items-center px-1 pb-[env(safe-area-inset-bottom)]"
      >
        {MOBILE_NAV.map(({ to, label, end, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-1 touch-manipulation ${
                isActive ? 'text-[#7CE83A]' : 'text-[#98ABA2]'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ShellLayout />
    </AuthProvider>
  )
}
