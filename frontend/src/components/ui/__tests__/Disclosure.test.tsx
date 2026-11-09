import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Disclosure from '../Disclosure'

describe('Disclosure', () => {
  it('starts collapsed but keeps the body in the DOM', () => {
    const { container } = render(
      <Disclosure title="How nisab is set" summary="Gold or silver, your choice">
        <p>Body text that tests can still find.</p>
      </Disclosure>,
    )
    const details = container.querySelector('details')!
    expect(details).toHaveClass('disclosure')
    expect(details.open).toBe(false)
    expect(screen.getByText('How nisab is set')).toBeInTheDocument()
    expect(screen.getByText('Gold or silver, your choice')).toBeInTheDocument()
    expect(screen.getByText('Body text that tests can still find.')).toBeInTheDocument()
    expect(screen.getByText('Body text that tests can still find.')).not.toBeVisible()
  })

  it('opens when the summary is clicked', () => {
    const { container } = render(
      <Disclosure title="Read more">
        <p>Hidden detail</p>
      </Disclosure>,
    )
    fireEvent.click(screen.getByText('Read more'))
    expect(container.querySelector('details')!.open).toBe(true)
    expect(screen.getByText('Hidden detail')).toBeVisible()
  })

  it('honours defaultOpen, id and the plain variant', () => {
    const { container } = render(
      <Disclosure title="Open" id="faq-1" defaultOpen variant="plain">
        <p>Shown</p>
      </Disclosure>,
    )
    const details = container.querySelector('details')!
    expect(details.open).toBe(true)
    expect(details).toHaveAttribute('id', 'faq-1')
    expect(details).toHaveClass('disclosure', 'disclosure-plain')
  })
})
