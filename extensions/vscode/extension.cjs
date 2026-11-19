const vscode = require('vscode')
const { origin, request, RequestError } = require('./client.cjs')

const languageIds = { html: 'html', css: 'css', tsx: 'typescriptreact', ts: 'typescript',
  json: 'json', md: 'markdown', py: 'python', yaml: 'yaml', yml: 'yaml', sql: 'sql' }

function activate(context) {
  function server() {
    const value = vscode.workspace.getConfiguration('lingocode').get('serverUrl')
    return origin(value)
  }

  async function tokenFor(host) {
    const key = 'session:' + host
    const stored = await context.secrets.get(key)
    if (stored) return stored
    const email = await vscode.window.showInputBox({
      prompt: `LingoCode account email for ${host}`, ignoreFocusOut: true,
    })
    if (!email) return
    const password = await vscode.window.showInputBox({
      prompt: 'LingoCode password', password: true, ignoreFocusOut: true,
    })
    if (!password) return
    const session = await (await request(host, '/auth/login', undefined, { email, password })).json()
    await context.secrets.store(key, session.token)
    return session.token
  }

  async function selectRevision(host, token) {
    const projects = await (await request(host, '/projects', token)).json()
    if (!projects.length) {
      void vscode.window.showInformationMessage('Create a project in LingoCode Studio first.')
      return
    }
    const project = await vscode.window.showQuickPick(
      projects.map((item) => ({ label: item.name, description: item.locale, id: item.id })),
      { placeHolder: 'Select a LingoCode project' },
    )
    if (!project) return
    const path = '/projects/' + encodeURIComponent(project.id) + '/generations'
    const history = await (await request(host, path, token)).json()
    const builds = history.filter((item) => item.status === 'succeeded' && item.action !== 'plan')
    if (!builds.length) {
      void vscode.window.showInformationMessage('Build an app in this project first.')
      return
    }
    const job = await vscode.window.showQuickPick(
      builds.map((item) => ({ label: item.action, description: item.prompt, id: item.id })),
      { placeHolder: 'Select an app revision' },
    )
    if (job) return path + '/' + encodeURIComponent(job.id)
  }

  function register(command, handler) {
    context.subscriptions.push(vscode.commands.registerCommand(command, async () => {
      let host
      try {
        host = server()
        await handler(host)
      } catch (error) {
        if (host && error instanceof RequestError && error.status === 401) {
          await context.secrets.delete('session:' + host)
        }
        void vscode.window.showErrorMessage(`LingoCode · ${error.message}`)
      }
    }))
  }

  register('lingocode.open', async (host) => {
    const token = await tokenFor(host)
    if (!token) return
    const path = await selectRevision(host, token)
    if (!path) return
    const job = await (await request(host, path, token)).json()
    const file = await vscode.window.showQuickPick(
      job.files.map((item) => ({ label: item.path, content: item.content })),
      { placeHolder: 'Open a generated source file' },
    )
    if (!file) return
    const language = languageIds[file.label.split('.').at(-1)] ?? 'plaintext'
    const document = await vscode.workspace.openTextDocument({ content: file.content, language })
    await vscode.window.showTextDocument(document)
  })

  register('lingocode.export', async (host) => {
    const token = await tokenFor(host)
    if (!token) return
    const path = await selectRevision(host, token)
    if (!path) return
    const target = await vscode.window.showSaveDialog({ filters: { 'ZIP archive': ['zip'] } })
    if (!target) return
    const data = new Uint8Array(await (await request(host, path + '/export', token)).arrayBuffer())
    await vscode.workspace.fs.writeFile(target, data)
    void vscode.window.showInformationMessage('LingoCode project ZIP saved.')
  })

  register('lingocode.logout', async (host) => {
    const key = 'session:' + host
    const token = await context.secrets.get(key)
    if (!token) return
    await request(host, '/auth/logout', token, undefined, 'POST')
    await context.secrets.delete(key)
    void vscode.window.showInformationMessage('Signed out of LingoCode Studio.')
  })
}

module.exports = { activate }
