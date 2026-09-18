# Project Proposal Versioning & Submitter Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a project proposal into a dossier with an append-only chain of versions, so admins can accept / reject / request changes with a per-version audit trail, and submitters — who have no account — get notified by email and revise sent-back proposals through a six-digit-code portal.

**Architecture:** `project_proposals` becomes the dossier (identity, status, pointer to the current version); all form content moves into `proposal_versions`, written once per submission. Decisions are recorded on the version they apply to. A new `proposal_otp` module issues one-time codes stored as bcrypt hashes; they are exchanged for a JWT carrying `typ: "proposal_portal"`, which `verify_token()` refuses to treat as a staff session. Domain logic lives in backend-root service modules (`proposal_service.py`, `proposal_pdf.py`, `proposal_otp.py`), matching the existing `media_library_service.py` / `s3_service.py` pattern; the routers stay thin.

**Tech Stack:** FastAPI, SQLAlchemy (no `relationship()` — this codebase queries explicitly), PostgreSQL with hand-numbered SQL migrations, pytest against in-memory SQLite, reportlab for PDFs, Jinja templates + Resend/Arq for email, React 18 + Vite + TypeScript + Tailwind, vitest + @testing-library, Playwright for E2E.

---

## Deviations from the spec

Both are recorded here and have been applied back into
`docs/superpowers/specs/2026-09-17-proposal-versioning-design.md`.

1. **No SQLAlchemy relationships.** `backend/models.py` defines none — see the
   note at `models.py:691` — and every query in the project is explicit. The
   plan follows that. One consequence: SQLite does not enforce foreign keys by
   default, so `ON DELETE CASCADE` does not fire in the test suite. The delete
   endpoint therefore removes versions explicitly rather than relying on the
   database.

2. **The backfill is SQL inside migration 32, not a Python script.** The pytest
   suite builds its schema from `Base.metadata.create_all` and never replays the
   SQL migrations, so a SQLite unit test of a Python backfill would not exercise
   the migration that actually runs in production. An `INSERT … SELECT` in the
   migration is atomic with the DDL, is guarded by `current_version_id IS NULL`
   so it is idempotent, and is verified in Task 2 against the real Postgres
   container with a seeded legacy row.

## Deployment order (read before Task 2)

The three database steps are **not** interchangeable:

1. Apply `32_proposal_versioning.sql`. It is additive: it creates the two new
   tables, adds `current_version_id`, backfills version 1, and **drops the
   NOT NULL constraints** on the legacy content columns. Old code keeps running
   against it unchanged.
2. Deploy the new backend image.
3. Apply `33_drop_proposal_content_columns.sql`, which drops the now-unused
   legacy columns from `project_proposals`.

Step 1 must precede step 2 because the new code inserts dossier rows without any
content columns; without the NOT NULL relaxation those inserts fail. Step 3 must
follow step 2, not precede it, because the old image still writes those columns.

## File structure

| Path | Responsibility |
|---|---|
| `migrations/32_proposal_versioning.sql` | New tables, pointer column, SQL backfill, NOT NULL relaxation |
| `migrations/33_drop_proposal_content_columns.sql` | Drops the legacy content columns |
| `backend/models.py` | `ProposalVersion`, `ProposalAccessCode`; reshaped `ProjectProposal` |
| `backend/proposal_pdf.py` | reportlab rendering only — no HTTP, no ORM queries |
| `backend/proposal_service.py` | Domain logic: create, revise, record decision, serialize |
| `backend/proposal_otp.py` | One-time codes: generation, rate limits, verification |
| `backend/auth_utils.py` | `typ` claim enforcement, portal token minting, `get_portal_email` |
| `backend/routers/project_proposals.py` | Public submit + admin HTTP layer (thin) |
| `backend/routers/proposal_portal.py` | Portal HTTP layer (thin) |
| `backend/email_service.py` | Five new template shims |
| `backend/email_templates/proposal_*.{html,txt}` | Five template pairs |
| `frontend/src/components/proposals/ProposalForm.tsx` | The four-section form, shared by create and revise |
| `frontend/src/pages/SubmitProposal.tsx` | Public page: a shell around `ProposalForm` |
| `frontend/src/pages/MyProposals.tsx` | Portal: email → code → dashboard → revise |
| `frontend/src/utils/proposalPortalApi.ts` | Portal HTTP client, isolated from `auth_token` |
| `frontend/src/pages/admin/AdminProjectProposals.tsx` | Version history + two-field decision modal |
| `backend/tests/test_project_proposals.py` | Dossier, versions, decisions, PDFs |
| `backend/tests/test_proposal_portal.py` | OTP, token isolation, revision rules |
| `frontend/src/components/proposals/__tests__/ProposalForm.test.tsx` | Form modes and payload |
| `e2e/proposal-versioning.spec.ts` | Full submit → changes requested → revise loop |

---

## Task 1: New models, additive only

Nothing breaks in this task: `ProjectProposal` keeps its content columns, they
only become nullable so that later tasks can create dossiers without them.

**Files:**
- Modify: `backend/models.py:594-653`
- Test: `backend/tests/test_project_proposals.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_project_proposals.py`:

```python
"""Project proposal dossiers and their append-only version chain."""
import pytest
from datetime import datetime, timedelta
from sqlalchemy.exc import IntegrityError

from models import ProjectProposal, ProposalVersion, ProposalAccessCode


def _content(**overrides) -> dict:
    """A complete, valid set of the 26 proposal content fields."""
    base = {
        "full_name": "Amina Yusuf",
        "national_id": "ID-90210",
        "date_of_birth_year": 1992,
        "place_of_residence": "Sanaa",
        "mobile_number": "+967700000000",
        "email": "amina@example.com",
        "educational_level": "BSc Agriculture",
        "project_name": "Fresh Food Parcels",
        "project_description": "Monthly food parcels for displaced families.",
        "problem_solved": "Families cannot afford fresh protein.",
        "target_beneficiaries": "200 displaced families",
        "community_impact": "Local butchers supply the parcels.",
        "expected_impact": "Better nutrition for 1200 people.",
        "implementation_steps": "Identify families\nBuy supplies\nDistribute",
        "implementation_location": "Sanaa, Old City district",
        "required_materials": "Chicken\nPackaging\nTransport",
        "expected_duration": "Two weeks after funding",
        "continuity_plan": "Local committee takes over procurement.",
        "feasibility": "Suppliers already identified and quoted.",
        "expected_challenges": "Crowding: allocate time slots",
        "number_of_beneficiaries": 200,
        "cost_per_unit_usd": 20.0,
        "unit_type": "family",
        "additional_expenses_usd": 500.0,
        "additional_expenses_description": "Transport and packaging",
        "total_amount_usd": 4500.0,
    }
    base.update(overrides)
    return base


def test_dossier_carries_identity_and_points_at_a_version(db_session):
    dossier = ProjectProposal(email="amina@example.com", full_name="Amina Yusuf", status="submitted")
    db_session.add(dossier)
    db_session.flush()

    version = ProposalVersion(proposal_id=dossier.id, version_no=1, **_content())
    db_session.add(version)
    db_session.flush()

    dossier.current_version_id = version.id
    db_session.commit()

    assert dossier.current_version_id == version.id
    assert version.decision is None
    assert version.decision_comment is None
    assert version.internal_note is None
    assert version.submitted_at is not None


def test_version_numbers_are_unique_per_dossier(db_session):
    dossier = ProjectProposal(email="a@example.com", full_name="A", status="submitted")
    db_session.add(dossier)
    db_session.flush()

    db_session.add(ProposalVersion(proposal_id=dossier.id, version_no=1, **_content()))
    db_session.commit()

    db_session.add(ProposalVersion(proposal_id=dossier.id, version_no=1, **_content()))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_access_code_row_records_its_own_expiry_and_attempts(db_session):
    now = datetime.utcnow()
    code = ProposalAccessCode(
        email="amina@example.com",
        code_hash="$2b$12$notarealhash",
        expires_at=now + timedelta(minutes=10),
        request_ip="203.0.113.7",
    )
    db_session.add(code)
    db_session.commit()

    assert code.attempts == 0
    assert code.consumed_at is None
    assert code.created_at is not None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_project_proposals.py -v`
Expected: FAIL — `ImportError: cannot import name 'ProposalVersion' from 'models'`

- [ ] **Step 3: Reshape `ProjectProposal` in `backend/models.py`**

Replace the whole class body between `class ProjectProposal(Base):` (line 594)
and the `sms_consent_text` line (653) with the version below. The content
columns stay, but every one of them becomes `nullable=True`, mirroring the
NOT NULL relaxation that migration 32 performs in Postgres. They are deleted
from the model in Task 5 and from the database in Task 10.

```python
class ProjectProposal(Base):
    """One dossier per funding request.

    The dossier holds identity and review state; the submitted content lives in
    `proposal_versions`, one immutable row per submission.

    The content columns below are LEGACY: migration 32 drops their NOT NULL
    constraints and backfills version 1 from them, the code stops reading them
    in Task 5, and migration 33 drops them. They stay here, nullable, only so
    that the window between those two migrations is safe.
    """
    __tablename__ = "project_proposals"

    id = Column(Integer, primary_key=True, index=True)

    # ── Identity (stable across versions) ──────────────────
    email = Column(String(200), nullable=False, index=True)
    full_name = Column(String(200), nullable=True)

    # ── Review state ───────────────────────────────────────
    # submitted | under_review | changes_requested | approved | rejected
    status = Column(String(20), nullable=False, default="submitted", index=True)
    current_version_id = Column(
        Integer, ForeignKey("proposal_versions.id", ondelete="SET NULL"), nullable=True
    )
    submitted_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # ── Legacy content columns (see the docstring) ─────────
    national_id = Column(String(50), nullable=True)
    date_of_birth_year = Column(Integer, nullable=True)
    place_of_residence = Column(String(300), nullable=True)
    mobile_number = Column(String(50), nullable=True)
    educational_level = Column(String(200), nullable=True)
    project_name = Column(String(300), nullable=True)
    project_description = Column(Text, nullable=True)
    problem_solved = Column(Text, nullable=True)
    target_beneficiaries = Column(Text, nullable=True)
    community_impact = Column(Text, nullable=True)
    expected_impact = Column(Text, nullable=True)
    implementation_steps = Column(Text, nullable=True)
    implementation_location = Column(Text, nullable=True)
    required_materials = Column(Text, nullable=True)
    expected_duration = Column(String(300), nullable=True)
    continuity_plan = Column(Text, nullable=True)
    feasibility = Column(Text, nullable=True)
    expected_challenges = Column(Text, nullable=True)
    number_of_beneficiaries = Column(Integer, nullable=True)
    cost_per_unit_usd = Column(Float, nullable=True)
    unit_type = Column(String(50), nullable=True)
    additional_expenses_usd = Column(Float, nullable=True, default=0)
    additional_expenses_description = Column(Text, nullable=True)
    total_amount_usd = Column(Float, nullable=True)
    admin_notes = Column(Text, nullable=True)
    submitted_ip = Column(String(45), nullable=True)
    sms_consent = Column(Boolean, nullable=True, default=False)
    sms_consent_at = Column(DateTime, nullable=True)
    sms_consent_text = Column(Text, nullable=True)


class ProposalVersion(Base):
    """One submission of a proposal's content. Written once, never rewritten.

    A decision is recorded on the version it judges. Once a newer version
    exists, the older one is unreachable for writing — no endpoint addresses a
    non-current version for anything but reading.

    Two FKs point at users.id / project_proposals.id but this model declares no
    relationship(); like the rest of models.py, callers query explicitly. Note
    that `ON DELETE CASCADE` below does NOT fire under the SQLite test runner,
    which leaves foreign keys unenforced — the delete endpoint removes versions
    itself rather than trusting the database.
    """
    __tablename__ = "proposal_versions"

    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(
        Integer, ForeignKey("project_proposals.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    version_no = Column(Integer, nullable=False)

    # ── Section 1: Personal ────────────────────────────────
    full_name = Column(String(200), nullable=False)
    national_id = Column(String(50), nullable=False)
    date_of_birth_year = Column(Integer, nullable=False)
    place_of_residence = Column(String(300), nullable=False)
    mobile_number = Column(String(50), nullable=False)
    email = Column(String(200), nullable=False)
    educational_level = Column(String(200), nullable=False)

    # ── Section 2: Project ─────────────────────────────────
    project_name = Column(String(300), nullable=False)
    project_description = Column(Text, nullable=False)
    problem_solved = Column(Text, nullable=False)
    target_beneficiaries = Column(Text, nullable=False)
    community_impact = Column(Text, nullable=False)
    expected_impact = Column(Text, nullable=False)

    # ── Section 3: Plan ────────────────────────────────────
    implementation_steps = Column(Text, nullable=False)
    implementation_location = Column(Text, nullable=False)
    required_materials = Column(Text, nullable=False)
    expected_duration = Column(String(300), nullable=False)
    continuity_plan = Column(Text, nullable=False)
    feasibility = Column(Text, nullable=False)
    expected_challenges = Column(Text, nullable=False)

    # ── Section 4: Budget ──────────────────────────────────
    number_of_beneficiaries = Column(Integer, nullable=False)
    cost_per_unit_usd = Column(Float, nullable=False)
    unit_type = Column(String(50), nullable=False)
    additional_expenses_usd = Column(Float, nullable=False, default=0)
    additional_expenses_description = Column(Text, nullable=True)
    total_amount_usd = Column(Float, nullable=False)

    # ── This submission's own metadata ─────────────────────
    submitted_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    submitted_ip = Column(String(45), nullable=True)

    # 10DLC / TCR proof-of-consent belongs to the submission act, not to the
    # dossier: it records what this applicant agreed to, at this moment.
    sms_consent = Column(Boolean, nullable=False, default=False)
    sms_consent_at = Column(DateTime, nullable=True)
    sms_consent_text = Column(Text, nullable=True)

    # ── The decision on this version ───────────────────────
    # NULL = awaiting review | approved | rejected | changes_requested
    decision = Column(String(20), nullable=True)
    decision_comment = Column(Text, nullable=True)   # shown to the submitter
    internal_note = Column(Text, nullable=True)      # staff only
    decided_at = Column(DateTime, nullable=True)
    decided_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    __table_args__ = (
        UniqueConstraint("proposal_id", "version_no", name="uq_proposal_version_no"),
    )


class ProposalAccessCode(Base):
    """A one-time six-digit code granting a submitter access to their dossiers.

    The code itself is never stored: only its bcrypt hash. A row is consumed on
    first successful use, and burned once `attempts` reaches the cap.
    """
    __tablename__ = "proposal_access_codes"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(200), nullable=False, index=True)
    code_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    request_ip = Column(String(45), nullable=True)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_project_proposals.py -v`
Expected: 3 passed.

- [ ] **Step 5: Run the whole backend suite — nothing may regress**

Run: `cd backend && python -m pytest -q`
Expected: the same pass/fail counts as before this task. The existing proposal
router still reads and writes the legacy columns, which are all still present.

- [ ] **Step 6: Commit**

```bash
git add backend/models.py backend/tests/test_project_proposals.py
git commit -m "Add proposal version and access-code models"
```

---

## Task 2: Migration 32 — tables, pointer, SQL backfill

**Files:**
- Create: `migrations/32_proposal_versioning.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 32: Project proposal versioning + submitter portal.
--
-- Additive and idempotent. Run order matters — see the plan's
-- "Deployment order" section:
--   1. this migration           (old code keeps working)
--   2. deploy the new backend
--   3. migration 33             (drops the legacy content columns)
--
-- What it does:
--   * creates proposal_versions  — one immutable row per submission
--   * creates proposal_access_codes — one-time portal login codes
--   * adds project_proposals.current_version_id
--   * backfills version 1 for every pre-existing proposal
--   * drops the NOT NULL constraints on the legacy content columns, so the
--     new code can insert a dossier row that carries no content

CREATE TABLE IF NOT EXISTS proposal_versions (
    id                          SERIAL PRIMARY KEY,
    proposal_id                 INTEGER         NOT NULL REFERENCES project_proposals(id) ON DELETE CASCADE,
    version_no                  INTEGER         NOT NULL CHECK (version_no > 0),

    -- ── Section 1: Personal information ────────────────────
    full_name                   VARCHAR(200)    NOT NULL,
    national_id                 VARCHAR(50)     NOT NULL,
    date_of_birth_year          INTEGER         NOT NULL,
    place_of_residence          VARCHAR(300)    NOT NULL,
    mobile_number               VARCHAR(50)     NOT NULL,
    email                       VARCHAR(200)    NOT NULL,
    educational_level           VARCHAR(200)    NOT NULL,

    -- ── Section 2: Project information ─────────────────────
    project_name                VARCHAR(300)    NOT NULL,
    project_description         TEXT            NOT NULL,
    problem_solved              TEXT            NOT NULL,
    target_beneficiaries        TEXT            NOT NULL,
    community_impact            TEXT            NOT NULL,
    expected_impact             TEXT            NOT NULL,

    -- ── Section 3: Project plan ────────────────────────────
    implementation_steps        TEXT            NOT NULL,
    implementation_location     TEXT            NOT NULL,
    required_materials          TEXT            NOT NULL,
    expected_duration           VARCHAR(300)    NOT NULL,
    continuity_plan             TEXT            NOT NULL,
    feasibility                 TEXT            NOT NULL,
    expected_challenges         TEXT            NOT NULL,

    -- ── Section 4: Required budget ─────────────────────────
    number_of_beneficiaries     INTEGER         NOT NULL,
    cost_per_unit_usd           NUMERIC(10, 2)  NOT NULL,
    unit_type                   VARCHAR(50)     NOT NULL,
    additional_expenses_usd     NUMERIC(10, 2)  NOT NULL DEFAULT 0,
    additional_expenses_description TEXT,
    total_amount_usd            NUMERIC(10, 2)  NOT NULL,

    -- ── This submission's own metadata ─────────────────────
    submitted_at                TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_ip                VARCHAR(45),
    sms_consent                 BOOLEAN         NOT NULL DEFAULT FALSE,
    sms_consent_at              TIMESTAMP,
    sms_consent_text            TEXT,

    -- ── The decision on this version ───────────────────────
    -- NULL = awaiting review | approved | rejected | changes_requested
    decision                    VARCHAR(20)
        CHECK (decision IS NULL OR decision IN ('approved', 'rejected', 'changes_requested')),
    decision_comment            TEXT,           -- shown to the submitter
    internal_note               TEXT,           -- staff only
    decided_at                  TIMESTAMP,
    decided_by                  INTEGER         REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_proposal_version_no UNIQUE (proposal_id, version_no)
);

CREATE TABLE IF NOT EXISTS proposal_access_codes (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(200) NOT NULL,
    code_hash     VARCHAR(255) NOT NULL,   -- bcrypt; the code itself is never stored
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at    TIMESTAMP    NOT NULL,
    consumed_at   TIMESTAMP,
    attempts      INTEGER      NOT NULL DEFAULT 0,
    request_ip    VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_proposal_access_codes_email
    ON proposal_access_codes(lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_access_codes_ip
    ON proposal_access_codes(request_ip, created_at DESC);

ALTER TABLE project_proposals
    ADD COLUMN IF NOT EXISTS current_version_id INTEGER
    REFERENCES proposal_versions(id) ON DELETE SET NULL;

-- ── Backfill: every pre-existing proposal becomes its own version 1 ────
-- The INSERT and the UPDATE are one transaction on purpose. psql runs a
-- script in autocommit, so without this an INSERT that commits before a
-- failing UPDATE would leave a version row with a NULL pointer -- and the
-- re-run would then collide with uq_proposal_version_no and abort for good.
-- ON CONFLICT covers the same hole from the other side: if a version 1 does
-- somehow already exist, the UPDATE still repairs the pointer.
BEGIN;

INSERT INTO proposal_versions (
    proposal_id, version_no,
    full_name, national_id, date_of_birth_year, place_of_residence,
    mobile_number, email, educational_level,
    project_name, project_description, problem_solved, target_beneficiaries,
    community_impact, expected_impact,
    implementation_steps, implementation_location, required_materials,
    expected_duration, continuity_plan, feasibility, expected_challenges,
    number_of_beneficiaries, cost_per_unit_usd, unit_type,
    additional_expenses_usd, additional_expenses_description, total_amount_usd,
    submitted_at, submitted_ip,
    sms_consent, sms_consent_at, sms_consent_text,
    decision, decision_comment, internal_note, decided_at, decided_by
)
SELECT
    p.id, 1,
    p.full_name, p.national_id, p.date_of_birth_year, p.place_of_residence,
    p.mobile_number, p.email, p.educational_level,
    p.project_name, p.project_description, p.problem_solved, p.target_beneficiaries,
    p.community_impact, p.expected_impact,
    p.implementation_steps, p.implementation_location, p.required_materials,
    p.expected_duration, p.continuity_plan, p.feasibility, p.expected_challenges,
    p.number_of_beneficiaries, p.cost_per_unit_usd, p.unit_type,
    COALESCE(p.additional_expenses_usd, 0), p.additional_expenses_description, p.total_amount_usd,
    p.submitted_at, p.submitted_ip,
    COALESCE(p.sms_consent, FALSE), p.sms_consent_at, p.sms_consent_text,
    -- Only a closed status is a decision. 'submitted' and 'under_review' mean
    -- the version is still awaiting one.
    CASE WHEN p.status IN ('approved', 'rejected') THEN p.status ELSE NULL END,
    -- Nothing was ever shown to submitters before this feature, so there is no
    -- decision_comment to recover; the old admin_notes were internal by design.
    NULL,
    p.admin_notes,
    CASE WHEN p.status IN ('approved', 'rejected') THEN p.reviewed_at ELSE NULL END,
    CASE WHEN p.status IN ('approved', 'rejected') THEN p.reviewed_by ELSE NULL END
FROM project_proposals p
WHERE p.current_version_id IS NULL
ON CONFLICT ON CONSTRAINT uq_proposal_version_no DO NOTHING;

UPDATE project_proposals p
   SET current_version_id = v.id
  FROM proposal_versions v
 WHERE v.proposal_id = p.id
   AND v.version_no = 1
   AND p.current_version_id IS NULL;

COMMIT;

-- ── Relax the legacy content columns ──────────────────────────────────
-- The new code writes content to proposal_versions and inserts dossier rows
-- without these. They are dropped by migration 33, after the deploy.
ALTER TABLE project_proposals ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN national_id DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN date_of_birth_year DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN place_of_residence DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN mobile_number DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN educational_level DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN project_name DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN project_description DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN problem_solved DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN target_beneficiaries DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN community_impact DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN expected_impact DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN implementation_steps DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN implementation_location DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN required_materials DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN expected_duration DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN continuity_plan DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN feasibility DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN expected_challenges DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN number_of_beneficiaries DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN cost_per_unit_usd DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN unit_type DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN additional_expenses_usd DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN total_amount_usd DROP NOT NULL;
ALTER TABLE project_proposals ALTER COLUMN sms_consent DROP NOT NULL;

SELECT 'Migration 32 completed successfully!' as message;
```

- [ ] **Step 2: Bring up the stack**

Run: `docker compose up -d db`
Expected: the `db` service reports healthy within ~15s. Check with
`docker compose ps db`.

- [ ] **Step 3: Seed a legacy proposal to prove the backfill works**

This row is shaped exactly like production rows written before this feature:
all content on `project_proposals`, no version, a closed status, and an admin
note.

