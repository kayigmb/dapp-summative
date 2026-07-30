import { Link, useMatchRoute } from '@tanstack/react-router'
import { Building2, Gauge, LayoutDashboard, LogOut, Users, UserRound } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '#/components/ui/sidebar.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import { isAdminRole, useAuth } from '#/lib/auth.tsx'

const NAV_ITEMS = [
  { to: '/dashboard/shipments', label: 'Shipments', icon: LayoutDashboard },
  { to: '/dashboard/profile', label: 'Profile', icon: UserRound },
] as const

export function AppSidebar() {
  const { user, logout } = useAuth()
  const matchRoute = useMatchRoute()
  const admin = isAdminRole(user?.role)
  const navItems = admin
    ? [
        { to: '/dashboard', label: 'Dashboard', icon: Gauge },
        ...NAV_ITEMS,
        { to: '/dashboard/users', label: 'Users', icon: Users },
        {
          to: '/dashboard/organizations',
          label: user?.role === 'super_admin' ? 'Organizations' : 'My Organization',
          icon: Building2,
        },
      ]
    : NAV_ITEMS

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            CT
          </span>
          <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
            ChainTrack
          </span>
        </Link>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={!!matchRoute({ to: item.to, fuzzy: false })}
                    tooltip={item.label}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="cursor-default" tooltip={user?.email}>
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase">
                {user?.name?.slice(0, 2) ?? '??'}
              </span>
              <span className="flex min-w-0 flex-col text-left">
                <span className="truncate text-sm">{user?.name}</span>
                <span className="truncate text-xs text-muted-foreground capitalize">
                  {user?.role}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Log out" onClick={logout}>
              <LogOut />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
