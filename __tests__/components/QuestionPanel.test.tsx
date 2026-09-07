/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuestionPanel } from '@/components/QuestionPanel'

const question = {
  id: 'q-1',
  text: 'How many islands does Indonesia have?',
  timeLimit: 60,
  category: 'Geography',
}

function makeProps(overrides: Partial<Parameters<typeof QuestionPanel>[0]> = {}) {
  return {
    roundNumber: 3,
    question,
    // Plenty of time left — the countdown ticks up from 0 on a deferred timer.
    startedAt: new Date(Date.now() + 120_000).toISOString(),
    isWaiting: false,
    isGracePeriod: false,
    graceSecondsLeft: 0,
    onSubmit: jest.fn(),
    ...overrides,
  }
}

/** The input is disabled until the countdown's first tick enables it. */
async function getEnabledInput() {
  const input = screen.getByLabelText('Your guess')
  await waitFor(() => expect(input).toBeEnabled())
  return input
}

describe('QuestionPanel (free numeric input)', () => {
  it('renders the question, round, and category', async () => {
    render(<QuestionPanel {...makeProps()} />)
    expect(screen.getByText('How many islands does Indonesia have?')).toBeInTheDocument()
    expect(screen.getByText('ROUND 3')).toBeInTheDocument()
    expect(screen.getByText('Geography')).toBeInTheDocument()
    await getEnabledInput()
  })

  it('strips non-digit characters from the guess input', async () => {
    render(<QuestionPanel {...makeProps()} />)
    const input = await getEnabledInput()
    fireEvent.change(input, { target: { value: '12a3-4' } })
    expect(input).toHaveValue('1234')
  })

  it('keeps the submit button disabled while the input is empty', async () => {
    render(<QuestionPanel {...makeProps()} />)
    await getEnabledInput()
    const button = screen.getByRole('button', { name: /lock it in/i })
    expect(button).toBeDisabled()
  })

  it('submits the parsed integer guess on button click', async () => {
    const onSubmit = jest.fn()
    render(<QuestionPanel {...makeProps({ onSubmit })} />)
    const input = await getEnabledInput()
    fireEvent.change(input, { target: { value: '17508' } })
    fireEvent.click(screen.getByRole('button', { name: /lock it in/i }))
    expect(onSubmit).toHaveBeenCalledWith(17508)
  })

  it('submits on Enter in the input field', async () => {
    const onSubmit = jest.fn()
    render(<QuestionPanel {...makeProps({ onSubmit })} />)
    const input = await getEnabledInput()
    fireEvent.change(input, { target: { value: '9000' } })
    fireEvent.submit(input.closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith(9000)
  })

  it('shows the locked-in guess and disables further edits after submit', async () => {
    const onSubmit = jest.fn()
    render(<QuestionPanel {...makeProps({ onSubmit })} />)
    const input = await getEnabledInput()
    fireEvent.change(input, { target: { value: '17508' } })
    fireEvent.click(screen.getByRole('button', { name: /lock it in/i }))
    expect(screen.getByText('17508')).toBeInTheDocument()
    expect(screen.queryByLabelText('Your guess')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lock it in/i })).not.toBeInTheDocument()
  })

  it('does not submit while waiting for the round to close', async () => {
    const onSubmit = jest.fn()
    render(<QuestionPanel {...makeProps({ isWaiting: true, onSubmit })} />)
    const input = screen.getByLabelText('Your guess')
    expect(input).toBeDisabled()
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /lock it in/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/waiting for round to close/i)).toBeInTheDocument()
  })

  it('shows the grace-period banner with the remaining seconds', async () => {
    render(<QuestionPanel {...makeProps({ isGracePeriod: true, graceSecondsLeft: 7 })} />)
    expect(screen.getByText('⏳ Grace period')).toBeInTheDocument()
    expect(screen.getByText('7s')).toBeInTheDocument()
    expect(screen.getByText(/last chance to answer/i)).toBeInTheDocument()
    await getEnabledInput()
  })
})
