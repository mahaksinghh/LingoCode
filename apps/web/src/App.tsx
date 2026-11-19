import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError, authenticate, connect, persistSession, readSession, type Locale, type Project, type Session } from './api'
import { languages, messages, type Copy, type StudioLocale } from './messages'
import { Workspace } from './Workspace'

function Brand() {
  return <span className="brand"><span className="brand-mark" aria-hidden="true">⌘</span>LingoCode</span>
}

export function App() {
  const [session, setSession] = useState(readSession)
  const [locale, setLocale] = useState<StudioLocale>(() => window.localStorage.getItem('lingocode-locale') === 'hi' ? 'hi' : 'en')
  const [expired, setExpired] = useState(false)
  const t = messages[locale]

  useEffect(() => {
    document.documentElement.lang = locale
    window.localStorage.setItem('lingocode-locale', locale)
  }, [locale])

  const changeSession = useCallback((next: Session | null, timedOut = false) => {
    persistSession(next)
    setSession(next)
    setExpired(timedOut)
  }, [])
  const expire = useCallback(() => changeSession(null, true), [changeSession])

  return <>
    <header className="studio-header">
      <Brand />
      <div className="header-tools">
        <select aria-label="Interface language / इंटरफ़ेस की भाषा" value={locale}
          onChange={(event) => setLocale(event.target.value as StudioLocale)}>
          <option value="en" lang="en">English</option><option value="hi" lang="hi">हिन्दी</option>
        </select>
        {session && <SignOut session={session} t={t} onSignOut={() => changeSession(null)} />}
      </div>
    </header>
    {session
      ? <Dashboard key={session.token} session={session} locale={locale} t={t}
          onExpired={expire} />
      : <AuthPage t={t} expired={expired} onSuccess={changeSession} />}
  </>
}

function SignOut({ session, t, onSignOut }: { session: Session; t: Copy; onSignOut: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function signOut() {
    setBusy(true)
    setError(false)
    try {
      await connect(session.token).logout()
      onSignOut()
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) onSignOut()
      else setError(true)
    } finally {
      setBusy(false)
    }
  }
  return <><button className="quiet" disabled={busy} onClick={() => void signOut()}>{t.signOut}</button>
    {error && <span role="alert">{t.error}</span>}</>
}

