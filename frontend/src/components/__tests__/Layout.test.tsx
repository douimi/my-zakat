import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test/utils'
import Layout from '../Layout'

describe('Layout', () => {
  it('renders Header component', () => {
    render(<Layout />)
    
    // Header should contain the MyZakat branding
    // MyZakat appears in both Header and Footer, so check for multiple instances
    const myZakatElements = screen.getAllByText('MyZakat')
    expect(myZakatElements.length).toBeGreaterThanOrEqual(1)
    
    const distributionFoundationElements = screen.getAllByText('Distribution Foundation')
    expect(distributionFoundationElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders Footer component', () => {
    render(<Layout />)
    
    // Footer should contain copyright information
    expect(screen.getByText(/2024 MyZakat Distribution Foundation/)).toBeInTheDocument()
  })

  it('has proper structure with main content area', () => {
    const { container } = render(<Layout />)
    
    // Check for main element
    const mainElement = container.querySelector('main')
    expect(mainElement).toBeInTheDocument()
    expect(mainElement).toHaveClass('flex-1')
  })

  it('applies correct layout classes', () => {
    const { container } = render(<Layout />)
    
    // Check root div has proper flex layout
    const rootDiv = container.firstChild
    expect(rootDiv).toHaveClass('min-h-screen', 'flex', 'flex-col')
  })
})
