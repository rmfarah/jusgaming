'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import { createCourse } from '@/lib/actions/courses'

export default function CreateCourseModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [isPending, setIsPending] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setIsPending(true)

    const formData = new FormData(e.currentTarget)

    try {
      const result = await createCourse(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      formRef.current?.reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar turma.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134d87] focus:outline-none focus:ring-2 focus:ring-[#185FA5] focus:ring-offset-2"
      >
        + Nova Turma
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Nova Turma</h2>
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
                {error}
              </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Nome da turma
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  disabled={isPending}
                  placeholder="Ex: Direito Processual Civil A"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="semester" className="block text-sm font-medium text-gray-700">
                  Semestre
                </label>
                <input
                  id="semester"
                  name="semester"
                  type="text"
                  required
                  disabled={isPending}
                  placeholder="Ex: 2026.1"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] disabled:opacity-50"
                />
              </div>

              <p className="text-xs text-gray-500">
                O código de acesso será gerado automaticamente.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134d87] disabled:opacity-50"
                >
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isPending ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
