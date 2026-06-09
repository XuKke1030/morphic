import { NextRequest, NextResponse } from 'next/server'

import { getChatsPage } from '@/lib/actions/chat'
import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { Chat as DBChat } from '@/lib/db/schema'

interface ChatPageResponse {
  chats: DBChat[]
  nextOffset: number | null
}

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)

  try {
    const result = await getChatsPage(limit, offset)
    return NextResponse.json<ChatPageResponse>(result)
  } catch (error) {
    console.warn('Chat history is unavailable, returning an empty list:', error)
    return NextResponse.json<ChatPageResponse>({ chats: [], nextOffset: null })
  }
}
