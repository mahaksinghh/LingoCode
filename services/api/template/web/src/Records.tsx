import { useEffect, useState, type FormEvent } from 'react'
import './records.css'

export type Locale = 'en' | 'hi' | 'ta' | 'bn'
export type Field = { key: string; label: string; kind: 'text' | 'number' | 'boolean' }
export type AppSpec = {
  title: string
  description: string
  accent: 'mint' | 'indigo' | 'rose' | 'amber'
  fields: Field[]
  steps: string[]
}
export type Values = Record<string, string | number | boolean>
export type Entry = { id: string; values: Values }
export type RecordStore = {
  list(): Promise<Entry[]>
  save(id: string | null, values: Values): Promise<Entry>
  remove(id: string): Promise<void>
}

const labels = {
  en: ['New record', 'Edit record', 'Add record', 'Save changes', 'Cancel', 'Edit', 'Delete',
    'No records yet.', 'The change could not be saved or loaded.', 'Records', 'Yes', 'No'],
  hi: ['नया रिकॉर्ड', 'रिकॉर्ड बदलें', 'रिकॉर्ड जोड़ें', 'बदलाव सहेजें', 'रद्द करें', 'बदलें', 'हटाएँ',
    'अभी कोई रिकॉर्ड नहीं है।', 'बदलाव सहेजा या लोड नहीं किया जा सका।', 'रिकॉर्ड', 'हाँ', 'नहीं'],
  ta: ['புதிய பதிவு', 'பதிவைத் திருத்து', 'பதிவைச் சேர்', 'மாற்றங்களைச் சேமி', 'ரத்துசெய்', 'திருத்து', 'நீக்கு',
    'இதுவரை பதிவுகள் இல்லை.', 'மாற்றத்தைச் சேமிக்கவோ ஏற்றவோ முடியவில்லை.', 'பதிவுகள்', 'ஆம்', 'இல்லை'],
  bn: ['নতুন রেকর্ড', 'রেকর্ড সম্পাদনা', 'রেকর্ড যোগ করুন', 'পরিবর্তন সংরক্ষণ', 'বাতিল', 'সম্পাদনা', 'মুছুন',
    'এখনও কোনো রেকর্ড নেই।', 'পরিবর্তন সংরক্ষণ বা লোড করা যায়নি।', 'রেকর্ড', 'হ্যাঁ', 'না'],
}

export function Records({ spec, locale, store }: { spec: AppSpec; locale: Locale; store: RecordStore }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [values, setValues] = useState<Values>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(false)
  const [create, editForm, add, save, cancel, edit, remove, empty, failure, records, yes, no] = labels[locale]

  useEffect(() => {
    let ignore = false
    store.list().then((result) => {
      if (!ignore) setEntries(result)
    }).catch(() => {
      if (!ignore) setError(true)
    }).finally(() => {
      if (!ignore) setBusy(false)
    })
    return () => { ignore = true }
  }, [store])

  function reset() {
    setValues({})
    setEditing(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(false)
    try {
      const data = Object.fromEntries(spec.fields.map((field) => [
        field.key, values[field.key] ?? (field.kind === 'boolean' ? false : ''),
      ]))
      const record = await store.save(editing, data)
      setEntries((items) => editing ? items.map((item) => item.id === editing ? record : item) :
        [record, ...items])
      reset()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  async function deleteRecord(id: string) {
    setBusy(true)
    setError(false)
    try {
      await store.remove(id)
      setEntries((items) => items.filter((item) => item.id !== id))
      if (editing === id) reset()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return <article className="record-app" data-accent={spec.accent} lang={locale} aria-busy={busy}>
    <header><h2>{spec.title}</h2><p>{spec.description}</p></header>
    <form onSubmit={submit}>
      <h3>{editing ? editForm : create}</h3>
      <div className="record-fields">{spec.fields.map((field) => {
        const value = values[field.key]
        const change = (next: Values[string]) => setValues((current) => ({ ...current, [field.key]: next }))
        return field.kind === 'boolean' ? <label key={field.key} className="record-toggle">
          <input type="checkbox" checked={value === true} onChange={(event) => change(event.target.checked)} />
          {field.label}
        </label> : <label key={field.key}>{field.label}
          <input type={field.kind === 'number' ? 'number' : 'text'} value={typeof value === 'boolean' ? '' : value ?? ''}
            step="any" maxLength={500} required={field.kind === 'text'}
            onChange={(event) => change(field.kind === 'number' && event.target.value
              ? event.target.valueAsNumber : event.target.value)} />
        </label>
      })}</div>
      <button className="record-primary" disabled={busy}>{editing ? save : add}</button>
      {editing && <button type="button" onClick={reset}>{cancel}</button>}
      {error && <p role="alert">{failure}</p>}
    </form>
    <section aria-label={records}>
      <h3>{records} <small>{entries.length}</small></h3>
      {!entries.length && !busy && <p>{empty}</p>}
      <div className="record-list">{entries.map((entry) => <div className="record-row" key={entry.id}>
        <dl>{spec.fields.map((field) => {
          const value = entry.values[field.key]
          return <div key={field.key}><dt>{field.label}</dt>
            <dd>{typeof value === 'boolean' ? (value ? yes : no) : (value ?? '—')}</dd></div>
        })}</dl>
        <div className="record-actions">
          <button disabled={busy} onClick={() => { setEditing(entry.id); setValues(entry.values) }}>{edit}</button>
          <button disabled={busy} onClick={() => void deleteRecord(entry.id)}>{remove}</button>
        </div>
      </div>)}</div>
    </section>
  </article>
}
