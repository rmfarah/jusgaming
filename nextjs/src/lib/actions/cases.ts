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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado.')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('id, institution_id, role, active')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'professor' && profile.role !== 'admin')) {
    throw new Error('Acesso negado.')
  }
  if (profile.active === false) throw new Error('Conta bloqueada.')

  return { supabase, profile }
}

type CreateCaseState = { error: string } | { caseId: string } | null

// ── Criar caso ───────────────────────────────────────────────────────────────
export async function createCase(
  _prevState: CreateCaseState,
  formData: FormData,
): Promise<{ error: string } | { caseId: string }> {
  try {
    const { profile } = await getAuthProfessor()

    const title = (formData.get('title') as string)?.trim()
    const type = formData.get('type') as string
    const instance_level = formData.get('instance_level') as string
    const course_id = formData.get('course_id') as string
    const arbitration_rules = (formData.get('arbitration_rules') as string)?.trim() || null
    const email_sender_type = (formData.get('email_sender_type') as string) || 'client'

    if (!title) return { error: 'Título é obrigatório.' }
    if (title.length > 200) return { error: 'Título muito longo (máx. 200 chars).' }
    if (!type) return { error: 'Tipo é obrigatório.' }
    if (!instance_level) return { error: 'Instância é obrigatória.' }
    if (!course_id) return { error: 'Turma é obrigatória.' }
    if (arbitration_rules && arbitration_rules.length > 300) return { error: 'Regulamento arbitral muito longo (máx. 300 chars).' }

    // Verify course belongs to this professor
    const { data: course } = await (supabaseAdmin as any)
      .from('courses')
      .select('id, institution_id')
      .eq('id', course_id)
      .eq('professor_id', profile.id)
      .single()

    if (!course) return { error: 'Turma inválida ou sem permissão.' }

    // Load briefs from template if provided
    const templateId = (formData.get('template_id') as string)?.trim() || null
    let templateBriefs: Record<string, string | null> = {}
    if (templateId) {
      const { data: tmpl } = await (supabaseAdmin as any)
        .from('case_templates')
        .select('plaintiff_brief, defendant_brief, judge_brief, plaintiff_email_subject, defendant_email_subject, appealed_decision_type')
        .eq('id', templateId)
        .single()
      if (tmpl) templateBriefs = tmpl
    }

    const { data: newCase, error: caseError } = await (supabaseAdmin as any)
      .from('cases')
      .insert({
        institution_id: profile.institution_id,
        course_id,
        professor_id: profile.id,
        title,
        type,
        instance_level,
        arbitration_rules,
        email_sender_type,
        status: 'draft',
        plaintiff_brief: templateBriefs.plaintiff_brief ?? null,
        defendant_brief: templateBriefs.defendant_brief ?? null,
        judge_brief: templateBriefs.judge_brief ?? null,
        plaintiff_email_subject: templateBriefs.plaintiff_email_subject ?? null,
        defendant_email_subject: templateBriefs.defendant_email_subject ?? null,
        appealed_decision_type: templateBriefs.appealed_decision_type ?? null,
      })
      .select('id')
      .single()

    if (caseError) throw caseError

    // Create 3 default teams — judge team name adapts by degree
    const isAppeal = instance_level === 'appeal_interlocutory' || instance_level === 'appeal_sentence'
    const { error: teamsError } = await (supabaseAdmin as any)
      .from('teams')
      .insert([
        { case_id: newCase.id, role: 'plaintiff', name: 'Time Autor' },
        { case_id: newCase.id, role: 'defendant', name: 'Time Réu' },
        { case_id: newCase.id, role: 'judge', name: isAppeal ? 'Time Judiciário' : 'Time Juiz' },
      ])

    if (teamsError) throw teamsError

    // Copy template documents to the new case if a template was used
    if (templateId) {
      const { data: tmplDocs } = await (supabaseAdmin as any)
        .from('case_template_documents')
        .select('id, recipient, label, file_path')
        .eq('template_id', templateId) as { data: Array<{ id: string; recipient: string; label: string; file_path: string | null }> | null }

      if (tmplDocs && tmplDocs.length > 0) {
        const { data: newTeams } = await (supabaseAdmin as any)
          .from('teams')
          .select('id, role')
          .eq('case_id', newCase.id) as { data: Array<{ id: string; role: string }> | null }

        const teamByRole = Object.fromEntries((newTeams ?? []).map((t) => [t.role, t.id]))

        for (const doc of tmplDocs) {
          if (!doc.file_path) continue

          // Determine which teams should receive this document
          let recipientRoles: string[]
          if (doc.recipient === 'both') {
            recipientRoles = ['plaintiff', 'defendant']
          } else {
            recipientRoles = [doc.recipient]
          }

          for (const role of recipientRoles) {
            const teamId = teamByRole[role]
            if (!teamId) continue

            const ext = doc.file_path.split('.').pop() ?? 'pdf'
            const newPath = `case-materials/${newCase.id}/${teamId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

            const { error: copyError } = await supabaseAdmin.storage
              .from('files')
              .copy(doc.file_path, newPath)

            if (copyError) {
              console.error('copy template doc error:', copyError)
              continue
            }

            const { error: docInsertError } = await (supabaseAdmin as any).from('documents').insert({
              case_id: newCase.id,
              uploaded_by: profile.id,
              team_id: teamId,
              document_type: 'case_material',
              title: doc.label,
              file_path: newPath,
            })
            if (docInsertError) {
              console.error('insert template doc error:', docInsertError)
              await supabaseAdmin.storage.from('files').remove([newPath])
            }
          }
        }
      }
    }

    revalidatePath('/dashboard/professor/casos')
    return { caseId: newCase.id }
  } catch (err) {
    console.error('createCase error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao criar caso.' }
  }
}

// ── Salvar times ─────────────────────────────────────────────────────────────
export interface TeamInput {
  id: string
  name: string
  memberIds: string[]
}

export async function saveTeams(
  caseId: string,
  teams: TeamInput[],
): Promise<{ error?: string }> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: jusgCase } = await (supabaseAdmin as any)
      .from('cases')
      .select('professor_id, status, course_id')
      .eq('id', caseId)
      .single()

    if (!jusgCase) return { error: 'Caso não encontrado.' }
    if (jusgCase.professor_id !== profile.id) return { error: 'Acesso negado.' }
    if (jusgCase.status !== 'draft') return { error: 'Só é possível editar times de casos em rascunho.' }

    // FIX HIGH: validate every supplied team ID belongs to THIS case (prevents IDOR)
    const { data: validTeamsDb } = await (supabaseAdmin as any)
      .from('teams')
      .select('id')
      .eq('case_id', caseId)
    const validTeamIds = new Set((validTeamsDb ?? []).map((t: any) => t.id as string))
    for (const team of teams) {
      if (!validTeamIds.has(team.id)) return { error: 'Time inválido para este caso.' }
    }

    // FIX MEDIUM: validate all memberIds are enrolled in the case's course
    const allMemberIds = [...new Set(teams.flatMap((t) => t.memberIds))]
    if (allMemberIds.length > 0) {
      const { data: enrolled } = await (supabaseAdmin as any)
        .from('course_members')
        .select('user_id')
        .eq('course_id', jusgCase.course_id)
        .in('user_id', allMemberIds)
      const enrolledSet = new Set((enrolled ?? []).map((m: any) => m.user_id as string))
      for (const team of teams) {
        for (const uid of team.memberIds) {
          if (!enrolledSet.has(uid)) return { error: 'Um ou mais usuários não estão matriculados nesta turma.' }
        }
      }
    }

    for (const team of teams) {
      // Update team name — length cap to prevent DoS
      const trimmedName = (team.name?.trim() || team.name).substring(0, 100)
      const { error: nameError } = await (supabaseAdmin as any)
        .from('teams')
        .update({ name: trimmedName })
        .eq('id', team.id)
        .eq('case_id', caseId)   // double-bind: ensure we only touch this case's teams

      if (nameError) throw nameError

      // Replace members
      await (supabaseAdmin as any).from('team_members').delete().eq('team_id', team.id)

      if (team.memberIds.length > 0) {
        const { error: membersError } = await (supabaseAdmin as any)
          .from('team_members')
          .insert(team.memberIds.map((userId) => ({ team_id: team.id, user_id: userId })))

        if (membersError) throw membersError
      }
    }

    revalidatePath(`/dashboard/professor/casos/${caseId}/times`)
    return {}
  } catch (err) {
    console.error('saveTeams error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao salvar times.' }
  }
}

// ── Encerrar caso ────────────────────────────────────────────────────────────
export async function closeCase(caseId: string): Promise<{ error?: string }> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: jusgCase } = await (supabaseAdmin as any)
      .from('cases')
      .select('professor_id, status')
      .eq('id', caseId)
      .single()

    if (!jusgCase || jusgCase.professor_id !== profile.id) return { error: 'Acesso negado.' }
    if (jusgCase.status !== 'active') return { error: 'Apenas casos ativos podem ser encerrados.' }

    const { error } = await (supabaseAdmin as any)
      .from('cases')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', caseId)

    if (error) throw error

    revalidatePath('/dashboard/professor/casos')
    revalidatePath(`/dashboard/professor/casos/${caseId}/avaliar`)
    revalidatePath(`/dashboard/casos/${caseId}/autos`)
    return {}
  } catch (err) {
    console.error('closeCase error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao encerrar caso.' }
  }
}

// ── Apagar caso ──────────────────────────────────────────────────────────────
export async function deleteCase(caseId: string): Promise<{ error?: string } | void> {
  try {
    const { profile } = await getAuthProfessor()

    // Verificar propriedade
    const { data: jusgCase } = await (supabaseAdmin as any)
      .from('cases')
      .select('professor_id, status, title')
      .eq('id', caseId)
      .single()

    if (!jusgCase) return { error: 'Caso não encontrado.' }
    if (jusgCase.professor_id !== profile.id) return { error: 'Acesso negado.' }

    // Coletar IDs do caso principal + incidentes
    const { data: incidents } = await (supabaseAdmin as any)
      .from('cases')
      .select('id')
      .eq('parent_case_id', caseId)

    const allCaseIds: string[] = [caseId, ...((incidents ?? []).map((i: any) => i.id))]

    // Deletar em ordem (respeitar FKs sem CASCADE)
    const storagePaths: string[] = []
    for (const id of allCaseIds) {
      // 1. notifications (antes de documents, pois notifications.document_id → documents)
      await (supabaseAdmin as any).from('notifications').delete().eq('case_id', id)

      // 2. evaluations (antes de documents, pois evaluations.document_id → documents)
      const { data: docs } = await (supabaseAdmin as any)
        .from('documents').select('id, file_path').eq('case_id', id)
      const docIds = (docs ?? []).map((d: any) => d.id)
      for (const d of docs ?? []) {
        if (d.file_path) storagePaths.push(d.file_path)
      }
      if (docIds.length > 0) {
        await (supabaseAdmin as any).from('evaluations').delete().in('document_id', docIds)
      }

      // 3. documents
      await (supabaseAdmin as any).from('documents').delete().eq('case_id', id)
    }

    // Remover PDFs do storage (não-fatal: registros já saíram do banco)
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage
        .from('files')
        .remove([...new Set(storagePaths)])
      if (storageError) console.error('deleteCase storage cleanup error:', storageError)
    }

    // Deletar incidentes primeiro (FK parent_case_id → cases), depois o principal
    // teams/team_members são deletados em cascata ao apagar o caso
    for (const inc of incidents ?? []) {
      await (supabaseAdmin as any).from('cases').delete().eq('id', inc.id)
    }
    const { error } = await (supabaseAdmin as any).from('cases').delete().eq('id', caseId)
    if (error) return { error: error.message }

    revalidatePath('/dashboard/professor/casos')
    revalidatePath('/dashboard/professor')
  } catch (err) {
    console.error('deleteCase error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao apagar caso.' }
  }
}

// ── Salvar briefs do caso ─────────────────────────────────────────────────────
export async function updateCaseBriefs(
  caseId: string,
  briefs: {
    plaintiff_brief: string
    defendant_brief: string
    judge_brief: string
    plaintiff_email_subject?: string
    defendant_email_subject?: string
  },
): Promise<{ error?: string }> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: jusgCase } = await (supabaseAdmin as any)
      .from('cases').select('professor_id').eq('id', caseId).single()
    if (!jusgCase || jusgCase.professor_id !== profile.id) return { error: 'Acesso negado.' }

    // FIX MEDIUM: length limits on free-text fields (prevents DB bloat / DoS)
    const MAX_BRIEF = 5000
    const MAX_SUBJECT = 200
    if (briefs.plaintiff_brief.length > MAX_BRIEF) return { error: 'Briefing do autor muito longo (máx. 5.000 chars).' }
    if (briefs.defendant_brief.length > MAX_BRIEF) return { error: 'Briefing do réu muito longo (máx. 5.000 chars).' }
    if (briefs.judge_brief.length > MAX_BRIEF) return { error: 'Briefing do juiz muito longo (máx. 5.000 chars).' }
    if ((briefs.plaintiff_email_subject?.length ?? 0) > MAX_SUBJECT) return { error: 'Assunto do autor muito longo (máx. 200 chars).' }
    if ((briefs.defendant_email_subject?.length ?? 0) > MAX_SUBJECT) return { error: 'Assunto do réu muito longo (máx. 200 chars).' }

    const { error } = await (supabaseAdmin as any)
      .from('cases')
      .update({
        plaintiff_brief: briefs.plaintiff_brief.trim() || null,
        defendant_brief: briefs.defendant_brief.trim() || null,
        judge_brief: briefs.judge_brief.trim() || null,
        plaintiff_email_subject: briefs.plaintiff_email_subject?.trim() || null,
        defendant_email_subject: briefs.defendant_email_subject?.trim() || null,
      })
      .eq('id', caseId)

    if (error) return { error: error.message }
    revalidatePath(`/dashboard/professor/casos/${caseId}/briefings`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar briefings.' }
  }
}

// ── Salvar caso como modelo na biblioteca pessoal ─────────────────────────────
export async function saveCaseAsTemplate(
  caseId: string,
  templateTitle: string,
): Promise<{ error?: string; templateId?: string }> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: jusgCase } = await (supabaseAdmin as any)
      .from('cases')
      .select('professor_id, institution_id, type, instance_level, arbitration_rules, plaintiff_brief, defendant_brief, judge_brief, plaintiff_email_subject, defendant_email_subject, email_sender_type, appealed_decision_type')
      .eq('id', caseId)
      .single()

    if (!jusgCase || jusgCase.professor_id !== profile.id) return { error: 'Acesso negado.' }

    const { data: tmpl, error } = await (supabaseAdmin as any)
      .from('case_templates')
      .insert({
        institution_id: jusgCase.institution_id,
        created_by: profile.id,
        title: templateTitle.trim(),
        type: jusgCase.type,
        instance_level: jusgCase.instance_level,
        arbitration_rules: jusgCase.arbitration_rules,
        plaintiff_brief: jusgCase.plaintiff_brief,
        defendant_brief: jusgCase.defendant_brief,
        judge_brief: jusgCase.judge_brief,
        plaintiff_email_subject: jusgCase.plaintiff_email_subject,
        defendant_email_subject: jusgCase.defendant_email_subject,
        email_sender_type: jusgCase.email_sender_type ?? 'client',
        appealed_decision_type: jusgCase.appealed_decision_type ?? null,
        is_public: false,
      })
      .select('id')
      .single()

    if (error) return { error: error.message }

    // Copy case_material documents into case_template_documents
    const { data: caseDocs } = await (supabaseAdmin as any)
      .from('documents')
      .select('id, title, file_path, team_id')
      .eq('case_id', caseId)
      .eq('document_type', 'case_material') as { data: Array<{ id: string; title: string; file_path: string | null; team_id: string }> | null }

    let failedDocs = 0
    if (caseDocs && caseDocs.length > 0) {
      const { data: caseTeams } = await (supabaseAdmin as any)
        .from('teams')
        .select('id, role')
        .eq('case_id', caseId) as { data: Array<{ id: string; role: string }> | null }

      const roleByTeam = Object.fromEntries((caseTeams ?? []).map((t) => [t.id, t.role]))

      for (const doc of caseDocs) {
        if (!doc.file_path) continue
        const role = roleByTeam[doc.team_id]
        if (!role) continue

        const ext = doc.file_path.split('.').pop() ?? 'pdf'
        const newPath = `case-template-documents/${tmpl.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: copyError } = await supabaseAdmin.storage
          .from('files')
          .copy(doc.file_path, newPath)

        if (copyError) {
          console.error('copy doc to template error:', copyError)
          failedDocs++
          continue
        }

        const { error: tmplDocError } = await (supabaseAdmin as any).from('case_template_documents').insert({
          template_id: tmpl.id,
          recipient: role,
          label: doc.title,
          file_path: newPath,
        })
        if (tmplDocError) {
          console.error('insert case_template_documents error:', tmplDocError)
          await supabaseAdmin.storage.from('files').remove([newPath])
          failedDocs++
        }
      }
    }

    revalidatePath('/dashboard/professor/biblioteca')
    if (failedDocs > 0) {
      return {
        templateId: tmpl.id,
        error: `Modelo salvo, mas ${failedDocs} documento(s) não puderam ser copiados. Verifique os materiais e tente novamente.`,
      }
    }
    return { templateId: tmpl.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar modelo.' }
  }
}

// ── Ativar caso ──────────────────────────────────────────────────────────────
export async function activateCase(caseId: string): Promise<{ error?: string }> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: jusgCase } = await (supabaseAdmin as any)
      .from('cases')
      .select('professor_id, status, course_id, title, instance_level, plaintiff_brief, defendant_brief, judge_brief, plaintiff_email_subject, defendant_email_subject')
      .eq('id', caseId)
      .single()

    if (!jusgCase) return { error: 'Caso não encontrado.' }
    if (jusgCase.professor_id !== profile.id) return { error: 'Acesso negado.' }
    if (jusgCase.status !== 'draft') return { error: 'Caso não está em rascunho.' }

    // Validar times
    const { data: teams } = await (supabaseAdmin as any)
      .from('teams')
      .select('id, role, name, team_members(count)')
      .eq('case_id', caseId)

    if (!teams || teams.length < 3) {
      return { error: 'O caso precisa ter os 3 times configurados.' }
    }

    for (const team of teams) {
      const count = team.team_members?.[0]?.count ?? 0
      if (count < 1) {
        const label =
          team.role === 'plaintiff' ? 'Autor' : team.role === 'defendant' ? 'Réu' : 'Juiz'
        return { error: `O Time ${label} precisa ter pelo menos 1 membro.` }
      }
    }

    // Ativar
    const { error: activateError } = await (supabaseAdmin as any)
      .from('cases')
      .update({ status: 'active', activated_at: new Date().toISOString() })
      .eq('id', caseId)

    if (activateError) throw activateError

    const { data: course } = await (supabaseAdmin as any)
      .from('courses')
      .select('email_notifications_enabled')
      .eq('id', jusgCase.course_id)
      .single()

    const sendEmail: boolean = course?.email_notifications_enabled ?? false

    const isAppeal =
      jusgCase.instance_level === 'appeal_interlocutory' ||
      jusgCase.instance_level === 'appeal_sentence'

    // Briefs e mensagens padrão por papel
    const defaultBrief: Record<string, string> = {
      plaintiff: 'O caso foi ativado. O Time Autor deve protocolar a petição inicial.',
      defendant: 'O caso foi ativado. Aguarde a petição inicial para apresentar contestação.',
      judge: 'O caso foi ativado. Acompanhe as peças e profira os despachos necessários.',
    }
    const configuredBrief: Record<string, string | null> = {
      plaintiff: jusgCase.plaintiff_brief,
      defendant: jusgCase.defendant_brief,
      judge: jusgCase.judge_brief,
    }

    // Notificar cada time com o brief configurado (ou padrão).
    // 1º grau/arbitragem: o Time Réu fica "no escuro" até o juiz determinar a
    // citação (judgeActionCiteSummons entrega o brief + cópia dos autos).
    // 2º grau: o réu já integra a relação processual e é notificado na ativação.
    const notifications = teams
      .filter((team: any) => isAppeal || team.role !== 'defendant')
      .map((team: any) => ({
        case_id: caseId,
        recipient_team_id: team.id,
        notification_type: 'case_activated',
        email_subject: `📋 Caso ativado: ${jusgCase.title}`,
        email_body: configuredBrief[team.role] ?? defaultBrief[team.role],
        send_email: sendEmail,
        status: 'pending',
      }))

    await (supabaseAdmin as any).from('notifications').insert(notifications)

    // ── 2º Grau: certidão de distribuição ─────────────────────────────────────
    if (isAppeal) {
      const { formatDate, formatTime } = await import('@/lib/dates')
      const now = new Date()
      const tipo = jusgCase.instance_level === 'appeal_interlocutory'
        ? 'Agravo de Instrumento' : 'Apelação'
      await (supabaseAdmin as any).from('documents').insert({
        case_id: caseId,
        uploaded_by: null,
        team_id: null,
        document_type: 'certificate_distribution',
        title: 'Certidão de Distribuição',
        certificate_text:
          `Certifico que os presentes autos de ${tipo} foram distribuídos ao colegiado ` +
          `em ${formatDate(now)} às ${formatTime(now)}, para os fins de direito. São Paulo, ${formatDate(now)}.`,
      })
    }

    // ── Send via Resend if email is enabled ────────────────────────────────────
    if (sendEmail) {
      const { sendEmail: sendEmailFn, getTeamMemberEmails } = await import('@/lib/email')
      const { clientEmailTemplate, notificationEmailTemplate } = await import('@/lib/emailTemplates')
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const caseUrl = `${appUrl}/dashboard/casos/${caseId}/autos`
      const dateTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

      const plaintiffTeam = teams.find((t: any) => t.role === 'plaintiff')
      const defendantTeam = teams.find((t: any) => t.role === 'defendant')
      const judgeTeam = teams.find((t: any) => t.role === 'judge')

      // Plaintiff — "e-mail do cliente"
      if (plaintiffTeam) {
        const emails = await getTeamMemberEmails(plaintiffTeam.id)
        await sendEmailFn({
          to: emails,
          subject: jusgCase.plaintiff_email_subject ?? 'Preciso da sua ajuda urgente',
          html: clientEmailTemplate(configuredBrief.plaintiff ?? defaultBrief.plaintiff, caseUrl),
        })
      }

      // Defendant — no 2º grau, recebe e-mail na ativação (não aguarda citação)
      if (isAppeal && defendantTeam) {
        const emails = await getTeamMemberEmails(defendantTeam.id)
        await sendEmailFn({
          to: emails,
          subject: jusgCase.defendant_email_subject ?? 'Você foi notificado — caso ativado',
          html: clientEmailTemplate(configuredBrief.defendant ?? defaultBrief.defendant, caseUrl),
        })
      }

      // Judge — notificação de ativação
      if (judgeTeam) {
        const emails = await getTeamMemberEmails(judgeTeam.id)
        await sendEmailFn({
          to: emails,
          subject: `📋 Caso ativado: ${jusgCase.title}`,
          html: notificationEmailTemplate({
            caseTitle: jusgCase.title,
            actTitle: configuredBrief.judge ?? defaultBrief.judge,
            actId: 0,
            authorName: 'JusGaming',
            dateTime,
            caseUrl,
          }),
        })
      }
    }

    revalidatePath('/dashboard/professor/casos')
    revalidatePath(`/dashboard/professor/casos/${caseId}/briefings`)
    revalidatePath(`/dashboard/professor/casos/${caseId}/times`)
    return {}
  } catch (err) {
    console.error('activateCase error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao ativar caso.' }
  }
}

