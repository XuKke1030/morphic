import { AskNumberChat } from '@/components/ask-number-chat'
import { ChatDbLoginGate } from '@/components/chatdb-login-gate'

export default function AskPage({
  searchParams
}: {
  searchParams: Promise<{ topic?: string }>
}) {
  return searchParams.then(params => (
    <ChatDbLoginGate mode="user">
      <AskNumberChat initialTopic={params.topic || 'grid'} />
    </ChatDbLoginGate>
  ))
}
