'use client'

import { useTranslations } from 'next-intl'

interface Props {
  recording: boolean
  disabled?: boolean
  onPressStart: () => void
  onPressEnd: (cancel: boolean) => void
}

/**
 * Hold-to-talk control for the push-to-talk input mode. The utterance
 * boundary belongs to the button: press while speaking, release to send.
 * Pointer capture keeps a release off the button's edges from losing the
 * pointer; Space offers the same hold on keyboards.
 */
export default function PushToTalkButton({
  recording,
  disabled,
  onPressStart,
  onPressEnd,
}: Props) {
  const t = useTranslations('conversation')

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        // Pointer capture: moving the pointer off the button mid-hold keeps
        // the press alive instead of dropping it at the edge.
        e.currentTarget.setPointerCapture(e.pointerId)
        onPressStart()
      }}
      onPointerUp={() => onPressEnd(false)}
      onPointerCancel={() => onPressEnd(true)}
      onBlur={() => onPressEnd(true)}
      onKeyDown={(e) => {
        if (e.key === ' ' && !e.repeat) {
          e.preventDefault()
          onPressStart()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ') {
          e.preventDefault()
          onPressEnd(false)
        }
      }}
      className={`border-2 flex h-16 w-16 touch-none select-none items-center justify-center rounded-full transition-colors ${
        recording
          ? 'border-fl-accent bg-fl-accent text-fl-accent-fg'
          : 'border-fl-border bg-fl-surface hover:border-fl-border-2'
      } ${disabled ? 'opacity-40' : ''}`}
      aria-label={recording ? t('pttRelease') : t('pttHold')}
      title={recording ? t('pttRelease') : t('pttHold')}
      // Space is the button's own hold modifier — suppress the duplicate
      // click it would otherwise synthesize on release.
      onClick={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        className={`font-mono text-lg ${recording ? 'animate-pulse' : 'opacity-70'}`}
      >
        ●
      </span>
    </button>
  )
}