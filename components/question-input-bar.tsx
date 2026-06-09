'use client'

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'

import { Mic, MicOff, Send, Square } from 'lucide-react'

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

type QuestionInputBarProps = {
  value: string
  maxLength?: number
  loading: boolean
  placeholder: string
  disabled?: boolean
  topic?: string
  onChange: (value: string) => void
  onSubmit: (question?: string) => void
  onStop: () => void
}

const DEFAULT_SILENCE_TIMEOUT_MS = 3000
const MAX_RECORDING_MS = 30000
const MIN_RECORDING_MS = 500
const SILENCE_VOLUME_THRESHOLD = 0.02

function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ]
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || ''
}

function audioExtension(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

export function QuestionInputBar({
  value,
  maxLength = 100,
  loading,
  placeholder,
  disabled = false,
  topic = '',
  onChange,
  onSubmit,
  onStop
}: QuestionInputBarProps) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const silenceStartedAtRef = useRef<number | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)

  const clearTimers = () => {
    if (silenceTimerRef.current !== null) {
      window.clearInterval(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
  }

  const cleanupAudio = () => {
    clearTimers()
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    void audioContextRef.current?.close().catch(() => undefined)
    audioContextRef.current = null
    analyserRef.current = null
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }

  const transcribeAudio = async (
    blob: Blob,
    durationMs: number,
    mimeType: string
  ) => {
    setTranscribing(true)
    setVoiceError('')
    try {
      const formData = new FormData()
      formData.append(
        'file',
        blob,
        `question-${Date.now()}.${audioExtension(mimeType)}`
      )
      formData.append('topic', topic)
      formData.append('durationMs', String(Math.round(durationMs)))

      const response = await fetch('/api/chatdb/speech/transcribe', {
        method: 'POST',
        credentials: 'include',
        body: formData
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || '语音识别失败')
      }
      const text = String(payload?.data?.text || payload?.text || '')
        .trim()
        .slice(0, maxLength)
      if (!text) {
        throw new Error('没有识别到有效语音')
      }
      onChange(text)
    } catch (error) {
      setVoiceError(
        error instanceof Error
          ? error.message
          : '语音识别失败，请重试或手动输入'
      )
    } finally {
      setTranscribing(false)
    }
  }

  const watchSilence = () => {
    const analyser = analyserRef.current
    if (!analyser) return

    const data = new Uint8Array(analyser.fftSize)
    silenceTimerRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const value of data) {
        const normalized = (value - 128) / 128
        sum += normalized * normalized
      }
      const volume = Math.sqrt(sum / data.length)
      const now = Date.now()
      if (now - startedAtRef.current < 800) return
      if (volume < SILENCE_VOLUME_THRESHOLD) {
        if (silenceStartedAtRef.current === null) {
          silenceStartedAtRef.current = now
        }
        if (now - silenceStartedAtRef.current >= DEFAULT_SILENCE_TIMEOUT_MS) {
          stopRecording()
        }
      } else {
        silenceStartedAtRef.current = null
      }
    }, 100)
  }

  const startRecording = async () => {
    if (disabled || loading || recording || transcribing) return
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setVoiceError('当前浏览器不支持录音，请手动输入')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setVoiceError('当前浏览器不支持 MediaRecorder，请手动输入')
      return
    }

    try {
      setVoiceError('')
      chunksRef.current = []
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const AudioContextClass =
        window.AudioContext || (window as AudioWindow).webkitAudioContext
      if (!AudioContextClass) {
        throw new Error('AudioContext unavailable')
      }
      const audioContext = new AudioContextClass()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      audioContext.createMediaStreamSource(stream).connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      )
      recorderRef.current = recorder
      startedAtRef.current = Date.now()
      silenceStartedAtRef.current = null

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        setVoiceError('录音失败，请重试或手动输入')
        cleanupAudio()
        setRecording(false)
        setTranscribing(false)
        recorderRef.current = null
      }
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current
        const chunks = chunksRef.current
        const recordedMimeType = recorder.mimeType || mimeType || 'audio/webm'
        cleanupAudio()
        setRecording(false)
        recorderRef.current = null
        chunksRef.current = []
        if (durationMs < MIN_RECORDING_MS || chunks.length === 0) {
          setVoiceError('录音时间太短，请重新录入')
          return
        }
        void transcribeAudio(
          new Blob(chunks, { type: recordedMimeType }),
          durationMs,
          recordedMimeType
        )
      }

      recorder.start()
      setRecording(true)
      watchSilence()
      maxTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS)
    } catch {
      cleanupAudio()
      setRecording(false)
      setTranscribing(false)
      recorderRef.current = null
      setVoiceError('无法启动录音，请开启麦克风权限后重试')
    }
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '44px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }, [value, recording, transcribing])

  useEffect(() => {
    return () => {
      if (
        recorderRef.current?.state &&
        recorderRef.current.state !== 'inactive'
      ) {
        recorderRef.current.stop()
      }
      cleanupAudio()
    }
  }, [])

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (loading) {
      onStop()
      return
    }
    if (disabled || !value.trim()) return
    onSubmit(value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  const voiceBusy = recording || transcribing

  return (
    <form
      onSubmit={submit}
      className="shrink-0 border-t border-[#eeeeee] bg-white p-4"
    >
      <div className="grid grid-cols-[44px_minmax(0,1fr)_52px_48px] items-center gap-3 rounded-2xl border border-[#e5e5e5] px-4 py-3">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={disabled || loading || transcribing}
          className={
            voiceBusy
              ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ff784f] text-white disabled:opacity-40'
              : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[#8b8f99] disabled:opacity-40'
          }
          aria-label={
            recording ? '停止录音' : transcribing ? '正在转写' : '语音提问'
          }
          title={
            recording ? '停止录音' : transcribing ? '正在转写' : '语音提问'
          }
        >
          {voiceBusy ? (
            <MicOff className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>

        <textarea
          ref={textareaRef}
          value={
            recording ? '正在聆听...' : transcribing ? '正在转写...' : value
          }
          maxLength={maxLength}
          disabled={disabled || voiceBusy}
          onChange={event => onChange(event.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="block h-[44px] max-h-[120px] w-full resize-none overflow-y-auto bg-transparent text-base leading-6 outline-none placeholder:text-[#9ca3af] disabled:text-[#9ca3af]"
        />
        <span className="text-center text-xs tabular-nums text-[#999]">
          {value.length}/{maxLength}
        </span>
        <button
          type="submit"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#484848] text-white disabled:opacity-40"
          disabled={!loading && (disabled || voiceBusy || !value.trim())}
          aria-label={loading ? '停止回答' : '发送'}
        >
          {loading ? (
            <Square className="h-4 w-4" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
      {voiceError ? (
        <div className="mt-2 px-2 text-xs text-[#ef4444]">{voiceError}</div>
      ) : null}
    </form>
  )
}
