/**
 * The submitter portal — /my-proposals.
 *
 * Applicants have no account. They prove who they are with a six-digit code we
 * email to the address on their dossier, and the resulting portal token lives
 * in sessionStorage for thirty minutes (see utils/proposalPortalApi, which is
 * deliberately a separate axios instance so a staff member's session is never
 * touched by this flow).
 *
 * Five views:
 *   email — "the email address you applied with"; POST /portal/request-code.
 *   not-found — the server answered 404: nothing is filed under that address,
 *           so no code was sent and saying one was would be a lie.
 *   code  — the six digits; POST /portal/verify-code stores the token.
 *   list  — GET /portal/me, one card per dossier, with "Fix and resubmit" on
 *           the ones the reviewers marked editable.
 *   edit  — ProposalForm in mode="revise", prefilled from the current version;
 *           PUT /portal/{id} appends a new version.
 *
 * ── Why the pending-payload dance exists ──────────────────────────────────
 * The portal token dies after thirty minutes. Revising twenty-five fields
 * takes longer than that more often than you would think, so the PUT is the
 * single most likely request to come back 401 — and it is the one carrying
 * work the applicant cannot be asked to retype.
 *
 * So a 401 on the PUT never unmounts the form. We stash the payload the form
 * just handed us in `pendingPayload`, ask the server for a fresh code, and
 * swap the *visible* panel to the code step while the form stays mounted
 * (hidden, its twenty-five useState values untouched) underneath. When the new
 * token lands, we replay that exact same payload automatically. The applicant
 * types six digits and their work goes through; they never see the form reset.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, CheckCircle2, Clock, Eye, FileText, Inbox, KeyRound,
  Loader2, Mail, MessageSquare, PencilLine, XCircle,
} from 'lucide-react'
import SEOHead from '../components/SEOHead'
import ProposalForm, {
  EMPTY_PROPOSAL_FORM,
  parseFieldErrors,
  type FieldError,
  type ProposalFormValues,
  type buildProposalPayload,
} from '../components/proposals/ProposalForm'
import {
  clearPortalToken,
  fetchMyProposals,
  hasPortalToken,
  isNoProposalForAddress,
  requestPortalCode,
  submitRevision,
  verifyPortalCode,
  type PortalProposal,
} from '../utils/proposalPortalApi'

type View = 'email' | 'code' | 'list' | 'edit' | 'not-found'
type ProposalPayload = ReturnType<typeof buildProposalPayload>

const STATUS_BADGE: Record<string, string> = {
  submitted:         'bg-blue-100 text-blue-800',
  under_review:      'bg-amber-100 text-amber-800',
  changes_requested: 'bg-orange-100 text-orange-800',
  approved:          'bg-green-100 text-green-800',
  rejected:          'bg-red-100 text-red-800',
}

const STATUS_LABEL: Record<string, string> = {
  submitted:         'Submitted',
  under_review:      'Under review',
  changes_requested: 'Changes requested',
  approved:          'Approved',
  // Deliberately gentler than the admin-side "Rejected": this is the wording
  // the applicant reads about their own application.
  rejected:          'Not funded',
}

const STATUS_ICON: Record<string, typeof Clock> = {
  submitted:         Clock,
  under_review:      Eye,
  changes_requested: PencilLine,
  approved:          CheckCircle2,
  rejected:          XCircle,
}

const StatusBadge = ({ status }: { status: string }) => {
  const Icon = STATUS_ICON[status] || FileText
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${STATUS_BADGE[status] || 'bg-gray-100 text-gray-700'}`}>
      <Icon className="w-3.5 h-3.5" />
      {STATUS_LABEL[status] || status}
    </span>
  )
}

const formatDate = (value: string): string => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * The portal hands back `content` with API types — numbers for the budget
 * fields, null for the optional ones. ProposalFormValues is all strings, so
 * every value is stringified and null/undefined becomes ''.
 */
const toFormValues = (content: Record<string, unknown>): ProposalFormValues => {
  const out = { ...EMPTY_PROPOSAL_FORM }
  ;(Object.keys(EMPTY_PROPOSAL_FORM) as (keyof ProposalFormValues)[]).forEach((key) => {
    const raw = content?.[key]
    out[key] = raw === null || raw === undefined ? '' : String(raw)
  })
  return out
}

