import { NextRequest } from 'next/server'

export function getChatDbApiBase() {
  return (process.env.CHATDB_API_BASE || 'http://127.0.0.1:8000').replace(
    /\/$/,
    ''
  )
}

type TokenSource = 'user' | 'admin'

interface CachedToken {
  value: string
  expiresAt: number // epoch ms
}

// Module-level token cache to avoid repeated login calls
let cachedToken: CachedToken | null = null

function isTokenValid(): boolean {
  return !!cachedToken && Date.now() < cachedToken.expiresAt
}

async function getChatDbToken(
  apiBase: string,
  request: NextRequest,
  source: TokenSource
) {
  const configuredToken = process.env.CHATDB_JWT_TOKEN
  if (configuredToken) return configuredToken

  const incomingToken = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
  if (incomingToken) return incomingToken

  const cookieName =
    source === 'admin' ? 'chatdb_admin_token' : 'chatdb_token'
  const cookieToken = request.cookies.get(cookieName)?.value
  if (cookieToken) return cookieToken

  if (source === 'admin') return ''

  // Return cached token if still valid (with 60s safety margin)
  if (isTokenValid()) return cachedToken!.value

  const username = process.env.CHATDB_USERNAME
  const password = process.env.CHATDB_PASSWORD
  if (!username || !password) return ''

  const loginResponse = await fetch(`${apiBase}/api/v1/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (!loginResponse.ok) return ''
  const payload = await loginResponse.json().catch(() => null)
  const token = payload?.data?.token || payload?.token || ''
  if (!token) return ''

  let expireMs = payload?.data?.expire || payload?.expire
  // Normalize: if expire looks like seconds (value < 1e12), convert to ms
  if (expireMs && expireMs < 1e12) {
    expireMs = expireMs * 1000
  }
  // Cache with 60s safety margin before actual expiry
  const expiresAt = expireMs
    ? expireMs - 60_000
    : Date.now() + 24 * 60 * 60 * 1000 - 60_000
  cachedToken = { value: token, expiresAt }

  return token
}

export async function chatDbFetch(
  request: NextRequest,
  path: string,
  init: RequestInit & { tokenSource?: TokenSource } = {}
) {
  const { tokenSource = 'user', ...rest } = init
  const apiBase = getChatDbApiBase()
  const token = await getChatDbToken(apiBase, request, tokenSource)
  const headers = new Headers(rest.headers)
  const isFormDataBody =
    typeof FormData !== 'undefined' && rest.body instanceof FormData

  if (!headers.has('Content-Type') && rest.body && !isFormDataBody) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(`${apiBase}${path}`, {
    ...rest,
    headers
  })
}
