'use client'

import dynamic from 'next/dynamic'

const AskNumberChat = dynamic(
  () => import('@/components/ask-number-chat').then(m => m.AskNumberChat),
  { ssr: false }
)

export default function AskNumberChatDynamic(props: {
  initialAlertId: number
  initialAutoAsk: boolean
  initialQuestion: string
  initialTopic: string
}) {
  return <AskNumberChat {...props} />
}
