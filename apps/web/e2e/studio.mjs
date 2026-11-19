import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright-core'

const output = process.env.TEST_OUTPUT ?? '/tmp/lingocode-smoke'
const base = process.env.STUDIO_URL ?? 'http://127.0.0.1:8080'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
let page
try {
  if (process.argv.includes('--exported')) {
    const context = await browser.newContext({ httpCredentials: { username: 'studio', password: 'Smoke-test-only' } })
    page = await context.newPage()
    page.setDefaultTimeout(30000)
    await page.goto(process.env.EXPORT_URL ?? 'http://127.0.0.1:8090')
    await page.getByLabel('नाम', { exact: true }).fill('पहला काम')
    await page.getByLabel('विवरण', { exact: true }).fill('ऐप में सेव करें')
    await page.getByLabel('पूरा', { exact: true }).check()
    await page.getByRole('button', { name: 'रिकॉर्ड जोड़ें' }).click()
    await page.getByText('पहला काम', { exact: true }).waitFor()
    await page.reload()
    await page.getByText('पहला काम', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'बदलें', exact: true }).click()
    await page.getByLabel('नाम', { exact: true }).fill('बदला हुआ काम')
    await page.getByRole('button', { name: 'बदलाव सहेजें' }).click()
    await page.getByText('बदला हुआ काम', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'हटाएँ', exact: true }).click()
    await page.getByText('अभी कोई रिकॉर्ड नहीं है।').waitFor()
    console.log('Exported app passed authenticated browser CRUD and reload.')
  } else {
    await mkdir(output, { recursive: true })
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.setDefaultTimeout(30000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const email = 'smoke-' + randomUUID() + '@example.test'
    const password = 'Studio-smoke-only'
    await page.goto(base)
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByText('Create a project to start building.').waitFor()
    const rail = page.getByRole('complementary', { name: 'Projects' })
    await rail.getByRole('button', { name: 'New project' }).click()
    await rail.getByLabel('Project name').fill('कार्य प्रबंधक')
    await rail.getByLabel('Output language').selectOption('hi')
    await rail.getByRole('button', { name: 'New project' }).click()
    await page.getByLabel('What do you want to build?').fill('इंडिगो रंग का कार्य ऐप')
    await page.getByRole('button', { name: 'Plan app' }).click()
    await page.getByRole('button', { name: 'Build this plan' }).click()
    await page.getByLabel('नाम', { exact: true }).fill('झलक में पहला कार्य')
    await page.getByLabel('विवरण', { exact: true }).fill('प्रोजेक्ट शुरू करें')
    assert.equal(await page.locator('.record-app').getAttribute('data-accent'), 'indigo')
    await page.getByRole('button', { name: 'रिकॉर्ड जोड़ें' }).click()
    await page.getByText('झलक में पहला कार्य', { exact: true }).waitFor()
    await page.screenshot({ path: output + '/studio.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByText('Revise', { exact: true }).click()
    await page.getByLabel('What do you want to build?').fill('Add quantity and indigo')
    await page.getByRole('button', { name: 'Apply revision' }).click()
    await page.getByLabel('मात्रा', { exact: true }).waitFor()
    await page.getByText('Debug', { exact: true }).click()
    await page.getByLabel('What do you want to build?').fill('Review the record form')
    await page.getByRole('button', { name: 'Diagnose and revise' }).click()
    await page.getByText(/नमूना रिकॉर्ड/).waitFor()

    const activity = page.getByRole('complementary').filter({ has: page.getByRole('heading', { name: 'Activity' }) })
    await activity.getByRole('button', { name: /Build Completed/ }).click()
    await activity.getByRole('button', { name: 'Restore this revision', exact: true }).click()
    await activity.getByRole('button', { name: /Restore this revision Completed/ }).waitFor()
    await page.getByRole('button', { name: 'Source files' }).click()
    await page.getByLabel('Source file', { exact: true }).selectOption('web/src/spec.json')
    assert.match(await page.locator('pre').innerText(), /"kind": "boolean"/)
    const saved = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download ZIP' }).click()
    await (await saved).saveAs(output + '/export.zip')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByLabel('Email address').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('heading', { name: 'कार्य प्रबंधक', level: 1 }).waitFor()
    await page.getByRole('button', { name: 'Download ZIP' }).waitFor()
    assert.deepEqual(errors, [])
    console.log('Studio passed browser account, project, plan, build, preview, revise, debug, restore and export.')
  }
} catch (error) {
  if (page) {
    await page.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {})
    console.error((await page.locator('body').innerText()).slice(0, 1500))
  }
  throw error
} finally {
  await browser.close()
}
