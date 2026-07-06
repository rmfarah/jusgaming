'use client'

import { createSPASassClient } from '@/lib/supabase/client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import type { UserRole } from '@/lib/jusgaming.types'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      setInfo('Conta criada! Entre com seu e-mail e senha.')
    }
    if (searchParams.get('error') === 'profile_not_found') {
      setError('Conta não configurada. Entre em contato com o professor.')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const client = await createSPASassClient()
      const { error: signInError } = await client.loginEmail(email, password)
      if (signInError) throw signInError

      const supabase = client.getSupabaseClient()

      // Verifica MFA
      const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (mfaData?.nextLevel === 'aal2' && mfaData.nextLevel !== mfaData.currentLevel) {
        router.push('/auth/2fa')
        return
      }

      // Busca o perfil para redirecionar pela role
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não encontrado.')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any)
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single() as { data: { role: UserRole } | null }

      if (!profile) {
        router.push('/auth/login?error=profile_not_found')
        return
      }

      if (profile.role === 'professor' || profile.role === 'admin') {
        router.push('/dashboard/professor')
      } else {
        router.push('/dashboard/aluno')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Entrar na plataforma</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Use as credenciais fornecidas pelo seu professor
        </p>
      </div>

      {/* Info / error banners */}
      {info && (
        <div className="mb-5 p-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg">
          {info}
        </div>
      )}
      {error && (
        <div className="mb-5 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] transition-colors"
            placeholder="seu@email.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Senha
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-[#185FA5] hover:text-[#134D87] font-medium transition-colors"
            >
              Esqueceu a senha?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm placeholder-gray-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
          style={{ background: loading ? '#134D87' : '#185FA5' }}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      {/* Register link */}
      <p className="mt-6 text-center text-sm text-gray-500">
        Primeiro acesso?{' '}
        <Link
          href="/auth/register"
          className="font-medium text-[#185FA5] hover:text-[#134D87] transition-colors"
        >
          Use o código da turma
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
