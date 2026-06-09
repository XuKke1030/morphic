import AskNumberChatDynamic from '@/components/ask-number-chat-dynamic'
import { ChatDbLoginGate } from '@/components/chatdb-login-gate'

export default function AskPage({
  searchParams
}: {
  searchParams: Promise<{
    alertId?: string
    autoAsk?: string
    q?: string
    topic?: string
  }>
}) {
  return searchParams.then(params => (
    <ChatDbLoginGate mode="user">
      <AskNumberChatDynamic
        initialAlertId={Number(params.alertId || 0)}
        initialAutoAsk={params.autoAsk === '1'}
        initialQuestion={params.q || ''}
        initialTopic={params.topic || 'grid'}
      />
    </ChatDbLoginGate>
  ))
}
