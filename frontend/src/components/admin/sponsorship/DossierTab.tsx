import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Collapsible, LongText, Modal } from '..'
import { useToast } from '../../../contexts/ToastContext'
import { sponsorshipAdmin, errorDetail, type NeedCategory, type StaffCase } from '../../../utils/sponsorshipApi'
import { NEED_CATEGORIES } from '../../sponsorship/labels'
import { fieldLabel, fmtDateTime, money, needLabel, plural, showValue, toCents, toDollars } from './format'
import { Panel, firstLine, type CaseTabProps } from './ui'

const SITUATIONS = ['loss_of_breadwinner', 'illness_disability', 'unemployment', 'displacement', 'divorce_abandonment', 'low_income', 'other']
const HOUSING = ['owned', 'rented', 'hosted', 'shelter_camp', 'other']
const RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling', 'grandchild', 'grandparent', 'other']
const LONG_FIELDS = new Set(['situation_description', 'income_sources', 'other_aid', 'urgent_needs', 'health_notes',
  'health_status', 'interests', 'father_death_cause', 'address'])

/** A label/value list of dossier fields; long ones fold to two lines. */
const FieldList = ({ data, fields }: { data: Record<string, unknown>; fields: string[] }) => (
  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
    {fields.filter((f) => f in data).map((f) => (
      <div key={f} className={LONG_FIELDS.has(f) ? 'sm:col-span-2 min-w-0' : 'min-w-0'}>
        <dt className="text-xs font-medium text-gray-500">{fieldLabel(f)}</dt>
        <dd className="mt-0.5 text-sm text-gray-900 break-words">
          {LONG_FIELDS.has(f) ? <LongText text={(data[f] as string) || null} /> : showValue(f, data[f])}
        </dd>
      </div>
    ))}
  </dl>
)

const FAMILY_HEAD = ['head_full_name', 'head_national_id', 'head_birth_year', 'head_gender', 'head_marital_status',
  'head_occupation', 'household_size', 'housing_status', 'monthly_rent_cents', 'health_notes']
const CHILD = ['full_name', 'gender', 'birth_date', 'age', 'orphan_type', 'lives_with', 'school_level', 'school_name',
  'siblings_count', 'health_status', 'interests']
const PARENTS = ['father_name', 'father_death_date', 'father_death_cause', 'mother_name', 'mother_alive', 'mother_death_date']
const GUARDIAN = ['guardian_name', 'guardian_relationship', 'guardian_national_id', 'guardian_phone']
const SITUATION = ['situation_category', 'situation_description', 'monthly_income_cents', 'income_sources', 'other_aid', 'urgent_needs']
const ADDRESS = ['address', 'city', 'region', 'country']

