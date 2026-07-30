import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { Input } from '#/components/ui/input.tsx'
import { api } from '#/lib/api.ts'
import { useDebouncedValue } from '#/hooks/use-debounce.ts'

interface MatchedUser {
  id: number
  name: string
  email: string
}

export function UserEmailCombobox({
  onSelectUser,
  onInviteEmail,
}: {
  onSelectUser: (user: MatchedUser) => void
  onInviteEmail: (email: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const blurTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)
  const debouncedQuery = useDebouncedValue(query, 300)

  const { data: matches } = useQuery({
    queryKey: ['users', 'search', debouncedQuery],
    queryFn: async () =>
      (
        await api.get<{ items: Array<MatchedUser> }>(
          `/api/users?q=${encodeURIComponent(debouncedQuery)}&status=active&page_size=10`,
        )
      ).data.items,
    enabled: debouncedQuery.trim().length > 1,
  })

  const isValidEmail = z.email().safeParse(query).success
  const showResults = open && query.trim().length > 1

  function selectUser(user: MatchedUser) {
    onSelectUser(user)
    setQuery('')
    setOpen(false)
  }

  function inviteEmail() {
    onInviteEmail(query)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        placeholder="Search by name or email…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimeout.current = setTimeout(() => setOpen(false), 150)
        }}
      />
      {showResults && (
        <div
          className="absolute top-full z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md"
          onMouseDown={(e) => {
            e.preventDefault()
            clearTimeout(blurTimeout.current)
          }}
        >
          {matches?.map((u) => (
            <button
              key={u.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => selectUser(u)}
            >
              {u.name} <span className="text-muted-foreground">({u.email})</span>
            </button>
          ))}
          {matches?.length === 0 && isValidEmail && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={inviteEmail}
            >
              Invite <span className="font-medium">{query}</span>
            </button>
          )}
          {matches?.length === 0 && !isValidEmail && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No users found.</p>
          )}
        </div>
      )}
    </div>
  )
}
