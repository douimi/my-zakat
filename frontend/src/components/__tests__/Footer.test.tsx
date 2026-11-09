import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Footer from '../Footer'

const renderFooter = () =>
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  )

describe('Footer', () => {
  it('renders the brand: logo linking home and a one-line tagline', () => {
    renderFooter()

    expect(screen.getByRole('link', { name: /myzakat home/i })).toHaveAttribute('href', '/')
    expect(screen.getByText(/zakat and sadaqah, delivered to families in need/i)).toBeInTheDocument()
  })

  it('renders the quick links, including Projects and Nisab, without a redundant Home', () => {
    renderFooter()

    expect(screen.getByRole('heading', { name: 'Quick Links' })).toBeInTheDocument()
    const expected: Record<string, string> = {
      Donate: '/donate',
      Projects: '/projects',
      Programs: '/programs',
      'Zakat Calculator': '/zakat-calculator',
      Nisab: '/nisab',
      About: '/about',
      Stories: '/stories',
      Contact: '/contact',
    }
    for (const [name, href] of Object.entries(expected)) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
    }
    expect(screen.queryByRole('link', { name: /^home$/i })).toBeNull()
  })

  it('renders the funding and legal links', () => {
    renderFooter()

    expect(screen.getByRole('link', { name: /submit a project proposal/i })).toHaveAttribute('href', '/submit-proposal')
    expect(screen.getByRole('link', { name: /check my application/i })).toHaveAttribute('href', '/my-proposals')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy-policy')
    expect(screen.getByRole('link', { name: 'Donation Policy' })).toHaveAttribute('href', '/donation-policy')
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms-of-service')
    expect(screen.getByRole('link', { name: 'SMS Subscription' })).toHaveAttribute('href', '/sms-opt-in')
  })

  it('renders the real contact details as actionable links', () => {
    renderFooter()

    expect(screen.getByRole('link', { name: 'info@myzakat.org' })).toHaveAttribute('href', 'mailto:info@myzakat.org')
    expect(screen.getByRole('link', { name: '1-833-MYZAKAT' })).toHaveAttribute('href', 'tel:+18336992528')
    expect(screen.getByText(/P\.O\. BOX 2250/)).toBeInTheDocument()
  })

  it('does not link to bare social-network home pages', () => {
    renderFooter()

    const bare = /^https?:\/\/(www\.)?(facebook|twitter|instagram|youtube)\.com\/?$/
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(bare)
    }
  })

  it('has no newsletter form and nothing named "Email" (it subscribed nobody, and collides with e2e selectors)', () => {
    renderFooter()

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByPlaceholderText(/enter your email/i)).toBeNull()
    expect(screen.queryAllByLabelText(/email/i)).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull()
  })

  it('renders the copyright notice for the current year', () => {
    renderFooter()

    const year = new Date().getFullYear()
    expect(screen.getByText(new RegExp(`${year} MyZakat Distribution Foundation`))).toBeInTheDocument()
    expect(screen.getByText(/All rights reserved/)).toBeInTheDocument()
  })
})