/** Everything the applicant filed, folded by section, with a staff editor. */
const DossierTab = ({ case: c, onUpdated }: CaseTabProps) => {
  const [editing, setEditing] = useState(false)
  const d = c.dossier
  const needs = (d.needs || []) as { category: string; monthly_cents: number; note?: string | null }[]

  return (
    <div className="space-y-4">
      <Panel
        title="Dossier"
        flush
        actions={
          <button type="button" className="btn-secondary btn-sm gap-2" onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4" aria-hidden="true" /> Edit dossier
          </button>
        }
      >
        <Collapsible title="Situation"
          preview={[showValue('situation_category', d.situation_category), firstLine(d.situation_description)].filter((x) => x && x !== '—').join(' · ')}>
          <FieldList data={d} fields={SITUATION} />
        </Collapsible>

        <Collapsible title={`Monthly needs · ${money(c.requested_monthly_cents)} requested`}
          preview={needs.map((n) => `${needLabel(n.category)} ${money(n.monthly_cents)}`).join(', ')}>
          <ul className="divide-y divide-gray-100 text-sm">
            {needs.map((n, i) => (
              <li key={i} className="py-1.5 flex flex-wrap justify-between gap-2">
                <span className="text-gray-900">{needLabel(n.category)}{n.note ? <span className="text-gray-500"> · {n.note}</span> : null}</span>
                <span className="tabular-nums font-medium">{money(n.monthly_cents)}</span>
              </li>
            ))}
          </ul>
        </Collapsible>

        {c.kind === 'family' ? (
          <>
            <Collapsible title="Head of family" preview={[c.details.head_full_name, c.details.head_occupation].filter(Boolean).join(' · ')}>
              <FieldList data={c.details} fields={FAMILY_HEAD} />
            </Collapsible>
            <Collapsible title={`Household members (${c.members.length})`}
              preview={c.members.map((m) => `${m.first_name} (${showValue('relationship', m.relationship)})`).join(', ')}>
              {c.members.length === 0 ? <p className="text-sm text-gray-600">No members listed.</p> : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="py-1 pr-4 font-medium">First name</th>
                        <th className="py-1 pr-4 font-medium">Relationship</th>
                        <th className="py-1 pr-4 font-medium">Gender</th>
                        <th className="py-1 pr-4 font-medium">Born</th>
                        <th className="py-1 pr-4 font-medium">Occupation / school</th>
                        <th className="py-1 pr-4 font-medium">Health</th>
                        <th className="py-1 font-medium">Orphan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {c.members.map((m, i) => (
                        <tr key={i}>
                          <td className="py-1.5 pr-4">{m.first_name}</td>
                          <td className="py-1.5 pr-4">{showValue('relationship', m.relationship)}</td>
                          <td className="py-1.5 pr-4">{showValue('gender', m.gender)}</td>
                          <td className="py-1.5 pr-4">{m.birth_year ?? '—'}</td>
                          <td className="py-1.5 pr-4">{m.occupation_or_school || '—'}</td>
                          <td className="py-1.5 pr-4">{m.health_note || '—'}</td>
                          <td className="py-1.5">{m.is_orphan ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Collapsible>
          </>
        ) : (
          <>
            <Collapsible title="The child" preview={[c.details.full_name, c.details.age != null ? `${c.details.age} years` : null, c.details.school_level].filter(Boolean).join(' · ')}>
              <FieldList data={c.details} fields={CHILD} />
            </Collapsible>
            <Collapsible title="Parents" preview={`Orphan of ${showValue('orphan_type', c.details.orphan_type)}`}>
              <FieldList data={c.details} fields={PARENTS} />
            </Collapsible>
            <Collapsible title="Guardian" preview={[c.details.guardian_name, c.details.guardian_relationship].filter(Boolean).join(' · ')}>
              <FieldList data={c.details} fields={GUARDIAN} />
            </Collapsible>
          </>
        )}

        <Collapsible title="Address" preview={[c.city, d.region, c.country].filter(Boolean).join(', ')}>
          <FieldList data={{ ...d, city: c.city, country: c.country }} fields={ADDRESS} />
        </Collapsible>

        <Collapsible title="Consent" preview={`Verification ${c.consent.verification ? 'given' : 'not given'} · publication ${c.consent.publication ? 'given' : 'not given'}`}>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-gray-500">Verification</dt><dd>{c.consent.verification ? 'Given' : 'Not given'}</dd></div>
            <div><dt className="text-xs text-gray-500">Publication</dt><dd>{c.consent.publication ? 'Given' : 'Not given'}</dd></div>
            <div><dt className="text-xs text-gray-500">Recorded</dt><dd>{fmtDateTime(c.consent.at)}</dd></div>
          </dl>
          {c.consent.text && <LongText text={c.consent.text} />}
        </Collapsible>
      </Panel>

      {editing && <DossierEditor case={c} onClose={() => setEditing(false)} onSaved={(u) => { onUpdated(u); setEditing(false) }} />}
    </div>
  )
}

// ── Editor ────────────────────────────────────────────────────────────

type Form = Record<string, string>
interface NeedRow { category: NeedCategory; amount: string; note: string }
interface MemberRow {
  first_name: string; relationship: string; gender: string; birth_year: string
  occupation_or_school: string; health_note: string; is_orphan: boolean
}

const TEXT_COMMON = ['submitter_name', 'submitter_phone', 'organization_name', 'country', 'region', 'city', 'address',
  'situation_category', 'situation_description', 'income_sources', 'other_aid', 'urgent_needs']
const TEXT_FAMILY = ['head_full_name', 'head_national_id', 'housing_status', 'health_notes']
const TEXT_ORPHAN = ['full_name', 'birth_date', 'school_level', 'school_name', 'health_status', 'guardian_name', 'guardian_phone']

const str = (v: unknown) => (v == null ? '' : String(v))

const initialForm = (c: StaffCase): Form => {
  const source: Record<string, unknown> = {
    ...c.dossier, ...c.details,
    submitter_name: c.submitter_name, submitter_phone: c.submitter_phone, organization_name: c.organization_name,
    country: c.country, city: c.city,
  }
  const keys = [...TEXT_COMMON, ...(c.kind === 'family' ? TEXT_FAMILY : TEXT_ORPHAN)]
  const form: Form = Object.fromEntries(keys.map((k) => [k, str(source[k])]))
  form.monthly_income = toDollars(c.dossier.monthly_income_cents ?? 0)
  if (c.kind === 'family') {
    form.household_size = str(c.details.household_size)
    form.monthly_rent = toDollars(c.details.monthly_rent_cents ?? 0)
  }
  return form
}

const initialNeeds = (c: StaffCase): NeedRow[] =>
  ((c.dossier.needs || []) as { category: NeedCategory; monthly_cents: number; note?: string | null }[])
    .map((n) => ({ category: n.category, amount: toDollars(n.monthly_cents), note: n.note || '' }))

const initialMembers = (c: StaffCase): MemberRow[] => c.members.map((m) => ({
  first_name: str(m.first_name), relationship: str(m.relationship) || 'child', gender: str(m.gender),
  birth_year: str(m.birth_year), occupation_or_school: str(m.occupation_or_school), health_note: str(m.health_note),
  is_orphan: Boolean(m.is_orphan),
}))

const needsPayload = (rows: NeedRow[]) => rows.map((r) => ({
  category: r.category, monthly_cents: toCents(r.amount) ?? 0, note: r.note.trim() || null,
}))

const membersPayload = (rows: MemberRow[]) => rows.map((m) => ({
  first_name: m.first_name.trim(), relationship: m.relationship, gender: m.gender || null,
  birth_year: m.birth_year ? Number(m.birth_year) : null, occupation_or_school: m.occupation_or_school.trim() || null,
  health_note: m.health_note.trim() || null, is_orphan: m.is_orphan,
}))

const DossierEditor = ({ case: c, onClose, onSaved }: { case: StaffCase; onClose: () => void; onSaved: (c: StaffCase) => void }) => {
  const { showSuccess } = useToast()
  const original = useMemo(() => initialForm(c), [c])
  const originalNeeds = useMemo(() => JSON.stringify(needsPayload(initialNeeds(c))), [c])
  const originalMembers = useMemo(() => JSON.stringify(membersPayload(initialMembers(c))), [c])
  const [form, setForm] = useState<Form>(original)
  const [needs, setNeeds] = useState<NeedRow[]>(() => initialNeeds(c))
  const [members, setMembers] = useState<MemberRow[]>(() => initialMembers(c))
  const [consent, setConsent] = useState(c.consent.publication)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const buildPayload = (): Record<string, unknown> | string => {
    const body: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(form)) {
      if (['monthly_income', 'monthly_rent', 'household_size'].includes(k)) continue
      if (v.trim() !== original[k].trim()) body[k] = v.trim() || null
    }
    if (form.monthly_income !== original.monthly_income) {
      const cents = toCents(form.monthly_income)
      if (cents == null) return 'Monthly income must be an amount (0 if none).'
      body.monthly_income_cents = cents
    }
    if (c.kind === 'family') {
      if (form.monthly_rent !== original.monthly_rent) {
        const cents = toCents(form.monthly_rent)
        if (cents == null) return 'Monthly rent must be an amount (0 if none).'
        body.monthly_rent_cents = cents
      }
      if (form.household_size !== original.household_size) {
        const n = Number(form.household_size)
        if (!Number.isInteger(n) || n < 1 || n > 30) return 'Household size must be between 1 and 30.'
        body.household_size = n
      }
      const mp = membersPayload(members)
      if (JSON.stringify(mp) !== originalMembers) {
        if (mp.some((m) => !m.first_name)) return 'Every household member needs a first name.'
        body.members = mp
      }
    }
    const np = needsPayload(needs)
    if (JSON.stringify(np) !== originalNeeds) {
      if (np.length === 0) return 'List at least one monthly need.'
      if (np.some((n) => n.monthly_cents <= 0)) return 'Every monthly need needs a positive amount.'
      body.needs = np
    }
    if (consent !== c.consent.publication) body.consent_publication = consent
    for (const required of ['submitter_name', 'country', 'city', 'head_full_name', 'full_name', 'guardian_name']) {
      if (required in body && !body[required]) return `${fieldLabel(required)} cannot be empty.`
    }
    if ('birth_date' in body && !body.birth_date) return 'Birth date cannot be empty.'
    return body
  }

  const save = async () => {
    const payload = buildPayload()
    if (typeof payload === 'string') { setError(payload); return }
    if (Object.keys(payload).length === 0) { onClose(); return }
    setBusy(true)
    setError(null)
    try {
      const res = await sponsorshipAdmin.edit(c.id, { ...payload, ...(note.trim() ? { note: note.trim() } : {}) })
      showSuccess('Dossier saved', res.changed.length ? `Changed: ${res.changed.map(fieldLabel).join(', ')}` : 'Nothing changed.')
      onSaved(res.case)
    } catch (e) {
      setError(errorDetail(e) || 'Could not save the dossier.')
    } finally {
      setBusy(false)
    }
  }

  const Text = ({ k, area = false, type = 'text' }: { k: string; area?: boolean; type?: string }) => (
    <div className={area ? 'sm:col-span-2' : undefined}>
      <label htmlFor={`dz-${k}`} className="label">{fieldLabel(k)}</label>
      {area
        ? <textarea id={`dz-${k}`} className="input" rows={3} value={form[k]} onChange={set(k)} />
        : <input id={`dz-${k}`} className="input" type={type} value={form[k]} onChange={set(k)} />}
    </div>
  )

  const Select = ({ k, options }: { k: string; options: string[] }) => (
    <div>
      <label htmlFor={`dz-${k}`} className="label">{fieldLabel(k)}</label>
      <select id={`dz-${k}`} className="input" value={form[k]} onChange={set(k)}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{showValue('x', o)}</option>)}
      </select>
    </div>
  )

  return (
    <Modal
      title={`Edit dossier · ${c.reference}`}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </>
      }
    >
      <div className="space-y-6">
        <p className="text-sm text-gray-600">Every change is recorded in the history, field by field, with your name.</p>
        {error && <div role="alert" className="alert-error">{error}</div>}

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900">Submitter and address</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Text({ k: 'submitter_name' })}
            {Text({ k: 'submitter_phone', type: 'tel' })}
            {Text({ k: 'organization_name' })}
            {Text({ k: 'country' })}
            {Text({ k: 'region' })}
            {Text({ k: 'city' })}
            {Text({ k: 'address', area: true })}
          </div>
        </fieldset>

        {c.kind === 'family' ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-900">Household</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Text({ k: 'head_full_name' })}
              {Text({ k: 'head_national_id' })}
              <div>
                <label htmlFor="dz-household_size" className="label">Household size</label>
                <input id="dz-household_size" className="input" type="number" min={1} max={30} value={form.household_size} onChange={set('household_size')} />
              </div>
              {Select({ k: 'housing_status', options: HOUSING })}
              <div>
                <label htmlFor="dz-monthly_rent" className="label">Monthly rent (USD)</label>
                <input id="dz-monthly_rent" className="input" inputMode="decimal" value={form.monthly_rent} onChange={set('monthly_rent')} />
              </div>
              {Text({ k: 'health_notes', area: true })}
            </div>
            <MembersEditor rows={members} onChange={setMembers} />
          </fieldset>
        ) : (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-900">The child and guardian</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Text({ k: 'full_name' })}
              {Text({ k: 'birth_date', type: 'date' })}
              {Text({ k: 'school_level' })}
              {Text({ k: 'school_name' })}
              {Text({ k: 'guardian_name' })}
              {Text({ k: 'guardian_phone', type: 'tel' })}
              {Text({ k: 'health_status', area: true })}
            </div>
          </fieldset>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-900">Situation</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Select({ k: 'situation_category', options: SITUATIONS })}
            <div>
              <label htmlFor="dz-monthly_income" className="label">Monthly income (USD)</label>
              <input id="dz-monthly_income" className="input" inputMode="decimal" value={form.monthly_income} onChange={set('monthly_income')} />
            </div>
            {Text({ k: 'situation_description', area: true })}
            {Text({ k: 'income_sources', area: true })}
            {Text({ k: 'other_aid', area: true })}
            {Text({ k: 'urgent_needs', area: true })}
          </div>
          <NeedsEditor rows={needs} onChange={setNeeds} />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-gray-900">Consent</legend>
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>The applicant consents to publication of an anonymous profile. Change this only when they gave or withdrew consent another way (paper, phone), and say so in the note.</span>
          </label>
        </fieldset>

        <div>
          <label htmlFor="dz-note" className="label">Why this change (optional, kept in the history)</label>
          <textarea id="dz-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        </div>
      </div>
    </Modal>
  )
}

const NeedsEditor = ({ rows, onChange }: { rows: NeedRow[]; onChange: (r: NeedRow[]) => void }) => {
  const update = (i: number, patch: Partial<NeedRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const total = rows.reduce((s, r) => s + (toCents(r.amount) ?? 0), 0)
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Monthly needs · total {money(total)}</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[12rem_8rem_1fr_auto] gap-2 items-end">
          <div>
            <label htmlFor={`need-cat-${i}`} className="sr-only">Need {i + 1} category</label>
            <select id={`need-cat-${i}`} className="input" value={r.category} onChange={(e) => update(i, { category: e.target.value as NeedCategory })}>
              {NEED_CATEGORIES.map((n) => <option key={n} value={n}>{needLabel(n)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`need-amt-${i}`} className="sr-only">Need {i + 1} monthly amount (USD)</label>
            <input id={`need-amt-${i}`} className="input" inputMode="decimal" placeholder="USD" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`need-note-${i}`} className="sr-only">Need {i + 1} note</label>
            <input id={`need-note-${i}`} className="input" placeholder="Note (optional)" value={r.note} onChange={(e) => update(i, { note: e.target.value })} maxLength={300} />
          </div>
          <button type="button" className="btn-ghost btn-sm gap-1" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove
          </button>
        </div>
      ))}
      {rows.length < 10 && (
        <button type="button" className="btn-secondary btn-sm gap-1" onClick={() => onChange([...rows, { category: 'food', amount: '', note: '' }])}>
          <Plus className="w-4 h-4" aria-hidden="true" /> Add a need
        </button>
      )}
    </div>
  )
}

