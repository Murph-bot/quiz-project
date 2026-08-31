type BannerVariant = 'grace' | 'danger' | 'success' | 'info'

interface BannerProps {
  children: React.ReactNode
  variant?: BannerVariant
  className?: string
}

const variantClass: Record<BannerVariant, string> = {
  grace: 'bg-qk-inset text-qk-warn border border-qk-warn/50',
  danger: 'bg-qk-inset text-qk-danger border border-qk-danger/50',
  success: 'bg-qk-inset text-qk-success border border-qk-success/50',
  info: 'bg-qk-surface/80 text-qk-text border border-qk-violet/30 backdrop-blur-sm',
}

export function Banner({ children, variant = 'grace', className = '' }: BannerProps) {
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-3 pointer-events-none ${className}`}>
      <div
        className={`${variantClass[variant]} px-5 py-2 rounded-full text-sm font-bold shadow-qk-card flex items-center gap-2`}
      >
        {children}
      </div>
    </div>
  )
}
