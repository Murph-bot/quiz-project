'use server'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { signAdminToken, verifyAdminPassword, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { createServerClient } from '@/lib/supabase-server'

const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

export async function loginAction(formData: FormData) {
  const headersList = await headers()
  const ip = getClientIp(headersList)
  const supabase = createServerClient()
  if (!(await checkRateLimit(`admin-login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS, supabase))) {
    redirect('/admin/login?error=2')
  }

  const password = formData.get('password') as string
  if (!(await verifyAdminPassword(password))) {
    redirect('/admin/login?error=1')
  }

  const token = await signAdminToken()
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60,
    path: '/',
  })
  redirect('/admin')
}
