/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { revalidatePath } from 'next/cache'
import { createSSRClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import type { DocumentType, TeamRole } from '@/lib/jusgaming.types'
import type { AutosCopyRow } from '@/lib/emailTemplates'
import {
  LAWYER_DOC_TYPES,
  JUDGE_DOC_TYPES,
  INCIDENT_JUDGE_DOC_TYPES,
  INCIDENT_LAWYER_DOC_TYPES,
  INCIDENT_CLOSING_TYPES,
} from '@/lib/jusgaming.types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Helper: authed user + profile ───────────────────────────────────────────
async function getAuthedProfile() {
  const supabase = await createSSRClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado.')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('id, role, institution_id, active')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Perfil não encontrado.')
  if (profile.active === false) throw new Error('Conta bloqueada. Fale com o seu professor.')
  return { user, profile }
}

// ── Validate doc type for role + context ────────────────────────────────────
function isDocTypeAllowed(
  docType: DocumentType,
  teamRole: TeamRole | 'professor',
  isIncident: boolean,
): boolean {
  if (isIncident) {
    if (teamRole === 'professor' || teamRole === 'judge') {
      return (INCIDENT_JUDGE_DOC_TYPES as string[]).includes(docType)
    }
    return (INCIDENT_LAWYER_DOC_TYPES as string[]).includes(docType)
  }
  // Regular case
  if (teamRole === 'professor') return true
  if (teamRole === 'judge') return (JUDGE_DOC_TYPES as string[]).includes(docType)
  return (LAWYER_DOC_TYPES as string[]).includes(docType)
}

// ── Close incident + insert cross-reference in parent case ───────────────────
async function closeIncidentAndNotify(opts: {
  incidentCaseId: string
  parentCaseId: string
  incidentTitle: string
  incidentType: string | null
  closingDocSeq: number
  docTypeLabel: string
  sendEmail: boolean
}) {
  const { incidentCaseId, parentCaseId, incidentTitle, incidentType, closingDocSeq, docTypeLabel, sendEmail } = opts

  // 1. Close the incident
  await (supabaseAdmin as any)
    .from('cases')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', incidentCaseId)

  // 2. Insert reference document in parent case (system, no cert triggered)
  const incidentKind = incidentType === 'appeal_ai' ? 'AI' : 'MS'
  const { data: refDoc } = await (supabaseAdmin as any)
    .from('documents')
    .insert({
      case_id: parentCaseId,
      uploaded_by: null,     // system doc — no cert trigger
      team_id: null,
      document_type: 'decision',
      title: `${docTypeLabel} no ${incidentKind} (ato ${String(closingDocSeq).padStart(3, '0')}) — ver aba Incidentes`,
      certificate_text:
        `${docTypeLabel} proferida no incidente "${incidentTitle}". ` +
        `Consulte a aba Incidentes para o inteiro teor da decisão.`,
    })
    .select('id')
    .single()

  // 3. Notify all teams in parent case
  const { data: parentTeams } = await (supabaseAdmin as any)
    .from('teams')
    .select('id')
    .eq('case_id', parentCaseId)

  if (refDoc && (parentTeams ?? []).length > 0) {
    const notifRows = (parentTeams ?? []).map((t: any) => ({
      case_id: parentCaseId,
      document_id: refDoc.id,
      recipient_team_id: t.id,
      notification_type: 'new_document',
      email_subject: `Incidente decidido: ${incidentTitle}`,
      email_body:
        `O incidente "${incidentTitle}" foi decidido por ${docTypeLabel}. ` +
        `Verifique a aba Incidentes para mais detalhes.`,
      send_email: sendEmail,
      status: 'pending',
    }))
    await (supabaseAdmin as any).from('notifications').insert(notifRows)
  }

  revalidatePath(`/dashboard/casos/${parentCaseId}/autos`)
  revalidatePath(`/dashboard/casos/${parentCaseId}/incidentes`)
  revalidatePath(`/dashboard/casos/${incidentCaseId}/autos`)
}

// ── protocolDocument ─────────────────────────────────────────────────────────
export interface ProtocolParams {
  docType: DocumentType
  title: string
  teamId: string | null     // null for professor
  storagePath: string | null
}

