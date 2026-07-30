import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { api } from '#/lib/api.ts'
import { isAdminRole, useAuth } from '#/lib/auth.tsx'
import { formatStatus } from '#/lib/format.ts'

export const Route = createFileRoute('/dashboard/')({ component: OverviewPage })

interface Overview {
  total_users: number
  total_shipments: number
  users_by_role: Array<{ role: string; count: number }>
  shipments_by_status: Array<{ status: string; count: number }>
  organizations: Array<{ id: number }>
}

function OverviewPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = isAdminRole(user?.role)

  useEffect(() => {
    if (user && !isAdmin) {
      navigate({ to: '/dashboard/shipments' })
    }
  }, [user, isAdmin, navigate])

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => (await api.get<Overview>('/api/admin/overview')).data,
    enabled: isAdmin,
  })

  if (!user || !isAdmin) return null
  if (isLoading || !data) return <p>Loading…</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Users</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{data.total_users}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Shipments
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{data.total_shipments}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Organizations
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{data.organizations.length}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Users by role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.users_by_role.map((r) => (
              <div key={r.role} className="flex justify-between text-sm">
                <span className="capitalize">{r.role.replace('_', ' ')}</span>
                <span className="font-medium">{r.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shipments by status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.shipments_by_status.map((s) => (
              <div key={s.status} className="flex justify-between text-sm">
                <span>{formatStatus(s.status)}</span>
                <span className="font-medium">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
