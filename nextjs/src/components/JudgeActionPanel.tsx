'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSPAClient } from '@/lib/supabase/client'
import {
  judgeActionCiteSummons,
  judgeActionIntimate,
  judgeActionScheduleHearing,
  type HearingData,
} from '@/lib/actions/documents'
import { protocolDocument } from '@/lib/actions/documents'
import type { DocumentType, InstanceLevel } from '@/lib/jusgaming.types'
import { JUDGE_DOC_TYPES, DOCUMENT_TYPE_LABELS, isAppealLevel } from '@/lib/jusgaming.types'
import {
  Gavel, UserCheck, Users, User, Calendar, Loader2,
  AlertCircle, X, Send, Paperclip, FileText, ChevronDown,
} from 'lucide-react'

interface Props {
  caseId: string
  judgeTeamId: string
  isIncident?: boolean
  instanceLevel?: InstanceLevel
}

// ── Confirmation modal ────────────────────────────────────────────────────────
function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Confirmar ação</p>
            <p className="text-sm text-gray-600 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-4">Esta ação disparará notificações e não pode ser desfeita.</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#185FA5] rounded-lg hover:bg-[#134D87] disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hearing modal ─────────────────────────────────────────────────────────────
function HearingModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (data: HearingData) => void
  onCancel: () => void
  loading: boolean
}) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [hearingType, setHearingType] = useState('Audiência de Instrução')
  const [err, setErr] = useState('')

  const handleSubmit = () => {
    if (!date || !time || !location.trim()) {
      setErr('Preencha todos os campos.')
      return
    }
    setErr('')
    onConfirm({ date, time, location, hearingType })
  }

  const inputClass =
    'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[#185FA5]" />
            <h3 className="font-semibold text-gray-900">Designar Audiência</h3>
          </div>
          <button onClick={onCancel} disabled={loading} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de audiência</label>
            <select
              value={hearingType}
              onChange={(e) => setHearingType(e.target.value)}
              className={inputClass}
            >
              <option>Audiência de Instrução</option>
              <option>Audiência de Conciliação</option>
              <option>Audiência Una</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Hora</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Local</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex.: Sala de aula 204, Bloco B"
              className={inputClass}
            />
          </div>

          {err && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {err}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-end mt-5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#185FA5] rounded-lg hover:bg-[#134D87] disabled:opacity-50"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirmar audiência
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JudgeActionPanel({ caseId, judgeTeamId, isIncident = false, instanceLevel }: Props) {
  const appeal = instanceLevel ? isAppealLevel(instanceLevel) : false
  const router = useRouter()

  // Confirmation modal state
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // Hearing modal
  const [showHearing, setShowHearing] = useState(false)
  const [hearingLoading, setHearingLoading] = useState(false)

  // Protocol bar (Group B)
  const fileRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<DocumentType | ''>('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [protoPending, startProto] = useTransition()
  const [protoError, setProtoError] = useState('')

  // Shared error
  const [actionError, setActionError] = useState('')

  const loading = confirmLoading || hearingLoading

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const ask = (message: string, action: () => Promise<void>) => {
    setActionError('')
    setConfirmMsg(message)
    setPendingAction(() => action)
  }

  const runConfirmed = async () => {
    if (!pendingAction) return
    setConfirmLoading(true)
    try {
      await pendingAction()
    } finally {
      setConfirmLoading(false)
      setConfirmMsg(null)
      setPendingAction(null)
    }
  }

  const cancelConfirm = () => {
    setConfirmMsg(null)
    setPendingAction(null)
  }

  const doAction = async (fn: () => Promise<{ error?: string }>) => {
    const result = await fn()
    if (result.error) {
      setActionError(result.error)
    } else {
      router.refresh()
    }
  }

  // ── Protocol (Group B) ────────────────────────────────────────────────────
  const handleProtocol = () => {
    setProtoError('')
    if (!docType) { setProtoError('Selecione o tipo de ato.'); return }
    if (!title.trim()) { setProtoError('Informe o título do documento.'); return }

    const run = async () => {
      let storagePath: string | null = null
      if (file) {
        setUploading(true)
        try {
          const supabase = createSPAClient()
          const sanitized = file.name.replace(/[^0-9a-zA-Z!\-_.*'()]/g, '_')
          const path = `cases/${caseId}/${Date.now()}-${sanitized}`
          const { data: upData, error: upErr } = await supabase.storage
            .from('files').upload(path, file, { upsert: false })
          if (upErr) throw new Error(upErr.message)
          storagePath = upData.path
        } catch (err) {
          setProtoError(err instanceof Error ? err.message : 'Erro ao enviar arquivo.')
          setUploading(false)
          return
        }
        setUploading(false)
      }

      startProto(async () => {
        const result = await protocolDocument(caseId, {
          docType: docType as DocumentType,
          title: title.trim(),
          teamId: judgeTeamId,
          storagePath,
        })
        if (result.error) {
          setProtoError(result.error)
          if (storagePath) {
            const supabase = createSPAClient()
            await supabase.storage.from('files').remove([storagePath])
          }
        } else {
          setDocType('')
          setTitle('')
          setFile(null)
          if (fileRef.current) fileRef.current.value = ''
          router.refresh()
        }
      })
    }
    run()
  }

  const protoLoading = uploading || protoPending

  const availableTypes = isIncident
    ? JUDGE_DOC_TYPES
    : JUDGE_DOC_TYPES

  return (
    <>
      {/* Modals */}
      {confirmMsg && (
        <ConfirmModal
          message={confirmMsg}
          onConfirm={runConfirmed}
          onCancel={cancelConfirm}
          loading={confirmLoading}
        />
      )}
      {showHearing && (
        <HearingModal
          loading={hearingLoading}
          onCancel={() => setShowHearing(false)}
          onConfirm={async (data) => {
            setHearingLoading(true)
            await doAction(() => judgeActionScheduleHearing(caseId, judgeTeamId, data))
            setHearingLoading(false)
            setShowHearing(false)
          }}
        />
      )}

      <div className="border-t border-gray-200 bg-white flex-shrink-0">
        {/* Error banner */}
        {actionError && (
          <div className="flex items-center gap-2 mx-4 mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {actionError}
            <button onClick={() => setActionError('')} className="ml-auto"><X className="h-3 w-3" /></button>
          </div>
        )}

        {/* ── Grupo A — Atos com consequências sistêmicas ── */}
        <div className="px-4 pt-3 pb-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Atos judiciais
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Citar réu — só em 1º grau */}
            {!appeal && (
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  ask(
                    'Você está prestes a determinar a citação do réu. O Time Réu receberá o e-mail do caso.',
                    () => doAction(() => judgeActionCiteSummons(caseId, judgeTeamId)),
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100 disabled:opacity-50 transition-colors"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Determinar citação do réu
              </button>
            )}

            {/* Intimar Autor / Recorrente */}
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                ask(
                  `Você está prestes a intimar o ${appeal ? 'recorrente' : 'Time Autor'}. Será gerada intimação + certidão de publicação.`,
                  () => doAction(() => judgeActionIntimate(caseId, judgeTeamId, 'plaintiff')),
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              <User className="h-3.5 w-3.5" />
              {appeal ? 'Intimar recorrente' : 'Intimar Time Autor'}
            </button>

            {/* Intimar Réu / Recorrido */}
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                ask(
                  `Você está prestes a intimar o ${appeal ? 'recorrido' : 'Time Réu'}. Será gerada intimação + certidão de publicação.`,
                  () => doAction(() => judgeActionIntimate(caseId, judgeTeamId, 'defendant')),
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              <User className="h-3.5 w-3.5" />
              {appeal ? 'Intimar recorrido' : 'Intimar Time Réu'}
            </button>

            {/* Intimar ambos */}
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                ask(
                  'Você está prestes a intimar ambas as partes. Será gerada intimação + certidão de publicação.',
                  () => doAction(() => judgeActionIntimate(caseId, judgeTeamId, 'both')),
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              <Users className="h-3.5 w-3.5" />
              Intimar ambas as partes
            </button>

            {/* Incluir em pauta — só em 2º grau */}
            {appeal && (
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  ask(
                    'Você está prestes a incluir o processo em pauta de julgamento. Todos os participantes serão notificados.',
                    () => doAction(() => judgeActionIntimate(caseId, judgeTeamId, 'both', 'Inclusão em pauta de julgamento')),
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                Incluir em pauta
              </button>
            )}

            {/* Designar audiência */}
            <button
              type="button"
              disabled={loading}
              onClick={() => { setActionError(''); setShowHearing(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              <Calendar className="h-3.5 w-3.5" />
              Designar audiência
            </button>
          </div>
        </div>

        {/* ── Grupo B — Protocolo de documento ── */}
        <div className="px-4 pb-3 pt-2 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Protocolar documento
          </p>

          {protoError && (
            <div className="flex items-center gap-2 mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {protoError}
              <button onClick={() => setProtoError('')} className="ml-auto"><X className="h-3 w-3" /></button>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Doc type */}
            <div className="relative flex-shrink-0">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentType)}
                disabled={protoLoading}
                className="appearance-none text-sm border border-gray-300 rounded-lg pl-2.5 pr-7 py-2 bg-white focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] disabled:opacity-50 w-48"
              >
                <option value="">Tipo de ato…</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            </div>

            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !protoLoading && handleProtocol()}
              disabled={protoLoading}
              placeholder="Título do documento…"
              className="flex-1 min-w-0 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] disabled:opacity-50"
            />

            {/* File */}
            <div className="flex-shrink-0">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  if (f && f.size > 20 * 1024 * 1024) { setProtoError('Máx. 20 MB.'); return }
                  setFile(f)
                }}
                disabled={protoLoading}
                className="sr-only"
                id="judge-protocol-file"
              />
              <label
                htmlFor="judge-protocol-file"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                  file ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                } ${protoLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {file ? (
                  <>
                    <FileText className="h-4 w-4" />
                    <span className="max-w-[100px] truncate text-xs">{file.name}</span>
                    <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); if (fileRef.current) fileRef.current.value = '' }}>
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
              onClick={handleProtocol}
              disabled={protoLoading}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-[#185FA5] text-white rounded-lg text-sm font-medium hover:bg-[#134D87] disabled:opacity-50 transition-colors"
            >
              {protoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {uploading ? 'Enviando…' : protoPending ? 'Protocolando…' : 'Protocolar'}
            </button>
          </div>
        </div>

        {/* Role label */}
        <div className="px-4 pb-2 flex items-center gap-1.5 text-[10px] text-purple-500 font-medium">
          <Gavel className="h-3 w-3" />
          {appeal ? 'Painel do Time Judiciário (2º Grau)' : 'Painel do Time Juiz'}
        </div>
      </div>
    </>
  )
}
