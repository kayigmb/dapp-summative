import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'

export const Route = createFileRoute('/track/')({ component: TrackLandingPage })

function TrackLandingPage() {
  const navigate = useNavigate()
  const [trackingNumber, setTrackingNumber] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!trackingNumber.trim()) return
    navigate({ to: '/track/$trackingNumber', params: { trackingNumber: trackingNumber.trim() } })
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Track a Shipment</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tracking">Tracking number</Label>
              <Input
                id="tracking"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="CT-XXXXXXXXXXXX"
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Track
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
