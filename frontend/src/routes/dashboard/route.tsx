import { useEffect } from 'react'
import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'

import { AppSidebar } from '#/components/app-sidebar.tsx'
import { NotificationBell } from '#/components/notification-bell.tsx'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '#/components/ui/sidebar.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import { useAuth } from '#/lib/auth.tsx'

export const Route = createFileRoute('/dashboard')({ component: DashboardLayout })

function DashboardLayout() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isAuthenticated, navigate])

  if (!isAuthenticated) return null

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm font-medium">ChainTrack</span>
          </div>
          <NotificationBell />
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
