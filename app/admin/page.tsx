import AdminDashboardDynamic from '@/components/admin-dashboard-dynamic'
import { ChatDbLoginGate } from '@/components/chatdb-login-gate'

export default function AdminPage() {
  return (
    <ChatDbLoginGate mode="admin">
      <AdminDashboardDynamic />
    </ChatDbLoginGate>
  )
}
