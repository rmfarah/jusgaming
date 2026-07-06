/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createSSRClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Cryptographically secure 6-char code ─────────────────────────────────────
// Uses crypto.randomBytes (CSPRNG) instead of Math.random() (not CSPRNG).
// Avoids ambiguous characters (0/O, 1/I/L) for readability.
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

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

// ── Helper: verify professor owns the course ──────────────────────────────────
async function assertCourseOwner(courseId: string, professorId: string): Promise<void> {
  const { data: course } = await (supabaseAdmin as any)
    .from('courses')
    .select('professor_id')
    .eq('id', courseId)
    .single()

  if (!course || course.professor_id !== professorId) {
    throw new Error('Acesso negado.')
  }
}

// ── Criar turma ──────────────────────────────────────────────────────────────
export async function createCourse(formData: FormData): Promise<{ error?: string } | void> {
  try {
    const name = formData.get('name') as string
    const semester = formData.get('semester') as string

    if (!name?.trim() || !semester?.trim()) {
      return { error: 'Nome e semestre são obrigatórios.' }
    }

    const { supabase, profile } = await getAuthProfessor()

    // Gera código único (max 5 tentativas)
    // FIX: checar com supabaseAdmin — o cliente RLS só vê as turmas do próprio
    // professor, então códigos de outros professores passavam na checagem e o
    // INSERT estourava na unique constraint.
    let code = generateCode()
    for (let i = 0; i < 5; i++) {
      const { data } = await (supabaseAdmin as any).from('courses').select('id').eq('code', code).maybeSingle()
      if (!data) break
      code = generateCode()
    }

    const { error } = await (supabase as any).from('courses').insert({
      name: name.trim(),
      semester: semester.trim(),
      code,
      professor_id: profile.id,
      institution_id: profile.institution_id,
      active: true,
      email_notifications_enabled: true,
    })

    if (error) return { error: error.message }

    revalidatePath('/dashboard/professor')
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar turma.' }
  }
}

// ── Apagar turma ─────────────────────────────────────────────────────────────
export async function deleteCourse(courseId: string): Promise<{ error?: string } | void> {
  try {
    const { profile } = await getAuthProfessor()

    const { data: course } = await (supabaseAdmin as any)
      .from('courses')
      .select('id, professor_id, name')
      .eq('id', courseId)
      .single()

    if (!course) return { error: 'Turma não encontrada.' }
    if (course.professor_id !== profile.id) return { error: 'Acesso negado.' }

    // Bloquear se houver casos vinculados
    const { count } = await (supabaseAdmin as any)
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId)

    if ((count ?? 0) > 0) {
      return { error: 'Esta turma possui casos vinculados e não pode ser apagada. Encerre ou mova os casos antes de excluir.' }
    }

    const { error } = await (supabaseAdmin as any)
      .from('courses')
      .delete()
      .eq('id', courseId)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/professor')
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao apagar turma.' }
  }
}

// ── Toggle e-mail da turma ───────────────────────────────────────────────────
// FIX: verificar propriedade antes de modificar (IDOR)
export async function toggleEmailNotifications(courseId: string, enabled: boolean) {
  const { profile } = await getAuthProfessor()

  // Verificar que o professor é dono da turma
  await assertCourseOwner(courseId, profile.id)

  const { error } = await (supabaseAdmin as any)
    .from('courses')
    .update({ email_notifications_enabled: enabled })
    .eq('id', courseId)

  if (error) throw error

  revalidatePath('/dashboard/professor')
}

// ── Remover aluno da turma ───────────────────────────────────────────────────
// FIX: verificar propriedade da turma antes de remover (IDOR)
export async function removeMember(courseId: string, userId: string) {
  const { profile } = await getAuthProfessor()

  // Verificar que o professor é dono da turma
  await assertCourseOwner(courseId, profile.id)

  const { error } = await (supabaseAdmin as any)
    .from('course_members')
    .delete()
    .eq('course_id', courseId)
    .eq('user_id', userId)

  if (error) throw error

  revalidatePath(`/dashboard/professor/turmas/${courseId}`)
}

// ── Bloquear / desbloquear aluno ─────────────────────────────────────────────
// FIX (CRÍTICO): verificar:
//   1. Professor é dono da turma
//   2. Usuário pertence à mesma instituição
//   3. Usuário realmente está nessa turma
export async function toggleMemberActive(userId: string, active: boolean, courseId: string) {
  const { profile } = await getAuthProfessor()

  // 1. Professor é dono da turma
  await assertCourseOwner(courseId, profile.id)

  // 2. Usuário pertence à mesma instituição (impede cross-institution)
  const { data: targetUser } = await (supabaseAdmin as any)
    .from('users')
    .select('id, institution_id, role')
    .eq('id', userId)
    .single()

  if (!targetUser) throw new Error('Usuário não encontrado.')
  if (targetUser.institution_id !== profile.institution_id) throw new Error('Acesso negado.')
  // Não permitir bloquear professores ou admins via esta rota
  if (targetUser.role !== 'student') throw new Error('Apenas alunos podem ser bloqueados por esta rota.')

  // 3. Usuário está matriculado nessa turma
  const { data: membership } = await (supabaseAdmin as any)
    .from('course_members')
    .select('id')
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) throw new Error('Usuário não pertence a esta turma.')

  const { error } = await (supabaseAdmin as any)
    .from('users')
    .update({ active })
    .eq('id', userId)

  if (error) throw error

  revalidatePath(`/dashboard/professor/turmas/${courseId}`)
}
