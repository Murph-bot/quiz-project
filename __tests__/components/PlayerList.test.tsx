/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import PlayerList from '@/components/PlayerList'
import type { PresencePlayer } from '@/types'

const mockPlayers: PresencePlayer[] = [
  { playerId: '1', nickname: 'Alice', isHost: true },
  { playerId: '2', nickname: 'Bob', isHost: false },
]

describe('PlayerList', () => {
  it('renders "Waiting for players..." when list is empty', () => {
    render(<PlayerList players={[]} />)
    expect(screen.getByText(/waiting for players/i)).toBeInTheDocument()
  })

  it('renders each player nickname', () => {
    render(<PlayerList players={mockPlayers} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows host label next to the host player', () => {
    render(<PlayerList players={mockPlayers} />)
    expect(screen.getByText('host')).toBeInTheDocument()
  })

  it('displays the correct player count', () => {
    render(<PlayerList players={mockPlayers} maxPlayers={50} />)
    expect(screen.getByText(/2 \/ 50/)).toBeInTheDocument()
  })
})
