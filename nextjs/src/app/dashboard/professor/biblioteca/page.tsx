/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSSRClient } from '@/lib/supabase/server'
import { Library, Plus, Scale, Gavel, BookOpen, ArrowRight } from 'lucide-react'
import type { JusUser, CaseTemplate } from '@/lib/jusgaming.types'

const INSTANCE_CONFIG: Record<string, string> = {
  first: '1ª Instância',
  appeal: '2ª Instância',
  arbitral: 'Câmara Arbitral',
  appeal_interlocutory: '2º Grau — AI',
  appeal_sentence: '2º Grau — Apelação',
}

const INSTANCE_BADGE: Record<string, string> = {
  first: 'bg-blue-50 text-blue-700 border-blue-200',
  appeal: 'bg-blue-50 text-blue-600 border-blue-200',
  arbitral: 'bg-purple-50 text-purple-700 border-purple-200',
  appeal_interlocutory: 'bg-amber-50 text-amber-700 border-amber-200',
  appeal_sentence: 'bg-amber-50 text-amber-700 border-amber-200',
}

type FilterKey = 'all' | 'first' | 'appeal_interlocutory' | 'appeal_sentence' | 'arbitral'

interface PageProps {
  searchParams: Promise<{ filter?: string }>
}

export default async function BibliotecaPage({ searchParams }: PageProps) {
  const { filter = 'all' } = await searchParams

  const supabase = await createSSRClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await (supabase as any)
    .from('users')
    .select('role, institution_id')
    .eq('id', user.id)
    .single() as { data: Pick<JusUser, 'role' | 'institution_id'> | null }

  if (!profile || (profile.role !== 'professor' && profile.role !== 'admin')) {
    redirect('/dashboard/aluno')
  }

  // Global public templates (institution_id IS NULL + is_public = true)
  const { data: globalTemplates } = await (supabase as any)
    .from('case_templates')
    .select('*')
    .is('institution_id', null)
    .eq('is_public', true)
    .order('created_at', { ascending: false }) as { data: CaseTemplate[] | null }

  // Institution-specific templates
  const { data: myTemplates } = await (supabase as any)
    .from('case_templates')
    .select('*')
    .eq('institution_id', profile.institution_id)
    .order('created_at', { ascending: false }) as { data: CaseTemplate[] | null }

  // Filter templates
  const filterFn = (t: CaseTemplate) =>
    filter === 'all' ? true : t.instance_level === filter

  const filteredGlobal = (globalTemplates ?? []).filter(filterFn)
  const filteredMy = (myTemplates ?? []).filter(filterFn)
  const totalFiltered = filteredGlobal.length + filteredMy.length
  const totalCount = (globalTemplates?.length ?? 0) + (myTemplates?.length ?? 0)

  const FILTER_LABELS: Record<string, string> = {
    all: 'Todos',
    first: '1ª Instância',
    appeal_interlocutory: '2º Grau — AI',
    appeal_sentence: '2º Grau — Apelação',
    arbitral: 'Arbitragem',
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biblioteca de Modelos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount} modelo{totalCount !== 1 ? 's' : ''} disponíve{totalCount !== 1 ? 'is' : 'l'}
          </p>
        </div>
        <Link
          href="/dashboard/professor/casos/novo"
          className="flex items-center gap-2 px-4 py-2 bg-[#185FA5] text-white rounded-lg text-sm font-medium hover:bg-[#134D87] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Criar do zero
        </Link>
      </div>

      {/* Filter tabs */}
      {totalCount > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
            <Link
              key={key}
              href={`/dashboard/professor/biblioteca?filter=${key}`}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                filter === key
                  ? 'bg-[#185FA5] text-white border-[#185FA5]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {FILTER_LABELS[key]}
            </Link>
          ))}
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
          <Library className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Nenhum modelo disponível ainda.</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">
            Os modelos da plataforma aparecem aqui. Por enquanto, crie um caso do zero.
          </p>
          <Link
            href="/dashboard/professor/casos/novo"
            className="px-4 py-2 bg-[#185FA5] text-white rounded-lg text-sm font-medium hover:bg-[#134D87] transition-colors"
          >
            Criar caso do zero
          </Link>
        </div>
      )}

      {/* No results for filter */}
      {totalCount > 0 && totalFiltered === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Nenhum modelo para este filtro.
        </div>
      )}

      {/* My institution templates */}
      {filteredMy.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Modelos da sua instituição
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMy.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        </section>
      )}

      {/* Global templates */}
      {filteredGlobal.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Biblioteca JusGaming
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredGlobal.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function TemplateCard({ template }: { template: CaseTemplate }) {
  const instance = INSTANCE_CONFIG[template.instance_level] ?? template.instance_level
  const instanceBadgeClass = INSTANCE_BADGE[template.instance_level] ?? 'bg-gray-50 text-gray-600 border-gray-200'

  const hasPlaintiff = !!template.plaintiff_brief
  const hasDefendant = !!template.defendant_brief

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Card body */}
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="w-9 h-9 rounded-lg bg-[#185FA5]/10 flex items-center justify-center flex-shrink-0">
            {template.type === 'arbitration'
              ? <Gavel className="h-4 w-4 text-[#185FA5]" />
              : <Scale className="h-4 w-4 text-[#185FA5]" />}
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${instanceBadgeClass}`}>
              {instance}
            </span>
          </div>
        </div>

        <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1">
          {template.title}
        </h3>

        {template.subject && (
          <p className="text-xs text-gray-500 mb-2">{template.subject}</p>
        )}

        <p className="text-xs text-gray-400">{instance}</p>

        {template.arbitration_rules && (
          <p className="text-xs text-gray-400 mt-0.5">{template.arbitration_rules}</p>
        )}

        {/* Brief indicators */}
        {(hasPlaintiff || hasDefendant) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            {hasPlaintiff && (
              <span className="text-xs flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                <BookOpen className="h-3 w-3" />
                Brief Autor
              </span>
            )}
            {hasDefendant && (
              <span className="text-xs flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                <BookOpen className="h-3 w-3" />
                Brief Réu
              </span>
            )}
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="px-5 pb-4">
        <Link
          href={`/dashboard/professor/casos/novo?template=${template.id}`}
          className="flex items-center justify-center gap-2 w-full py-2 bg-[#185FA5] text-white rounded-lg text-sm font-medium hover:bg-[#134D87] transition-colors"
        >
          Usar este modelo
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
