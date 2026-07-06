/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import FatoNovoForm from '@/components/FatoNovoForm'
import { ArrowLeft, MessageSquarePlus, Info } from 'lucide-react'
import type { JusUser, JusCase, Course } from '@/lib/jusgaming.types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function FatoNovoPage({ params }: PageProps) {
  const { id: caseId } = await params

  const supabase = await createSSRClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single() as { data: Pick<JusUser, 'role'> | null }

  if (!profile || (profile.role !== 'professor' && profile.role !== 'admin')) {
    redirect('/dashboard/aluno')
  }

  // Fetch case
  const { data: jusgCase } = await (supabase as any)
    .from('cases')
    .select('*, courses(name, semester)')
    .eq('id', caseId)
    .eq('professor_id', user.id)
    .single() as {
    data: (JusCase & { courses: Pick<Course, 'name' | 'semester'> }) | null
  }

  if (!jusgCase) notFound()

  if (jusgCase.status !== 'active') {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Link href="/dashboard/professor/casos" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Casos
        </Link>
        <div className="text-center py-16 bg-amber-50 border border-amber-200 rounded-lg">
          <Info className="h-10 w-10 text-amber-400 mx-auto mb-3" />
          <p className="text-amber-700 font-medium">Caso não está ativo</p>
          <p className="text-sm text-amber-600 mt-1">
            Fatos novos só podem ser enviados em casos com status Ativo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/professor/casos"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Casos
        </Link>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <MessageSquarePlus className="h-5 w-5 text-[#185FA5]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fato Novo</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {jusgCase.title} · {jusgCase.courses?.name}
            </p>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="mb-6 flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>
          O fato novo simula uma comunicação do cliente com seu advogado. A mensagem é
          enviada diretamente aos times selecionados <strong>sem aparecer nos autos</strong>.
          Use linguagem natural, não jurídica.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <FatoNovoForm caseId={caseId} caseTitle={jusgCase.title} />
      </div>
    </div>
  )
}