/**
 * Thrown instead of posting an empty address to /portal/request-code.
 *
 * An empty `email` earns a 422 from the backend, and the generic failure
 * handling that used to follow swapped the applicant onto the code panel --
 * a panel no code can ever satisfy, because none was ever sent. A distinct
 * error type lets the 401 handler treat "we have no address" differently from
 * "the address is fine but the send failed", which is the difference between
 * an unrecoverable dead end and a retry.
 */
class MissingPortalEmailError extends Error {
  constructor() {
    super('No email address to send a portal sign-in code to.')
    this.name = 'MissingPortalEmailError'
  }
}

const statusOf = (error: any): number | undefined => error?.response?.status

const detailOf = (error: any): unknown => error?.response?.data?.detail

const MyProposals = () => {
  const [view, setView] = useState<View>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [flash, setFlash] = useState('')

  const [items, setItems] = useState<PortalProposal[]>([])
  const [editing, setEditing] = useState<PortalProposal | null>(null)

  // The revision the applicant already submitted once, held across a
  // re-authentication so we can replay it without touching the form.
  const [pendingPayload, setPendingPayload] = useState<ProposalPayload | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([])
  const [genericError, setGenericError] = useState('')

  // Keeps the auto-replay effect from firing twice for one token.
  const replayingRef = useRef(false)

  const reauthenticating = view === 'code' && pendingPayload !== null

  const loadList = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const { email: tokenEmail, items: dossiers } = await fetchMyProposals()
      // Adopt the address the token was issued for. After a same-tab reload
      // `email` is '' -- the mount effect goes straight to the list and the
      // sign-in input never runs -- and without this the 401 handler in
      // sendRevision would have nowhere to send a fresh code, and the code
      // panel's "we sent it to ..." label would render blank.
      if (tokenEmail) setEmail(tokenEmail)
      setItems(dossiers)
      setView('list')
    } catch (exc: any) {
      if (statusOf(exc) === 401) {
        clearPortalToken()
        setView('email')
        setError('Your sign-in session has expired. Please request a new code.')
      } else {
        // Set the view explicitly. Leaving it alone let the render chain fall
        // through to the sign-in panel, so an applicant holding a perfectly
        // valid token was asked to sign in again beside a load error -- and,
        // after a successful revision, beside the green "your proposal has
        // been sent" flash too. Stay on the list, where the error belongs.
        setError('We could not load your proposals. Please try again.')
        setView('list')
      }
    } finally {
      setBusy(false)
    }
  }, [])

  // A token already in sessionStorage (a reload within the same tab) skips
  // straight to the list.
  useEffect(() => {
    if (hasPortalToken()) void loadList()
  }, [loadList])

  // ── Step: ask for a code ─────────────────────────────────────────────
  const askForCode = async (target: string, opts?: { silent?: boolean }) => {
    // Never post an empty address, and never move to the code panel without
    // one: the applicant would be staring at an input for a code that was
    // never sent, with no way out that keeps their work.
    if (!target.trim()) throw new MissingPortalEmailError()
    const { message } = await requestPortalCode(target.trim())
    if (!opts?.silent) setNotice(message)
    setCode('')
    setView('code')
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(''); setNotice(''); setFlash('')
    try {
      await askForCode(email.trim())
    } catch (exc: any) {
      if (isNoProposalForAddress(exc)) {
        if (pendingPayload) {
          // Mid-revision: the dossier vanished under us. Do not swap the view
          // out from under a form that still holds the applicant's edits --
          // keep them where they are and say what happened.
          setError('We can no longer find a proposal under this address. Your changes are still on screen — copy anything you need before leaving this page.')
          return
        }
        // Not an error the applicant caused -- most often they used a
        // different address than the one on the application. Say so, and
        // give them somewhere to go.
        setView('not-found')
      } else if (statusOf(exc) === 429) {
        setError(exc?.response?.data?.detail
          ?? 'Too many sign-in codes requested. Please wait and try again later. '
            + 'This usually clears within 15 minutes, or up to an hour if you share a network connection with other applicants.')
      } else {
        setError('We could not send the code. Please check the address and try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  // ── The PUT, shared by the first attempt and the post-re-auth replay ──
  const sendRevision = useCallback(async (proposalId: number, payload: ProposalPayload) => {
    setBusy(true); setFieldErrors([]); setGenericError('')
    try {
      await submitRevision(proposalId, payload as unknown as Record<string, unknown>)
      setPendingPayload(null)
      setEditing(null)
      setFlash('Your updated proposal has been sent to the review team.')
      await loadList()
    } catch (exc: any) {
      const status = statusOf(exc)
      if (status === 401) {
        // The thirty minutes ran out mid-edit. Hold on to everything the
        // applicant just wrote, get a fresh code, and replay it after.
        setPendingPayload(payload)
        clearPortalToken()
        try {
          await askForCode(email.trim(), { silent: true })
          setNotice('Your sign-in session expired while you were writing. We have emailed you a new code — enter it and we will send your proposal straight through. Nothing you typed has been lost.')
        } catch (codeExc: any) {
          // This is the one path where the applicant's unsaved work is at
          // stake: the form below holds the only copy of a twenty-six field
          // revision, and it cannot be copied out of a hidden panel. So when we
          // cannot get a code to them we keep `view = 'edit'`, which leaves the
          // form visible (`reauthenticating` stays false), and keep
          // pendingPayload so a token arriving by any route still replays it.
          if (codeExc instanceof MissingPortalEmailError) {
            // No address at all -- a reloaded tab whose /portal/me answer we
            // never got, so `email` was never adopted. Asking for a code is
            // impossible here and "Send me a new code" would fail identically,
            // so do not offer the code panel. Say what happened and point at a
            // second tab, which leaves this one -- and everything typed into
            // it -- untouched.
            setGenericError(
              'Your sign-in session expired and this tab no longer knows which address to email a code to. '
              + 'Everything you typed is still here — please do not reload this tab. '
              + 'Open My Proposals in a new tab, sign in there, and copy your answers across from here.',
            )
            return
          }
          if (isNoProposalForAddress(codeExc)) {
            // The dossier is gone from under the applicant. The code panel
            // would promise "enter the six-digit code we sent to ..." when
            // nothing was sent, so stay on the form -- it is still mounted and
            // still holds the only copy of what they wrote.
            setGenericError(
              'We can no longer find a proposal under this address. '
              + 'Your changes are still on screen — copy anything you need before leaving this page.',
            )
            return
          }
          // The address is good and the send failed (rate limit, network). The
          // code panel is still the way through, and "Send me a new code"
          // genuinely works from it, so offer it -- the form stays mounted
          // behind it and the payload is replayed once a token lands.
          setError('Your session expired and we could not email a new code. Please try again in a few minutes.')
          setView('code')
        }
        return
      }
      if (status === 422) {
        setFieldErrors(parseFieldErrors(detailOf(exc)))
        return
      }
      if (status === 409) {
        setGenericError('This proposal is no longer open for changes.')
        return
      }
      const detail = detailOf(exc)
      setGenericError(typeof detail === 'string' ? detail : 'We could not save your changes. Please try again.')
    } finally {
      setBusy(false)
    }
  }, [email, loadList])

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await verifyPortalCode(email.trim(), code)
      setNotice('')
      if (pendingPayload && editing) {
        // The auto-replay effect below picks it up now that a token exists.
        replayingRef.current = false
        setView('edit')
      } else {
        await loadList()
      }
    } catch (exc: any) {
      if (statusOf(exc) === 401) {
        setError('That code is not valid or has expired. Request a new one below.')
      } else {
        setError('We could not verify that code. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  // Auto-resubmit the held payload the moment a fresh token exists.
  useEffect(() => {
    if (view !== 'edit' || !pendingPayload || !editing) return
    if (!hasPortalToken() || replayingRef.current) return
    replayingRef.current = true
    void sendRevision(editing.id, pendingPayload)
  }, [view, pendingPayload, editing, sendRevision])

  const handleFormSubmit = async (payload: ProposalPayload) => {
    if (!editing) return
    replayingRef.current = true  // this attempt is the applicant's own
    await sendRevision(editing.id, payload)
  }

  const startEditing = (proposal: PortalProposal) => {
    setEditing(proposal)
    setPendingPayload(null)
    setFieldErrors([])
    setGenericError('')
    setFlash('')
    replayingRef.current = false
    setView('edit')
  }

  const backToEmail = () => {
    clearPortalToken()
    setEditing(null)
    setPendingPayload(null)
    setCode('')
    setNotice(''); setError(''); setFlash('')
    setView('email')
  }

  const initialValues = useMemo(
    () => (editing ? toFormValues(editing.content) : undefined),
    [editing],
  )

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <SEOHead
        title="My Proposals"
        description="Check the status of the project proposals you submitted to the Zakat Distribution Foundation, and resubmit the ones the review team asked you to revise."
        canonicalPath="/my-proposals"
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="text-center">
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900">My Proposals</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
            Check where your application stands and send in the changes our review team asked for.
            No account needed — we email you a sign-in code.
          </p>
        </div>
        {children}
      </div>
    </div>
  )

  const alerts = (
    <>
      {flash && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{flash}</span>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </>
  )

  // ── View: enter your email ───────────────────────────────────────────
  const emailPanel = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-2 text-primary-700">
        <Mail className="w-5 h-5" />
        <h2 className="text-lg font-bold text-gray-900">Sign in to your proposals</h2>
      </div>
      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div>
          <label htmlFor="portal-email" className="block text-sm font-medium text-gray-700 mb-1">
            The email address you applied with
          </label>
          <input
            id="portal-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
            placeholder="you@example.com"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2"
        >
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <>Email me a code</>}
        </button>
      </form>
      <p className="text-xs text-gray-500">
        Haven't applied yet?{' '}
        <Link to="/submit-proposal" className="text-primary-700 font-medium hover:underline">Submit a project proposal</Link>.
      </p>
    </div>
  )

  // ── View: nothing is filed under that address ────────────────────────
  //
  // Reached only from the sign-in panel, where the backend answers 404 rather
  // than the opaque 202 it used to. Before that, an unknown address landed on
  // the code panel reading "enter the code we sent to ..." — a sentence that
  // was simply untrue.
  const notFoundPanel = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 max-w-md mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">No proposal filed under this address</h2>
          <p className="text-sm text-gray-600 mt-1">
            We looked for <strong className="text-gray-900 break-all">{email.trim()}</strong> and
            found nothing. The most common reason is that the application was sent from a
            different email address.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => { setView('email'); setError(''); setNotice('') }}
        className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg"
      >
        Try a different address
      </button>
      <p className="text-sm text-gray-600 text-center">
        Never sent one?{' '}
        <Link to="/submit-proposal" className="text-primary-700 font-medium hover:underline">
          Submit a proposal
        </Link>
      </p>
    </div>
  )

  // ── View: enter the six-digit code ───────────────────────────────────
  const codePanel = (
    <div className={`bg-white rounded-xl shadow-sm border p-6 sm:p-8 space-y-4 max-w-lg mx-auto ${reauthenticating ? 'border-amber-300' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 text-primary-700">
        <KeyRound className="w-5 h-5" />
        <h2 className="text-lg font-bold text-gray-900">
          {reauthenticating ? 'Just confirm it\'s you' : 'Check your inbox'}
        </h2>
      </div>
      {notice && (
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">{notice}</p>
      )}
      <form onSubmit={handleCodeSubmit} className="space-y-4">
        <div>
          <label htmlFor="portal-code" className="block text-sm font-medium text-gray-700 mb-1">
            Enter the six-digit code we sent to {email.trim()}
          </label>
          <input
            id="portal-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="input-field tracking-[0.4em] text-center text-lg font-semibold"
            placeholder="000000"
          />
        </div>
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2"
        >
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
            : reauthenticating ? <>Confirm and send my proposal</> : <>Sign in</>}
        </button>
      </form>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <button
          type="button"
          onClick={() => void handleEmailSubmit({ preventDefault: () => {} } as React.FormEvent)}
          disabled={busy}
          className="text-primary-700 font-medium hover:underline disabled:text-gray-400"
        >
          Send me a new code
        </button>
        <button type="button" onClick={backToEmail} className="hover:underline">
          Use a different email address
          {reauthenticating && <span className="block text-gray-400">(discards the edits in progress)</span>}
        </button>
      </div>
    </div>
  )

  // ── View: the dashboard ──────────────────────────────────────────────
  const listPanel = (
    <div className="space-y-4">
      {busy && items.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 inline-flex items-center justify-center gap-2 w-full">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your proposals…
        </div>
      )}

      {/* A failed load leaves `items` empty too, and "No proposals yet" would
          then be a guess dressed up as a fact. Offer the retry instead. */}
      {!busy && items.length === 0 && error && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <button
            onClick={() => void loadList()}
            className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg"
          >
            Try again
          </button>
        </div>
      )}

      {!busy && items.length === 0 && !error && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-gray-300" />
          <h2 className="text-lg font-bold text-gray-900">No proposals yet</h2>
          <p className="text-sm text-gray-600">
            There is nothing filed under {email.trim() || 'this address'} yet.
          </p>
          <Link
            to="/submit-proposal"
            className="inline-block px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg"
          >
            Submit a project proposal
          </Link>
        </div>
      )}

      {items.map((p) => (
        <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{p.project_name || 'Untitled proposal'}</h2>
              <p className="text-sm text-gray-500 mt-1">
                Reference #{p.id} · Submitted {formatDate(p.submitted_at)}
                {p.version_no && p.version_no > 1 && <> · Version {p.version_no}</>}
              </p>
            </div>
            <StatusBadge status={p.status} />
          </div>

          {p.decision_comment && (
            <blockquote className="border-l-4 border-amber-300 bg-amber-50 rounded-r-lg p-3 text-sm text-amber-900">
              <span className="flex items-center gap-1.5 font-semibold mb-1">
                <MessageSquare className="w-3.5 h-3.5" /> From the review team
              </span>
              <span className="whitespace-pre-line">{p.decision_comment}</span>
            </blockquote>
          )}

          {p.editable && (
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={() => startEditing(p)}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2"
              >
                <PencilLine className="w-4 h-4" /> Fix and resubmit
              </button>
            </div>
          )}
        </div>
      ))}

      {items.length > 0 && (
        <div className="text-center">
          <button onClick={backToEmail} className="text-sm text-gray-500 hover:text-gray-800 hover:underline">
            Sign out of this portal
          </button>
        </div>
      )}
    </div>
  )

  // ── View: revise ─────────────────────────────────────────────────────
  //
  // Rendered whenever a dossier is open for editing — INCLUDING while we are
  // re-authenticating after a 401, when the code panel sits on top and the
  // form below is merely hidden. Conditionally rendering the form here would
  // throw away the twenty-five values it holds in its own state, which is
  // exactly what this whole dance exists to prevent.
  const editPanel = editing && (
    <div className="space-y-6">
      {reauthenticating && codePanel}

      <div className={reauthenticating ? 'hidden' : 'space-y-6'} aria-hidden={reauthenticating}>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">
              {editing.project_name || 'Untitled proposal'}{' '}
              <span className="text-sm font-normal text-gray-500">· Reference #{editing.id}</span>
            </h2>
            <StatusBadge status={editing.status} />
          </div>
          {editing.decision_comment ? (
            <blockquote className="border-l-4 border-amber-300 bg-amber-50 rounded-r-lg p-3 text-sm text-amber-900">
              <span className="flex items-center gap-1.5 font-semibold mb-1">
                <MessageSquare className="w-3.5 h-3.5" /> What the review team asked for
              </span>
              <span className="whitespace-pre-line">{editing.decision_comment}</span>
            </blockquote>
          ) : (
            <p className="text-sm text-gray-600">
              Update anything you need to and resubmit — we keep every version of your application.
            </p>
          )}
          <button
            onClick={() => { setEditing(null); setPendingPayload(null); setView('list') }}
            className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 pt-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back to my proposals
          </button>
        </div>

        <ProposalForm
          mode="revise"
          initialValues={initialValues}
          // Read defensively: `serialize_for_portal`'s content dict is built
          // from PROPOSAL_CONTENT_FIELDS, which does not include sms_consent,
          // so this is `undefined` today and the box stays unticked. The moment
          // the backend adds the field to that payload, an existing opt-in is
          // restated by the revision instead of being silently revoked.
          initialSmsConsent={Boolean((editing.content as any).sms_consent)}
          onSubmit={handleFormSubmit}
          submitting={busy}
          fieldErrors={fieldErrors}
          genericError={genericError}
        />
      </div>
    </div>
  )

  if (editing) return shell(<>{alerts}{editPanel}</>)
  if (view === 'not-found') return shell(notFoundPanel)
  if (view === 'code') return shell(<>{alerts}{codePanel}</>)
  if (view === 'list') return shell(<>{alerts}{listPanel}</>)
  return shell(<>{alerts}{emailPanel}</>)
}

export default MyProposals
