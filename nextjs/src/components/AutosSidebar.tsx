'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Gavel, Mail, GitBranch, Users, ChevronRight, Star, MessageSquarePlus, ClipboardList } from 'lucide-react'
import type { CaseUserContext } from '@/app/dashboard/casos/[id]/layout'
import type { CaseType, InstanceLevel, TeamRole } from '@/lib/jusgaming.types'

const ROLE_LABELS: Record<TeamRole, { label: string; color: string }> = {
  plaintiff: { label: 'Time Autor', color: 'bg-blue-100 text-blue-700' },
  defendant: { label: 'Time Réu', color: 'bg-amber-100 text-amber-700' },
  judge: { label: 'Time Juiz', color: 'bg-purple-100 text-purple-700' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-gray-100 text-gray-600' },
  active: { label: 'Ativo', color: 'bg-green-100 text-green-700' },
  closed: { label: 'Encerrado', color: 'bg-gray-200 text-gray-500' },
}

const INSTANCE_LABELS: Record<InstanceLevel, string> = {
  first: '1ª Instância',
  appeal: '2ª Instância',
  arbitral: 'Câmara Arbitral',
  appeal_interlocutory: '2º Grau — AI',
  appeal_sentence: '2º Grau — Apelação',
}

const TYPE_LABELS: Record<CaseType, string> = {
  civil: 'Cível',
  arbitration: 'Arbitragem',
}

interface OtherCase {
  id: string
  title: string
  status: string
  teamRole: TeamRole | null
}

interface Props {
  ctx: CaseUserContext
  courseName: string
  otherCases: OtherCase[]
  caseType: CaseType
  instanceLevel: InstanceLevel
}

export default function AutosSidebar({
  ctx,
  courseName,
  otherCases,
  caseType,
  instanceLevel,
}: Props) {
  const pathname = usePathname()
  const base = `/dashboard/casos/${ctx.caseId}`

  const evalHref = ctx.isProfessor
    ? `/dashboard/professor/casos/${ctx.caseId}/avaliar`
    : `${base}/avaliacoes`
  const evalLabel = ctx.isProfessor ? 'Avaliar Peças' : 'Avaliações'

  const navItems = [
    { href: `${base}/autos`, label: 'Autos', icon: Gavel, badge: 0, external: false },
    // Painel do Juiz — only visible to judge team members
    ...(ctx.userTeamRole === 'judge' ? [
      { href: `${base}/juiz`, label: 'Painel do Juiz', icon: ClipboardList, badge: 0, external: false },
    ] : []),
    { href: `${base}/incidentes`, label: 'Incidentes', icon: GitBranch, badge: ctx.activeIncidentCount, external: false },
    { href: evalHref, label: evalLabel, icon: ctx.isProfessor ? ClipboardList : Star, badge: 0, external: ctx.isProfessor },
    { href: `${base}/cliente`, label: 'E-mails do Cliente', icon: Mail, badge: 0, external: false },
    { href: `${base}/times`, label: 'Times', icon: Users, badge: 0, external: false },
  ]

  const status = STATUS_LABELS[ctx.caseStatus] ?? STATUS_LABELS.draft

  return (
    <div className="flex flex-col h-full">
      {/* Case header */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {courseName}
          </p>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${status.color}`}>
            {status.label}
          </span>
        </div>
        <h2 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-3">
          {ctx.caseTitle}
        </h2>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-xs text-gray-400">{TYPE_LABELS[caseType]}</span>
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-400">{INSTANCE_LABELS[instanceLevel]}</span>
        </div>
      </div>

      {/* User role badge */}
      <div className="px-4 py-3 border-b border-gray-100">
        {ctx.isProfessor ? (
          <span className="text-xs px-2 py-1 rounded-full bg-[#185FA5]/10 text-[#185FA5] font-medium">
            Professor(a)
          </span>
        ) : ctx.userTeamRole ? (
          <div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_LABELS[ctx.userTeamRole].color}`}>
              {ROLE_LABELS[ctx.userTeamRole].label}
            </span>
            {ctx.userTeamName && (
              <p className="text-xs text-gray-400 mt-1">{ctx.userTeamName}</p>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400">Observador</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, badge, external }) => {
          // For external links (professor avaliar), active = pathname starts with the href
          const active = external
            ? pathname.startsWith(href)
            : pathname === href || pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? 'bg-[#185FA5] text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate flex-1">{label}</span>
              {badge > 0 && (
                <span className={`flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1 leading-none ${
                  active ? 'bg-white/30 text-white' : 'bg-orange-500 text-white'
                }`}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </Link>
          )
        })}

        {/* Professor-only extra links */}
        {ctx.isProfessor && (
          <>
            <Link
              href={`/dashboard/professor/casos/${ctx.caseId}/fato-novo`}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors mt-1 ${
                pathname.startsWith(`/dashboard/professor/casos/${ctx.caseId}/fato-novo`)
                  ? 'bg-[#185FA5] text-white font-medium'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`}
            >
              <MessageSquarePlus className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Fato Novo</span>
            </Link>
            <Link
              href={`/dashboard/professor/casos/${ctx.caseId}/times`}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                pathname.startsWith(`/dashboard/professor/casos/${ctx.caseId}/times`)
                  ? 'bg-[#185FA5] text-white font-medium'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`}
            >
              <Users className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Gerenciar Times</span>
            </Link>
          </>
        )}
      </nav>

      {/* Other cases */}
      {otherCases.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Outros casos
          </p>
          <div className="space-y-1">
            {otherCases.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/casos/${c.id}/autos`}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                <span className="truncate line-clamp-2">{c.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
