import { NextRequest, NextResponse } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search
  const upstream = await chatDbFetch(
    request,
    `/api/v1/grid/major-case-analysis${search}`
  )

  const payload = await upstream.json().catch(() => null)
  return NextResponse.json(payload, { status: upstream.status })
}
