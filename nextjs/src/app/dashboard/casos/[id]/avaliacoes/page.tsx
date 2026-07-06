/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import { createSSRClient } from '@/lib/supabase/server'
import { Star } from 'lucide-react'
import type { JusUser, TeamRole } from '@/lib/jusgaming.types'
import { DOCUMENT_TYPE_LABELS } from '@/lib/jusgaming.types'

interface PageProps {
  params: Promise<{ id: string }>
}

const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  plaintiff: 'Time Autor',
  defendant: 'Time Réu',
  judge: 'Time Juiz',
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400 text-sm">—</span>
  const pct = (score / 10) * 100
  const color = score >= 8 ? 'bg-green-500' : score >= 6 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-8 text-right">{score.toFixed(1)}</span>
    </div>
  )
}

export default async function AvaliacoesPage({ params }: PageProps) {
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

  const { data: jusgCase } = await (supabase as any)
    .from('cases')
    .select('id, title, status, professor_id')
    .eq('id', caseId)
    .single()

  if (!jusgCase) notFound()

  const isProfessor = profile.role === 'professor' || profile.role === 'admin'

  let myTeamId: string | null = null
  let myTeamRole: TeamRole | null = null
  let myTeamName: string | null = null

  if (!isProfessor) {
    const { data: tm } = await (supabase as any)
      .from('team_members')
      .select('teams!inner(id, role, name, case_id)')
      .eq('user_id', user.id) as {
      data: Array<{ teams: { id: string; role: TeamRole; name: string; case_id: string } }> | null
    }
    const myTeam = (tm ?? []).map((m) => m.teams).find((t) => t.case_id === caseId)
    if (myTeam) {
      myTeamId = myTeam.id
      myTeamRole = myTeam.role
      myTeamName = myTeam.name
    }
  }

  let evalDocs: any[] = []

  if (isProfessor) {
    const { data: rawDocs } = await (supabase as any)
      .from('documents')
      .select(`
        id, sequence_number, document_type, title, created_at,
        teams(name, role),
        evaluations(id, score, comments, weight, published_at)
      `)
      .eq('case_id', caseId)
      .not('uploaded_by', 'is', null)
      .not('team_id', 'is', null)
      .order('sequence_number', { ascending: true })

    evalDocs = (rawDocs ?? []).filter(
      (d: any) => d.evaluations?.length > 0 && d.evaluations[0].published_at,
    )
  } else if (myTeamId) {
    const { data: rawDocs } = await (supabase as any)
      .from('documents')
      .select(`
        id, sequence_number, document_type, title, created_at,
        evaluations(id, score, comments, weight, published_at)
      `)
      .eq('case_id', caseId)
      .eq('team_id', myTeamId)
      .not('uploaded_by', 'is', null)
      .order('sequence_number', { ascending: true })

    evalDocs = (rawDocs ?? []).filter(
      (d: any) => d.evaluations?.length > 0 && d.evaluations[0].published_at,
    )
  }

  // Weighted average
  function calcWeightedAvg(docs: any[]): number | null {
    const scored = docs.filter((d: any) => d.evaluations[0].score !== null)
    if (scored.length === 0) return null
    const sumW = scored.reduce((s: number, d: any) => s + (d.evaluations[0].weight ?? 1), 0)
    if (sumW === 0) return null
    const sumWS = scored.reduce((s: number, d: any) => s + (d.evaluations[0].score * (d.evaluations[0].weight ?? 1)), 0)
    return sumWS / sumW
  }

  const totalPublished = evalDocs.length
  const weightedAvg = calcWeightedAvg(evalDocs)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-[#185FA5]" />
          <h2 className="font-semibold text-gray-900 text-sm">Avaliações</h2>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {isProfessor
            ? 'Feedbacks publicados neste processo'
            : `Feedbacks do professor para ${myTeamName ?? 'seu time'}`}
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {totalPublished > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-center gap-6">
            <div>
              <p className="text-xs text-gray-500">Peças avaliadas</p>
              <p className="text-2xl font-bold text-gray-900">{totalPublished}</p>
            </div>
            {weightedAvg !== null && !isNaN(weightedAvg) && (
              <div>
                <p className="text-xs text-gray-500">Média ponderada</p>
                <p className={`text-2xl font-bold ${
                  weightedAvg >= 8 ? 'text-green-600' : weightedAvg >= 6 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {weightedAvg.toFixed(1)}
                </p>
              </div>
            )}
            {myTeamRole && (
              <div className="ml-auto">
                <p className="text-xs text-gray-500">Time</p>
                <p className="text-sm font-semibold text-gray-700">{TEAM_ROLE_LABELS[myTeamRole]}</p>
              </div>
            )}
          </div>
        )}

        {evalDocs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Star className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma avaliação publicada ainda.</p>
            <p className="text-xs mt-1">O professor publicará o feedback após revisar cada peça.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Avaliação por Peça
            </h3>
            {evalDocs.map((doc: any) => {
              const ev = doc.evaluations[0]
              return (
                <div key={doc.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">
                          {String(doc.sequence_number).padStart(3, '0')}
                        </span>
                        <span className="text-xs text-gray-500">
                          {DOCUMENT_TYPE_LABELS[doc.document_type as keyof typeof DOCUMENT_TYPE_LABELS] ?? doc.document_type}
                        </span>
                        {doc.teams && isProfessor && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {TEAM_ROLE_LABELS[doc.teams.role as TeamRole]}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 text-sm mt-0.5 truncate">{doc.title}</p>
                    </div>
                    {ev.score !== null && (
                      <span className={`text-xl font-bold flex-shrink-0 ${
                        ev.score >= 8 ? 'text-green-600' : ev.score >= 6 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {Number(ev.score).toFixed(1)}
                      </span>
                    )}
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    <ScoreBar score={ev.score !== null ? Number(ev.score) : null} />
                    {ev.comments && (
                      <blockquote className="border-l-4 border-[#185FA5] pl-3 text-sm text-gray-700 italic">
                        {ev.comments}
                      </blockquote>
                    )}
                    <p className="text-xs text-gray-400">
                      Avaliado em{' '}
                      {new Date(ev.published_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'long', year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
