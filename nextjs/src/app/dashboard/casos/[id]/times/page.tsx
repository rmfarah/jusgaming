/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import { Users, UserCircle } from 'lucide-react'
import type { JusUser, TeamRole } from '@/lib/jusgaming.types'

interface PageProps {
  params: Promise<{ id: string }>
}

const ROLE_CONFIG: Record<TeamRole, { label: string; color: string }> = {
  plaintiff: { label: 'Time Autor', color: 'border-blue-300 bg-blue-50' },
  defendant: { label: 'Time Réu', color: 'border-amber-300 bg-amber-50' },
  judge: { label: 'Time Juiz', color: 'border-purple-300 bg-purple-50' },
}

export default async function TimesViewPage({ params }: PageProps) {
  const { id: caseId } = await params

  const supabase = await createSSRClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single() as { data: Pick<JusUser, 'id' | 'role'> | null }

  if (!profile) redirect('/auth/login?error=profile_not_found')

  const isProfessor = profile.role === 'professor' || profile.role === 'admin'

  // ── Fetch case + teams ──────────────────────────────────────────────────────
  const { data: jusgCase } = await (supabase as any)
    .from('cases')
    .select('id, title, professor_id')
    .eq('id', caseId)
    .single()

  if (!jusgCase) notFound()

  const { data: teams } = await (supabase as any)
    .from('teams')
    .select(`
      id, role, name,
      team_members(
        user_id,
        users(id, full_name, email)
      )
    `)
    .eq('case_id', caseId) as {
    data: Array<{
      id: string
      role: TeamRole
      name: string
      team_members: Array<{
        user_id: string
        users: { id: string; full_name: string; email: string }
      }>
    }> | null
  }

  // Sort teams: plaintiff, defendant, judge
  const orderedTeams = (teams ?? []).sort((a, b) => {
    const order = { plaintiff: 0, defendant: 1, judge: 2 }
    return (order[a.role] ?? 3) - (order[b.role] ?? 3)
  })

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#185FA5]" />
          <h2 className="font-semibold text-gray-900 text-sm">Times</h2>
        </div>
        {isProfessor && jusgCase.professor_id === user.id && (
          <Link
            href={`/dashboard/professor/casos/${caseId}/times`}
            className="text-xs text-[#185FA5] hover:underline font-medium"
          >
            Editar composição →
          </Link>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="grid gap-4 md:grid-cols-3">
          {orderedTeams.map((team) => {
            const config = ROLE_CONFIG[team.role]
            return (
              <div
                key={team.id}
                className={`rounded-xl border-2 ${config.color} bg-white overflow-hidden`}
              >
                {/* Team header */}
                <div className="px-4 py-3 border-b border-gray-100 bg-white/60">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {config.label}
                  </p>
                  <p className="font-semibold text-gray-800 text-sm mt-0.5">{team.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {team.team_members.length} membro{team.team_members.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Members */}
                <div className="px-4 py-3 space-y-2">
                  {team.team_members.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Sem membros</p>
                  ) : (
                    team.team_members.map((m) => (
                      <div key={m.user_id} className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <UserCircle className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${
                            m.user_id === user.id ? 'text-[#185FA5]' : 'text-gray-800'
                          }`}>
                            {m.users.full_name}
                            {m.user_id === user.id && ' (você)'}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{m.users.email}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
