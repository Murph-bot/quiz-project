interface SectionLabelProps {
  children: React.ReactNode
  className?: string
}

export function SectionLabel({ children, className = '' }: SectionLabelProps) {
  return (
    <p
      className={`text-qk-label text-xs font-semibold uppercase tracking-widest ${className}`}
    >
      {children}
    </p>
  )
}
