import { ChatDbLoginGate } from '@/components/chatdb-login-gate'
import { QuestionPlatformHome } from '@/components/question-platform-home'

export default function Page() {
  return (
    <ChatDbLoginGate mode="user">
      <QuestionPlatformHome />
    </ChatDbLoginGate>
  )
}
