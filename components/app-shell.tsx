'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

import type { User } from '@supabase/supabase-js'

import { SidebarProvider } from '@/components/ui/sidebar'

import ArtifactRoot from './artifact/artifact-root'
import AppSidebar from './app-sidebar'
import Header from './header'
import { KeyboardShortcutHandler } from './keyboard-shortcut-handler'

export function AppShell({
  children,
  user,
  hasUser
}: {
  children: React.ReactNode
  user: User | null
  hasUser: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()
  const isQuestionPlatform =
    pathname === '/' ||
    pathname === '/ask' ||
    pathname === '/qa' ||
    pathname?.startsWith('/admin')

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(id)
  }, [])

  if (!mounted || isQuestionPlatform) {
    return (
      <div className="h-dvh min-h-0 w-full overflow-hidden">{children}</div>
    )
  }

  return (
    <SidebarProvider defaultOpen={false}>
      {hasUser && <AppSidebar />}
      <KeyboardShortcutHandler />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} />
        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <ArtifactRoot>{children}</ArtifactRoot>
        </main>
      </div>
    </SidebarProvider>
  )
}
