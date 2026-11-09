import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HelmetProvider } from 'react-helmet-async'
import { render } from '../../test/utils'
import Contact from '../Contact'
import { contactAPI } from '../../utils/api'

// Mock the contactAPI
vi.mock('../../utils/api', () => ({
  contactAPI: {
    create: vi.fn()
  }
}))

// The page reports the outcome through the app's toasts.
const showSuccess = vi.fn()
const showError = vi.fn()
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showSuccess, showError }),
}))

const renderContact = () => render(
  <HelmetProvider>
    <Contact />
  </HelmetProvider>
)

describe('Contact Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page heading and description', () => {
    renderContact()

    expect(screen.getByRole('heading', { level: 1, name: 'Contact Us' })).toBeInTheDocument()
    expect(screen.getByText(/Get in touch with our team/)).toBeInTheDocument()
  })

  it('renders contact form with all fields, each with a label', () => {
    renderContact()

    expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'Your name')
    expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'Your email')
    expect(screen.getByLabelText('Message')).toHaveAttribute('placeholder', 'Your message')
    expect(screen.getByRole('button', { name: /Send Message/i })).toBeInTheDocument()
  })

  it('renders contact information with working links', () => {
    renderContact()

    expect(screen.getByText('Get in touch')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'info@myzakat.org' })).toHaveAttribute('href', 'mailto:info@myzakat.org')
    expect(screen.getByRole('link', { name: '1-833-MYZAKAT' })).toHaveAttribute('href', 'tel:+18336992528')
    expect(screen.getByText('P.O. BOX 2250, Winchester, VA 22604')).toBeInTheDocument()
  })

  it('submits form successfully with valid data', async () => {
    const user = userEvent.setup()
    vi.mocked(contactAPI.create).mockResolvedValue({ id: 1 })

    renderContact()

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

    // Success toast
    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith(
        'Message Sent',
        'Thank you for your message! We will get back to you soon.'
      )
    })
    expect(showError).not.toHaveBeenCalled()
  })

  it('shows an error toast on submission failure', async () => {
    const user = userEvent.setup()
    vi.mocked(contactAPI.create).mockRejectedValue(new Error('Network error'))

    renderContact()

    // Fill in the form
    await user.type(screen.getByPlaceholderText('Your name'), 'John Doe')
    await user.type(screen.getByPlaceholderText('Your email'), 'john@example.com')
    await user.type(screen.getByPlaceholderText('Your message'), 'Test message')

    // Submit the form
    await user.click(screen.getByRole('button', { name: /Send Message/i }))

    // Error toast
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith('Error', 'Error sending message. Please try again.')
    })
    expect(showSuccess).not.toHaveBeenCalled()
  })

  it('has required fields', async () => {
    const user = userEvent.setup()
    renderContact()

    const emailInput = screen.getByPlaceholderText('Your email')
    expect(emailInput).toHaveAttribute('type', 'email')

    // React Hook Form blocks an empty submission
    await user.click(screen.getByRole('button', { name: /Send Message/i }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Your name')).toHaveFocus()
    })
    expect(contactAPI.create).not.toHaveBeenCalled()
  })

  it('resets form after successful submission', async () => {
    const user = userEvent.setup()
    vi.mocked(contactAPI.create).mockResolvedValue({ id: 1 })

    renderContact()

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
