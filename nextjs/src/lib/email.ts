/**
 * email.ts — Resend integration for JusGaming
 *
 * Server-only module: never import from client components.
 * Uses supabaseAdmin (service role) to fetch member emails — bypasses RLS.
 */
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)

// ⚠️ onboarding@resend.dev é o sender de TESTE do Resend: só entrega para o
// e-mail do dono da conta. Em produção, defina EMAIL_FROM com um domínio
// verificado no Resend (ex.: 'JusGaming <notificacoes@jusgaming.com.br>').
export const FROM = process.env.EMAIL_FROM ?? 'JusGaming <onboarding@resend.dev>'

// Admin client for fetching emails (bypasses RLS)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/** Returns email addresses of all members of a team. */
export async function getTeamMemberEmails(teamId: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (adminDb as any)
    .from('team_members')
    .select('users(email)')
    .eq('team_id', teamId)

  return (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => m.users?.email as string | undefined)
    .filter((e: string | undefined): e is string => typeof e === 'string' && e.length > 0)
}

/** Returns email addresses of all members in all teams of a case (de-duped). */
export async function getAllCaseMemberEmails(caseId: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: teams } = await (adminDb as any)
    .from('teams')
    .select('id')
    .eq('case_id', caseId)

  const emailSets = await Promise.all(
    (teams ?? []).map((t: { id: string }) => getTeamMemberEmails(t.id)),
  )
  return [...new Set(emailSets.flat())]
}

/**
 * Send an email via Resend.
 * Errors are caught and logged — never thrown — so callers never break.
 */
export async function sendEmail(params: {
  to: string[]
  subject: string
  html: string
}): Promise<void> {
  if (!params.to.length) return
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping send.')
    return
  }

  try {
    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })
  } catch (err) {
    // Non-fatal: log and continue
    console.error('[email] Resend send failed:', err)
  }
}
