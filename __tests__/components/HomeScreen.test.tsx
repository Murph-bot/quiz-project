/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomeScreen from '@/components/HomeScreen'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

global.fetch = jest.fn()

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(window, 'sessionStorage', {
      value: { setItem: jest.fn(), getItem: jest.fn() },
      writable: true,
    })
  })

  it('renders the app title', () => {
    render(<HomeScreen />)
    expect(screen.getByText(/QuizKnight/i)).toBeInTheDocument()
  })

  it('renders nickname input, create button, and join fields', () => {
    render(<HomeScreen />)
    expect(screen.getByLabelText(/your nickname/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create game/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/room code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join/i })).toBeInTheDocument()
  })

  it('shows error if nickname is empty on create', async () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))
    expect(await screen.findByText(/please enter a nickname/i)).toBeInTheDocument()
  })

  it('shows error if room code is empty on join', async () => {
    render(<HomeScreen />)
    fireEvent.change(screen.getByLabelText(/your nickname/i), { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(await screen.findByText(/please enter a room code/i)).toBeInTheDocument()
  })

  it('calls create API and redirects on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ roomCode: 'AB12', playerId: 'p-uuid', sessionSecret: 'secret' }),
    })

    render(<HomeScreen />)
    fireEvent.change(screen.getByLabelText(/your nickname/i), { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: /create game/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/lobby/AB12')
    })
  })

  it('calls join API and redirects on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ playerId: 'p-uuid', sessionSecret: 'secret' }),
    })

    render(<HomeScreen />)
    fireEvent.change(screen.getByLabelText(/your nickname/i), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByPlaceholderText(/room code/i), { target: { value: 'AB12' } })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/lobby/AB12')
    })
  })
})
