/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import { createSSRClient } from '@/lib/supabase/server'
import AutosSidebar from '@/components/AutosSidebar'
import type { JusUser, JusCase, Course, Team, TeamRole } from '@/lib/jusgaming.types'

export interface CaseUserContext {
  caseId: string
  caseTitle: string
  caseStatus: string
  courseId: string
  professorId: string
  isProfessor: boolean
  userTeamId: string | null
  userTeamRole: TeamRole | null
  userTeamName: string | null
  activeIncidentCount: number
}

interface OtherCase {
  id: string
  title: string
  status: string
  teamRole: TeamRole | null
}

interface PageProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export default async function CaseLayout({ children, params }: PageProps) {
  const { id: caseId } = await params

  const supabase = await createSSRClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('id, role, institution_id')
    .eq('id', user.id)
    .single() as { data: Pick<JusUser, 'id' | 'role' | 'institution_id'> | null }

  if (!profile) redirect('/auth/login?error=profile_not_found')

  // ── Fetch the case ──────────────────────────────────────────────────────────
  const { data: jusgCase } = await (supabase as any)
    .from('cases')
    .select('id, title, status, course_id, professor_id, type, instance_level, courses(name, semester)')
    .eq('id', caseId)
    .single() as {
    data: (JusCase & { courses: Pick<Course, 'name' | 'semester'> }) | null
  }

  if (!jusgCase) notFound()

  const isProfessor = profile.role === 'professor' || profile.role === 'admin'

  // ── Find user's team in this case ──────────────────────────────────────────
  let userTeam: Pick<Team, 'id' | 'role' | 'name'> | null = null

  if (!isProfessor) {
    const { data: teamMemberships } = await (supabase as any)
      .from('team_members')
      .select('teams!inner(id, role, name, case_id)')
      .eq('user_id', user.id) as {
      data: Array<{ teams: Pick<Team, 'id' | 'role' | 'name'> & { case_id: string } }> | null
    }

    userTeam =
      teamMemberships
        ?.map((m) => m.teams)
        .find((t) => t.case_id === caseId) ?? null
  }

  // Guard: non-professor must be in a team for this case
  if (!isProfessor && !userTeam) {
    // Check if the user is enrolled in the course (maybe not yet assigned to a team)
    const { data: courseMember } = await (supabase as any)
      .from('course_members')
      .select('id')
      .eq('course_id', jusgCase.course_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!courseMember) {
      // No access
      redirect('/dashboard/aluno')
    }
  }

  // Also allow professor to access their own case
  if (isProfessor && jusgCase.professor_id !== user.id) {
    redirect('/dashboard/professor/casos')
  }

  // ── Count active incidents ──────────────────────────────────────────────────
  const { count: activeIncidentCount } = await (supabase as any)
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('parent_case_id', caseId)
    .eq('status', 'active')

  // ── Other cases for sidebar ─────────────────────────────────────────────────
  let otherCases: OtherCase[] = []

  if (isProfessor) {
    const { data: myCases } = await (supabase as any)
      .from('cases')
      .select('id, title, status')
      .eq('professor_id', user.id)
      .is('parent_case_id', null)
      .neq('id', caseId)
      .eq('status', 'active')
      .order('activated_at', { ascending: false })
      .limit(8) as { data: Array<{ id: string; title: string; status: string }> | null }

    otherCases = (myCases ?? []).map((c) => ({ ...c, teamRole: null }))
  } else {
    // Student: other active cases they're in
    const { data: memberships } = await (supabase as any)
      .from('team_members')
      .select('teams!inner(id, role, case_id, cases!inner(id, title, status))')
      .eq('user_id', user.id) as {
      data: Array<{
        teams: { id: string; role: TeamRole; case_id: string; cases: { id: string; title: string; status: string } }
      }> | null
    }

    otherCases = (memberships ?? [])
      .filter((m) => m.teams?.cases?.id !== caseId && m.teams?.cases?.status === 'active')
      .map((m) => ({
        id: m.teams.cases.id,
        title: m.teams.cases.title,
        status: m.teams.cases.status,
        teamRole: m.teams.role,
      }))
  }

  const ctx: CaseUserContext = {
    caseId,
    caseTitle: jusgCase.title,
    caseStatus: jusgCase.status,
    courseId: jusgCase.course_id,
    professorId: jusgCase.professor_id,
    isProfessor,
    userTeamId: userTeam?.id ?? null,
    userTeamRole: userTeam?.role ?? null,
    userTeamName: userTeam?.name ?? null,
    activeIncidentCount: activeIncidentCount ?? 0,
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Case sidebar — fixed width, scrollable */}
      <aside className="w-56 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
        <AutosSidebar
          ctx={ctx}
          courseName={jusgCase.courses?.name ?? ''}
          otherCases={otherCases}
          caseType={jusgCase.type}
          instanceLevel={jusgCase.instance_level}
        />
      </aside>

      {/* Main case area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
        {children}
      </div>
    </div>
  )
}
