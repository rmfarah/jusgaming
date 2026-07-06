'use client'

import { useState } from 'react'
import { X, Star, MessageSquare } from 'lucide-react'

export interface EvalModalData {
  score: number | null
  comments: string | null
  published_at: string | null
}

interface Props {
  docTitle: string
  evaluation: EvalModalData
}

export default function EvaluationModal({ docTitle, evaluation }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ver avaliação do professor"
        className="inline-flex items-center gap-1 text-xs text-[#185FA5] hover:text-[#134D87] font-medium transition-colors"
      >
        <Star className="h-3 w-3" />
        Ver feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Avaliação do Professor</p>
                <h3 className="font-semibold text-gray-900 text-sm mt-0.5 leading-snug line-clamp-2">
                  {docTitle}
                </h3>
                {evaluation.published_at && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Publicado em{' '}
                    {new Date(evaluation.published_at).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: 'long', year: 'numeric',
                    })}
                  </p>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Nota */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                <span className="text-sm font-semibold text-gray-700">Nota</span>
                {evaluation.score !== null ? (
                  <span className={`text-2xl font-bold ${
                    evaluation.score >= 8 ? 'text-green-600' :
                    evaluation.score >= 6 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {evaluation.score.toFixed(1)}
                    <span className="text-sm text-gray-400 font-normal"> / 10</span>
                  </span>
                ) : (
                  <span className="text-gray-400 text-sm">Não atribuída</span>
                )}
              </div>

              {/* Comentário */}
              {evaluation.comments ? (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Feedback do Professor
                  </p>
                  <blockquote className="border-l-4 border-[#185FA5] pl-4 text-sm text-gray-700 italic leading-relaxed">
                    {evaluation.comments}
                  </blockquote>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-2">
                  Sem comentários adicionais.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setOpen(false)}
                className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
