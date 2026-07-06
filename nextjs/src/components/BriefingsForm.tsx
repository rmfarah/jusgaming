'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { updateCaseBriefs, saveCaseAsTemplate, activateCase, uploadCaseMaterial, deleteCaseMaterial } from '@/lib/actions/cases'
import type { TeamRole, InstanceLevel } from '@/lib/jusgaming.types'
import { isAppealLevel } from '@/lib/jusgaming.types'
import type { CaseMaterial } from '@/app/dashboard/professor/casos/[id]/briefings/page'
import {
  Scale, BookOpen, Gavel, CheckCircle2, Loader2, AlertCircle,
  BookMarked, Zap, ChevronDown, ChevronUp, Paperclip, X, Upload, FileText,
} from 'lucide-react'

interface Team {
  id: string
  role: TeamRole
  name: string
}

interface Props {
  caseId: string
  caseTitle: string
  instanceLevel?: InstanceLevel
  initialBriefs: {
    plaintiff_brief: string | null
    defendant_brief: string | null
    judge_brief: string | null
    plaintiff_email_subject: string | null
    defendant_email_subject: string | null
  }
  teams: Team[]
  initialMaterials: CaseMaterial[]
  isEditable: boolean
}

const ROLE_CONFIG = {
  plaintiff: {
    key: 'plaintiff_brief' as const,
    subjectKey: 'plaintiff_email_subject' as const,
    defaultSubject: 'Preciso da sua ajuda urgente',
    label: 'Time Autor',
    subjectLabel: 'Assunto do e-mail (Time Autor)',
    description: 'E-mail que o Time Autor receberá ao ser ativado o caso.',
    accentColor: 'border-blue-400',
    bgColor: 'bg-blue-50',
    headerText: 'text-blue-700',
    icon: Scale,
    placeholder: 'Ex.: Vocês representam o autor. Protocole a petição inicial apontando o descumprimento contratual e requerendo indenização por danos materiais.',
    hasSubject: true,
  },
  defendant: {
    key: 'defendant_brief' as const,
    subjectKey: 'defendant_email_subject' as const,
    defaultSubject: 'Você foi citado — precisamos conversar',
    label: 'Time Réu',
    subjectLabel: 'Assunto do e-mail (Time Réu)',
    description: 'E-mail que o Time Réu receberá quando o juiz determinar a citação.',
    accentColor: 'border-amber-400',
    bgColor: 'bg-amber-50',
    headerText: 'text-amber-700',
    icon: BookOpen,
    placeholder: 'Ex.: Vocês representam o réu. Aguardem a petição inicial e apresentem contestação refutando os fatos narrados pelo autor.',
    hasSubject: true,
  },
  judge: {
    key: 'judge_brief' as const,
    subjectKey: null,
    defaultSubject: null,
    label: 'Time Juiz',
    subjectLabel: null,
    description: 'Briefing que o Time Juiz receberá ao ser ativado o caso.',
    accentColor: 'border-purple-400',
    bgColor: 'bg-purple-50',
    headerText: 'text-purple-700',
    icon: Gavel,
    placeholder: 'Ex.: Vocês são os magistrados. Conduzam o processo, defira os requerimentos cabíveis, profira decisões interlocutórias e, ao final, a sentença.',
    hasSubject: false,
  },
}

type RoleKey = keyof typeof ROLE_CONFIG

