import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { Badge } from '#/components/ui/badge.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { ShipmentTimeline } from '#/components/shipment-timeline.tsx'
import { api } from '#/lib/api.ts'

export const Route = createFileRoute('/track/$trackingNumber')({
  component: TrackingResultPage,
})

interface Shipment {
  tracking_number: string
  product_name: string
  origin: string
  destination: string
  status: string
}

interface ShipmentHistoryEntry {
  id: number
  new_status: string
  location: string
  transaction_hash: string
  timestamp: string
}

interface TrackingResponse {
  shipment: Shipment
  history: Array<ShipmentHistoryEntry>
  blockchain_verified: boolean
}

function TrackingResultPage() {
  const { trackingNumber } = Route.useParams()

  const { data, isLoading, error } = useQuery({
    queryKey: ['tracking', trackingNumber],
    queryFn: async () =>
      (await api.get<TrackingResponse>(`/api/tracking/${trackingNumber}`)).data,
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {isLoading && <p>Loading…</p>}
      {error && (
        <p className="text-destructive">No shipment found for that tracking number.</p>
      )}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{data.shipment.product_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-mono text-sm text-muted-foreground">
                {data.shipment.tracking_number}
              </p>
              <p>
                {data.shipment.origin} → {data.shipment.destination}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{data.shipment.status}</Badge>
                <Badge variant={data.blockchain_verified ? 'default' : 'destructive'}>
                  {data.blockchain_verified ? 'Blockchain verified' : 'Not verified'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ShipmentTimeline
                history={data.history}
                complete={data.shipment.status === 'delivered' || data.shipment.status === 'collected'}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