export async function protocolDocument(
  caseId: string,
  params: ProtocolParams,
): Promise<{ error?: string; documentId?: string }> {
  try {
    const { user, profile } = await getAuthedProfile()

    // ── Fetch case (verify access + context) ────────────────────────────────
    const { data: jusgCase } = await (supabaseAdmin as any)
      .from('cases')
      .select(`
        id, status, professor_id, course_id, title,
        parent_case_id, incident_type,
        courses(email_notifications_enabled)
      `)
      .eq('id', caseId)
      .single()

    if (!jusgCase) return { error: 'Caso não encontrado.' }
    if (jusgCase.status !== 'active') return { error: 'Só é possível protocolar em casos ativos.' }

    const isProfessor = profile.role === 'professor' || profile.role === 'admin'
    const isIncident = !!jusgCase.parent_case_id

    // ── Determine team role ─────────────────────────────────────────────────
    let resolvedTeamId: string | null = null
    let teamRole: TeamRole | 'professor' = 'professor'

    if (isProfessor && jusgCase.professor_id === user.id) {
      resolvedTeamId = null
      teamRole = 'professor'
    } else {
      if (!params.teamId) return { error: 'Time inválido.' }

      // Verify team membership
      const { data: team } = await (supabaseAdmin as any)
        .from('teams')
        .select('id, role, case_id')
        .eq('id', params.teamId)
        .eq('case_id', caseId)
        .single()

      if (!team) return { error: 'Time não encontrado neste caso.' }

      const { data: membership } = await (supabaseAdmin as any)
        .from('team_members')
        .select('id')
        .eq('team_id', params.teamId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!membership) return { error: 'Você não é membro deste time.' }

      resolvedTeamId = params.teamId
      teamRole = team.role as TeamRole
    }

    // ── Validate doc type for role + context ────────────────────────────────
    if (!isDocTypeAllowed(params.docType, teamRole, isIncident)) {
      return { error: 'Tipo de ato não permitido para o seu papel neste caso.' }
    }

    // FIX MEDIUM: validate title length
    if (!params.title.trim()) return { error: 'Título é obrigatório.' }
    if (params.title.length > 300) return { error: 'Título muito longo (máx. 300 chars).' }

    // FIX MEDIUM: storagePath must start with the expected case prefix (prevents storage IDOR)
    // Clients upload to cases/{caseId}/... — reject any path outside this case's folder
    if (params.storagePath !== null) {
      const expectedPrefix = `cases/${caseId}/`
      if (!params.storagePath.startsWith(expectedPrefix)) {
        return { error: 'Caminho de arquivo inválido.' }
      }
    }

    // ── Insert document — DB trigger handles seq + certs + new incidents ────
    const { data: newDoc, error: docError } = await (supabaseAdmin as any)
      .from('documents')
      .insert({
        case_id: caseId,
        uploaded_by: user.id,
        team_id: resolvedTeamId,
        document_type: params.docType,
        title: params.title.trim(),
        file_path: params.storagePath,
      })
      .select('id, sequence_number')
      .single()

    if (docError) throw docError

    const sendEmail: boolean = jusgCase.courses?.email_notifications_enabled ?? false

    // ── Notifications ───────────────────────────────────────────────────────
    const { data: allTeams } = await (supabaseAdmin as any)
      .from('teams')
      .select('id, role')
      .eq('case_id', caseId)

    const judgeTeam = (allTeams ?? []).find((t: any) => t.role === 'judge')

    // new_document for all teams
    const notifRows = (allTeams ?? []).map((team: any) => ({
      case_id: caseId,
      document_id: newDoc.id,
      recipient_team_id: team.id,
      notification_type: 'new_document',
      email_subject: `Novo ato nos autos: ${params.title}`,
      email_body: `Um novo ato foi protocolado no caso "${jusgCase.title}":\n\n${params.title}`,
      send_email: sendEmail,
      status: 'pending',
    }))

    if (notifRows.length > 0) {
      await (supabaseAdmin as any).from('notifications').insert(notifRows)
    }

    // Extra new_document_judge when lawyer files in regular case
    if (!isIncident && (teamRole === 'plaintiff' || teamRole === 'defendant') && judgeTeam) {
      await (supabaseAdmin as any).from('notifications').insert({
        case_id: caseId,
        document_id: newDoc.id,
        recipient_team_id: judgeTeam.id,
        notification_type: 'new_document_judge',
        email_subject: `Autos conclusos: ${params.title}`,
        email_body:
          `Os autos do caso "${jusgCase.title}" foram conclusos ao Juízo após o protocolo de "${params.title}".`,
        send_email: sendEmail,
        status: 'pending',
      })
    }

    // Broadcast notification (null recipient) when AI/MS is filed, so professor bell counts it
    if (!isIncident && (params.docType === 'appeal_ai' || params.docType === 'appeal_ms')) {
      const label = params.docType === 'appeal_ai' ? 'Agravo de Instrumento' : 'Mandado de Segurança'
      await (supabaseAdmin as any).from('notifications').insert({
        case_id: caseId,
        document_id: newDoc.id,
        recipient_team_id: null,   // broadcast — professor will see this
        notification_type: 'new_document',
        email_subject: `Recurso interposto: ${label}`,
        email_body:
          `Um ${label} foi interposto no caso "${jusgCase.title}" e aguarda julgamento.`,
        send_email: sendEmail,
        status: 'pending',
      })
    }

    // ── Auto-close incident when acórdão / decisão monocrática is filed ─────
    if (
      isIncident &&
      (INCIDENT_CLOSING_TYPES as string[]).includes(params.docType) &&
      (teamRole === 'judge' || teamRole === 'professor')
    ) {
      const { DOCUMENT_TYPE_LABELS } = await import('@/lib/jusgaming.types')
      await closeIncidentAndNotify({
        incidentCaseId: caseId,
        parentCaseId: jusgCase.parent_case_id!,
        incidentTitle: jusgCase.title,
        incidentType: jusgCase.incident_type ?? null,
        closingDocSeq: newDoc.sequence_number,
        docTypeLabel: DOCUMENT_TYPE_LABELS[params.docType],
        sendEmail,
      })
    }

    // ── Send via Resend ────────────────────────────────────────────────────────
    if (sendEmail) {
      const { sendEmail: sendEmailFn, getTeamMemberEmails } = await import('@/lib/email')
      const { notificationEmailTemplate } = await import('@/lib/emailTemplates')
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const caseUrl = `${appUrl}/dashboard/casos/${caseId}/autos`
      const dateTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

      if (teamRole === 'plaintiff' || teamRole === 'defendant') {
        // Lawyer filing → notify judge (autos conclusos)
        if (judgeTeam) {
          const emails = await getTeamMemberEmails(judgeTeam.id)
          await sendEmailFn({
            to: emails,
            subject: `Autos conclusos: ${params.title}`,
            html: notificationEmailTemplate({
              caseTitle: jusgCase.title,
              actTitle: params.title,
              actId: newDoc.sequence_number,
              authorName: teamRole === 'plaintiff' ? 'Time Autor' : 'Time Réu',
              dateTime,
              caseUrl: `${appUrl}/dashboard/casos/${caseId}/juiz`,
            }),
          })
        }
      } else if (teamRole === 'judge') {
        // Judge filing → notify lawyer teams
        const lawyerTeams = (allTeams ?? []).filter((t: any) =>
          t.role === 'plaintiff' || t.role === 'defendant',
        )
        for (const lt of lawyerTeams) {
          const emails = await getTeamMemberEmails(lt.id)
          await sendEmailFn({
            to: emails,
            subject: `Novo ato nos autos: ${params.title}`,
            html: notificationEmailTemplate({
              caseTitle: jusgCase.title,
              actTitle: params.title,
              actId: newDoc.sequence_number,
              authorName: 'Time Juiz',
              dateTime,
              caseUrl,
            }),
          })
        }
      }
    }

    revalidatePath(`/dashboard/casos/${caseId}/autos`)
    revalidatePath(`/dashboard/casos/${caseId}/incidentes`)
    return { documentId: newDoc.id }
  } catch (err) {
    console.error('protocolDocument error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao protocolar documento.' }
  }
}

