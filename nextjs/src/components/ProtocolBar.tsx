'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSPAClient } from '@/lib/supabase/client'
import { protocolDocument } from '@/lib/actions/documents'
import type { DocumentType, InstanceLevel, TeamRole } from '@/lib/jusgaming.types'
import {
  DOCUMENT_TYPE_LABELS,
  LAWYER_DOC_TYPES,
  APPEAL_LAWYER_DOC_TYPES,
  JUDGE_DOC_TYPES,
  PROFESSOR_DOC_TYPES,
  INCIDENT_JUDGE_DOC_TYPES,
  INCIDENT_LAWYER_DOC_TYPES,
  isAppealLevel,
} from '@/lib/jusgaming.types'
import { Paperclip, Send, X, Loader2, AlertCircle, FileText } from 'lucide-react'

interface Props {
  caseId: string
  teamId: string | null
  teamRole: TeamRole | 'professor'
  isIncident?: boolean
  instanceLevel?: InstanceLevel
  instanceId?: string   // unique suffix for file-input id when multiple ProtocolBars on page
}

export default function ProtocolBar({ caseId, teamId, teamRole, isIncident = false, instanceLevel, instanceId }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [docType, setDocType] = useState<DocumentType | ''>('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()

  const appeal = !isIncident && instanceLevel && isAppealLevel(instanceLevel)

  const availableTypes: DocumentType[] = isIncident
    ? (teamRole === 'professor' || teamRole === 'judge')
      ? INCIDENT_JUDGE_DOC_TYPES
      : INCIDENT_LAWYER_DOC_TYPES
    : teamRole === 'professor'
      ? PROFESSOR_DOC_TYPES
      : teamRole === 'judge'
        ? JUDGE_DOC_TYPES
        : appeal
          ? APPEAL_LAWYER_DOC_TYPES
          : LAWYER_DOC_TYPES

  const fileInputId = `protocol-file-${instanceId ?? 'main'}`

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

  const handleSubmit = async () => {
    setError('')

    if (!docType) { setError('Selecione o tipo de ato.'); return }
    if (!title.trim()) { setError('Informe o título do documento.'); return }

    let storagePath: string | null = null

    // 1. Upload file if selected
    if (file) {
      setUploading(true)
      try {
        const supabase = createSPAClient()
        const sanitized = file.name.replace(/[^0-9a-zA-Z!\-_.*'()]/g, '_')
        const path = `cases/${caseId}/${Date.now()}-${sanitized}`

        const { data: uploadData, error: uploadError } = await supabase.storage
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

    // 2. Call server action
    startTransition(async () => {
      const result = await protocolDocument(caseId, {
        docType: docType as DocumentType,
        title: title.trim(),
        teamId,
        storagePath,
      })

      if (result.error) {
        setError(result.error)
        // Clean up uploaded file on error
        if (storagePath) {
          const supabase = createSPAClient()
          await supabase.storage.from('files').remove([storagePath])
        }
      } else {
        // Reset form
        setDocType('')
        setTitle('')
        setFile(null)
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      }
    })
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3 flex-shrink-0">
      {error && (
        <div className="flex items-center gap-2 mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        {/* Document type */}
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocumentType)}
          disabled={loading}
          className="text-sm border border-gray-300 rounded-lg px-2.5 py-2 bg-white focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] disabled:opacity-50 min-w-0 flex-shrink-0 w-52"
        >
          <option value="">Tipo de ato…</option>
          {availableTypes.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleSubmit()}
          disabled={loading}
          placeholder="Título do documento…"
          className="flex-1 min-w-0 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] disabled:opacity-50"
        />

        {/* File attach */}
        <div className="flex-shrink-0">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={loading}
            className="sr-only"
            id={fileInputId}
          />
          <label
            htmlFor={fileInputId}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
              file
                ? 'border-green-300 bg-green-50 text-green-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {file ? (
              <>
                <FileText className="h-4 w-4" />
                <span className="max-w-[120px] truncate text-xs">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    setFile(null)
                    if (fileRef.current) fileRef.current.value = ''
                  }}
                  className="ml-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <Paperclip className="h-4 w-4" />
                <span>PDF</span>
              </>
            )}
          </label>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-[#185FA5] text-white rounded-lg text-sm font-medium hover:bg-[#134D87] disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {uploading ? 'Enviando…' : pending ? 'Protocolando…' : 'Protocolar'}
        </button>
      </div>
    </div>
  )
}
