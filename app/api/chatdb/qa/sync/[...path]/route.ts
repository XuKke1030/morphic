import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

async function proxyQaSyncRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  const search = request.nextUrl.search
  const targetPath = `/api/v1/qa/sync/${path.join('/')}${search}`
  const method = request.method.toUpperCase()
  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : await request.arrayBuffer()

  const upstream = await chatDbFetch(request, targetPath, {
    method,
    body,
    tokenSource: 'admin'
  })

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type':
        upstream.headers.get('Content-Type') || 'application/json'
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