// ── Mark notification as read ────────────────────────────────────────────────
export async function markNotificationRead(
  notificationId: string,
): Promise<{ error?: string }> {
  try {
    const { user } = await getAuthedProfile()

    const { data: notif } = await (supabaseAdmin as any)
      .from('notifications')
      .select('id, recipient_team_id, case_id')
      .eq('id', notificationId)
      .single()

    if (!notif) return { error: 'Notificação não encontrada.' }

    if (notif.recipient_team_id) {
      // Team-targeted notification: verify caller is a member of that team
      const { data: membership } = await (supabaseAdmin as any)
        .from('team_members')
        .select('id')
        .eq('team_id', notif.recipient_team_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!membership) return { error: 'Sem permissão.' }
    } else {
      // FIX MEDIUM: broadcast notification (recipient_team_id IS NULL) —
      // only the case professor or a case participant may mark it read
      const { data: caseRow } = await (supabaseAdmin as any)
        .from('cases')
        .select('professor_id')
        .eq('id', notif.case_id)
        .single()

      const isProfessor = caseRow?.professor_id === user.id

      if (!isProfessor) {
        // Check the user belongs to any team in this case
        const { data: participation } = await (supabaseAdmin as any)
          .from('team_members')
          .select('team_id, teams!inner(case_id)')
          .eq('user_id', user.id)
          .eq('teams.case_id', notif.case_id)
          .maybeSingle()

        if (!participation) return { error: 'Sem permissão.' }
      }
    }

    await (supabaseAdmin as any)
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)

    revalidatePath(`/dashboard/casos/${notif.case_id}/autos`)
    return {}
  } catch (err) {
    console.error('markNotificationRead error:', err)
    return { error: 'Erro ao marcar notificação.' }
  }
}