```bash
docker compose exec -T db psql -U postgres -d myzakat <<'SQL'
INSERT INTO project_proposals (
  full_name, national_id, date_of_birth_year, place_of_residence, mobile_number,
  email, educational_level, project_name, project_description, problem_solved,
  target_beneficiaries, community_impact, expected_impact, implementation_steps,
  implementation_location, required_materials, expected_duration, continuity_plan,
  feasibility, expected_challenges, number_of_beneficiaries, cost_per_unit_usd,
  unit_type, additional_expenses_usd, additional_expenses_description,
  total_amount_usd, status, admin_notes, reviewed_at, submitted_ip, sms_consent
) VALUES (
  'Legacy Applicant', 'ID-LEGACY', 1988, 'Aden', '+967711111111',
  'legacy@example.com', 'Diploma', 'Legacy Well Project', 'Dig a community well.',
  'No clean water nearby.', '80 households', 'Shared village resource.',
  'Waterborne illness drops.', 'Survey site' || chr(10) || 'Dig' || chr(10) || 'Test water',
  'Aden outskirts', 'Pump' || chr(10) || 'Piping', 'Three weeks',
  'Village committee maintains it.', 'Contractor already quoted.',
  'Rock layer: hire a deeper drill', 80, 45.00, 'household', 600.00,
  'Drilling surcharge', 4200.00, 'rejected', 'Budget too high for this cycle.',
  '2026-08-01 10:00:00', '198.51.100.4', TRUE
);
SQL
```

Expected: `INSERT 0 1`.

- [ ] **Step 4: Apply the migration**

Run:
```bash
docker compose exec -T db psql -U postgres -d myzakat -v ON_ERROR_STOP=1 \
  < migrations/32_proposal_versioning.sql
```
Expected: the `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE` notices, then
`INSERT 0 1`, `UPDATE 1`, and finally
`Migration 32 completed successfully!`. No `ERROR:` lines.

- [ ] **Step 5: Verify the backfill produced a complete version 1**

```bash
docker compose exec -T db psql -U postgres -d myzakat -t -A <<'SQL'
SELECT
  v.version_no,
  v.project_name,
  v.decision,
  v.internal_note,
  v.decided_at IS NOT NULL            AS decided_at_kept,
  v.submitted_ip,
  v.sms_consent,
  v.total_amount_usd,
  p.current_version_id = v.id         AS pointer_ok,
  v.decision_comment IS NULL          AS no_invented_comment
FROM project_proposals p
JOIN proposal_versions v ON v.proposal_id = p.id
WHERE p.email = 'legacy@example.com';
SQL
```

Expected exactly one row:
`1|Legacy Well Project|rejected|Budget too high for this cycle.|t|198.51.100.4|t|4200.00|t|t`

If `pointer_ok` is `f` or any content column is null, stop: the backfill is
wrong and no later task may proceed.

- [ ] **Step 6: Verify idempotency**

Run the same command as step 4 a second time.
Expected: `INSERT 0 0`, `UPDATE 0`, and the success message. Then re-run step 5
and confirm still exactly one row.

- [ ] **Step 7: Verify a dossier row can now be inserted without content**

This is what the new code will do, and what step 2 of the deployment order
depends on.

```bash
docker compose exec -T db psql -U postgres -d myzakat -v ON_ERROR_STOP=1 -c \
  "INSERT INTO project_proposals (email, status) VALUES ('shape-check@example.com', 'submitted');"
docker compose exec -T db psql -U postgres -d myzakat -c \
  "DELETE FROM project_proposals WHERE email = 'shape-check@example.com';"
```
Expected: `INSERT 0 1` then `DELETE 1`. An error here means a NOT NULL was
missed in the relaxation block.

- [ ] **Step 8: Commit**

```bash
git add migrations/32_proposal_versioning.sql
git commit -m "Migration 32: proposal versions, access codes, version-1 backfill"
```

---

## Task 3: Extract the PDF renderer, unchanged

A pure move: 250 lines of reportlab leave the router so that the next tasks can
review a small file. No behaviour changes, so the signature stays as it is and
the caller is untouched.

**Files:**
- Create: `backend/proposal_pdf.py`
- Modify: `backend/routers/project_proposals.py`
- Test: `backend/tests/test_project_proposals.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_project_proposals.py`:

```python
def test_renderer_produces_a_pdf_from_any_object_carrying_the_content(db_session):
    """The renderer is duck-typed: it reads attributes, not a specific class.

    The router hands it a namespace built from a ProposalVersion plus the
    dossier's id and status; this test hands it the version itself.
    """
    from proposal_pdf import render_proposal_pdf, safe_slug

    dossier = ProjectProposal(email="amina@example.com", full_name="Amina Yusuf", status="submitted")
    db_session.add(dossier)
    db_session.flush()
    version = ProposalVersion(proposal_id=dossier.id, version_no=1, **_content())
    db_session.add(version)
    db_session.commit()

    # The renderer needs .id, .status and .submitted_at alongside the content;
    # a version carries submitted_at, and the dossier carries id and status.
    version.id = dossier.id
    version.status = dossier.status

    pdf = render_proposal_pdf(version)

    assert pdf.startswith(b"%PDF-")
    assert len(pdf) > 2000
    assert safe_slug("Fresh Food Parcels!") == "fresh-food-parcels"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_project_proposals.py -k renderer -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'proposal_pdf'`

- [ ] **Step 3: Create `backend/proposal_pdf.py`**

