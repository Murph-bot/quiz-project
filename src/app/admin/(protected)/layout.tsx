import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!token || !(await verifyAdminToken(token))) {
    redirect('/admin/login')
  }
  return <>{children}</>
}
