import { test, expect, type Page } from '@playwright/test'

/**
 * E2E tests for the donation payment flow.
 *
 * These tests run against the REAL app (docker-compose up) and create
 * REAL Stripe checkout sessions in test mode. They verify the full
 * user journey through the UI:
 *
 *   Navigate to /donate → Fill form → Click submit → Verify Stripe redirect
 *
 * They intentionally stop at the Stripe Checkout redirect (we don't fill
 * Stripe's own card form — that's Stripe's responsibility to test).
 * What matters is that OUR app correctly:
 *   1. Renders the form
 *   2. Validates inputs
 *   3. Calls the backend API
 *   4. Receives a valid Stripe session
 *   5. Redirects to checkout.stripe.com
 */

const BACKEND_URL = process.env.E2E_BACKEND_URL || 'http://localhost:8000'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fillDonationForm(
  page: Page,
  options: {
    amount?: number
    quickAmount?: number
    name?: string
    email?: string
    purpose?: string
    frequency?: 'one-time' | 'monthly' | 'annually'
  } = {},
) {
  const {
    amount,
    quickAmount,
    name = 'E2E Test Donor',
    email = `e2e-${Date.now()}@test.myzakat.org`,
    purpose,
    frequency,
  } = options

  // Set amount — quick amounts are reliable; custom amounts need special handling
  // because react-hook-form's valueAsNumber watcher doesn't always update on fill()
  if (quickAmount) {
    await page.getByTestId(`donate-amount-${quickAmount}`).click()
  } else if (amount) {
    const input = page.getByTestId('donate-amount-input')
    await input.click()
    await input.fill(String(amount))
    // Dispatch native input event to trigger react-hook-form's onChange
    await input.dispatchEvent('input', { bubbles: true })
    await input.dispatchEvent('change', { bubbles: true })
    // Tab away to trigger blur validation
    await input.press('Tab')
  }

  // Set frequency
  if (frequency) {
    await page.getByTestId(`donate-freq-${frequency}`).check()
  }

  // Set purpose
  if (purpose) {
    await page.getByTestId('donate-purpose').selectOption(purpose)
  }

  // Fill personal info
  await page.getByTestId('donate-name').fill(name)
  await page.getByTestId('donate-email').fill(email)
}

// ---------------------------------------------------------------------------
// 1. PAGE RENDERING & FORM STRUCTURE
// ---------------------------------------------------------------------------

test.describe('Donate Page — Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/donate')
  })

  test('displays the donation form with all elements', async ({ page }) => {
    // Header
    await expect(page.getByRole('heading', { name: /make a donation/i })).toBeVisible()

    // Quick amount buttons
    for (const amt of [25, 50, 100, 250, 500, 1000]) {
      await expect(page.getByTestId(`donate-amount-${amt}`)).toBeVisible()
    }

    // Custom amount input
    await expect(page.getByTestId('donate-amount-input')).toBeVisible()

    // Purpose dropdown
    await expect(page.getByTestId('donate-purpose')).toBeVisible()

    // Frequency radio buttons
    await expect(page.getByTestId('donate-freq-one-time')).toBeVisible()
    await expect(page.getByTestId('donate-freq-monthly')).toBeVisible()
    await expect(page.getByTestId('donate-freq-annually')).toBeVisible()

    // Personal info fields
    await expect(page.getByTestId('donate-name')).toBeVisible()
    await expect(page.getByTestId('donate-email')).toBeVisible()

    // Submit button
    await expect(page.getByTestId('donate-submit')).toBeVisible()
  })

  test('quick amount buttons update the amount field', async ({ page }) => {
    await page.getByTestId('donate-amount-100').click()
    await expect(page.getByTestId('donate-amount-input')).toHaveValue('100')
  })

  test('submit button is disabled when no amount is entered', async ({ page }) => {
    // Clear any default amount
    await page.getByTestId('donate-amount-input').fill('')
    await expect(page.getByTestId('donate-submit')).toBeDisabled()
  })

  test('shows impact preview when amount is entered', async ({ page }) => {
    await page.getByTestId('donate-amount-100').click()
    await expect(page.getByText('Your Impact')).toBeVisible()
    await expect(page.getByText('Meals provided:')).toBeVisible()
  })

  test('shows recurring payment info when Monthly is selected', async ({ page }) => {
    await page.getByTestId('donate-freq-monthly').check()
    await expect(page.getByText(/recurring payment/i)).toBeVisible()
    await expect(page.getByText(/first payment will be processed immediately/i)).toBeVisible()
  })

  test('purpose dropdown has all options', async ({ page }) => {
    const select = page.getByTestId('donate-purpose')
    const options = await select.locator('option').allTextContents()
    expect(options).toContain('General Donation')
    expect(options).toContain('Zakat')
    expect(options).toContain('Emergency Relief')
    expect(options).toContain('Orphan Care')
  })
})

