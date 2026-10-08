// src/app/layout.tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

const SITE_URL = 'https://quiz-project-phi-sooty.vercel.app'
const DESCRIPTION =
  'Last-one-standing trivia for friends. Join a room with a 4-letter code, guess the number before the timer runs out, and outlast everyone.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'QuizKnight: last-one-standing trivia for friends',
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'QuizKnight',
    title: 'QuizKnight',
    description: DESCRIPTION,
  },
  twitter: { card: 'summary', title: 'QuizKnight', description: DESCRIPTION },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
