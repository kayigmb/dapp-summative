export interface LocationSuggestion {
  label: string
  lat: number
  lon: number
}

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
}

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<Array<LocationSuggestion>> {
  if (query.trim().length < 3) return []

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'json')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '5')

  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return []

  const results = (await res.json()) as Array<NominatimResult>
  return results.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
  }))
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'json')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))

  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Could not resolve your location')

  const result = (await res.json()) as NominatimResult
  return result.display_name
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000 })
  })
}