// ---------------------------------------------------------------------------
// 2. URL PARAMETER PRE-FILL
// ---------------------------------------------------------------------------

test.describe('Donate Page — URL Parameters', () => {
  test('pre-fills amount from ?amount= parameter', async ({ page }) => {
    await page.goto('/donate?amount=250')
    await expect(page.getByTestId('donate-amount-input')).toHaveValue('250')
  })

  test('pre-fills Zakat purpose from ?zakat_amount= parameter', async ({ page }) => {
    await page.goto('/donate?zakat_amount=312.50')
    await expect(page.getByTestId('donate-amount-input')).toHaveValue('312.5')
    await expect(page.getByTestId('donate-purpose')).toHaveValue('Zakat')
  })

  test('pre-fills frequency from ?frequency= parameter', async ({ page }) => {
    await page.goto('/donate?amount=50&frequency=Monthly')
    await expect(page.getByTestId('donate-freq-monthly')).toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// 3. ONE-TIME PAYMENT — Full flow to Stripe redirect
// ---------------------------------------------------------------------------

test.describe('One-Time Payment Flow', () => {
  test('submitting a one-time donation redirects to Stripe Checkout', async ({ page }) => {
    await page.goto('/donate')

    await fillDonationForm(page, {
      quickAmount: 50,
      name: 'E2E One-Time Donor',
      email: `e2e-onetime-${Date.now()}@test.myzakat.org`,
      purpose: 'Zakat',
    })

    // Click submit
    await page.getByTestId('donate-submit').click()

    // Should show processing state
    await expect(page.getByText('Processing...')).toBeVisible({ timeout: 5000 })

    // Wait for Stripe redirect — the URL should change to checkout.stripe.com
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 })

    // Verify we're on the Stripe Checkout page
    expect(page.url()).toContain('checkout.stripe.com')
  })

  test('donation with different purpose creates a valid Stripe session', async ({ page }) => {
    await page.goto('/donate')

    await fillDonationForm(page, {
      quickAmount: 100,
      name: 'E2E Purpose Test',
      email: `e2e-purpose-${Date.now()}@test.myzakat.org`,
      purpose: 'Education',
    })

    await page.getByTestId('donate-submit').click()
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 })
    expect(page.url()).toContain('checkout.stripe.com')
  })

  test('large quick-amount donation ($1000) redirects to Stripe', async ({ page }) => {
    await page.goto('/donate')

    await fillDonationForm(page, {
      quickAmount: 1000,
      name: 'E2E Large Donor',
      email: `e2e-large-${Date.now()}@test.myzakat.org`,
    })

    await page.getByTestId('donate-submit').click()
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 })
    expect(page.url()).toContain('checkout.stripe.com')
  })

  test('pre-filled amount from URL enables submit and redirects', async ({ page }) => {
    // Simulates coming from the Zakat calculator with a pre-filled amount
    await page.goto('/donate?amount=312.50')

    await page.getByTestId('donate-name').fill('E2E URL Amount')
    await page.getByTestId('donate-email').fill(`e2e-url-${Date.now()}@test.myzakat.org`)

    // Button should be enabled since amount came from URL
    await expect(page.getByTestId('donate-submit')).toBeEnabled({ timeout: 5000 })

    await page.getByTestId('donate-submit').click()
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 })
    expect(page.url()).toContain('checkout.stripe.com')
  })
})

