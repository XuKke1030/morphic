import { NextRequest } from 'next/server'

import { chatDbFetch } from '@/lib/chatdb/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const knowledgeCode = String(body.knowledgeCode || '').trim()
  const topic = String(body.topic || '').trim()
  const upstreamPath = knowledgeCode ? '/api/v1/qa/chats' : '/api/v1/chats'
  const upstreamBody = knowledgeCode
    ? {
        ai: process.env.CHATDB_AI || 'deepseek',
        model: process.env.CHATDB_MODEL || 'deepseek-chat',
        knowledgeCode,
        message: body.message || '',
        sessionId: body.sessionId || '',
        history: Array.isArray(body.context) ? body.context : [],
        topK: Number(body.topK || 5),
        deepThinking: Boolean(body.deepThinking),
        webSearch: Boolean(body.webSearch)
      }
    : {
        ai: process.env.CHATDB_AI || 'deepseek',
        model: process.env.CHATDB_MODEL || 'deepseek-chat',
        databaseId: Number(body.databaseId || process.env.CHATDB_DATABASE_ID || 1),
        topic,
        message: body.message || '',
        sessionId: body.sessionId || '',
        history: Array.isArray(body.context) ? body.context : []
      }

  const upstream = await chatDbFetch(request, upstreamPath, {
    method: 'POST',
    body: JSON.stringify(upstreamBody)
  })

  if (!upstream.ok) {
    return new Response(await upstream.text(), { status: upstream.status })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  })
}
