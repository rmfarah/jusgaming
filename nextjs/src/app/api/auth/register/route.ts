/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── In-process rate limiter ────────────────────────────────────────────────────
// 5 attempts per IP per 60s window.
// ⚠️  LIMITATION: This map is per-process. In serverless (Vercel) deployments each
// function instance has its own map — a single attacker hitting different instances
// is NOT rate-limited. For production, replace with a shared KV store:
//   • Vercel KV  (npm install @vercel/kv)
//   • Upstash Redis  (npm install @upstash/ratelimit @upstash/redis)
// TODO: upgrade before going to production with real users.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return false
  }

  entry.count += 1
  if (entry.count > 5) return true
  return false
}

export async function POST(request: NextRequest) {
  // ── Rate limiting ────────────────────────────────────────────────────────────
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde 1 minuto antes de tentar novamente.' },
      { status: 429 },
    )
  }

  try {
    const body = await request.json()
    const { full_name, email, password, course_code } = body

    if (!full_name || !email || !password || !course_code) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
    }

    // Basic input validation (FIX MEDIUM: type-check and length-cap all fields)
    if (typeof full_name !== 'string' || full_name.trim().length < 2 || full_name.length > 200) {
      return NextResponse.json({ error: 'Nome inválido (2–200 caracteres).' }, { status: 400 })
    }
    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres.' }, { status: 400 })
    }
    // Normaliza antes de validar (espaços colados no código são comuns)
    const normalizedCode = typeof course_code === 'string' ? course_code.trim().toUpperCase() : ''
    if (normalizedCode.length !== 6) {
      return NextResponse.json({ error: 'Código de turma inválido.' }, { status: 400 })
    }

    // Valida o código da turma e obtém institution_id
    const { data: course, error: courseError } = await (supabaseAdmin as any)
      .from('courses')
      .select('id, institution_id, active')
      .eq('code', normalizedCode)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Código de turma inválido ou não encontrado.' }, { status: 400 })
    }

    if (!course.active) {
      return NextResponse.json({ error: 'Esta turma está inativa.' }, { status: 400 })
    }

    // Cria o usuário no Supabase Auth (sem exigir confirmação de email)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        return NextResponse.json({ error: 'Este e-mail já está cadastrado.' }, { status: 400 })
      }
      throw authError
    }

    const userId = authData.user.id

    // Insere na tabela users
    const { error: userInsertError } = await (supabaseAdmin as any)
      .from('users')
      .insert({
        id: userId,
        institution_id: course.institution_id,
        email,
        full_name,
        role: 'student',
        active: true,
      })

    if (userInsertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      throw userInsertError
    }

    // Vincula o aluno à turma
    const { error: memberError } = await (supabaseAdmin as any)
      .from('course_members')
      .insert({ course_id: course.id, user_id: userId })

    if (memberError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      throw memberError
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    // Log sem expor detalhes ao cliente
    console.error('Register error:', err instanceof Error ? err.message : 'unknown')
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
}