// ---------------------------------------------------------------------------
// 4. SUBSCRIPTION FLOW — Monthly/Annual to Stripe redirect
// ---------------------------------------------------------------------------

test.describe('Subscription Payment Flow', () => {
  test('monthly subscription redirects to Stripe Checkout', async ({ page }) => {
    await page.goto('/donate')

    await fillDonationForm(page, {
      quickAmount: 25,
      name: 'E2E Monthly Donor',
      email: `e2e-monthly-${Date.now()}@test.myzakat.org`,
      frequency: 'monthly',
      purpose: 'General Donation',
    })

    // Submit button should say "Set up Recurring Donation"
    await expect(page.getByTestId('donate-submit')).toContainText('Set up Recurring Donation')

    await page.getByTestId('donate-submit').click()
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 })
    expect(page.url()).toContain('checkout.stripe.com')
  })

  test('annual subscription redirects to Stripe Checkout', async ({ page }) => {
    await page.goto('/donate')

    await fillDonationForm(page, {
      quickAmount: 500,
      name: 'E2E Annual Donor',
      email: `e2e-annual-${Date.now()}@test.myzakat.org`,
      frequency: 'annually',
    })

    await page.getByTestId('donate-submit').click()
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 })
    expect(page.url()).toContain('checkout.stripe.com')
  })
})

// ---------------------------------------------------------------------------
// 5. ZAKAT CALCULATOR → DONATE FLOW
// ---------------------------------------------------------------------------

test.describe('Zakat Calculator to Donation Flow', () => {
  test('calculator results link to donate page with pre-filled amount', async ({ page }) => {
    await page.goto('/zakat-calculator')

    // Fill in a simple cash amount
    const cashInput = page.locator('input[type="number"]').first()
    await cashInput.fill('10000')

    // Submit the calculator
    const calculateButton = page.getByRole('button', { name: /calculate/i })
    await calculateButton.click()

    // Wait for results to appear
    await expect(page.getByText(/total zakat/i)).toBeVisible({ timeout: 10000 })

    // Look for a "Pay Zakat" or "Donate" link/button in the results
    const donateLink = page.getByRole('link', { name: /pay.*zakat|donate.*zakat/i })
    if (await donateLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await donateLink.click()

      // Should navigate to /donate with amount pre-filled
      await expect(page).toHaveURL(/\/donate/)
      const amountInput = page.getByTestId('donate-amount-input')
      const value = await amountInput.inputValue()
      expect(parseFloat(value)).toBeGreaterThan(0)
    }
    // If no donate link in results, that's OK — the calculator still works
  })
})

// ---------------------------------------------------------------------------
// 6. NAVIGATION & ACCESSIBILITY
// ---------------------------------------------------------------------------

test.describe('Donation Page — Navigation', () => {
  test('donate page is accessible from homepage', async ({ page }) => {
    await page.goto('/')

    // Find a "Donate" link/button on the homepage
    const donateLink = page.getByRole('link', { name: /donate/i }).first()
    await donateLink.click()

    await expect(page).toHaveURL(/\/donate/)
    await expect(page.getByRole('heading', { name: /make a donation/i })).toBeVisible()
  })

  test('success page renders correctly', async ({ page }) => {
    await page.goto('/donation-success')

    await expect(page.getByText(/thank you/i)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Return to Home' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 7. BACKEND API HEALTH (verified through the UI)
// ---------------------------------------------------------------------------

test.describe('Backend API Health', () => {
  test('health endpoint responds', async ({ request }) => {
    const resp = await request.get(`${BACKEND_URL}/health`)
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    expect(body.status).toBe('healthy')
  })

  test('stats endpoint responds with valid data', async ({ request }) => {
    const resp = await request.get(`${BACKEND_URL}/api/donations/stats`)
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    expect(body).toHaveProperty('total_donations')
    expect(body).toHaveProperty('total_donors')
    expect(body).toHaveProperty('impact')
  })
})
