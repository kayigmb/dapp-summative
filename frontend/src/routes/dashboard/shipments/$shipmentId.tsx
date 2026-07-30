import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'

import { Button } from '#/components/ui/button.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { ShipmentTimeline } from '#/components/shipment-timeline.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { api } from '#/lib/api.ts'
import { useAuth } from '#/lib/auth.tsx'
import { formatStatus } from '#/lib/format.ts'

export const Route = createFileRoute('/dashboard/shipments/$shipmentId')({
  component: ShipmentDetailPage,
})

interface Shipment {
  id: number
  tracking_number: string
  product_name: string
  origin: string
  destination: string
  status: string
  owner_id: number
  custodian_id: number | null
  pending_handover_to_id: number | null
  pending_next_status: string | null
}

interface ShipmentHistoryEntry {
  id: number
  old_status: string
  new_status: string
  location: string
  transaction_hash: string
  handover_to_id: number | null
  note: string
  timestamp: string
}

interface User {
  id: number
  name: string
  role: string
}

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
  )
}

function useUserName(id: number | null | undefined) {
  const { data } = useQuery({
    queryKey: ['users', id],
    queryFn: async () => (await api.get<User>(`/api/users/${id}`)).data,
    enabled: id != null,
  })
  return data
}

// Self-report legs are a plain PUT; everything else is a two-party handover.
const SELF_REPORT_NEXT: Record<string, string> = {
  created: 'picked_up',
  picked_up: 'in_transit',
  warehouse_received: 'ready_for_pickup',
}

