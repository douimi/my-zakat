import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test/utils'
import Footer from '../Footer'

describe('Footer', () => {
  it('renders brand information', () => {
    render(<Footer />)
    
    expect(screen.getByText('MyZakat')).toBeInTheDocument()
    expect(screen.getByText('Distribution Foundation')).toBeInTheDocument()
    expect(screen.getByText(/Empowering communities through Zakat/)).toBeInTheDocument()
  })

  it('renders quick links section', () => {
    render(<Footer />)
    
    expect(screen.getByText('Quick Links')).toBeInTheDocument()
    
    const links = ['Home', 'About', 'Donate', 'Zakat Calculator', 'Stories', 'Contact']
    links.forEach(link => {
      expect(screen.getAllByText(link).length).toBeGreaterThan(0)
    })
  })

  it('renders contact information', () => {
    render(<Footer />)
    
    expect(screen.getByText('Contact Us')).toBeInTheDocument()
    expect(screen.getByText('info@myzakat.org')).toBeInTheDocument()
    expect(screen.getByText('+1 (555) 123-4567')).toBeInTheDocument()
    expect(screen.getByText(/123 Charity Ave/)).toBeInTheDocument()
  })

  it('renders social media links', () => {
    render(<Footer />)
    
    const socialLinks = [
      { name: 'Facebook', href: 'https://facebook.com' },
      { name: 'Twitter', href: 'https://twitter.com' },
      { name: 'Instagram', href: 'https://instagram.com' },
      { name: 'YouTube', href: 'https://youtube.com' }
    ]

    socialLinks.forEach(social => {
      const link = screen.getByLabelText(social.name)
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', social.href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  it('renders newsletter subscription form', () => {
    render(<Footer />)
    
    expect(screen.getByText('Stay Updated')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Subscribe/i })).toBeInTheDocument()
  })

  it('renders copyright notice', () => {
    render(<Footer />)
    
    expect(screen.getByText(/2024 MyZakat Distribution Foundation/)).toBeInTheDocument()
    expect(screen.getByText(/All rights reserved/)).toBeInTheDocument()
  })

  it('has proper accessibility attributes for social links', () => {
    render(<Footer />)
    
    const facebookLink = screen.getByLabelText('Facebook')
    const twitterLink = screen.getByLabelText('Twitter')
    const instagramLink = screen.getByLabelText('Instagram')
    const youtubeLink = screen.getByLabelText('YouTube')

    expect(facebookLink).toHaveAttribute('aria-label')
    expect(twitterLink).toHaveAttribute('aria-label')
    expect(instagramLink).toHaveAttribute('aria-label')
    expect(youtubeLink).toHaveAttribute('aria-label')
  })

  it('newsletter form has required email input', () => {
    render(<Footer />)
    
    const emailInput = screen.getByPlaceholderText('Enter your email')
    expect(emailInput).toHaveAttribute('type', 'email')
    expect(emailInput).toHaveAttribute('required')
  })
})
