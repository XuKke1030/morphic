import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const upstream = await chatDbFetch(request, '/api/v1/user/bootstrap')
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
    }
  })
}
