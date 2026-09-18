/**
 * The proposal-versioning loop, end to end in a real browser.
 *
 * One test walks the whole circle — public submission → admin "Request
 * changes" → the account-less submitter portal → a revision → the admin's
 * version history — and finishes by counting the rows the loop should have
 * left behind. A second test checks the negative: a rejected dossier is not
 * offered for revision.
 */
import { test, expect, Page } from '@playwright/test'
import { execFileSync } from 'child_process'

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PASSWORD! }

// Same reasoning as media-workspaces.spec.ts: without admin credentials every
// assertion would fail on the login step for reasons that say nothing about
// the feature, and because deploy depends on the e2e job that would block
// deploys rather than report a regression. Skip, so the gap shows up as a skip.
//
// To run it: E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npx playwright test
const HAS_CREDENTIALS = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)

// A unique address per run: this spec never deletes what it creates, so a fixed
// address would accumulate dossiers and make the portal list ambiguous.
const APPLICANT = `e2e-proposal-${Date.now()}@example.com`
const KNOWN_CODE = '424242'

const ORIGINAL_PROJECT = `E2E Well Project ${Date.now()}`
const REVISED_PROJECT = `${ORIGINAL_PROJECT} (revised)`
const REVIEWER_MESSAGE = 'Please give us a firmer number for the beneficiaries and a clearer budget breakdown.'

function sql(statement: string): string {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'myzakat', '-t', '-A', '-c', statement],
    { encoding: 'utf8' },
  ).trim()
}

/** Replace the newest live code's hash with one of KNOWN_CODE.
 *
 * The code is emailed and stored only as a bcrypt digest, so it cannot be
 * recovered. Planting a known digest keeps the verification path real — the
 * browser still posts a code to /portal/verify-code and gets a token back. */
function plantKnownCode(email: string): void {
  const hash = execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'backend', 'python', '-c',
     `from auth_utils import get_password_hash; print(get_password_hash("${KNOWN_CODE}"))`],
    { encoding: 'utf8' },
  ).trim()
  sql(`UPDATE proposal_access_codes SET code_hash = '${hash}'
        WHERE id = (SELECT id FROM proposal_access_codes
                     WHERE lower(email) = lower('${email}') AND consumed_at IS NULL
                     ORDER BY created_at DESC LIMIT 1);`)
}

/**
 * Log in through the real login page and reach the admin console.
 *
 * UserLogin.tsx's email/password inputs are not associated with their <label>
 * via htmlFor/id (react-hook-form's `register` only wires up name/ref), so
 * this matches on the placeholder text, which is stable. A successful login
 * does not navigate to /admin itself: UserLogin redirects to "/" once
 * `isAuthenticated` flips true.
 *
 * From "/" this clicks through the header's profile menu rather than calling
 * page.goto('/admin'), because a hard load of any /admin/* URL does NOT work
 * while logged in. App.tsx restores the session from localStorage inside a
 * useEffect, which React runs only AFTER the first render — and on that first
 * render AdminRoute sees isAuthenticated === false and redirects to /login,
 * which in turn bounces an authenticated visitor to "/". The bug is
 * deterministic, not a race, and it predates this feature (it hits refresh,
 * bookmarks and new tabs on every admin page). Client-side navigation from an
 * already-mounted app is unaffected, so that is what this uses.
 */
async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByPlaceholder(/enter your email/i).fill(user.email)
  await page.getByPlaceholder(/enter your password/i).fill(user.password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  // Bounded: bad credentials leave the browser sitting on /login, and without
  // a timeout here that silence eats the whole test budget and reports itself
  // as "test timed out" instead of "the login did not go through".
  await page.waitForURL('/', { timeout: 15_000 })

  await page.getByRole('button', { name: /profile menu/i }).click()
  await page.getByRole('link', { name: /admin console/i }).click()
  await page.waitForURL(/\/admin/)
}

/** Click through the admin sidebar to the proposals list. */
async function gotoProposalsList(page: Page) {
  const link = page.getByRole('link', { name: 'Project Proposals' })
  // "Project Proposals" lives under the collapsible "People" group, which may
  // already be open (AdminLayout remembers the expanded set).
  if (!(await link.isVisible())) {
    await page.getByRole('button', { name: /^people$/i }).click()
  }
  await link.click()
  await expect(page.getByPlaceholder(/search by name, project, or email/i)).toBeVisible()
}

