import { useEffect, useState, type FormEvent } from 'react'
import { api, type Generation, type Locale, type Project } from './api'
import { messages } from './messages'

const languages = { en: 'English', hi: 'हिन्दी' }

export function App() {
  const [locale, setLocale] = useState<Locale>('en')
  const [output, setOutput] = useState<Locale>('en')
  const [name, setName] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project>()
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(false)
  const t = messages[locale]

  useEffect(() => {
    const controller = new AbortController()
    api.projects(controller.signal).then((items) => {
      setProjects(items)
      setSelected(items[0])
    }).catch(() => {
      if (!controller.signal.aborted) setError(true)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    setError(false)
    try {
      const project = await api.create(name.trim(), output)
      setProjects((items) => [project, ...items])
      setSelected(project)
      setName('')
    } catch {
      setError(true)
    } finally {
      setCreating(false)
    }
  }

  return <>
    <header className="topbar">
      <div className="brand"><span aria-hidden="true">&lt;/&gt;</span> LingoCode</div>
      <select aria-label="UI language / इंटरफ़ेस की भाषा" value={locale} onChange={(event) => {
        const next = event.target.value as Locale
        setLocale(next)
        setOutput(next)
      }}>
        <option value="en" lang="en">English</option>
        <option value="hi" lang="hi">हिन्दी</option>
      </select>
    </header>
    <main className="layout">
      <aside className="sidebar" aria-label={t.projects}>
        <h2>{t.projects}</h2>
        <form onSubmit={create}>
          <label>{t.name}<input required maxLength={100} value={name}
            onChange={(event) => setName(event.target.value)} /></label>
          <label>{t.output}<select value={output} onChange={(event) => setOutput(event.target.value as Locale)}>
            <option value="en" lang="en">English</option>
            <option value="hi" lang="hi">हिन्दी</option>
          </select></label>
          <button className="primary" disabled={loading || creating || !name.trim()}>{t.create}</button>
        </form>
        <ul className="items">
          {projects.map((project) => <li key={project.id}>
            <button aria-pressed={selected?.id === project.id} onClick={() => setSelected(project)}>
              {project.name}
            </button>
          </li>)}
        </ul>
      </aside>
      <section className="workspace">
        {error && <p role="alert">{t.error}</p>}
        {loading ? <p role="status">{t.loading}</p> : selected ? (
          <ProjectWorkspace key={selected.id} project={selected} locale={locale} />
        ) : <><h1>{t.workspace}</h1><p className="empty">{t.empty}</p></>}
      </section>
    </main>
  </>
}

function ProjectWorkspace({ project, locale }: { project: Project; locale: Locale }) {
  const [prompt, setPrompt] = useState('')
  const [jobs, setJobs] = useState<Generation[]>([])
  const [jobId, setJobId] = useState('')
  const [filePath, setFilePath] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(false)
  const t = messages[locale]
  const job = jobs.find((item) => item.id === jobId)
  const file = job?.files.find((item) => item.path === filePath) ?? job?.files[0]

  useEffect(() => {
    const controller = new AbortController()
    api.history(project.id, controller.signal).then((history) => {
      setJobs(history)
      setJobId(history[0]?.id ?? '')
    }).catch(() => {
      if (!controller.signal.aborted) setError(true)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [project.id])

  async function generate(event: FormEvent) {
    event.preventDefault()
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setError(false)
    try {
      const result = await api.generate(project.id, prompt.trim())
      setJobs((items) => [result, ...items])
      setJobId(result.id)
      setFilePath('')
    } catch {
      setError(true)
    } finally {
      setGenerating(false)
    }
  }

  return <>
    <div className="heading">
      <h1>{project.name}</h1>
      <span className="locale" lang={project.locale}>{languages[project.locale]}</span>
    </div>
    <form className="prompt" onSubmit={generate}>
      <label>{t.prompt}
        <textarea dir="auto" required maxLength={6000} rows={4} placeholder={t.placeholder}
          value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      <button className="primary" disabled={loading || generating || !prompt.trim()}>{t.generate}</button>
      {generating && <span className="muted" role="status">{t.generating}</span>}
    </form>
    {error && <p role="alert">{t.error}</p>}
    {jobs.length > 0 && <label className="history">{t.history}
      <select value={jobId} onChange={(event) => {
        setJobId(event.target.value)
        setFilePath('')
      }}>
        {jobs.map((item, index) => <option key={item.id} value={item.id}>
          {jobs.length - index}. {item.prompt.slice(0, 72)}
        </option>)}
      </select>
    </label>}
    <div className="results">
      <section aria-label={t.files} className="explorer">
        <h2>{t.files}</h2>
        <ul className="items">
          {job?.files.map((item) => <li key={item.path}>
            <button aria-pressed={file?.path === item.path} onClick={() => setFilePath(item.path)}>
              {item.path}
            </button>
          </li>)}
        </ul>
      </section>
      <section aria-label={t.preview} className="preview">
        <h2>{file?.path ?? t.preview}</h2>
        {file ? <pre tabIndex={0}><code>{file.content}</code></pre> :
          <p className="empty" role="status">{loading ? t.loading :
            job?.status === 'failed' ? t.failed : job?.status === 'running' ? t.running : t.noFiles}</p>}
      </section>
    </div>
  </>
}
