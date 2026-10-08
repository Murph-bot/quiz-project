'use server'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { signAdminToken, verifyAdminPassword, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { checkRateLimit, clientIp } from '@/lib/rateLimit'

const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

export async function loginAction(formData: FormData) {
  const ip = clientIp(await headers())
  if (!checkRateLimit(`admin-login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) {
    redirect('/admin/login?error=2')
  }

  const password = formData.get('password')
  if (typeof password !== 'string' || !(await verifyAdminPassword(password))) {
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
