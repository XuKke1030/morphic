import { NextRequest, NextResponse } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const params = new URLSearchParams()
  const metric = searchParams.get('metric')
  const region = searchParams.get('region')

  if (metric) params.set('metric', metric)
  if (region) params.set('region', region)

  const upstream = await chatDbFetch(
    request,
    `/api/v1/grid/major-case-analysis${params.toString() ? `?${params.toString()}` : ''}`
  )

  const payload = await upstream.json().catch(() => null)
  return NextResponse.json(payload, { status: upstream.status })
}
