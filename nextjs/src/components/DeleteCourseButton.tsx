'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteCourse } from '@/lib/actions/courses'

export default function DeleteCourseButton({ courseId }: { courseId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setPending(true)
    setError('')
    try {
      const result = await deleteCourse(courseId)
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
        <button
          onClick={() => setError('')}
          className="text-xs text-gray-500 underline whitespace-nowrap"
        >
          OK
        </button>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
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
      title="Apagar turma"
      className="p-2 rounded-md border border-gray-200 bg-gray-50 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
