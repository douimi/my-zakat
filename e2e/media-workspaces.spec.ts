import { test, expect, Page } from '@playwright/test'
import path from 'path'

const FIELD_STAFF = { email: 'e2e-field@example.com', password: 'e2e-testpass' }
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PASSWORD! }

// This spec needs two things CI does not currently provide: a seeded
// e2e-field@example.com field-staff account, and admin credentials. Without
// them every assertion would fail on the login step for reasons that say
// nothing about the feature — and because deploy depends on the e2e job, that
// would block deploys rather than report a real regression. Skip instead, so
// the gap is visible as a skip rather than hidden as a failure.
//
// To run it: seed the field-staff account (see the plan's Task 20 step 3) and
// set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
const HAS_CREDENTIALS = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)

/**
 * Log in through the real login page and land on /admin.
 *
 * UserLogin.tsx's email/password inputs are not associated with their
 * <label> via htmlFor/id (react-hook-form's `register` only wires up
 * name/ref), so `getByLabel` cannot find them — this uses the placeholder
 * text instead, which is stable.
 *
 * A successful login does not navigate to /admin itself: UserLogin redirects
 * to "/" once `isAuthenticated` flips true. The /admin index route
 * (AdminIndex in App.tsx) is what sends staff to their landing page
 * (field_staff -> /admin/media, manager -> /admin/stories, admin -> the
 * dashboard) — so this helper visits /admin explicitly after the redirect
 * to "/" lands, and lets that index route do the rest.
 */
async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByPlaceholder(/enter your email/i).fill(user.email)
  await page.getByPlaceholder(/enter your password/i).fill(user.password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL('/')
  await page.goto('/admin')
}

test.describe('media workspaces', () => {
  test.skip(!HAS_CREDENTIALS, 'needs a seeded field-staff account and E2E_ADMIN_* credentials')

  test('field staff land on their workspace and see nothing else', async ({ page }) => {
    await login(page, FIELD_STAFF)
    await expect(page).toHaveURL(/\/admin\/media$/)
    await expect(page.getByRole('heading', { name: /my workspace/i })).toBeVisible()

    // The sidebar nav is field staff's only destination — "My Workspace" is
    // the sole entry AdminLayout's per-role allowlist (adminNav.ts) grants
    // the field_staff role. Scoped to <nav> deliberately: the account
    // section below the nav always renders a "My Donations" link
    // (/dashboard) for every role, so an unscoped search for "donations"
    // would find it even though the *nav* correctly hides the Donations
    // group.
    const sidebarNav = page.locator('nav')
    await expect(sidebarNav.getByRole('link', { name: /donations/i })).toHaveCount(0)
    await expect(sidebarNav.getByRole('link', { name: /settings/i })).toHaveCount(0)
  })

  test('upload, search, submit, then admin publishes', async ({ page, browser }) => {
    await login(page, FIELD_STAFF)

    await page.getByTestId('media-file-input').setInputFiles(
      path.join(__dirname, 'fixtures', 'sample.jpg')
    )
    await expect(page.getByText('sample.jpg')).toBeVisible({ timeout: 30_000 })

    // Give it a title so it is findable, then search for it.
    await page.getByRole('button', { name: /sample\.jpg/i }).click()
    await page.getByLabel(/title/i).fill('E2E well opening')
    await page.getByLabel(/tags/i).fill('e2e, gaza')
    await page.getByRole('button', { name: /save details/i }).click()
    await page.getByRole('button', { name: /submit for review/i }).click()
    await expect(page.getByText(/in review/i).first()).toBeVisible()
    await page.getByRole('button', { name: /close/i }).click()

    await page.getByPlaceholder(/search/i).fill('well opening')
    await expect(page.getByRole('button', { name: /E2E well opening/i })).toBeVisible()

    // An admin finds it in the review queue and publishes it.
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await login(adminPage, ADMIN)
    await adminPage.goto('/admin/media/all')
    await adminPage.getByRole('button', { name: /review queue/i }).click()
    await adminPage.getByRole('button', { name: /E2E well opening/i }).click()
    await adminPage.getByRole('button', { name: /^publish$/i }).click()
    await expect(adminPage.getByText(/status/i)).toBeVisible()
    await adminContext.close()
  })
})
