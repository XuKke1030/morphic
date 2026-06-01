import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search
  const upstream = await chatDbFetch(
    request,
    `/api/v1/export/download${search}`
  )

  // Export/download may return binary (xlsx/json), so stream the raw
  // response body and forward the upstream Content-Type.
  const contentType =
    upstream.headers.get('Content-Type') || 'application/octet-stream'
  const contentDisposition = upstream.headers.get('Content-Disposition')

  const headers: Record<string, string> = { 'Content-Type': contentType }
  if (contentDisposition) {
    headers['Content-Disposition'] = contentDisposition
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers
  })
}
