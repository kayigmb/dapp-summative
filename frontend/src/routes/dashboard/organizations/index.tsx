import { useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Breadcrumbs } from '#/components/breadcrumbs.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table.tsx'
import { api } from '#/lib/api.ts'
import { useAuth } from '#/lib/auth.tsx'

export const Route = createFileRoute('/dashboard/organizations/')({ component: OrganizationsPage })

interface Organization {
  id: number
  name: string
  address: string
  license_number: string
}

interface OrganizationsResponse {
  items: Array<Organization>
  total: number
  page: number
  page_size: number
}

function OrganizationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    if (user.role === 'org_admin' && user.organization_id != null) {
      navigate({ to: '/dashboard/organizations/$id', params: { id: String(user.organization_id) } })
      return
    }
    if (user.role !== 'super_admin') {
      navigate({ to: '/dashboard/shipments' })
    }
  }, [user, navigate])

  const { data, isLoading } = useQuery({
    queryKey: ['organizations', 'list'],
    queryFn: async () => (await api.get<OrganizationsResponse>('/api/organizations')).data,
    enabled: user?.role === 'super_admin',
  })

  async function createOrganization() {
    setError(null)
    try {
      await api.post('/api/organizations', { name, address, license_number: licenseNumber })
      setOpen(false)
      setName('')
      setAddress('')
      setLicenseNumber('')
      queryClient.invalidateQueries({ queryKey: ['organizations', 'list'] })
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not create organization'
      setError(message)
    }
  }

  if (!user || user.role !== 'super_admin') return null

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Organizations' }]} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Organizations</h1>
        <Button onClick={() => setOpen(true)}>Create organization</Button>
      </div>

      {isLoading && <p>Loading…</p>}

      {data && data.items.length === 0 && (
        <p className="text-muted-foreground">No organizations yet.</p>
      )}

      {data && data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>License #</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((org) => (
              <TableRow key={org.id}>
                <TableCell>{org.name}</TableCell>
                <TableCell>{org.address || '—'}</TableCell>
                <TableCell>{org.license_number || '—'}</TableCell>
                <TableCell>
                  <Link to="/dashboard/organizations/$id" params={{ id: String(org.id) }}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              placeholder="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Input
              placeholder="License number"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={createOrganization} disabled={!name} className="w-full">
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