// ── Get signed download URL ───────────────────────────────────────────────────
export async function getDocumentDownloadUrl(
  documentId: string,
): Promise<{ error?: string; url?: string }> {
  try {
    const { user } = await getAuthedProfile()

    const { data: doc } = await (supabaseAdmin as any)
      .from('documents')
      .select('file_path, case_id, team_id, document_type, cases(professor_id, teams(team_members(user_id)))')
      .eq('id', documentId)
      .single()

    if (!doc || !doc.file_path) return { error: 'Documento sem arquivo.' }

    // FIX (ALTA): usar apenas isOwner e isMember — isProfessor genérico
    // permitia que qualquer professor baixasse docs de casos de outros professores.
    const isOwner = doc.cases?.professor_id === user.id
    const isMember = (doc.cases?.teams ?? []).some((t: any) =>
      (t.team_members ?? []).some((m: any) => m.user_id === user.id),
    )

    if (!isOwner && !isMember) return { error: 'Sem permissão.' }

    // case_material é entregue por time (briefing/anexo do cliente):
    // só o time destinatário (ou o professor dono) pode baixar
    if (doc.document_type === 'case_material' && doc.team_id && !isOwner) {
      const { data: membership } = await (supabaseAdmin as any)
        .from('team_members')
        .select('id')
        .eq('team_id', doc.team_id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!membership) return { error: 'Sem permissão.' }
    }

    const { data: signedData, error } = await supabaseAdmin.storage
      .from('files')
      .createSignedUrl(doc.file_path, 3600, { download: true })

    if (error) throw error
    return { url: signedData.signedUrl }
  } catch (err) {
    console.error('getDocumentDownloadUrl error:', err)
    return { error: 'Erro ao gerar link de download.' }
  }
}

// ── Helper: verify judge team membership ─────────────────────────────────────
async function verifyJudgeMembership(
  caseId: string,
  judgeTeamId: string,
  userId: string,
): Promise<{ error?: string; sendEmail?: boolean; caseTitle?: string; defendantBrief?: string | null; defendantEmailSubject?: string | null }> {
  const { data: jusgCase } = await (supabaseAdmin as any)
    .from('cases')
    .select('id, status, title, defendant_brief, defendant_email_subject, courses(email_notifications_enabled)')
    .eq('id', caseId)
    .single()

  if (!jusgCase) return { error: 'Caso não encontrado.' }
  if (jusgCase.status !== 'active') return { error: 'Caso não está ativo.' }

  const { data: team } = await (supabaseAdmin as any)
    .from('teams')
    .select('id, role, case_id')
    .eq('id', judgeTeamId)
    .eq('case_id', caseId)
    .eq('role', 'judge')
    .single()

  if (!team) return { error: 'Time Juiz não encontrado neste caso.' }

  const { data: membership } = await (supabaseAdmin as any)
    .from('team_members')
    .select('id')
    .eq('team_id', judgeTeamId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) return { error: 'Você não é membro do Time Juiz.' }

  return {
    sendEmail: jusgCase.courses?.email_notifications_enabled ?? false,
    caseTitle: jusgCase.title,
    defendantBrief: jusgCase.defendant_brief,
    defendantEmailSubject: jusgCase.defendant_email_subject,
  }
}

