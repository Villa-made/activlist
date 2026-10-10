import { ArrowLeft, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

interface ComingSoonPageProps {
  title: string
  kicker?: string
}

export default function ComingSoonPage({
  title,
  kicker = 'ACTIVLIST · NEW FEATURE',
}: ComingSoonPageProps) {
  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <div className="rounded-2xl bg-[#0D1612] border border-[#1D3026] bg-sensor-grid p-10 sm:p-14 text-center space-y-5">
        <div className="w-12 h-12 rounded-xl bg-[#13201A] border border-[#7CE83A]/30 mx-auto flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-[#7CE83A]" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-mono-tech text-[#12D6B0]">{kicker}</p>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold text-[#F0F5F2]">
            {title}
          </h1>
          <p className="text-sm text-[#98ABA2] max-w-md mx-auto leading-relaxed">
            Próximamente · New feature. Estamos preparando esta sección con el mismo rigor visual
            EcoTech del resto de ActivList.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#7CE83A] hover:bg-[#92F252] text-[#070D0A] text-xs font-semibold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al feed
        </Link>
      </div>
    </section>
  )
}
