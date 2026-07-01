interface SectionLabelProps {
  children: React.ReactNode
  className?: string
}

export function SectionLabel({ children, className = '' }: SectionLabelProps) {
  return (
    <p
      className={`text-white/60 text-xs font-semibold uppercase tracking-widest ${className}`}
    >
      {children}
    </p>
  )
}