// ── Upload material do caso (rascunho) ───────────────────────────────────────
export async function uploadCaseMaterial(
  caseId: string,
  teamId: string,
  formData: FormData,
): Promise<{ error?: string; documentId?: string }> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: jusgCase } = await (supabaseAdmin as any)
      .from('cases')
      .select('professor_id, status')
      .eq('id', caseId)
      .single()

    if (!jusgCase) return { error: 'Caso não encontrado.' }
    if (jusgCase.professor_id !== profile.id) return { error: 'Acesso negado.' }
    if (jusgCase.status !== 'draft') return { error: 'Materiais só podem ser adicionados em casos em rascunho.' }

    const { data: team } = await (supabaseAdmin as any)
      .from('teams')
      .select('id')
      .eq('id', teamId)
      .eq('case_id', caseId)
      .single()

    if (!team) return { error: 'Time não encontrado neste caso.' }

    const title = (formData.get('title') as string)?.trim()
    const file = formData.get('file') as File | null

    if (!title) return { error: 'Título é obrigatório.' }
    if (!file || file.size === 0) return { error: 'Selecione um arquivo.' }
    if (file.size > 20 * 1024 * 1024) return { error: 'Arquivo muito grande (máx. 20 MB).' }

    // Upload to storage
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const storagePath = `case-materials/${caseId}/${teamId}/${Date.now()}.${ext}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: storageError } = await supabaseAdmin.storage
      .from('files')
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false })

    if (storageError) throw storageError

    // Insert document record (trigger assigns sequence_number automatically)
    const { data: doc, error: docError } = await (supabaseAdmin as any)
      .from('documents')
      .insert({
        case_id: caseId,
        uploaded_by: profile.id,
        team_id: teamId,
        document_type: 'case_material',
        title,
        file_path: storagePath,
      })
      .select('id')
      .single()

    if (docError) {
      // Rollback storage upload on DB failure
      await supabaseAdmin.storage.from('files').remove([storagePath])
      throw docError
    }

    revalidatePath(`/dashboard/professor/casos/${caseId}/briefings`)
    return { documentId: doc.id }
  } catch (err) {
    console.error('uploadCaseMaterial error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao fazer upload.' }
  }
}

// ── Remover material do caso ──────────────────────────────────────────────────
export async function deleteCaseMaterial(
  documentId: string,
): Promise<{ error?: string }> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: doc } = await (supabaseAdmin as any)
      .from('documents')
      .select('id, file_path, case_id, document_type, cases(professor_id, status)')
      .eq('id', documentId)
      .single()

    if (!doc) return { error: 'Documento não encontrado.' }
    if (doc.document_type !== 'case_material') return { error: 'Apenas materiais podem ser removidos aqui.' }
    if (doc.cases?.professor_id !== profile.id) return { error: 'Acesso negado.' }
    if (doc.cases?.status !== 'draft') return { error: 'Materiais só podem ser removidos de casos em rascunho.' }

    // Remove from storage
    if (doc.file_path) {
      await supabaseAdmin.storage.from('files').remove([doc.file_path])
    }

    // Remove DB record
    const { error } = await (supabaseAdmin as any)
      .from('documents')
      .delete()
      .eq('id', documentId)

    if (error) throw error

    revalidatePath(`/dashboard/professor/casos/${doc.case_id}/briefings`)
    return {}
  } catch (err) {
    console.error('deleteCaseMaterial error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao remover material.' }
  }
}
