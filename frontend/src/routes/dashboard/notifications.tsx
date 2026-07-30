import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '#/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { api } from '#/lib/api.ts'
import type { Notification } from '#/lib/notifications.ts'
import { cn } from '#/lib/utils.ts'

export const Route = createFileRoute('/dashboard/notifications')({
  component: NotificationsPage,
})

function NotificationsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<Array<Notification>>('/api/notifications')).data,
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
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {notifications.length} notification{notifications.length === 1 ? '' : 's'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!isLoading && notifications.length === 0 && (
            <p className="text-sm text-muted-foreground">You have no notifications yet.</p>
          )}

          {notifications.map((n) => (
            <Link
              key={n.id}
              to="/dashboard/shipments/$shipmentId"
              params={{ shipmentId: String(n.shipment_id) }}
              onClick={() => !n.read && markRead(n.id)}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 rounded-md border-b px-2 py-3 text-left last:border-b-0 hover:bg-accent',
                !n.read && 'bg-accent/40',
              )}
            >
              <span className={cn('text-sm', !n.read && 'font-medium')}>{n.message}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
