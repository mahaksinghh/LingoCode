import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from './App'

const token = 'a'.repeat(64)
const project = { id: 'project', name: 'नोट्स', locale: 'hi', archived: false }
const spec = {
  title: 'नोट्स', description: 'अपने नोट्स सहेजें।', accent: 'mint',
  fields: [{ key: 'name', label: 'शीर्षक', kind: 'text' }],
  steps: ['पहला चरण', 'दूसरा चरण'],
}
const plan = {
  id: 'plan', prompt: 'नोट ऐप', status: 'succeeded', action: 'plan', provider: 'mock',
  source_id: null, created_at: '2026-11-18T00:00:00Z', spec, files: [],
}
const build = {
  ...plan, id: 'build', action: 'build', source_id: 'plan',
  files: [{ path: 'index.html', content: '<script>alert(1)</script>' }],
}

function reply(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('registers, creates a Hindi project, plans, builds and interacts with the preview', async () => {
  let jobs: unknown[] = []
  const requests = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/auth/register') return reply({ token, email: 'dev@example.com' })
    if (path === '/api/config') return reply({ provider: 'mock' })
    if (path === '/api/projects') return reply(init?.method === 'POST' ? project : [])
    const endpoint = '/api/projects/project/generations'
    if (path === endpoint && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body))
      const job = payload.action === 'plan' ? plan : build
      jobs = [job, ...jobs]
      return reply(job)
    }
    if (path === endpoint) return reply(jobs)
    if (path === endpoint + '/plan') return reply(plan)
    if (path === endpoint + '/build') return reply(build)
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', requests)
  render(<App />)
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'dev@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'strong-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await screen.findByText('Create a project to start building.')
  fireEvent.change(screen.getByRole('combobox', { name: /Interface language/ }), { target: { value: 'hi' } })
  expect(document.documentElement.lang).toBe('hi')
  fireEvent.click(within(screen.getByRole('complementary', { name: 'प्रोजेक्ट' })).getByRole('button', { name: 'नया प्रोजेक्ट' }))
  fireEvent.change(screen.getByLabelText('प्रोजेक्ट का नाम'), { target: { value: 'नोट्स' } })
  fireEvent.click(screen.getByRole('button', { name: 'नया प्रोजेक्ट' }))
  await screen.findByLabelText('आप क्या बनाना चाहते हैं?')
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  fireEvent.change(screen.getByLabelText('आप क्या बनाना चाहते हैं?'), { target: { value: 'नोट ऐप' } })
  fireEvent.click(screen.getByRole('button', { name: 'योजना बनाएँ' }))
  fireEvent.click(await screen.findByRole('button', { name: 'इस योजना से ऐप बनाएँ' }))
  fireEvent.change(await screen.findByLabelText('शीर्षक'), { target: { value: 'पहला नोट' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'रिकॉर्ड जोड़ें' }).hasAttribute('disabled')).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'रिकॉर्ड जोड़ें' }))
  expect(await screen.findByText('पहला नोट')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'स्रोत फ़ाइलें' }))
  expect(screen.getByText('<script>alert(1)</script>').tagName).toBe('CODE')
  expect(document.querySelector('script')).toBeNull()
})

test('returns to sign-in after an expired saved session', async () => {
  window.localStorage.setItem('lingocode-session', JSON.stringify({ token, email: 'dev@example.com' }))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
  render(<App />)
  expect(await screen.findByText('Your session expired. Sign in again to continue.')).toBeTruthy()
  expect(window.localStorage.getItem('lingocode-session')).toBeNull()
})
