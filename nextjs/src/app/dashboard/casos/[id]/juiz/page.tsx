/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import DocumentDownloadButton from '@/components/DocumentDownloadButton'
import {
  Gavel, FileText, AlertTriangle, Calendar, CheckCircle2,
  Circle, GitBranch, Clock, ArrowRight, ChevronRight,
} from 'lucide-react'
import type { JusUser, TeamRole } from '@/lib/jusgaming.types'
import { DOCUMENT_TYPE_LABELS } from '@/lib/jusgaming.types'

interface PageProps {
  params: Promise<{ id: string }>
}

// Document types that are "lawyer filings" (trigger certidão de conclusão)
const LAWYER_FILING_TYPES = new Set([
  'petition', 'counterclaim',
  'appeal_ai', 'appeal_ms', 'appeal_ed', 'appeal_general',
  'incident_request', 'document_filing', 'other',
  // Incident lawyer types
  'complementation', 'counterargument', 'withdrawal',
])

export default async function JuizPage({ params }: PageProps) {
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

  // ── Fetch case — FIX LOW: professors must own the case at DB query level ──────
  const caseQuery = (supabase as any)
    .from('cases')
    .select('id, title, status, professor_id')
    .eq('id', caseId)

  // For professors, enforce ownership at the DB query, not only in app code
  if (isProfessor) caseQuery.eq('professor_id', user.id)

  const { data: jusgCase } = await caseQuery.single()

  if (!jusgCase) {
    if (isProfessor) redirect('/dashboard/professor/casos')
    notFound()
  }

  // ── Verify judge membership (non-professors only) ───────────────────────────
  let judgeTeamId: string | null = null

  if (!isProfessor) {
    const { data: tm } = await (supabase as any)
      .from('team_members')
      .select('teams!inner(id, role, case_id)')
      .eq('user_id', user.id) as {
      data: Array<{ teams: { id: string; role: TeamRole; case_id: string } }> | null
    }

    const myTeam = (tm ?? []).map((m) => m.teams).find((t) => t.case_id === caseId)
    if (!myTeam || myTeam.role !== 'judge') {
      // Not a judge in this case — redirect to autos
      redirect(`/dashboard/casos/${caseId}/autos`)
    }
    judgeTeamId = myTeam.id
  } else {
    // Professor: ownership already enforced at DB query level above

    const { data: jt } = await (supabase as any)
      .from('teams')
      .select('id')
      .eq('case_id', caseId)
      .eq('role', 'judge')
      .single()

    judgeTeamId = jt?.id ?? null
  }

  // ── Fetch all documents for this case ───────────────────────────────────────
  const { data: rawDocs } = await (supabase as any)
    .from('documents')
    .select(`
      id, sequence_number, uploaded_by, team_id,
      document_type, title, file_path, certificate_text, created_at,
      users(full_name),
      teams(name, role),
      evaluations(id, score, published_at)
    `)
    .eq('case_id', caseId)
    .order('sequence_number', { ascending: true }) as {
    data: Array<{
      id: string
      sequence_number: number
      uploaded_by: string | null
      team_id: string | null
      document_type: string
      title: string
      file_path: string | null
      certificate_text: string | null
      created_at: string
      users: { full_name: string } | null
      teams: { name: string; role: TeamRole } | null
      evaluations: Array<{ id: string; score: number | null; published_at: string | null }> | null
    }> | null
  }

  const allDocs = rawDocs ?? []

  // ── Fetch active incidents ──────────────────────────────────────────────────
  const { data: activeIncidents } = await (supabase as any)
    .from('cases')
    .select('id, title, created_at, incident_type')
    .eq('parent_case_id', caseId)
    .eq('status', 'active') as {
    data: Array<{ id: string; title: string; created_at: string; incident_type: string }> | null
  }

  // ── Compute metrics ─────────────────────────────────────────────────────────
  const effectiveDocs = allDocs.filter((d) => d.document_type !== 'case_material')
  const totalAtos = effectiveDocs.filter((d) => !['certificate_conclusion', 'certificate_publication', 'certificate_citation'].includes(d.document_type)).length
  const lawyerDocs = allDocs.filter((d) => LAWYER_FILING_TYPES.has(d.document_type))

  // Autos conclusos: last certificate_conclusion is more recent than last judge document
  const certConclusions = allDocs.filter((d) => d.document_type === 'certificate_conclusion')
  const lastConclusion = certConclusions[certConclusions.length - 1] ?? null

  const lastJudgeDoc = judgeTeamId
    ? allDocs.filter((d) => d.team_id === judgeTeamId).slice(-1)[0] ?? null
    : null

  const isConcluso =
    lastConclusion !== null &&
    (lastJudgeDoc === null || lastConclusion.sequence_number > lastJudgeDoc.sequence_number)

  // ── Judge history (docs authored by judge team) ─────────────────────────────
  const judgeHistory = allDocs
    .filter((d) => judgeTeamId && d.team_id === judgeTeamId)
    .reverse()

  // ── Hearing notices (all, most recent first) ────────────────────────────────
  const hearingDocs = allDocs
    .filter((d) => d.document_type === 'hearing_notice')
    .reverse()

  // ── Build pending items ─────────────────────────────────────────────────────
  type PendingItem =
    | { kind: 'conclusion'; doc: typeof lastConclusion }
    | { kind: 'incident'; incident: NonNullable<typeof activeIncidents>[number] }
    | { kind: 'hearing'; doc: (typeof allDocs)[number] }

  const pendingItems: PendingItem[] = []

  if (isConcluso && lastConclusion) {
    pendingItems.push({ kind: 'conclusion', doc: lastConclusion })
  }
  for (const incident of activeIncidents ?? []) {
    pendingItems.push({ kind: 'incident', incident })
  }
  for (const hDoc of hearingDocs) {
    pendingItems.push({ kind: 'hearing', doc: hDoc })
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Gavel className="h-4 w-4 text-purple-600" />
            Painel do Time Juiz
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-sm">{jusgCase.title}</p>
        </div>
        <Link
          href={`/dashboard/casos/${caseId}/autos`}
          className="flex items-center gap-1 text-xs text-[#185FA5] hover:text-[#134D87] font-medium"
        >
          Ver autos
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="p-5 space-y-6 max-w-4xl">

        {/* ── Seção 1: Métricas ── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Status atual do caso
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total de atos */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Total de atos</p>
              <p className="text-2xl font-bold text-gray-900">{totalAtos}</p>
              <p className="text-xs text-gray-400 mt-1">nos autos</p>
            </div>

            {/* Peças dos advogados */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Peças dos advogados</p>
              <p className="text-2xl font-bold text-gray-900">{lawyerDocs.length}</p>
              <p className="text-xs text-gray-400 mt-1">petições e recursos</p>
            </div>

            {/* Autos conclusos */}
            <div className={`bg-white rounded-xl border p-4 ${isConcluso ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
              <p className="text-xs text-gray-500 mb-1">Autos conclusos?</p>
              {isConcluso && lastConclusion ? (
                <>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <span className="text-xs font-semibold text-amber-700">Sim</span>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    Desde {fmtDateTime(lastConclusion.created_at)}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="text-xs font-medium text-gray-500">Não</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Em ordem</p>
                </>
              )}
            </div>

            {/* Incidentes ativos */}
            <div className={`bg-white rounded-xl border p-4 ${(activeIncidents?.length ?? 0) > 0 ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
              <p className="text-xs text-gray-500 mb-1">Incidentes ativos</p>
              <p className={`text-2xl font-bold ${(activeIncidents?.length ?? 0) > 0 ? 'text-orange-700' : 'text-gray-900'}`}>
                {activeIncidents?.length ?? 0}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {(activeIncidents?.length ?? 0) > 0 ? 'aguardando decisão' : 'nenhum pendente'}
              </p>
            </div>
          </div>
        </section>

        {/* ── Seção 2: Pendências ── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pendências do Time Juiz
          </h3>

          {pendingItems.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">Nenhuma pendência no momento.</p>
              <p className="text-xs text-gray-400 mt-1">Os autos estão em dia.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingItems.map((item, i) => {
                if (item.kind === 'conclusion') {
                  return (
                    <div key={`conclusion-${i}`} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-amber-900">
                            Autos conclusos
                          </p>
                          <p className="text-xs text-amber-700 mt-0.5">
                            Conclusos desde {fmtDateTime(item.doc!.created_at)} — aguardando pronunciamento
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/casos/${caseId}/autos`}
                        className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Ir para os autos
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )
                }

                if (item.kind === 'incident') {
                  const created = fmtDate(item.incident.created_at)
                  const label = item.incident.incident_type === 'appeal_ai'
                    ? 'Agravo de Instrumento'
                    : 'Mandado de Segurança'
                  return (
                    <div key={`incident-${item.incident.id}`} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <GitBranch className="h-4 w-4 text-red-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-red-900">
                            Incidente aguardando julgamento
                          </p>
                          <p className="text-xs text-red-700 mt-0.5 truncate">
                            {label} interposto em {created} — aguarda decisão
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/casos/${item.incident.id}/autos`}
                        className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-red-800 hover:text-red-900 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Ver incidente
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )
                }

                if (item.kind === 'hearing') {
                  return (
                    <div key={`hearing-${item.doc.id}`} className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Calendar className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-blue-900">
                            Audiência designada
                          </p>
                          <p className="text-xs text-blue-700 mt-0.5 truncate max-w-xs">
                            {item.doc.title}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/casos/${caseId}/autos`}
                        className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-blue-800 hover:text-blue-900 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Ver detalhes
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )
                }

                return null
              })}
            </div>
          )}
        </section>

        {/* ── Seção 3: Histórico do Time Juiz ── */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Histórico de atos do Time Juiz
          </h3>

          {judgeHistory.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">
              <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Nenhum ato protocolado ainda pelo Time Juiz.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-12">ID</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500">Título</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 hidden md:table-cell w-36">Tipo</th>
                    <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-36">Data/Hora</th>
                    <th className="px-4 py-2.5 text-center font-medium text-gray-500 w-16">PDF</th>
                    <th className="px-4 py-2.5 text-center font-medium text-gray-500 w-16">Aval.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {judgeHistory.map((doc) => {
                    const evaluation = doc.evaluations?.[0]
                    const hasEval = !!evaluation
                    const evalPublished = !!evaluation?.published_at

                    return (
                      <tr key={doc.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 font-mono text-gray-500 font-semibold">
                          {String(doc.sequence_number).padStart(3, '0')}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 leading-snug">{doc.title}</p>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-xs">
                            {DOCUMENT_TYPE_LABELS[doc.document_type as keyof typeof DOCUMENT_TYPE_LABELS] ?? doc.document_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {fmtDateTime(doc.created_at)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {doc.file_path ? (
                            <DocumentDownloadButton documentId={doc.id} />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {hasEval ? (
                            <span title={evalPublished ? `Nota: ${evaluation?.score ?? '—'}` : 'Avaliação salva (não publicada)'}>
                              <CheckCircle2 className={`h-3.5 w-3.5 mx-auto ${evalPublished ? 'text-green-500' : 'text-gray-300'}`} />
                            </span>
                          ) : (
                            <Circle className="h-3.5 w-3.5 mx-auto text-gray-200" />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