/**
 * Fill all four steps of ProposalForm and leave the wizard on step 4.
 *
 * Every label is matched with getByLabel, which only works because each Field
 * now carries an htmlFor pointing at its control's id. The text lengths are
 * chosen to clear ProposalForm's MIN_LEN map, which mirrors the backend's
 * Pydantic min_length rules — a shorter string would stop the Continue button
 * from enabling and the failure would look like a locator problem.
 */
async function fillProposal(page: Page, projectName: string, applicant: string = APPLICANT) {
  // Step 1 — personal
  await page.getByLabel('Full name').fill('Amina Yusuf')
  await page.getByLabel('National ID number').fill('E2E-90210')
  await page.getByLabel('Date of birth (year)').fill('1992')
  await page.getByLabel('Place of residence').fill('Gaza City')
  // Anchored: the optional SMS-consent checkbox on this same step is labelled
  // with a disclosure that says "…at the mobile number provided above", so a
  // bare substring match finds two controls.
  await page.getByLabel(/^Mobile number/).fill('+970599000000')
  await page.getByLabel('Email').fill(applicant)
  await page.getByLabel('Educational level').fill('BSc Agricultural Engineering')
  await page.getByRole('button', { name: /^continue$/i }).click()

  // Step 2 — project
  await expect(page.getByRole('heading', { name: /project information/i })).toBeVisible()
  await page.getByLabel('Project name').fill(projectName)
  await page.getByLabel('Project idea description').fill('Drilling and equipping a community water well serving displaced families.')
  await page.getByLabel('What problem does the project solve?').fill('There is no safe drinking water within four kilometres of the camp.')
  await page.getByLabel('Target beneficiaries').fill('250 displaced families in the northern camp.')
  await page.getByLabel('How will the project serve the community?').fill('Free, metered water points open to every household in the camp.')
  await page.getByLabel('Expected economic or social impact').fill('Fewer waterborne illnesses and hours of walking returned to schooling and work.')
  await page.getByRole('button', { name: /^continue$/i }).click()

  // Step 3 — plan
  await expect(page.getByRole('heading', { name: /project plan/i })).toBeVisible()
  await page.getByLabel('Implementation steps').fill('Survey the site\nDrill the borehole\nInstall the pump\nHand over to the committee')
  await page.getByLabel('Where will the project be implemented?').fill('Northern displacement camp, Gaza')
  await page.getByLabel('Required materials or equipment').fill('Drilling rig\nSubmersible pump\nStorage tank\nPiping')
  await page.getByLabel('Expected duration to start implementation').fill('Two weeks after procurement')
  await page.getByLabel('How will the project continue after funding?').fill('A local water committee collects a small maintenance fee per household.')
  await page.getByLabel('Why is it feasible under current conditions?').fill('The aquifer is shallow here and the drilling contractor is already on site.')
  await page.getByLabel('Expected challenges and how to address them').fill('Fuel shortages: stockpile before drilling\nAccess restrictions: coordinate with local committees')
  await page.getByRole('button', { name: /^continue$/i }).click()

  // Step 4 — budget
  await expect(page.getByRole('heading', { name: /required budget/i })).toBeVisible()
  await page.getByLabel('Beneficiaries (count)').fill('250')
  await page.getByLabel('Cost per unit (USD)').fill('20')
  await page.getByLabel('Unit type').fill('family')
}

/**
 * Sign in to the submitter portal with a planted code, landing on the list.
 *
 * Note for anyone re-running this locally: proposal_otp caps code requests at
 * three per address per fifteen minutes. Both tests mint a fresh address every
 * run, so neither can trip that cap -- which is the other reason no test here
 * signs in as a fixed address.
 */
async function portalSignIn(page: Page, email: string) {
  await page.goto('/my-proposals')
  await page.getByLabel(/email address you applied with/i).fill(email)
  await page.getByRole('button', { name: /email me a code/i }).click()

  // The code step is proof the request went through; only then is there a row
  // whose hash we can overwrite.
  await expect(page.getByRole('heading', { name: /check your inbox/i })).toBeVisible()
  plantKnownCode(email)

  await page.getByLabel(/six-digit code/i).fill(KNOWN_CODE)
  await page.getByRole('button', { name: /^sign in$/i }).click()
}

