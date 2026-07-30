import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Badge } from '#/components/ui/badge.tsx'
import { Breadcrumbs } from '#/components/breadcrumbs.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { ConfirmDialog } from '#/components/confirm-dialog.tsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#/components/ui/dialog.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { Input } from '#/components/ui/input.tsx'
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
import { UserEmailCombobox } from '#/components/user-email-combobox.tsx'
import { api } from '#/lib/api.ts'
import { cn } from '#/lib/utils.ts'

export const Route = createFileRoute('/dashboard/organizations/$id')({
  component: OrganizationDetailPage,
})

interface OrgDetail {
  organization: { id: number; name: string; address: string; license_number: string }
  user_count: number
  branch_count: number
  warehouse_count: number
  shipment_count: number
}

interface OrgUser {
  id: number
  name: string
  email: string
  role: string
  status: string
}

interface Shipment {
  id: number
  tracking_number: string
  product_name: string
  status: string
}

interface Invite {
  id: number
  email: string
  role: string
  expires_at: string
}

interface MatchedUser {
  id: number
  name: string
  email: string
}

const TABS = ['about', 'users', 'shipments'] as const
type Tab = (typeof TABS)[number]

const USER_SUB_TABS = ['members', 'invites'] as const
type UsersSubTab = (typeof USER_SUB_TABS)[number]
const USER_SUB_TAB_LABEL: Record<UsersSubTab, string> = {
  members: 'Members',
  invites: 'Invites',
}

const GRANTABLE_ROLES = ['agent', 'transporter']

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

function OrganizationDetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('about')
  const [usersSubTab, setUsersSubTab] = useState<UsersSubTab>('members')
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<MatchedUser | null>(null)
  const [inviteEmail, setInviteEmail] = useState<string | null>(null)
  const [newUserRole, setNewUserRole] = useState('agent')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [addUserError, setAddUserError] = useState<string | null>(null)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkRole, setLinkRole] = useState('agent')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{
    type: 'ban' | 'unban' | 'remove'
    user: OrgUser
  } | null>(null)

  const { data: detail, isLoading } = useQuery({
    queryKey: ['organizations', id],
    queryFn: async () => (await api.get<OrgDetail>(`/api/organizations/${id}`)).data,
  })

  const { data: users } = useQuery({
    queryKey: ['organizations', id, 'users'],
    queryFn: async () =>
      (await api.get<{ items: Array<OrgUser> }>(`/api/organizations/${id}/users`)).data.items,
    enabled: tab === 'users',
  })

  const { data: shipments } = useQuery({
    queryKey: ['organizations', id, 'shipments'],
    queryFn: async () => (await api.get<Array<Shipment>>('/api/shipments')).data,
    enabled: tab === 'shipments',
  })

  const { data: invites } = useQuery({
    queryKey: ['organizations', id, 'invites'],
    queryFn: async () =>
      (await api.get<{ items: Array<Invite> }>(`/api/organizations/${id}/invites?status=pending`))
        .data.items,
    enabled: tab === 'users',
  })

  function resetAddUserDialog() {
    setSelectedUser(null)
    setInviteEmail(null)
    setInviteLink(null)
    setCopied(false)
    setNewUserRole('agent')
    setAddUserError(null)
  }

  function closeAddUserDialog() {
    setAddUserOpen(false)
    resetAddUserDialog()
  }

  async function addExistingUser() {
    if (!selectedUser) return
    setAddUserError(null)
    try {
      await api.post(`/api/organizations/${id}/users`, {
        user_id: selectedUser.id,
        role: newUserRole,
      })
      closeAddUserDialog()
      queryClient.invalidateQueries({ queryKey: ['organizations', id, 'users'] })
      queryClient.invalidateQueries({ queryKey: ['organizations', id] })
    } catch (err: unknown) {
      setAddUserError(errorMessage(err, 'Could not add user'))
    }
  }

  async function sendInvite() {
    if (!inviteEmail) return
    setAddUserError(null)
    try {
      const { data } = await api.post<{ invite_link: string }>(
        `/api/organizations/${id}/invites`,
        { email: inviteEmail, role: newUserRole },
      )
      setInviteLink(data.invite_link)
      queryClient.invalidateQueries({ queryKey: ['organizations', id, 'invites'] })
    } catch (err: unknown) {
      setAddUserError(errorMessage(err, 'Could not send invite'))
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
  }

  function closeLinkDialog() {
    setLinkDialogOpen(false)
    setLinkRole('agent')
    setGeneratedLink(null)
    setLinkCopied(false)
    setLinkError(null)
  }

  async function generateInviteLink() {
    setLinkError(null)
    try {
      const { data } = await api.post<{ invite_link: string }>(
        `/api/organizations/${id}/invites`,
        { role: linkRole },
      )
      setGeneratedLink(data.invite_link)
      queryClient.invalidateQueries({ queryKey: ['organizations', id, 'invites'] })
    } catch (err: unknown) {
      setLinkError(errorMessage(err, 'Could not generate invite link'))
    }
  }

  async function copyGeneratedLink() {
    if (!generatedLink) return
    await navigator.clipboard.writeText(generatedLink)
    setLinkCopied(true)
  }

  async function revokeInvite(inviteId: number) {
    await api.delete(`/api/organizations/${id}/invites/${inviteId}`)
    queryClient.invalidateQueries({ queryKey: ['organizations', id, 'invites'] })
  }

  async function removeUser(userId: number) {
    await api.delete(`/api/organizations/${id}/users/${userId}`)
    queryClient.invalidateQueries({ queryKey: ['organizations', id, 'users'] })
  }

  async function setUserBanStatus(userId: number, status: 'active' | 'banned') {
    await api.put(`/api/users/${userId}/status`, { status })
    queryClient.invalidateQueries({ queryKey: ['organizations', id, 'users'] })
  }

  function runPendingAction() {
    if (!pendingAction) return
    if (pendingAction.type === 'remove') void removeUser(pendingAction.user.id)
    if (pendingAction.type === 'ban') void setUserBanStatus(pendingAction.user.id, 'banned')
    if (pendingAction.type === 'unban') void setUserBanStatus(pendingAction.user.id, 'active')
  }

  function actionCopy(type: 'ban' | 'unban' | 'remove', name: string) {
    switch (type) {
      case 'ban':
        return {
          title: `Ban ${name}?`,
          description: `${name} will be locked out of ChainTrack immediately.`,
          confirmLabel: 'Ban',
          destructive: true,
        }
      case 'unban':
        return {
          title: `Unban ${name}?`,
          description: `${name} will be able to log in again.`,
          confirmLabel: 'Unban',
          destructive: false,
        }
      case 'remove':
        return {
          title: `Remove ${name} from this organization?`,
          description: `${name} keeps their account but loses org/branch/warehouse assignment. This does not ban them.`,
          confirmLabel: 'Remove',
          destructive: true,
        }
    }
  }

  if (isLoading) return <p>Loading…</p>
  if (!detail) return <p className="text-destructive">Organization not found.</p>

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Organizations', to: '/dashboard/organizations' },
          { label: detail.organization.name },
        ]}
      />
      <h1 className="text-2xl font-bold">{detail.organization.name}</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Users" value={detail.user_count} />
        <StatCard label="Branches" value={detail.branch_count} />
        <StatCard label="Warehouses" value={detail.warehouse_count} />
        <StatCard label="Shipments" value={detail.shipment_count} />
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-2 text-sm font-medium capitalize',
              tab === t
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'about' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Address</p>
              <p className="text-sm">{detail.organization.address || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">License #</p>
              <p className="text-sm">{detail.organization.license_number || '—'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex gap-1 border-b">
            {USER_SUB_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setUsersSubTab(t)}
                className={cn(
                  'px-3 py-2 text-sm font-medium',
                  usersSubTab === t
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {USER_SUB_TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {usersSubTab === 'members' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setAddUserOpen(true)}>
                  Add user
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <Link to="/dashboard/users/$id" params={{ id: String(u.id) }} className="hover:underline">
                          {u.name}
                        </Link>
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell className="capitalize">{u.role.replace('_', ' ')}</TableCell>
                      <TableCell>
                        <Badge variant={u.status === 'active' ? 'default' : 'secondary'}>
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {u.status === 'banned' ? (
                              <DropdownMenuItem onClick={() => setPendingAction({ type: 'unban', user: u })}>
                                Unban
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setPendingAction({ type: 'ban', user: u })}
                              >
                                Ban
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setPendingAction({ type: 'remove', user: u })}
                            >
                              Remove from organization
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No members yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {usersSubTab === 'invites' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setLinkDialogOpen(true)}>
                  Generate invite link
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites?.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        {inv.email || (
                          <span className="text-muted-foreground">Open link (any email)</span>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{inv.role.replace('_', ' ')}</TableCell>
                      <TableCell>{new Date(inv.expires_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => revokeInvite(inv.id)}>
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {invites?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No active invites.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {tab === 'shipments' && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tracking #</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments?.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.tracking_number}</TableCell>
                <TableCell>{s.product_name}</TableCell>
                <TableCell className="capitalize">{s.status.replace('_', ' ')}</TableCell>
                <TableCell>
                  <Link to="/dashboard/shipments/$shipmentId" params={{ shipmentId: String(s.id) }}>
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

      <Dialog
        open={addUserOpen}
        onOpenChange={(open) => (open ? setAddUserOpen(true) : closeAddUserDialog())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user to organization</DialogTitle>
          </DialogHeader>

          {!selectedUser && !inviteEmail && (
            <UserEmailCombobox
              onSelectUser={(u) => setSelectedUser(u)}
              onInviteEmail={(email) => setInviteEmail(email)}
            />
          )}

          {selectedUser && (
            <div className="space-y-3">
              <p className="text-sm">
                {selectedUser.name} <span className="text-muted-foreground">({selectedUser.email})</span>
              </p>
              <Select value={newUserRole} onValueChange={setNewUserRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRANTABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addUserError && <p className="text-sm text-destructive">{addUserError}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetAddUserDialog} className="flex-1">
                  Back
                </Button>
                <Button onClick={addExistingUser} className="flex-1">
                  Add
                </Button>
              </div>
            </div>
          )}

          {inviteEmail && !inviteLink && (
            <div className="space-y-3">
              <p className="text-sm">
                Inviting <span className="font-medium">{inviteEmail}</span>
              </p>
              <Select value={newUserRole} onValueChange={setNewUserRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRANTABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addUserError && <p className="text-sm text-destructive">{addUserError}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetAddUserDialog} className="flex-1">
                  Back
                </Button>
                <Button onClick={sendInvite} className="flex-1">
                  Send invite
                </Button>
              </div>
            </div>
          )}

          {inviteLink && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No email was sent — copy this link and share it with {inviteEmail}.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={inviteLink} className="font-mono text-xs" />
                <Button variant="outline" onClick={copyInviteLink}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <Button onClick={closeAddUserDialog} className="w-full">
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={linkDialogOpen}
        onOpenChange={(open) => (open ? setLinkDialogOpen(true) : closeLinkDialog())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate invite link</DialogTitle>
          </DialogHeader>

          {!generatedLink && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Anyone with this link can sign up and join — not tied to one email. Reusable until
                you revoke it.
              </p>
              <Select value={linkRole} onValueChange={setLinkRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRANTABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkError && <p className="text-sm text-destructive">{linkError}</p>}
              <Button onClick={generateInviteLink} className="w-full">
                Generate link
              </Button>
            </div>
          )}

          {generatedLink && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Share this link — no email was sent.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={generatedLink} className="font-mono text-xs" />
                <Button variant="outline" onClick={copyGeneratedLink}>
                  {linkCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <Button onClick={closeLinkDialog} className="w-full">
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pendingAction && (
        <ConfirmDialog
          open={!!pendingAction}
          onOpenChange={(open) => !open && setPendingAction(null)}
          onConfirm={runPendingAction}
          {...actionCopy(pendingAction.type, pendingAction.user.name)}
        />
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-bold">{value}</CardContent>
    </Card>
  )
}
