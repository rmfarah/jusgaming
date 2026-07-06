import { Scale, Users, FileText } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* ── Left panel — JusGaming brand (hidden on mobile) ── */}
      <div
        className="hidden lg:flex lg:w-2/5 flex-col justify-between p-12"
        style={{ background: '#0a1628' }}
      >
        {/* Logo + tagline */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#185FA5] flex items-center justify-center flex-shrink-0">
              <Scale className="h-5 w-5 text-white" />
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">JusGaming</span>
          </div>
          <p className="text-blue-300 text-sm leading-relaxed max-w-xs">
            Simulador de processos judiciais para o ensino de Direito
          </p>
        </div>

        {/* Feature bullets */}
        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Scale className="h-4 w-4 text-blue-300" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Processo Civil e Arbitragem</p>
              <p className="text-blue-400 text-xs mt-1 leading-relaxed">
                Simule ações reais com petições, decisões e recursos em ambiente controlado.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Users className="h-4 w-4 text-blue-300" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Times adversariais reais</p>
              <p className="text-blue-400 text-xs mt-1 leading-relaxed">
                Autor, Réu e Juiz em papéis distintos — cada time com suas próprias peças e estratégias.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <FileText className="h-4 w-4 text-blue-300" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Autos digitais estilo eProc</p>
              <p className="text-blue-400 text-xs mt-1 leading-relaxed">
                Protocole e acompanhe o processo completo em tempo real, com numeração automática.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-blue-500 text-xs">
          © {new Date().getFullYear()} JusGaming · Todos os direitos reservados
        </p>
      </div>

      {/* ── Right panel — form area ── */}
      <div className="flex-1 flex flex-col justify-center min-h-screen bg-white px-6 py-12 lg:px-16">
        {/* Mobile-only header */}
        <div className="lg:hidden flex items-center gap-2 mb-10 justify-center">
          <div className="w-8 h-8 rounded-md bg-[#185FA5] flex items-center justify-center">
            <Scale className="h-4 w-4 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">JusGaming</span>
        </div>

        <div className="mx-auto w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  )
}
