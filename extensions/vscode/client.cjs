function origin(value) {
  const url = new URL(value)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Set LingoCode: Server Url to an HTTPS or local loopback origin.')
  }
  return url.origin
}

class RequestError extends Error {
  constructor(status) {
    super(status === 401 ? 'Your credentials or session are invalid.' : `Request failed (HTTP ${status}).`)
    this.status = status
  }
}

async function request(server, path, token, body, method) {
  const headers = {}
  if (token) headers.Authorization = 'Bearer ' + token
  if (body) headers['Content-Type'] = 'application/json'
  const result = await fetch(origin(server) + '/api' + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  if (!result.ok) throw new RequestError(result.status)
  return result
}

module.exports = { origin, request, RequestError }
