/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import { createSSRClient } from '@/lib/supabase/server'
import ClienteEmailModal from '@/components/ClienteEmailModal'
import DocumentDownloadButton from '@/components/DocumentDownloadButton'
import { Mail, Inbox, FileText } from 'lucide-react'
import type { JusUser, JusNotification, TeamRole } from '@/lib/jusgaming.types'

interface PageProps {
  params: Promise<{ id: string }>
}

interface NotificationWithCase extends JusNotification {
  cases: { title: string }
  documents: { id: string; title: string; sequence_number: number; file_path: string | null } | null
}

export default async function ClientePage({ params }: PageProps) {
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

  // ── Find user's team ────────────────────────────────────────────────────────
  let userTeamId: string | null = null
  let userTeamRole: TeamRole | null = null

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

  // ── Fetch case info ─────────────────────────────────────────────────────────
  const { data: jusgCase } = await (supabase as any)
    .from('cases')
    .select('id, title, instance_level, parent_case_id')
    .eq('id', caseId)
    .single()

  if (!jusgCase) notFound()

  // ── Build team filter ───────────────────────────────────────────────────────
  // Professor sees all client notifications; students see their team's notifications
  // FIX: 'citation' não existe no enum (o valor real é 'citation_served') —
  // citações e fatos novos nunca apareciam nesta aba.
  let query = (supabase as any)
    .from('notifications')
    .select(`
      id, case_id, document_id, recipient_team_id,
      notification_type, email_subject, email_body,
      send_email, read_at, status, created_at,
      cases(title),
      documents(id, title, sequence_number, file_path)
    `)
    .eq('case_id', caseId)
    .in('notification_type', ['case_activated', 'citation_served', 'fato_novo'])
    .order('created_at', { ascending: false })

  if (!isProfessor && userTeamId) {
    query = query.or(`recipient_team_id.eq.${userTeamId},recipient_team_id.is.null`)
  }

  const { data: notifications } = await query as { data: NotificationWithCase[] | null }

  // ── Documentos do cliente (case_material) ──────────────────────────────────
  // Materiais enviados pelo professor (briefing/anexos de fato novo) são
  // entregues por time — aluno vê os do próprio time, professor vê todos.
  let materialsQuery = (supabase as any)
    .from('documents')
    .select('id, title, created_at, team_id, teams(name, role)')
    .eq('case_id', caseId)
    .eq('document_type', 'case_material')
    .not('file_path', 'is', null)
    .order('created_at', { ascending: true })

  if (!isProfessor) {
    materialsQuery = userTeamId
      ? materialsQuery.eq('team_id', userTeamId)
      : materialsQuery.eq('team_id', '00000000-0000-0000-0000-000000000000') // sem time → nada
  }

  let { data: materials } = await materialsQuery as {
    data: Array<{
      id: string
      title: string
      created_at: string
      team_id: string
      teams: { name: string; role: TeamRole } | null
    }> | null
  }

  // Réu fica "no escuro" até a citação: no 1º grau/arbitragem, os materiais do
  // Time Réu só aparecem depois que o juiz determina a citação.
  if (!isProfessor && userTeamRole === 'defendant') {
    const isAppealOrIncident =
      jusgCase.instance_level === 'appeal_interlocutory' ||
      jusgCase.instance_level === 'appeal_sentence' ||
      !!jusgCase.parent_case_id

    if (!isAppealOrIncident) {
      const { data: citation } = await (supabase as any)
        .from('documents')
        .select('id')
        .eq('case_id', caseId)
        .eq('document_type', 'certificate_citation')
        .limit(1)

      if (!citation || citation.length === 0) materials = []
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#185FA5]" />
          <h2 className="font-semibold text-gray-900 text-sm">E-mails do Cliente</h2>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          Mensagens do cliente{userTeamRole === 'plaintiff' ? ' (polo ativo)' : userTeamRole === 'defendant' ? ' (polo passivo)' : ''}
        </p>
      </div>

      {/* Email list */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {!notifications || notifications.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhuma mensagem do cliente ainda.</p>
            <p className="text-xs mt-1">
              {userTeamRole === 'plaintiff'
                ? 'A mensagem do cliente aparece aqui quando o caso for ativado.'
                : userTeamRole === 'defendant'
                  ? 'A mensagem de citação aparece aqui quando o Juízo a emitir.'
                  : 'As mensagens do cliente aparecerão aqui.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif) => (
              <ClienteEmailCard key={notif.id} notification={notif} isUnread={!notif.read_at} />
            ))}
          </div>
        )}

        {/* Documentos do cliente */}
        {materials && materials.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-[#185FA5]" />
              <h3 className="font-semibold text-gray-900 text-sm">Documentos do cliente</h3>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {materials.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                    <p className="text-xs text-gray-500">
                      {isProfessor && doc.teams ? `${doc.teams.name} · ` : ''}
                      {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <DocumentDownloadButton documentId={doc.id} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ClienteEmailCard({
  notification,
  isUnread,
}: {
  notification: NotificationWithCase
  isUnread: boolean
}) {
  const isActivation = notification.notification_type === 'case_activated'
  const isFatoNovo = notification.notification_type === 'fato_novo'

  return (
    <ClienteEmailModal notification={notification}>
      <div
        className={`bg-white rounded-lg border shadow-sm cursor-pointer hover:shadow-md transition-shadow p-4 ${
          isUnread ? 'border-[#185FA5]/30 bg-blue-50/20' : 'border-gray-200'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Avatar (simulates sender) */}
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-200">
            <span className="text-sm font-semibold text-gray-600">C</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={`text-sm font-medium ${isUnread ? 'text-gray-900' : 'text-gray-700'}`}>
                  {isActivation
                    ? 'Cliente — Contratação de Serviços Advocatícios'
                    : isFatoNovo
                      ? 'Cliente — Fato Novo'
                      : 'Cliente — Citação / Contratação de Defesa'}
                </p>
                <p className={`text-xs mt-0.5 font-medium ${isUnread ? 'text-gray-700' : 'text-gray-500'}`}>
                  {notification.email_subject ?? 'Sem assunto'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isUnread && (
                  <span className="w-2 h-2 rounded-full bg-[#185FA5] flex-shrink-0" />
                )}
                <time className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(notification.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                  })}
                </time>
              </div>
            </div>
            {notification.email_body && (
              <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">
                {notification.email_body}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                isActivation
                  ? 'bg-green-50 text-green-700'
                  : isFatoNovo
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-amber-50 text-amber-700'
              }`}>
                {isActivation ? 'Ativação do caso' : isFatoNovo ? 'Fato novo' : 'Citação'}
              </span>
              {isFatoNovo && notification.documents?.file_path && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                  📎 anexo
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </ClienteEmailModal>
  )
}
