/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import { removeMember, toggleMemberActive } from '@/lib/actions/courses'
import { ArrowLeft, UserX, ShieldOff, ShieldCheck } from 'lucide-react'
import type { JusUser, Course, CourseMember } from '@/lib/jusgaming.types'

interface MemberRow extends CourseMember {
  users: Pick<JusUser, 'id' | 'full_name' | 'email' | 'active'>
}

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSSRClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Verifica que o professor é dono da turma (RLS garante, mas verificamos explicitamente)
  const { data: course } = await (supabase as any)
    .from('courses')
    .select('*')
    .eq('id', id)
    .eq('professor_id', user.id)
    .single() as { data: Course | null }

  if (!course) notFound()

  const { data: members } = await (supabase as any)
    .from('course_members')
    .select('*, users(id, full_name, email, active)')
    .eq('course_id', id)
    .order('joined_at', { ascending: true }) as { data: MemberRow[] | null }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/professor"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para turmas
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{course.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{course.semester}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-0.5">Código de acesso</p>
            <span className="font-mono text-lg font-bold tracking-widest text-[#185FA5] bg-blue-50 px-3 py-1 rounded border border-blue-200">
              {course.code}
            </span>
            <p className="text-xs text-gray-400 mt-1">Compartilhe com os alunos</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
          <span>{members?.length ?? 0} aluno{(members?.length ?? 0) !== 1 ? 's' : ''}</span>
          <span
            className={`px-2 py-0.5 rounded text-xs ${
              course.email_notifications_enabled
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {course.email_notifications_enabled ? 'E-mails ativos' : 'E-mails desativados'}
          </span>
        </div>
      </div>

      {/* Tabela de alunos */}
      {!members || members.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-500">Nenhum aluno nesta turma ainda.</p>
          <p className="text-sm text-gray-400 mt-1">
            Compartilhe o código <strong>{course.code}</strong> para que os alunos se cadastrem.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Aluno
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ingresso
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((member) => {
                const u = member.users
                return (
                  <tr key={member.id} className={!u.active ? 'bg-red-50/40' : undefined}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{u.full_name}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {u.active ? 'Ativo' : 'Bloqueado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(member.joined_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {/* Bloquear / desbloquear */}
                        <form
                          action={async () => {
                            'use server'
                            await toggleMemberActive(u.id, !u.active, id)
                          }}
                        >
                          <button
                            type="submit"
                            title={u.active ? 'Bloquear aluno' : 'Desbloquear aluno'}
                            className={`p-1.5 rounded border transition-colors ${
                              u.active
                                ? 'border-orange-200 text-orange-500 hover:bg-orange-50'
                                : 'border-green-200 text-green-600 hover:bg-green-50'
                            }`}
                          >
                            {u.active
                              ? <ShieldOff className="h-3.5 w-3.5" />
                              : <ShieldCheck className="h-3.5 w-3.5" />}
                          </button>
                        </form>

                        {/* Remover */}
                        <form
                          action={async () => {
                            'use server'
                            await removeMember(id, u.id)
                          }}
                        >
                          <button
                            type="submit"
                            title="Remover da turma"
                            className="p-1.5 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                        </form>
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
