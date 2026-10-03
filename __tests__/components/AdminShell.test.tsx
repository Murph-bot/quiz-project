/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminShell } from '@/components/admin/AdminShell'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

global.fetch = jest.fn((url: string, init?: RequestInit) => {
  if (typeof url === 'string' && url.includes('/api/admin/logout')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as unknown as Promise<Response>
  }
  void init
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: [], total: 0, pageCount: 1 }),
  }) as unknown as Promise<Response>
}) as unknown as typeof fetch

describe('AdminShell logout', () => {
  beforeEach(() => jest.clearAllMocks())

  it('navigates via the router instead of a full-page location assignment', async () => {
    render(<AdminShell />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('button', { name: /log out/i }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/admin/login'))
  })
})
