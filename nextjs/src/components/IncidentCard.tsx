'use client'

import { useState } from 'react'
import { GitBranch, ChevronDown, ChevronRight, Bot, FileText, AlertCircle } from 'lucide-react'
import ProtocolBar from '@/components/ProtocolBar'
import DocumentDownloadButton from '@/components/DocumentDownloadButton'
import type { TeamRole, JusDocumentWithRefs } from '@/lib/jusgaming.types'
import { DOCUMENT_TYPE_LABELS } from '@/lib/jusgaming.types'

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  appeal_ai: 'Agravo de Instrumento',
  appeal_ms: 'Mandado de Segurança',
}

const TEAM_ROLE_COLORS: Record<TeamRole, string> = {
  plaintiff: 'bg-blue-100 text-blue-700 border-blue-200',
  defendant: 'bg-amber-100 text-amber-700 border-amber-200',
  judge: 'bg-purple-100 text-purple-700 border-purple-200',
}
const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  plaintiff: 'Autor',
  defendant: 'Réu',
  judge: 'Juiz',
}

const TYPE_BADGE: Record<string, string> = {
  acordao: 'bg-purple-50 text-purple-700',
  decision_monocratica: 'bg-purple-50 text-purple-700',
  complementation: 'bg-blue-50 text-blue-700',
  counterargument: 'bg-amber-50 text-amber-700',
  withdrawal: 'bg-gray-100 text-gray-600',
  petition: 'bg-blue-50 text-blue-700',
  counterclaim: 'bg-blue-50 text-blue-700',
  order: 'bg-purple-50 text-purple-700',
  decision: 'bg-purple-50 text-purple-700',
  intimation: 'bg-purple-50 text-purple-700',
  sentence: 'bg-purple-50 text-purple-700',
  minutes: 'bg-purple-50 text-purple-700',
  saneamento: 'bg-purple-50 text-purple-700',
  certificate_conclusion: 'bg-gray-100 text-gray-500',
  certificate_publication: 'bg-gray-100 text-gray-500',
  other: 'bg-gray-100 text-gray-600',
}

export interface IncidentCardData {
  id: string
  title: string
  status: string
  incident_type: string | null
  created_at: string
  documents: JusDocumentWithRefs[]
  userTeamId: string | null
  userTeamRole: TeamRole | 'professor' | null
}

interface Props {
  incident: IncidentCardData
  defaultOpen?: boolean
}

export default function IncidentCard({ incident, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  const isClosed = incident.status === 'closed'
  const isActive = incident.status === 'active'
  const incidentLabel = incident.incident_type
    ? (INCIDENT_TYPE_LABELS[incident.incident_type] ?? incident.incident_type)
    : 'Incidente'

  const canProtocol = isActive && incident.userTeamRole !== null

  // Sort docs by sequence_number ascending
  const docs = [...incident.documents].sort((a, b) => a.sequence_number - b.sequence_number)

  return (
    <div className={`bg-white rounded-lg border shadow-sm overflow-hidden ${
      isClosed ? 'border-gray-200' : 'border-gray-200'
    }`}>
      {/* ── Collapsible header ── */}
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
          isClosed ? 'bg-gray-50/60 hover:bg-gray-100/60' : 'bg-white hover:bg-gray-50'
        }`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isClosed ? 'bg-gray-100' : 'bg-orange-50'
        }`}>
          <GitBranch className={`h-4 w-4 ${isClosed ? 'text-gray-400' : 'text-orange-600'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              isClosed ? 'bg-gray-100 text-gray-500' : 'bg-orange-50 text-orange-700'
            }`}>
              {incidentLabel}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
            }`}>
              {isActive ? 'Ativo' : 'Encerrado'}
            </span>
            <span className="text-xs text-gray-400">
              {docs.length} ato{docs.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className={`font-medium text-sm mt-0.5 truncate ${isClosed ? 'text-gray-500' : 'text-gray-900'}`}>
            {incident.title}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Distribuído em{' '}
            {new Date(incident.created_at).toLocaleDateString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
            })}
          </p>
        </div>

        <div className="flex-shrink-0 text-gray-400">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div className="border-t border-gray-100">
          {/* Banner: main process continues */}
          {isActive && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              O processo principal continua em andamento enquanto este incidente tramita.
            </div>
          )}

          {/* Document mini-table */}
          {docs.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Nenhum ato neste incidente ainda.</p>
              {canProtocol && (
                <p className="text-xs mt-0.5">Use a barra abaixo para protocolar.</p>
              )}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-2 text-left font-medium text-gray-500 w-14">ID</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Ato</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 hidden md:table-cell">Tipo</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 w-32 hidden sm:table-cell">Data/Hora</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-500 w-16">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {docs.map((doc) => {
                  const isSystem = doc.uploaded_by === null
                  const teamRole = doc.teams?.role as TeamRole | undefined
                  const typeBadge = TYPE_BADGE[doc.document_type] ?? 'bg-gray-100 text-gray-600'

                  return (
                    <tr
                      key={doc.id}
                      className={isSystem ? 'bg-gray-50/60' : 'bg-white hover:bg-gray-50/40 transition-colors'}
                    >
                      {/* Seq */}
                      <td className="px-4 py-2.5 font-mono text-gray-600 font-semibold">
                        {String(doc.sequence_number).padStart(3, '0')}
                      </td>

                      {/* Title + team badge */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isSystem && (
                            <Bot className="h-3 w-3 text-gray-400 flex-shrink-0" />
                          )}
                          <p className={`font-medium leading-snug ${isSystem ? 'text-gray-500' : 'text-gray-900'} truncate`}>
                            {doc.title}
                          </p>
                        </div>
                        {teamRole && (
                          <span className={`mt-0.5 inline-block text-xs px-1.5 py-0.5 rounded border ${TEAM_ROLE_COLORS[teamRole]}`}>
                            {TEAM_ROLE_LABELS[teamRole]}
                          </span>
                        )}
                      </td>

                      {/* Doc type */}
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${typeBadge}`}>
                          {DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                        </span>
                      </td>

                      {/* Date/Time */}
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap hidden sm:table-cell">
                        {new Date(doc.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                        })}
                        {' '}
                        <span className="text-gray-400">
                          {new Date(doc.created_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </td>

                      {/* Download */}
                      <td className="px-4 py-2.5 text-center">
                        {doc.file_path ? (
                          <DocumentDownloadButton documentId={doc.id} />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* Protocol bar — only for active incidents with a known team role */}
          {canProtocol && (
            <ProtocolBar
              caseId={incident.id}
              teamId={incident.userTeamId}
              teamRole={incident.userTeamRole as TeamRole | 'professor'}
              isIncident={true}
              instanceId={incident.id}
            />
          )}

          {/* Closed footer */}
          {isClosed && (
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
              Este incidente foi encerrado.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