function AuthPage({ t, expired, onSuccess }: { t: Copy; expired: boolean; onSuccess: (session: Session) => void }) {
  const [mode, setMode] = useState<'register' | 'login'>(expired ? 'login' : 'register')
  const [error, setError] = useState<'authError' | 'conflict' | 'error'>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError(undefined)
    try {
      onSuccess(await authenticate(mode, String(data.get('email')), String(data.get('password'))))
    } catch (reason) {
      const status = reason instanceof ApiError ? reason.status : 0
      setError(status === 409 ? 'conflict' : status === 401 || status === 422 ? 'authError' : 'error')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-layout">
    <section className="welcome">
      <div className="language-strip">{Object.entries(languages).map(([code, label]) =>
        <span key={code} lang={code}>{label}</span>)}</div>
      <h1>{t.hero}</h1><p>{t.intro}</p>
      <div className="steps" aria-hidden="true">
        <span>{t.plan}</span><span>→</span><span>{t.build}</span><span>→</span><span>{t.preview}</span>
      </div>
    </section>
    <section className="auth-panel">
      <h2>{mode === 'register' ? t.register : t.signIn}</h2>
      {expired && <p role="status">{t.sessionExpired}</p>}
      <form onSubmit={submit} className="stack">
        <label>{t.email}<input type="email" name="email" autoComplete="email" required maxLength={254} /></label>
        <label>{t.password}<input name="password" type="password" required minLength={10} maxLength={128}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          aria-describedby={mode === 'register' ? 'password-help' : undefined} /></label>
        {mode === 'register' && <small className="muted" id="password-help">{t.credentials}</small>}
        {error && <p role="alert">{t[error]}</p>}
        <button className="primary" disabled={busy}>{busy ? t.working : mode === 'register' ? t.register : t.signIn}</button>
      </form>
      <p className="auth-switch">{mode === 'register' ? t.existing : t.newAccount}{' '}
        <button className="link" disabled={busy} onClick={() => {
          setMode(mode === 'register' ? 'login' : 'register')
          setError(undefined)
        }}>{mode === 'register' ? t.signIn : t.register}</button></p>
    </section>
  </main>
}

function Dashboard({ session, locale, t, onExpired }: {
  session: Session; locale: StudioLocale; t: Copy; onExpired: () => void
}) {
  const api = useMemo(() => connect(session.token), [session.token])
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [output, setOutput] = useState<Locale>(locale)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState(false)
  const [busy, setBusy] = useState(false)
  const [provider, setProvider] = useState<'mock' | 'compatible'>()

  useEffect(() => {
    const controller = new AbortController()
    api.projects(controller.signal).then((items) => {
      setProjects(items)
      setSelected(items.find((item) => !item.archived)?.id ?? items[0]?.id ?? '')
    }).catch((reason) => {
      if (controller.signal.aborted) return
      if (reason instanceof ApiError && reason.status === 401) onExpired()
      else setProblem(true)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    api.config(controller.signal).then((config) => setProvider(config.provider)).catch(() => {})
    return () => controller.abort()
  }, [api, onExpired])

  function error(reason: unknown) {
    if (reason instanceof ApiError && reason.status === 401) onExpired()
    else setProblem(true)
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (!name) return
    setBusy(true)
    setProblem(false)
    try {
      const project = await api.create(name, output)
      setProjects((items) => [project, ...items])
      setSelected(project.id)
      setShowCreate(false)
    } catch (reason) {
      error(reason)
    } finally {
      setBusy(false)
    }
  }

  const project = projects.find((entry) => entry.id === selected)
  const active = projects.filter((entry) => !entry.archived)
  const archived = projects.filter((entry) => entry.archived)
  const list = (items: Project[]) => <ul className="project-list">
    {items.map((item) => <li key={item.id}><button aria-pressed={selected === item.id} onClick={() => {
      setSelected(item.id)
      setProblem(false)
    }}><span className="project-icon" aria-hidden="true">◇</span><span>{item.name}</span>
      <small lang={item.locale}>{languages[item.locale]}</small></button></li>)}
  </ul>

  return <main className="studio-shell">
    <aside className="rail" aria-label={t.projects}>
      <div className="rail-heading"><h2>{t.projects}</h2><button className="icon-button" disabled={loading}
        aria-label={showCreate ? t.cancel : t.create} onClick={() => {
          setShowCreate(!showCreate)
          setOutput(locale)
        }}>{showCreate ? '×' : '+'}</button></div>
      {showCreate && <form className="stack create-form" onSubmit={create}>
        <label>{t.name}<input autoFocus name="name" required maxLength={100} /></label>
        <label>{t.output}<select value={output} onChange={(event) => setOutput(event.target.value as Locale)}>
          {Object.entries(languages).map(([code, label]) => <option key={code} lang={code} value={code}>{label}</option>)}
        </select></label>
        <button className="primary" disabled={busy}>{busy ? t.working : t.create}</button>
      </form>}
      {list(active)}
      {!!archived.length && <><h3>{t.archived}</h3>{list(archived)}</>}
      <div className="rail-footer">
        <span className="provider"><i aria-hidden="true" />{provider === 'compatible' ? t.ai : provider === 'mock' ? t.demo : t.providerUnavailable}</span>
        <small>{session.email}</small>
      </div>
    </aside>
    <div className="workspace">
      {problem && <p className="notice" role="alert">{t.error}</p>}
      {loading ? <p role="status">{t.loading}</p> : project
        ? <Workspace key={project.id} project={project} api={api} t={t} onExpired={onExpired}
          onUpdate={(updated) => setProjects((items) => items.map((item) => item.id === updated.id ? updated : item))} />
        : <section className="welcome empty-workspace">
          <h1>{t.app}</h1><p>{t.empty}</p>
          {!showCreate && <button className="primary" onClick={() => { setOutput(locale); setShowCreate(true) }}>{t.create}</button>}
        </section>}
    </div>
  </main>
}
