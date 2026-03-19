import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyAdminToken, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { AdminShell } from '@/components/admin/AdminShell'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value
  if (!token || !(await verifyAdminToken(token))) {
    redirect('/admin/login')
  }
  return <AdminShell />
}
