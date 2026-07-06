'use client'

import { useState, useTransition } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Send, BarChart2 } from 'lucide-react'
import { updateEvaluationWeight, publishAllEvaluations } from '@/lib/actions/evaluations'
import type { TeamRole } from '@/lib/jusgaming.types'
import { DOCUMENT_TYPE_LABELS } from '@/lib/jusgaming.types'

const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  plaintiff: 'Time Autor',
  defendant: 'Time Réu',
  judge: 'Time Juiz',
}
const TEAM_ROLE_BORDER: Record<TeamRole, string> = {
  plaintiff: 'border-blue-200',
  defendant: 'border-amber-200',
  judge: 'border-purple-200',
}
const TEAM_ROLE_HEADER: Record<TeamRole, string> = {
  plaintiff: 'bg-blue-50 text-blue-700',
  defendant: 'bg-amber-50 text-amber-700',
  judge: 'bg-purple-50 text-purple-700',
}

export interface TeamEvalDoc {
  evaluationId: string
  documentId: string
  sequenceNumber: number
  documentType: string
  title: string
  score: number | null
  weight: number
  publishedAt: string | null
}

interface Props {
  caseId: string
  teamId: string
  teamRole: TeamRole
  teamName: string
  docs: TeamEvalDoc[]
  unpublishedCount: number
}

function weightedAverage(docs: TeamEvalDoc[]): number | null {
  const scored = docs.filter((d) => d.score !== null)
  if (scored.length === 0) return null
  const sumWeights = scored.reduce((s, d) => s + d.weight, 0)
  if (sumWeights === 0) return null
  const sumWeighted = scored.reduce((s, d) => s + (d.score! * d.weight), 0)
  return sumWeighted / sumWeights
}

export default function CaseEvalForm({ caseId, teamRole, teamName, docs, unpublishedCount }: Props) {
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(docs.map((d) => [d.evaluationId, d.weight]))
  )
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [weightError, setWeightError] = useState('')
  const [publishPending, startPublishTransition] = useTransition()
  const [published, setPublished] = useState(false)
  const [publishError, setPublishError] = useState('')

  const docsWithWeights: TeamEvalDoc[] = docs.map((d) => ({
    ...d,
    weight: weights[d.evaluationId] ?? d.weight,
  }))

  const average = weightedAverage(docsWithWeights)

  const handleWeightChange = (evalId: string, raw: string) => {
    const val = parseFloat(raw)
    setWeights((prev) => ({ ...prev, [evalId]: isNaN(val) ? prev[evalId] : val }))
  }

  const handleWeightSave = async (evalId: string) => {
    const w = weights[evalId]
    if (!w || w <= 0) { setWeightError('Peso deve ser maior que zero.'); return }
    if (w > 99.99) { setWeightError('Peso máximo: 99.99.'); return }
    setWeightError('')
    setSavingId(evalId)
    const result = await updateEvaluationWeight(evalId, w)
    setSavingId(null)
    if (result.error) {
      setWeightError(result.error)
    } else {
      setSavedId(evalId)
      setTimeout(() => setSavedId(null), 2000)
    }
  }

  const handlePublishAll = () => {
    setPublishError('')
    startPublishTransition(async () => {
      const result = await publishAllEvaluations(caseId)
      if (result.error) {
        setPublishError(result.error)
      } else {
        setPublished(true)
      }
    })
  }

  if (docs.length === 0) return null

  return (
    <div className={`rounded-lg border-2 ${TEAM_ROLE_BORDER[teamRole]} overflow-hidden`}>
      {/* Header */}
      <div className={`px-4 py-3 ${TEAM_ROLE_HEADER[teamRole]} flex items-center justify-between`}>
        <div>
          <p className="text-sm font-semibold">{TEAM_ROLE_LABELS[teamRole]}</p>
          <p className="text-xs opacity-75">{teamName}</p>
        </div>
        {average !== null && (
          <div className="text-right">
            <p className="text-xs opacity-75 font-medium">Média ponderada</p>
            <p className={`text-xl font-bold ${
              average >= 8 ? 'text-green-700' :
              average >= 6 ? 'text-yellow-700' :
              'text-red-700'
            }`}>
              {average.toFixed(1)}
              <span className="text-xs font-normal opacity-60"> / 10</span>
            </p>
          </div>
        )}
      </div>

      {/* Doc list with weights */}
      <div className="divide-y divide-gray-100">
        {docsWithWeights.map((d) => (
          <div key={d.evaluationId} className="px-4 py-3 flex items-center gap-3 bg-white">
            <span className="font-mono text-xs text-gray-400 w-8 flex-shrink-0">
              {String(d.sequenceNumber).padStart(3, '0')}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{d.title}</p>
              <p className="text-xs text-gray-400">
                {DOCUMENT_TYPE_LABELS[d.documentType as keyof typeof DOCUMENT_TYPE_LABELS] ?? d.documentType}
              </p>
            </div>
            {/* Nota */}
            <span className={`text-sm font-bold w-10 text-center flex-shrink-0 ${
              d.score === null ? 'text-gray-300' :
              d.score >= 8 ? 'text-green-600' :
              d.score >= 6 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {d.score !== null ? d.score.toFixed(1) : '—'}
            </span>
            {/* Peso */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <label className="text-xs text-gray-500 hidden sm:block">Peso</label>
              <input
                type="number"
                min="0.1"
                step="0.5"
                value={weights[d.evaluationId] ?? d.weight}
                onChange={(e) => handleWeightChange(d.evaluationId, e.target.value)}
                onBlur={() => handleWeightSave(d.evaluationId)}
                disabled={savingId === d.evaluationId}
                className="w-14 text-center text-sm border border-gray-200 rounded-md px-1 py-1 bg-white focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] disabled:opacity-50"
              />
              {savingId === d.evaluationId && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
              {savedId === d.evaluationId && <CheckCircle2 className="h-3 w-3 text-green-500" />}
            </div>
            {/* Status */}
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
              d.publishedAt ? 'bg-green-100 text-green-700' : 'bg-orange-50 text-orange-600'
            }`}>
              {d.publishedAt ? '✓' : 'rascunho'}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-2">
        {weightError && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" /> {weightError}
          </div>
        )}
        {publishError && (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" /> {publishError}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <BarChart2 className="h-3.5 w-3.5" />
            {unpublishedCount > 0 && !published
              ? `${unpublishedCount} avaliação${unpublishedCount > 1 ? 'ões' : ''} em rascunho`
              : 'Todas publicadas'}
          </p>
          {(unpublishedCount > 0 && !published) && (
            <button
              onClick={handlePublishAll}
              disabled={publishPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {publishPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Publicar todas as avaliações
            </button>
          )}
          {(unpublishedCount === 0 || published) && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Todas publicadas
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
