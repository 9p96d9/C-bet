import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from '@testing-library/react'
import { FrequencyGauge } from '../components/FrequencyGauge'
import { ProfileSwitcher } from '../components/ProfileSwitcher'
import { ReportScreen } from '../components/ReportScreen'
import { TrainerScreen } from '../components/TrainerScreen'
import { useAppStore } from '../store'

beforeEach(() => {
  act(() => {
    useAppStore.setState({
      activeProfile: 'GTO',
      wetnessFilter: [],
      rangeAdvFilter: [],
      textureFilter: [],
      quiz: {
        currentBoard: null,
        answered: false,
        isCorrect: null,
        userCbetFreq: '',
        userBetSize: '',
        score: 0,
        totalAnswered: 0,
        weakSpots: {},
        weakSpotMode: false,
      },
    })
  })
})

describe('FrequencyGauge', () => {
  it('renders gauge bar with correct width for 75%', () => {
    render(<FrequencyGauge cbetFreq={75} checkFreq={25} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveStyle({ width: '75%' })
    expect(bar).toHaveAttribute('aria-valuenow', '75')
  })

  it('renders gauge bar at 0%', () => {
    render(<FrequencyGauge cbetFreq={0} checkFreq={100} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveStyle({ width: '0%' })
  })

  it('renders gauge bar at 100%', () => {
    render(<FrequencyGauge cbetFreq={100} checkFreq={0} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveStyle({ width: '100%' })
  })

  it('clamps over-100 values', () => {
    render(<FrequencyGauge cbetFreq={120} checkFreq={0} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveStyle({ width: '100%' })
  })

  it('displays cbet and check frequencies as text', () => {
    render(<FrequencyGauge cbetFreq={60} checkFreq={40} />)
    expect(screen.getByText('C-bet 60%')).toBeInTheDocument()
    expect(screen.getByText('Check 40%')).toBeInTheDocument()
  })
})

describe('ProfileSwitcher', () => {
  it('renders exactly 5 profile buttons', () => {
    render(<ProfileSwitcher />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(5)
  })

  it('GTO button is active by default', () => {
    render(<ProfileSwitcher />)
    const gtoBtn = screen.getByTestId('profile-btn-GTO')
    expect(gtoBtn).toHaveClass('bg-blue-600')
  })

  it('clicking Nit activates Nit profile', () => {
    render(<ProfileSwitcher />)
    fireEvent.click(screen.getByTestId('profile-btn-Nit'))
    expect(useAppStore.getState().activeProfile).toBe('Nit')
  })

  it('profile button labels are all present', () => {
    render(<ProfileSwitcher />)
    expect(screen.getByText('GTO')).toBeInTheDocument()
    expect(screen.getByText('Fish')).toBeInTheDocument()
    expect(screen.getByText('Calling Station')).toBeInTheDocument()
    expect(screen.getByText('Maniac')).toBeInTheDocument()
    expect(screen.getByText('Nit')).toBeInTheDocument()
  })
})

describe('ReportScreen', () => {
  it('renders 54 board cards with no filters', () => {
    render(<ReportScreen />)
    const cards = screen.getAllByTestId('board-card')
    expect(cards).toHaveLength(54)
  })

  it('board count shows 54 / 54', () => {
    render(<ReportScreen />)
    expect(screen.getByTestId('board-count')).toHaveTextContent('54 / 54 ボード')
  })

  it('filter panel is rendered', () => {
    render(<ReportScreen />)
    expect(screen.getByTestId('filter-panel')).toBeInTheDocument()
  })

  it('clicking Monotone filter shows 9 boards', () => {
    render(<ReportScreen />)
    fireEvent.click(screen.getByText('Monotone'))
    const cards = screen.getAllByTestId('board-card')
    expect(cards).toHaveLength(9)
  })

  it('clear filter button appears after selecting filter', () => {
    render(<ReportScreen />)
    fireEvent.click(screen.getByText('ドライ'))
    expect(screen.getByTestId('clear-filters-btn')).toBeInTheDocument()
  })

  it('Nit profile changes displayed frequencies', () => {
    render(<ReportScreen />)
    const gtoBoards = useAppStore.getState().getDisplayBoards()
    const gtoAvg = gtoBoards.reduce((s, b) => s + b.cbetFreq, 0) / gtoBoards.length

    act(() => useAppStore.getState().setProfile('Nit'))
    const nitBoards = useAppStore.getState().getDisplayBoards()
    const nitAvg = nitBoards.reduce((s, b) => s + b.cbetFreq, 0) / nitBoards.length

    expect(nitAvg).toBeLessThan(gtoAvg)
  })
})

describe('TrainerScreen', () => {
  it('renders submit button', async () => {
    render(<TrainerScreen />)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(screen.getByTestId('submit-btn')).toBeInTheDocument()
  })

  it('shows feedback after submitting answer', async () => {
    render(<TrainerScreen />)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    const board = useAppStore.getState().quiz.currentBoard!
    fireEvent.change(screen.getByTestId('cbet-freq-input'), {
      target: { value: String(board.cbetFreq) },
    })
    fireEvent.click(screen.getByTestId(`size-btn-${board.betSize}`))
    fireEvent.click(screen.getByTestId('submit-btn'))

    expect(screen.getByTestId('feedback')).toBeInTheDocument()
  })

  it('score updates after answering correctly', async () => {
    render(<TrainerScreen />)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    const board = useAppStore.getState().quiz.currentBoard!
    fireEvent.change(screen.getByTestId('cbet-freq-input'), {
      target: { value: String(board.cbetFreq) },
    })
    fireEvent.click(screen.getByTestId(`size-btn-${board.betSize}`))
    fireEvent.click(screen.getByTestId('submit-btn'))

    expect(useAppStore.getState().quiz.score).toBe(1)
    expect(screen.getByTestId('score-display')).toHaveTextContent('1/1')
  })

  it('next button appears after answering', async () => {
    render(<TrainerScreen />)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    const board = useAppStore.getState().quiz.currentBoard!
    fireEvent.change(screen.getByTestId('cbet-freq-input'), {
      target: { value: String(board.cbetFreq) },
    })
    fireEvent.click(screen.getByTestId(`size-btn-${board.betSize}`))
    fireEvent.click(screen.getByTestId('submit-btn'))

    expect(screen.getByTestId('next-btn')).toBeInTheDocument()
  })

  it('4 bet size buttons are rendered', async () => {
    render(<TrainerScreen />)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(screen.getByTestId('size-btn-25')).toBeInTheDocument()
    expect(screen.getByTestId('size-btn-33')).toBeInTheDocument()
    expect(screen.getByTestId('size-btn-75')).toBeInTheDocument()
    expect(screen.getByTestId('size-btn-150')).toBeInTheDocument()
  })
})

describe('E2E scenarios (simulated)', () => {
  it('E2E: report shows 54 boards by default', () => {
    render(<ReportScreen />)
    expect(screen.getAllByTestId('board-card')).toHaveLength(54)
  })

  it('E2E: Monotone filter → 9 boards shown', () => {
    render(<ReportScreen />)
    fireEvent.click(screen.getByText('Monotone'))
    expect(screen.getAllByTestId('board-card')).toHaveLength(9)
  })

  it('E2E: Nit profile reduces average C-bet frequency', () => {
    render(<ReportScreen />)
    const before = useAppStore.getState().getDisplayBoards()
    const beforeAvg = before.reduce((s, b) => s + b.cbetFreq, 0) / before.length

    fireEvent.click(screen.getByTestId('profile-btn-Nit'))

    const after = useAppStore.getState().getDisplayBoards()
    const afterAvg = after.reduce((s, b) => s + b.cbetFreq, 0) / after.length

    expect(afterAvg).toBeLessThan(beforeAvg)
  })

  it('E2E: trainer answer updates score', async () => {
    render(<TrainerScreen />)
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    const initialScore = useAppStore.getState().quiz.score
    const board = useAppStore.getState().quiz.currentBoard!

    fireEvent.change(screen.getByTestId('cbet-freq-input'), {
      target: { value: String(board.cbetFreq) },
    })
    fireEvent.click(screen.getByTestId(`size-btn-${board.betSize}`))
    fireEvent.click(screen.getByTestId('submit-btn'))

    expect(useAppStore.getState().quiz.score).toBe(initialScore + 1)
  })
})