// ── Judge action: Determinar citação do réu ──────────────────────────────────
export async function judgeActionCiteSummons(
  caseId: string,
  judgeTeamId: string,
): Promise<{ error?: string }> {
  try {
    const { user } = await getAuthedProfile()

    const check = await verifyJudgeMembership(caseId, judgeTeamId, user.id)
    if (check.error) return { error: check.error }

    const now = new Date()
    const dateStr = now.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    })

    // Insert system certificate_citation doc (uploaded_by = null → trigger skips)
    const { data: citDoc, error: docError } = await (supabaseAdmin as any)
      .from('documents')
      .insert({
        case_id: caseId,
        uploaded_by: null,
        team_id: null,
        document_type: 'certificate_citation',
        title: 'Certidão de Citação Positiva',
        certificate_text:
          `Certifico que a parte ré foi devidamente citada nos presentes autos ` +
          `na data de ${dateStr}, nos termos do art. 246 e seguintes do ` +
          `Código de Processo Civil. São Paulo, ${dateStr}.`,
      })
      .select('id')
      .single()

    if (docError) throw docError

    // Fetch defendant team to notify with brief
    const { data: allTeams } = await (supabaseAdmin as any)
      .from('teams')
      .select('id, role')
      .eq('case_id', caseId)

    const defendantTeam = (allTeams ?? []).find((t: any) => t.role === 'defendant')
    if (!defendantTeam) return { error: 'Time Réu não encontrado.' }

    const defaultBrief =
      'O caso foi ativado e você foi devidamente citado(a). ' +
      'Aguarde a petição inicial e apresente sua contestação no prazo legal.'

    await (supabaseAdmin as any).from('notifications').insert({
      case_id: caseId,
      document_id: citDoc.id,
      recipient_team_id: defendantTeam.id,
      notification_type: 'citation_served',
      email_subject: check.defendantEmailSubject ?? `Citação — ${check.caseTitle}`,
      email_body: check.defendantBrief ?? defaultBrief,
      send_email: check.sendEmail,
      status: 'pending',
    })

    // ── Send via Resend — citação acompanha cópia integral dos autos ──────────
    if (check.sendEmail) {
      const { sendEmail, getTeamMemberEmails } = await import('@/lib/email')
      const { citationEmailTemplate } = await import('@/lib/emailTemplates')
      const { DOCUMENT_TYPE_LABELS } = await import('@/lib/jusgaming.types')
      const { formatDateTime } = await import('@/lib/dates')
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

      // Todos os atos até aqui — inclui a certidão de citação recém-inserida.
      // case_material fica de fora (entrega por time, não integra os autos).
      const { data: autosDocs } = await (supabaseAdmin as any)
        .from('documents')
        .select('sequence_number, title, document_type, certificate_text, file_path, created_at')
        .eq('case_id', caseId)
        .neq('document_type', 'case_material')
        .order('sequence_number', { ascending: true })

      const rows: AutosCopyRow[] = []
      for (const d of autosDocs ?? []) {
        let downloadUrl: string | null = null
        if (d.file_path) {
          const { data: signed } = await supabaseAdmin.storage
            .from('files')
            .createSignedUrl(d.file_path, 60 * 60 * 24 * 7, { download: true })
          downloadUrl = signed?.signedUrl ?? null
        }
        rows.push({
          seq: d.sequence_number,
          title: d.title,
          typeLabel: DOCUMENT_TYPE_LABELS[d.document_type as keyof typeof DOCUMENT_TYPE_LABELS] ?? d.document_type,
          dateTime: formatDateTime(new Date(d.created_at)),
          certificateText: d.certificate_text,
          downloadUrl,
        })
      }

      const emails = await getTeamMemberEmails(defendantTeam.id)
      await sendEmail({
        to: emails,
        subject: check.defendantEmailSubject ?? 'Você foi citado — precisamos conversar',
        html: citationEmailTemplate({
          brief: check.defendantBrief ?? defaultBrief,
          caseTitle: check.caseTitle ?? '',
          caseUrl: `${appUrl}/dashboard/casos/${caseId}/autos`,
          rows,
        }),
      })
    }

    revalidatePath(`/dashboard/casos/${caseId}/autos`)
    revalidatePath(`/dashboard/casos/${caseId}/cliente`)
    return {}
  } catch (err) {
    console.error('judgeActionCiteSummons error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao determinar citação.' }
  }
}

