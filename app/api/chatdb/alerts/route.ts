import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const topic = request.nextUrl.searchParams.get('topic')
  const query = topic ? `?topic=${encodeURIComponent(topic)}` : ''
  const upstream = await chatDbFetch(request, `/api/v1/alerts${query}`)

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
    }
  })
}
