'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCase } from '@/lib/actions/cases'
import type { Course, CaseTemplate, InstanceLevel } from '@/lib/jusgaming.types'
import { ArrowLeft, Loader2, Scale, Gavel, FileText, Info } from 'lucide-react'

interface Props {
  courses: Pick<Course, 'id' | 'name' | 'semester' | 'active'>[]
  template: CaseTemplate | null
}

type CaseType = 'civil' | 'arbitration'
type Degree = '1' | '2'
type RecursoType = 'appeal_interlocutory' | 'appeal_sentence'

function computeInstanceLevel(type: CaseType, degree: Degree, recurso: RecursoType): InstanceLevel {
  if (type === 'arbitration') return 'arbitral'
  if (degree === '1') return 'first'
  return recurso
}

// email_sender_type é implícito pelo grau:
// 1º grau → 'client' (cliente procura o advogado pela primeira vez)
// 2º grau → 'previous_lawyers' (substabelecimento dos advogados anteriores)
function computeEmailSenderType(degree: Degree): 'client' | 'previous_lawyers' {
  return degree === '2' ? 'previous_lawyers' : 'client'
}

const INSTANCE_LABELS: Record<InstanceLevel, string> = {
  first: '1ª Instância',
  appeal: '2ª Instância',
  arbitral: 'Câmara Arbitral',
  appeal_interlocutory: '2º Grau — Agravo de Instrumento',
  appeal_sentence: '2º Grau — Apelação',
}

function RadioCard({
  name, value, checked, onChange, label, description,
}: {
  name: string; value: string; checked: boolean; onChange: () => void
  label: string; description?: string
}) {
  return (
    <label className="flex-1 cursor-pointer">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      <div className={`flex flex-col gap-0.5 py-3 px-4 rounded-lg border-2 text-sm transition-colors ${
        checked
          ? 'border-[#185FA5] bg-blue-50 text-[#185FA5]'
          : 'border-gray-200 text-gray-600 hover:border-gray-300'
      }`}>
        <span className="font-medium">{label}</span>
        {description && <span className={`text-xs ${checked ? 'text-blue-600' : 'text-gray-400'}`}>{description}</span>}
      </div>
    </label>
  )
}

