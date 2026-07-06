// src/app/api/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createSSRSassClient } from "@/lib/supabase/server";

// Allowed post-login destinations — prevents open redirect
const ALLOWED_REDIRECTS = ['/app', '/dashboard/professor', '/dashboard/aluno', '/auth/2fa']

function safeRedirect(base: string, path: string | null): string {
  if (!path) return '/app'
  // Ensure the path is a relative path in our allowlist
  const clean = path.startsWith('/') ? path : `/${path}`
  if (ALLOWED_REDIRECTS.some((allowed) => clean.startsWith(allowed))) return clean
  return '/app'
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  // next param allows redirecting back to the page the user was trying to access
  const next = requestUrl.searchParams.get('next')

  // FIX LOW: validate code is a non-empty string before processing
  if (!code || typeof code !== 'string' || code.length > 512) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  try {
    const supabase = await createSSRSassClient()
    const client = supabase.getSupabaseClient()

    // Exchange the code for a session (Supabase uses PKCE internally)
    const { error: exchangeError } = await supabase.exchangeCodeForSession(code)
    if (exchangeError) {
      console.error('OAuth exchange error:', exchangeError.message)
      return NextResponse.redirect(new URL('/auth/login?error=oauth', request.url))
    }

    // FIX: usuário SSO (Google) sem perfil em public.users ficava num loop
    // logado-sem-acesso no dashboard. Sem perfil → sign out + aviso no login.
    const { data: { user: authedUser } } = await client.auth.getUser()
    if (authedUser) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (client as any)
        .from('users')
        .select('id')
        .eq('id', authedUser.id)
        .maybeSingle()

      if (!profile) {
        await client.auth.signOut()
        return NextResponse.redirect(new URL('/auth/login?error=profile_not_found', request.url))
      }
    }

    // Check MFA status
    const { data: aal, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel()

    if (aalError) {
      console.error('Error checking MFA status:', aalError.message)
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // If user needs to complete MFA verification
    if (aal.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
      return NextResponse.redirect(new URL('/auth/2fa', request.url))
    }

    // FIX LOW: use allowlisted redirect destination, never reflect attacker-controlled URLs
    const destination = safeRedirect(request.url, next)
    return NextResponse.redirect(new URL(destination, request.url))
  } catch (err) {
    console.error('Callback error:', err instanceof Error ? err.message : 'unknown')
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
}