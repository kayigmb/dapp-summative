import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { QRCodeSVG } from 'qrcode.react'
import { ChevronLeft, ChevronRight, LocateFixed } from 'lucide-react'
import { z } from 'zod'

import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '#/components/ui/form.tsx'
import { LocationInput } from '#/components/location-input.tsx'
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
import { useAuth } from '#/lib/auth.tsx'
import { getCurrentPosition, reverseGeocode } from '#/lib/geocode.ts'
import { formatStatus } from '#/lib/format.ts'

export const Route = createFileRoute('/dashboard/shipments/')({ component: DashboardHome })

interface Shipment {
  id: number
  tracking_number: string
  product_name: string
  origin: string
  destination: string
  status: string
  custodian_id: number | null
  created_at: string
}

interface User {
  id: number
  name: string
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  created: 'outline',
  picked_up: 'secondary',
  in_transit: 'secondary',
  warehouse_received: 'secondary',
  out_for_delivery: 'secondary',
  ready_for_pickup: 'secondary',
  delivered: 'default',
  collected: 'default',
}

const shipmentSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  origin: z.string().min(1, 'Origin is required'),
  destination: z.string().min(1, 'Destination is required'),
  transporterId: z.string().optional(),
})

type ShipmentValues = z.infer<typeof shipmentSchema>

interface CreatedShipment {
  id: number
  tracking_number: string
}

const PAGE_SIZE = 10

function DashboardHome() {
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { user } = useAuth()

  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['shipments'],
    queryFn: async () => (await api.get<Array<Shipment>>('/api/shipments')).data,
  })

  const { data: transporters } = useQuery({
    queryKey: ['users', 'transporter'],
    queryFn: async () => (await api.get<Array<User>>('/api/users?role=transporter')).data,
  })
  const { data: warehouses } = useQuery({
    queryKey: ['users', 'agent'],
    queryFn: async () => (await api.get<Array<User>>('/api/users?role=agent')).data,
  })

  const custodianName = (id: number | null) =>
    transporters?.find((u) => u.id === id)?.name ??
    warehouses?.find((u) => u.id === id)?.name ??
    '—'

  const filtered = (data ?? []).filter((s) => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return (
      s.product_name.toLowerCase().includes(q) ||
      s.tracking_number.toLowerCase().includes(q)
    )
  })

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const paged = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  function handleFilterChange(value: string) {
    setFilter(value)
    setPage(0)
  }

  function openDialog() {
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    queryClient.invalidateQueries({ queryKey: ['shipments'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shipments</h1>
          {data && data.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {filtered.length} shipment{filtered.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <Button onClick={openDialog}>New Shipment</Button>
      </div>

      {user?.role === 'agent' && <ClaimShipmentCard />}

      {data && data.length > 0 && (
        <Input
          placeholder="Filter by product or tracking number…"
          value={filter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="max-w-sm"
        />
      )}

      {isLoading && <p>Loading…</p>}
      {error && <p className="text-destructive">Could not load shipments.</p>}

      {data && data.length === 0 && (
        <p className="text-muted-foreground">No shipments yet.</p>
      )}

      {data && data.length > 0 && filtered.length === 0 && (
        <p className="text-muted-foreground">No shipments match “{filter}”.</p>
      )}

      {paged.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tracking #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Custodian</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((shipment) => (
                <TableRow key={shipment.id}>
                  <TableCell className="font-mono text-xs">{shipment.tracking_number}</TableCell>
                  <TableCell>{shipment.product_name}</TableCell>
                  <TableCell>
                    {shipment.origin} → {shipment.destination}
                  </TableCell>
                  <TableCell>{custodianName(shipment.custodian_id)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[shipment.status] ?? 'secondary'}>
                      {formatStatus(shipment.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/dashboard/shipments/$shipmentId"
                      params={{ shipmentId: String(shipment.id) }}
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
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage >= pageCount - 1}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <NewShipmentDialog open={dialogOpen} onClose={closeDialog} transporters={transporters} />
    </div>
  )
}

// Enter the tracking code (what the QR encodes) to claim a shipment.
function ClaimShipmentCard() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function claim() {
    const trackingNumber = code.trim()
    if (!trackingNumber) return
    setError(null)
    setBusy(true)
    try {
      const { data } = await api.get<{ shipment: { id: number; status: string } }>(
        `/api/tracking/${trackingNumber}`,
      )
      if (data.shipment.status !== 'created') {
        setError('That shipment has already been claimed.')
        return
      }
      await api.put(`/api/shipments/${data.shipment.id}`, { status: 'picked_up' })
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      setCode('')
      navigate({
        to: '/dashboard/shipments/$shipmentId',
        params: { shipmentId: String(data.shipment.id) },
      })
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'No shipment found with that code'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Claim a shipment</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-start gap-2">
        <Input
          placeholder="Enter tracking code from the QR…"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && claim()}
          className="max-w-xs font-mono"
        />
        <Button onClick={claim} disabled={busy || !code.trim()}>
          {busy ? 'Claiming…' : 'Claim'}
        </Button>
        {error && <p className="w-full text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

// Dialog only closes via explicit Cancel/Close so an in-progress shipment
// isn't lost to a stray esc or outside click.
function NewShipmentDialog({
  open,
  onClose,
  transporters,
}: {
  open: boolean
  onClose: () => void
  transporters: Array<User> | undefined
}) {
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedShipment | null>(null)
  const [locating, setLocating] = useState(false)

  const form = useForm<ShipmentValues>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: { productName: '', origin: '', destination: '', transporterId: '' },
  })

  function reset() {
    setError(null)
    setCreated(null)
    form.reset()
  }

  function handleCancel() {
    reset()
    onClose()
  }

  async function useMyLocation() {
    setError(null)
    setLocating(true)
    try {
      const position = await getCurrentPosition()
      const label = await reverseGeocode(position.coords.latitude, position.coords.longitude)
      form.setValue('origin', label, { shouldValidate: true })
    } catch {
      setError('Could not detect your location — allow location access and try again.')
    } finally {
      setLocating(false)
    }
  }

  async function onSubmit(values: ShipmentValues) {
    setError(null)
    try {
      const { data } = await api.post<CreatedShipment>('/api/shipments', {
        product_name: values.productName,
        origin: values.origin,
        destination: values.destination,
        transporter_id: values.transporterId ? Number(values.transporterId) : undefined,
      })
      setCreated(data)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not create shipment'
      setError(message)
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{created ? 'Shipment created' : 'New Shipment'}</DialogTitle>
        </DialogHeader>

        {created ? (
          <div className="space-y-4 text-center">
            <p className="font-mono text-sm">{created.tracking_number}</p>
            <div className="flex justify-center">
              <QRCodeSVG value={created.tracking_number} size={180} />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                reset()
                onClose()
              }}
            >
              Done
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
              <FormField
                control={form.control}
                name="productName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="origin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origin</FormLabel>
                    <FormControl>
                      <LocationInput {...field} placeholder="City, address, or port…" />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto gap-1.5 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                      onClick={useMyLocation}
                      disabled={locating}
                    >
                      <LocateFixed className="size-3.5" />
                      {locating ? 'Detecting your location…' : 'Use my current location'}
                    </Button>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="destination"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destination</FormLabel>
                    <FormControl>
                      <LocationInput {...field} placeholder="City, address, or port…" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="transporterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transporter (optional)</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Assign a transporter…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {transporters?.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.name}
                          </SelectItem>
                        ))}
                        {transporters?.length === 0 && (
                          <p className="px-2 py-1.5 text-xs text-muted-foreground">
                            No transporters registered yet.
                          </p>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Creating…' : 'Create shipment'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