/**
 * Open a dossier's detail modal from the proposals list, which must already be
 * on screen. Refreshes first so a second call picks up anything that changed
 * in between — the list is fetched once per mount.
 */
async function openAdminDossier(adminPage: Page, projectName: string) {
  await adminPage.getByTitle('Refresh').click()
  await adminPage.getByPlaceholder(/search by name, project, or email/i).fill(projectName)
  const row = adminPage.getByRole('row').filter({ hasText: projectName })
  await expect(row).toHaveCount(1)
  await row.getByTitle('Review').click()
  await expect(adminPage.getByRole('heading', { name: projectName })).toBeVisible()
}

/** The modal's close control is an icon-only button with no accessible name. */
async function closeAdminDossier(adminPage: Page) {
  await adminPage.locator('div.fixed.inset-0.z-50').locator('button:has(svg.lucide-x)').click()
  await expect(adminPage.locator('div.fixed.inset-0.z-50')).toHaveCount(0)
}

/**
 * Type the applicant-facing reason and press one of the decision buttons.
 *
 * The dossier's modal must already be open. `changeStatus` refuses a rejection
 * or a change request with an empty comment, because the applicant would get an
 * email with no reason in it, so the comment comes first.
 */
async function recordDecision(adminPage: Page, action: RegExp, comment: string) {
  await adminPage.getByPlaceholder(/what the applicant will read/i).fill(comment)
  await adminPage.getByRole('button', { name: action }).click()
}

