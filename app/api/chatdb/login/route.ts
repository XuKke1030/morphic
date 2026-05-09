import { NextRequest, NextResponse } from 'next/server'

import { getChatDbApiBase } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const apiBase = getChatDbApiBase()
  const body = await request.text()
  const upstream = await fetch(`${apiBase}/api/v1/user/login`, {
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
      response.cookies.set('chatdb_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7
      })
    }
  } catch {
    // Keep upstream response unchanged if it is not JSON.
  }

  return response
}
