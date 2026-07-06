/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import EvaluationDocRow, { type DocForEval } from '@/components/EvaluationDocRow'
import CaseEvalForm, { type TeamEvalDoc } from '@/components/CaseEvalForm'
import { ArrowLeft, FileText, BarChart2 } from 'lucide-react'
import type { JusUser, JusCase, Course, TeamRole } from '@/lib/jusgaming.types'

interface PageProps {
  params: Promise<{ id: string }>
}

const SYSTEM_TYPES = new Set([
  'certificate_conclusion',
  'certificate_publication',
  'certificate_citation',
  'certificate_distribution',
  'hearing_notice',
  'case_material',
  'substitution_of_attorney',
])

export default async function AvaliarPage({ params }: PageProps) {
  const { id: caseId } = await params

  const supabase = await createSSRClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single() as { data: Pick<JusUser, 'id' | 'role'> | null }

  if (!profile || (profile.role !== 'professor' && profile.role !== 'admin')) {
    redirect('/dashboard/aluno')
  }

  const { data: jusgCase } = await (supabase as any)
    .from('cases')
    .select('*, courses(name, semester)')
    .eq('id', caseId)
    .eq('professor_id', user.id)
    .single() as { data: (JusCase & { courses: Pick<Course, 'name' | 'semester'> }) | null }

  if (!jusgCase) notFound()

  // All student docs (no system certs)
  const { data: rawDocs } = await (supabase as any)
    .from('documents')
    .select(`
      id, sequence_number, document_type, title, file_path, created_at,
      uploaded_by, team_id,
      teams(id, name, role),
      evaluations(id, score, comments, weight, published_at)
    `)
    .eq('case_id', caseId)
    .not('uploaded_by', 'is', null)
    .not('team_id', 'is', null)
    .order('sequence_number', { ascending: true })

  const docs: DocForEval[] = (rawDocs ?? [])
    .filter((d: any) => !SYSTEM_TYPES.has(d.document_type))
    .map((d: any) => ({
      id: d.id,
      sequence_number: d.sequence_number,
      document_type: d.document_type,
      title: d.title,
      file_path: d.file_path,
      created_at: d.created_at,
      teams: d.teams ? { name: d.teams.name, role: d.teams.role as TeamRole } : null,
      evaluation: d.evaluations?.[0]
        ? {
            id: d.evaluations[0].id,
            score: d.evaluations[0].score ?? null,
            comments: d.evaluations[0].comments ?? null,
            weight: d.evaluations[0].weight ?? 1,
            published_at: d.evaluations[0].published_at ?? null,
          }
        : null,
    }))

  const pendingCount = docs.filter((d) => !d.evaluation?.published_at).length
  const publishedCount = docs.filter((d) => !!d.evaluation?.published_at).length

  // Teams (plaintiff + defendant only for summary)
  const { data: rawTeams } = await (supabase as any)
    .from('teams')
    .select('id, role, name')
    .eq('case_id', caseId)
    .order('role') as { data: Array<{ id: string; role: TeamRole; name: string }> | null }

  const evalTeams = (rawTeams ?? []).filter((t) => t.role !== 'judge')

  // Build per-team doc lists (only evaluated docs)
  const teamDocMap: Record<string, TeamEvalDoc[]> = {}
  for (const team of evalTeams) teamDocMap[team.id] = []

  for (const doc of docs) {
    const teamId = rawTeams?.find((t) => t.name === doc.teams?.name && t.role === doc.teams?.role)?.id
      ?? rawDocs?.find((d: any) => d.id === doc.id)?.team_id
    if (!teamId || !teamDocMap[teamId] || !doc.evaluation) continue
    teamDocMap[teamId].push({
      evaluationId: doc.evaluation.id,
      documentId: doc.id,
      sequenceNumber: doc.sequence_number,
      documentType: doc.document_type,
      title: doc.title,
      score: doc.evaluation.score,
      weight: doc.evaluation.weight,
      publishedAt: doc.evaluation.published_at,
    })
  }

  // Build teamId from rawDocs directly (more reliable)
  const teamDocMapById: Record<string, TeamEvalDoc[]> = {}
  for (const team of evalTeams) teamDocMapById[team.id] = []
  for (const raw of (rawDocs ?? [])) {
    if (SYSTEM_TYPES.has(raw.document_type)) continue
    if (!raw.evaluations?.[0]) continue
    const teamId = raw.team_id
    if (!teamDocMapById[teamId]) continue
    teamDocMapById[teamId].push({
      evaluationId: raw.evaluations[0].id,
      documentId: raw.id,
      sequenceNumber: raw.sequence_number,
      documentType: raw.document_type,
      title: raw.title,
      score: raw.evaluations[0].score ?? null,
      weight: raw.evaluations[0].weight ?? 1,
      publishedAt: raw.evaluations[0].published_at ?? null,
    })
  }

  const isClosed = jusgCase.status === 'closed'

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
            <p className="text-sm text-gray-500 mt-0.5">
              {(jusgCase as any).courses?.name} · {(jusgCase as any).courses?.semester}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded border font-medium ${
              isClosed ? 'bg-gray-200 text-gray-500 border-gray-300' : 'bg-green-100 text-green-700 border-green-200'
            }`}>
              {isClosed ? 'Encerrado' : 'Ativo'}
            </span>
            <Link href={`/dashboard/casos/${caseId}/autos`} className="text-sm text-[#185FA5] hover:text-[#134D87] font-medium">
              Ver autos →
            </Link>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-6 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-gray-400" />
            {docs.length} peça{docs.length !== 1 ? 's' : ''} para avaliar
          </span>
          {publishedCount > 0 && (
            <span className="flex items-center gap-1.5 text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {publishedCount} publicada{publishedCount !== 1 ? 's' : ''}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 text-orange-600">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Doc list */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Avaliação por Peça
        </h2>
        {docs.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg text-gray-400">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma peça protocolada pelos times ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <EvaluationDocRow key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </section>

      {/* Weighted summary per team */}
      {evalTeams.length > 0 && docs.some((d) => !!d.evaluation) && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Resumo por Time — Pesos e Média
            </h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Ajuste o peso de cada peça (padrão = 1). A média ponderada é calculada automaticamente. Salva ao sair do campo.
          </p>
          <div className="space-y-4">
            {evalTeams.map((team) => {
              const teamDocs = teamDocMapById[team.id] ?? []
              if (teamDocs.length === 0) return null
              const unpublishedCount = teamDocs.filter((d) => !d.publishedAt).length
              return (
                <CaseEvalForm
                  key={team.id}
                  caseId={caseId}
                  teamId={team.id}
                  teamRole={team.role}
                  teamName={team.name}
                  docs={teamDocs}
                  unpublishedCount={unpublishedCount}
                />
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
