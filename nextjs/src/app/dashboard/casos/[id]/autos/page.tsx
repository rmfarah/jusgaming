/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import ProtocolBar from '@/components/ProtocolBar'
import JudgeActionPanel from '@/components/JudgeActionPanel'
import DocumentDownloadButton from '@/components/DocumentDownloadButton'
import { Bot, FileText, CheckCircle2, Circle, GitBranch, Scale } from 'lucide-react'
import type { JusUser, JusDocumentWithRefs, TeamRole, InstanceLevel } from '@/lib/jusgaming.types'
import { DOCUMENT_TYPE_LABELS } from '@/lib/jusgaming.types'
import EvaluationModal from '@/components/EvaluationModal'

interface PageProps {
  params: Promise<{ id: string }>
}

const TEAM_ROLE_COLORS: Record<TeamRole, string> = {
  plaintiff: 'bg-blue-100 text-blue-700 border-blue-200',
  defendant: 'bg-amber-100 text-amber-700 border-amber-200',
  judge: 'bg-purple-100 text-purple-700 border-purple-200',
}
const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  plaintiff: 'Autor',
  defendant: 'Réu',
  judge: 'Juiz',
}

// Badge style per document_type
const TYPE_BADGE: Record<string, string> = {
  petition: 'bg-blue-50 text-blue-700',
  counterclaim: 'bg-blue-50 text-blue-700',
  appeal_ai: 'bg-orange-50 text-orange-700',
  appeal_ms: 'bg-orange-50 text-orange-700',
  appeal_ed: 'bg-orange-50 text-orange-700',
  appeal_general: 'bg-orange-50 text-orange-700',
  incident_request: 'bg-yellow-50 text-yellow-700',
  document_filing: 'bg-gray-100 text-gray-700',
  other: 'bg-gray-100 text-gray-700',
  order: 'bg-purple-50 text-purple-700',
  decision: 'bg-purple-50 text-purple-700',
  intimation: 'bg-purple-50 text-purple-700',
  sentence: 'bg-purple-50 text-purple-700',
  minutes: 'bg-purple-50 text-purple-700',
  saneamento: 'bg-purple-50 text-purple-700',
  certificate_conclusion: 'bg-gray-100 text-gray-500',
  certificate_publication: 'bg-gray-100 text-gray-500',
  certificate_citation: 'bg-green-50 text-green-700',
  certificate_distribution: 'bg-green-50 text-green-700',
  hearing_notice: 'bg-teal-50 text-teal-700',
  case_material: 'bg-green-50 text-green-700',
  substitution_of_attorney: 'bg-gray-100 text-gray-600',
  // Incident-specific
  acordao: 'bg-purple-50 text-purple-700',
  decision_monocratica: 'bg-purple-50 text-purple-700',
  complementation: 'bg-blue-50 text-blue-700',
  counterargument: 'bg-amber-50 text-amber-700',
  withdrawal: 'bg-gray-100 text-gray-600',
}

