import type { AppSpec, Locale } from '../../../services/api/template/web/src/Records'

export type { Locale } from '../../../services/api/template/web/src/Records'
export type Project = { id: string; name: string; locale: Locale; archived: boolean }
export type Session = { token: string; email: string }
export type Action = 'plan' | 'build' | 'revise' | 'debug'
export type JobSummary = {
  id: string
  prompt: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  action: Action | 'restore'
  source_id: string | null
  provider: 'mock' | 'compatible' | null
  created_at: string
}
export type Job = JobSummary & { spec: AppSpec | null; files: { path: string; content: string }[] }

const sessionKey = 'lingocode-session'

export function readSession(): Session | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(sessionKey) ?? 'null') as Session | null
    return stored && /^[a-f0-9]{64}$/.test(stored.token) && typeof stored.email === 'string' ? stored : null
  } catch {
    return null
  }
}

export function persistSession(session: Session | null) {
  if (session) {
    window.localStorage.setItem(sessionKey, JSON.stringify(session))
    window.localStorage.removeItem('lingocode-workspace-key')
  } else {
    window.localStorage.removeItem(sessionKey)
  }
}

export class ApiError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`) }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal }
async function response(path: string, token?: string, options: Options = {}) {
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  const result = await fetch('/api' + path, {
    headers,
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })
  if (!result.ok) throw new ApiError(result.status)
  return result
}

async function json<T>(path: string, token?: string, options?: Options): Promise<T> {
  return (await response(path, token, options)).json()
}

export const authenticate = (mode: 'login' | 'register', email: string, password: string) => {
  const legacyKey = window.localStorage.getItem('lingocode-workspace-key')
  return json<Session>('/auth/' + mode, undefined, {
    body: { email, password, legacy_key: legacyKey && /^[a-f0-9]{64}$/.test(legacyKey) ? legacyKey : null },
  })
}

export function connect(token: string) {
  const projects = '/projects'
  const jobs = (id: string) => `${projects}/${id}/generations`
  const revision = (id: string, job: string) => `${jobs(id)}/${job}`
  return {
    config: (signal: AbortSignal) => json<{ provider: 'mock' | 'compatible' }>('/config', token, { signal }),
    logout: () => response('/auth/logout', token, { method: 'POST' }),
    projects: (signal: AbortSignal) => json<Project[]>(projects, token, { signal }),
    create: (name: string, locale: Locale) => json<Project>(projects, token, { body: { name, locale } }),
    update: (id: string, name: string, archived: boolean) =>
      json<Project>(`${projects}/${id}`, token, { method: 'PATCH', body: { name, archived } }),
    history: (id: string, signal: AbortSignal) => json<JobSummary[]>(jobs(id), token, { signal }),
    revision: (id: string, job: string, signal: AbortSignal) => json<Job>(revision(id, job), token, { signal }),
    generate: (id: string, prompt: string, action: Action, sourceId?: string) =>
      json<JobSummary>(jobs(id), token, { body: { prompt, action, source_id: sourceId } }),
    restore: (id: string, job: string) => json<Job>(revision(id, job) + '/restore', token, { method: 'POST' }),
    export: async (id: string, job: string) => (await response(revision(id, job) + '/export', token)).blob(),
  }
}

export type StudioClient = ReturnType<typeof connect>
