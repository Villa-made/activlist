import { Layers } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { getLastContributionId } from './lastContribution'

export default function EstadoPage() {
  const lastId = getLastContributionId()
  if (lastId) {
    return <Navigate to={`/contribuciones/${lastId}`} replace />
  }

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
      <div className="rounded-2xl bg-[#0D1612] border border-[#1D3026] bg-sensor-grid p-10 sm:p-14 text-center space-y-5">
        <div className="w-12 h-12 rounded-xl bg-[#13201A] border border-[#22D3EE]/30 mx-auto flex items-center justify-center">
          <Layers className="w-5 h-5 text-[#22D3EE]" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-mono-tech text-[#12D6B0]">ESTADO IA · SIN TRAMA ACTIVA</p>
          <h1 className="text-2xl font-display font-semibold text-[#F0F5F2]">
            Aún no hay una contribución reciente
          </h1>
          <p className="text-sm text-[#98ABA2] max-w-md mx-auto leading-relaxed">
            Cuando registres una evidencia, el inspector de validación IA aparecerá aquí
            automáticamente.
          </p>
        </div>
        <Link
          to="/contribuir"
          className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-[#7CE83A] hover:bg-[#92F252] text-[#070D0A] text-xs font-semibold transition-colors"
        >
          Registrar acción
        </Link>
      </div>
    </section>
  )
}
