/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import TeamsForm from '@/components/TeamsForm'
import { ArrowLeft } from 'lucide-react'
import type { JusUser, JusCase, Course, TeamRole } from '@/lib/jusgaming.types'

interface TeamData {
  id: string
  role: TeamRole
  name: string
  memberIds: string[]
}

interface CourseMember {
  user_id: string
  users: {
    id: string
    full_name: string
    email: string
    active: boolean
  }
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TimesPage({ params }: PageProps) {
  const { id: caseId } = await params

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

  // Fetch the case
  const { data: jusgCase } = await (supabase as any)
    .from('cases')
    .select('*, courses(name, semester)')
    .eq('id', caseId)
    .eq('professor_id', user.id)
    .single() as {
    data: (JusCase & { courses: Pick<Course, 'name' | 'semester'> }) | null
  }

  if (!jusgCase) notFound()

  // Fetch teams with members
  const { data: rawTeams } = await (supabase as any)
    .from('teams')
    .select('id, role, name, team_members(user_id)')
    .eq('case_id', caseId)
    .order('role') as {
    data: Array<{
      id: string
      role: TeamRole
      name: string
      team_members: Array<{ user_id: string }>
    }> | null
  }

  const teams: TeamData[] = (rawTeams ?? []).map((t) => ({
    id: t.id,
    role: t.role,
    name: t.name,
    memberIds: t.team_members.map((m) => m.user_id),
  }))

  // Fetch course members (students enrolled in this course)
  const { data: courseMembers } = await (supabase as any)
    .from('course_members')
    .select('user_id, users(id, full_name, email, active)')
    .eq('course_id', jusgCase.course_id) as { data: CourseMember[] | null }

  const students = (courseMembers ?? [])
    .filter((m) => m.users?.active !== false)
    .map((m) => ({
      id: m.users.id,
      full_name: m.users.full_name,
      email: m.users.email,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))

  const isEditable = jusgCase.status === 'draft'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/professor/casos"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Casos
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{jusgCase.title}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {jusgCase.courses?.name} · {jusgCase.courses?.semester}
            </p>
          </div>
          <StatusBadge status={jusgCase.status} />
        </div>
      </div>

      {/* Step indicator (only for draft) */}
      {isEditable && (
        <div className="flex items-center gap-2 mb-6 text-sm">
          <span className="flex items-center gap-1.5 text-[#185FA5] font-medium">
            <span className="w-6 h-6 rounded-full bg-[#185FA5] text-white flex items-center justify-center text-xs font-bold">1</span>
            Times
          </span>
          <span className="text-gray-300">→</span>
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-bold">2</span>
            Briefings
          </span>
        </div>
      )}

      {!isEditable && (
        <div className="mb-6 p-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
          Este caso está <strong>{jusgCase.status === 'active' ? 'ativo' : 'encerrado'}</strong> — os times não podem ser alterados.
        </div>
      )}

      {students.length === 0 && isEditable && (
        <div className="mb-6 p-3 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg">
          A turma não tem alunos cadastrados ainda.{' '}
          <Link href="/dashboard/professor" className="underline">
            Compartilhe o código da turma
          </Link>{' '}
          para que os alunos se inscrevam.
        </div>
      )}

      <TeamsForm
        caseId={caseId}
        teams={teams}
        students={students}
        isEditable={isEditable}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    draft: 'bg-gray-100 text-gray-600 border-gray-200',
    active: 'bg-green-100 text-green-700 border-green-200',
    closed: 'bg-gray-200 text-gray-500 border-gray-300',
  } as Record<string, string>

  const labels = { draft: 'Rascunho', active: 'Ativo', closed: 'Encerrado' } as Record<string, string>

  return (
    <span className={`text-xs px-2.5 py-1 rounded border font-medium flex-shrink-0 ${config[status] ?? config.draft}`}>
      {labels[status] ?? status}
    </span>
  )
}
