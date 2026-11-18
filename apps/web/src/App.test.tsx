import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from './App'
import { api } from './api'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('creates a Hindi project, submits a Hindi prompt, and previews files as text', async () => {
  vi.spyOn(api, 'projects').mockResolvedValue([])
  vi.spyOn(api, 'history').mockResolvedValue([])
  const create = vi.spyOn(api, 'create').mockResolvedValue({ id: '1', name: 'नोट्स', locale: 'hi' })
  const generate = vi.spyOn(api, 'generate').mockResolvedValue({
    id: '2', prompt: 'नोट ऐप बनाएँ', status: 'succeeded',
    files: [
      { path: 'README.md', content: '# नोट्स' },
      { path: 'index.html', content: '<script>alert(1)</script>' },
    ],
  })

  render(<App />)
  await screen.findByText('Create a project to start building.')
  fireEvent.change(screen.getByRole('combobox', { name: /UI language/ }), { target: { value: 'hi' } })
  expect(document.documentElement.lang).toBe('hi')
  fireEvent.change(screen.getByLabelText('प्रोजेक्ट का नाम'), { target: { value: 'नोट्स' } })
  fireEvent.click(screen.getByRole('button', { name: 'प्रोजेक्ट बनाएँ' }))

  await screen.findByRole('heading', { name: 'नोट्स' })
  await screen.findByText('बनाई गई फ़ाइलें यहाँ दिखेंगी।')
  expect(create).toHaveBeenCalledWith('नोट्स', 'hi')
  fireEvent.change(screen.getByLabelText('आप क्या बनाना चाहते हैं?'), { target: { value: 'नोट ऐप बनाएँ' } })
  fireEvent.click(screen.getByRole('button', { name: 'फ़ाइलें बनाएँ' }))
  expect(await screen.findByText('# नोट्स')).toBeTruthy()
  expect(generate).toHaveBeenCalledWith('1', 'नोट ऐप बनाएँ')

  fireEvent.click(screen.getByRole('button', { name: 'index.html' }))
  expect(screen.getByText('<script>alert(1)</script>').tagName).toBe('CODE')
  expect(document.querySelector('script')).toBeNull()
})

test('shows restored history for an existing project', async () => {
  vi.spyOn(api, 'projects').mockResolvedValue([{ id: '1', name: 'Notes', locale: 'en' }])
  vi.spyOn(api, 'history').mockResolvedValue([
    { id: '3', prompt: 'Retry', status: 'failed', files: [] },
    { id: '2', prompt: 'Build notes', status: 'succeeded', files: [{ path: 'main.py', content: 'print(1)' }] },
  ])

  render(<App />)
  expect(await screen.findByText('Generation failed. Try submitting your prompt again.')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Generations'), { target: { value: '2' } })
  expect(screen.getByText('print(1)')).toBeTruthy()
})
