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
    .select('id, role, institution_id, active')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'professor' && profile.role !== 'admin')) {
    throw new Error('Acesso negado.')
  }
  if (profile.active === false) throw new Error('Conta bloqueada.')
  return { user, profile }
}

// ── Upsert document evaluation ────────────────────────────────────────────────
export async function upsertEvaluation(
  documentId: string,
  params: {
    score: number | null
    comments: string
    publish: boolean
  },
): Promise<{ error?: string; evaluationId?: string }> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: doc } = await (supabaseAdmin as any)
      .from('documents')
      .select('id, case_id, cases(professor_id)')
      .eq('id', documentId)
      .single()

    if (!doc) return { error: 'Documento não encontrado.' }
    if (doc.cases?.professor_id !== profile.id) return { error: 'Acesso negado.' }

    if (params.score !== null && (typeof params.score !== 'number' || params.score < 0 || params.score > 10)) {
      return { error: 'Nota fora do intervalo (0–10).' }
    }
    if (params.comments.length > 3000) return { error: 'Comentário muito longo (máx. 3.000 chars).' }

    const { data: existing } = await (supabaseAdmin as any)
      .from('evaluations')
      .select('id, published_at')
      .eq('document_id', documentId)
      .eq('professor_id', profile.id)
      .maybeSingle()

    const now = new Date().toISOString()
    let evaluationId: string

    if (existing) {
      const published_at = existing.published_at ?? (params.publish ? now : null)
      const { error } = await (supabaseAdmin as any)
        .from('evaluations')
        .update({
          score: params.score,
          comments: params.comments.trim() || null,
          published_at,
          updated_at: now,
        })
        .eq('id', existing.id)

      if (error) throw error
      evaluationId = existing.id
    } else {
      const { data: newEval, error } = await (supabaseAdmin as any)
        .from('evaluations')
        .insert({
          document_id: documentId,
          professor_id: profile.id,
          score: params.score,
          comments: params.comments.trim() || null,
          published_at: params.publish ? now : null,
        })
        .select('id')
        .single()

      if (error) throw error
      evaluationId = newEval.id
    }

    revalidatePath(`/dashboard/professor/casos/${doc.case_id}/avaliar`)
    revalidatePath(`/dashboard/casos/${doc.case_id}/autos`)
    revalidatePath(`/dashboard/casos/${doc.case_id}/avaliacoes`)
    return { evaluationId }
  } catch (err) {
    console.error('upsertEvaluation error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao salvar avaliação.' }
  }
}

// ── Update weight for an evaluation ──────────────────────────────────────────
export async function updateEvaluationWeight(
  evaluationId: string,
  weight: number,
): Promise<{ error?: string }> {
  try {
    const { profile } = await getAuthProfessor()

    // Coluna é numeric(4,2) — máximo 99.99
    if (typeof weight !== 'number' || !isFinite(weight) || weight <= 0 || weight > 99.99) {
      return { error: 'Peso inválido (deve ser entre 0.1 e 99.99).' }
    }

    const { data: ev } = await (supabaseAdmin as any)
      .from('evaluations')
      .select('id, document_id, documents(case_id, cases(professor_id))')
      .eq('id', evaluationId)
      .eq('professor_id', profile.id)
      .single()

    if (!ev) return { error: 'Avaliação não encontrada.' }
    if ((ev.documents as any)?.cases?.professor_id !== profile.id) return { error: 'Acesso negado.' }

    const caseId = (ev.documents as any)?.case_id

    const { error } = await (supabaseAdmin as any)
      .from('evaluations')
      .update({ weight })
      .eq('id', evaluationId)

    if (error) throw error

    revalidatePath(`/dashboard/professor/casos/${caseId}/avaliar`)
    revalidatePath(`/dashboard/casos/${caseId}/avaliacoes`)
    return {}
  } catch (err) {
    console.error('updateEvaluationWeight error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar peso.' }
  }
}

// ── Publish all evaluations for a case at once ────────────────────────────────
export async function publishAllEvaluations(
  caseId: string,
): Promise<{ error?: string; count?: number }> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: jusgCase } = await (supabaseAdmin as any)
      .from('cases')
      .select('professor_id')
      .eq('id', caseId)
      .single()

    if (!jusgCase || jusgCase.professor_id !== profile.id) return { error: 'Acesso negado.' }

    const now = new Date().toISOString()

    // Fetch all unpublished evaluations for this case
    const { data: unpublished } = await (supabaseAdmin as any)
      .from('evaluations')
      .select('id')
      .eq('professor_id', profile.id)
      .is('published_at', null)
      .in(
        'document_id',
        (await (supabaseAdmin as any)
          .from('documents')
          .select('id')
          .eq('case_id', caseId)).data?.map((d: any) => d.id) ?? [],
      )

    if (!unpublished || unpublished.length === 0) return { count: 0 }

    const { error } = await (supabaseAdmin as any)
      .from('evaluations')
      .update({ published_at: now })
      .in('id', unpublished.map((e: any) => e.id))

    if (error) throw error

    revalidatePath(`/dashboard/professor/casos/${caseId}/avaliar`)
    revalidatePath(`/dashboard/casos/${caseId}/autos`)
    revalidatePath(`/dashboard/casos/${caseId}/avaliacoes`)
    return { count: unpublished.length }
  } catch (err) {
    console.error('publishAllEvaluations error:', err)
    return { error: err instanceof Error ? err.message : 'Erro ao publicar avaliações.' }
  }
}
