import { AdminLoginForm } from '@/components/admin/AdminLoginForm'

interface Props { searchParams: Promise<{ error?: string }> }

export default async function AdminLoginPage({ searchParams }: Props) {
  const { error } = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <AdminLoginForm error={error === '1' ? 'Incorrect password' : undefined} />
    </div>
  )
}