// ── Judge action: Intimar time(s) ────────────────────────────────────────────
export async function judgeActionIntimate(
  caseId: string,
  judgeTeamId: string,
  target: 'plaintiff' | 'defendant' | 'both',
  customTitle?: string,
): Promise<{ error?: string }> {
  try {
    const { user } = await getAuthedProfile()

    const check = await verifyJudgeMembership(caseId, judgeTeamId, user.id)
    if (check.error) return { error: check.error }

    const targetLabel =
      target === 'plaintiff' ? 'Time Autor' :
      target === 'defendant' ? 'Time Réu' : 'Ambas as Partes'

    const title = customTitle?.trim() || `Intimação — ${targetLabel}`

    // Insert intimation doc with judge's credentials so trigger fires DJe cert
    const { data: newDoc, error: docError } = await (supabaseAdmin as any)
      .from('documents')
      .insert({
        case_id: caseId,
        uploaded_by: user.id,
        team_id: judgeTeamId,
        document_type: 'intimation',
        title,
      })
      .select('id')
      .single()

    if (docError) throw docError

    // Notify target team(s)
    const { data: allTeams } = await (supabaseAdmin as any)
      .from('teams')
      .select('id, role')
      .eq('case_id', caseId)

    const targets = (allTeams ?? []).filter((t: any) =>
      target === 'both'
        ? t.role === 'plaintiff' || t.role === 'defendant'
        : t.role === target,
    )

    if (targets.length > 0) {
      await (supabaseAdmin as any).from('notifications').insert(
        targets.map((t: any) => ({
          case_id: caseId,
          document_id: newDoc.id,
          recipient_team_id: t.id,
          notification_type: 'new_document',
          email_subject: `Intimação judicial: ${check.caseTitle}`,
          email_body: `Você foi intimado(a) nos autos "${check.caseTitle}".\n\n${title}`,
          send_email: check.sendEmail,
          status: 'pending',
        })),
      )
    }

    revalidatePath(`/dashboard/casos/${caseId}/autos`)
    return {}
  } catch (err) {
    console.error('judgeActionIntimate error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao intimar.' }
  }
}

// ── Judge action: Designar audiência ─────────────────────────────────────────
export interface HearingData {
  date: string       // YYYY-MM-DD
  time: string       // HH:MM
  location: string
  hearingType: string
}

export async function judgeActionScheduleHearing(
  caseId: string,
  judgeTeamId: string,
  data: HearingData,
): Promise<{ error?: string }> {
  try {
    const { user } = await getAuthedProfile()

    const check = await verifyJudgeMembership(caseId, judgeTeamId, user.id)
    if (check.error) return { error: check.error }

    if (!data.date || !data.time || !data.location.trim() || !data.hearingType) {
      return { error: 'Preencha todos os campos da audiência.' }
    }

    // FIX MEDIUM: allowlist hearingType, validate formats, cap location length
    const ALLOWED_HEARING_TYPES = ['Audiência de Instrução', 'Audiência de Conciliação', 'Audiência Una']
    if (!ALLOWED_HEARING_TYPES.includes(data.hearingType)) {
      return { error: 'Tipo de audiência inválido.' }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return { error: 'Data inválida.' }
    if (!/^\d{2}:\d{2}$/.test(data.time)) return { error: 'Hora inválida.' }
    if (data.location.length > 200) return { error: 'Local muito longo (máx. 200 chars).' }

    // Format date for display
    const [year, month, day] = data.date.split('-')
    const dateDisplay = `${day}/${month}/${year}`
    const title = `Designação de Audiência — ${data.hearingType} — ${dateDisplay} às ${data.time} — ${data.location}`

    // Insert hearing_notice with judge credentials so trigger auto-generates DJe cert
    const { data: newDoc, error: docError } = await (supabaseAdmin as any)
      .from('documents')
      .insert({
        case_id: caseId,
        uploaded_by: user.id,
        team_id: judgeTeamId,
        document_type: 'hearing_notice',
        title,
      })
      .select('id')
      .single()

    if (docError) throw docError

    // Notify all teams
    const { data: allTeams } = await (supabaseAdmin as any)
      .from('teams')
      .select('id')
      .eq('case_id', caseId)

    if ((allTeams ?? []).length > 0) {
      await (supabaseAdmin as any).from('notifications').insert(
        (allTeams ?? []).map((t: any) => ({
          case_id: caseId,
          document_id: newDoc.id,
          recipient_team_id: t.id,
          notification_type: 'new_document',
          email_subject: `Audiência designada: ${check.caseTitle}`,
          email_body:
            `Foi designada audiência nos autos "${check.caseTitle}".\n\n` +
            `Tipo: ${data.hearingType}\n` +
            `Data: ${dateDisplay}\n` +
            `Hora: ${data.time}\n` +
            `Local: ${data.location}`,
          send_email: check.sendEmail,
          status: 'pending',
        })),
      )
    }

    revalidatePath(`/dashboard/casos/${caseId}/autos`)
    return {}
  } catch (err) {
    console.error('judgeActionScheduleHearing error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao designar audiência.' }
  }
}
