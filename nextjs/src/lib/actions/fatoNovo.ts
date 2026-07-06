/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { revalidatePath } from 'next/cache'
import { createSSRClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function getAuthProfessor() {
  const supabase = await createSSRClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado.')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('id, role, active')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'professor' && profile.role !== 'admin')) {
    throw new Error('Acesso negado.')
  }
  if (profile.active === false) throw new Error('Conta bloqueada.')
  return { user, profile }
}

export type FatoNovoRecipient = 'plaintiff' | 'defendant' | 'both'

export async function sendFatoNovo(
  caseId: string,
  params: {
    message: string
    storagePath: string | null
    recipient: FatoNovoRecipient
  },
): Promise<{ error?: string }> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: jusgCase } = await (supabaseAdmin as any)
      .from('cases')
      .select('professor_id, status, title, course_id, courses(email_notifications_enabled)')
      .eq('id', caseId)
      .single()

    if (!jusgCase) return { error: 'Caso não encontrado.' }
    if (jusgCase.professor_id !== profile.id) return { error: 'Acesso negado.' }
    if (jusgCase.status !== 'active') return { error: 'Só é possível enviar fato novo em casos ativos.' }
    if (!params.message.trim()) return { error: 'A mensagem do cliente é obrigatória.' }
    if (params.message.length > 3000) return { error: 'Mensagem muito longa (máx. 3.000 chars).' }

    // storagePath deve apontar para a pasta deste caso (mesma regra do protocolo)
    if (params.storagePath !== null && !params.storagePath.startsWith(`cases/${caseId}/`)) {
      return { error: 'Caminho de arquivo inválido.' }
    }

    const sendEmail: boolean = jusgCase.courses?.email_notifications_enabled ?? false

    // Fetch teams in this case
    const { data: teams } = await (supabaseAdmin as any)
      .from('teams')
      .select('id, role')
      .eq('case_id', caseId)

    const targetTeams = (teams ?? []).filter((t: any) => {
      if (params.recipient === 'both') return t.role === 'plaintiff' || t.role === 'defendant'
      return t.role === params.recipient
    })

    if (targetTeams.length === 0) return { error: 'Nenhum time encontrado para o(s) destinatário(s).' }

    const attachmentNote = params.storagePath
      ? '\n\n[Documento em anexo disponível na aba Cliente]'
      : ''

    const emailBody =
      `Mensagem do seu cliente:\n\n"${params.message.trim()}"${attachmentNote}\n\n` +
      `— Enviado pelo professor responsável pelo caso "${jusgCase.title}"`

    for (const t of targetTeams) {
      // Anexo vira um documento case_material do time destinatário
      // (case_material não aparece nos autos; o time acessa na aba Cliente)
      let documentId: string | null = null
      if (params.storagePath) {
        const { data: doc, error: docError } = await (supabaseAdmin as any)
          .from('documents')
          .insert({
            case_id: caseId,
            uploaded_by: null, // sistema: não dispara certidões
            team_id: t.id,
            document_type: 'case_material',
            title: `Fato Novo — anexo do cliente`,
            file_path: params.storagePath,
          })
          .select('id')
          .single()
        if (docError) throw docError
        documentId = doc.id
      }

      const { error } = await (supabaseAdmin as any).from('notifications').insert({
        case_id: caseId,
        document_id: documentId,
        recipient_team_id: t.id,
        notification_type: 'fato_novo',
        email_subject: `📩 Fato Novo — ${jusgCase.title}`,
        email_body: emailBody,
        send_email: sendEmail,
        status: 'pending',
      })
      if (error) throw error
    }

    // Enviar por Resend quando a turma tem e-mail habilitado
    if (sendEmail) {
      const { sendEmail: sendEmailFn, getTeamMemberEmails } = await import('@/lib/email')
      const { clientEmailTemplate } = await import('@/lib/emailTemplates')
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const caseUrl = `${appUrl}/dashboard/casos/${caseId}/cliente`
      for (const t of targetTeams) {
        const emails = await getTeamMemberEmails(t.id)
        await sendEmailFn({
          to: emails,
          subject: `📩 Fato Novo — ${jusgCase.title}`,
          html: clientEmailTemplate(emailBody, caseUrl),
        })
      }
    }

    revalidatePath(`/dashboard/casos/${caseId}/autos`)
    revalidatePath(`/dashboard/casos/${caseId}/cliente`)
    return {}
  } catch (err) {
    console.error('sendFatoNovo error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao enviar fato novo.' }
  }
}
