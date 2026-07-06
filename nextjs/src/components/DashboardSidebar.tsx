'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Users, LogOut, Menu, X, Scale, Gavel, Library, Bell } from 'lucide-react'
import { createSPAClient, createSPASassClient } from '@/lib/supabase/client'
import type { JusUser } from '@/lib/jusgaming.types'

interface Props {
  user: JusUser
}

export default function DashboardSidebar({ user }: Props) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const pathname = usePathname()

  // Fetch unread notification count on mount
  useEffect(() => {
    let cancelled = false
    const fetchUnread = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = createSPAClient() as any
        const isProf = user.role === 'professor' || user.role === 'admin'

        if (isProf) {
          // Professors see broadcast notifications (recipient_team_id IS NULL)
          // — these are created when a team files an AI or MS incident request
          const { count } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .is('recipient_team_id', null)
            .is('read_at', null)

          if (!cancelled) setUnreadCount(count ?? 0)
          return
        }

        // Students: check team-based notifications
        const { data: teamMemberships } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id)

        const teamIds = (teamMemberships ?? []).map((m: { team_id: string }) => m.team_id)
        if (teamIds.length === 0 || cancelled) return

        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .in('recipient_team_id', teamIds)
          .is('read_at', null)

        if (!cancelled) setUnreadCount(count ?? 0)
      } catch {
        // silent fail
      }
    }
    fetchUnread()
    return () => { cancelled = true }
  }, [user.id, user.role])

  const isProfessor = user.role === 'professor' || user.role === 'admin'

  const navItems = isProfessor
    ? [
        { href: '/dashboard/professor', label: 'Minhas Turmas', icon: Users },
        { href: '/dashboard/professor/casos', label: 'Casos', icon: Gavel },
        { href: '/dashboard/professor/biblioteca', label: 'Biblioteca', icon: Library },
      ]
    : [{ href: '/dashboard/aluno', label: 'Meus Casos', icon: BookOpen }]

  const handleLogout = async () => {
    const client = await createSPASassClient()
    await client.logout()
  }

  const initials = user.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center gap-2 px-5 border-b border-blue-800">
        <Scale className="h-5 w-5 text-blue-200" />
        <span className="text-white font-bold tracking-wide text-lg">JusGaming</span>
        <div className="ml-auto flex items-center gap-1">
          {/* Notification bell */}
          <div className="relative">
            <span className="inline-flex items-center justify-center p-1.5 rounded-md text-blue-200 hover:text-white hover:bg-white/10 transition-colors">
              <Bell className="h-4 w-4" />
            </span>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-blue-200 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* User info */}
      <div className="px-5 py-4 border-b border-blue-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-400 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user.full_name}</p>
            <p className="text-xs text-blue-300 truncate">{user.email}</p>
          </div>
        </div>
        <span className="mt-2 inline-block text-xs px-2 py-0.5 rounded-full bg-blue-800 text-blue-200 capitalize">
          {user.role === 'professor' ? 'Professor(a)' : user.role === 'admin' ? 'Admin' : 'Aluno(a)'}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          // Exact match for professor root to avoid false-active on sub-routes
          const active =
            href === '/dashboard/professor'
              ? pathname === href || pathname.startsWith('/dashboard/professor/turmas')
              : pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/20 text-white'
                  : 'text-blue-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-5">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-blue-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 rounded-md bg-[#185FA5] text-white shadow-md"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — mobile drawer + desktop fixed */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 bg-[#185FA5] z-50 transform transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent />
      </aside>
    </>
  )
}
