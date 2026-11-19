const test = require('node:test')
const assert = require('node:assert/strict')
const { origin } = require('./client.cjs')

test('allows HTTPS and loopback endpoints and rejects ambiguous or insecure URLs', () => {
  assert.equal(origin('https://example.org:8443/'), 'https://example.org:8443')
  assert.equal(origin('http://127.0.0.1:8080'), 'http://127.0.0.1:8080')
  for (const url of ['http://example.org', 'https://user@host', 'https://host/api', 'https://host/#x']) {
    assert.throws(() => origin(url))
  }
})
