import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const upstream = await chatDbFetch(request, '/api/v1/chats/sessions', {
    method: 'POST',
    body: JSON.stringify({
      topic: body.topic || '',
      source: body.source || 'topic_entry',
      alertId: Number(body.alertId || 0)
    })
  })

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
    }
  })
}
