import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const upstream = await chatDbFetch(
    request,
    `/api/v1/chats/sessions/${encodeURIComponent(sessionId)}/reset`,
    { method: 'POST' }
  )

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  })
}
