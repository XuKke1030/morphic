import { NextRequest, NextResponse } from 'next/server'

import { getChatDbApiBase } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const apiBase = getChatDbApiBase()
  const body = await request.text()
  const upstream = await fetch(`${apiBase}/api/v1/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })

  const payload = await upstream.text()
  const response = new NextResponse(payload, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
    }
  })

  try {
    const json = JSON.parse(payload)
    const token = json?.data?.token || json?.token
    if (token) {
      let expireMs = json?.data?.expire || json?.expire
      // Normalize: if expire looks like seconds (value < 1e12), convert to ms
      if (expireMs && expireMs < 1e12) {
        expireMs = expireMs * 1000
      }
      // Align cookie maxAge with backend JWT expiry (admin = 8h)
      const maxAge = expireMs
        ? Math.max(1, Math.floor((expireMs - Date.now()) / 1000))
        : 8 * 60 * 60
      response.cookies.set('chatdb_admin_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge
      })
      // Also set user token cookie so admin can access user-scoped endpoints (e.g. QA sync)
      // Restrict path to /api/chatdb/admin/sync so it doesn't leak into user-side requests
      const userToken = json?.data?.userToken
      if (userToken) {
        response.cookies.set('chatdb_token', userToken, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/api/chatdb/admin/sync',
          maxAge
        })
      }
    }
  } catch {
    // Keep upstream response unchanged if it is not JSON.
  }

  return response
}
