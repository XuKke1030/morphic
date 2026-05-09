import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ citationId: string }> }
) {
  const { citationId } = await params
  const upstream = await chatDbFetch(
    request,
    `/api/v1/qa/citations/${encodeURIComponent(citationId)}`
  )

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
    }
  })
}
