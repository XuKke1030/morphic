import { ChatDbLoginGate } from '@/components/chatdb-login-gate'
import { PolicyDocumentChat } from '@/components/policy-document-chat'

export default function QaPage() {
  return (
    <ChatDbLoginGate mode="user">
      <PolicyDocumentChat />
    </ChatDbLoginGate>
  )
}
