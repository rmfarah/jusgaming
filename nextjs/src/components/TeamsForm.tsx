'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveTeams, type TeamInput } from '@/lib/actions/cases'
import type { TeamRole } from '@/lib/jusgaming.types'
import { Users, CheckCircle2, Circle, Loader2, AlertCircle, Gavel, Scale, BookOpen, ArrowRight } from 'lucide-react'

interface TeamData {
  id: string
  role: TeamRole
  name: string
  memberIds: string[]
}

interface Student {
  id: string
  full_name: string
  email: string
}

interface Props {
  caseId: string
  teams: TeamData[]
  students: Student[]
  isEditable: boolean
}

const ROLE_CONFIG: Record<TeamRole, {
  label: string
  description: string
  accentColor: string
  bgColor: string
  icon: React.ComponentType<{ className?: string }>
}> = {
  plaintiff: {
    label: 'Time Autor',
    description: 'Protocola a petição inicial e conduz o polo ativo.',
    accentColor: 'border-blue-400',
    bgColor: 'bg-blue-50',
    icon: Scale,
  },
  defendant: {
    label: 'Time Réu',
    description: 'Apresenta a contestação e defende o polo passivo.',
    accentColor: 'border-amber-400',
    bgColor: 'bg-amber-50',
    icon: BookOpen,
  },
  judge: {
    label: 'Time Juiz',
    description: 'Conduz o processo, profere decisões e a sentença.',
    accentColor: 'border-purple-400',
    bgColor: 'bg-purple-50',
    icon: Gavel,
  },
}

export default function TeamsForm({ caseId, teams: initialTeams, students, isEditable }: Props) {
  const router = useRouter()
  const [teams, setTeams] = useState<TeamData[]>(initialTeams)
  const [saveError, setSaveError] = useState('')
  const [nextError, setNextError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, startSave] = useTransition()
  const [navigating, startNavigate] = useTransition()

  const updateTeamName = (teamId: string, name: string) => {
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, name } : t)))
    setSaved(false)
  }

  const toggleMember = (teamId: string, studentId: string) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t
        const has = t.memberIds.includes(studentId)
        return {
          ...t,
          memberIds: has ? t.memberIds.filter((id) => id !== studentId) : [...t.memberIds, studentId],
        }
      }),
    )
    setSaved(false)
  }

  const handleSave = () => {
    setSaveError('')
    setSaved(false)
    startSave(async () => {
      const payload: TeamInput[] = teams.map((t) => ({
        id: t.id,
        name: t.name,
        memberIds: t.memberIds,
      }))
      const result = await saveTeams(caseId, payload)
      if (result.error) {
        setSaveError(result.error)
      } else {
        setSaved(true)
      }
    })
  }

  const handleNext = () => {
    setNextError('')
    setSaveError('')
    startNavigate(async () => {
      // Salvar times automaticamente antes de ir para briefings
      const payload: TeamInput[] = teams.map((t) => ({
        id: t.id,
        name: t.name,
        memberIds: t.memberIds,
      }))
      const saveResult = await saveTeams(caseId, payload)
      if (saveResult.error) {
        setNextError(saveResult.error)
        return
      }
      router.push(`/dashboard/professor/casos/${caseId}/briefings`)
    })
  }

  // Compute validation for activate button
  const allTeamsReady = teams.every((t) => t.memberIds.length >= 1)
  const assignedStudentIds = new Set(teams.flatMap((t) => t.memberIds))

  return (
    <div className="space-y-6">
      {/* Team cards */}
      <div className="grid gap-5 md:grid-cols-3">
        {teams.map((team) => {
          const config = ROLE_CONFIG[team.role]
          const Icon = config.icon
          return (
            <div
              key={team.id}
              className={`rounded-xl border-2 ${isEditable ? config.accentColor : 'border-gray-200'} bg-white overflow-hidden`}
            >
              {/* Card header */}
              <div className={`px-4 py-3 ${isEditable ? config.bgColor : 'bg-gray-50'} border-b border-gray-100`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-gray-600" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {config.label}
                  </span>
                  <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
                    team.memberIds.length >= 1
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {team.memberIds.length} membro{team.memberIds.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {isEditable ? (
                  <input
                    type="text"
                    value={team.name}
                    onChange={(e) => updateTeamName(team.id, e.target.value)}
                    placeholder="Nome do time"
                    className="w-full text-sm font-medium bg-white rounded-md border border-gray-200 px-2.5 py-1.5 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-800">{team.name}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">{config.description}</p>
              </div>

              {/* Member list */}
              <div className="px-4 py-3 space-y-1 max-h-64 overflow-y-auto">
                {students.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 text-center">Nenhum aluno na turma</p>
                ) : (
                  students.map((student) => {
                    const isMember = team.memberIds.includes(student.id)
                    const isInOtherTeam =
                      assignedStudentIds.has(student.id) && !isMember

                    if (!isEditable && !isMember) return null

                    return (
                      <button
                        key={student.id}
                        type="button"
                        disabled={!isEditable || isInOtherTeam}
                        onClick={() => toggleMember(team.id, student.id)}
                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors text-sm ${
                          isMember
                            ? 'bg-green-50 text-green-800'
                            : isInOtherTeam
                              ? 'opacity-40 cursor-not-allowed text-gray-500'
                              : 'hover:bg-gray-50 text-gray-700 cursor-pointer'
                        } ${!isEditable ? 'cursor-default' : ''}`}
                      >
                        {isMember ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-gray-300 flex-shrink-0" />
                        )}
                        <span className="truncate font-medium">{student.full_name}</span>
                        {isInOtherTeam && (
                          <span className="ml-auto text-xs text-gray-400 flex-shrink-0">outro time</span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>

              {/* Min-member warning */}
              {isEditable && team.memberIds.length === 0 && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Adicione pelo menos 1 membro para ativar
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <Users className="h-4 w-4" />
        <span>
          {assignedStudentIds.size} de {students.length} aluno{students.length !== 1 ? 's' : ''} alocado{assignedStudentIds.size !== 1 ? 's' : ''}
        </span>
        {students.length > 0 && students.length - assignedStudentIds.size > 0 && (
          <span className="text-amber-500">
            · {students.length - assignedStudentIds.size} sem time
          </span>
        )}
      </div>

      {/* Error messages */}
      {saveError && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {saveError}
        </div>
      )}
      {nextError && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {nextError}
        </div>
      )}

      {/* Actions */}
      {isEditable && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saved && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            {saving ? 'Salvando…' : saved ? 'Salvo!' : 'Salvar times'}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={navigating || !allTeamsReady}
            title={!allTeamsReady ? 'Cada time precisa ter pelo menos 1 membro' : undefined}
            className="flex items-center gap-2 px-5 py-2 bg-[#185FA5] text-white rounded-lg text-sm font-medium hover:bg-[#134D87] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {navigating && <Loader2 className="h-4 w-4 animate-spin" />}
            {navigating ? 'Salvando…' : (
              <>
                Próximo: Briefings
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
