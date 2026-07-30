import { zodResolver } from '@hookform/resolvers/zod'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '#/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '#/components/ui/form.tsx'
import { Input } from '#/components/ui/input.tsx'
import { PasswordInput } from '#/components/ui/password-input.tsx'
import { api } from '#/lib/api.ts'
import { isAdminRole, useAuth } from '#/lib/auth.tsx'
import { connectWallet, signMessage } from '#/lib/wallet.ts'

export const Route = createFileRoute('/login')({ component: LoginPage })

const loginSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginValues = z.infer<typeof loginSchema>

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data
      ?.error ?? fallback
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [walletLoading, setWalletLoading] = useState(false)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginValues) {
    setError(null)
    try {
      const { data } = await api.post('/api/auth/login', values)
      login(data.token, data.user)
      navigate({ to: isAdminRole(data.user.role) ? '/dashboard' : '/dashboard/shipments' })
    } catch (err: unknown) {
      setError(errorMessage(err, 'Invalid email or password'))
    }
  }

  async function handleWalletLogin() {
    setError(null)
    setWalletLoading(true)
    try {
      const address = await connectWallet()
      const { data: nonceData } = await api.post('/api/auth/connect-wallet', { address })
      const signature = await signMessage(nonceData.message)
      const { data } = await api.post('/api/auth/verify-wallet', { address, signature })
      login(data.token, data.user)
      navigate({ to: isAdminRole(data.user.role) ? '/dashboard' : '/dashboard/shipments' })
    } catch (err: unknown) {
      setError(errorMessage(err, 'Wallet login failed'))
    } finally {
      setWalletLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Log in — ChainTrack</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <PasswordInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Logging in…' : 'Log in'}
              </Button>
            </form>
          </Form>

          <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleWalletLogin}
            disabled={walletLoading}
          >
            {walletLoading ? 'Connecting…' : 'Connect MetaMask'}
          </Button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account?{' '}
            <Link to="/register" className="underline">
              Register
            </Link>
          </p>

        </CardContent>
      </Card>
    </div>
  )
}
