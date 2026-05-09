import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('chatdb_token', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  })
  response.cookies.set('chatdb_admin_token', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/admin',
    maxAge: 0
  })
  return response
}
