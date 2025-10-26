import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/utils'
import Contact from '../Contact'
import { contactAPI } from '../../utils/api'

// Mock the contactAPI
vi.mock('../../utils/api', () => ({
  contactAPI: {
    create: vi.fn()
  }
}))

// Mock window.alert
const mockAlert = vi.fn()
global.alert = mockAlert

describe('Contact Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page heading and description', () => {
    render(<Contact />)
    
    expect(screen.getByRole('heading', { name: 'Contact Us' })).toBeInTheDocument()
    expect(screen.getByText(/Get in touch with our team/)).toBeInTheDocument()
  })

  it('renders contact form with all fields', () => {
    render(<Contact />)
    
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Your email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Your message')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send Message/i })).toBeInTheDocument()
  })

  it('renders contact information', () => {
    render(<Contact />)
    
    expect(screen.getByText('Get in touch')).toBeInTheDocument()
    expect(screen.getByText('info@myzakat.org')).toBeInTheDocument()
    expect(screen.getByText('+1 (555) 123-4567')).toBeInTheDocument()
    expect(screen.getByText('123 Charity Ave, City, Country')).toBeInTheDocument()
  })

  it('submits form successfully with valid data', async () => {
    const user = userEvent.setup()
    vi.mocked(contactAPI.create).mockResolvedValue({ id: 1 })
    
    render(<Contact />)
    
    // Fill in the form
    await user.type(screen.getByPlaceholderText('Your name'), 'John Doe')
    await user.type(screen.getByPlaceholderText('Your email'), 'john@example.com')
    await user.type(screen.getByPlaceholderText('Your message'), 'This is a test message')
    
    // Submit the form
    await user.click(screen.getByRole('button', { name: /Send Message/i }))
    
    // Wait for API call
    await waitFor(() => {
      expect(contactAPI.create).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
        message: 'This is a test message'
      })
    })
    
    // Check success alert
    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith(
        'Thank you for your message! We will get back to you soon.'
      )
    })
  })

  it('shows error alert on submission failure', async () => {
    const user = userEvent.setup()
    vi.mocked(contactAPI.create).mockRejectedValue(new Error('Network error'))
    
    render(<Contact />)
    
    // Fill in the form
    await user.type(screen.getByPlaceholderText('Your name'), 'John Doe')
    await user.type(screen.getByPlaceholderText('Your email'), 'john@example.com')
    await user.type(screen.getByPlaceholderText('Your message'), 'Test message')
    
    // Submit the form
    await user.click(screen.getByRole('button', { name: /Send Message/i }))
    
    // Check error alert
    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith(
        'Error sending message. Please try again.'
      )
    })
  })

  it('has required fields', () => {
    render(<Contact />)
    
    const nameInput = screen.getByPlaceholderText('Your name')
    const emailInput = screen.getByPlaceholderText('Your email')
    const messageInput = screen.getByPlaceholderText('Your message')
    
    // React Hook Form handles required validation
    expect(nameInput).toBeInTheDocument()
    expect(emailInput).toBeInTheDocument()
    expect(emailInput).toHaveAttribute('type', 'email')
    expect(messageInput).toBeInTheDocument()
  })

  it('resets form after successful submission', async () => {
    const user = userEvent.setup()
    vi.mocked(contactAPI.create).mockResolvedValue({ id: 1 })
    
    render(<Contact />)
    
    const nameInput = screen.getByPlaceholderText('Your name') as HTMLInputElement
    const emailInput = screen.getByPlaceholderText('Your email') as HTMLInputElement
    const messageInput = screen.getByPlaceholderText('Your message') as HTMLTextAreaElement
    
    // Fill in the form
    await user.type(nameInput, 'John Doe')
    await user.type(emailInput, 'john@example.com')
    await user.type(messageInput, 'Test message')
    
    // Submit
    await user.click(screen.getByRole('button', { name: /Send Message/i }))
    
    // Wait for form reset
    await waitFor(() => {
      expect(nameInput.value).toBe('')
      expect(emailInput.value).toBe('')
      expect(messageInput.value).toBe('')
    })
  })
})
