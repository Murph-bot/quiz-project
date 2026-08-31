import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'compact'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: Variant
  fullWidth?: boolean
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-qk-void text-qk-text font-black rounded-full border border-qk-cyan/70 shadow-qk-neon active:scale-95 transition-transform disabled:opacity-40',
  secondary:
    'bg-qk-surface/80 text-qk-text font-bold rounded-full border border-qk-violet/35 active:scale-95 transition-transform disabled:opacity-40',
  compact:
    'bg-qk-void text-qk-text font-black rounded-full border border-qk-cyan/70 shadow-qk-neon-sm active:scale-95 transition-transform disabled:opacity-50 shrink-0',
}

const sizeClass: Record<Variant, string> = {
  primary: 'text-sm py-4 px-6 min-h-[52px]',
  secondary: 'text-sm py-3 px-6 min-h-[48px]',
  compact: 'text-sm px-5 min-w-[72px] min-h-[52px]',
}

export function Button({
  children,
  variant = 'primary',
  fullWidth = false,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${variantClass[variant]} ${sizeClass[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
