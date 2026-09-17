import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import MediaFilters from '../MediaFilters'
import type { ListQuery } from '../../../utils/mediaLibraryApi'

const baseQuery: ListQuery = { q: '', type: 'all', status: 'all', sort: 'created_at', order: 'desc' }

describe('MediaFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces the search box instead of firing per keystroke', () => {
    const onChange = vi.fn()
    render(<MediaFilters query={baseQuery} onChange={onChange} showStatusFilter />)

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'gaza' } })
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(350)
    })
    expect(onChange).toHaveBeenCalledWith({ q: 'gaza' })
  })

  it('reports a type change immediately', () => {
    const onChange = vi.fn()
    render(<MediaFilters query={baseQuery} onChange={onChange} showStatusFilter />)
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'video' } })
    expect(onChange).toHaveBeenCalledWith({ type: 'video' })
  })

  it('hides the status filter when asked to', () => {
    render(<MediaFilters query={baseQuery} onChange={vi.fn()} showStatusFilter={false} />)
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument()
  })

  it('flips sort order when the direction button is pressed', () => {
    const onChange = vi.fn()
    render(<MediaFilters query={baseQuery} onChange={onChange} showStatusFilter />)
    fireEvent.click(screen.getByRole('button', { name: /sort direction/i }))
    expect(onChange).toHaveBeenCalledWith({ order: 'asc' })
  })
})
