/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import { toggleEmailNotifications } from '@/lib/actions/courses'
import CreateCourseModal from '@/components/CreateCourseModal'
import DeleteCourseButton from '@/components/DeleteCourseButton'
import {
  Users, Mail, BellOff, Copy, ChevronRight, Gavel, FileText,
  ClipboardList, GitBranch, Star, MessageSquarePlus, AlertCircle,
} from 'lucide-react'
import type { JusUser, Course } from '@/lib/jusgaming.types'

interface CourseRow extends Course {
  course_members: { count: number }[]
}

function MetricCard({
  label, value, icon: Icon, color, href,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  color: string
  href?: string
}) {
  const inner = (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-center gap-4 ${href ? 'hover:border-[#185FA5] transition-colors' : ''}`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 truncate">{label}</p>
      </div>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

export default async function ProfessorPage() {
  const supabase = await createSSRClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single() as { data: Pick<JusUser, 'id' | 'role'> | null }

  if (!profile || (profile.role !== 'professor' && profile.role !== 'admin')) {
    redirect('/dashboard/aluno')
  }

  // ── Turmas ───────────────────────────────────────────────────────────────────
  const { data: courses } = await (supabase as any)
    .from('courses')
    .select('*, course_members(count)')
    .eq('professor_id', user.id)
    .order('created_at', { ascending: false }) as { data: CourseRow[] | null }

  const totalStudents = (courses ?? []).reduce(
    (acc, c) => acc + (c.course_members?.[0]?.count ?? 0), 0,
  )

  // ── Active cases (main, not incidents) ───────────────────────────────────────
  const { data: activeCases } = await (supabase as any)
    .from('cases')
    .select('id, title, status, courses(name)')
    .eq('professor_id', user.id)
    .eq('status', 'active')
    .is('parent_case_id', null) as {
    data: Array<{ id: string; title: string; status: string; courses: { name: string } | null }> | null
  }

  const activeCaseIds = (activeCases ?? []).map((c) => c.id)

  // ── Documents in active cases ────────────────────────────────────────────────
  let pendingEvalDocs: any[] = []
  let totalDocs = 0
  let pendingIncidents: any[] = []

  if (activeCaseIds.length > 0) {
    // All team-filed docs in active cases
    const { data: allDocs } = await (supabase as any)
      .from('documents')
      .select('id, case_id, title, document_type, created_at, teams(name, role), evaluations(published_at)')
      .in('case_id', activeCaseIds)
      .not('uploaded_by', 'is', null)
      .not('team_id', 'is', null)
      .not('document_type', 'in', '(certificate_conclusion,certificate_publication)')

    totalDocs = (allDocs ?? []).length

    // Pending evaluation: no published eval
    pendingEvalDocs = (allDocs ?? [])
      .filter((d: any) => {
        const evals = d.evaluations ?? []
        return !evals.some((e: any) => e.published_at)
      })
      .slice(0, 10) // top 10

    // Pending incidents: active incident cases
    const { data: incidentCases } = await (supabase as any)
      .from('cases')
      .select('id, title, incident_type, parent_case_id')
      .in('parent_case_id', activeCaseIds)
      .eq('status', 'active')

    pendingIncidents = incidentCases ?? []
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* ── Welcome header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Painel do Professor</h1>
        <p className="text-sm text-gray-500 mt-1">Visão geral dos seus casos e turmas</p>
      </div>

      {/* ── Metrics ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Alunos ativos"
          value={totalStudents}
          icon={Users}
          color="bg-blue-50 text-[#185FA5]"
        />
        <MetricCard
          label="Casos em andamento"
          value={(activeCases ?? []).length}
          icon={Gavel}
          color="bg-green-50 text-green-600"
          href="/dashboard/professor/casos"
        />
        <MetricCard
          label="Peças protocoladas"
          value={totalDocs}
          icon={FileText}
          color="bg-purple-50 text-purple-600"
        />
        <MetricCard
          label="Avaliações pendentes"
          value={pendingEvalDocs.length}
          icon={Star}
          color={pendingEvalDocs.length > 0 ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-400'}
        />
      </section>

      {/* ── Pendências ── */}
      {(pendingEvalDocs.length > 0 || pendingIncidents.length > 0) && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            Pendências
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Pending evaluations */}
            {pendingEvalDocs.length > 0 && (
              <div className="bg-white rounded-lg border border-orange-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-orange-50 border-b border-orange-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-semibold text-orange-700">
                      Peças aguardando avaliação
                    </span>
                  </div>
                  <span className="text-xs bg-orange-200 text-orange-700 px-2 py-0.5 rounded-full font-bold">
                    {pendingEvalDocs.length}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {pendingEvalDocs.slice(0, 6).map((doc: any) => {
                    const parentCaseId = doc.case_id
                    return (
                      <Link
                        key={doc.id}
                        href={`/dashboard/professor/casos/${parentCaseId}/avaliar`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 truncate">{doc.title}</p>
                          <p className="text-xs text-gray-400">
                            {doc.teams?.name ?? 'Sistema'} ·{' '}
                            {new Date(doc.created_at).toLocaleDateString('pt-BR', {
                              day: '2-digit', month: '2-digit',
                            })}
                          </p>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                      </Link>
                    )
                  })}
                  {pendingEvalDocs.length > 6 && (
                    <p className="px-4 py-2 text-xs text-gray-400 text-center">
                      + {pendingEvalDocs.length - 6} mais
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Pending incidents */}
            {pendingIncidents.length > 0 && (
              <div className="bg-white rounded-lg border border-orange-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-orange-50 border-b border-orange-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-semibold text-orange-700">
                      Recursos aguardando julgamento
                    </span>
                  </div>
                  <span className="text-xs bg-orange-200 text-orange-700 px-2 py-0.5 rounded-full font-bold">
                    {pendingIncidents.length}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {pendingIncidents.map((inc: any) => {
                    const typeLabel =
                      inc.incident_type === 'appeal_ai'
                        ? 'Agravo de Instrumento'
                        : 'Mandado de Segurança'
                    return (
                      <Link
                        key={inc.id}
                        href={`/dashboard/casos/${inc.id}/autos`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 truncate">{inc.title}</p>
                          <span className="text-xs text-orange-600 font-medium">{typeLabel}</span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Active cases quick table ── */}
      {(activeCases ?? []).length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">Casos em Andamento</h2>
            <Link
              href="/dashboard/professor/casos"
              className="text-sm text-[#185FA5] hover:text-[#134D87] font-medium"
            >
              Ver todos →
            </Link>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {(activeCases ?? []).map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{c.title}</p>
                      <p className="text-xs text-gray-400">{c.courses?.name}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        <Link
                          href={`/dashboard/casos/${c.id}/autos`}
                          className="text-xs text-[#185FA5] hover:text-[#134D87] font-medium flex items-center gap-1"
                        >
                          <Gavel className="h-3 w-3" /> Autos
                        </Link>
                        <Link
                          href={`/dashboard/professor/casos/${c.id}/avaliar`}
                          className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
                        >
                          <Star className="h-3 w-3" /> Avaliar
                        </Link>
                        <Link
                          href={`/dashboard/professor/casos/${c.id}/fato-novo`}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                        >
                          <MessageSquarePlus className="h-3 w-3" /> Fato Novo
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Minhas Turmas ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Minhas Turmas</h2>
          <CreateCourseModal />
        </div>

        {!courses || courses.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
            <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Nenhuma turma criada ainda.</p>
            <p className="text-sm text-gray-400 mt-1">Clique em &ldquo;Nova Turma&rdquo; para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((course) => {
              const memberCount = course.course_members?.[0]?.count ?? 0
              return (
                <div
                  key={course.id}
                  className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-gray-900">{course.name}</h3>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {course.semester}
                          </span>
                          {!course.active && (
                            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                              Inativa
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-1.5 text-sm text-gray-600">
                            <Users className="h-3.5 w-3.5 text-gray-400" />
                            {memberCount} aluno{memberCount !== 1 ? 's' : ''}
                          </div>
                          <div className="flex items-center gap-1.5 text-sm">
                            <span className="text-gray-500">Código:</span>
                            <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold tracking-widest text-[#185FA5] bg-blue-50 px-2 py-0.5 rounded">
                              {course.code}
                              <Copy className="h-3 w-3 text-gray-400" />
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Toggle e-mail */}
                        <form
                          action={async () => {
                            'use server'
                            await toggleEmailNotifications(course.id, !course.email_notifications_enabled)
                          }}
                        >
                          <button
                            type="submit"
                            title={course.email_notifications_enabled ? 'Desativar e-mails' : 'Ativar e-mails'}
                            className={`p-2 rounded-md border transition-colors ${
                              course.email_notifications_enabled
                                ? 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100'
                                : 'border-gray-200 bg-gray-50 text-gray-400 hover:bg-gray-100'
                            }`}
                          >
                            {course.email_notifications_enabled
                              ? <Mail className="h-4 w-4" />
                              : <BellOff className="h-4 w-4" />}
                          </button>
                        </form>

                        <Link
                          href={`/dashboard/professor/turmas/${course.id}`}
                          className="flex items-center gap-1 px-3 py-2 text-sm text-[#185FA5] border border-[#185FA5] rounded-md hover:bg-blue-50 transition-colors"
                        >
                          Ver alunos
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>

                        <DeleteCourseButton courseId={course.id} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