// ── Per-team document uploader ────────────────────────────────────────────────
function TeamMaterialSection({
  caseId,
  team,
  materials,
  isEditable,
  onUploaded,
  onDeleted,
}: {
  caseId: string
  team: Team
  materials: CaseMaterial[]
  isEditable: boolean
  onUploaded: (doc: CaseMaterial) => void
  onDeleted: (id: string) => void
}) {
  const [open, setOpen] = useState(materials.length > 0)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setUploadError('')
    setUploading(true)
    try {
      const formData = new FormData(e.currentTarget)
      const result = await uploadCaseMaterial(caseId, team.id, formData)
      if (result.error) {
        setUploadError(result.error)
      } else if (result.documentId) {
        // Optimistically add the new material
        const file = formData.get('file') as File
        const title = (formData.get('title') as string)?.trim() || file?.name || 'Arquivo'
        onUploaded({
          id: result.documentId,
          title,
          file_path: `case-materials/${caseId}/${team.id}/...`,
          created_at: new Date().toISOString(),
          team_id: team.id,
        })
        formRef.current?.reset()
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao fazer upload.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId: string) => {
    setDeletingId(docId)
    const result = await deleteCaseMaterial(docId)
    if (!result.error) {
      onDeleted(docId)
    }
    setDeletingId(null)
  }

  return (
    <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors bg-gray-50/50"
      >
        <Paperclip className="h-3.5 w-3.5 text-gray-400" />
        <span className="font-medium">Documentos do caso</span>
        {materials.length > 0 && (
          <span className="ml-1 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
            {materials.length}
          </span>
        )}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 ml-auto text-gray-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 ml-auto text-gray-400" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-2 space-y-2 border-t border-gray-100">
          {/* Existing materials */}
          {materials.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {materials.map((mat) => (
                <li key={mat.id} className="flex items-center gap-2 text-sm bg-white border border-gray-100 rounded-md px-2.5 py-1.5">
                  <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <span className="flex-1 truncate text-gray-700 font-medium">{mat.title}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                    {new Date(mat.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </span>
                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => handleDelete(mat.id)}
                      disabled={deletingId === mat.id}
                      className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Remover arquivo"
                    >
                      {deletingId === mat.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Upload form (editable only) */}
          {isEditable && (
            <form ref={formRef} onSubmit={handleUpload} className="space-y-2">
              <input
                type="text"
                name="title"
                placeholder="Título do documento (ex.: Contrato de Honorários)"
                className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
              />
              <div className="flex gap-2">
                <input
                  type="file"
                  name="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  required
                  className="flex-1 text-xs text-gray-500 file:mr-2 file:text-xs file:border-0 file:bg-gray-100 file:text-gray-700 file:rounded file:px-2 file:py-1 file:cursor-pointer cursor-pointer"
                />
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-white text-xs font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors flex-shrink-0"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploading ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
              <p className="text-xs text-gray-400">PDF, DOC, DOCX ou imagem — máx. 20 MB. Visível apenas para este time.</p>
              {uploadError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {uploadError}
                </p>
              )}
            </form>
          )}

          {!isEditable && materials.length === 0 && (
            <p className="text-xs text-gray-400 py-1 text-center">Nenhum documento fornecido para este time.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────
export default function BriefingsForm({
  caseId,
  caseTitle,
  instanceLevel,
  initialBriefs,
  teams,
  initialMaterials,
  isEditable,
}: Props) {
  const router = useRouter()
  const isAppeal = instanceLevel ? isAppealLevel(instanceLevel) : false

  // Labels mudam pelo grau (1º x 2º)
  const roleConfig = {
    plaintiff: {
      ...ROLE_CONFIG.plaintiff,
      label: isAppeal ? 'Time Autor (Recorrente)' : 'Time Autor',
      subjectLabel: isAppeal
        ? 'Assunto do e-mail (ex-advogados → Time Autor)'
        : 'Assunto do e-mail (cliente → Time Autor)',
      defaultSubject: isAppeal
        ? 'Substabelecimento sem reserva — Recurso de Apelação'
        : 'Preciso da sua ajuda urgente',
      description: isAppeal
        ? 'E-mail que os advogados anteriores mandarão ao Time Autor com substabelecimento e documentos do processo.'
        : 'E-mail que o cliente mandará ao Time Autor na ativação do caso.',
      placeholder: isAppeal
        ? 'Ex.: Prezados colegas, substabelecemos sem reserva de poderes os presentes autos em favor de VVSas. Segue em anexo a sentença recorrida e as peças principais do processo...'
        : 'Ex.: Boa tarde! Fui indicado por um amigo. Preciso de ajuda com um contrato que não foi cumprido...',
    },
    defendant: {
      ...ROLE_CONFIG.defendant,
      label: isAppeal ? 'Time Réu (Recorrido)' : 'Time Réu',
      subjectLabel: isAppeal
        ? 'Assunto do e-mail (ex-advogados → Time Réu)'
        : 'Assunto do e-mail (cliente → Time Réu)',
      defaultSubject: isAppeal
        ? 'Substabelecimento sem reserva — Recurso de Apelação'
        : 'Você foi citado — precisamos conversar',
      description: isAppeal
        ? 'E-mail que os advogados anteriores mandarão ao Time Réu com substabelecimento e documentos do processo.'
        : 'E-mail que o cliente mandará ao Time Réu quando o juiz determinar a citação.',
      placeholder: isAppeal
        ? 'Ex.: Prezados colegas, substabelecemos sem reserva de poderes a defesa do réu nos presentes autos. Seguem as peças do processo e a sentença recorrida...'
        : 'Ex.: Recebi uma intimação e não sei o que fazer. Fui informado que preciso me defender judicialmente...',
    },
    judge: {
      ...ROLE_CONFIG.judge,
      label: isAppeal ? 'Time Judiciário (Câmara)' : 'Time Juiz',
      description: isAppeal
        ? 'Briefing do Time Judiciário na ativação — contexto do processo recursal.'
        : 'Briefing que o Time Juiz receberá ao ser ativado o caso.',
      placeholder: isAppeal
        ? 'Ex.: Vocês compõem a Câmara de Direito Privado. O recurso foi distribuído para julgamento. Analisem as peças, realizem as intimações necessárias e profira o acórdão...'
        : 'Ex.: Vocês são os magistrados. Conduzam o processo, profira decisões interlocutórias e, ao final, a sentença.',
    },
  } as typeof ROLE_CONFIG

  const [briefs, setBriefs] = useState({
    plaintiff_brief: initialBriefs.plaintiff_brief ?? '',
    defendant_brief: initialBriefs.defendant_brief ?? '',
    judge_brief: initialBriefs.judge_brief ?? '',
    plaintiff_email_subject: initialBriefs.plaintiff_email_subject ?? '',
    defendant_email_subject: initialBriefs.defendant_email_subject ?? '',
  })

  // Per-team materials state (keyed by team_id)
  const [materials, setMaterials] = useState<Record<string, CaseMaterial[]>>(() => {
    const map: Record<string, CaseMaterial[]> = {}
    for (const t of teams) map[t.id] = []
    for (const m of initialMaterials) {
      if (!map[m.team_id]) map[m.team_id] = []
      map[m.team_id].push(m)
    }
    return map
  })

  const [saveError, setSaveError] = useState('')
  const [activateError, setActivateError] = useState('')
  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isActivating, setIsActivating] = useState(false)

  // Template state
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [templateTitle, setTemplateTitle] = useState(caseTitle)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)
  const [templateError, setTemplateError] = useState('')

  const updateBrief = (role: RoleKey, value: string) => {
    setBriefs((prev) => ({ ...prev, [ROLE_CONFIG[role].key]: value }))
    setSaved(false)
  }

  const updateSubject = (role: 'plaintiff' | 'defendant', value: string) => {
    const key = role === 'plaintiff' ? 'plaintiff_email_subject' : 'defendant_email_subject'
    setBriefs((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const allBriefs = () => ({
    plaintiff_brief: briefs.plaintiff_brief,
    defendant_brief: briefs.defendant_brief,
    judge_brief: briefs.judge_brief,
    plaintiff_email_subject: briefs.plaintiff_email_subject,
    defendant_email_subject: briefs.defendant_email_subject,
  })

  const handleSave = async () => {
    setSaveError('')
    setSaved(false)
    setIsSaving(true)
    try {
      const result = await updateCaseBriefs(caseId, allBriefs())
      if (result?.error) setSaveError(result.error)
      else setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!templateTitle.trim()) { setTemplateError('Informe um título para o modelo.'); return }
    setTemplateError('')
    setIsSavingTemplate(true)
    try {
      await updateCaseBriefs(caseId, allBriefs())
      const result = await saveCaseAsTemplate(caseId, templateTitle.trim())
      if (result?.error) setTemplateError(result.error)
      else {
        setTemplateSaved(true)
        setShowTemplateForm(false)
        setTimeout(() => setTemplateSaved(false), 3000)
      }
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Erro ao salvar modelo.')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const handleActivate = async () => {
    setActivateError('')
    setIsActivating(true)
    try {
      const saveResult = await updateCaseBriefs(caseId, allBriefs())
      if (saveResult?.error) { setActivateError(saveResult.error); return }

      const result = await activateCase(caseId)
      if (result?.error) setActivateError(result.error)
      else router.push('/dashboard/professor/casos')
    } catch (err) {
      setActivateError(err instanceof Error ? err.message : 'Erro ao ativar caso.')
    } finally {
      setIsActivating(false)
    }
  }

  // Helper: find team by role
  const teamByRole = (role: TeamRole) => teams.find((t) => t.role === role)

  return (
    <div className="space-y-5">
      {/* Brief + material cards, one per role */}
      {(Object.keys(roleConfig) as RoleKey[]).map((role) => {
        const config = roleConfig[role]
        const Icon = config.icon
        const value = briefs[config.key]
        const team = teamByRole(role)
        const teamMaterials = team ? (materials[team.id] ?? []) : []

        return (
          <div
            key={role}
            className={`rounded-xl border-2 ${isEditable ? config.accentColor : 'border-gray-200'} bg-white overflow-hidden`}
          >
            {/* Card header */}
            <div className={`px-4 py-3 ${isEditable ? config.bgColor : 'bg-gray-50'} border-b border-gray-100`}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-gray-600" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {config.label}
                </span>
                {value.trim() && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">{config.description}</p>
            </div>

            {/* Brief textarea + subject input */}
            <div className="px-4 pt-3 space-y-3">
              {/* Subject field — only for plaintiff and defendant */}
              {config.hasSubject && config.subjectKey && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {config.subjectLabel}
                  </label>
                  {isEditable ? (
                    <input
                      type="text"
                      value={briefs[config.subjectKey] ?? ''}
                      onChange={(e) => updateSubject(role as 'plaintiff' | 'defendant', e.target.value)}
                      placeholder={config.defaultSubject ?? ''}
                      className="w-full text-sm bg-white rounded-md border border-gray-200 px-3 py-2 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                    />
                  ) : (
                    <p className="text-sm text-gray-700 font-medium">
                      {briefs[config.subjectKey] || <span className="text-gray-400 italic">{config.defaultSubject}</span>}
                    </p>
                  )}
                </div>
              )}

              {/* Body textarea */}
              <div>
                {config.hasSubject && (
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Mensagem do cliente (corpo do e-mail)
                  </label>
                )}
                {isEditable ? (
                  <textarea
                    value={value}
                    onChange={(e) => updateBrief(role, e.target.value)}
                    placeholder={config.placeholder}
                    rows={4}
                    className="w-full text-sm bg-gray-50 rounded-md border border-gray-200 px-3 py-2 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] resize-y"
                  />
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {value || <span className="text-gray-400 italic">Não configurado — será enviada mensagem padrão.</span>}
                  </p>
                )}
                {isEditable && !value.trim() && (
                  <p className="text-xs text-gray-400 mt-1">
                    Se deixado em branco, será enviada uma mensagem padrão ao ativar o caso.
                  </p>
                )}
              </div>
            </div>

            {/* Document section (per team) */}
            {team && (
              <div className="px-4 pb-4">
                <TeamMaterialSection
                  caseId={caseId}
                  team={team}
                  materials={teamMaterials}
                  isEditable={isEditable}
                  onUploaded={(doc) =>
                    setMaterials((prev) => ({
                      ...prev,
                      [team.id]: [...(prev[team.id] ?? []), doc],
                    }))
                  }
                  onDeleted={(id) =>
                    setMaterials((prev) => ({
                      ...prev,
                      [team.id]: (prev[team.id] ?? []).filter((m) => m.id !== id),
                    }))
                  }
                />
              </div>
            )}
          </div>
        )
      })}

      {/* Errors */}
      {saveError && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {saveError}
        </div>
      )}
      {activateError && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {activateError}
        </div>
      )}

      {/* Template section */}
      {isEditable && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => { setShowTemplateForm((v) => !v); setTemplateError('') }}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <BookMarked className="h-4 w-4 text-gray-400" />
            <span className="font-medium">Salvar como modelo na biblioteca</span>
            {templateSaved && (
              <span className="ml-auto flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Salvo!
              </span>
            )}
            {!templateSaved && (
              showTemplateForm
                ? <ChevronUp className="h-4 w-4 ml-auto text-gray-400" />
                : <ChevronDown className="h-4 w-4 ml-auto text-gray-400" />
            )}
          </button>

          {showTemplateForm && (
            <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500 mt-3 mb-2">
                Salva tipo, instância, regras de arbitragem e briefings como modelo reutilizável na sua biblioteca pessoal.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  placeholder="Nome do modelo…"
                  className="flex-1 text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5] bg-white"
                />
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={isSavingTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#185FA5] text-white text-sm font-medium rounded-md hover:bg-[#134D87] disabled:opacity-50 transition-colors"
                >
                  {isSavingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookMarked className="h-3.5 w-3.5" />}
                  Salvar
                </button>
              </div>
              {templateError && (
                <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {templateError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {isEditable && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saved && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {isSaving ? 'Salvando…' : saved ? 'Salvo!' : 'Salvar rascunho'}
          </button>

          <button
            type="button"
            onClick={handleActivate}
            disabled={isActivating}
            className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isActivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {isActivating ? 'Ativando…' : 'Ativar caso'}
          </button>
        </div>
      )}
    </div>
  )
}
