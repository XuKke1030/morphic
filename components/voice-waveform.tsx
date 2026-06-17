'use client'

import { useCallback, useEffect, useRef } from 'react'

type Props = {
  analyser: AnalyserNode | null
  duration: number
  active: boolean
}

export function VoiceWaveform({ analyser, duration, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const { width: cssW, height: cssH } = canvas.getBoundingClientRect()
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    ctx.scale(dpr, dpr)

    const bufLen = analyser.fftSize
    const data = new Uint8Array(bufLen)
    analyser.getByteTimeDomainData(data)

    ctx.clearRect(0, 0, cssW, cssH)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ff784f'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()

    const sliceW = cssW / bufLen
    let x = 0
    for (let i = 0; i < bufLen; i++) {
      const v = data[i] / 128.0
      const y = (v * cssH) / 2
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
      x += sliceW
    }
    ctx.stroke()

    if (active) rafRef.current = requestAnimationFrame(draw)
  }, [analyser, active])

  useEffect(() => {
    if (active && analyser) {
      rafRef.current = requestAnimationFrame(draw)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, analyser, draw])

  if (!active) return <div className="h-[44px] w-full" />

  return (
    <div className="flex h-[44px] w-full items-center gap-3">
      <canvas ref={canvasRef} className="h-[44px] flex-1" />
      <span className="shrink-0 text-sm tabular-nums text-[#ff784f]">
        {duration}s
      </span>
    </div>
  )
}
