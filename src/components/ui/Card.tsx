import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  style?: CSSProperties
}

const paddingClass = {
  sm: 'px-4 py-2',
  md: 'px-6 py-5',
  lg: 'px-6 py-6',
}

export function Card({ children, className = '', padding = 'md', style }: CardProps) {
  return (
    <div
      style={style}
      className={`bg-qk-surface/80 backdrop-blur-md border border-qk-violet/25 rounded-2xl shadow-qk-card w-full box-border text-qk-text [&_.text-gray-900]:text-qk-text [&_.text-gray-500]:text-qk-muted ${paddingClass[padding]} ${className}`}
    >
      {children}
    </div>
  )
}
