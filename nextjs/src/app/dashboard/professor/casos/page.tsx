/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import { Gavel, Plus, Users, ChevronRight, CircleDot, GitBranch } from 'lucide-react'
import DeleteCaseButton from '@/components/DeleteCaseButton'
import type { JusUser, JusCase, Course } from '@/lib/jusgaming.types'

const STATUS_CONFIG = {
  draft: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  active: { label: 'Ativo', color: 'bg-green-100 text-green-700 border-green-200' },
  closed: { label: 'Encerrado', color: 'bg-gray-200 text-gray-500 border-gray-300' },
}

const TYPE_CONFIG = {
  civil: { label: 'Cível', color: 'bg-blue-50 text-blue-700' },
  arbitration: { label: 'Arbitragem', color: 'bg-purple-50 text-purple-700' },
}

const INSTANCE_CONFIG: Record<string, string> = {
  first: '1ª Instância',
  appeal: '2ª Instância',
  arbitral: 'Câmara Arbitral',
  appeal_interlocutory: '2º Grau — AI',
  appeal_sentence: '2º Grau — Apelação',
}

interface CaseRow extends JusCase {
  courses: Pick<Course, 'name' | 'semester'>
  teams: Array<{ team_members: { count: number }[] }>
}

export default async function CasosPage() {
  const supabase = await createSSRClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single() as { data: Pick<JusUser, 'role'> | null }

  if (!profile || (profile.role !== 'professor' && profile.role !== 'admin')) {
    redirect('/dashboard/aluno')
  }

  const { data: cases } = await (supabase as any)
    .from('cases')
    .select('*, courses(name, semester), teams(team_members(count))')
    .eq('professor_id', user.id)
    .is('parent_case_id', null)
    .order('created_at', { ascending: false }) as { data: CaseRow[] | null }

  const draftCount = (cases ?? []).filter((c) => c.status === 'draft').length
  const activeCount = (cases ?? []).filter((c) => c.status === 'active').length

  // ── Fetch active incident counts per case ────────────────────────────────────
  const activeCaseIds = (cases ?? []).filter((c) => c.status === 'active').map((c) => c.id)
  const activeIncidentsMap: Record<string, number> = {}

  if (activeCaseIds.length > 0) {
    const { data: activeIncidents } = await (supabase as any)
      .from('cases')
      .select('parent_case_id')
      .in('parent_case_id', activeCaseIds)
      .eq('status', 'active') as { data: Array<{ parent_case_id: string }> | null }

    for (const inc of activeIncidents ?? []) {
      activeIncidentsMap[inc.parent_case_id] = (activeIncidentsMap[inc.parent_case_id] ?? 0) + 1
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Casos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeCount > 0 && `${activeCount} ativo${activeCount !== 1 ? 's' : ''}`}
            {activeCount > 0 && draftCount > 0 && ' · '}
            {draftCount > 0 && `${draftCount} rascunho${draftCount !== 1 ? 's' : ''}`}
            {activeCount === 0 && draftCount === 0 && `${(cases ?? []).length} caso${(cases ?? []).length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link
          href="/dashboard/professor/casos/novo"
          className="flex items-center gap-2 px-4 py-2 bg-[#185FA5] text-white rounded-lg text-sm font-medium hover:bg-[#134D87] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Caso
        </Link>
      </div>

      {/* Empty state */}
      {!cases || cases.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
          <Gavel className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhum caso criado ainda.</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">
            Crie do zero ou use um modelo da biblioteca.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/dashboard/professor/casos/novo"
              className="px-4 py-2 bg-[#185FA5] text-white rounded-lg text-sm font-medium hover:bg-[#134D87] transition-colors"
            >
              Criar caso
            </Link>
            <Link
              href="/dashboard/professor/biblioteca"
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Ver biblioteca
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left font-medium text-gray-500">Caso</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">Turma</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cases.map((c) => {
                const status = STATUS_CONFIG[c.status]
                const type = TYPE_CONFIG[c.type]
                const instance = INSTANCE_CONFIG[c.instance_level]
                const totalMembers = (c.teams ?? []).reduce(
                  (acc, t) => acc + (t.team_members?.[0]?.count ?? 0),
                  0,
                )

                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-2.5">
                        <Gavel className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900 leading-snug">{c.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{instance}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <p className="text-gray-700">{c.courses?.name}</p>
                      <p className="text-xs text-gray-400">{c.courses?.semester}</p>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${type.color}`}>
                        {type.label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${status.color}`}>
                          {status.label}
                        </span>
                        {totalMembers > 0 && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {totalMembers}
                          </span>
                        )}
                        {c.status === 'draft' && totalMembers === 0 && (
                          <span className="text-xs text-amber-500 flex items-center gap-1">
                            <CircleDot className="h-3 w-3" />
                            sem times
                          </span>
                        )}
                        {(activeIncidentsMap[c.id] ?? 0) > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {activeIncidentsMap[c.id]} incidente{activeIncidentsMap[c.id] !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {c.status === 'active' && (
                          <Link
                            href={`/dashboard/casos/${c.id}/autos`}
                            className="inline-flex items-center gap-1 text-sm text-green-700 hover:text-green-800 font-medium"
                          >
                            Autos
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        <Link
                          href={
                            c.status === 'draft'
                              ? `/dashboard/professor/casos/${c.id}/times`
                              : `/dashboard/professor/casos/${c.id}/briefings`
                          }
                          className="inline-flex items-center gap-1 text-sm text-[#185FA5] hover:text-[#134D87] font-medium"
                        >
                          {c.status === 'draft' ? 'Configurar' : 'Briefings'}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                        <DeleteCaseButton caseId={c.id} caseStatus={c.status} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