Move the code verbatim. Cut everything from the
`# ── PDF renderer (reportlab platypus) ──` comment to the end of
`backend/routers/project_proposals.py` — that is `_safe_slug` and
`_render_proposal_pdf` — into the new file, with this header, and rename the two
functions to drop the leading underscore (they are now a module's public API):

```python
"""Render a project proposal as a formal funding-request PDF.

Pure rendering: no HTTP, no ORM queries, no database session. The single
argument is duck-typed — anything exposing the proposal content attributes plus
`id`, `status` and `submitted_at` renders. That is what lets the router pass a
ProposalVersion (with the dossier's id and status attached) without this module
knowing about versioning at all.

Layout mirrors a formal letter of request:
  • Page 1 — cover letter (bold labeled header, justified body, signature block).
  • Following pages — the four review-packet sections with underlined headings
    and bold question labels.
"""
from __future__ import annotations

import io
```

Then the two moved functions, with `_safe_slug` renamed `safe_slug` and
`_render_proposal_pdf` renamed `render_proposal_pdf`, and the internal call site
inside `download_proposal_pdf` updated. Everything else — every style, table and
paragraph — is copied character for character.

- [ ] **Step 4: Update the router to import instead of define**

In `backend/routers/project_proposals.py`, delete the moved code and add to the
imports at the top:

```python
from proposal_pdf import render_proposal_pdf, safe_slug
```

Then in `download_proposal_pdf`, change the two call sites:

```python
    pdf_bytes = render_proposal_pdf(p)
    filename = f"proposal-{p.id}-{safe_slug(p.project_name)}.pdf"
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && python -m pytest tests/test_project_proposals.py -v && python -m pytest -q`
Expected: 4 passed in the proposal file, and no regression in the full suite.

- [ ] **Step 6: Verify the router shrank and holds no reportlab**

Run: `cd backend && grep -c reportlab routers/project_proposals.py; wc -l routers/project_proposals.py proposal_pdf.py`
Expected: `0` reportlab references in the router, which drops to roughly 230
lines, with about 250 in `proposal_pdf.py`.

- [ ] **Step 7: Commit**

```bash
git add backend/proposal_pdf.py backend/routers/project_proposals.py backend/tests/test_project_proposals.py
git commit -m "Move the proposal PDF renderer out of the router"
```

---

## Task 4: `proposal_service.py` — the domain layer

Pure functions over a session, no HTTP. The router is rewired in Task 5, so the
suite stays green here.

**Files:**
- Create: `backend/proposal_service.py`
- Test: `backend/tests/test_proposal_service.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_proposal_service.py`:

```python
"""Dossier / version domain rules, independent of HTTP."""
import pytest
from datetime import datetime

from models import ProjectProposal, ProposalVersion
from tests.test_project_proposals import _content


def test_create_proposal_opens_a_dossier_and_version_one(db_session):
    from proposal_service import create_proposal

    dossier, version = create_proposal(
        db_session, content=_content(), submitted_ip="203.0.113.9",
        sms_consent=False, sms_consent_text=None,
    )

    assert dossier.status == "submitted"
    assert dossier.email == "amina@example.com"
    assert dossier.full_name == "Amina Yusuf"
    assert dossier.current_version_id == version.id
    assert version.version_no == 1
    assert version.project_name == "Fresh Food Parcels"
    assert version.submitted_ip == "203.0.113.9"
    assert version.decision is None


def test_consent_text_is_discarded_when_the_box_was_not_ticked(db_session):
    from proposal_service import create_proposal

    _, version = create_proposal(
        db_session, content=_content(), submitted_ip="",
        sms_consent=False, sms_consent_text="I agree to SMS",
    )

    assert version.sms_consent is False
    assert version.sms_consent_text is None
    assert version.sms_consent_at is None


def test_consent_is_stamped_when_the_box_was_ticked(db_session):
    from proposal_service import create_proposal

    _, version = create_proposal(
        db_session, content=_content(), submitted_ip="",
        sms_consent=True, sms_consent_text="I agree to SMS",
    )

    assert version.sms_consent is True
    assert version.sms_consent_text == "I agree to SMS"
    assert isinstance(version.sms_consent_at, datetime)


def test_add_revision_appends_a_version_and_reopens_the_dossier(db_session, admin_user):
    from proposal_service import add_revision, create_proposal, record_decision

    dossier, v1 = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(
        db_session, dossier, status="changes_requested",
        decision_comment="Please detail the transport costs.",
        internal_note="Budget looks padded.", reviewer_id=admin_user.id,
    )

    v2 = add_revision(
        db_session, dossier,
        content=_content(project_name="Fresh Food Parcels v2", total_amount_usd=4600.0,
                         additional_expenses_usd=600.0),
        submitted_ip="203.0.113.10", sms_consent=False, sms_consent_text=None,
    )

    assert v2.version_no == 2
    assert dossier.current_version_id == v2.id
    assert dossier.status == "submitted"
    assert dossier.full_name == "Amina Yusuf"
    # v1 keeps the decision that caused this revision, untouched.
    db_session.refresh(v1)
    assert v1.decision == "changes_requested"
    assert v1.decision_comment == "Please detail the transport costs."
    assert v1.project_name == "Fresh Food Parcels"


def test_a_revision_cannot_change_the_dossier_email(db_session, admin_user):
    from proposal_service import add_revision, create_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(
        db_session, dossier, status="changes_requested", decision_comment="Fix it",
        internal_note=None, reviewer_id=admin_user.id,
    )

    v2 = add_revision(
        db_session, dossier, content=_content(email="attacker@example.com"),
        submitted_ip="", sms_consent=False, sms_consent_text=None,
    )

    assert v2.email == "amina@example.com"
    assert dossier.email == "amina@example.com"


def test_add_revision_refuses_a_dossier_that_is_not_awaiting_changes(db_session, admin_user):
    from proposal_service import ProposalNotEditable, add_revision, create_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(
        db_session, dossier, status="rejected", decision_comment="Out of scope.",
        internal_note=None, reviewer_id=admin_user.id,
    )

    with pytest.raises(ProposalNotEditable):
        add_revision(db_session, dossier, content=_content(), submitted_ip="",
                     sms_consent=False, sms_consent_text=None)


def test_record_decision_writes_on_the_current_version(db_session, admin_user):
    from proposal_service import create_proposal, record_decision

    dossier, v1 = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )

    version = record_decision(
        db_session, dossier, status="approved", decision_comment="Funded in full.",
        internal_note="Cross-checked the quotes.", reviewer_id=admin_user.id,
    )

    assert version.id == v1.id
    assert version.decision == "approved"
    assert version.decision_comment == "Funded in full."
    assert version.internal_note == "Cross-checked the quotes."
    assert version.decided_by == admin_user.id
    assert isinstance(version.decided_at, datetime)
    assert dossier.status == "approved"
    assert dossier.reviewed_by == admin_user.id


def test_a_rejection_or_change_request_needs_a_comment_for_the_submitter(db_session, admin_user):
    from proposal_service import DecisionCommentRequired, create_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )

    for closing_status in ("rejected", "changes_requested"):
        with pytest.raises(DecisionCommentRequired):
            record_decision(db_session, dossier, status=closing_status,
                            decision_comment="   ", internal_note=None,
                            reviewer_id=admin_user.id)


def test_saving_an_internal_note_alone_preserves_the_submitter_comment(db_session, admin_user):
    """The admin drawer's "save notes" path: same status, no new comment."""
    from proposal_service import create_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="changes_requested",
                    decision_comment="Detail the transport costs.",
                    internal_note=None, reviewer_id=admin_user.id)

    version = record_decision(db_session, dossier, status="changes_requested",
                              decision_comment=None, internal_note="Chased by phone too.",
                              reviewer_id=admin_user.id)

    assert version.decision_comment == "Detail the transport costs."
    assert version.internal_note == "Chased by phone too."


def test_an_unknown_status_is_refused(db_session, admin_user):
    from proposal_service import InvalidProposalStatus, create_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )

    with pytest.raises(InvalidProposalStatus):
        record_decision(db_session, dossier, status="archived", decision_comment="x",
                        internal_note=None, reviewer_id=admin_user.id)


def test_admin_serialization_flattens_the_current_version_and_lists_history(db_session, admin_user):
    from proposal_service import (
        add_revision, create_proposal, current_version, record_decision, serialize_for_admin,
    )

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="198.51.100.1",
        sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="changes_requested",
                    decision_comment="Detail the transport costs.",
                    internal_note="Budget looks padded.", reviewer_id=admin_user.id)
    add_revision(db_session, dossier, content=_content(project_name="Parcels v2"),
                 submitted_ip="198.51.100.2", sms_consent=False, sms_consent_text=None)

    out = serialize_for_admin(dossier, current_version(db_session, dossier), db=db_session)

    assert out["project_name"] == "Parcels v2"          # flattened current content
    assert out["status"] == "submitted"
    assert out["version_count"] == 2
    assert out["current_version_no"] == 2
    assert [v["version_no"] for v in out["versions"]] == [1, 2]
    assert out["versions"][0]["decision"] == "changes_requested"
    assert out["versions"][0]["internal_note"] == "Budget looks padded."
    assert out["versions"][1]["decision"] is None
    assert out["submitted_ip"] == "198.51.100.2"


def test_portal_serialization_hides_staff_only_fields(db_session, admin_user):
    from proposal_service import (
        create_proposal, current_version, record_decision, serialize_for_portal,
    )

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="198.51.100.1",
        sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="changes_requested",
                    decision_comment="Detail the transport costs.",
                    internal_note="Budget looks padded.", reviewer_id=admin_user.id)

    out = serialize_for_portal(dossier, current_version(db_session, dossier))

    assert out["editable"] is True
    assert out["decision_comment"] == "Detail the transport costs."
    assert out["content"]["project_name"] == "Fresh Food Parcels"
    for leaked in ("internal_note", "submitted_ip", "reviewed_by", "decided_by", "versions"):
        assert leaked not in out, f"{leaked} must never reach the submitter"
    assert "internal_note" not in out["content"]


def test_only_a_change_request_makes_a_dossier_editable(db_session, admin_user):
    from proposal_service import (
        create_proposal, current_version, record_decision, serialize_for_portal,
    )

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    for status, editable in (
        ("submitted", False), ("under_review", False),
        ("approved", False), ("rejected", False), ("changes_requested", True),
    ):
        record_decision(db_session, dossier, status=status, decision_comment="Reason given.",
                        internal_note=None, reviewer_id=admin_user.id)
        out = serialize_for_portal(dossier, current_version(db_session, dossier))
        assert out["editable"] is editable, status


def test_versions_for_many_dossiers_load_in_one_query(db_session):
    from proposal_service import create_proposal, versions_by_proposal

    first, v1 = create_proposal(db_session, content=_content(), submitted_ip="",
                                sms_consent=False, sms_consent_text=None)
    second, v2 = create_proposal(db_session, content=_content(email="b@example.com"),
                                 submitted_ip="", sms_consent=False, sms_consent_text=None)

    grouped = versions_by_proposal(db_session, [first.id, second.id])

    assert [v.id for v in grouped[first.id]] == [v1.id]
    assert [v.id for v in grouped[second.id]] == [v2.id]
    assert grouped.get(99999, []) == []


def test_reopening_a_decided_version_keeps_who_decided_it(db_session, admin_user):
    """The audit trail must survive a reopening — that is the point of versions."""
    from proposal_service import create_proposal, current_version, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="rejected", decision_comment="Out of scope.",
                    internal_note=None, reviewer_id=admin_user.id)

    record_decision(db_session, dossier, status="under_review", decision_comment=None,
                    internal_note=None, reviewer_id=admin_user.id)

    version = current_version(db_session, dossier)
    assert dossier.status == "under_review"
    assert version.decision == "rejected"
    assert version.decided_by == admin_user.id
    assert version.decided_at is not None
    assert version.decision_comment == "Out of scope."


def test_version_numbers_survive_a_gap_in_the_chain(db_session, admin_user):
    from models import ProposalVersion
    from proposal_service import add_revision, create_proposal, record_decision

    dossier, v1 = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="changes_requested", decision_comment="Fix it",
                    internal_note=None, reviewer_id=admin_user.id)
    v2 = add_revision(db_session, dossier, content=_content(), submitted_ip="",
                      sms_consent=False, sms_consent_text=None)
    record_decision(db_session, dossier, status="changes_requested", decision_comment="Again",
                    internal_note=None, reviewer_id=admin_user.id)
    v3 = add_revision(db_session, dossier, content=_content(), submitted_ip="",
                      sms_consent=False, sms_consent_text=None)
    assert [v1.version_no, v2.version_no, v3.version_no] == [1, 2, 3]

    # Punch a hole in the middle, the way a future cleanup script might.
    db_session.query(ProposalVersion).filter(ProposalVersion.id == v2.id).delete()
    db_session.commit()
    record_decision(db_session, dossier, status="changes_requested", decision_comment="Once more",
                    internal_note=None, reviewer_id=admin_user.id)

    v4 = add_revision(db_session, dossier, content=_content(), submitted_ip="",
                      sms_consent=False, sms_consent_text=None)

    assert v4.version_no == 4, "COUNT+1 would have produced 3 and collided with v3"


def test_deleting_a_dossier_takes_its_whole_chain(db_session, admin_user):
    from models import ProjectProposal, ProposalVersion
    from proposal_service import add_revision, create_proposal, delete_proposal, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="changes_requested", decision_comment="Fix it",
                    internal_note=None, reviewer_id=admin_user.id)
    add_revision(db_session, dossier, content=_content(), submitted_ip="",
                 sms_consent=False, sms_consent_text=None)
    proposal_id = dossier.id

    delete_proposal(db_session, dossier)

    assert db_session.query(ProjectProposal).filter(ProjectProposal.id == proposal_id).count() == 0
    assert db_session.query(ProposalVersion).filter(
        ProposalVersion.proposal_id == proposal_id).count() == 0


def test_current_version_falls_back_to_the_highest_when_the_pointer_is_missing(db_session, admin_user):
    """The pointer is NULL for rows migration 32 has not yet stamped."""
    from proposal_service import add_revision, create_proposal, current_version, record_decision

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="changes_requested", decision_comment="Fix it",
                    internal_note=None, reviewer_id=admin_user.id)
    v2 = add_revision(db_session, dossier, content=_content(), submitted_ip="",
                      sms_consent=False, sms_consent_text=None)
    dossier.current_version_id = None
    db_session.commit()

    assert current_version(db_session, dossier).id == v2.id


def test_version_detail_serialization_carries_content_and_decision(db_session, admin_user):
    from proposal_service import (
        create_proposal, current_version, record_decision, serialize_version_detail,
    )

    dossier, _ = create_proposal(
        db_session, content=_content(), submitted_ip="", sms_consent=False, sms_consent_text=None,
    )
    record_decision(db_session, dossier, status="rejected", decision_comment="Out of scope.",
                    internal_note="Third time applying.", reviewer_id=admin_user.id)

    out = serialize_version_detail(dossier, current_version(db_session, dossier))

    assert out["proposal_id"] == dossier.id
    assert out["version_no"] == 1
    assert out["project_name"] == "Fresh Food Parcels"
    assert out["decision"] == "rejected"
    assert out["decision_comment"] == "Out of scope."
    assert out["internal_note"] == "Third time applying."
    assert out["total_amount_usd"] == 4500.0
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_proposal_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'proposal_service'`

- [ ] **Step 3: Create `backend/proposal_service.py`**

```python
"""Project proposal domain logic: dossiers, their version chain, decisions.

A dossier (`ProjectProposal`) holds identity and review state. Every submission
writes one `ProposalVersion` carrying the content exactly as it was sent. A
decision is recorded on the version it judges, which makes the history
self-explanatory: the comment on version 1 is precisely what caused version 2.

Immutability, precisely: only the CURRENT version is ever written to. An admin
may amend the current version's decision — correcting a typo, or reopening a
rejection as a change request — but no code path addresses a superseded version
for writing, so once a newer version exists the older one is frozen.

No HTTP and no email here. The router translates these exceptions into status
codes and queues the notifications.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import ProjectProposal, ProposalVersion

# Every field the applicant fills in, in form order. One source of truth for the
# router's payload dump, the version insert, and the serializers.
PROPOSAL_CONTENT_FIELDS: tuple[str, ...] = (
    # Section 1 — personal
    "full_name", "national_id", "date_of_birth_year", "place_of_residence",
    "mobile_number", "email", "educational_level",
    # Section 2 — project
    "project_name", "project_description", "problem_solved",
    "target_beneficiaries", "community_impact", "expected_impact",
    # Section 3 — plan
    "implementation_steps", "implementation_location", "required_materials",
    "expected_duration", "continuity_plan", "feasibility", "expected_challenges",
    # Section 4 — budget
    "number_of_beneficiaries", "cost_per_unit_usd", "unit_type",
    "additional_expenses_usd", "additional_expenses_description", "total_amount_usd",
)

VALID_STATUSES = frozenset(
    {"submitted", "under_review", "changes_requested", "approved", "rejected"}
)
# Statuses that constitute a decision on the current version.
DECISION_STATUSES = frozenset({"approved", "rejected", "changes_requested"})
# Decisions the submitter must be given a reason for.
COMMENT_REQUIRED_STATUSES = frozenset({"rejected", "changes_requested"})
# The one status from which a submitter may send a new version.
EDITABLE_STATUSES = frozenset({"changes_requested"})


class ProposalError(Exception):
    """Base class so the router can catch the whole family."""


class InvalidProposalStatus(ProposalError):
    """A status outside VALID_STATUSES was requested."""


class DecisionCommentRequired(ProposalError):
    """A rejection or change request arrived without a message for the applicant."""


class ProposalNotEditable(ProposalError):
    """A revision was attempted on a dossier that is not awaiting changes."""


def _consent_fields(sms_consent: bool, sms_consent_text: str | None) -> dict[str, Any]:
    """Normalise the optional SMS opt-in into storable columns.

    Consent text without consent is never recorded: a false consent trail is
    worse than none at all for a 10DLC audit.
    """
    if not sms_consent:
        return {"sms_consent": False, "sms_consent_text": None, "sms_consent_at": None}
    return {
        "sms_consent": True,
        "sms_consent_text": sms_consent_text,
        "sms_consent_at": datetime.utcnow(),
    }


def _content_only(content: dict[str, Any]) -> dict[str, Any]:
    """Keep exactly the content fields, ignoring anything else the caller sent."""
    return {key: content.get(key) for key in PROPOSAL_CONTENT_FIELDS}


def create_proposal(
    db: Session,
    *,
    content: dict[str, Any],
    submitted_ip: str,
    sms_consent: bool,
    sms_consent_text: str | None,
) -> tuple[ProjectProposal, ProposalVersion]:
    """Open a new dossier with its version 1.

    Always a new dossier: one email may own several. A revision of an existing
    dossier goes through `add_revision`.
    """
    fields = _content_only(content)
    dossier = ProjectProposal(
        email=fields["email"],
        full_name=fields["full_name"],
        status="submitted",
    )
    db.add(dossier)
    db.flush()  # need dossier.id before the version can reference it

    version = ProposalVersion(
        proposal_id=dossier.id,
        version_no=1,
        submitted_ip=submitted_ip or None,
        **fields,
        **_consent_fields(sms_consent, sms_consent_text),
    )
    db.add(version)
    db.flush()  # need version.id for the pointer

    dossier.current_version_id = version.id
    db.commit()
    db.refresh(dossier)
    db.refresh(version)
    return dossier, version


def add_revision(
    db: Session,
    proposal: ProjectProposal,
    *,
    content: dict[str, Any],
    submitted_ip: str,
    sms_consent: bool,
    sms_consent_text: str | None,
) -> ProposalVersion:
    """Append the next version and send the dossier back for review.

    The dossier's email is authoritative and overrides whatever the payload
    carried: it is the identity key and the portal's access key, so a revision
    can never move a dossier to another address.
    """
    if proposal.status not in EDITABLE_STATUSES:
        raise ProposalNotEditable(
            f"A proposal in status '{proposal.status}' cannot be revised."
        )

    fields = _content_only(content)
    fields["email"] = proposal.email

    # MAX, not COUNT: a gap in the chain (a version removed by some future
    # cleanup) would make COUNT+1 collide with a version that already exists and
    # brick the dossier for good. MAX+1 just skips the gap.
    highest = (
        db.query(func.max(ProposalVersion.version_no))
        .filter(ProposalVersion.proposal_id == proposal.id)
        .scalar()
    )
    next_no = (highest or 0) + 1
    version = ProposalVersion(
        proposal_id=proposal.id,
        version_no=next_no,
        submitted_ip=submitted_ip or None,
        **fields,
        **_consent_fields(sms_consent, sms_consent_text),
    )
    db.add(version)
    db.flush()

    proposal.current_version_id = version.id
    proposal.full_name = fields["full_name"]
    proposal.status = "submitted"
    # A fresh submission is not yet reviewed; clear the previous review stamp so
    # the admin list does not sort it as though it had just been decided.
    proposal.reviewed_at = None
    proposal.reviewed_by = None
    db.commit()
    db.refresh(proposal)
    db.refresh(version)
    return version


def record_decision(
    db: Session,
    proposal: ProjectProposal,
    *,
    status: str,
    decision_comment: str | None,
    internal_note: str | None,
    reviewer_id: int,
) -> ProposalVersion:
    """Write the reviewer's verdict onto the dossier's current version.

    `decision_comment=None` means "leave the existing comment alone", which is
    what the admin drawer sends when it is only saving an internal note. An
    empty or blank string on a rejection or change request is refused: the
    submitter would receive an email with no reason in it.

    Reopening never erases history: moving a dossier back to `submitted` or
    `under_review` changes the dossier's status only and leaves the version's
    `decision`, `decided_at` and `decided_by` exactly as they were. Those fields
    record the last verdict actually taken on this version, which remains a true
    statement about the past however the file moves on afterwards.
    """
    if status not in VALID_STATUSES:
        raise InvalidProposalStatus(f"Invalid status: {status}")

    version = current_version(db, proposal)
    if version is None:
        raise ProposalError(f"Proposal #{proposal.id} has no version to decide on.")

    if status in COMMENT_REQUIRED_STATUSES:
        effective = decision_comment if decision_comment is not None else version.decision_comment
        if not (effective or "").strip():
            raise DecisionCommentRequired(
                f"Status '{status}' requires a message for the applicant."
            )

    if decision_comment is not None:
        version.decision_comment = decision_comment.strip() or None
    if internal_note is not None:
        version.internal_note = internal_note.strip() or None

    if status in DECISION_STATUSES:
        version.decision = status
        version.decided_at = datetime.utcnow()
        version.decided_by = reviewer_id
    # A move to 'submitted' or 'under_review' deliberately leaves the version's
    # decision fields alone. They record the last verdict actually taken on this
    # version, which stays true after a reopening -- and the point of the
    # version chain is that such a fact is never lost. The dossier's `status` is
    # what says where the file stands right now.

    proposal.status = status
    proposal.reviewed_at = datetime.utcnow()
    proposal.reviewed_by = reviewer_id
    db.commit()
    db.refresh(proposal)
    db.refresh(version)
    return version


def current_version(db: Session, proposal: ProjectProposal) -> ProposalVersion | None:
    """The dossier's latest version, by its pointer, falling back to the chain.

    The fallback matters during the deployment window described in the plan: a
    row that migration 32 has not yet pointed still resolves correctly.
    """
    if proposal.current_version_id is not None:
        found = (
            db.query(ProposalVersion)
            .filter(ProposalVersion.id == proposal.current_version_id)
            .first()
        )
        if found is not None:
            return found
    return (
        db.query(ProposalVersion)
        .filter(ProposalVersion.proposal_id == proposal.id)
        .order_by(ProposalVersion.version_no.desc())
        .first()
    )


def versions_by_proposal(
    db: Session, proposal_ids: Iterable[int]
) -> dict[int, list[ProposalVersion]]:
    """All versions for the given dossiers, grouped, in one query.

    The admin list needs each row's current content plus its version count; this
    keeps that at two queries total instead of one per row.
    """
    ids = list(proposal_ids)
    grouped: dict[int, list[ProposalVersion]] = {pid: [] for pid in ids}
    if not ids:
        return grouped
    rows = (
        db.query(ProposalVersion)
        .filter(ProposalVersion.proposal_id.in_(ids))
        .order_by(ProposalVersion.proposal_id, ProposalVersion.version_no)
        .all()
    )
    for row in rows:
        grouped.setdefault(row.proposal_id, []).append(row)
    return grouped


def _content_dict(version: ProposalVersion | None) -> dict[str, Any]:
    """The content fields of a version, with the numeric ones as plain floats."""
    if version is None:
        return {key: None for key in PROPOSAL_CONTENT_FIELDS}
    out = {key: getattr(version, key) for key in PROPOSAL_CONTENT_FIELDS}
    out["cost_per_unit_usd"] = float(version.cost_per_unit_usd or 0)
    out["additional_expenses_usd"] = float(version.additional_expenses_usd or 0)
    out["total_amount_usd"] = float(version.total_amount_usd or 0)
    return out


def serialize_version_summary(version: ProposalVersion) -> dict[str, Any]:
    """One entry in the admin's version history. Staff-only fields included."""
    return {
        "id": version.id,
        "version_no": version.version_no,
        "submitted_at": version.submitted_at,
        "submitted_ip": version.submitted_ip,
        "decision": version.decision,
        "decision_comment": version.decision_comment,
        "internal_note": version.internal_note,
        "decided_at": version.decided_at,
        "decided_by": version.decided_by,
    }


def serialize_for_admin(
    proposal: ProjectProposal,
    version: ProposalVersion | None,
    *,
    db: Session | None = None,
    versions: list[ProposalVersion] | None = None,
) -> dict[str, Any]:
    """Dossier + current content flattened + the full version history.

    The content is flattened rather than nested so the existing admin page keeps
    rendering unchanged; `versions` is the new part. Pass `versions` when the
    caller has already loaded them in bulk (the list endpoint does) to avoid a
    query per row.
    """
    if versions is None:
        if db is None:
            raise ValueError("serialize_for_admin needs either `db` or `versions`.")
        versions = (
            db.query(ProposalVersion)
            .filter(ProposalVersion.proposal_id == proposal.id)
            .order_by(ProposalVersion.version_no)
            .all()
        )
    out: dict[str, Any] = {
        "id": proposal.id,
        "email": proposal.email,
        "status": proposal.status,
        "submitted_at": proposal.submitted_at,
        "updated_at": proposal.updated_at,
        "reviewed_at": proposal.reviewed_at,
        "reviewed_by": proposal.reviewed_by,
        "version_count": len(versions),
        "current_version_no": version.version_no if version else None,
        "versions": [serialize_version_summary(v) for v in versions],
        # Kept for the current admin UI, which reads these at the top level.
        "submitted_ip": version.submitted_ip if version else None,
        "decision_comment": version.decision_comment if version else None,
        "internal_note": version.internal_note if version else None,
        "sms_consent": bool(version.sms_consent) if version else False,
        "sms_consent_at": version.sms_consent_at if version else None,
        "sms_consent_text": version.sms_consent_text if version else None,
    }
    out.update(_content_dict(version))
    # The dossier's email wins over the snapshot's — they only differ for rows
    # written before the identity key was enforced.
    out["email"] = proposal.email
    return out


def serialize_version_detail(
    proposal: ProjectProposal, version: ProposalVersion
) -> dict[str, Any]:
    """One historical version in full: its frozen content and its decision."""
    out = serialize_version_summary(version)
    out["proposal_id"] = proposal.id
    out["status"] = proposal.status
    out.update(_content_dict(version))
    return out


def serialize_for_portal(
    proposal: ProjectProposal, version: ProposalVersion | None
) -> dict[str, Any]:
    """What the submitter is allowed to see about their own dossier.

    A separate function from the admin serializer on purpose: `internal_note`,
    `submitted_ip`, `reviewed_by` and `decided_by` must never reach an applicant,
    and a shared serializer with a flag is one forgotten argument away from a
    leak.
    """
    return {
        "id": proposal.id,
        "project_name": version.project_name if version else None,
        "status": proposal.status,
        "editable": proposal.status in EDITABLE_STATUSES,
        "submitted_at": proposal.submitted_at,
        "updated_at": proposal.updated_at,
        "version_no": version.version_no if version else None,
        "decision_comment": version.decision_comment if version else None,
        "content": _content_dict(version),
    }


def delete_proposal(db: Session, proposal: ProjectProposal) -> None:
    """Remove a dossier and its whole version chain.

    The versions are deleted explicitly rather than left to ON DELETE CASCADE:
    the SQLite test runner does not enforce foreign keys, so relying on the
    database would leave orphans in the suite and pass silently. The pointer is
    cleared first because project_proposals.current_version_id references the
    rows about to go.
    """
    proposal.current_version_id = None
    db.flush()
    db.query(ProposalVersion).filter(
        ProposalVersion.proposal_id == proposal.id
    ).delete(synchronize_session=False)
    db.delete(proposal)
    db.commit()
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python -m pytest tests/test_proposal_service.py -v`
Expected: 19 passed.

- [ ] **Step 5: Run the whole suite**

Run: `cd backend && python -m pytest -q`
Expected: no regression — the router is still untouched.

- [ ] **Step 6: Commit**

```bash
git add backend/proposal_service.py backend/tests/test_proposal_service.py
git commit -m "Add the proposal domain layer: dossiers, versions, decisions"
```

---

## Task 5: Rewrite the router on the service — the atomic cut

This is the one task where the model reshape and the endpoint rewrite must land
together: the moment `ProjectProposal` loses its content columns, every read
path has to come from a version. Tests are written first and go green at the
end of the task.

**Files:**
- Modify: `backend/routers/project_proposals.py`
- Modify: `backend/models.py` (delete the legacy columns)
- Test: `backend/tests/test_project_proposals.py`

- [ ] **Step 1: Write the failing API tests**

Append to `backend/tests/test_project_proposals.py`:

```python
def _payload(**overrides) -> dict:
    """The public POST body: content plus the optional consent pair."""
    body = _content()
    body.update(overrides)
    return body


def test_public_submit_creates_a_dossier_with_version_one(client, db_session):
    resp = client.post("/api/project-proposals/", json=_payload())

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["version_no"] == 1
    assert body["id"] > 0
    assert "submitted_at" in body

    dossier = db_session.query(ProjectProposal).filter(ProjectProposal.id == body["id"]).one()
    assert dossier.status == "submitted"
    assert db_session.query(ProposalVersion).filter(
        ProposalVersion.proposal_id == dossier.id
    ).count() == 1


def test_public_submit_always_opens_a_new_dossier(client, db_session):
    first = client.post("/api/project-proposals/", json=_payload()).json()
    second = client.post("/api/project-proposals/", json=_payload()).json()

    assert first["id"] != second["id"]
    assert second["version_no"] == 1


def test_submit_rejects_a_total_that_contradicts_the_breakdown(client):
    resp = client.post("/api/project-proposals/", json=_payload(total_amount_usd=99999.0))
    assert resp.status_code == 422


def test_admin_list_flattens_the_current_version(client, auth_headers):
    client.post("/api/project-proposals/", json=_payload())

    resp = client.get("/api/project-proposals/", headers=auth_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["project_name"] == "Fresh Food Parcels"
    assert item["version_count"] == 1
    assert item["current_version_no"] == 1
    assert item["total_amount_usd"] == 4500.0


def test_admin_list_filters_on_changes_requested(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "decision_comment": "Detail the transport costs."},
        headers=auth_headers,
    )

    resp = client.get(
        "/api/project-proposals/?status_filter=changes_requested", headers=auth_headers
    )

    assert resp.status_code == 200
    assert [i["id"] for i in resp.json()["items"]] == [created["id"]]


def test_admin_detail_lists_the_version_history(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={
            "status": "changes_requested",
            "decision_comment": "Detail the transport costs.",
            "internal_note": "Budget looks padded.",
        },
        headers=auth_headers,
    )

    resp = client.get(f"/api/project-proposals/{created['id']}", headers=auth_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "changes_requested"
    assert body["version_count"] == 1
    assert body["versions"][0]["decision"] == "changes_requested"
    assert body["versions"][0]["decision_comment"] == "Detail the transport costs."
    assert body["versions"][0]["internal_note"] == "Budget looks padded."


def test_a_rejection_without_a_message_is_refused(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()

    resp = client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "rejected"},
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert "message" in resp.json()["detail"].lower()


def test_an_invalid_status_is_refused(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()

    resp = client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "archived", "decision_comment": "x"},
        headers=auth_headers,
    )

    assert resp.status_code == 400


def test_a_historical_version_can_be_read_and_exported(client, auth_headers, db_session):
    from proposal_service import add_revision
    from models import ProjectProposal as PP

    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "decision_comment": "Detail the transport costs."},
        headers=auth_headers,
    )
    dossier = db_session.query(PP).filter(PP.id == created["id"]).one()
    add_revision(db_session, dossier, content=_content(project_name="Parcels v2"),
                 submitted_ip="", sms_consent=False, sms_consent_text=None)

    first = client.get(f"/api/project-proposals/{created['id']}/versions/1", headers=auth_headers)
    assert first.status_code == 200
    assert first.json()["project_name"] == "Fresh Food Parcels"
    assert first.json()["decision"] == "changes_requested"

    current = client.get(f"/api/project-proposals/{created['id']}", headers=auth_headers)
    assert current.json()["project_name"] == "Parcels v2"

    pdf = client.get(f"/api/project-proposals/{created['id']}/versions/1/pdf", headers=auth_headers)
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF-")
    assert "v1" in pdf.headers["content-disposition"]


def test_a_missing_version_is_a_404(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()

    resp = client.get(f"/api/project-proposals/{created['id']}/versions/7", headers=auth_headers)

    assert resp.status_code == 404


def test_admin_endpoints_reject_anonymous_callers(client):
    for path in ("/api/project-proposals/", "/api/project-proposals/1",
                 "/api/project-proposals/1/versions/1", "/api/project-proposals/1/pdf"):
        assert client.get(path).status_code in (401, 403), path


def test_deleting_a_dossier_removes_its_versions(client, auth_headers, db_session):
    created = client.post("/api/project-proposals/", json=_payload()).json()

    resp = client.delete(f"/api/project-proposals/{created['id']}", headers=auth_headers)

    assert resp.status_code == 200
    assert db_session.query(ProposalVersion).filter(
        ProposalVersion.proposal_id == created["id"]
    ).count() == 0
    assert db_session.query(ProjectProposal).filter(
        ProjectProposal.id == created["id"]
    ).count() == 0


def test_the_admin_list_puts_recently_touched_dossiers_first(client, auth_headers):
    """Ordering is by last activity, not submission date: a revised or
    freshly-decided file belongs at the top of a review queue."""
    first = client.post("/api/project-proposals/", json=_payload()).json()
    second = client.post("/api/project-proposals/", json=_payload(project_name="Second")).json()

    listed = client.get("/api/project-proposals/", headers=auth_headers).json()["items"]
    assert [i["id"] for i in listed] == [second["id"], first["id"]]

    client.patch(
        f"/api/project-proposals/{first['id']}/status",
        json={"status": "under_review"}, headers=auth_headers,
    )

    listed = client.get("/api/project-proposals/", headers=auth_headers).json()["items"]
    assert [i["id"] for i in listed] == [first["id"], second["id"]]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_project_proposals.py -v`
Expected: the new tests FAIL — `version_no` is missing from the POST response,
`version_count` from the list, and the `/versions/...` routes 404 as unknown
paths.

- [ ] **Step 3: Rewrite `backend/routers/project_proposals.py`**

Replace everything above the `from proposal_pdf import ...` boundary — that is,
the module docstring, the imports, `VALID_STATUSES`, the schemas, `_serialize`
and all six endpoints — with this. `proposal_pdf.py` is untouched.

```python
"""Project proposals router — public submission + admin review + PDF export.

Endpoints
─────────
Public (no auth):
  POST   /api/project-proposals/                     → open a dossier (version 1)

Admin / manager (auth):
  GET    /api/project-proposals/                     → list, current content flattened
  GET    /api/project-proposals/{id}                 → dossier + version history
  GET    /api/project-proposals/{id}/versions/{n}    → one frozen version
  PATCH  /api/project-proposals/{id}/status          → record a decision, email the applicant
  DELETE /api/project-proposals/{id}                 → delete the dossier and its versions
  GET    /api/project-proposals/{id}/pdf             → PDF of the current version
  GET    /api/project-proposals/{id}/versions/{n}/pdf→ PDF of that version

The submitter-facing half of this feature lives in routers/proposal_portal.py.
Domain rules live in proposal_service.py; this module only maps HTTP to them.
"""
from __future__ import annotations

import io
from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

import email_service
import proposal_service
from auth_utils import get_current_manager_or_admin
from database import get_db
from logging_config import get_logger
from models import ProjectProposal, ProposalVersion, User
from proposal_pdf import render_proposal_pdf, safe_slug
from proposal_service import (
    DecisionCommentRequired,
    InvalidProposalStatus,
    ProposalError,
)

logger = get_logger(__name__)
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────

class ProposalSubmit(BaseModel):
    # Section 1: Personal
    full_name: str = Field(min_length=2, max_length=200)
    national_id: str = Field(min_length=2, max_length=50)
    date_of_birth_year: int = Field(ge=1900, le=2020)
    place_of_residence: str = Field(min_length=2, max_length=300)
    mobile_number: str = Field(min_length=5, max_length=50)
    email: EmailStr
    educational_level: str = Field(min_length=2, max_length=200)

    # Section 2: Project
    project_name: str = Field(min_length=2, max_length=300)
    project_description: str = Field(min_length=10)
    problem_solved: str = Field(min_length=10)
    target_beneficiaries: str = Field(min_length=5)
    community_impact: str = Field(min_length=10)
    expected_impact: str = Field(min_length=10)

    # Section 3: Plan
    implementation_steps: str = Field(min_length=5)
    implementation_location: str = Field(min_length=5)
    required_materials: str = Field(min_length=5)
    expected_duration: str = Field(min_length=2, max_length=300)
    continuity_plan: str = Field(min_length=10)
    feasibility: str = Field(min_length=10)
    expected_challenges: str = Field(min_length=10)

    # Section 4: Budget
    number_of_beneficiaries: int = Field(ge=1)
    cost_per_unit_usd: float = Field(gt=0)
    unit_type: str = Field(min_length=1, max_length=50)
    additional_expenses_usd: float = Field(ge=0, default=0)
    additional_expenses_description: Optional[str] = None
    total_amount_usd: float = Field(gt=0)

    # Optional SMS consent (10DLC / TCR compliance). Consent is NOT required
    # to submit a proposal — the checkbox on the form is unchecked by default.
    # When the applicant ticks it, we record the exact wording they agreed to
    # so we can prove opt-in later.
    sms_consent: bool = False
    sms_consent_text: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("total_amount_usd")
    @classmethod
    def total_matches_breakdown(cls, v, info):
        # Sanity check: allow a $1 rounding drift between the client's total
        # and the server-side recomputation. Anything larger is a client bug
        # or tampering — we recompute either way when serving the PDF.
        data = info.data
        computed = (data.get("number_of_beneficiaries", 0) or 0) * (data.get("cost_per_unit_usd", 0) or 0) \
                 + (data.get("additional_expenses_usd", 0) or 0)
        if abs(v - computed) > 1.00:
            raise ValueError(f"Total amount ({v}) does not match breakdown ({computed:.2f}).")
        return v


class ProposalStatusUpdate(BaseModel):
    status: str
    # Shown to the applicant and quoted in the decision email. Omit to leave
    # the existing comment untouched (the "save internal note only" path).
    decision_comment: Optional[str] = None
    internal_note: Optional[str] = None


def client_ip(request: Request) -> str:
    """Caller's IP, honouring the proxy header Traefik sets."""
    xff = request.headers.get("x-forwarded-for")
    raw = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "")
    return raw[:45]


def _load(db: Session, proposal_id: int) -> ProjectProposal:
    found = db.query(ProjectProposal).filter(ProjectProposal.id == proposal_id).first()
    if not found:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return found


def _load_version(db: Session, dossier: ProjectProposal, version_no: int) -> ProposalVersion:
    version = (
        db.query(ProposalVersion)
        .filter(
            ProposalVersion.proposal_id == dossier.id,
            ProposalVersion.version_no == version_no,
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


# ── Public: submit ───────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def submit_proposal(payload: ProposalSubmit, request: Request, db: Session = Depends(get_db)):
    """Public endpoint anyone can call. Always opens a NEW dossier.

    A revision of an existing dossier goes through the portal
    (PUT /api/project-proposals/portal/{id}), never through here.
    """
    data = payload.model_dump()
    dossier, version = proposal_service.create_proposal(
        db,
        content=data,
        submitted_ip=client_ip(request),
        sms_consent=bool(data.get("sms_consent")),
        sms_consent_text=data.get("sms_consent_text"),
    )
    logger.info(
        "Project proposal #%s submitted by %s (%s)%s",
        dossier.id, dossier.email, version.project_name[:60],
        " [SMS opt-in]" if version.sms_consent else "",
    )
    email_service.send_proposal_received(
        email=dossier.email,
        name=version.full_name,
        proposal_id=dossier.id,
        version_no=version.version_no,
        project_name=version.project_name,
    )
    return {
        "id": dossier.id,
        "version_no": version.version_no,
        "message": "Your proposal has been submitted. Our team will review it and get back to you.",
        "submitted_at": version.submitted_at,
    }


# ── Admin: list / get / update / delete ──────────────────────────────

@router.get("/")
async def list_proposals(
    status_filter: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    q = db.query(ProjectProposal)
    if status_filter and status_filter in proposal_service.VALID_STATUSES:
        q = q.filter(ProjectProposal.status == status_filter)
    total = q.count()
    rows = (
        q.order_by(ProjectProposal.updated_at.desc())
        .offset(skip)
        .limit(min(limit, 500))
        .all()
    )
    # Two queries for the whole page, not one per row.
    grouped = proposal_service.versions_by_proposal(db, [r.id for r in rows])
    items = []
    for row in rows:
        versions = grouped.get(row.id, [])
        # Follow the same pointer the detail endpoint follows, so the two admin
        # views can never disagree about which version is current. The fallback
        # to the highest version matches current_version()'s own fallback for
        # rows migration 32 has not yet stamped.
        by_id = {v.id: v for v in versions}
        current = by_id.get(row.current_version_id) or (versions[-1] if versions else None)
        items.append(
            proposal_service.serialize_for_admin(row, current, db=db, versions=versions)
        )
    return {"total": total, "items": items}


@router.get("/{proposal_id}")
async def get_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    return proposal_service.serialize_for_admin(
        dossier, proposal_service.current_version(db, dossier), db=db
    )


@router.get("/{proposal_id}/versions/{version_no}")
async def get_proposal_version(
    proposal_id: int,
    version_no: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    version = _load_version(db, dossier, version_no)
    return proposal_service.serialize_version_detail(dossier, version)


@router.patch("/{proposal_id}/status")
async def update_proposal_status(
    proposal_id: int,
    payload: ProposalStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Record the reviewer's decision and notify the applicant.

    The email goes out only when the status actually changes, so re-saving an
    internal note on an already-rejected dossier does not re-notify anyone.
    """
    dossier = _load(db, proposal_id)
    previous_status = dossier.status
    try:
        version = proposal_service.record_decision(
            db, dossier,
            status=payload.status,
            decision_comment=payload.decision_comment,
            internal_note=payload.internal_note,
            reviewer_id=current_user.id,
        )
    except (InvalidProposalStatus, DecisionCommentRequired) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ProposalError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    logger.info("Proposal #%s status → %s by %s", dossier.id, dossier.status, current_user.email)

    if previous_status != dossier.status:
        _notify_decision(dossier, version)

    return proposal_service.serialize_for_admin(dossier, version, db=db)


def _notify_decision(dossier: ProjectProposal, version: ProposalVersion) -> None:
    """Queue the one email that matches the new status. Never raises."""
    senders = {
        "approved": email_service.send_proposal_approved,
        "rejected": email_service.send_proposal_rejected,
        "changes_requested": email_service.send_proposal_changes_requested,
    }
    send = senders.get(dossier.status)
    if send is None:
        return  # 'submitted' / 'under_review' are not worth an email
    try:
        send(
            email=dossier.email,
            name=version.full_name,
            proposal_id=dossier.id,
            version_no=version.version_no,
            project_name=version.project_name,
            comment=version.decision_comment or "",
        )
    except Exception:
        # A queueing failure must not roll back a decision the reviewer just made.
        logger.exception("Could not queue the decision email for proposal #%s", dossier.id)


@router.delete("/{proposal_id}")
async def delete_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    proposal_service.delete_proposal(db, dossier)
    logger.info("Proposal #%s deleted by %s", proposal_id, current_user.email)
    return {"deleted": True}


# ── Admin: PDF export ────────────────────────────────────────────────

@router.get("/{proposal_id}/pdf")
async def download_proposal_pdf(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    version = proposal_service.current_version(db, dossier)
    if version is None:
        raise HTTPException(status_code=404, detail="Proposal has no content to export")
    return _pdf_response(dossier, version)


@router.get("/{proposal_id}/versions/{version_no}/pdf")
async def download_proposal_version_pdf(
    proposal_id: int,
    version_no: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    dossier = _load(db, proposal_id)
    return _pdf_response(dossier, _load_version(db, dossier, version_no))


def _pdf_response(dossier: ProjectProposal, version: ProposalVersion) -> StreamingResponse:
    """Render one version, stamped with the dossier's reference and status.

    The renderer takes a single duck-typed object, so the dossier's identity has
    to travel with the version's content. That is done by copying both into a
    throwaway namespace rather than by assigning onto the ProposalVersion: its
    `id` is a mapped primary key, and setting it would leave a persisted row's
    PK dirty in the identity map, one stray flush away from an UPDATE that
    rewrites the wrong row.

    The footer therefore shows the dossier's CURRENT status even on an exported
    older version, while that version's own verdict stays in its `decision`
    field. That is deliberate: the reader needs to know where the file stands
    now, not only what was decided about this particular draft.
    """
    view = SimpleNamespace(
        **{column.name: getattr(version, column.name) for column in version.__table__.columns}
    )
    view.id = dossier.id
    view.status = dossier.status
    pdf_bytes = render_proposal_pdf(view)
    filename = f"proposal-{dossier.id}-v{version.version_no}-{safe_slug(version.project_name)}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 4: Teach the renderer about version numbers**

In `backend/proposal_pdf.py`, the footer currently prints
`f"Ref #{p.id} · myzakat.org"`. Make the version visible on every page, since
an admin will have several PDFs of the same dossier side by side:

```python
        canvas.drawString(
            0.75 * inch, 0.5 * inch,
            f"Ref #{p.id} v{getattr(p, 'version_no', 1)} · myzakat.org",
        )
```

And in the closing meta line at the end of `render_proposal_pdf`, change the
submission sentence to name the version:

```python
    story.append(Paragraph(
        f"Submitted via myzakat.org on {p.submitted_at.strftime('%B %d, %Y at %H:%M UTC')} "
        f"&nbsp;·&nbsp; reference #{p.id} &nbsp;·&nbsp; version {getattr(p, 'version_no', 1)} "
        f"&nbsp;·&nbsp; status: {p.status.replace('_', ' ')}",
        meta,
    ))
```

- [ ] **Step 5: Delete the legacy columns from the model**

In `backend/models.py`, remove the whole
`# ── Legacy content columns (see the docstring) ──` block from
`ProjectProposal` (every column from `national_id` through `sms_consent_text`),
and make `full_name` non-nullable again since the service always sets it:

```python
    full_name = Column(String(200), nullable=False)
```

Then trim the class docstring to its final form:

```python
class ProjectProposal(Base):
    """One dossier per funding request.

    The dossier holds identity and review state; the submitted content lives in
    `proposal_versions`, one immutable row per submission. `email` is the
    identity key — it is set at first submission and never changed by the
    application.
    """
```

- [ ] **Step 6: Stub the email shims so the router imports**

Task 6 writes them properly. For now, add to the end of
`backend/email_service.py` so this task can go green on its own:

```python
# ── Project proposals ────────────────────────────────────────────────
# Filled in by the next task; the router already calls them.

def send_proposal_received(*, email, name, proposal_id, version_no, project_name) -> bool:
    return True


def send_proposal_changes_requested(*, email, name, proposal_id, version_no, project_name, comment) -> bool:
    return True


def send_proposal_rejected(*, email, name, proposal_id, version_no, project_name, comment) -> bool:
    return True


def send_proposal_approved(*, email, name, proposal_id, version_no, project_name, comment) -> bool:
    return True
```

- [ ] **Step 7: Run the proposal tests**

Run: `cd backend && python -m pytest tests/test_project_proposals.py tests/test_proposal_service.py -v`
Expected: all pass — 16 in the router file, 19 in the service file.

- [ ] **Step 8: Run the whole suite**

Run: `cd backend && python -m pytest -q`
Expected: no failures. If `test_main.py` asserts on the OpenAPI schema, the two
new routes may need adding there.

- [ ] **Step 9: Commit**

```bash
git add backend/routers/project_proposals.py backend/models.py backend/proposal_pdf.py \
        backend/email_service.py backend/tests/test_project_proposals.py
git commit -m "Serve proposals from their version chain, with per-version decisions"
```

---

## Task 6: The five emails

**Files:**
- Create: `backend/email_templates/proposal_received.{html,txt}`
- Create: `backend/email_templates/proposal_changes_requested.{html,txt}`
- Create: `backend/email_templates/proposal_rejected.{html,txt}`
- Create: `backend/email_templates/proposal_approved.{html,txt}`
- Create: `backend/email_templates/proposal_access_code.{html,txt}`
- Modify: `backend/email_service.py`
- Test: `backend/tests/test_proposal_emails.py`

The renderer uses `StrictUndefined` (`marketing/renderer.py:30`), so a template
referencing a variable the shim does not pass raises at render time rather than
printing an empty string. Every test below renders for real, which is what makes
that safety useful.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_proposal_emails.py`:

```python
"""Proposal notification templates actually render, with the right content."""
import pytest

from marketing.renderer import render


@pytest.mark.parametrize("slug", [
    "proposal_received",
    "proposal_changes_requested",
    "proposal_rejected",
    "proposal_approved",
    "proposal_access_code",
])
def test_every_template_pair_exists_and_renders(slug):
    html, text = render(slug, {
        "name": "Amina Yusuf",
        "proposal_id": 42,
        "version_no": 2,
        "project_name": "Fresh Food Parcels",
        "comment": "Please detail the transport costs.",
        "portal_url": "https://myzakat.org/my-proposals",
        "code": "123456",
        "ttl_minutes": 10,
    })

    assert html.strip().startswith("<")
    assert text.strip()


def test_the_change_request_quotes_the_reviewer_and_links_the_portal():
    html, text = render("proposal_changes_requested", {
        "name": "Amina Yusuf",
        "proposal_id": 42,
        "version_no": 1,
        "project_name": "Fresh Food Parcels",
        "comment": "Please detail the transport costs.",
        "portal_url": "https://myzakat.org/my-proposals",
    })

    assert "Please detail the transport costs." in html
    assert "Please detail the transport costs." in text
    assert "my-proposals" in html
    assert "my-proposals" in text


def test_the_rejection_gives_the_reason_and_offers_no_edit_link():
    html, text = render("proposal_rejected", {
        "name": "Amina Yusuf",
        "proposal_id": 42,
        "version_no": 1,
        "project_name": "Fresh Food Parcels",
        "comment": "Outside this funding cycle's scope.",
    })

    assert "Outside this funding cycle" in text
    assert "my-proposals" not in html, "a closed dossier must not invite an edit"
    assert "my-proposals" not in text, "a closed dossier must not invite an edit"


def test_the_access_code_email_shows_the_code_and_its_lifetime():
    html, text = render("proposal_access_code", {"code": "483920", "ttl_minutes": 10})

    assert "483920" in html and "483920" in text
    assert "10" in text


def test_the_access_code_email_names_no_applicant_or_project():
    """It is sent before we know the requester controls the address.

    Confirming "yes, Amina Yusuf has a proposal here" to whoever typed the
    address would leak exactly what /portal/request-code refuses to leak. The
    values below are deliberately IN the context: the guarantee is that the
    template does not reference them, not that the caller withholds them.
    """
    html, text = render("proposal_access_code", {
        "code": "483920",
        "ttl_minutes": 10,
        "name": "Amina Yusuf",
        "project_name": "Secret Wells Project",
        "proposal_id": 42,
    })

    for leaked in ("Amina Yusuf", "Secret Wells Project", "#42"):
        assert leaked not in html, f"{leaked} must not reach an unverified address"
        assert leaked not in text, f"{leaked} must not reach an unverified address"
    assert "483920" in html and "483920" in text


def test_the_shims_queue_one_email_each(monkeypatch):
    import email_service

    queued = []

    def fake_enqueue(slug, **kwargs):
        queued.append((slug, kwargs))
        return True

    monkeypatch.setattr(email_service, "_enqueue", fake_enqueue)

    assert email_service.send_proposal_received(
        email="a@example.com", name="Amina", proposal_id=42, version_no=1,
        project_name="Parcels",
    )
    assert email_service.send_proposal_changes_requested(
        email="a@example.com", name="Amina", proposal_id=42, version_no=1,
        project_name="Parcels", comment="Detail the costs.",
    )
    assert email_service.send_proposal_access_code(email="a@example.com", code="483920")

    assert [slug for slug, _ in queued] == [
        "proposal_received", "proposal_changes_requested", "proposal_access_code",
    ]
    # Every proposal email is keyed, so a double click cannot send twice.
    assert queued[0][1]["idempotency_key"] == "proposal-42-v1-received"
    assert queued[1][1]["idempotency_key"] == "proposal-42-v1-changes_requested"
    assert queued[1][1]["context"]["comment"] == "Detail the costs."
    assert queued[1][1]["context"]["portal_url"].endswith("/my-proposals")
    # The code email carries no key: every request must deliver a fresh code.
    assert "idempotency_key" not in queued[2][1]
    assert queued[2][1]["category"] == "transactional"


def test_a_multi_line_reviewer_comment_survives_in_both_variants():
    """An admin writing a numbered list must not be delivered a run-on sentence."""
    comment = "Please do three things:\n1. Itemise transport\n2. Attach the quote\n3. Name the committee"
    html, text = render("proposal_changes_requested", {
        "name": "Amina Yusuf",
        "proposal_id": 42,
        "version_no": 1,
        "project_name": "Fresh Food Parcels",
        "comment": comment,
        "portal_url": "https://myzakat.org/my-proposals",
    })

    assert "1. Itemise transport" in text and "3. Name the committee" in text
    assert "1. Itemise transport" in html
    # Without pre-wrap the client collapses the newlines into one paragraph.
    assert "pre-wrap" in html


def test_an_applicants_html_in_a_project_name_is_escaped():
    """project_name comes from a public, unauthenticated form."""
    html, _ = render("proposal_received", {
        "name": "Amina Yusuf",
        "proposal_id": 42,
        "version_no": 1,
        "project_name": "<script>alert(1)</script>",
        "portal_url": "https://myzakat.org/my-proposals",
    })

    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_proposal_emails.py -v`
Expected: FAIL — `jinja2.exceptions.TemplateNotFound: proposal_received.html`

- [ ] **Step 3: Write `proposal_received.html` and `proposal_received.txt`**

```html
{% extends "layouts/base.html" %}
{% block content %}
<h2 style="color: #2563eb; margin: 0 0 18px 0; font-size: 20px;">We received your proposal</h2>
<p>Assalamu alaikum {{ name }},</p>
<p>Thank you for submitting <strong>{{ project_name }}</strong> to the Zakat Distribution Foundation. It is now with our review team.</p>
<p>Your reference number is <strong>#{{ proposal_id }}</strong>{% if version_no > 1 %}, and this is version <strong>{{ version_no }}</strong> of your application{% endif %}. Please quote it in any correspondence.</p>
<p>You can check the status of your proposal at any time at <a href="{{ portal_url }}">{{ portal_url }}</a> — enter this email address and we will send you a six-digit code to sign in.</p>
<p>With gratitude,<br><strong>The MyZakat Team</strong></p>
{% endblock %}
```

```text
Assalamu alaikum {{ name }},

Thank you for submitting '{{ project_name }}' to the Zakat Distribution Foundation. It is now with our review team.

Your reference number is #{{ proposal_id }}{% if version_no > 1 %}, and this is version {{ version_no }} of your application{% endif %}. Please quote it in any correspondence.

You can check the status of your proposal at any time at {{ portal_url }} — enter this email address and we will send you a six-digit code to sign in.

With gratitude,
The MyZakat Team
```

- [ ] **Step 4: Write `proposal_changes_requested.html` and `.txt`**

```html
{% extends "layouts/base.html" %}
{% block content %}
<h2 style="color: #b45309; margin: 0 0 18px 0; font-size: 20px;">Changes requested on your proposal</h2>
<p>Assalamu alaikum {{ name }},</p>
<p>Our review team has looked at <strong>{{ project_name }}</strong> (reference <strong>#{{ proposal_id }}</strong>) and would like some changes before taking a decision.</p>
<table role="presentation" width="100%" style="margin: 18px 0; border-collapse: collapse;">
  <tr>
    <td style="border-left: 4px solid #b45309; background: #fffbeb; padding: 14px 16px; color: #1f2937; white-space: pre-wrap;">
      {{ comment }}
    </td>
  </tr>
</table>
<p>To update your application, go to <a href="{{ portal_url }}">{{ portal_url }}</a> and enter this email address. We will send you a six-digit code to sign in — you do not need an account or a password.</p>
<p>Your previous version is kept on file, so nothing you have already written is lost.</p>
<p>With gratitude,<br><strong>The MyZakat Team</strong></p>
{% endblock %}
```

```text
Assalamu alaikum {{ name }},

Our review team has looked at '{{ project_name }}' (reference #{{ proposal_id }}) and would like some changes before taking a decision.

What we would like you to change
--------------------------------
{{ comment }}

To update your application, go to {{ portal_url }} and enter this email address. We will send you a six-digit code to sign in — you do not need an account or a password.

Your previous version is kept on file, so nothing you have already written is lost.

With gratitude,
The MyZakat Team
```

- [ ] **Step 5: Write `proposal_rejected.html` and `.txt`**

No portal link: the dossier is closed, and inviting an edit that the API would
refuse with a 409 is worse than saying nothing.

```html
{% extends "layouts/base.html" %}
{% block content %}
<h2 style="color: #1f2937; margin: 0 0 18px 0; font-size: 20px;">Decision on your proposal</h2>
<p>Assalamu alaikum {{ name }},</p>
<p>Thank you for submitting <strong>{{ project_name }}</strong> (reference <strong>#{{ proposal_id }}</strong>). After review, we are not able to fund this request.</p>
<table role="presentation" width="100%" style="margin: 18px 0; border-collapse: collapse;">
  <tr>
    <td style="border-left: 4px solid #6b7280; background: #f9fafb; padding: 14px 16px; color: #1f2937; white-space: pre-wrap;">
      {{ comment }}
    </td>
  </tr>
</table>
<p>This decision applies to this application only. You are welcome to submit a new proposal in a future funding cycle, and if anything in the explanation above is unclear you can reply to this email.</p>
<p>With gratitude,<br><strong>The MyZakat Team</strong></p>
{% endblock %}
```

```text
Assalamu alaikum {{ name }},

Thank you for submitting '{{ project_name }}' (reference #{{ proposal_id }}). After review, we are not able to fund this request.

Reason
------
{{ comment }}

This decision applies to this application only. You are welcome to submit a new proposal in a future funding cycle, and if anything in the explanation above is unclear you can reply to this email.

With gratitude,
The MyZakat Team
```

- [ ] **Step 6: Write `proposal_approved.html` and `.txt`**

```html
{% extends "layouts/base.html" %}
{% block content %}
<h2 style="color: #16a34a; margin: 0 0 18px 0; font-size: 20px;">Your proposal has been approved</h2>
<p>Assalamu alaikum {{ name }},</p>
<p>We are pleased to tell you that <strong>{{ project_name }}</strong> (reference <strong>#{{ proposal_id }}</strong>) has been approved by our review team.</p>
{% if comment %}
<table role="presentation" width="100%" style="margin: 18px 0; border-collapse: collapse;">
  <tr>
    <td style="border-left: 4px solid #16a34a; background: #f0fdf4; padding: 14px 16px; color: #1f2937; white-space: pre-wrap;">
      {{ comment }}
    </td>
  </tr>
</table>
{% endif %}
<p>A member of our team will contact you at this address about the next steps, including disbursement and reporting.</p>
<p>With gratitude,<br><strong>The MyZakat Team</strong></p>
{% endblock %}
```

```text
Assalamu alaikum {{ name }},

We are pleased to tell you that '{{ project_name }}' (reference #{{ proposal_id }}) has been approved by our review team.
{% if comment %}

A note from the reviewer
------------------------
{{ comment }}
{% endif %}

A member of our team will contact you at this address about the next steps, including disbursement and reporting.

With gratitude,
The MyZakat Team
```

- [ ] **Step 7: Write `proposal_access_code.html` and `.txt`**

Deliberately impersonal: it is sent before the requester has proved they control
the address, so it must not confirm whose proposals exist.

```html
{% extends "layouts/base.html" %}
{% block content %}
<h2 style="color: #2563eb; margin: 0 0 18px 0; font-size: 20px;">Your sign-in code</h2>
<p>Use this code to see the project proposals submitted with this email address:</p>
<p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111827; margin: 24px 0;">{{ code }}</p>
<p>The code expires in {{ ttl_minutes }} minutes and can be used once.</p>
<p style="color: #6b7280; font-size: 13px;">If you did not ask for this code, you can ignore this email — nothing has been shared and no account has been created.</p>
<p>With gratitude,<br><strong>The MyZakat Team</strong></p>
{% endblock %}
```

```text
Your sign-in code

Use this code to see the project proposals submitted with this email address:

    {{ code }}

The code expires in {{ ttl_minutes }} minutes and can be used once.

If you did not ask for this code, you can ignore this email — nothing has been shared and no account has been created.

With gratitude,
The MyZakat Team
```

- [ ] **Step 8: Replace the stub shims in `backend/email_service.py`**

Delete the four stubs added in Task 5 step 6 and put this in their place:

```python
# ─────────────────────────────────────────────────────────────────────
# Project proposals
# ─────────────────────────────────────────────────────────────────────

PROPOSAL_PORTAL_URL = f"{FRONTEND_URL}/my-proposals"


def _proposal_context(
    name: str, proposal_id: int, version_no: int, project_name: str, comment: str = ""
) -> dict:
    return {
        "name": name,
        "proposal_id": proposal_id,
        "version_no": version_no,
        "project_name": project_name,
        "comment": comment,
        "portal_url": PROPOSAL_PORTAL_URL,
    }


def send_proposal_received(
    *, email: str, name: str, proposal_id: int, version_no: int, project_name: str
) -> bool:
    """Acknowledge a submission — the first one and every revision."""
    return _enqueue(
        "proposal_received",
        to_email=email,
        to_name=name,
        subject=f"We received your proposal #{proposal_id} — MyZakat",
        context=_proposal_context(name, proposal_id, version_no, project_name),
        category="transactional",
        idempotency_key=f"proposal-{proposal_id}-v{version_no}-received",
    )


def send_proposal_changes_requested(
    *, email: str, name: str, proposal_id: int, version_no: int,
    project_name: str, comment: str,
) -> bool:
    """Ask the applicant for changes, quoting the reviewer's message."""
    return _enqueue(
        "proposal_changes_requested",
        to_email=email,
        to_name=name,
        subject=f"Changes requested on your proposal #{proposal_id} — MyZakat",
        context=_proposal_context(name, proposal_id, version_no, project_name, comment),
        category="transactional",
        idempotency_key=f"proposal-{proposal_id}-v{version_no}-changes_requested",
    )


def send_proposal_rejected(
    *, email: str, name: str, proposal_id: int, version_no: int,
    project_name: str, comment: str,
) -> bool:
    """Tell the applicant the request was declined, with the reason."""
    return _enqueue(
        "proposal_rejected",
        to_email=email,
        to_name=name,
        subject=f"Decision on your proposal #{proposal_id} — MyZakat",
        context=_proposal_context(name, proposal_id, version_no, project_name, comment),
        category="transactional",
        idempotency_key=f"proposal-{proposal_id}-v{version_no}-rejected",
    )


def send_proposal_approved(
    *, email: str, name: str, proposal_id: int, version_no: int,
    project_name: str, comment: str = "",
) -> bool:
    """Confirm an approval."""
    return _enqueue(
        "proposal_approved",
        to_email=email,
        to_name=name,
        subject=f"Your proposal #{proposal_id} has been approved — MyZakat",
        context=_proposal_context(name, proposal_id, version_no, project_name, comment),
        category="transactional",
        idempotency_key=f"proposal-{proposal_id}-v{version_no}-approved",
    )


def send_proposal_access_code(*, email: str, code: str, ttl_minutes: int = 10) -> bool:
    """Send a one-time portal sign-in code.

    No idempotency key: every request must deliver its own fresh code, and the
    previous one has already been invalidated server-side. No name, project or
    reference either — this email goes out before the requester has proved they
    control the address.
    """
    return _enqueue(
        "proposal_access_code",
        to_email=email,
        subject="Your MyZakat sign-in code",
        context={"code": code, "ttl_minutes": ttl_minutes},
        category="transactional",
    )
```

- [ ] **Step 9: Run the email tests**

Run: `cd backend && python -m pytest tests/test_proposal_emails.py -v`
Expected: 12 passed (5 parametrized + 7).

- [ ] **Step 10: Confirm a decision emails the applicant exactly once**

Append to `backend/tests/test_project_proposals.py`:

```python
def test_a_decision_emails_the_applicant_once(client, auth_headers, monkeypatch):
    import routers.project_proposals as router_module

    sent = []
    monkeypatch.setattr(
        router_module.email_service, "send_proposal_changes_requested",
        lambda **kwargs: sent.append(kwargs) or True,
    )
    created = client.post("/api/project-proposals/", json=_payload()).json()

    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "decision_comment": "Detail the transport costs."},
        headers=auth_headers,
    )
    # Re-saving the same status (the "save internal note" path) must not re-notify.
    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "internal_note": "Chased by phone."},
        headers=auth_headers,
    )

    assert len(sent) == 1
    assert sent[0]["comment"] == "Detail the transport costs."
    assert sent[0]["proposal_id"] == created["id"]


def test_under_review_does_not_email_the_applicant(client, auth_headers, monkeypatch):
    import routers.project_proposals as router_module

    sent = []
    for name in ("send_proposal_approved", "send_proposal_rejected",
                 "send_proposal_changes_requested"):
        monkeypatch.setattr(router_module.email_service, name,
                            lambda **kwargs: sent.append(kwargs) or True)
    created = client.post("/api/project-proposals/", json=_payload()).json()

    client.patch(f"/api/project-proposals/{created['id']}/status",
                 json={"status": "under_review"}, headers=auth_headers)

    assert sent == []
```

- [ ] **Step 11: Run the suite**

Run: `cd backend && python -m pytest -q`
Expected: all green.

- [ ] **Step 12: Commit**

```bash
git add backend/email_templates/proposal_*.html backend/email_templates/proposal_*.txt \
        backend/email_service.py backend/tests/test_proposal_emails.py \
        backend/tests/test_project_proposals.py
git commit -m "Notify proposal submitters on submission and on every decision"
```

---

## Task 7: Keep portal tokens out of the staff session

The defect this closes: `verify_token()` resolves any validly signed JWT by
looking up `User.email == sub`. A portal token minted for an address that also
belongs to a staff account would satisfy `get_current_user` and open the admin
console. Fix it before any portal token can exist.

**Files:**
- Modify: `backend/auth_utils.py:66-79`
- Test: `backend/tests/test_proposal_portal.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_proposal_portal.py`:

```python
"""Portal authentication: token isolation, one-time codes, revision rules."""
import pytest
from datetime import timedelta

from models import ProjectProposal, ProposalAccessCode, ProposalVersion
from tests.test_project_proposals import _content, _payload


def test_a_portal_token_is_not_a_user_session(admin_user):
    """The defect this closes: a portal token for a staff address must not
    authenticate as that staff member."""
    from auth_utils import create_portal_token, verify_token

    token = create_portal_token(admin_user.email)

    assert verify_token(token) is None


def test_a_staff_token_is_still_a_user_session(admin_user):
    from auth_utils import create_access_token, verify_token

    token = create_access_token({"sub": admin_user.email})

    assert verify_token(token) == admin_user.email


def test_a_portal_token_resolves_only_through_the_portal_verifier():
    from auth_utils import create_portal_token, verify_portal_token

    token = create_portal_token("applicant@example.com")

    assert verify_portal_token(token) == "applicant@example.com"
    assert verify_portal_token("not-a-token") is None


def test_a_staff_token_is_not_a_portal_session(admin_user):
    from auth_utils import create_access_token, verify_portal_token

    token = create_access_token({"sub": admin_user.email})

    assert verify_portal_token(token) is None


def test_an_expired_portal_token_is_refused():
    from auth_utils import create_portal_token, verify_portal_token

    token = create_portal_token("applicant@example.com", expires_delta=timedelta(minutes=-1))

    assert verify_portal_token(token) is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_proposal_portal.py -v`
Expected: FAIL — `ImportError: cannot import name 'create_portal_token' from 'auth_utils'`

- [ ] **Step 3: Patch `backend/auth_utils.py`**

Replace `verify_token` (line 66) with the version below, then add the three new
functions after it. The `typ` claim is the whole mechanism: staff tokens carry
none, so they read as `"user"` and nothing about existing sessions changes.

```python
# Claim value marking a token as a submitter-portal session rather than a staff
# session. Staff tokens carry no `typ` at all, which reads as "user" below, so
# existing sessions keep working untouched.
PORTAL_TOKEN_TYPE = "proposal_portal"
PORTAL_TOKEN_MINUTES = 30


def verify_token(token: str):
    """Verify a STAFF JWT and return its subject email.

    Scoped tokens are refused here even though their signature is valid.
    Without this check, a proposal-portal token minted for an address that also
    belongs to a staff account would resolve to that User in get_current_user,
    and a six-digit emailed code would be enough to reach the admin console.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("typ", "user") != "user":
            return None
        email: str = payload.get("sub")
        if email is None:
            return None
        return email
    except JWTError as e:
        # Log the error for debugging but don't print sensitive info
        import logging
        logging.error(f"JWT verification failed: {str(e)}")
        return None


def create_portal_token(email: str, expires_delta: Optional[timedelta] = None) -> str:
    """Mint a submitter-portal token: short-lived, and not a user session."""
    return create_access_token(
        {"sub": email, "typ": PORTAL_TOKEN_TYPE},
        expires_delta=expires_delta or timedelta(minutes=PORTAL_TOKEN_MINUTES),
    )


def verify_portal_token(token: str) -> Optional[str]:
    """The mirror of verify_token: only a portal token resolves, to its email."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("typ") != PORTAL_TOKEN_TYPE:
        return None
    return payload.get("sub")


def get_portal_email(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """FastAPI dependency for portal routes. Yields the verified email.

    No database lookup: a submitter has no row anywhere. The email in the token
    IS the identity, and every portal query filters on it.
    """
    email = verify_portal_token(credentials.credentials)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in again to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return email
```

- [ ] **Step 4: Run the portal auth tests**

Run: `cd backend && python -m pytest tests/test_proposal_portal.py -v`
Expected: 5 passed.

- [ ] **Step 5: Prove no existing authentication regressed**

The step that matters most here — this change touches every authenticated route
in the application.

Run: `cd backend && python -m pytest tests/test_auth.py tests/test_admin.py tests/test_field_staff_role.py tests/test_media_library_permissions.py -v`
Expected: all pass, unchanged.

- [ ] **Step 6: Run the whole suite**

Run: `cd backend && python -m pytest -q`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add backend/auth_utils.py backend/tests/test_proposal_portal.py
git commit -m "Refuse scoped tokens as staff sessions; add portal token helpers"
```

---

## Task 8: One-time access codes

**Files:**
- Create: `backend/proposal_otp.py`
- Test: `backend/tests/test_proposal_otp.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_proposal_otp.py`:

```python
"""One-time portal codes: generation, single use, attempt cap, rate limits."""
from datetime import datetime, timedelta

from models import ProposalAccessCode


def test_a_code_is_six_digits_and_stored_only_as_a_hash(db_session):
    from proposal_otp import issue_code

    code = issue_code(db_session, email="a@example.com", ip="203.0.113.1")

    assert code is not None
    assert len(code) == 6 and code.isdigit()
    row = db_session.query(ProposalAccessCode).one()
    assert code not in row.code_hash
    assert row.code_hash.startswith("$2")
    assert row.email == "a@example.com"
    assert row.request_ip == "203.0.113.1"
    assert row.expires_at > datetime.utcnow()


def test_the_right_code_verifies_once_and_only_once(db_session):
    from proposal_otp import issue_code, verify_code

    code = issue_code(db_session, email="a@example.com", ip="")

    assert verify_code(db_session, email="a@example.com", code=code) is True
    assert verify_code(db_session, email="a@example.com", code=code) is False


def test_a_wrong_code_fails_and_counts_an_attempt(db_session):
    from proposal_otp import issue_code, verify_code

    issue_code(db_session, email="a@example.com", ip="")

    assert verify_code(db_session, email="a@example.com", code="000000") is False
    assert db_session.query(ProposalAccessCode).one().attempts == 1


def test_the_code_burns_after_five_failures(db_session):
    from proposal_otp import MAX_ATTEMPTS, issue_code, verify_code

    code = issue_code(db_session, email="a@example.com", ip="")
    for _ in range(MAX_ATTEMPTS):
        assert verify_code(db_session, email="a@example.com", code="000000") is False

    # Even the correct code is worthless now.
    assert verify_code(db_session, email="a@example.com", code=code) is False
    assert db_session.query(ProposalAccessCode).one().consumed_at is not None


def test_an_expired_code_is_refused(db_session):
    from proposal_otp import issue_code, verify_code

    code = issue_code(db_session, email="a@example.com", ip="")
    row = db_session.query(ProposalAccessCode).one()
    row.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db_session.commit()

    assert verify_code(db_session, email="a@example.com", code=code) is False


def test_requesting_a_new_code_invalidates_the_previous_one(db_session):
    from proposal_otp import issue_code, verify_code

    first = issue_code(db_session, email="a@example.com", ip="")
    second = issue_code(db_session, email="a@example.com", ip="")

    assert verify_code(db_session, email="a@example.com", code=first) is False
    assert verify_code(db_session, email="a@example.com", code=second) is True


def test_a_code_never_unlocks_another_address(db_session):
    from proposal_otp import issue_code, verify_code

    code = issue_code(db_session, email="a@example.com", ip="")

    assert verify_code(db_session, email="b@example.com", code=code) is False


def test_verifying_with_no_code_on_file_is_simply_false(db_session):
    from proposal_otp import verify_code

    assert verify_code(db_session, email="nobody@example.com", code="123456") is False


def test_an_email_is_capped_at_three_codes_per_window(db_session):
    from proposal_otp import MAX_CODES_PER_EMAIL, issue_code

    for _ in range(MAX_CODES_PER_EMAIL):
        assert issue_code(db_session, email="a@example.com", ip="203.0.113.1") is not None

    assert issue_code(db_session, email="a@example.com", ip="203.0.113.1") is None


def test_the_email_cap_is_case_insensitive(db_session):
    from proposal_otp import MAX_CODES_PER_EMAIL, issue_code

    for _ in range(MAX_CODES_PER_EMAIL):
        issue_code(db_session, email="A@Example.com", ip="203.0.113.1")

    assert issue_code(db_session, email="a@example.com", ip="203.0.113.1") is None


def test_an_ip_is_capped_across_different_addresses(db_session):
    from proposal_otp import MAX_CODES_PER_IP, issue_code

    for n in range(MAX_CODES_PER_IP):
        assert issue_code(db_session, email=f"user{n}@example.com", ip="198.51.100.9") is not None

    assert issue_code(db_session, email="another@example.com", ip="198.51.100.9") is None


def test_an_old_request_no_longer_counts_towards_the_cap(db_session):
    from proposal_otp import EMAIL_WINDOW_MINUTES, MAX_CODES_PER_EMAIL, issue_code

    for _ in range(MAX_CODES_PER_EMAIL):
        issue_code(db_session, email="a@example.com", ip="203.0.113.1")
    for row in db_session.query(ProposalAccessCode).all():
        row.created_at = datetime.utcnow() - timedelta(minutes=EMAIL_WINDOW_MINUTES + 1)
    db_session.commit()

    assert issue_code(db_session, email="a@example.com", ip="203.0.113.1") is not None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_proposal_otp.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'proposal_otp'`

- [ ] **Step 3: Create `backend/proposal_otp.py`**

```python
"""One-time six-digit codes granting a submitter access to their dossiers.

There is no account behind these: the email address is the identity. That makes
the code the only thing between a guess and someone's application, so the rules
here are deliberately strict — hashed at rest, ten-minute lifetime, single use,
dead after five wrong guesses, and both the address and the caller's IP rate
limited.

The project has no rate-limiting middleware, so the limits are enforced by
counting rows in `proposal_access_codes` — the same record we want for audit
anyway.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from auth_utils import get_password_hash, verify_password
from logging_config import get_logger
from models import ProposalAccessCode

logger = get_logger(__name__)

CODE_TTL_MINUTES = 10
MAX_ATTEMPTS = 5
MAX_CODES_PER_EMAIL = 3
EMAIL_WINDOW_MINUTES = 15
MAX_CODES_PER_IP = 10
IP_WINDOW_MINUTES = 60


def generate_code() -> str:
    """A uniformly random six-digit code, leading zeros included."""
    return f"{secrets.randbelow(1_000_000):06d}"


def is_rate_limited(db: Session, *, email: str, ip: str) -> bool:
    """True when this address or this IP has asked for too many codes lately."""
    now = datetime.utcnow()

    per_email = (
        db.query(func.count(ProposalAccessCode.id))
        .filter(
            func.lower(ProposalAccessCode.email) == email.strip().lower(),
            ProposalAccessCode.created_at >= now - timedelta(minutes=EMAIL_WINDOW_MINUTES),
        )
        .scalar()
        or 0
    )
    if per_email >= MAX_CODES_PER_EMAIL:
        logger.warning("Proposal portal: code requests capped for %s", email)
        return True

    if ip:
        per_ip = (
            db.query(func.count(ProposalAccessCode.id))
            .filter(
                ProposalAccessCode.request_ip == ip,
                ProposalAccessCode.created_at >= now - timedelta(minutes=IP_WINDOW_MINUTES),
            )
            .scalar()
            or 0
        )
        if per_ip >= MAX_CODES_PER_IP:
            logger.warning("Proposal portal: code requests capped for IP %s", ip)
            return True

    return False


def issue_code(db: Session, *, email: str, ip: str) -> str | None:
    """Mint a code for this address, or None when rate limited.

    Any earlier unconsumed code for the address is consumed on the way, so only
    the newest one can ever be used — a stale code sitting in an old email is
    never a second key.
    """
    if is_rate_limited(db, email=email, ip=ip):
        return None

    now = datetime.utcnow()
    db.query(ProposalAccessCode).filter(
        func.lower(ProposalAccessCode.email) == email.strip().lower(),
        ProposalAccessCode.consumed_at.is_(None),
    ).update({"consumed_at": now}, synchronize_session=False)

    code = generate_code()
    db.add(
        ProposalAccessCode(
            email=email.strip(),
            code_hash=get_password_hash(code),
            created_at=now,
            expires_at=now + timedelta(minutes=CODE_TTL_MINUTES),
            request_ip=ip or None,
        )
    )
    db.commit()
    return code


def verify_code(db: Session, *, email: str, code: str) -> bool:
    """Consume the newest live code for this address if `code` matches it.

    Returns False for every failure mode — no code on file, expired, already
    used, attempts exhausted, wrong digits — so neither the caller nor an
    attacker can tell them apart.
    """
    now = datetime.utcnow()
    row = (
        db.query(ProposalAccessCode)
        .filter(
            func.lower(ProposalAccessCode.email) == email.strip().lower(),
            ProposalAccessCode.consumed_at.is_(None),
            ProposalAccessCode.expires_at > now,
        )
        .order_by(ProposalAccessCode.created_at.desc())
        .first()
    )
    if row is None:
        return False

    if row.attempts >= MAX_ATTEMPTS:
        row.consumed_at = now
        db.commit()
        return False

    row.attempts += 1
    matched = verify_password(code or "", row.code_hash)
    if matched:
        row.consumed_at = now
    elif row.attempts >= MAX_ATTEMPTS:
        # Burn it on the last wrong guess rather than leaving a live row behind.
        row.consumed_at = now
        logger.warning("Proposal portal: code burned after %s failed attempts", row.attempts)
    db.commit()
    return matched
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python -m pytest tests/test_proposal_otp.py -v`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/proposal_otp.py backend/tests/test_proposal_otp.py
git commit -m "Add one-time access codes for the proposal portal"
```

---

## Task 9: The portal router

**Files:**
- Create: `backend/routers/proposal_portal.py`
- Modify: `backend/main.py:19` and `backend/main.py:230`
- Test: `backend/tests/test_proposal_portal.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_proposal_portal.py`:

```python
# ── Helpers ──────────────────────────────────────────────────────────

def _sign_in(client, email: str) -> dict:
    """Request a code, capture it from the mailer, exchange it for a token."""
    import routers.proposal_portal as portal_module

    captured = {}
    original = portal_module.email_service.send_proposal_access_code

    def capture(**kwargs):
        captured.update(kwargs)
        return True

    portal_module.email_service.send_proposal_access_code = capture
    try:
        resp = client.post("/api/project-proposals/portal/request-code", json={"email": email})
        assert resp.status_code == 202, resp.text
        code = captured["code"]
    finally:
        portal_module.email_service.send_proposal_access_code = original

    verified = client.post(
        "/api/project-proposals/portal/verify-code", json={"email": email, "code": code}
    )
    assert verified.status_code == 200, verified.text
    return {"Authorization": f"Bearer {verified.json()['token']}"}


def _submit_and_request_changes(client, auth_headers, **content_overrides) -> int:
    created = client.post("/api/project-proposals/", json=_payload(**content_overrides)).json()
    resp = client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "decision_comment": "Detail the transport costs."},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    return created["id"]


# ── Request / verify ─────────────────────────────────────────────────

def test_requesting_a_code_answers_identically_for_an_unknown_address(client):
    resp = client.post("/api/project-proposals/portal/request-code",
                       json={"email": "nobody-here@example.com"})

    assert resp.status_code == 202
    assert resp.json() == {
        "message": "If that address has a proposal with us, a sign-in code is on its way."
    }


def test_no_code_is_emailed_to_an_address_with_no_proposal(client, db_session, monkeypatch):
    import routers.proposal_portal as portal_module

    sent = []
    monkeypatch.setattr(portal_module.email_service, "send_proposal_access_code",
                        lambda **kwargs: sent.append(kwargs) or True)

    client.post("/api/project-proposals/portal/request-code",
                json={"email": "nobody-here@example.com"})

    assert sent == []
    assert db_session.query(ProposalAccessCode).count() == 0


def test_a_known_address_gets_the_same_reply_as_an_unknown_one(client):
    client.post("/api/project-proposals/", json=_payload())

    resp = client.post("/api/project-proposals/portal/request-code",
                       json={"email": "amina@example.com"})

    assert resp.status_code == 202
    assert resp.json() == {
        "message": "If that address has a proposal with us, a sign-in code is on its way."
    }


def test_a_wrong_code_is_401(client):
    client.post("/api/project-proposals/", json=_payload())
    client.post("/api/project-proposals/portal/request-code", json={"email": "amina@example.com"})

    resp = client.post("/api/project-proposals/portal/verify-code",
                       json={"email": "amina@example.com", "code": "000000"})

    assert resp.status_code == 401


def test_too_many_code_requests_is_429(client):
    from proposal_otp import MAX_CODES_PER_EMAIL

    client.post("/api/project-proposals/", json=_payload())
    for _ in range(MAX_CODES_PER_EMAIL):
        client.post("/api/project-proposals/portal/request-code",
                    json={"email": "amina@example.com"})

    resp = client.post("/api/project-proposals/portal/request-code",
                       json={"email": "amina@example.com"})

    assert resp.status_code == 429


# ── The dashboard ────────────────────────────────────────────────────

def test_the_portal_lists_only_the_signed_in_address_dossiers(client, auth_headers):
    mine = _submit_and_request_changes(client, auth_headers)
    client.post("/api/project-proposals/", json=_payload(email="someone-else@example.com"))
    headers = _sign_in(client, "amina@example.com")

    resp = client.get("/api/project-proposals/portal/me", headers=headers)

    assert resp.status_code == 200
    items = resp.json()["items"]
    assert [i["id"] for i in items] == [mine]
    assert items[0]["editable"] is True
    assert items[0]["decision_comment"] == "Detail the transport costs."
    assert items[0]["content"]["project_name"] == "Fresh Food Parcels"


def test_the_portal_never_exposes_internal_notes(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(
        f"/api/project-proposals/{created['id']}/status",
        json={"status": "changes_requested", "decision_comment": "Detail the costs.",
              "internal_note": "Applicant known to inflate budgets."},
        headers=auth_headers,
    )
    headers = _sign_in(client, "amina@example.com")

    body = client.get("/api/project-proposals/portal/me", headers=headers).text

    assert "inflate budgets" not in body
    assert "internal_note" not in body
    assert "submitted_ip" not in body


def test_the_dashboard_needs_a_portal_token(client):
    assert client.get("/api/project-proposals/portal/me").status_code in (401, 403)


def test_a_staff_token_cannot_read_the_portal(client, auth_headers):
    resp = client.get("/api/project-proposals/portal/me", headers=auth_headers)

    assert resp.status_code == 401


def test_a_portal_token_cannot_reach_the_admin_endpoints(client, auth_headers):
    proposal_id = _submit_and_request_changes(client, auth_headers)
    headers = _sign_in(client, "amina@example.com")

    for path in ("/api/project-proposals/",
                 f"/api/project-proposals/{proposal_id}",
                 f"/api/project-proposals/{proposal_id}/versions/1",
                 f"/api/project-proposals/{proposal_id}/pdf"):
        assert client.get(path, headers=headers).status_code in (401, 403), path


# ── Revisions ────────────────────────────────────────────────────────

def test_a_revision_appends_a_version_and_reopens_the_dossier(client, auth_headers):
    proposal_id = _submit_and_request_changes(client, auth_headers)
    headers = _sign_in(client, "amina@example.com")

    resp = client.put(
        f"/api/project-proposals/portal/{proposal_id}",
        json=_payload(project_name="Fresh Food Parcels (revised)"),
        headers=headers,
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["version_no"] == 2
    assert resp.json()["status"] == "submitted"
    assert resp.json()["editable"] is False

    detail = client.get(f"/api/project-proposals/{proposal_id}", headers=auth_headers).json()
    assert detail["project_name"] == "Fresh Food Parcels (revised)"
    assert detail["version_count"] == 2
    # Version 1 keeps the decision that caused the revision.
    assert detail["versions"][0]["decision"] == "changes_requested"
    assert detail["versions"][0]["decision_comment"] == "Detail the transport costs."
    assert detail["versions"][1]["decision"] is None


def test_a_revision_is_acknowledged_by_email(client, auth_headers, monkeypatch):
    import routers.proposal_portal as portal_module

    proposal_id = _submit_and_request_changes(client, auth_headers)
    headers = _sign_in(client, "amina@example.com")
    sent = []
    monkeypatch.setattr(portal_module.email_service, "send_proposal_received",
                        lambda **kwargs: sent.append(kwargs) or True)

    client.put(f"/api/project-proposals/portal/{proposal_id}", json=_payload(), headers=headers)

    assert len(sent) == 1
    assert sent[0]["version_no"] == 2


def test_a_revision_of_a_rejected_dossier_is_409(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(f"/api/project-proposals/{created['id']}/status",
                 json={"status": "rejected", "decision_comment": "Out of scope."},
                 headers=auth_headers)
    headers = _sign_in(client, "amina@example.com")

    resp = client.put(f"/api/project-proposals/portal/{created['id']}",
                      json=_payload(), headers=headers)

    assert resp.status_code == 409


def test_a_revision_of_an_approved_dossier_is_409(client, auth_headers):
    created = client.post("/api/project-proposals/", json=_payload()).json()
    client.patch(f"/api/project-proposals/{created['id']}/status",
                 json={"status": "approved"}, headers=auth_headers)
    headers = _sign_in(client, "amina@example.com")

    resp = client.put(f"/api/project-proposals/portal/{created['id']}",
                      json=_payload(), headers=headers)

    assert resp.status_code == 409


def test_a_revision_cannot_move_the_dossier_to_another_email(client, auth_headers):
    proposal_id = _submit_and_request_changes(client, auth_headers)
    headers = _sign_in(client, "amina@example.com")

    resp = client.put(f"/api/project-proposals/portal/{proposal_id}",
                      json=_payload(email="attacker@example.com"), headers=headers)

    assert resp.status_code == 200
    detail = client.get(f"/api/project-proposals/{proposal_id}", headers=auth_headers).json()
    assert detail["email"] == "amina@example.com"


def test_someone_elses_dossier_is_a_404_not_a_403(client, auth_headers):
    """404 on purpose: a 403 would confirm the dossier exists."""
    mine = _submit_and_request_changes(client, auth_headers)
    theirs = client.post(
        "/api/project-proposals/", json=_payload(email="someone-else@example.com")
    ).json()["id"]
    headers = _sign_in(client, "amina@example.com")

    assert mine != theirs
    assert client.put(f"/api/project-proposals/portal/{theirs}",
                      json=_payload(), headers=headers).status_code == 404


def test_an_incomplete_revision_is_refused(client, auth_headers):
    """A revision is validated by the same schema as a first submission, so it
    can never be less complete than the original."""
    proposal_id = _submit_and_request_changes(client, auth_headers)
    headers = _sign_in(client, "amina@example.com")

    resp = client.put(f"/api/project-proposals/portal/{proposal_id}",
                      json=_payload(project_description="too short"), headers=headers)

    assert resp.status_code == 422
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_proposal_portal.py -v`
Expected: the new tests FAIL — `ModuleNotFoundError: No module named 'routers.proposal_portal'`

- [ ] **Step 3: Create `backend/routers/proposal_portal.py`**

```python
"""Submitter-facing half of project proposals — no account required.

Endpoints (all mounted under /api/project-proposals/portal)
───────────────────────────────────────────────────────────
  POST /request-code    → email a six-digit code (202 whatever the address)
  POST /verify-code     → exchange the code for a 30-minute portal token
  GET  /me              → the dossiers belonging to the token's address
  PUT  /{proposal_id}   → submit the next version of one of them

Three rules hold everywhere in this file:
  * the address in the token is the only identity, and every query filters on it;
  * a dossier belonging to someone else answers 404, never 403 — a 403 would
    confirm it exists;
  * responses are built by serialize_for_portal, a different function from the
    admin serializer, so internal notes cannot leak by accident.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

import email_service
import proposal_otp
import proposal_service
from auth_utils import PORTAL_TOKEN_MINUTES, create_portal_token, get_portal_email
from database import get_db
from logging_config import get_logger
from models import ProjectProposal
from proposal_service import ProposalNotEditable
from routers.project_proposals import ProposalSubmit, client_ip

logger = get_logger(__name__)
router = APIRouter()

# Identical for a known and an unknown address: this endpoint must not let
# anyone discover who has applied for funding.
OPAQUE_REQUEST_REPLY = {
    "message": "If that address has a proposal with us, a sign-in code is on its way."
}


class CodeRequest(BaseModel):
    email: EmailStr


class CodeVerification(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


def _dossiers_for(db: Session, email: str) -> list[ProjectProposal]:
    return (
        db.query(ProjectProposal)
        .filter(func.lower(ProjectProposal.email) == email.strip().lower())
        .order_by(ProjectProposal.submitted_at.desc())
        .all()
    )


@router.post("/request-code", status_code=status.HTTP_202_ACCEPTED)
async def request_code(payload: CodeRequest, request: Request, db: Session = Depends(get_db)):
    """Email a one-time code, but only if the address actually has a dossier.

    The reply is the same either way. Over the rate limit it is a 429, which
    does reveal that *someone* has been asking about this address recently — an
    acceptable trade for a limit that cannot be bypassed by rotating addresses.
    """
    email = payload.email.strip()

    if not _dossiers_for(db, email):
        logger.info("Proposal portal: code requested for an address with no dossier")
        return OPAQUE_REQUEST_REPLY

    code = proposal_otp.issue_code(db, email=email, ip=client_ip(request))
    if code is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many sign-in codes requested. Please try again later.",
        )

    email_service.send_proposal_access_code(
        email=email, code=code, ttl_minutes=proposal_otp.CODE_TTL_MINUTES
    )
    return OPAQUE_REQUEST_REPLY


@router.post("/verify-code")
async def verify_code(payload: CodeVerification, db: Session = Depends(get_db)):
    """Exchange a valid code for a portal token."""
    if not proposal_otp.verify_code(db, email=payload.email, code=payload.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That code is not valid. Request a new one and try again.",
        )
    logger.info("Proposal portal: sign-in succeeded")
    return {
        "token": create_portal_token(payload.email.strip()),
        "expires_in": PORTAL_TOKEN_MINUTES * 60,
    }


@router.get("/me")
async def my_proposals(
    email: str = Depends(get_portal_email),
    db: Session = Depends(get_db),
):
    """Every dossier submitted from this address, newest first."""
    dossiers = _dossiers_for(db, email)
    return {
        "email": email,
        "items": [
            proposal_service.serialize_for_portal(d, proposal_service.current_version(db, d))
            for d in dossiers
        ],
    }


@router.put("/{proposal_id}")
async def submit_revision(
    proposal_id: int,
    payload: ProposalSubmit,
    request: Request,
    email: str = Depends(get_portal_email),
    db: Session = Depends(get_db),
):
    """Append the next version of one of this address's dossiers.

    The payload is validated by the same schema as a first submission, so a
    revision can never be less complete than the original. Its `email` field is
    ignored — add_revision takes the dossier's.
    """
    dossier = (
        db.query(ProjectProposal)
        .filter(
            ProjectProposal.id == proposal_id,
            func.lower(ProjectProposal.email) == email.strip().lower(),
        )
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=404, detail="Proposal not found")

    data = payload.model_dump()
    try:
        version = proposal_service.add_revision(
            db, dossier,
            content=data,
            submitted_ip=client_ip(request),
            sms_consent=bool(data.get("sms_consent")),
            sms_consent_text=data.get("sms_consent_text"),
        )
    except ProposalNotEditable as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    logger.info("Proposal #%s revised to version %s", dossier.id, version.version_no)
    email_service.send_proposal_received(
        email=dossier.email,
        name=version.full_name,
        proposal_id=dossier.id,
        version_no=version.version_no,
        project_name=version.project_name,
    )
    return proposal_service.serialize_for_portal(dossier, version)
```

- [ ] **Step 4: Register the router in `backend/main.py`**

Add `proposal_portal` to the `from routers import ...` line (line 19), after
`project_proposals`:

```python
from routers import auth, admin, donations, events, stories, contact, testimonials, subscriptions, volunteers, settings, user, slideshow, urgent_needs, media, static_files, gallery, program_categories, programs, cleanup, s3_media, campaigns, marketing, marketing_templates, marketing_segments, marketing_campaigns, fundraising_projects, tracking, project_proposals, proposal_portal, media_library, media_library_files
```

Then mount it immediately **before** the proposals router (line 230), so the
`/portal/...` paths are matched first under the shared prefix:

```python
app.include_router(proposal_portal.router, prefix="/api/project-proposals/portal", tags=["proposal-portal"])
app.include_router(project_proposals.router, prefix="/api/project-proposals", tags=["project-proposals"])
```

- [ ] **Step 5: Run the portal tests**

Run: `cd backend && python -m pytest tests/test_proposal_portal.py -v`
Expected: 21 passed (5 from Task 7 plus 16 here).

- [ ] **Step 6: Run the whole suite**

Run: `cd backend && python -m pytest -q`
Expected: all green.

- [ ] **Step 7: Check the routes are mounted where the frontend will look**

Run:
```bash
cd backend && python -c "
from main import app
for r in app.routes:
    if 'project-proposals' in getattr(r, 'path', ''):
        print(sorted(r.methods), r.path)
"
```
Expected to include:
```
['POST'] /api/project-proposals/portal/request-code
['POST'] /api/project-proposals/portal/verify-code
['GET'] /api/project-proposals/portal/me
['PUT'] /api/project-proposals/portal/{proposal_id}
```

- [ ] **Step 8: Commit**

```bash
git add backend/routers/proposal_portal.py backend/main.py backend/tests/test_proposal_portal.py
git commit -m "Add the passwordless submitter portal"
```

---

## Task 10: Migration 33 — drop the legacy columns

Apply this **after** the new backend image is deployed. See "Deployment order".

**Files:**
- Create: `migrations/33_drop_proposal_content_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 33: drop the project_proposals columns that moved to
-- proposal_versions in migration 32.
--
-- DESTRUCTIVE. Apply it only once BOTH are true:
--   * migration 32 ran and its backfill was verified — every proposal has a
--     version 1 and a current_version_id (query below);
--   * the backend image serving traffic is the one that reads content from
--     proposal_versions. The previous image still writes these columns.
--
-- Verify before running:
--   SELECT count(*) FROM project_proposals WHERE current_version_id IS NULL;
--   -- must return 0
--
-- Idempotent: safe to run more than once.

ALTER TABLE project_proposals DROP COLUMN IF EXISTS national_id;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS date_of_birth_year;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS place_of_residence;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS mobile_number;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS educational_level;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS project_name;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS project_description;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS problem_solved;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS target_beneficiaries;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS community_impact;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS expected_impact;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS implementation_steps;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS implementation_location;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS required_materials;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS expected_duration;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS continuity_plan;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS feasibility;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS expected_challenges;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS number_of_beneficiaries;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS cost_per_unit_usd;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS unit_type;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS additional_expenses_usd;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS additional_expenses_description;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS total_amount_usd;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS admin_notes;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS submitted_ip;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS sms_consent;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS sms_consent_at;
ALTER TABLE project_proposals DROP COLUMN IF EXISTS sms_consent_text;

-- full_name stays: the dossier keeps it denormalised for the admin list, and
-- the service rewrites it on every new version.
ALTER TABLE project_proposals ALTER COLUMN full_name SET NOT NULL;

SELECT 'Migration 33 completed successfully!' as message;
```

- [ ] **Step 2: Check the precondition on the running database**

Run:
```bash
docker compose exec -T db psql -U postgres -d myzakat -t -A -c \
  "SELECT count(*) FROM project_proposals WHERE current_version_id IS NULL;"
```
Expected: `0`. Anything else means migration 32's backfill did not complete —
stop and fix that first.

- [ ] **Step 3: Apply it**

Run:
```bash
docker compose exec -T db psql -U postgres -d myzakat -v ON_ERROR_STOP=1 \
  < migrations/33_drop_proposal_content_columns.sql
```
Expected: `ALTER TABLE` lines, then `Migration 33 completed successfully!`.

- [ ] **Step 4: Verify the dossier table is down to its identity columns**

Run:
```bash
docker compose exec -T db psql -U postgres -d myzakat -t -A -c \
  "SELECT column_name FROM information_schema.columns
    WHERE table_name = 'project_proposals' ORDER BY column_name;"
```
Expected exactly these nine, in this order: `current_version_id`, `email`,
`full_name`, `id`, `reviewed_at`, `reviewed_by`, `status`, `submitted_at`,
`updated_at`.

- [ ] **Step 5: Verify the reshaped schema serves a real request**

The seeded legacy proposal from Task 2 has a dossier, so this should mint a code
against real Postgres rather than SQLite:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  http://localhost:8000/api/project-proposals/portal/request-code \
  -H 'Content-Type: application/json' -d '{"email":"legacy@example.com"}'
```
Expected: `202`.

- [ ] **Step 6: Re-run to confirm idempotency**

Run the step 3 command again.
Expected: the same success message, no errors.

- [ ] **Step 7: Commit**

```bash
git add migrations/33_drop_proposal_content_columns.sql
git commit -m "Migration 33: drop the proposal content columns that moved to versions"
```

---

## Task 11: Extract the shared proposal form

A 25-field form cannot be written twice. Everything reusable leaves
`SubmitProposal.tsx` (604 lines) for a component that both the public page and
the portal drive, with the public page reduced to a shell.

**Files:**
- Create: `frontend/src/components/proposals/ProposalForm.tsx`
- Modify: `frontend/src/pages/SubmitProposal.tsx`
- Test: `frontend/src/components/proposals/__tests__/ProposalForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/proposals/__tests__/ProposalForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ProposalForm, {
  EMPTY_PROPOSAL_FORM,
  buildProposalPayload,
  humanizePydanticError,
} from '../ProposalForm'
import type { ProposalFormValues } from '../ProposalForm'

const renderForm = (props: Partial<React.ComponentProps<typeof ProposalForm>> = {}) =>
  render(
    <MemoryRouter>
      <ProposalForm
        mode="create"
        onSubmit={vi.fn()}
        submitting={false}
        fieldErrors={[]}
        genericError=""
        {...props}
      />
    </MemoryRouter>,
  )

const filled = (): ProposalFormValues => ({
  ...EMPTY_PROPOSAL_FORM,
  full_name: 'Amina Yusuf',
  email: 'amina@example.com',
  project_name: 'Fresh Food Parcels',
  number_of_beneficiaries: '200',
  cost_per_unit_usd: '20',
  unit_type: 'family',
  additional_expenses_usd: '500',
})

describe('ProposalForm', () => {
  it('starts on step 1 with an editable email in create mode', () => {
    renderForm()

    const email = screen.getByLabelText(/^email/i) as HTMLInputElement
    expect(email).not.toBeDisabled()
    expect(email.value).toBe('')
  })

  it('prefills and locks the email in revise mode', () => {
    renderForm({ mode: 'revise', initialValues: filled() })

    const email = screen.getByLabelText(/^email/i) as HTMLInputElement
    expect(email.value).toBe('amina@example.com')
    expect(email).toBeDisabled()
    expect(screen.getByDisplayValue('Amina Yusuf')).toBeInTheDocument()
  })

  it('explains why the email is locked rather than just greying it out', () => {
    renderForm({ mode: 'revise', initialValues: filled() })

    expect(screen.getByText(/contact us.*change.*email/i)).toBeInTheDocument()
  })

  it('labels the submit button for the mode it is in', async () => {
    const { unmount } = renderForm({ mode: 'create' })
    // Step 4 holds the submit button; walking there needs a complete form, so
    // assert on the label the component exposes for its mode instead.
    expect(screen.getByTestId('proposal-form')).toHaveAttribute('data-mode', 'create')
    unmount()

    renderForm({ mode: 'revise', initialValues: filled() })
    expect(screen.getByTestId('proposal-form')).toHaveAttribute('data-mode', 'revise')
  })

  it('jumps to the earliest step that has a server-side error', () => {
    renderForm({
      fieldErrors: [
        { field: 'feasibility', label: 'Feasibility', step: 3, msg: 'needs at least 10 characters' },
        { field: 'email', label: 'Email', step: 1, msg: 'not a valid email address' },
      ],
    })

    expect(screen.getByRole('heading', { name: /personal information/i })).toBeInTheDocument()
  })

  it('shows a generic error when the server sent one', () => {
    renderForm({ genericError: 'Network error. Please try again.' })

    expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument()
  })

  it('advances to step 2 once every step-1 field is filled', async () => {
    const user = userEvent.setup()
    renderForm({ initialValues: {
      ...EMPTY_PROPOSAL_FORM,
      full_name: 'Amina Yusuf',
      national_id: 'ID-90210',
      date_of_birth_year: '1992',
      place_of_residence: 'Sanaa',
      mobile_number: '+967700000000',
      email: 'amina@example.com',
      educational_level: 'BSc Agriculture',
    } })

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByRole('heading', { name: /project information/i })).toBeInTheDocument()
  })
})

describe('buildProposalPayload', () => {
  it('computes the total from the breakdown the backend re-checks', () => {
    const payload = buildProposalPayload(filled(), false)

    expect(payload.total_amount_usd).toBe(200 * 20 + 500)
    expect(payload.number_of_beneficiaries).toBe(200)
    expect(payload.cost_per_unit_usd).toBe(20)
  })

  it('sends the consent wording only when the box was ticked', () => {
    expect(buildProposalPayload(filled(), false).sms_consent_text).toBeNull()
    expect(buildProposalPayload(filled(), true).sms_consent_text).toContain('Customer care')
  })

  it('trims text and nulls an empty optional description', () => {
    const payload = buildProposalPayload(
      { ...filled(), full_name: '  Amina Yusuf  ', additional_expenses_description: '   ' },
      false,
    )

    expect(payload.full_name).toBe('Amina Yusuf')
    expect(payload.additional_expenses_description).toBeNull()
  })
})

describe('humanizePydanticError', () => {
  it('turns validator prose into something an applicant can act on', () => {
    expect(humanizePydanticError('String should have at least 10 characters'))
      .toBe('needs at least 10 characters')
    expect(humanizePydanticError('value is not a valid email address'))
      .toBe('not a valid email address')
    expect(humanizePydanticError('Input should be greater than 0'))
      .toBe('must be greater than zero')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/proposals`
Expected: FAIL — `Failed to resolve import "../ProposalForm"`

- [ ] **Step 3: Create `frontend/src/components/proposals/ProposalForm.tsx`**

Move the reusable half of `SubmitProposal.tsx` here: the `Form` interface (now
exported as `ProposalFormValues`), `EMPTY`, `PROPOSAL_SMS_CONSENT_TEXT`,
`MIN_LEN`, `FIELD_INFO`, `humanizePydanticError`, `FieldError`, `Field`,
`CharCount`, and the four step panels verbatim — every label, placeholder, hint
and Tailwind class exactly as it is today. Only the wiring below is new.

```tsx
/**
 * The four-section project-proposal form, shared by two callers.
 *
 *   mode="create"  — the public /submit-proposal page, empty, email editable.
 *   mode="revise"  — the /my-proposals portal, prefilled from the current
 *                    version, email locked because it is the dossier's identity
 *                    key and the portal's access key.
 *
 * The component owns the wizard step, the field values and client-side
 * completeness. The parent owns submission: it receives a ready payload, and
 * hands back `submitting`, `fieldErrors` and `genericError`. That split is what
 * lets the portal keep the filled-in values when a 30-minute token expires
 * mid-edit — it re-authenticates and calls onSubmit again with the same form
 * still mounted.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, User as UserIcon, ClipboardList, ListChecks,
  DollarSign, Loader2, Info, Send, AlertCircle,
} from 'lucide-react'

export type StepIndex = 1 | 2 | 3 | 4

export interface ProposalFormValues {
  // Section 1
  full_name: string
  national_id: string
  date_of_birth_year: string
  place_of_residence: string
  mobile_number: string
  email: string
  educational_level: string
  // Section 2
  project_name: string
  project_description: string
  problem_solved: string
  target_beneficiaries: string
  community_impact: string
  expected_impact: string
  // Section 3
  implementation_steps: string
  implementation_location: string
  required_materials: string
  expected_duration: string
  continuity_plan: string
  feasibility: string
  expected_challenges: string
  // Section 4
  number_of_beneficiaries: string
  cost_per_unit_usd: string
  unit_type: string
  additional_expenses_usd: string
  additional_expenses_description: string
}

export interface FieldError { field: string; label: string; step: StepIndex; msg: string }

export const EMPTY_PROPOSAL_FORM: ProposalFormValues = {
  full_name: '', national_id: '', date_of_birth_year: '', place_of_residence: '',
  mobile_number: '', email: '', educational_level: '',
  project_name: '', project_description: '', problem_solved: '', target_beneficiaries: '',
  community_impact: '', expected_impact: '',
  implementation_steps: '', implementation_location: '', required_materials: '',
  expected_duration: '', continuity_plan: '', feasibility: '', expected_challenges: '',
  number_of_beneficiaries: '', cost_per_unit_usd: '', unit_type: 'family',
  additional_expenses_usd: '0', additional_expenses_description: '',
}

export const CURRENT_YEAR = new Date().getFullYear()

// TCR / 10DLC-compliant SMS opt-in disclosure. The message category must
// be exactly "Customer care" because that is the campaign use case we
// registered with the carrier — anything more specific (e.g. naming the
// proposal review flow) puts messages sent through this line out of scope.
//
// Stored verbatim with the version when the applicant ticks the box so we can
// prove later exactly what they agreed to. Keep this wording in sync with what
// the checkbox actually shows.
export const PROPOSAL_SMS_CONSENT_TEXT = (
  'By checking this box, I agree to receive SMS messages about Customer ' +
  'care from MyZakat at the mobile number provided above. Message ' +
  'frequency may vary. Message and data rates may apply. Text HELP to ' +
  '1-833-699-2528 for assistance. Reply STOP to opt out of receiving ' +
  'SMS messages.'
)

// Minimum-character rules match the backend Pydantic Field(min_length=...) on
// routers/project_proposals.py. Keeping the map in one place makes it trivial
// to keep both sides in sync and to render field-specific "X of Y characters"
// hints under each textarea.
export const MIN_LEN: Partial<Record<keyof ProposalFormValues, number>> = {
  project_description: 10,
  problem_solved: 10,
  target_beneficiaries: 5,
  community_impact: 10,
  expected_impact: 10,
  implementation_steps: 5,
  implementation_location: 5,
  required_materials: 5,
  continuity_plan: 10,
  feasibility: 10,
  expected_challenges: 10,
}

// Human labels + which step each field lives on. Used to turn opaque Pydantic
// errors (which name fields by their snake_case key) into a friendly
// "Step 2 · Project description: needs at least 10 characters" list.
export const FIELD_INFO: Record<string, { label: string; step: StepIndex }> = {
  full_name:              { label: 'Full name',              step: 1 },
  national_id:            { label: 'National ID',            step: 1 },
  date_of_birth_year:     { label: 'Date of birth',          step: 1 },
  place_of_residence:     { label: 'Place of residence',     step: 1 },
  mobile_number:          { label: 'Mobile number',          step: 1 },
  email:                  { label: 'Email',                  step: 1 },
  educational_level:      { label: 'Educational level',      step: 1 },
  project_name:           { label: 'Project name',           step: 2 },
  project_description:    { label: 'Project description',    step: 2 },
  problem_solved:         { label: 'Problem the project solves', step: 2 },
  target_beneficiaries:   { label: 'Target beneficiaries',   step: 2 },
  community_impact:       { label: 'Community impact',       step: 2 },
  expected_impact:        { label: 'Expected impact',        step: 2 },
  implementation_steps:   { label: 'Implementation steps',   step: 3 },
  implementation_location:{ label: 'Location',               step: 3 },
  required_materials:     { label: 'Required materials',     step: 3 },
  expected_duration:      { label: 'Expected duration',      step: 3 },
  continuity_plan:        { label: 'Continuity plan',        step: 3 },
  feasibility:            { label: 'Feasibility',            step: 3 },
  expected_challenges:    { label: 'Expected challenges',    step: 3 },
  number_of_beneficiaries:{ label: 'Beneficiaries count',    step: 4 },
  cost_per_unit_usd:      { label: 'Cost per unit',          step: 4 },
  unit_type:              { label: 'Unit type',              step: 4 },
  total_amount_usd:       { label: 'Total amount',           step: 4 },
}

export function humanizePydanticError(msg: string): string {
  // Common patterns → plain English.
  const shortMatch = msg.match(/at least (\d+) character/i)
  if (shortMatch) return `needs at least ${shortMatch[1]} characters`
  const longMatch = msg.match(/at most (\d+) character/i)
  if (longMatch) return `too long (max ${longMatch[1]} characters)`
  if (/valid email/i.test(msg)) return 'not a valid email address'
  if (/greater than 0/i.test(msg)) return 'must be greater than zero'
  if (/greater than or equal to/i.test(msg)) return msg.replace(/^.*?(greater than.+)$/i, '$1')
  return msg.replace(/^(Value error, )/, '')
}

/** Turn a FastAPI 422 body into step-scoped rows the form can jump to. */
export function parseFieldErrors(detail: unknown): FieldError[] {
  if (!Array.isArray(detail)) return []
  return detail.map((e: any) => {
    const key = String(e.loc?.[e.loc.length - 1] ?? 'field')
    const info = FIELD_INFO[key] || { label: key, step: 1 as StepIndex }
    return { field: key, label: info.label, step: info.step, msg: humanizePydanticError(e.msg || 'Invalid value') }
  })
}

const num = (v: string) => {
  const parsed = parseFloat(v || '0')
  return Number.isNaN(parsed) ? 0 : parsed
}

/** The exact JSON body both POST / and PUT /portal/{id} expect. */
export function buildProposalPayload(form: ProposalFormValues, smsConsent: boolean) {
  const subtotal = num(form.number_of_beneficiaries) * num(form.cost_per_unit_usd)
  return {
    full_name: form.full_name.trim(),
    national_id: form.national_id.trim(),
    date_of_birth_year: parseInt(form.date_of_birth_year),
    place_of_residence: form.place_of_residence.trim(),
    mobile_number: form.mobile_number.trim(),
    email: form.email.trim(),
    educational_level: form.educational_level.trim(),
    project_name: form.project_name.trim(),
    project_description: form.project_description.trim(),
    problem_solved: form.problem_solved.trim(),
    target_beneficiaries: form.target_beneficiaries.trim(),
    community_impact: form.community_impact.trim(),
    expected_impact: form.expected_impact.trim(),
    implementation_steps: form.implementation_steps.trim(),
    implementation_location: form.implementation_location.trim(),
    required_materials: form.required_materials.trim(),
    expected_duration: form.expected_duration.trim(),
    continuity_plan: form.continuity_plan.trim(),
    feasibility: form.feasibility.trim(),
    expected_challenges: form.expected_challenges.trim(),
    number_of_beneficiaries: parseInt(form.number_of_beneficiaries),
    cost_per_unit_usd: num(form.cost_per_unit_usd),
    unit_type: form.unit_type.trim(),
    additional_expenses_usd: num(form.additional_expenses_usd),
    additional_expenses_description: form.additional_expenses_description.trim() || null,
    total_amount_usd: subtotal + num(form.additional_expenses_usd),
    sms_consent: smsConsent,
    sms_consent_text: smsConsent ? PROPOSAL_SMS_CONSENT_TEXT : null,
  }
}

export interface ProposalFormProps {
  mode: 'create' | 'revise'
  initialValues?: Partial<ProposalFormValues>
  onSubmit: (payload: ReturnType<typeof buildProposalPayload>) => void | Promise<void>
  submitting: boolean
  fieldErrors: FieldError[]
  genericError: string
}

const ProposalForm = ({
  mode, initialValues, onSubmit, submitting, fieldErrors, genericError,
}: ProposalFormProps) => {
  const [step, setStep] = useState<StepIndex>(1)
  const [form, setForm] = useState<ProposalFormValues>({ ...EMPTY_PROPOSAL_FORM, ...initialValues })
  // Optional SMS opt-in. Must default to false (never pre-selected) per 10DLC
  // rules, and must not gate submission — applicants can submit without it.
  const [smsConsent, setSmsConsent] = useState(false)

  const emailLocked = mode === 'revise'
  const submitLabel = mode === 'revise' ? 'Resubmit proposal' : 'Submit proposal'

  // Server-side errors name a field; send the applicant to the first step that
  // has one so they see the inputs to fix rather than a list far from them.
  useEffect(() => {
    if (fieldErrors.length === 0) return
    const first = Math.min(...fieldErrors.map((e) => e.step)) as StepIndex
    if (first >= 1 && first <= 4) setStep(first)
  }, [fieldErrors])

  const meets = (key: keyof ProposalFormValues): boolean => {
    const value = (form[key] || '').trim()
    if (!value) return false
    return value.length >= (MIN_LEN[key] || 0)
  }

  const set = <K extends keyof ProposalFormValues>(key: K) => (v: string) =>
    setForm((f) => ({ ...f, [key]: v }))

  const subtotal = useMemo(
    () => num(form.number_of_beneficiaries) * num(form.cost_per_unit_usd),
    [form.number_of_beneficiaries, form.cost_per_unit_usd],
  )
  const additional = useMemo(() => num(form.additional_expenses_usd), [form.additional_expenses_usd])
  const total = subtotal + additional

  const canContinue1 = meets('full_name') && meets('national_id') && meets('date_of_birth_year') && meets('place_of_residence') && meets('mobile_number') && meets('email') && meets('educational_level')
  const canContinue2 = meets('project_name') && meets('project_description') && meets('problem_solved') && meets('target_beneficiaries') && meets('community_impact') && meets('expected_impact')
  const canContinue3 = meets('implementation_steps') && meets('implementation_location') && meets('required_materials') && meets('expected_duration') && meets('continuity_plan') && meets('feasibility') && meets('expected_challenges')
  const canSubmit = canContinue1 && canContinue2 && canContinue3 && meets('number_of_beneficiaries') && meets('cost_per_unit_usd') && meets('unit_type') && total > 0

  const steps: { n: StepIndex; label: string; icon: any }[] = [
    { n: 1, label: 'Personal',  icon: UserIcon },
    { n: 2, label: 'Project',   icon: ClipboardList },
    { n: 3, label: 'Plan',      icon: ListChecks },
    { n: 4, label: 'Budget',    icon: DollarSign },
  ]

  return (
    <div className="space-y-6" data-testid="proposal-form" data-mode={mode}>
      {/* The step indicator and the four panels, moved verbatim — see below
          for the exact source lines and the three edits they need. */}
    </div>
  )
}

export default ProposalForm
```

**What goes inside that `<div>`**, copied from the pre-extraction
`SubmitProposal.tsx` at the revision this task starts from
(`git show HEAD:frontend/src/pages/SubmitProposal.tsx`):

| Source lines | What it is |
|---|---|
| 336-356 | the `<ol className="grid grid-cols-4 gap-2 …">` step indicator |
| 359-430 | `{step === 1 && (…)}` — Personal information |
| 433-467 | `{step === 2 && (…)}` — Project information |
| 470-508 | `{step === 3 && (…)}` — Project plan |
| 511-598 | `{step === 4 && (…)}` — Required budget, live total, error panels |

Copy them in that order, unchanged — every label, placeholder, hint, `rows`
count and Tailwind class exactly as it is. The surrounding page chrome
(lines 317-333 and the `SEOHead`) stays behind in `SubmitProposal.tsx`; only
these five blocks move.

Three edits, and only these three:

1. **The email field** (source line 419-421) gains the lock and its
   explanation — replace it with the version below.
2. **The submit button** (source line 593-595) reads `{submitLabel}` and calls
   `onSubmit(buildProposalPayload(form, smsConsent))` — the version below.
3. **`Field`** gains an `htmlFor`, so `getByLabelText` can find the controls —
   the version below.

The email field in step 1 becomes:

```tsx
              <Field
                label="Email"
                required
                hint={emailLocked ? 'Contact us if you need to change the email on your application.' : undefined}
              >
                <input
                  required
                  type="email"
                  id="proposal-email"
                  value={form.email}
                  disabled={emailLocked}
                  onChange={(e) => set('email')(e.target.value)}
                  className={`input-field ${emailLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                />
              </Field>
```

`Field` must associate its label with the control so `getByLabelText` finds it —
today it renders a bare `<label>`. Give it an `htmlFor`:

```tsx
const Field = ({ label, required, children, hint, htmlFor }: { label: string; required?: boolean; children: React.ReactNode; hint?: string; htmlFor?: string }) => (
  <div>
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
)
```

and pass `htmlFor="proposal-email"` on the email field. The step-4 submit button
becomes:

```tsx
              <button
                onClick={() => onSubmit(buildProposalPayload(form, smsConsent))}
                disabled={!canSubmit || submitting}
                className="px-8 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center gap-2"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                  : <><Send className="w-4 h-4" /> {submitLabel}</>}
              </button>
```

- [ ] **Step 4: Reduce `SubmitProposal.tsx` to a shell**

```tsx
/**
 * Public project-proposal submission page.
 *
 * The form itself lives in components/proposals/ProposalForm — the portal at
 * /my-proposals drives the same component in "revise" mode. This page only
 * owns the chrome, the POST, and the success screen.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import SEOHead from '../components/SEOHead'
import ProposalForm, {
  buildProposalPayload, parseFieldErrors,
} from '../components/proposals/ProposalForm'
import type { FieldError } from '../components/proposals/ProposalForm'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SubmitProposal = () => {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ id: number; email: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([])
  const [genericError, setGenericError] = useState('')

  const handleSubmit = async (payload: ReturnType<typeof buildProposalPayload>) => {
    setSubmitting(true); setGenericError(''); setFieldErrors([])
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Submission failed' }))
        const parsed = parseFieldErrors(err.detail)
        if (parsed.length) { setFieldErrors(parsed); return }
        setGenericError(typeof err.detail === 'string' ? err.detail : 'Please check your entries and try again.')
        return
      }
      const data = await resp.json()
      setSubmitted({ id: data.id, email: payload.email })
    } catch (exc: any) {
      setGenericError(exc?.message || 'Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 py-16">
        <SEOHead title="Proposal Submitted" description="Your project proposal has been received." canonicalPath="/submit-proposal" />
        <div className="section-container">
          <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-8 sm:p-10 text-center">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-9 h-9 text-green-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-3">Proposal received</h1>
            <p className="text-gray-600 leading-relaxed mb-6">
              Thank you for submitting your project proposal. Our review team will study your
              request and get back to you at <strong>{submitted.email}</strong>.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Reference number: <strong>#{submitted.id}</strong>
            </p>
            <p className="text-sm text-gray-600 mb-8">
              You can check its status at any time from{' '}
              <Link to="/my-proposals" className="text-primary-700 font-medium hover:underline">
                My proposals
              </Link>{' '}
              — we will email you a sign-in code, no account needed.
            </p>
            <button onClick={() => navigate('/')} className="inline-block bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors">
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <SEOHead
        title="Submit a Project Proposal"
        description="Apply for funding support from the Zakat Distribution Foundation. Fill in the four-section form to describe your project, its beneficiaries, plan, and budget."
        canonicalPath="/submit-proposal"
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="text-center">
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-4"><ArrowLeft className="w-4 h-4" /> Back to Home</Link>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900">Submit a Project Proposal</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
            Apply for funding support from the <strong>Zakat Distribution Foundation</strong>. Four short sections —
            we'll email you a copy and follow up after review.
          </p>
        </div>

        <ProposalForm
          mode="create"
          onSubmit={handleSubmit}
          submitting={submitting}
          fieldErrors={fieldErrors}
          genericError={genericError}
        />
      </div>
    </div>
  )
}

export default SubmitProposal
```

- [ ] **Step 5: Run the component tests**

Run: `cd frontend && npx vitest run src/components/proposals`
Expected: 13 passed.

- [ ] **Step 6: Run the full frontend suite and the type check**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green, no type errors, no lint warnings.

- [ ] **Step 7: Check the page actually shrank**

Run: `wc -l frontend/src/pages/SubmitProposal.tsx frontend/src/components/proposals/ProposalForm.tsx`
Expected: the page around 120 lines (down from 604), the component around 520.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/proposals frontend/src/pages/SubmitProposal.tsx
git commit -m "Extract the proposal form so the portal can reuse it"
```

---

## Task 12: The submitter portal page

**Files:**
- Create: `frontend/src/utils/proposalPortalApi.ts`
- Create: `frontend/src/pages/MyProposals.tsx`
- Modify: `frontend/src/App.tsx:69` and `frontend/src/App.tsx:154`
- Modify: `frontend/src/components/Footer.tsx:96-100`
- Test: `frontend/src/utils/__tests__/proposalPortalApi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/__tests__/proposalPortalApi.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  PORTAL_TOKEN_KEY, clearPortalToken, hasPortalToken, portalApi,
  requestPortalCode, verifyPortalCode,
} from '../proposalPortalApi'

describe('proposalPortalApi', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('keeps its token in sessionStorage, never in localStorage', async () => {
    vi.spyOn(portalApi, 'post').mockResolvedValue({ data: { token: 'portal-token', expires_in: 1800 } })

    await verifyPortalCode('amina@example.com', '123456')

    expect(sessionStorage.getItem(PORTAL_TOKEN_KEY)).toBe('portal-token')
    expect(localStorage.getItem('auth_token')).toBeNull()
  })

  it('never reads the staff token', async () => {
    localStorage.setItem('auth_token', 'staff-token')

    const config = await (portalApi.interceptors.request as any).handlers[0].fulfilled({ headers: {} })

    expect(config.headers.Authorization).toBeUndefined()
  })

  it('attaches its own token once it has one', async () => {
    sessionStorage.setItem(PORTAL_TOKEN_KEY, 'portal-token')

    const config = await (portalApi.interceptors.request as any).handlers[0].fulfilled({ headers: {} })

    expect(config.headers.Authorization).toBe('Bearer portal-token')
  })

  it('is a different axios instance from the shared client', () => {
    expect(portalApi).not.toBe(axios)
    expect(portalApi.defaults.withCredentials).toBeFalsy()
  })

  it('reports and clears its session', () => {
    expect(hasPortalToken()).toBe(false)
    sessionStorage.setItem(PORTAL_TOKEN_KEY, 'portal-token')
    expect(hasPortalToken()).toBe(true)
    clearPortalToken()
    expect(hasPortalToken()).toBe(false)
  })

  it('asks for a code by email', async () => {
    const post = vi.spyOn(portalApi, 'post').mockResolvedValue({ data: { message: 'ok' } })

    await requestPortalCode('amina@example.com')

    expect(post).toHaveBeenCalledWith('/api/project-proposals/portal/request-code', {
      email: 'amina@example.com',
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/utils/__tests__/proposalPortalApi.test.ts`
Expected: FAIL — `Failed to resolve import "../proposalPortalApi"`

- [ ] **Step 3: Create `frontend/src/utils/proposalPortalApi.ts`**

```ts
/**
 * HTTP client for the submitter portal — deliberately isolated from utils/api.
 *
 * The shared client attaches localStorage `auth_token` to every request and, on
 * a 401, clears that token and redirects. A submitter has no staff session, and
 * a staff member using the portal must not have theirs destroyed by an expired
 * six-digit-code session. So this is its own axios instance with its own token,
 * in sessionStorage: the portal session dies with the tab, which is the right
 * lifetime for a passwordless login.
 */
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const PORTAL_BASE = '/api/project-proposals/portal'

export const PORTAL_TOKEN_KEY = 'proposal_portal_token'

export const portalApi = axios.create({ baseURL: API_BASE_URL })

portalApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(PORTAL_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const hasPortalToken = (): boolean => Boolean(sessionStorage.getItem(PORTAL_TOKEN_KEY))
export const clearPortalToken = (): void => sessionStorage.removeItem(PORTAL_TOKEN_KEY)

export interface PortalProposal {
  id: number
  project_name: string | null
  status: string
  editable: boolean
  submitted_at: string
  updated_at: string
  version_no: number | null
  decision_comment: string | null
  content: Record<string, unknown>
}

export const requestPortalCode = async (email: string): Promise<{ message: string }> => {
  const { data } = await portalApi.post(`${PORTAL_BASE}/request-code`, { email })
  return data
}

export const verifyPortalCode = async (email: string, code: string): Promise<void> => {
  const { data } = await portalApi.post(`${PORTAL_BASE}/verify-code`, { email, code })
  sessionStorage.setItem(PORTAL_TOKEN_KEY, data.token)
}

export const fetchMyProposals = async (): Promise<PortalProposal[]> => {
  const { data } = await portalApi.get(`${PORTAL_BASE}/me`)
  return data.items || []
}

export const submitRevision = async (
  proposalId: number, payload: Record<string, unknown>,
): Promise<PortalProposal> => {
  const { data } = await portalApi.put(`${PORTAL_BASE}/${proposalId}`, payload)
  return data
}
```

- [ ] **Step 4: Create `frontend/src/pages/MyProposals.tsx`**

```tsx
/**
 * The submitter's space: check a proposal's status, and revise the ones the
 * review team sent back. No account — an emailed six-digit code is the login.
 *
 * Four views, one state machine: email → code → list → edit.
 *
 * The `edit` view is where the 30-minute token can expire mid-form. A 401 on
 * submit does NOT unmount the form and does NOT discard what was typed: it
 * shows the code step over it, and the pending payload is resubmitted once a
 * fresh token arrives.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, CheckCircle2, Clock, FileText, Loader2, Mail, XCircle,
} from 'lucide-react'
import SEOHead from '../components/SEOHead'
import ProposalForm, {
  buildProposalPayload, parseFieldErrors,
} from '../components/proposals/ProposalForm'
import type { FieldError, ProposalFormValues } from '../components/proposals/ProposalForm'
import {
  clearPortalToken, fetchMyProposals, requestPortalCode, submitRevision, verifyPortalCode,
} from '../utils/proposalPortalApi'
import type { PortalProposal } from '../utils/proposalPortalApi'

type View = 'email' | 'code' | 'list' | 'edit'

const STATUS_STYLE: Record<string, { badge: string; label: string; icon: any }> = {
  submitted:         { badge: 'bg-blue-100 text-blue-800',   label: 'Submitted',         icon: Clock },
  under_review:      { badge: 'bg-amber-100 text-amber-800', label: 'Under review',      icon: Clock },
  changes_requested: { badge: 'bg-amber-100 text-amber-900', label: 'Changes requested', icon: AlertCircle },
  approved:          { badge: 'bg-green-100 text-green-800', label: 'Approved',          icon: CheckCircle2 },
  rejected:          { badge: 'bg-red-100 text-red-800',     label: 'Not funded',        icon: XCircle },
}

/** The portal returns content as the API spells it; the form wants strings. */
const toFormValues = (content: Record<string, unknown>): Partial<ProposalFormValues> => {
  const out: Record<string, string> = {}
  Object.entries(content).forEach(([key, value]) => {
    out[key] = value === null || value === undefined ? '' : String(value)
  })
  return out as Partial<ProposalFormValues>
}

const MyProposals = () => {
  const [view, setView] = useState<View>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [items, setItems] = useState<PortalProposal[]>([])
  const [editing, setEditing] = useState<PortalProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([])
  // Held across a mid-edit re-authentication so nothing typed is lost.
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null)

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })

  const loadList = async () => {
    setBusy(true); setError('')
    try {
      setItems(await fetchMyProposals())
      setView('list')
    } catch {
      setError('Your session has expired. Please sign in again.')
      clearPortalToken()
      setView('email')
    } finally {
      setBusy(false)
    }
  }

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const { message } = await requestPortalCode(email.trim())
      setNotice(message)
      setView('code')
    } catch (exc: any) {
      setError(exc?.response?.status === 429
        ? 'Too many codes requested. Please wait a few minutes and try again.'
        : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await verifyPortalCode(email.trim(), code.trim())
      setCode('')
      // A code entered to rescue an expired session resumes the submission.
      if (pendingPayload && editing) {
        await handleRevision(pendingPayload as any, { resumed: true })
        return
      }
      await loadList()
    } catch {
      setError('That code is not valid. Check it, or request a new one.')
      setBusy(false)
    }
  }

  const handleRevision = async (
    payload: ReturnType<typeof buildProposalPayload>,
    opts: { resumed?: boolean } = {},
  ) => {
    if (!editing) return
    setBusy(true); setError(''); setFieldErrors([])
    try {
      await submitRevision(editing.id, payload)
      setPendingPayload(null)
      setEditing(null)
      setNotice('Your updated proposal has been sent to the review team.')
      await loadList()
    } catch (exc: any) {
      const status = exc?.response?.status
      if (status === 401) {
        // Keep the form and its values mounted; ask for a fresh code over it.
        setPendingPayload(payload)
        setNotice('Your sign-in expired. Enter a new code and we will send your changes.')
        await requestPortalCode(email.trim()).catch(() => undefined)
        setView('code')
        return
      }
      if (status === 422) {
        setFieldErrors(parseFieldErrors(exc?.response?.data?.detail))
        return
      }
      setError(status === 409
        ? 'This proposal is no longer open for changes.'
        : 'We could not send your changes. Please try again.')
      if (opts.resumed) setView('edit')
    } finally {
      setBusy(false)
    }
  }

  const startEditing = (proposal: PortalProposal) => {
    setEditing(proposal)
    setFieldErrors([])
    setError(''); setNotice('')
    setView('edit')
  }

  useEffect(() => { setError(''); }, [view])

  return (
    <div className="min-h-screen bg-gray-50 py-8 sm:py-12">
      <SEOHead
        title="My Proposals"
        description="Check the status of the project proposals you submitted to MyZakat, and update the ones our review team sent back."
        canonicalPath="/my-proposals"
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="text-center">
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-gray-900">My proposals</h1>
          <p className="text-gray-600 mt-2 max-w-2xl mx-auto">
            Check where your funding requests stand, and update the ones our review team asked you
            to change. No account needed — we email you a code.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
          </div>
        )}
        {notice && !error && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 flex items-start gap-2">
            <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{notice}</span>
          </div>
        )}

        {view === 'email' && (
          <form onSubmit={handleRequestCode} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 max-w-md mx-auto space-y-4">
            <label htmlFor="portal-email" className="block text-sm font-medium text-gray-700">
              The email address you applied with
            </label>
            <input
              id="portal-email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field" placeholder="you@example.com"
            />
            <button type="submit" disabled={busy || !email.trim()}
              className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Email me a code'}
            </button>
          </form>
        )}

        {view === 'code' && (
          <form onSubmit={handleVerifyCode} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 max-w-md mx-auto space-y-4">
            <label htmlFor="portal-code" className="block text-sm font-medium text-gray-700">
              Enter the six-digit code we sent to {email}
            </label>
            <input
              id="portal-code" inputMode="numeric" autoComplete="one-time-code" required
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input-field text-center text-2xl tracking-[0.5em] font-semibold"
              placeholder="000000"
            />
            <button type="submit" disabled={busy || code.length < 6}
              className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white font-semibold rounded-lg inline-flex items-center justify-center gap-2">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</> : 'Continue'}
            </button>
            <button type="button" onClick={() => { setView('email'); setCode('') }}
              className="w-full text-sm text-gray-500 hover:text-gray-800">
              Use a different email address
            </button>
          </form>
        )}

        {view === 'list' && (
          <div className="space-y-4">
            {items.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
                <FileText className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                No proposals found for this address.{' '}
                <Link to="/submit-proposal" className="text-primary-700 font-medium hover:underline">
                  Submit one
                </Link>.
              </div>
            )}
            {items.map((p) => {
              const style = STATUS_STYLE[p.status] || { badge: 'bg-gray-100 text-gray-800', label: p.status, icon: Clock }
              const Icon = style.icon
              return (
                <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-gray-900 truncate">{p.project_name}</h2>
                      <p className="text-xs text-gray-500">
                        Reference #{p.id} · submitted {formatDate(p.submitted_at)}
                        {p.version_no && p.version_no > 1 ? ` · version ${p.version_no}` : ''}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${style.badge}`}>
                      <Icon className="w-3.5 h-3.5" /> {style.label}
                    </span>
                  </div>

                  {p.decision_comment && (
                    <div className="bg-gray-50 border-l-4 border-gray-300 rounded-r p-3 text-sm text-gray-800">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Message from the review team
                      </div>
                      <p className="whitespace-pre-wrap">{p.decision_comment}</p>
                    </div>
                  )}

                  {p.editable && (
                    <button onClick={() => startEditing(p)}
                      className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg">
                      Fix and resubmit
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {view === 'edit' && editing && (
          <div className="space-y-4">
            <button onClick={() => { setEditing(null); setView('list') }}
              className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Back to my proposals
            </button>
            {editing.decision_comment && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
                <div className="font-semibold mb-1">What the review team asked for</div>
                <p className="whitespace-pre-wrap">{editing.decision_comment}</p>
              </div>
            )}
            <ProposalForm
              mode="revise"
              initialValues={toFormValues(editing.content)}
              onSubmit={handleRevision}
              submitting={busy}
              fieldErrors={fieldErrors}
              genericError=""
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default MyProposals
```

- [ ] **Step 5: Add the route in `frontend/src/App.tsx`**

Next to the existing lazy import on line 69:

```tsx
const MyProposals = lazy(() => import('./pages/MyProposals'))
```

and next to the route on line 154:

```tsx
                <Route path="my-proposals" element={<MyProposals />} />
```

- [ ] **Step 6: Link it from the footer**

In `frontend/src/components/Footer.tsx`, after the "Submit a Project Proposal"
item (line 96-100):

```tsx
              <li>
                <Link to="/my-proposals" className="text-gray-300 hover:text-white transition-colors duration-200 inline-block">
                  My Proposals
                </Link>
              </li>
```

- [ ] **Step 7: Run the tests**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green. The existing `Footer.test.tsx` may assert a link count —
update it to expect the new entry if so.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/utils/proposalPortalApi.ts frontend/src/utils/__tests__/proposalPortalApi.test.ts \
        frontend/src/pages/MyProposals.tsx frontend/src/App.tsx frontend/src/components/Footer.tsx
git commit -m "Add the submitter portal page and its isolated API client"
```

---

## Task 13: Version history and the two-field decision in the admin console

**Files:**
- Modify: `frontend/src/pages/admin/AdminProjectProposals.tsx`

- [ ] **Step 1: Extend the `Proposal` interface and the status maps**

At the top of the file, add the new fields to `Proposal` (line 15-50) and a
`ProposalVersionSummary` beside it:

```tsx
interface ProposalVersionSummary {
  id: number
  version_no: number
  submitted_at: string
  submitted_ip: string | null
  decision: string | null
  decision_comment: string | null
  internal_note: string | null
  decided_at: string | null
  decided_by: number | null
}

interface Proposal {
  // …every existing field except admin_notes, which is replaced by the two below…
  decision_comment: string | null
  internal_note: string | null
  version_count: number
  current_version_no: number | null
  versions: ProposalVersionSummary[]
}
```

Delete `admin_notes` from the interface: the API no longer returns it.

Then add the new status to both maps (line 52-63):

```tsx
const STATUS_BADGE: Record<string, string> = {
  submitted:         'bg-blue-100 text-blue-800',
  under_review:      'bg-amber-100 text-amber-800',
  changes_requested: 'bg-orange-100 text-orange-900',
  approved:          'bg-green-100 text-green-800',
  rejected:          'bg-red-100 text-red-800',
}
const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
}
// Statuses the applicant must be given a reason for — the backend enforces
// this too (400 without a comment); mirroring it here keeps the reviewer from
// losing a click.
const COMMENT_REQUIRED = new Set(['rejected', 'changes_requested'])
```

Add `changes_requested` to the filter `<select>` (line 171-177):

```tsx
            <option value="changes_requested">Changes requested</option>
```

- [ ] **Step 2: Replace the notes state with the two-field decision state**

Replace `const [notesDraft, setNotesDraft] = useState('')` (line 73) with:

```tsx
  // The message the applicant receives, and the note only staff ever see.
  const [commentDraft, setCommentDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [openVersion, setOpenVersion] = useState<number | null>(null)
  const [versionDetail, setVersionDetail] = useState<Record<string, any> | null>(null)
```

and `openDetail` / `closeDetail` (line 93-97):

```tsx
  const openDetail = (p: Proposal) => {
    setSelected(p)
    setCommentDraft(p.decision_comment || '')
    setNoteDraft(p.internal_note || '')
    setOpenVersion(null)
    setVersionDetail(null)
  }
  const closeDetail = () => {
    setSelected(null)
    setCommentDraft(''); setNoteDraft('')
    setOpenVersion(null); setVersionDetail(null)
  }
```

- [ ] **Step 3: Send both fields, and refuse a reason-less decision client-side**

Replace `changeStatus` and `saveNotes` (line 99-127) with:

```tsx
  const patchStatus = async (nextStatus: string, successMessage: string) => {
    if (!selected) return
    if (COMMENT_REQUIRED.has(nextStatus) && !commentDraft.trim()) {
      showError('A message is required', 'Tell the applicant why — it goes out in the email.')
      return
    }
    try {
      const resp = await fetch(`${API_URL}/api/project-proposals/${selected.id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          decision_comment: commentDraft.trim() || null,
          internal_note: noteDraft.trim() || null,
        }),
      })
      if (resp.ok) {
        const updated = await resp.json()
        setSelected(updated)
        setCommentDraft(updated.decision_comment || '')
        setNoteDraft(updated.internal_note || '')
        showSuccess('Updated', successMessage)
        fetchRows()
      } else {
        const err = await resp.json().catch(() => ({}))
        showError('Error', err.detail || 'Failed to update status')
      }
    } catch { showError('Error', 'Network error') }
  }

  const changeStatus = (nextStatus: string) =>
    patchStatus(
      nextStatus,
      COMMENT_REQUIRED.has(nextStatus)
        ? `Marked as ${STATUS_LABEL[nextStatus]} — the applicant has been emailed.`
        : `Marked as ${STATUS_LABEL[nextStatus]}`,
    )

  // Same endpoint, same status: saves the drafts without re-notifying anyone.
  const saveNotes = () => {
    if (!selected) return
    patchStatus(selected.status, 'Notes saved')
  }

  const loadVersion = async (versionNo: number) => {
    if (!selected) return
    if (openVersion === versionNo) { setOpenVersion(null); setVersionDetail(null); return }
    setOpenVersion(versionNo); setVersionDetail(null)
    try {
      const resp = await fetch(
        `${API_URL}/api/project-proposals/${selected.id}/versions/${versionNo}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!resp.ok) throw new Error('fetch failed')
      setVersionDetail(await resp.json())
    } catch { showError('Error', 'Could not load that version') }
  }

  const downloadVersionPdf = async (p: Proposal, versionNo: number) => {
    try {
      const resp = await fetch(
        `${API_URL}/api/project-proposals/${p.id}/versions/${versionNo}/pdf`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!resp.ok) throw new Error('PDF fetch failed')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `proposal-${p.id}-v${versionNo}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { showError('Error', 'Could not download PDF') }
  }
```

- [ ] **Step 4: Show the version count in the list**

In the "Project" cell (line 214-217), under the reference:

```tsx
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-gray-900 max-w-[280px] truncate" title={r.project_name}>{r.project_name}</div>
                    <div className="text-xs text-gray-500">
                      Ref #{r.id}
                      {r.version_count > 1 && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                          v{r.current_version_no} · {r.version_count} versions
                        </span>
                      )}
                    </div>
                  </td>
```

- [ ] **Step 5: Replace the "Admin notes" section with history and two fields**

Replace the whole `<Section title="Admin notes">` block (line 317-328) with:

```tsx
              {/* Version history */}
              <Section title={`Version history (${selected.version_count})`}>
                <ol className="space-y-2">
                  {[...selected.versions].reverse().map((v) => {
                    const isCurrent = v.version_no === selected.current_version_no
                    return (
                      <li key={v.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-gray-50">
                          <div className="text-sm">
                            <span className="font-semibold text-gray-900">Version {v.version_no}</span>
                            {isCurrent && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-primary-100 text-primary-800 font-medium">current</span>}
                            <span className="text-xs text-gray-500 ml-2">submitted {formatDate(v.submitted_at)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${v.decision ? STATUS_BADGE[v.decision] : 'bg-gray-100 text-gray-600'}`}>
                              {v.decision ? STATUS_LABEL[v.decision] : 'Awaiting review'}
                            </span>
                            <button onClick={() => loadVersion(v.version_no)}
                              className="text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50">
                              {openVersion === v.version_no ? 'Hide' : 'View content'}
                            </button>
                            <button onClick={() => downloadVersionPdf(selected, v.version_no)}
                              className="text-xs inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded">
                              <Download className="w-3 h-3" /> PDF
                            </button>
                          </div>
                        </div>

                        {(v.decision_comment || v.internal_note) && (
                          <div className="px-3 py-2 space-y-2 text-sm border-t border-gray-100">
                            {v.decision_comment && (
                              <div>
                                <div className="text-xs text-gray-500">Sent to the applicant{v.decided_at ? ` on ${formatDate(v.decided_at)}` : ''}</div>
                                <p className="text-gray-800 whitespace-pre-wrap">{v.decision_comment}</p>
                              </div>
                            )}
                            {v.internal_note && (
                              <div>
                                <div className="text-xs text-gray-500">Internal note</div>
                                <p className="text-gray-800 whitespace-pre-wrap">{v.internal_note}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {openVersion === v.version_no && (
                          <div className="px-3 py-3 border-t border-gray-100 bg-white">
                            {!versionDetail ? (
                              <p className="text-sm text-gray-500">Loading…</p>
                            ) : (
                              <div className="space-y-3">
                                <Paragraph label="Project name" text={versionDetail.project_name} />
                                <Paragraph label="Description" text={versionDetail.project_description} />
                                <Paragraph label="Problem solved" text={versionDetail.problem_solved} />
                                <Paragraph label="Target beneficiaries" text={versionDetail.target_beneficiaries} />
                                <Paragraph label="Community impact" text={versionDetail.community_impact} />
                                <Paragraph label="Expected impact" text={versionDetail.expected_impact} />
                                <Paragraph label="Implementation steps" text={versionDetail.implementation_steps} bullets />
                                <Paragraph label="Location" text={versionDetail.implementation_location} />
                                <Paragraph label="Required materials" text={versionDetail.required_materials} bullets />
                                <Paragraph label="Expected duration" text={versionDetail.expected_duration} />
                                <Paragraph label="Continuity plan" text={versionDetail.continuity_plan} />
                                <Paragraph label="Feasibility" text={versionDetail.feasibility} />
                                <Paragraph label="Expected challenges" text={versionDetail.expected_challenges} bullets />
                                <Paragraph label="Total requested" text={`$${Number(versionDetail.total_amount_usd).toLocaleString()} USD`} />
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </Section>

              {/* Decision */}
              <Section title="Decision">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message to the applicant
                    <span className="text-gray-400 font-normal"> — goes out in the email</span>
                  </label>
                  <textarea rows={4} value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="What you want them to know: the reason for the decision, or exactly what to change."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
                  <p className="text-xs text-gray-500 mt-1">
                    Required to reject or request changes.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Internal note
                    <span className="text-gray-400 font-normal"> — staff only, never sent</span>
                  </label>
                  <textarea rows={3} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Context for your colleagues."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="flex justify-end">
                  <button onClick={saveNotes} className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded">
                    Save without notifying
                  </button>
                </div>
                {selected.reviewed_at && (
                  <p className="text-xs text-gray-500">Last reviewed on {formatDate(selected.reviewed_at)}</p>
                )}
              </Section>
```

- [ ] **Step 6: Add the "Request changes" action**

In the status action bar (line 332-337), between "Mark under review" and
"Reject":

```tsx
              <button onClick={() => changeStatus('changes_requested')} className="text-sm px-3 py-2 bg-orange-100 hover:bg-orange-200 text-orange-900 rounded inline-flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" /> Request changes
              </button>
```

`AlertTriangle` is already imported for the delete dialog.

- [ ] **Step 7: Type-check, lint and test**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all green. A type error on `admin_notes` means a reference to the
removed field was missed.

- [ ] **Step 8: Verify the console against the real stack**

Run: `docker compose up -d` and open `http://localhost:3000/admin/project-proposals`.
Check, on the seeded legacy proposal from Task 2:
1. the row shows `Ref #…` with no version badge (one version);
2. the drawer's "Version history (1)" lists version 1, marked `current`, badged
   `Rejected`, with the migrated admin note under "Internal note";
3. "View content" expands the frozen content, and "PDF" downloads
   `proposal-<id>-v1.pdf`;
4. clicking "Reject" with an empty message shows the error toast and sends no
   request.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/admin/AdminProjectProposals.tsx
git commit -m "Show proposal version history and split the reviewer's comment in two"
```

---

## Task 14: End-to-end — the whole loop

**Files:**
- Create: `e2e/proposal-versioning.spec.ts`

The one-time code only exists in the database, so the spec reads it with `psql`
through `docker compose`, the same way the integration tests assume the stack is
up. Like `e2e/media-workspaces.spec.ts`, it skips rather than fails when its
prerequisites are missing, so a missing admin credential shows up as a skip and
does not block deploys.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, Page } from '@playwright/test'
import { execFileSync } from 'child_process'

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PASSWORD! }
const HAS_CREDENTIALS = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)

// A unique address per run: proposals are never deleted by this spec, so a
// fixed address would accumulate dossiers and make the portal list ambiguous.
const APPLICANT = `e2e-proposal-${Date.now()}@example.com`

/** Read the newest live sign-in code for an address straight from Postgres.
 *
 * The code is only ever emailed and only ever stored as a bcrypt hash, so it
 * cannot be recovered — this reads the plaintext that `sql()` below plants
 * instead: we overwrite the hash with one of a known code. That keeps the test
 * honest about the verification path (it really exchanges a code for a token)
 * without needing a mail server. */
function sql(statement: string): string {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'myzakat', '-t', '-A', '-c', statement],
    { encoding: 'utf8' },
  ).trim()
}

/** bcrypt hash of "424242", generated once with the backend's own hasher. */
const KNOWN_CODE = '424242'

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

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByPlaceholder(/enter your email/i).fill(user.email)
  await page.getByPlaceholder(/enter your password/i).fill(user.password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL('/')
  await page.goto('/admin')
}

async function fillProposal(page: Page, projectName: string) {
  // Step 1
  await page.getByLabel('Full name').fill('E2E Applicant')
  await page.getByLabel('National ID number').fill('ID-E2E-001')
  await page.getByLabel('Date of birth (year)').fill('1990')
  await page.getByLabel('Place of residence').fill('Sanaa')
  await page.getByLabel('Mobile number').fill('+967700000001')
  await page.getByLabel(/^email/i).fill(APPLICANT)
  await page.getByLabel('Educational level').fill('BSc Agriculture')
  await page.getByRole('button', { name: /continue/i }).click()
  // Step 2
  await page.getByLabel('Project name').fill(projectName)
  await page.getByLabel('Project idea description').fill('Monthly food parcels for displaced families.')
  await page.getByLabel(/what problem does the project solve/i).fill('Families cannot afford fresh protein.')
  await page.getByLabel('Target beneficiaries').fill('200 displaced families')
  await page.getByLabel(/how will the project serve the community/i).fill('Local butchers supply the parcels.')
  await page.getByLabel(/expected economic or social impact/i).fill('Better nutrition for 1200 people.')
  await page.getByRole('button', { name: /continue/i }).click()
  // Step 3
  await page.getByLabel('Implementation steps').fill('Identify families\nBuy supplies\nDistribute')
  await page.getByLabel(/where will the project be implemented/i).fill('Sanaa, Old City district')
  await page.getByLabel(/required materials/i).fill('Chicken\nPackaging\nTransport')
  await page.getByLabel(/expected duration/i).fill('Two weeks after funding')
  await page.getByLabel(/how will the project continue/i).fill('Local committee takes over procurement.')
  await page.getByLabel(/why is it feasible/i).fill('Suppliers already identified and quoted.')
  await page.getByLabel(/expected challenges/i).fill('Crowding: allocate time slots')
  await page.getByRole('button', { name: /continue/i }).click()
  // Step 4
  await page.getByLabel(/beneficiaries \(count\)/i).fill('200')
  await page.getByLabel(/cost per unit/i).fill('20')
  await page.getByLabel('Unit type').fill('family')
}

test.describe('proposal versioning', () => {
  test.skip(!HAS_CREDENTIALS, 'needs E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD and a running docker stack')

  test('a sent-back proposal is revised through the portal and keeps its history', async ({ page }) => {
    // ── The applicant submits ────────────────────────────────────────
    await page.goto('/submit-proposal')
    await fillProposal(page, 'E2E Food Parcels')
    await page.getByRole('button', { name: /submit proposal/i }).click()
    await expect(page.getByRole('heading', { name: /proposal received/i })).toBeVisible()
    const reference = await page.getByText(/reference number/i).innerText()
    const proposalId = reference.match(/#(\d+)/)![1]

    // ── The reviewer asks for changes ────────────────────────────────
    await login(page, ADMIN)
    await page.goto('/admin/project-proposals')
    await page.getByTitle('Review').first().click()
    await page.getByPlaceholder(/what you want them to know/i)
      .fill('Please detail the transport costs.')
    await page.getByRole('button', { name: /request changes/i }).click()
    await expect(page.getByText(/changes requested/i).first()).toBeVisible()

    // ── The applicant signs in with a code and revises ───────────────
    await page.goto('/logout').catch(() => undefined)
    await page.context().clearCookies()
    await page.goto('/my-proposals')
    await page.getByLabel(/email address you applied with/i).fill(APPLICANT)
    await page.getByRole('button', { name: /email me a code/i }).click()
    await expect(page.getByLabel(/six-digit code/i)).toBeVisible()

    plantKnownCode(APPLICANT)
    await page.getByLabel(/six-digit code/i).fill(KNOWN_CODE)
    await page.getByRole('button', { name: /continue/i }).click()

    await expect(page.getByText('E2E Food Parcels')).toBeVisible()
    await expect(page.getByText('Please detail the transport costs.')).toBeVisible()
    await page.getByRole('button', { name: /fix and resubmit/i }).click()

    // The email is locked, and the form is prefilled with version 1.
    await expect(page.getByLabel(/^email/i)).toBeDisabled()
    await expect(page.getByLabel(/^email/i)).toHaveValue(APPLICANT)
    await page.getByLabel('Project name').fill('E2E Food Parcels (revised)')
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /continue/i }).click()
    await page.getByRole('button', { name: /resubmit proposal/i }).click()
    await expect(page.getByText(/sent to the review team/i)).toBeVisible()
    await expect(page.getByText(/^Submitted$/)).toBeVisible()

    // ── The reviewer sees both versions ──────────────────────────────
    await login(page, ADMIN)
    await page.goto('/admin/project-proposals')
    await page.getByTitle('Review').first().click()
    await expect(page.getByText('Version history (2)')).toBeVisible()
    await expect(page.getByText('Version 2')).toBeVisible()
    await expect(page.getByText('Version 1')).toBeVisible()
    await expect(page.getByText('Please detail the transport costs.')).toBeVisible()

    // Version 1 still holds the original title — the history is real.
    await page.getByRole('button', { name: /view content/i }).last().click()
    await expect(page.getByText('E2E Food Parcels', { exact: true })).toBeVisible()

    // And the dossier's own count matches what the database holds.
    expect(sql(`SELECT count(*) FROM proposal_versions WHERE proposal_id = ${proposalId};`)).toBe('2')
  })

  test('a rejected proposal cannot be revised', async ({ page }) => {
    const rejected = `e2e-rejected-${Date.now()}@example.com`

    await page.goto('/submit-proposal')
    await fillProposal(page, 'E2E Rejected Project')
    await page.getByLabel(/^email/i).fill(rejected).catch(() => undefined)
    await page.getByRole('button', { name: /submit proposal/i }).click()
    await expect(page.getByRole('heading', { name: /proposal received/i })).toBeVisible()

    await login(page, ADMIN)
    await page.goto('/admin/project-proposals')
    await page.getByTitle('Review').first().click()
    await page.getByPlaceholder(/what you want them to know/i).fill('Outside this cycle.')
    await page.getByRole('button', { name: /^reject$/i }).click()

    await page.context().clearCookies()
    await page.goto('/my-proposals')
    await page.getByLabel(/email address you applied with/i).fill(APPLICANT)
    await page.getByRole('button', { name: /email me a code/i }).click()
    plantKnownCode(APPLICANT)
    await page.getByLabel(/six-digit code/i).fill(KNOWN_CODE)
    await page.getByRole('button', { name: /continue/i }).click()

    await expect(page.getByText(/not funded/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /fix and resubmit/i })).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Bring the stack up**

Run: `docker compose up -d`
Expected: `docker compose ps` shows db, backend and frontend healthy.

- [ ] **Step 3: Run the spec**

Run: `E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npx playwright test e2e/proposal-versioning.spec.ts`
Expected: 2 passed. Without the credentials it must report 2 skipped, not
failures — verify both.

- [ ] **Step 4: Commit**

```bash
git add e2e/proposal-versioning.spec.ts
git commit -m "E2E: submit, request changes, revise through the portal"
```

---

## Task 15: Documentation

The repo's docs are read as the source of truth for the API and the data model;
leaving them describing the pre-versioning shape makes them worse than absent.

**Files:**
- Modify: `docs/API.md`
- Modify: `docs/SPECIFICATIONS.md`
- Modify: `README.md`

- [ ] **Step 1: Find what the docs currently claim**

Run: `grep -n "proposal" -i docs/API.md docs/SPECIFICATIONS.md README.md`
Expected: the existing proposal endpoints and the feature description. Note the
line numbers and the surrounding format before editing.

- [ ] **Step 2: Update `docs/API.md`**

In the project-proposals section, follow the file's existing table or heading
convention and document:

- `POST /api/project-proposals/` — unchanged body, response now also carries
  `version_no`; always opens a new dossier.
- `GET /api/project-proposals/` — items gain `version_count`,
  `current_version_no`, `decision_comment`, `internal_note`; `status_filter`
  accepts `changes_requested`.
- `GET /api/project-proposals/{id}` — adds `versions[]`.
- `GET /api/project-proposals/{id}/versions/{n}` and `…/versions/{n}/pdf` — new.
- `PATCH /api/project-proposals/{id}/status` — body is now
  `{status, decision_comment?, internal_note?}`; `admin_notes` is gone;
  `decision_comment` is required for `rejected` and `changes_requested`; a
  status change emails the applicant.
- `POST /api/project-proposals/portal/request-code` — 202 always, 429 over the
  limit (3/email/15min, 10/IP/hour).
- `POST /api/project-proposals/portal/verify-code` — returns a 30-minute portal
  token; note that it is not a staff session and is rejected by every admin
  route.
- `GET /api/project-proposals/portal/me` and `PUT /…/portal/{id}` — portal token
  required; 404 for someone else's dossier, 409 outside `changes_requested`.

- [ ] **Step 3: Update `docs/SPECIFICATIONS.md`**

Replace the proposal workflow description with the five-status lifecycle, the
append-only version chain, the four notification emails, and the passwordless
portal. State plainly that `rejected` is terminal for the submitter and that an
admin reopens a dossier by moving it to `changes_requested`.

- [ ] **Step 4: Update `README.md`**

The capability table lists four core capabilities. Extend the content-management
row, or add a row, naming proposal intake with versioned review and the
submitter portal.

- [ ] **Step 5: Verify no stale claim survives**

Run: `grep -rn "admin_notes" docs README.md frontend/src backend --include="*.md" --include="*.ts" --include="*.tsx" --include="*.py" | grep -v node_modules`
Expected: no hits outside `migrations/` (where the historical DDL legitimately
still names the column) and `docs/superpowers/` (spec and plan, which describe
the change).

- [ ] **Step 6: Commit**

```bash
git add docs/API.md docs/SPECIFICATIONS.md README.md
git commit -m "Document proposal versioning and the submitter portal"
```

---

## Final verification

- [ ] **Backend suite**

Run: `cd backend && python -m pytest -q`
Expected: every test passes, including the roughly 60 added by this plan.

- [ ] **Frontend suite, types and lint**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Production build**

Run: `cd frontend && npm run build`
Expected: builds clean. A previous release broke here on a stale `manualChunks`
entry pointing at a removed page — `MyProposals` is added, not removed, so
nothing should need touching, but the build is the only thing that proves it.

- [ ] **E2E**

Run: `docker compose up -d && E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npx playwright test`
Expected: the new spec passes; the media spec still skips.

- [ ] **The security claim, checked directly**

Run:
```bash
cd backend && python -c "
from auth_utils import create_portal_token, verify_token, verify_portal_token, create_access_token
t = create_portal_token('admin@myzakat.org')
assert verify_token(t) is None, 'portal token was accepted as a staff session'
s = create_access_token({'sub': 'admin@myzakat.org'})
assert verify_portal_token(s) is None, 'staff token was accepted as a portal session'
assert verify_token(s) == 'admin@myzakat.org', 'staff sessions regressed'
print('token isolation holds in both directions')
"
```
Expected: `token isolation holds in both directions`.
