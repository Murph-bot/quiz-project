import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
}

const paddingClass = {
  sm: 'px-4 py-2',
  md: 'px-6 py-5',
  lg: 'px-6 py-6',
}

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-md w-full box-border ${paddingClass[padding]} ${className}`}
    >
      {children}
    </div>
  )
}
