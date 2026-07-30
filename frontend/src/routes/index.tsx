import { Link, createFileRoute } from '@tanstack/react-router'

import { Button } from '#/components/ui/button.tsx'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">ChainTrack</h1>
      <p className="max-w-md text-lg text-muted-foreground">
        Blockchain-backed logistics tracking — tamper-proof shipment history
        from creation to delivery.
      </p>
      <div className="flex gap-4">
        <Link to="/login">
          <Button>Log in</Button>
        </Link>
        <Link to="/track">
          <Button variant="outline">Track a shipment</Button>
        </Link>
      </div>
    </div>
  )
}
