import { useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Badge } from '#/components/ui/badge.tsx'
import { Breadcrumbs } from '#/components/breadcrumbs.tsx'
import { Button } from '#/components/ui/button.tsx'
import { ConfirmDialog } from '#/components/confirm-dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
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

export const Route = createFileRoute('/dashboard/users/')({ component: UsersPage })

interface UserRow {
  id: number
  name: string
  email: string
  role: string
  status: 'active' | 'locked' | 'banned'
  organization?: { id: number; name: string } | null
}

interface UsersResponse {
  items: Array<UserRow>
  total: number
  page: number
  page_size: number
}

const ROLE_OPTIONS = ['super_admin', 'org_admin', 'agent', 'transporter', 'customer']
const STATUS_OPTIONS = ['active', 'locked', 'banned']

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  locked: 'secondary',
  banned: 'outline',
}

function UsersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAdmin = isAdminRole(user?.role)

  const [page, setPage] = useState(1)
  const [role, setRole] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [q, setQ] = useState('')
  const [pendingStatus, setPendingStatus] = useState<{ user: UserRow; status: string } | null>(
    null,
  )

  useEffect(() => {
    if (user && !isAdmin) {
      navigate({ to: '/dashboard/shipments' })
    }
  }, [user, isAdmin, navigate])

  const { data, isLoading } = useQuery({
    queryKey: ['users', 'list', page, role, status, q],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), page_size: '20' })
      if (role) params.set('role', role)
      if (status) params.set('status', status)
      if (q) params.set('q', q)
      return (await api.get<UsersResponse>(`/api/users?${params.toString()}`)).data
    },
    enabled: isAdmin,
  })

  async function setUserStatus(id: number, newStatus: string) {
    await api.put(`/api/users/${id}/status`, { status: newStatus })
    queryClient.invalidateQueries({ queryKey: ['users', 'list'] })
  }

  const STATUS_ACTION_LABEL: Record<string, string> = {
    active: 'Unlock',
    locked: 'Lock',
    banned: 'Ban',
  }

  if (!user || !isAdmin) return null

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Users' }]} />
      <h1 className="text-2xl font-bold">Users</h1>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          className="max-w-xs"
        />
        <Select
          value={role || 'all'}
          onValueChange={(v) => {
            setRole(v === 'all' ? '' : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status || 'all'}
          onValueChange={(v) => {
            setStatus(v === 'all' ? '' : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p>Loading…</p>}

      {data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link
                      to="/dashboard/users/$id"
                      params={{ id: String(u.id) }}
                      className="hover:underline"
                    >
                      {u.name}
                    </Link>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell className="capitalize">{u.role.replace('_', ' ')}</TableCell>
                  <TableCell>{u.organization?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[u.status] ?? 'secondary'}>{u.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Actions
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/dashboard/users/$id" params={{ id: String(u.id) }}>
                            View profile
                          </Link>
                        </DropdownMenuItem>
                        {u.status !== 'active' && (
                          <DropdownMenuItem onClick={() => setPendingStatus({ user: u, status: 'active' })}>
                            Unlock
                          </DropdownMenuItem>
                        )}
                        {u.status !== 'locked' && (
                          <DropdownMenuItem onClick={() => setPendingStatus({ user: u, status: 'locked' })}>
                            Lock
                          </DropdownMenuItem>
                        )}
                        {u.status !== 'banned' && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setPendingStatus({ user: u, status: 'banned' })}
                          >
                            Ban
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {totalPages} ({data.total} users)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!pendingStatus}
        onOpenChange={(open) => !open && setPendingStatus(null)}
        title={`${STATUS_ACTION_LABEL[pendingStatus?.status ?? '']} ${pendingStatus?.user.name ?? ''}?`}
        description={`This changes ${pendingStatus?.user.name}'s account status to "${pendingStatus?.status}".`}
        confirmLabel={STATUS_ACTION_LABEL[pendingStatus?.status ?? '']}
        destructive={pendingStatus?.status === 'banned'}
        onConfirm={() => pendingStatus && setUserStatus(pendingStatus.user.id, pendingStatus.status)}
      />
    </div>
  )
}
