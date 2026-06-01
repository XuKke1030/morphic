import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function DELETE(request: NextRequest) {
  const search = request.nextUrl.search
  const upstream = await chatDbFetch(
    request,
    `/api/v1/config/db/deleteConfig${search}`,
    { method: 'DELETE' }
  )

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type':
        upstream.headers.get('Content-Type') || 'application/json'
    }
  })
}
