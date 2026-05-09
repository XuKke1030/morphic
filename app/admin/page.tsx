import { AdminDashboard } from '@/components/admin-dashboard'
import { ChatDbLoginGate } from '@/components/chatdb-login-gate'

export default function AdminPage() {
  return (
    <ChatDbLoginGate mode="admin">
      <AdminDashboard />
    </ChatDbLoginGate>
  )
}
