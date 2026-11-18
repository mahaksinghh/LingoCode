export type Locale = 'en' | 'hi'
export type Project = { id: string; name: string; locale: Locale }
export type Generation = {
  id: string
  prompt: string
  status: 'running' | 'succeeded' | 'failed'
  files: { path: string; content: string }[]
}

function workspaceKey() {
  const stored = localStorage.getItem('lingocode-workspace-key')
  if (stored && /^[a-f0-9]{64}$/.test(stored)) return stored
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  localStorage.setItem('lingocode-workspace-key', key)
  return key
}

async function request<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  const headers = new Headers({ Authorization: `Bearer ${workspaceKey()}` })
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api/projects${path}`, {
    headers,
    signal,
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export const api = {
  projects: (signal: AbortSignal) => request<Project[]>('', signal),
  create: (name: string, locale: Locale) => request<Project>('', undefined, { name, locale }),
  history: (id: string, signal: AbortSignal) => request<Generation[]>(`/${id}/generations`, signal),
  generate: (id: string, prompt: string) =>
    request<Generation>(`/${id}/generations`, undefined, { prompt }),
}
