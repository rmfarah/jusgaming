'use client'

import { useState, useTransition } from 'react'
import {
  ChevronDown, ChevronRight, Save, Send, Loader2,
  AlertCircle, CheckCircle2, Lightbulb, ChevronUp,
} from 'lucide-react'
import { upsertEvaluation } from '@/lib/actions/evaluations'
import DocumentDownloadButton from '@/components/DocumentDownloadButton'
import type { TeamRole } from '@/lib/jusgaming.types'
import { DOCUMENT_TYPE_LABELS } from '@/lib/jusgaming.types'
import { EVALUATION_HINTS } from '@/lib/evaluationHints'

const TEAM_ROLE_COLORS: Record<TeamRole, string> = {
  plaintiff: 'bg-blue-100 text-blue-700 border-blue-200',
  defendant: 'bg-amber-100 text-amber-700 border-amber-200',
  judge: 'bg-purple-100 text-purple-700 border-purple-200',
}
const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  plaintiff: 'Autor',
  defendant: 'Réu',
  judge: 'Juiz',
}

export interface DocForEval {
  id: string
  sequence_number: number
  document_type: string
  title: string
  file_path: string | null
  created_at: string
  teams: { name: string; role: TeamRole } | null
  evaluation: {
    id: string
    score: number | null
    comments: string | null
    weight: number
    published_at: string | null
  } | null
}

interface Props {
  doc: DocForEval
  defaultOpen?: boolean
}

export default function EvaluationDocRow({ doc, defaultOpen = false }: Props) {
  const initEval = doc.evaluation
  const [open, setOpen] = useState(defaultOpen || !!initEval?.id)
  const [hintsOpen, setHintsOpen] = useState(false)

  const [score, setScore] = useState<string>(initEval?.score?.toString() ?? '')
  const [comments, setComments] = useState(initEval?.comments ?? '')
  const [isPublished, setIsPublished] = useState(!!initEval?.published_at)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const hints = EVALUATION_HINTS[doc.document_type] ?? []
  const teamRole = doc.teams?.role

  const handleSave = (publish: boolean) => {
    setError('')
    setSaved(false)
    const scoreNum = score === '' ? null : parseFloat(score)
    if (scoreNum !== null && (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 10)) {
      setError('Nota deve ser entre 0 e 10.')
      return
    }
    startTransition(async () => {
      const result = await upsertEvaluation(doc.id, { score: scoreNum, comments, publish })
      if (result.error) {
        setError(result.error)
      } else {
        setSaved(true)
        if (publish) setIsPublished(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  const statusDot = isPublished
    ? 'bg-green-500'
    : initEval?.id
      ? 'bg-gray-300'
      : 'bg-transparent border border-gray-300'

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors text-left"
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot}`} />
        <span className="font-mono text-xs text-gray-500 w-8 flex-shrink-0">
          {String(doc.sequence_number).padStart(3, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-gray-500">
              {DOCUMENT_TYPE_LABELS[doc.document_type as keyof typeof DOCUMENT_TYPE_LABELS] ?? doc.document_type}
            </span>
            {teamRole && (
              <span className={`text-xs px-1.5 py-0.5 rounded border ${TEAM_ROLE_COLORS[teamRole]}`}>
                {TEAM_ROLE_LABELS[teamRole]}
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 hidden sm:block flex-shrink-0">
          {new Date(doc.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </span>
        {doc.file_path && (
          <span onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
            <DocumentDownloadButton documentId={doc.id} />
          </span>
        )}
        <span className={`text-xs flex-shrink-0 px-1.5 py-0.5 rounded font-medium ${
          isPublished ? 'bg-green-100 text-green-700' :
          initEval?.id ? 'bg-gray-100 text-gray-600' :
          'bg-orange-50 text-orange-600'
        }`}>
          {isPublished ? 'Publicado' : initEval?.id ? 'Rascunho' : 'Avaliar'}
        </span>
        <span className="text-gray-400 flex-shrink-0">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {/* Expanded form */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
            </div>
          )}
          {isPublished && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              <CheckCircle2 className="h-3.5 w-3.5" /> Feedback publicado — visível ao aluno
            </div>
          )}

          {/* Nota */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-gray-700 flex-1">Nota (0 – 10)</label>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              disabled={pending}
              placeholder="—"
              className="w-20 text-center text-lg font-bold border-2 border-gray-300 rounded-md px-2 py-1.5 bg-white focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] disabled:opacity-50"
            />
          </div>

          {/* Comentário */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">
              Comentário / Feedback <span className="text-gray-400 font-normal normal-case">(opcional)</span>
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              disabled={pending}
              rows={3}
              placeholder="Escreva um feedback construtivo para o aluno…"
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 resize-none bg-white focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] disabled:opacity-50"
            />
          </div>

          {/* Sugestões colapsáveis */}
          {hints.length > 0 && (
            <div className="border border-amber-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setHintsOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors"
              >
                <Lightbulb className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Sugestões de avaliação</span>
                <span className="ml-auto">
                  {hintsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </span>
              </button>
              {hintsOpen && (
                <ul className="px-3 py-2 space-y-1.5 bg-white border-t border-amber-100">
                  {hints.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                      <span className="text-amber-400 mt-0.5 flex-shrink-0">•</span>
                      <span>
                        {h.text}
                        {h.ref && (
                          <span className="ml-1 text-gray-400 font-medium">({h.ref})</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Botões */}
          <div className="flex items-center gap-2">
            {saved && !pending && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Salvo
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => handleSave(false)}
                disabled={pending}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar rascunho
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={pending || isPublished}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#185FA5] text-white rounded-md text-sm font-medium hover:bg-[#134D87] disabled:opacity-50 transition-colors"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {isPublished ? 'Publicado' : 'Publicar feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
