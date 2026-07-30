import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import TanstackQueryProvider from '../integrations/tanstack-query/root-provider'
import { AuthProvider } from '../lib/auth'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'http://localhost:3000'
const SITE_NAME = 'ChainTrack'
const SITE_TITLE = 'ChainTrack — Blockchain based fraud proof Logistics Tracking System'
const SITE_DESCRIPTION =
  'Track shipments end-to-end with blockchain-verified chain of custody.'
const OG_IMAGE = `${SITE_URL}/og-image.svg`

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: ({ match }) => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: SITE_TITLE,
      },
      {
        name: 'description',
        content: SITE_DESCRIPTION,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:site_name',
        content: SITE_NAME,
      },
      {
        property: 'og:title',
        content: SITE_TITLE,
      },
      {
        property: 'og:description',
        content: SITE_DESCRIPTION,
      },
      {
        property: 'og:image',
        content: OG_IMAGE,
      },
      {
        property: 'og:url',
        content: `${SITE_URL}${match.pathname}`,
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: SITE_TITLE,
      },
      {
        name: 'twitter:description',
        content: SITE_DESCRIPTION,
      },
      {
        name: 'twitter:image',
        content: OG_IMAGE,
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { queryClient } = Route.useRouteContext()

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <TanstackQueryProvider queryClient={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </TanstackQueryProvider>
        {import.meta.env.MODE !== 'test' && (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Blockchain based fraud proof Logistics Tracking System',
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
