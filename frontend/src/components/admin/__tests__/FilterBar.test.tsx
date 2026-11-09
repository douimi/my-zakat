import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterBar from '../FilterBar'

describe('admin FilterBar', () => {
  it('renders one search box with the exact placeholder and reports what is typed', () => {
    const onSearchChange = vi.fn()
    render(<FilterBar search="" onSearchChange={onSearchChange} placeholder="Search by email..." />)
    const box = screen.getByPlaceholderText('Search by email...')
    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
    fireEvent.change(box, { target: { value: 'amina' } })
    expect(onSearchChange).toHaveBeenCalledWith('amina')
  })

  it('names the search box for screen readers', () => {
    render(<FilterBar search="" onSearchChange={() => {}} placeholder="Search…" searchLabel="Search users" />)
    expect(screen.getByRole('searchbox', { name: 'Search users' })).toBeInTheDocument()
  })

  it('renders only the filter slot when there is no search', () => {
    render(
      <FilterBar trailing="3 shown">
        <select aria-label="Role"><option>All</option></select>
      </FilterBar>
    )
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Role' })).toBeInTheDocument()
    expect(screen.getByText('3 shown')).toBeInTheDocument()
  })
})