export default function NovoCasoForm({ courses, template }: Props) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(createCase, null)

  // ── Cascade state ─────────────────────────────────────────────────────────
  const [type, setType] = useState<CaseType>((template?.type as CaseType) ?? 'civil')
  const [degree, setDegree] = useState<Degree>(() => {
    const il = template?.instance_level
    if (il === 'appeal_interlocutory' || il === 'appeal_sentence') return '2'
    return '1'
  })
  const [recurso, setRecurso] = useState<RecursoType>(
    (template?.instance_level as RecursoType | undefined) === 'appeal_sentence'
      ? 'appeal_sentence'
      : 'appeal_interlocutory',
  )

  const instanceLevel = computeInstanceLevel(type, degree, recurso)
  const isAppeal = degree === '2' && type === 'civil'
  // email_sender_type é determinado automaticamente pelo grau
  const emailSenderType = computeEmailSenderType(degree)

  // Redirect on success
  useEffect(() => {
    if (state && 'caseId' in state && state.caseId) {
      router.push(`/dashboard/professor/casos/${state.caseId}/times`)
    }
  }, [state, router])

  return (
    <form action={formAction} className="space-y-6">
      {/* Hidden computed fields */}
      <input type="hidden" name="instance_level" value={instanceLevel} />
      <input type="hidden" name="email_sender_type" value={isAppeal ? emailSenderType : 'client'} />
      {template?.id && <input type="hidden" name="template_id" value={template.id} />}

      {/* Error */}
      {state && 'error' in state && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {state.error}
        </div>
      )}

      {/* Título */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Título do caso <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={template?.title ?? ''}
          placeholder="Ex: Caso de Responsabilidade Civil — Dano Moral"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
        />
      </div>

      {/* Passo 1 — Tipo */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">
          Tipo <span className="text-red-500">*</span>
        </p>
        <div className="flex gap-3">
          <RadioCard
            name="_type_display" value="civil" checked={type === 'civil'}
            onChange={() => { setType('civil') }}
            label="Judiciário" description="Cível / 1º ou 2º Grau"
          />
          <RadioCard
            name="_type_display" value="arbitration" checked={type === 'arbitration'}
            onChange={() => { setType('arbitration') }}
            label="Arbitragem" description="Câmara arbitral"
          />
        </div>
        {/* Hidden real field so server action receives 'civil'/'arbitration' */}
        <input type="hidden" name="type" value={type} />
      </div>

      {/* Passo 2 — Grau (apenas Judiciário) */}
      {type === 'civil' && (
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-2">
            Grau <span className="text-red-500">*</span>
          </p>
          <div className="flex gap-3">
            <RadioCard
              name="_degree_display" value="1" checked={degree === '1'}
              onChange={() => setDegree('1')}
              label="1º Grau" description="Juízo de primeira instância"
            />
            <RadioCard
              name="_degree_display" value="2" checked={degree === '2'}
              onChange={() => setDegree('2')}
              label="2º Grau" description="Julgamento recursal"
            />
          </div>
        </div>
      )}

      {/* Passo 3 — Tipo de recurso (apenas 2º Grau) */}
      {type === 'civil' && degree === '2' && (
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-2">
            Tipo de recurso <span className="text-red-500">*</span>
          </p>
          <div className="flex gap-3">
            <RadioCard
              name="_recurso_display" value="appeal_interlocutory" checked={recurso === 'appeal_interlocutory'}
              onChange={() => setRecurso('appeal_interlocutory')}
              label="Agravo de instrumento" description="Decisão interlocutória recorrida"
            />
            <RadioCard
              name="_recurso_display" value="appeal_sentence" checked={recurso === 'appeal_sentence'}
              onChange={() => setRecurso('appeal_sentence')}
              label="Apelação" description="Sentença recorrida"
            />
          </div>
        </div>
      )}

      {/* Aviso contextual no 2º Grau — substabelecimento implícito */}
      {isAppeal && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            No 2º Grau, os times receberão um e-mail simulando o substabelecimento sem reserva dos advogados anteriores,
            com cópia da {recurso === 'appeal_interlocutory' ? 'decisão interlocutória' : 'sentença'} recorrida.
            Configure o texto nos briefings após criar o caso.
          </span>
        </div>
      )}

      {/* Regulamento arbitral */}
      {type === 'arbitration' && (
        <div>
          <label htmlFor="arbitration_rules" className="block text-sm font-medium text-gray-700 mb-1">
            Regulamento / Câmara Arbitral
            <span className="ml-1 text-xs text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            id="arbitration_rules"
            name="arbitration_rules"
            type="text"
            defaultValue={template?.arbitration_rules ?? ''}
            placeholder="Ex: CAM-CCBC, CAMARB, ICC…"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
          />
        </div>
      )}

      {/* Turma */}
      <div>
        <label htmlFor="course_id" className="block text-sm font-medium text-gray-700 mb-1">
          Turma <span className="text-red-500">*</span>
        </label>
        {courses.length === 0 ? (
          <div className="p-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
            Nenhuma turma ativa. <Link href="/dashboard/professor" className="underline">Crie uma turma</Link> primeiro.
          </div>
        ) : (
          <select
            id="course_id"
            name="course_id"
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] bg-white"
          >
            <option value="">Selecione uma turma…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.semester}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Summary pill */}
      <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        {type === 'arbitration' ? (
          <Gavel className="h-4 w-4 text-purple-500 flex-shrink-0" />
        ) : isAppeal ? (
          <Scale className="h-4 w-4 text-amber-500 flex-shrink-0" />
        ) : (
          <Scale className="h-4 w-4 text-blue-500 flex-shrink-0" />
        )}
        <span className="text-xs text-gray-600 font-medium">{INSTANCE_LABELS[instanceLevel]}</span>
        <span className="text-xs text-gray-400">
          · {isAppeal ? 'Substabelecimento dos advogados anteriores' : type === 'civil' ? 'E-mail do cliente' : 'Câmara arbitral'}
        </span>
      </div>

      {/* Briefs info from template */}
      {template && (template.plaintiff_brief || template.defendant_brief) && (
        <div className="p-3 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
          <FileText className="h-4 w-4 flex-shrink-0 mt-0.5" />
          Este modelo contém briefings para os times que serão enviados por e-mail após a ativação.
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Link
          href="/dashboard/professor/casos"
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <button
          type="submit"
          disabled={pending || courses.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#185FA5] text-white rounded-lg text-sm font-medium hover:bg-[#134D87] disabled:opacity-50 transition-colors"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? 'Criando…' : 'Criar e configurar times →'}
        </button>
      </div>
    </form>
  )
}