export default async function AutosPage({ params }: PageProps) {
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

  // ── Fetch case ──────────────────────────────────────────────────────────────
  const { data: jusgCase } = await (supabase as any)
    .from('cases')
    .select('id, title, status, professor_id, course_id, parent_case_id, instance_level')
    .eq('id', caseId)
    .single()

  if (!jusgCase) notFound()

  // FIX MEDIUM: defense-in-depth — enforce professor ownership at the page level,
  // not only in the layout, so the check survives future refactors.
  if (isProfessor && jusgCase.professor_id !== user.id) {
    redirect('/dashboard/professor/casos')
  }

  const isIncidentCase = !!jusgCase.parent_case_id

  // ── Find user's team ────────────────────────────────────────────────────────
  let userTeamId: string | null = null
  let userTeamRole: TeamRole | 'professor' = 'professor'

  if (!isProfessor) {
    const { data: tm } = await (supabase as any)
      .from('team_members')
      .select('teams!inner(id, role, case_id)')
      .eq('user_id', user.id) as {
      data: Array<{ teams: { id: string; role: TeamRole; case_id: string } }> | null
    }

    const myTeam = (tm ?? []).map((m) => m.teams).find((t) => t.case_id === caseId)
    if (myTeam) {
      userTeamId = myTeam.id
      userTeamRole = myTeam.role
    }
  }

  // ── Fetch documents ─────────────────────────────────────────────────────────
  const { data: allDocuments } = await (supabase as any)
    .from('documents')
    .select(`
      id, case_id, sequence_number, uploaded_by, team_id,
      document_type, title, file_path, certificate_text, triggered_by, created_at,
      users(full_name),
      teams(name, role),
      evaluations(id, score, comments, weight, published_at)
    `)
    .eq('case_id', caseId)
    .order('sequence_number', { ascending: true }) as { data: JusDocumentWithRefs[] | null }

  // case_material docs are delivered via email before the case starts —
  // they do NOT appear in the autos; students file them via document_filing if needed.
  const documents = (allDocuments ?? []).filter((d) => d.document_type !== 'case_material')

  const canProtocol = jusgCase.status === 'active'
  const instanceLevel = jusgCase.instance_level as InstanceLevel | undefined

  // Banner config by instance_level
  const BANNER: Record<string, { text: string; sub: string; color: string }> = {
    first: {
      text: '1ª Instância',
      sub: 'Time Juiz: alunos · Professor atua como TJ',
      color: 'bg-blue-50 border-blue-200 text-blue-800',
    },
    appeal_interlocutory: {
      text: '2º Grau — Agravo de Instrumento',
      sub: 'Câmara do TJ: alunos · Professor atua como STJ/STF',
      color: 'bg-amber-50 border-amber-200 text-amber-800',
    },
    appeal_sentence: {
      text: '2º Grau — Apelação',
      sub: 'Câmara do TJ: alunos · Professor atua como STJ/STF',
      color: 'bg-amber-50 border-amber-200 text-amber-800',
    },
    arbitral: {
      text: 'Arbitragem',
      sub: 'Time Árbitro: alunos · Regulamento arbitral',
      color: 'bg-purple-50 border-purple-200 text-purple-800',
    },
  }

  const banner = instanceLevel ? BANNER[instanceLevel] ?? null : null

  return (
    <>
      {/* Scrollable document list */}
      <div className="flex-1 overflow-y-auto">
        {/* Page header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">
              {isIncidentCase ? 'Autos do Incidente' : 'Autos do Processo'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {documents?.length ?? 0} ato{(documents?.length ?? 0) !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {jusgCase.status === 'closed' && (
              <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-500 font-medium">
                Encerrado
              </span>
            )}
            {isIncidentCase && (
              <Link
                href={`/dashboard/casos/${jusgCase.parent_case_id}/incidentes`}
                className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1 font-medium"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Processo principal
              </Link>
            )}
          </div>
        </div>

        {/* ── Instance level banner ── */}
        {banner && !isIncidentCase && (
          <div className={`mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${banner.color}`}>
            <Scale className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="font-semibold">{banner.text}</span>
            <span className="text-opacity-70 hidden sm:inline">· {banner.sub}</span>
          </div>
        )}

        {/* Document table */}
        {!documents || documents.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum ato nos autos ainda.</p>
            {canProtocol && (
              <p className="text-xs mt-1">Use a barra abaixo para protocolar o primeiro ato.</p>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-16">ID</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500">Ato / Documento</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 hidden lg:table-cell w-44">Tipo</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 hidden md:table-cell w-36">Protocolado por</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-36">Data/Hora</th>
                <th className="px-4 py-2.5 text-center font-medium text-gray-500 w-20">PDF</th>
                <th className="px-4 py-2.5 text-center font-medium text-gray-500 w-12">Aval.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documents.map((doc) => {
                const isSystem = doc.uploaded_by === null
                const isMyDoc = doc.uploaded_by === user.id
                const teamRole = doc.teams?.role as TeamRole | undefined
                const typeBadge = TYPE_BADGE[doc.document_type] ?? 'bg-gray-100 text-gray-600'
                const isIncidentOrigin =
                  !isIncidentCase &&
                  (doc.document_type === 'appeal_ai' || doc.document_type === 'appeal_ms')

                // Evaluation visibility
                const evaluation = doc.evaluations?.[0]
                const evalVisible =
                  isProfessor
                    ? !!evaluation
                    : !!evaluation?.published_at

                return (
                  <tr
                    key={doc.id}
                    className={`transition-colors ${
                      isSystem
                        ? 'bg-gray-50/80'
                        : isMyDoc
                          ? 'bg-blue-50/40 hover:bg-blue-50/60'
                          : 'bg-white hover:bg-gray-50/60'
                    }`}
                  >
                    {/* Sequence number */}
                    <td className="px-4 py-3 font-mono text-gray-600 font-semibold">
                      {String(doc.sequence_number).padStart(3, '0')}
                    </td>

                    {/* Title + incident cross-reference */}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        {isSystem && (
                          <Bot className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className={`font-medium leading-snug ${isSystem ? 'text-gray-500' : 'text-gray-900'}`}>
                            {doc.title}
                          </p>
                          {isSystem && doc.certificate_text && (
                            <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">
                              {doc.certificate_text}
                            </p>
                          )}
                          {/* Incident origin → link to incidentes tab */}
                          {isIncidentOrigin && (
                            <Link
                              href={`/dashboard/casos/${caseId}/incidentes`}
                              className="mt-1 inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium"
                            >
                              <GitBranch className="h-3 w-3" />
                              Ver incidente →
                            </Link>
                          )}
                          {/* Team badge (mobile-visible) */}
                          {teamRole && (
                            <span className={`lg:hidden mt-1 inline-block text-xs px-1.5 py-0.5 rounded border ${TEAM_ROLE_COLORS[teamRole]}`}>
                              {TEAM_ROLE_LABELS[teamRole]}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Document type badge */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${typeBadge}`}>
                          {DOCUMENT_TYPE_LABELS[doc.document_type]}
                        </span>
                        {teamRole && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${TEAM_ROLE_COLORS[teamRole]}`}>
                            {TEAM_ROLE_LABELS[teamRole]}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Uploader */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {isSystem ? (
                        <span className="text-gray-400 italic flex items-center gap-1">
                          <Bot className="h-3 w-3" /> Sistema
                        </span>
                      ) : (
                        <span className={`${isMyDoc ? 'text-[#185FA5] font-medium' : 'text-gray-600'}`}>
                          {doc.users?.full_name ?? '—'}
                        </span>
                      )}
                    </td>

                    {/* Date/Time */}
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(doc.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                      })}
                      {' '}
                      <span className="text-gray-400">
                        {new Date(doc.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </td>

                    {/* Download */}
                    <td className="px-4 py-3 text-center">
                      {doc.file_path ? (
                        <DocumentDownloadButton documentId={doc.id} />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Evaluation dot / feedback button */}
                    <td className="px-4 py-3 text-center">
                      {evalVisible ? (
                        !isProfessor && evaluation?.published_at ? (
                          // Student sees a "Ver feedback" button
                          <EvaluationModal
                            docTitle={doc.title}
                            evaluation={{
                              score: evaluation.score ?? null,
                              comments: evaluation.comments ?? null,
                              published_at: evaluation.published_at,
                            }}
                          />
                        ) : (
                          <span title={
                            isProfessor && evaluation && !evaluation.published_at
                              ? 'Avaliação salva (não publicada)'
                              : `Nota: ${evaluation?.score ?? '—'}`
                          }>
                            <CheckCircle2 className={`h-3.5 w-3.5 mx-auto ${
                              evaluation?.published_at ? 'text-green-500' : 'text-gray-300'
                            }`} />
                          </span>
                        )
                      ) : (
                        <Circle className="h-3.5 w-3.5 mx-auto text-gray-200" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Action bar — sticky bottom */}
      {canProtocol && (
        userTeamRole === 'judge' && userTeamId ? (
          <JudgeActionPanel
            caseId={caseId}
            judgeTeamId={userTeamId}
            isIncident={isIncidentCase}
            instanceLevel={instanceLevel}
          />
        ) : (
          <ProtocolBar
            caseId={caseId}
            teamId={userTeamId}
            teamRole={userTeamRole}
            isIncident={isIncidentCase}
            instanceLevel={instanceLevel}
          />
        )
      )}
    </>
  )
}
