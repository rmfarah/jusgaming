/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation'
import { createSSRClient } from '@/lib/supabase/server'
import DashboardSidebar from '@/components/DashboardSidebar'
import type { JusUser } from '@/lib/jusgaming.types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSSRClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single() as { data: JusUser | null }

  if (!profile) redirect('/auth/login?error=profile_not_found')

  // Aluno bloqueado pelo professor não acessa o dashboard
  if (profile.active === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-xl p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Conta bloqueada</h1>
          <p className="text-sm text-gray-500 mt-2">
            O seu acesso foi suspenso pelo professor responsável. Entre em contato com ele para reativar a sua conta.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardSidebar user={profile} />

      <div className="lg:pl-64">
        <main className="min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}
