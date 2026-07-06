/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import BriefingsForm from '@/components/BriefingsForm'
import { ArrowLeft } from 'lucide-react'
import type { JusUser, JusCase, Course, TeamRole } from '@/lib/jusgaming.types'

interface PageProps {
  params: Promise<{ id: string }>
}

export interface CaseMaterial {
  id: string
  title: string
  file_path: string | null
  created_at: string
  team_id: string
}

export default async function BriefingsPage({ params }: PageProps) {
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

  const { data: jusgCase } = await (supabase as any)
    .from('cases')
    .select('id, title, status, instance_level, plaintiff_brief, defendant_brief, judge_brief, plaintiff_email_subject, defendant_email_subject, courses(name, semester)')
    .eq('id', caseId)
    .eq('professor_id', user.id)
    .single() as {
    data: (Pick<JusCase, 'id' | 'title' | 'status' | 'instance_level' | 'plaintiff_brief' | 'defendant_brief' | 'judge_brief' | 'plaintiff_email_subject' | 'defendant_email_subject'>
      & { courses: Pick<Course, 'name' | 'semester'> }) | null
  }

  if (!jusgCase) notFound()

  // Fetch teams for this case (needed for upload targets)
  const { data: rawTeams } = await (supabase as any)
    .from('teams')
    .select('id, role, name')
    .eq('case_id', caseId)
    .order('role') as {
    data: Array<{ id: string; role: TeamRole; name: string }> | null
  }

  const teams = rawTeams ?? []

  // Fetch existing case materials (professor-uploaded docs in draft)
  const { data: rawMaterials } = await (supabase as any)
    .from('documents')
    .select('id, title, file_path, created_at, team_id')
    .eq('case_id', caseId)
    .eq('document_type', 'case_material')
    .order('created_at', { ascending: true }) as { data: CaseMaterial[] | null }

  const materials = rawMaterials ?? []

  const isEditable = jusgCase.status === 'draft'

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/dashboard/professor/casos/${caseId}/times`}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Times
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{jusgCase.title}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {(jusgCase as any).courses?.name} · {(jusgCase as any).courses?.semester}
            </p>
          </div>
          <StatusBadge status={jusgCase.status} />
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <Link
          href={`/dashboard/professor/casos/${caseId}/times`}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">✓</span>
          Times
        </Link>
        <span className="text-gray-300">→</span>
        <span className="flex items-center gap-1.5 text-[#185FA5] font-medium">
          <span className="w-6 h-6 rounded-full bg-[#185FA5] text-white flex items-center justify-center text-xs font-bold">2</span>
          Briefings &amp; Materiais
        </span>
      </div>

      {!isEditable && (
        <div className="mb-6 p-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
          Este caso está <strong>{jusgCase.status === 'active' ? 'ativo' : 'encerrado'}</strong> — os briefings não podem ser alterados.
        </div>
      )}

      {isEditable && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          {jusgCase.instance_level === 'appeal_interlocutory' || jusgCase.instance_level === 'appeal_sentence' ? (
            <>
              <p className="text-sm text-blue-800 font-medium mb-1">Configure os e-mails de substabelecimento</p>
              <p className="text-sm text-blue-700">
                Escreva o e-mail que os <strong>advogados anteriores</strong> mandarão a cada time — com substabelecimento sem reserva e cópia das peças principais.
                Anexe os documentos do processo (sentença ou decisão recorrida, petições, etc.) para cada time.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-blue-800 font-medium mb-1">Configure os e-mails iniciais dos clientes</p>
              <p className="text-sm text-blue-700">
                Escreva o e-mail que o <strong>cliente</strong> mandará a cada time na ativação do caso.
                Anexe documentos relevantes (contratos, provas) visíveis apenas para aquele time.
              </p>
            </>
          )}
        </div>
      )}

      <BriefingsForm
        caseId={caseId}
        caseTitle={jusgCase.title}
        instanceLevel={jusgCase.instance_level}
        initialBriefs={{
          plaintiff_brief: jusgCase.plaintiff_brief,
          defendant_brief: jusgCase.defendant_brief,
          judge_brief: jusgCase.judge_brief,
          plaintiff_email_subject: jusgCase.plaintiff_email_subject,
          defendant_email_subject: jusgCase.defendant_email_subject,
        }}
        teams={teams}
        initialMaterials={materials}
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
