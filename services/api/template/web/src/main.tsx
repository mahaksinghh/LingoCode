import { createRoot } from 'react-dom/client'
import { Records, type AppSpec, type Entry, type Locale, type RecordStore } from './Records'
import definition from './spec.json'

const spec = definition as AppSpec & { locale: Locale }
document.title = spec.title
document.documentElement.lang = spec.locale

async function request(path = '', method = 'GET', body?: unknown) {
  const response = await fetch('/api/records' + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error('Request failed')
  return response
}

const store: RecordStore = {
  list: async () => (await request()).json() as Promise<Entry[]>,
  save: async (id, values) => (await request(id ? '/' + id : '', id ? 'PUT' : 'POST', { values })).json(),
  remove: async (id) => { await request('/' + id, 'DELETE') },
}

createRoot(document.getElementById('root')!).render(<Records spec={spec} locale={spec.locale} store={store} />)