const MembersEditor = ({ rows, onChange }: { rows: MemberRow[]; onChange: (r: MemberRow[]) => void }) => {
  const update = (i: number, patch: Partial<MemberRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Household members · {plural(rows.length, 'person', 'people')}</p>
      {rows.map((m, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label htmlFor={`m-name-${i}`} className="label">First name</label>
            <input id={`m-name-${i}`} className="input" value={m.first_name} onChange={(e) => update(i, { first_name: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`m-rel-${i}`} className="label">Relationship</label>
            <select id={`m-rel-${i}`} className="input" value={m.relationship} onChange={(e) => update(i, { relationship: e.target.value })}>
              {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`m-gender-${i}`} className="label">Gender</label>
            <select id={`m-gender-${i}`} className="input" value={m.gender} onChange={(e) => update(i, { gender: e.target.value })}>
              <option value="">—</option><option value="male">male</option><option value="female">female</option>
            </select>
          </div>
          <div>
            <label htmlFor={`m-year-${i}`} className="label">Birth year</label>
            <input id={`m-year-${i}`} className="input" inputMode="numeric" value={m.birth_year} onChange={(e) => update(i, { birth_year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
          </div>
          <div className="col-span-2">
            <label htmlFor={`m-occ-${i}`} className="label">Occupation or school</label>
            <input id={`m-occ-${i}`} className="input" value={m.occupation_or_school} onChange={(e) => update(i, { occupation_or_school: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label htmlFor={`m-health-${i}`} className="label">Health note</label>
            <input id={`m-health-${i}`} className="input" value={m.health_note} onChange={(e) => update(i, { health_note: e.target.value })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={m.is_orphan} onChange={(e) => update(i, { is_orphan: e.target.checked })} /> Orphan
          </label>
          <div className="col-span-2 flex justify-end">
            <button type="button" className="btn-ghost btn-sm gap-1" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove member
            </button>
          </div>
        </div>
      ))}
      {rows.length < 30 && (
        <button type="button" className="btn-secondary btn-sm gap-1" onClick={() => onChange([...rows, {
          first_name: '', relationship: 'child', gender: '', birth_year: '', occupation_or_school: '', health_note: '', is_orphan: false,
        }])}>
          <Plus className="w-4 h-4" aria-hidden="true" /> Add a member
        </button>
      )}
    </div>
  )
}

export default DossierTab
