import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { Button } from '#/components/ui/button.tsx'
import { PasswordInput } from '#/components/ui/password-input.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '#/components/ui/form.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.tsx'
import { api } from '#/lib/api.ts'
import { useAuth } from '#/lib/auth.tsx'

export const Route = createFileRoute('/invite/$token')({ component: AcceptInvitePage })

interface InviteDetail {
  email: string
  open: boolean
  role: string
  organization: { id: number; name: string }
}

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}

const acceptSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Enter a valid email').optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type AcceptValues = z.infer<typeof acceptSchema>

function AcceptInvitePage() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const { data: invite, isLoading, error: loadError } = useQuery({
    queryKey: ['invite', token],
    queryFn: async () => (await api.get<InviteDetail>(`/api/invites/${token}`)).data,
    retry: false,
  })

  const form = useForm<AcceptValues>({
    resolver: zodResolver(acceptSchema),
    defaultValues: { name: '', email: '', password: '' },
  })

  async function onSubmit(values: AcceptValues) {
    setError(null)
    if (invite?.open && !values.email) {
      form.setError('email', { message: 'Email is required' })
      return
    }
    try {
      const { data } = await api.post(`/api/invites/${token}/accept`, values)
      login(data.token, data.user)
      navigate({ to: '/dashboard/shipments' })
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not accept invite'))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join organization</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p>Loading…</p>}

          {loadError && (
            <p className="text-sm text-destructive">
              {errorMessage(loadError, 'This invite link is invalid.')}
            </p>
          )}

          {invite && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    You've been invited to join <span className="font-medium">{invite.organization.name}</span> as{' '}
                    <span className="capitalize">{invite.role.replace('_', ' ')}</span>.
                  </p>
                  {!invite.open && <Input readOnly value={invite.email} className="mt-2" />}
                </div>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {invite.open && (
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
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
                  {form.formState.isSubmitting ? 'Joining…' : 'Join organization'}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
