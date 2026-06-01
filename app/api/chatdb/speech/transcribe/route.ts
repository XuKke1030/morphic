import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const upstream = await chatDbFetch(request, '/api/v1/speech/transcribe', {
    method: 'POST',
    body: formData
  })

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type':
        upstream.headers.get('Content-Type') ||
        'application/json; charset=utf-8'
    }
  })
}
