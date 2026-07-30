import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import type { ReactNode } from 'react'

import { Badge } from '#/components/ui/badge.tsx'
import { Breadcrumbs } from '#/components/breadcrumbs.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table.tsx'
import { api } from '#/lib/api.ts'
import { isAdminRole, useAuth } from '#/lib/auth.tsx'
import { formatStatus } from '#/lib/format.ts'
import { cn } from '#/lib/utils.ts'

export const Route = createFileRoute('/dashboard/users/$id')({ component: UserDetailPage })

interface UserDetail {
  id: number
  name: string
  email: string
  role: string
  status: 'active' | 'locked' | 'banned'
  organization?: { id: number; name: string } | null
  branch?: { id: number; name: string } | null
  warehouse?: { id: number; name: string } | null
  wallet_address: string
  created_at: string
}

interface ProfileChange {
  id: number
  field: string
  old_value: string
  new_value: string
  changed_at: string
}

interface ActivityShipment {
  id: number
  tracking_number: string
  product_name: string
  status: string
  owner_id: number
  custodian_id: number | null
  created_at: string
}

interface ActivityHistoryEntry {
  id: number
  shipment_id: number
  new_status: string
  timestamp: string
}

interface Activity {
  shipments: Array<ActivityShipment>
  history: Array<ActivityHistoryEntry>
}

const TABS = ['shipments', 'profile-history'] as const
type Tab = (typeof TABS)[number]

const TAB_LABEL: Record<Tab, string> = {
  shipments: 'Shipment history',
  'profile-history': 'Profile history',
}

function UserDetailPage() {
  const { id } = Route.useParams()
  const { user: viewer } = useAuth()
  const [tab, setTab] = useState<Tab>('shipments')
  const canViewManagement = isAdminRole(viewer?.role) || viewer?.id === Number(id)
  const canViewProfileHistory = viewer?.role === 'super_admin'

  const { data: profile, isLoading } = useQuery({
    queryKey: ['users', id],
    queryFn: async () => (await api.get<UserDetail>(`/api/users/${id}`)).data,
  })

  const { data: activity } = useQuery({
    queryKey: ['users', id, 'activity'],
    queryFn: async () => (await api.get<Activity>(`/api/users/${id}/activity`)).data,
    enabled: canViewManagement && tab === 'shipments',
  })

  const { data: history } = useQuery({
    queryKey: ['users', id, 'profile-history'],
    queryFn: async () => (await api.get<Array<ProfileChange>>(`/api/users/${id}/profile-history`)).data,
    enabled: canViewProfileHistory && tab === 'profile-history',
  })

  if (isLoading) return <p>Loading…</p>
  if (!profile) return <p className="text-destructive">User not found.</p>

  const tabs = canViewProfileHistory ? TABS : TABS.filter((t) => t !== 'profile-history')

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Users', to: '/dashboard/users' },
          { label: profile.name },
        ]}
      />
      <h1 className="text-2xl font-bold">{profile.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Field label="Email" value={profile.email} />
          <Field label="Role" value={profile.role.replace('_', ' ')} capitalize />
          <Field label="Status" value={<Badge>{profile.status}</Badge>} />
          <Field label="Organization" value={profile.organization?.name ?? '—'} />
          <Field label="Branch" value={profile.branch?.name ?? '—'} />
          <Field label="Warehouse" value={profile.warehouse?.name ?? '—'} />
          <Field label="Wallet" value={profile.wallet_address || '—'} mono />
        </CardContent>
      </Card>

      {canViewManagement && (
        <>
          <div className="flex gap-1 border-b">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'px-3 py-2 text-sm font-medium',
                  tab === t
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {tab === 'shipments' && (
            <Card>
              <CardContent className="pt-6">
                {!activity || activity.shipments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No shipment activity yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tracking #</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activity.shipments.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.tracking_number}</TableCell>
                          <TableCell>{s.product_name}</TableCell>
                          <TableCell>{s.owner_id === profile.id ? 'Owner' : 'Custodian'}</TableCell>
                          <TableCell>{formatStatus(s.status)}</TableCell>
                          <TableCell>
                            <Link
                              to="/dashboard/shipments/$shipmentId"
                              params={{ shipmentId: String(s.id) }}
                            >
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {tab === 'profile-history' && canViewProfileHistory && (
            <Card>
              <CardContent className="space-y-2 pt-6">
                {history?.length === 0 && (
                  <p className="text-sm text-muted-foreground">No changes recorded.</p>
                )}
                {history?.map((c) => (
                  <p key={c.id} className="text-sm">
                    <span className="capitalize text-muted-foreground">{c.field}</span>:{' '}
                    <span className="text-muted-foreground">{c.old_value || '(none)'}</span> →{' '}
                    <span className="font-medium">{c.new_value}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      ({new Date(c.changed_at).toLocaleDateString()})
                    </span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string
  value: ReactNode
  mono?: boolean
  capitalize?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''}`}>
        {value}
      </p>
    </div>
  )
}
