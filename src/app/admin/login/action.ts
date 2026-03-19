'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export async function loginAction(formData: FormData) {
  const password = formData.get('password') as string
  const secret = process.env.ADMIN_SECRET
  if (!secret || password !== secret) {
    redirect('/admin/login?error=1')
  }
  const token = await signAdminToken()
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 86400,
    path: '/admin',
  })
  redirect('/admin')
}
