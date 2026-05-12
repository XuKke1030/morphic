import { NextRequest } from 'next/server'

import { getChatDbApiBase } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

async function proxyQaSyncRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const apiBase = getChatDbApiBase()
  const { path } = await context.params
  const search = request.nextUrl.search
  const targetPath = `/api/v1/qa/sync/${path.join('/')}${search}`
  const headers = new Headers()
  const contentType = request.headers.get('Content-Type')
  const adminToken = request.cookies.get('chatdb_admin_token')?.value

  if (contentType) {
    headers.set('Content-Type', contentType)
  }
  if (adminToken) {
    headers.set('Authorization', `Bearer ${adminToken}`)
  }

  const method = request.method.toUpperCase()
  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : await request.arrayBuffer()
  const upstream = await fetch(`${apiBase}${targetPath}`, {
    method,
    headers,
    body
  })

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
    }
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyQaSyncRequest(request, context)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyQaSyncRequest(request, context)
}
