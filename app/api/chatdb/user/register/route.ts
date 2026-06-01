import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.arrayBuffer()
  const upstream = await chatDbFetch(request, '/api/v1/user/register', {
    method: 'POST',
    body
  })

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type':
        upstream.headers.get('Content-Type') || 'application/json'
    }
  })
}
