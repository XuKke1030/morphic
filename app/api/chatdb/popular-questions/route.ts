import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search
  const upstream = await chatDbFetch(request, `/api/v1/qa/popular-questions${search}`)
  if (upstream.status === 404) {
    return Response.json({ code: 0, message: 'success', data: { list: [] } })
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
    }
  })
}
