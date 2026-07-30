import { Bell } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { api } from '#/lib/api.ts'
import type { Notification } from '#/lib/notifications.ts'

const PREVIEW_COUNT = 5

const POLL_INTERVAL_MS = 10_000

export function NotificationBell() {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<Array<Notification>>('/api/notifications')).data,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const notifications = data ?? []
  const unreadCount = notifications.filter((n) => !n.read).length

  async function markRead(id: number) {
    await api.post(`/api/notifications/${id}/read`)
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  async function markAllRead() {
    await api.post('/api/notifications/read-all')
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Mark all as read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
        )}
        {notifications.slice(0, PREVIEW_COUNT).map((n) => (
          <DropdownMenuItem key={n.id} asChild onSelect={() => !n.read && markRead(n.id)}>
            <Link
              to="/dashboard/shipments/$shipmentId"
              params={{ shipmentId: String(n.shipment_id) }}
              className="flex flex-col items-start gap-0.5 whitespace-normal"
            >
              <span className={n.read ? 'text-muted-foreground' : 'font-medium'}>
                {n.message}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/dashboard/notifications" className="justify-center text-sm font-medium">
                View all notifications
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
