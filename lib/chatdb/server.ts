import { NextRequest } from 'next/server'

export function getChatDbApiBase() {
  return (process.env.CHATDB_API_BASE || 'http://127.0.0.1:8000').replace(
    /\/$/,
    ''
  )
}

export async function getChatDbToken(apiBase: string, request?: NextRequest) {
  const configuredToken = process.env.CHATDB_JWT_TOKEN
  const incomingToken = request?.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
  const cookieToken = request?.cookies.get('chatdb_token')?.value

  if (configuredToken || incomingToken || cookieToken) {
    return configuredToken || incomingToken || cookieToken || ''
  }

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
  return payload?.data?.token || payload?.token || ''
}

export async function chatDbFetch(
  request: NextRequest,
  path: string,
  init: RequestInit = {}
) {
  const apiBase = getChatDbApiBase()
  const token = await getChatDbToken(apiBase, request)
  const headers = new Headers(init.headers)
  const isFormDataBody =
    typeof FormData !== 'undefined' && init.body instanceof FormData

  if (!headers.has('Content-Type') && init.body && !isFormDataBody) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(`${apiBase}${path}`, {
    ...init,
    headers
  })
}
