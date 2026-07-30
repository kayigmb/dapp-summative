import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { ReactNode } from 'react'

export function getContext() {
  const queryClient = new QueryClient()

  return {
    queryClient,
  }
}

export default function TanstackQueryProvider({
  children,
  queryClient,
}: Readonly<{
  children: ReactNode
  queryClient: QueryClient
}>) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