test.describe('proposal versioning', () => {
  test.skip(!HAS_CREDENTIALS, 'needs E2E_ADMIN_* credentials for an admin account')

  test('submit, request changes, revise through the portal', async ({ page, browser }) => {
    // Four form steps, an admin login in a second context and two portal
    // round-trips do not fit in the 60s default.
    test.setTimeout(240_000)

    // ── 1. The applicant submits ──────────────────────────────────────
    await page.goto('/submit-proposal')
    await fillProposal(page, ORIGINAL_PROJECT)
    await page.getByRole('button', { name: /^submit proposal$/i }).click()

    await expect(page.getByRole('heading', { name: /proposal received/i })).toBeVisible()
    const reference = await page.getByText(/reference number:/i).innerText()
    const proposalId = Number(reference.match(/#(\d+)/)![1])
    expect(proposalId).toBeGreaterThan(0)

    // ── 2. An admin asks for changes ──────────────────────────────────
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await login(adminPage, ADMIN)
    await gotoProposalsList(adminPage)
    await openAdminDossier(adminPage, ORIGINAL_PROJECT)

    await recordDecision(adminPage, /request changes/i, REVIEWER_MESSAGE)

    // Scoped to the modal: the status <select> behind it carries a
    // "Changes requested" <option> that an unscoped match would find whatever
    // the dossier's real status was.
    const modal = adminPage.locator('div.fixed.inset-0.z-50')
    // Two badges inside the modal now read "Changes requested": the dossier's,
    // in the header, and version 1's, in the history — a decision is recorded
    // against the version it judged, so both are right. `.first()` is the
    // header one; the count pins the second down rather than ignoring it.
    await expect(modal.getByText('Changes requested', { exact: true }).first()).toBeVisible()
    await expect(modal.getByText('Changes requested', { exact: true })).toHaveCount(2)
    await closeAdminDossier(adminPage)

    // ── 3. The applicant signs in to the portal ───────────────────────
    // Logged out and cookie-free: the portal's only identity is the emailed
    // code, and nothing the submission tab left behind may stand in for it.
    await page.context().clearCookies()
    await page.evaluate(() => { sessionStorage.clear(); localStorage.clear() })
    await portalSignIn(page, APPLICANT)

    await expect(page.getByRole('heading', { name: ORIGINAL_PROJECT })).toBeVisible()
    await expect(page.getByText('Changes requested', { exact: true })).toBeVisible()
    await expect(page.getByText(REVIEWER_MESSAGE)).toBeVisible()

    // ── 4. They revise and resubmit ───────────────────────────────────
    await page.getByRole('button', { name: /fix and resubmit/i }).click()

    const email = page.getByLabel('Email')
    await expect(email).toBeDisabled()
    await expect(email).toHaveValue(APPLICANT)

    await page.getByRole('button', { name: /^continue$/i }).click()
    await expect(page.getByLabel('Project name')).toHaveValue(ORIGINAL_PROJECT)
    await page.getByLabel('Project name').fill(REVISED_PROJECT)
    await page.getByRole('button', { name: /^continue$/i }).click()
    await page.getByRole('button', { name: /^continue$/i }).click()
    await page.getByRole('button', { name: /^resubmit proposal$/i }).click()

    await expect(page.getByText(/updated proposal has been sent/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: REVISED_PROJECT })).toBeVisible()
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible()

    // ── 5. The admin sees a two-entry history ─────────────────────────
    await openAdminDossier(adminPage, REVISED_PROJECT)
    await expect(adminPage.getByText('Version history (2)')).toBeVisible()
    await expect(adminPage.getByText('Version 1', { exact: true })).toBeVisible()
    await expect(adminPage.getByText('Version 2', { exact: true })).toBeVisible()

    // The reviewer's message hangs off version 1 — the version it decided —
    // not off the dossier as a whole.
    const versionOne = adminPage.getByText('Version 1', { exact: true }).locator('xpath=../..')
    await expect(versionOne.getByText(REVIEWER_MESSAGE)).toBeVisible()

    // Expanding version 1 must show the ORIGINAL name, not the current one.
    // That is the whole point of an append-only chain: the old text is still
    // there, unmodified, after the revision overwrote the dossier's fields.
    await versionOne.getByRole('button', { name: /view content/i }).click()
    await expect(versionOne.getByText(ORIGINAL_PROJECT, { exact: true })).toBeVisible()
    await adminContext.close()

    // ── 6. Straight from the database ─────────────────────────────────
    expect(sql(`SELECT count(*) FROM proposal_versions WHERE proposal_id = ${proposalId};`)).toBe('2')
    expect(sql(`SELECT status FROM project_proposals WHERE id = ${proposalId};`)).toBe('submitted')
  })

  test('a rejected dossier is not offered for revision', async ({ page, browser }) => {
    // A submission, an admin login and a portal round-trip, same as test 1.
    test.setTimeout(240_000)

    // This dossier is created here rather than assumed. Nothing in the repo --
    // no migration, no seed, no fixture -- ships a rejected proposal, so a
    // hard-coded address only ever passes on a machine where somebody once
    // INSERTed one by hand, and fails everywhere else on an assertion that
    // says nothing about rejected dossiers.
    const applicant = `e2e-rejected-${Date.now()}@example.com`
    const projectName = `E2E Rejected Project ${Date.now()}`
    const reason = 'We cannot fund transport-only budgets this cycle.'

    // ── 1. The applicant submits ──────────────────────────────────────
    await page.goto('/submit-proposal')
    await fillProposal(page, projectName, applicant)
    await page.getByRole('button', { name: /^submit proposal$/i }).click()
    await expect(page.getByRole('heading', { name: /proposal received/i })).toBeVisible()

    // ── 2. An admin rejects it, with a reason ─────────────────────────
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await login(adminPage, ADMIN)
    await gotoProposalsList(adminPage)
    await openAdminDossier(adminPage, projectName)

    await recordDecision(adminPage, /^reject$/i, reason)

    // Scoped to the modal, for the same reason as test 1: the filter bar behind
    // it carries a "Rejected" <option>. `.first()` is the dossier's own badge;
    // version 1's, in the history, reads the same and is equally correct.
    const modal = adminPage.locator('div.fixed.inset-0.z-50')
    await expect(modal.getByText('Rejected', { exact: true }).first()).toBeVisible()
    await adminContext.close()

    // ── 3. The applicant sees a verdict, not an invitation ────────────
    await page.context().clearCookies()
    await page.evaluate(() => { sessionStorage.clear(); localStorage.clear() })
    await portalSignIn(page, applicant)

    await expect(page.getByRole('heading', { name: projectName })).toBeVisible()
    // The portal softens "Rejected" to "Not funded" for the applicant.
    await expect(page.getByText('Not funded')).toBeVisible()
    await expect(page.getByText(reason)).toBeVisible()
    await expect(page.getByRole('button', { name: /fix and resubmit/i })).toHaveCount(0)
  })
})