function ShipmentDetailPage() {
  const { shipmentId } = Route.useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [relayToId, setRelayToId] = useState('')
  const [warehouseToId, setWarehouseToId] = useState('')
  const [deliveryToId, setDeliveryToId] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['shipment', shipmentId],
    queryFn: async () =>
      (
        await api.get<{ shipment: Shipment; history: Array<ShipmentHistoryEntry> }>(
          `/api/shipments/${shipmentId}`,
        )
      ).data,
  })

  const shipment = data?.shipment
  const needsTransporters =
    shipment?.status === 'in_transit' || shipment?.status === 'warehouse_received'
  const needsWarehouses = shipment?.status === 'in_transit'

  const { data: transporters } = useQuery({
    queryKey: ['users', 'transporter'],
    queryFn: async () => (await api.get<Array<User>>('/api/users?role=transporter')).data,
    enabled: needsTransporters,
  })
  const { data: warehouses } = useQuery({
    queryKey: ['users', 'agent'],
    queryFn: async () => (await api.get<Array<User>>('/api/users?role=agent')).data,
    enabled: needsWarehouses,
  })

  const owner = useUserName(shipment?.owner_id)
  const pendingRecipient = useUserName(shipment?.pending_handover_to_id)
  const custodian = useUserName(shipment?.custodian_id)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['shipment', shipmentId] })
    await queryClient.invalidateQueries({ queryKey: ['shipments'] })
  }

  async function run(action: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try {
      await action()
      await refresh()
    } catch (err: unknown) {
      setError(errorMessage(err, 'That action failed'))
    } finally {
      setBusy(false)
    }
  }

  function selfReport(status: string) {
    return run(() => api.put(`/api/shipments/${shipmentId}`, { status }))
  }

  function initiateHandover(toUserId: string, nextStatus?: string) {
    if (!toUserId) {
      setError('Pick who you are handing this shipment off to.')
      return
    }
    run(() =>
      api.post(`/api/shipments/${shipmentId}/handover`, {
        to_user_id: Number(toUserId),
        next_status: nextStatus,
      }),
    )
  }

  function acceptHandover() {
    return run(() => api.post(`/api/shipments/${shipmentId}/handover/accept`))
  }

  function rejectHandover() {
    return run(() => api.post(`/api/shipments/${shipmentId}/handover/reject`))
  }

  if (isLoading) return <p>Loading…</p>
  if (!data || !shipment) return <p className="text-destructive">Shipment not found.</p>

  const { history } = data
  const isOwner = user?.id === shipment.owner_id
  const isCustodian = user?.id === shipment.custodian_id
  const canClaim =
    shipment.status === 'created' &&
    shipment.custodian_id == null &&
    (user?.role === 'transporter' || user?.role === 'agent')
  const isPendingRecipient = user?.id === shipment.pending_handover_to_id
  const isAdmin = user?.role === 'super_admin'
  const complete = shipment.status === 'delivered' || shipment.status === 'collected'
  const selfReportTarget = SELF_REPORT_NEXT[shipment.status]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{shipment.product_name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="font-mono text-sm text-muted-foreground">{shipment.tracking_number}</p>
          <p>
            {shipment.origin} → {shipment.destination}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{formatStatus(shipment.status)}</Badge>
            {custodian && (
              <span className="text-xs text-muted-foreground">
                Currently with {custodian.name} ({custodian.role})
              </span>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Pending handover: recipient gets accept/reject, sender sees a waiting state */}
          {shipment.pending_handover_to_id != null && (isPendingRecipient || isAdmin) && (
            <div className="space-y-2 rounded-md border bg-accent/40 p-3">
              <p className="text-sm">
                {custodian?.name ?? 'Someone'} wants to hand you this shipment
                {shipment.pending_next_status
                  ? ` (moving it to ${formatStatus(shipment.pending_next_status)})`
                  : ''}
                .
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={acceptHandover} disabled={busy}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={rejectHandover} disabled={busy}>
                  Reject
                </Button>
              </div>
            </div>
          )}
          {shipment.pending_handover_to_id != null && isCustodian && !isPendingRecipient && (
            <p className="text-sm text-muted-foreground">
              Waiting for {pendingRecipient?.name ?? 'the recipient'} to confirm…
            </p>
          )}

          {/* No pending handover: current custodian gets action buttons */}
          {shipment.pending_handover_to_id == null && (isCustodian || canClaim || isAdmin) && !complete && (
            <div className="space-y-3 pt-1">
              {selfReportTarget && (
                <Button onClick={() => selfReport(selfReportTarget)} disabled={busy}>
                  Mark as {formatStatus(selfReportTarget)}
                </Button>
              )}

              {shipment.status === 'in_transit' && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">Relay to another transporter</p>
                  <div className="flex gap-2">
                    <Select value={relayToId} onValueChange={setRelayToId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a transporter…" />
                      </SelectTrigger>
                      <SelectContent>
                        {transporters
                          ?.filter((t) => t.id !== user?.id)
                          .map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={() => initiateHandover(relayToId)} disabled={busy}>
                      Relay
                    </Button>
                  </div>

                  <p className="text-sm font-medium">Hand off to a warehouse</p>
                  <div className="flex gap-2">
                    <Select value={warehouseToId} onValueChange={setWarehouseToId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a warehouse…" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses?.map((w) => (
                          <SelectItem key={w.id} value={String(w.id)}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => initiateHandover(warehouseToId, 'warehouse_received')}
                      disabled={busy}
                    >
                      Hand off
                    </Button>
                  </div>
                </div>
              )}

              {shipment.status === 'warehouse_received' && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">Send for delivery</p>
                  <div className="flex gap-2">
                    <Select value={deliveryToId} onValueChange={setDeliveryToId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a transporter…" />
                      </SelectTrigger>
                      <SelectContent>
                        {transporters?.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => initiateHandover(deliveryToId, 'out_for_delivery')}
                      disabled={busy}
                    >
                      Hand off
                    </Button>
                  </div>
                </div>
              )}

              {shipment.status === 'out_for_delivery' && (
                <Button
                  onClick={() => initiateHandover(String(shipment.owner_id), 'delivered')}
                  disabled={busy}
                >
                  Hand to customer{owner ? ` (${owner.name})` : ''} for delivery confirmation
                </Button>
              )}

              {shipment.status === 'ready_for_pickup' && (
                <Button
                  onClick={() => initiateHandover(String(shipment.owner_id), 'collected')}
                  disabled={busy}
                >
                  Hand to customer{owner ? ` (${owner.name})` : ''} for pickup confirmation
                </Button>
              )}
            </div>
          )}

          {isOwner && (shipment.status === 'out_for_delivery' || shipment.status === 'ready_for_pickup') &&
            !isCustodian &&
            shipment.pending_handover_to_id == null && (
              <p className="text-sm text-muted-foreground">
                Waiting for {custodian?.name ?? 'the current holder'} to hand this off to you.
              </p>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ShipmentTimeline history={history} complete={complete} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QR code</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <QRCodeSVG value={shipment.tracking_number} size={160} />
          <p className="text-center text-xs text-muted-foreground">
            Scan or share <span className="font-mono">{shipment.tracking_number}</span> — anyone
            with it can look this shipment up at <span className="font-mono">/track</span>, and
            warehouse staff can use it to confirm an in-person pickup.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
