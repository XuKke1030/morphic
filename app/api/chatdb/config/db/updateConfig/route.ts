import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function PUT(request: NextRequest) {
  const body = await request.arrayBuffer()
  const upstream = await chatDbFetch(
    request,
    '/api/v1/config/db/updateConfig',
    {
      method: 'PUT',
      body
    }
  )

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type':
        upstream.headers.get('Content-Type') || 'application/json'
    }
  })
}
