'use client'

import dynamic from 'next/dynamic'

const AdminDashboard = dynamic(
  () => import('@/components/admin-dashboard').then(m => m.AdminDashboard),
  { ssr: false }
)

export default function AdminDashboardDynamic() {
  return <AdminDashboard />
}
