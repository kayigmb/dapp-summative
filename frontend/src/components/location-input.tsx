import { useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { MapPin } from 'lucide-react'

import { Input } from '#/components/ui/input.tsx'
import { searchLocations } from '#/lib/geocode.ts'
import type { LocationSuggestion } from '#/lib/geocode.ts'

interface LocationInputProps
  extends Omit<ComponentProps<'input'>, 'value' | 'onChange'> {
  value: string
  onChange: (value: string) => void
}

export function LocationInput({ value, onChange, ...inputProps }: LocationInputProps) {
  const [suggestions, setSuggestions] = useState<Array<LocationSuggestion>>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchLocations(value, controller.signal)
        .then((results) => setSuggestions(results))
        .catch(() => {
          // ignore aborted/failed lookups — user can still type freely
        })
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <Input
        {...inputProps}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
          {suggestions.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(s.label)
                  setSuggestions([])
                  setOpen(false)
                }}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
