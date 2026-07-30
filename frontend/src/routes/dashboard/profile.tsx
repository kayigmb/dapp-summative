import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '#/components/ui/button.tsx'
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
import { RoleGate, useAuth } from '#/lib/auth.tsx'

export const Route = createFileRoute('/dashboard/profile')({ component: ProfilePage })

interface ProfileChange {
  id: number
  field: string
  old_value: string
  new_value: string
  changed_at: string
}

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  walletAddress: z.string().optional(),
})

type ProfileValues = z.infer<typeof profileSchema>

const NAME_COOLDOWN_DAYS = 14

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
  )
}

function ProfilePage() {
  const { user, token, login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const { data: history } = useQuery({
    queryKey: ['users', user?.id, 'profile-history'],
    queryFn: async () =>
      (await api.get<Array<ProfileChange>>(`/api/users/${user?.id}/profile-history`)).data,
    enabled: !!user,
  })

  const nameChanges = history?.filter((h) => h.field === 'name') ?? []
  const lastNameChange = nameChanges[0]
  const nextAllowed = lastNameChange
    ? new Date(new Date(lastNameChange.changed_at).getTime() + NAME_COOLDOWN_DAYS * 86_400_000)
    : null
  const onCooldown = nextAllowed ? nextAllowed.getTime() > Date.now() : false

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '', walletAddress: user?.wallet_address ?? '' },
  })

  async function onSubmit(values: ProfileValues) {
    setError(null)
    setSuccess(null)
    try {
      const { data } = await api.put(`/api/users/${user?.id}`, {
        name: values.name,
        wallet_address: values.walletAddress,
      })
      if (token) login(token, data)
      setSuccess('Profile updated.')
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not update profile'))
    }
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {user.email} · <span className="capitalize">{user.role}</span>
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={onCooldown} />
                    </FormControl>
                    {onCooldown && nextAllowed && (
                      <p className="text-xs text-muted-foreground">
                        Name was changed recently — next change available{' '}
                        {nextAllowed.toLocaleDateString()}.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="walletAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wallet address</FormLabel>
                    <FormControl>
                      <Input placeholder="0x..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Save changes'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {nameChanges.length > 0 && (
        <RoleGate roles={['super_admin']}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Name history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {nameChanges.map((c) => (
                <p key={c.id} className="text-sm">
                  <span className="text-muted-foreground">{c.old_value || '(none)'}</span> →{' '}
                  <span className="font-medium">{c.new_value}</span>{' '}
                  <span className="text-xs text-muted-foreground">
                    ({new Date(c.changed_at).toLocaleDateString()})
                  </span>
                </p>
              ))}
            </CardContent>
          </Card>
        </RoleGate>
      )}
    </div>
  )
}
