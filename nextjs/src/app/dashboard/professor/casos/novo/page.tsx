/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation'
import { createSSRClient } from '@/lib/supabase/server'
import NovoCasoForm from '@/components/NovoCasoForm'
import type { JusUser, Course, CaseTemplate } from '@/lib/jusgaming.types'

interface PageProps {
  searchParams: Promise<{ template?: string }>
}

export default async function NovoCasoPage({ searchParams }: PageProps) {
  const supabase = await createSSRClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single() as { data: Pick<JusUser, 'role'> | null }

  if (!profile || (profile.role !== 'professor' && profile.role !== 'admin')) {
    redirect('/dashboard/aluno')
  }

  const { data: courses } = await (supabase as any)
    .from('courses')
    .select('id, name, semester, active')
    .eq('professor_id', user.id)
    .eq('active', true)
    .order('created_at', { ascending: false }) as { data: Pick<Course, 'id' | 'name' | 'semester' | 'active'>[] | null }

  const { template: templateId } = await searchParams
  let template: CaseTemplate | null = null

  if (templateId) {
    const { data } = await (supabase as any)
      .from('case_templates')
      .select('*')
      .eq('id', templateId)
      .single() as { data: CaseTemplate | null }
    template = data
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {template ? `Usar modelo: ${template.title}` : 'Novo Caso'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Preencha as informações do caso. Os times serão configurados na próxima etapa.
        </p>
      </div>

      <NovoCasoForm
        courses={courses ?? []}
        template={template}
      />
    </div>
  )
}
