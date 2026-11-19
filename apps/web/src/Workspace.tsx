import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Records, type Entry, type RecordStore } from '../../../services/api/template/web/src/Records'
import { ApiError, type Action, type Job, type JobSummary, type Project, type StudioClient } from './api'
import { languages, type Copy } from './messages'
import { Recognition } from './voice'

const pending = (job: JobSummary) => job.status === 'queued' || job.status === 'running'
const speechLocale = { en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', bn: 'bn-IN' }
type View = 'planTitle' | 'preview' | 'files'

function createPreviewStore(revisionId: string): RecordStore {
  const key = 'lingocode-preview:' + revisionId
  const read = (): Entry[] => JSON.parse(window.localStorage.getItem(key) ?? '[]')
  const write = (data: Entry[]) => window.localStorage.setItem(key, JSON.stringify(data))
  return {
    list: async () => read(),
    save: async (id, values) => {
      const entries = read()
      const record = { id: id ?? crypto.randomUUID(), values }
      if (!id && entries.length >= 100) throw new Error('Preview capacity reached')
      write(id ? entries.map((entry) => entry.id === id ? record : entry) : [record, ...entries])
      return record
    },
    remove: async (id) => { write(read().filter((entry) => entry.id !== id)) },
  }
}

function Preview({ job, project, t }: { job: Job; project: Project; t: Copy }) {
  const store = useMemo(() => createPreviewStore(job.id), [job.id])
  if (!job.spec) return <p className="panel-empty">{t.noPreview}</p>
  return <div className="preview-wrap">
    <Records key={job.id} spec={job.spec} locale={project.locale} store={store} />
    <small className="muted">{t.previewData}</small>
  </div>
}

function PromptForm({ t, project, busy, job, submit }: {
  t: Copy; project: Project; busy: boolean; job?: Job
  submit: (action: Action, prompt: string, sourceId?: string) => Promise<void>
}) {
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<'plan' | 'revise' | 'debug'>('plan')
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState(false)
  const recognition = useRef<InstanceType<NonNullable<typeof Recognition>>>(null)
  const canRevise = Boolean(job?.spec && job.files.length)
  const action = canRevise ? mode : 'plan'

  useEffect(() => () => {
    const active = recognition.current
    if (active) {
      active.onresult = null
      active.onend = null
      active.onerror = null
      active.abort()
    }
  }, [])

  function dictate() {
    if (recognition.current) {
      recognition.current.stop()
      return
    }
    if (!Recognition) return
    setVoiceError(false)
    try {
      const input = new Recognition()
      input.lang = speechLocale[project.locale]
      input.interimResults = false
      input.onresult = (event) => {
        const added = Array.from(event.results, (result) => result[0]?.transcript ?? '').join(' ').trim()
        setPrompt((value) => [value.trim(), added].filter(Boolean).join(' ').slice(0, 6000))
      }
      input.onerror = () => { setVoiceError(true) }
      input.onend = () => { recognition.current = null; setListening(false) }
      input.start()
      recognition.current = input
      setListening(true)
    } catch {
      setVoiceError(true)
    }
  }

  return <form className="prompt-card" onSubmit={(event) => {
    event.preventDefault()
    if (prompt.trim()) void submit(action, prompt.trim(), action === 'plan' ? undefined : job?.id)
  }}>
    {canRevise && <fieldset className="segmented">
      <legend className="sr-only">{t.prompt}</legend>
      {(['plan', 'revise', 'debug'] as const).map((option) => <label key={option}>
        <input type="radio" name="prompt-mode" checked={action === option} onChange={() => setMode(option)} />
        <span>{t[option]}</span>
      </label>)}
    </fieldset>}
    <label htmlFor="prompt">{t.prompt}</label>
    <textarea id="prompt" dir="auto" rows={3} value={prompt} maxLength={6000}
      placeholder={action === 'plan' ? t.placeholder : t.revisePlaceholder}
      onChange={(event) => setPrompt(event.target.value)} />
    <div className="prompt-actions">
      {Recognition && <button className="quiet" type="button" onClick={dictate} aria-pressed={listening}>
        {listening ? t.stopVoice : t.voice}
      </button>}
      <button className="primary" disabled={busy || listening || !prompt.trim()}>
        {action === 'plan' ? t.planApp : action === 'revise' ? t.reviseApp : t.debugApp} <span aria-hidden="true">↗</span>
      </button>
    </div>
    {voiceError && <p role="alert">{t.voiceError}</p>}
  </form>
}

export function Workspace({ project, api, t, onUpdate, onExpired }: {
  project: Project; api: StudioClient; t: Copy; onUpdate: (project: Project) => void; onExpired: () => void
}) {
  const [history, setHistory] = useState<JobSummary[]>([])
  const [selected, setSelected] = useState('')
  const [job, setJob] = useState<Job>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(false)
  const [rename, setRename] = useState(false)
  const [view, setView] = useState<View>('planTitle')
  const [filePath, setFilePath] = useState('')
  const summary = history.find((item) => item.id === selected)
  const current = job?.id === selected && summary?.status === job?.status ? job : undefined
  const active = history.some(pending)
  const report = useCallback((reason: unknown) => {
    if (reason instanceof ApiError && reason.status === 401) onExpired()
    else setProblem(true)
  }, [onExpired])

  useEffect(() => {
    const controller = new AbortController()
    api.history(project.id, controller.signal).then((items) => {
      if (controller.signal.aborted) return
      setHistory(items)
      setSelected(items[0]?.id ?? '')
      setView(items[0]?.action === 'plan' || items[0]?.action === 'debug' || !items.length ? 'planTitle' : 'preview')
    }).catch((reason) => { if (!controller.signal.aborted) report(reason) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [api, project.id, report])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const items = await api.history(project.id, controller.signal)
        if (!controller.signal.aborted) setHistory(items)
      } catch (reason) {
        if (!controller.signal.aborted) report(reason)
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1300)
      }
    }
    timer = setTimeout(poll, 700)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [api, project.id, active, report])

  const status = summary?.status
  useEffect(() => {
    if (status !== 'succeeded') return
    const controller = new AbortController()
    api.revision(project.id, selected, controller.signal).then((revision) => {
      if (!controller.signal.aborted) setJob(revision)
    }).catch((reason) => { if (!controller.signal.aborted) report(reason) })
    return () => controller.abort()
  }, [api, project.id, selected, status, report])

  async function perform(operation: () => Promise<void>) {
    setBusy(true)
    setProblem(false)
    try {
      await operation()
    } catch (reason) {
      report(reason)
    } finally {
      setBusy(false)
    }
  }

  async function submit(action: Action, prompt: string, sourceId?: string) {
    await perform(async () => {
      const next = await api.generate(project.id, prompt, action, sourceId)
      setHistory((items) => [next, ...items])
      select(next)
    })
  }

  function select(next: JobSummary) {
    setSelected(next.id)
    setView(next.action === 'plan' || next.action === 'debug' ? 'planTitle' : 'preview')
    setFilePath('')
  }

  function download() {
    if (!current) return
    void perform(async () => {
      const blob = await api.export(project.id, current.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'lingocode-app.zip'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }

  function updateProject(name: string, archived: boolean) {
    if (!name) return
    void perform(async () => {
      onUpdate(await api.update(project.id, name, archived))
      setRename(false)
    })
  }

  function renameProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateProject(String(new FormData(event.currentTarget).get('name')).trim(), project.archived)
  }

  function restore() {
    if (!current) return
    void perform(async () => {
      const copy = await api.restore(project.id, current.id)
      setHistory((items) => [copy, ...items])
      setJob(copy)
      select(copy)
    })
  }

  const file = current?.files.find((item) => item.path === filePath) ?? current?.files[0]
  const disabled = busy || active || loading

  return <>
    <header className="project-heading">
      <div>
        <span className="subtle-label" lang={project.locale}>{languages[project.locale]}</span>
        <h1>{project.name}</h1>
      </div>
      <div className="project-actions">
        <button className="quiet" disabled={busy} onClick={() => setRename(!rename)}>{rename ? t.cancel : t.rename}</button>
        <button className="quiet" disabled={busy} onClick={() => updateProject(project.name, !project.archived)}>
          {project.archived ? t.unarchive : t.archive}
        </button>
        {file && <button className="primary" disabled={busy} onClick={download}>{t.deploy} <span aria-hidden="true">↓</span></button>}
      </div>
    </header>
    {rename && <form className="rename-form" onSubmit={renameProject}>
      <label>{t.name}<input name="name" defaultValue={project.name} required autoFocus maxLength={100} /></label>
      <button className="primary" disabled={busy}>{t.save}</button>
    </form>}
    {problem && <p role="alert" className="notice">{t.error}</p>}
    {project.archived ? <p className="notice">{t.archived}</p> :
      <PromptForm t={t} project={project} busy={disabled} job={current} submit={submit} />}
    <div className="work-grid">
      <section className="output-card" aria-label={t.current}>
        <nav className="views" aria-label={t.current}>
          {(['planTitle', 'preview', 'files'] as const).map((item) => <button key={item} aria-pressed={view === item}
            onClick={() => setView(item)}>{t[item]}</button>)}
        </nav>
        {loading || status === 'queued' || status === 'running' ? <p className="panel-empty" role="status">
          {loading ? t.loading : status === 'queued' ? t.queue : t.running}
        </p> : status === 'failed' ? <p className="panel-empty" role="alert">{t.failed}</p> :
          view === 'planTitle' ? current?.spec ? <div className="plan">
            <div lang={project.locale}>
              <h2>{current.spec.title}</h2><p>{current.spec.description}</p>
              <ol>{current.spec.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
            </div>
            <h3>{t.planFields}</h3>
            <ul className="field-list">{current.spec.fields.map((field) =>
              <li key={field.key}>{field.label}<small>{t[field.kind]}</small></li>)}</ul>
            {current.action === 'plan' && !project.archived && <button className="primary" disabled={disabled}
              onClick={() => void submit('build', current.prompt, current.id)}>{t.buildPlan} <span aria-hidden="true">↗</span></button>}
          </div> : <p className="panel-empty">{summary ? t.loading : t.noHistory}</p> :
            view === 'preview' ? current && file && current.spec ? <Preview job={current} project={project} t={t} />
              : <p className="panel-empty">{t.noPreview}</p> :
              current && file ? <div className="source-panel">
                <label htmlFor="source-file">{t.source}</label>
                <select id="source-file" value={file.path} onChange={(event) => setFilePath(event.target.value)}>
                  {current.files.map((item) => <option key={item.path}>{item.path}</option>)}
                </select>
                <pre tabIndex={0}><code>{file.content}</code></pre>
              </div> : <p className="panel-empty">{t.noFiles}</p>}
      </section>
      <aside className="activity">
        <h2>{t.history}</h2>
        {!history.length && <p className="muted">{t.noHistory}</p>}
        <ul>{history.map((item) => <li key={item.id}>
          <button aria-pressed={item.id === selected} onClick={() => select(item)}>
            <span>{item.action === 'restore' ? t.restore : t[item.action]}</span>
            <small>{t[item.status === 'failed' ? 'failedStatus' : item.status === 'running' ? 'runningStatus' : item.status]}</small>
            <span className="activity-prompt">{item.prompt}</span>
          </button>
        </li>)}</ul>
        {file && current && !project.archived && history[0]?.id !== current.id &&
          <button className="quiet restore" disabled={disabled} onClick={restore}>{t.restore}</button>}
        {file && <details><summary>{t.setup}</summary><p>{t.setupText}</p></details>}
      </aside>
    </div>
  </>
}
