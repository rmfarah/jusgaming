/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import { createSSRClient } from '@/lib/supabase/server'
import { GitBranch } from 'lucide-react'
import IncidentCard, { type IncidentCardData } from '@/components/IncidentCard'
import type { JusUser, JusDocumentWithRefs, TeamRole } from '@/lib/jusgaming.types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function IncidentesPage({ params }: PageProps) {
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

  // ── Verify parent case exists ────────────────────────────────────────────────
  const { data: jusgCase } = await (supabase as any)
    .from('cases')
    .select('id, title, professor_id')
    .eq('id', caseId)
    .single()

  if (!jusgCase) notFound()

  // ── Fetch incidents with docs + teams + members ──────────────────────────────
  const { data: rawIncidents } = await (supabase as any)
    .from('cases')
    .select(`
      id, title, status, incident_type, created_at,
      documents(
        id, sequence_number, uploaded_by, team_id, document_type, title,
        file_path, certificate_text, triggered_by, created_at,
        users(full_name),
        teams(name, role),
        evaluations(id, score, comments, published_at)
      ),
      teams(
        id, role, name,
        team_members(user_id)
      )
    `)
    .eq('parent_case_id', caseId)
    .order('created_at', { ascending: false }) as {
      data: Array<{
        id: string
        title: string
        status: string
        incident_type: string | null
        created_at: string
        documents: JusDocumentWithRefs[]
        teams: Array<{
          id: string
          role: TeamRole
          name: string
          team_members: Array<{ user_id: string }>
        }>
      }> | null
    }

  // ── Build IncidentCardData for each incident ─────────────────────────────────
  const incidents: IncidentCardData[] = (rawIncidents ?? []).map((inc) => {
    // Determine user's role in this incident
    let userTeamId: string | null = null
    let userTeamRole: TeamRole | 'professor' | null = null

    if (isProfessor) {
      userTeamId = null
      userTeamRole = 'professor'
    } else {
      const myTeam = (inc.teams ?? []).find((t) =>
        (t.team_members ?? []).some((m) => m.user_id === user.id),
      )
      if (myTeam) {
        userTeamId = myTeam.id
        userTeamRole = myTeam.role
      }
    }

    return {
      id: inc.id,
      title: inc.title,
      status: inc.status,
      incident_type: inc.incident_type,
      created_at: inc.created_at,
      documents: inc.documents ?? [],
      userTeamId,
      userTeamRole,
    }
  })

  const activeCount = incidents.filter((i) => i.status === 'active').length

  return (
    <div className="flex-1 overflow-y-auto">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-[#185FA5]" />
          <h2 className="font-semibold text-gray-900 text-sm">Incidentes</h2>
          {activeCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
              {activeCount} ativo{activeCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Agravos de Instrumento e Mandados de Segurança
        </p>
      </div>

      {/* ── Content ── */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {incidents.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <GitBranch className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum incidente neste processo.</p>
            <p className="text-xs mt-1 max-w-xs mx-auto">
              Incidentes são criados automaticamente quando um time protocola um
              Agravo de Instrumento ou Mandado de Segurança.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {incidents.map((inc, idx) => (
              <IncidentCard
                key={inc.id}
                incident={inc}
                defaultOpen={idx === 0 && inc.status === 'active'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
