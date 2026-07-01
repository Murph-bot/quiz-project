type BannerVariant = 'grace' | 'danger' | 'success' | 'info'

interface BannerProps {
  children: React.ReactNode
  variant?: BannerVariant
  className?: string
}

const variantClass: Record<BannerVariant, string> = {
  grace: 'bg-amber-500 text-white',
  danger: 'bg-red-600 text-white',
  success: 'bg-green-500 text-white',
  info: 'bg-white/20 text-white backdrop-blur-sm',
}

export function Banner({ children, variant = 'grace', className = '' }: BannerProps) {
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-3 pointer-events-none ${className}`}>
      <div
        className={`${variantClass[variant]} px-5 py-2 rounded-full text-sm font-bold shadow-lg flex items-center gap-2`}
      >
        {children}
      </div>
    </div>
  )
}
