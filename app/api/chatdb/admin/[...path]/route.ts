import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

async function proxyAdminRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  const search = request.nextUrl.search
  // QA sync endpoints live under /api/v1/qa/sync/, not /api/v1/admin/sync/
  const prefix =
    path.length >= 2 && path[0] === 'sync' ? '/api/v1/qa/' : '/api/v1/admin/'
  // QA sync endpoints live under /api/v1/qa/sync/ which requires user JWT, not admin JWT
  const tokenSource =
    path.length >= 2 && path[0] === 'sync' ? 'user' : 'admin'
  const targetPath = `${prefix}${path.join('/')}${search}`
  const method = request.method.toUpperCase()
  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : await request.arrayBuffer()

  const upstream = await chatDbFetch(request, targetPath, {
    method,
    body,
    tokenSource
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
  return proxyAdminRequest(request, context)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyAdminRequest(request, context)
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyAdminRequest(request, context)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyAdminRequest(request, context)
}
