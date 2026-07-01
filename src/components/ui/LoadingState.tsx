interface LoadingStateProps {
  message?: string
}

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4 pt-4 pb-safe text-center phase-enter">
      <div
        className="text-3xl mb-3"
        style={{ animation: 'loadingPulse 1.2s ease-in-out infinite' }}
        aria-hidden
      >
        ⚔️
      </div>
      <div className="text-white font-bold text-lg">{message}</div>
    </div>
  )
}
