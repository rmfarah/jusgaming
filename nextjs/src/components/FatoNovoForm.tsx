'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSPAClient } from '@/lib/supabase/client'
import { sendFatoNovo, type FatoNovoRecipient } from '@/lib/actions/fatoNovo'
import { Paperclip, Send, X, Loader2, AlertCircle, CheckCircle2, FileText, Eye } from 'lucide-react'

interface Props {
  caseId: string
  caseTitle: string
}

const RECIPIENT_OPTIONS: { value: FatoNovoRecipient; label: string; description: string }[] = [
  { value: 'plaintiff', label: 'Time Autor', description: 'Apenas o Time Autor recebe' },
  { value: 'defendant', label: 'Time Réu', description: 'Apenas o Time Réu recebe' },
  { value: 'both', label: 'Ambos', description: 'Autor e Réu recebem simultaneamente' },
]

export default function FatoNovoForm({ caseId, caseTitle }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [recipient, setRecipient] = useState<FatoNovoRecipient>('both')
  const [showPreview, setShowPreview] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()

  const loading = uploading || pending

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (f && f.type !== 'application/pdf') {
      setError('Apenas arquivos PDF são aceitos.')
      e.target.value = ''
      return
    }
    if (f && f.size > 20 * 1024 * 1024) {
      setError('Arquivo muito grande. Limite: 20 MB.')
      e.target.value = ''
      return
    }
    setFile(f)
    setError('')
  }

  const recipientLabel = RECIPIENT_OPTIONS.find((o) => o.value === recipient)?.label ?? ''

  const emailPreview = `De: Seu cliente (via sistema JusGaming)
Para: ${recipientLabel}
Assunto: 📩 Fato Novo — ${caseTitle}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mensagem do seu cliente:

"${message || '(escreva a mensagem acima)'}"${file ? '\n\n[Documento em anexo disponível no sistema]' : ''}

— Enviado pelo professor responsável pelo caso "${caseTitle}"`

  const handleSubmit = async () => {
    setError('')
    setSuccess(false)

    if (!message.trim()) {
      setError('A mensagem do cliente é obrigatória.')
      return
    }

    let storagePath: string | null = null

    if (file) {
      setUploading(true)
      try {
        const supabase = createSPAClient()
        const sanitized = file.name.replace(/[^0-9a-zA-Z!\-_.*'()]/g, '_')
        const path = `cases/${caseId}/fato-novo/${Date.now()}-${sanitized}`

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: uploadData, error: uploadError } = await (supabase as any).storage
          .from('files')
          .upload(path, file, { upsert: false })

        if (uploadError) throw new Error(uploadError.message)
        storagePath = uploadData.path
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao enviar arquivo.')
        setUploading(false)
        return
      }
      setUploading(false)
    }

    startTransition(async () => {
      const result = await sendFatoNovo(caseId, {
        message,
        storagePath,
        recipient,
      })

      if (result.error) {
        setError(result.error)
        if (storagePath) {
          const supabase = createSPAClient()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).storage.from('files').remove([storagePath])
        }
      } else {
        setSuccess(true)
        setMessage('')
        setFile(null)
        setShowPreview(false)
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Success */}
      {success && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Fato novo enviado com sucesso! Os times foram notificados.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Mensagem do cliente */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Mensagem do Cliente
          <span className="font-normal text-gray-400 ml-1">(linguagem natural — não jurídica)</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={loading}
          rows={6}
          placeholder="Ex.: 'Olá, doutor. Recebi um e-mail dizendo que preciso entregar os documentos até sexta-feira. O que faço? Também tenho as notas fiscais que pediu, estão em anexo.'"
          className="w-full text-sm border border-gray-300 rounded-lg px-4 py-3 resize-none focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] disabled:opacity-50"
        />
        <p className="text-xs text-gray-400 mt-1">
          Esta mensagem representa a comunicação do cliente com seu advogado.
        </p>
      </div>

      {/* Destinatários */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Destinatários</label>
        <div className="grid grid-cols-3 gap-3">
          {RECIPIENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRecipient(opt.value)}
              disabled={loading}
              className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
                recipient === opt.value
                  ? 'border-[#185FA5] bg-blue-50 text-[#185FA5]'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="text-xs text-current opacity-60">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Arquivo (opcional) */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Documento do Cliente
          <span className="font-normal text-gray-400 ml-1">(opcional, PDF)</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={loading}
            className="sr-only"
            id="fato-novo-file"
          />
          <label
            htmlFor="fato-novo-file"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
              file
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {file ? (
              <>
                <FileText className="h-4 w-4" />
                <span className="max-w-[200px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    setFile(null)
                    if (fileRef.current) fileRef.current.value = ''
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <Paperclip className="h-4 w-4" />
                Anexar PDF
              </>
            )}
          </label>
        </div>
      </div>

      {/* Preview toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <Eye className="h-4 w-4" />
          {showPreview ? 'Ocultar preview' : 'Visualizar como os alunos vão receber'}
        </button>

        {showPreview && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Preview da notificação
            </p>
            <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
              {emailPreview}
            </pre>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !message.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#185FA5] text-white rounded-lg text-sm font-medium hover:bg-[#134D87] disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {uploading ? 'Enviando arquivo…' : pending ? 'Enviando…' : 'Enviar Fato Novo'}
        </button>
      </div>
    </div>
  )
}
