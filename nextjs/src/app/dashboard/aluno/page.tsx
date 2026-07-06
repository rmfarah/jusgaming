/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import { BookOpen, Gavel, Scale, Users, ChevronRight } from 'lucide-react'
import type { JusUser, Course, JusCase, TeamRole } from '@/lib/jusgaming.types'

const ROLE_LABELS: Record<TeamRole, { label: string; color: string }> = {
  plaintiff: { label: 'Time Autor', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  defendant: { label: 'Time Réu', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  judge: { label: 'Time Juiz', color: 'bg-purple-100 text-purple-700 border-purple-200' },
}

const STATUS_LABELS = {
  draft: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600' },
  active: { label: 'Ativo', color: 'bg-green-100 text-green-700' },
  closed: { label: 'Encerrado', color: 'bg-gray-200 text-gray-500' },
}

interface CourseWithCases {
  course: Course
  cases: Array<{
    caseData: JusCase
    teamRole: TeamRole
    teamName: string
  }>
}

export default async function AlunoPage() {
  const supabase = await createSSRClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single() as { data: Pick<JusUser, 'role'> | null }

  if (profile?.role === 'professor' || profile?.role === 'admin') {
    redirect('/dashboard/professor')
  }

  // Busca as turmas do aluno
  const { data: memberships } = await (supabase as any)
    .from('course_members')
    .select('course_id, courses(*)')
    .eq('user_id', user.id) as {
    data: Array<{ course_id: string; courses: Course }> | null
  }

  // Para cada turma, busca os casos em que o aluno participa
  const coursesWithCases: CourseWithCases[] = []

  for (const m of memberships ?? []) {
    const course = m.courses
    if (!course) continue

    const { data: teamMemberships } = await (supabase as any)
      .from('team_members')
      .select('teams(id, case_id, role, name, cases(*))')
      .eq('user_id', user.id) as {
      data: Array<{
        teams: {
          id: string
          case_id: string
          role: TeamRole
          name: string
          cases: JusCase
        }
      }> | null
    }

    const cases = (teamMemberships ?? [])
      .filter((tm) => tm.teams?.cases?.course_id === course.id)
      .map((tm) => ({
        caseData: tm.teams.cases,
        teamRole: tm.teams.role,
        teamName: tm.teams.name,
      }))

    coursesWithCases.push({ course, cases })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Meu Painel</h1>
        <p className="text-sm text-gray-500 mt-1">
          {coursesWithCases.length} turma{coursesWithCases.length !== 1 ? 's' : ''} matriculada{coursesWithCases.length !== 1 ? 's' : ''}
        </p>
      </div>

      {coursesWithCases.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg">
          <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Você ainda não está em nenhuma turma.</p>
          <p className="text-sm text-gray-400 mt-1">Peça o código ao seu professor para se cadastrar.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {coursesWithCases.map(({ course, cases }) => (
            <div key={course.id} className="bg-white rounded-lg border border-gray-200 shadow-sm">
              {/* Cabeçalho da turma */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#185FA5] flex items-center justify-center flex-shrink-0">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">{course.name}</h2>
                  <p className="text-xs text-gray-500">{course.semester}</p>
                </div>
              </div>

              {/* Casos da turma */}
              <div className="px-5 py-4">
                {cases.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">
                    Nenhum caso ativo nesta turma ainda.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {cases.map(({ caseData, teamRole, teamName }) => {
                      const role = ROLE_LABELS[teamRole]
                      const status = STATUS_LABELS[caseData.status]
                      return (
                        <Link
                          key={caseData.id}
                          href={`/dashboard/casos/${caseData.id}/autos`}
                          className="flex items-start justify-between gap-4 p-3 rounded-md border border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-colors group"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="mt-0.5 flex-shrink-0">
                              {teamRole === 'judge'
                                ? <Gavel className="h-4 w-4 text-purple-500" />
                                : <Scale className="h-4 w-4 text-blue-400" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate group-hover:text-[#185FA5] transition-colors">
                                {caseData.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">{teamName}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded ${status.color}`}>
                              {status.label}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded border ${role.color}`}>
                              {role.label}
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-[#185FA5] transition-colors" />
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
