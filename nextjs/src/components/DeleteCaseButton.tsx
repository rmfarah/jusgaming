'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { deleteCase } from '@/lib/actions/cases'

interface Props {
  caseId: string
  caseStatus: 'draft' | 'active' | 'closed'
}

export default function DeleteCaseButton({ caseId, caseStatus }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const isActive = caseStatus === 'active'

  const handleDelete = async () => {
    setPending(true)
    setError('')
    try {
      const result = await deleteCase(caseId)
      if (result?.error) {
        setError(result.error)
        setConfirming(false)
      } else {
        router.refresh()
      }
    } catch {
      setError('Erro inesperado. Tente novamente.')
      setConfirming(false)
    } finally {
      setPending(false)
    }
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-xs text-red-600 max-w-48">{error}</p>
        <button onClick={() => setError('')} className="text-xs text-gray-500 underline whitespace-nowrap">
          OK
        </button>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {isActive && (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            Caso ativo — alunos perderão acesso
          </span>
        )}
        <span className="text-xs text-gray-600 whitespace-nowrap">Tem certeza?</span>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3 w-3 animate-spin" />}
          Apagar
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="px-2 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Apagar caso"
      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}
