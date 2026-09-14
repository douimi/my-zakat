# Media Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every MyZakat staff member a private media workspace on the existing MinIO/S3 storage, with browse/search/sort, an admin view across all workspaces, and a review-gated path to publish media on the public site.

**Architecture:** One new table, `media_assets`, is the searchable index; S3 holds only bytes. Objects land once at `workspaces/{owner_id}/{yyyy}/{mm}/{uuid}{ext}` and never move — privacy is the `status` column (`private` / `submitted` / `public`), checked by a single serving route. A fourth role, `field_staff`, reaches only the media workspace.

**Tech Stack:** FastAPI (Python 3.11), SQLAlchemy, PostgreSQL (SQLite in tests), MinIO via boto3, React 18 + TypeScript + Vite + Tailwind, pytest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-media-workspaces-design.md`

---

## Conventions for this plan

- Backend tests run from the `backend/` directory: `python -m pytest tests/<file> -v`
- Frontend tests run from `frontend/`: `npx vitest run <path>`
- The backend test DB is in-memory SQLite (`backend/conftest.py`). Tables come from `Base.metadata.create_all`, **not** from the SQL migration — so a new model must be added to `models.py` for tests to see the table.
- Follow the existing router style: module docstring listing routes, `logger = get_logger(__name__)`, `router = APIRouter()`, a `_serialize()` helper, Pydantic schemas defined in the router file (see `backend/routers/fundraising_projects.py`).
- S3 is never reachable from tests. Every test that touches upload or serving monkeypatches the `s3_service` functions.

## File structure

**Create**

| Path | Responsibility |
|---|---|
| `backend/media_library_service.py` | Pure helpers: tag normalization, `search_text` building, object-key building, media-type detection. No DB, no S3 — trivially testable. |
| `backend/routers/media_library.py` | CRUD, list/search, upload, submit/review, workspaces. |
| `backend/routers/media_library_files.py` | Byte serving only: `/{id}/file` and `/{id}/thumb`. Kept apart because it is the security-critical path. |
| `backend/scripts/backfill_media_library.py` | One-time import of existing S3 objects. |
| `backend/scripts/audit_direct_s3_urls.py` | Pre-flight check before dropping the bucket policy. |
| `backend/tests/test_media_library_service.py` | Unit tests for the pure helpers. |
| `backend/tests/test_media_library_api.py` | Upload, list/search/sort, metadata, transitions, delete. |
| `backend/tests/test_media_library_permissions.py` | The role × endpoint × ownership matrix. |
| `migrations/31_add_media_library.sql` | `media_assets` table and indexes. |
| `frontend/src/utils/mediaLibraryApi.ts` | Typed client for the new endpoints. |
| `frontend/src/components/media/MediaCard.tsx` | One tile. |
| `frontend/src/components/media/MediaGrid.tsx` | Grid/list layout + empty state. |
| `frontend/src/components/media/MediaFilters.tsx` | Search box, type/status filters, sort control. |
| `frontend/src/components/media/MediaUploader.tsx` | Drop zone + upload queue. |
| `frontend/src/components/media/MediaDetailDrawer.tsx` | Metadata editing, submit, review, delete. |
| `frontend/src/pages/admin/AdminMediaWorkspace.tsx` | `/admin/media` — my workspace. |
| `frontend/src/pages/admin/AdminMediaLibrary.tsx` | `/admin/media/all` — all workspaces + review queue. |
| `e2e/media-workspaces.spec.ts` | End-to-end flow. |

**Modify**

| Path | Change |
|---|---|
| `backend/models.py` | Add `MediaAsset`; add `BigInteger` import; update the role comment. |
| `backend/auth_utils.py` | Add `role_of`, `STAFF_ROLES`, `get_current_staff`, `get_optional_user`; make `get_current_manager_or_admin` use `role_of`. |
| `backend/routers/admin.py` | Add `field_staff` to `VALID_ROLES`. |
| `backend/schemas.py` | Update the role comment on `AdminUserCreate`. |
| `backend/routers/static_files.py` | Extract `stream_s3_object()`; point `serve_video` at it. |
| `backend/main.py` | Register the two new routers. |
| `backend/conftest.py` | Set `role="admin"` on `admin_user`; add manager / field-staff fixtures. |
| `frontend/src/store/authStore.ts` | Add `field_staff` to `Role`, add `isFieldStaff`, widen `isStaff`. |
| `frontend/src/components/AdminLayout.tsx` | Replace binary nav filtering with a per-role allowlist; add Media entries. |
| `frontend/src/pages/admin/AdminUsers.tsx` | Add `field_staff` to the type, labels, badges and both dropdowns. |
| `frontend/src/App.tsx` | Add `/admin/media` and `/admin/media/all`; repoint `/admin/s3-media`. |

**Delete (Task 17)**

- `frontend/src/pages/admin/AdminS3Media.tsx`

---

## Phase 1 — The `field_staff` role

### Task 1: Backend role plumbing

**Files:**
- Modify: `backend/auth_utils.py`
- Modify: `backend/routers/admin.py:197`
- Modify: `backend/models.py:68-79`
- Modify: `backend/schemas.py:44`
- Modify: `backend/conftest.py:76-96`
- Test: `backend/tests/test_field_staff_role.py`

**Context you need:** `users.role` is already `VARCHAR(20)` holding `admin | manager | user`, so adding a fourth value needs **no schema change**. `get_current_manager_or_admin` already derives an effective role inline; we are lifting that into a shared `role_of` helper and adding a staff-level gate beside it.

**Note on the conftest change:** the existing `admin_user` fixture sets `is_admin=True` but leaves `role` at its column default of `user`. Because `role_of` prefers a non-empty `role` column, that fixture would be treated as a donor by every role-aware dependency. Production rows were backfilled by migration 21, so this is a stale fixture rather than a live bug — but it must be fixed for these tests to mean anything.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_field_staff_role.py`:

```python
"""Tests for the field_staff role and the staff-level auth dependency."""
import pytest
from fastapi import HTTPException

from auth_utils import role_of, get_current_staff, get_current_manager_or_admin
from models import User


def _user(role, is_admin=False):
    return User(id=1, email="x@example.com", password="x", role=role, is_admin=is_admin)


def test_role_of_prefers_the_role_column():
    assert role_of(_user("field_staff")) == "field_staff"
    assert role_of(_user("manager")) == "manager"


def test_role_of_falls_back_to_is_admin_when_role_is_missing():
    assert role_of(_user(None, is_admin=True)) == "admin"
    assert role_of(_user(None, is_admin=False)) == "user"


def test_role_of_rejects_an_unknown_role_value():
    assert role_of(_user("wizard", is_admin=False)) == "user"


@pytest.mark.parametrize("role", ["admin", "manager", "field_staff"])
def test_get_current_staff_allows_every_staff_role(role):
    user = _user(role)
    assert get_current_staff(user) is user


def test_get_current_staff_rejects_a_donor():
    with pytest.raises(HTTPException) as exc:
        get_current_staff(_user("user"))
    assert exc.value.status_code == 403


def test_field_staff_is_not_a_manager_or_admin():
    with pytest.raises(HTTPException) as exc:
        get_current_manager_or_admin(_user("field_staff"))
    assert exc.value.status_code == 403


def test_admin_can_assign_the_field_staff_role(client, auth_headers):
    response = client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={
            "email": "photographer@example.com",
            "password": "testpass1",
            "name": "Field Photographer",
            "role": "field_staff",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["role"] == "field_staff"


def test_admin_cannot_assign_an_unknown_role(client, auth_headers):
    response = client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={"email": "nope@example.com", "password": "testpass1", "role": "wizard"},
    )
    assert response.status_code == 400
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_field_staff_role.py -v`

Expected: FAIL — `ImportError: cannot import name 'role_of' from 'auth_utils'`.

- [ ] **Step 3: Add the helper and the dependency**

In `backend/auth_utils.py`, add after `get_current_admin`:

```python
VALID_ROLES = frozenset({"admin", "manager", "field_staff", "user"})
STAFF_ROLES = frozenset({"admin", "manager", "field_staff"})
MANAGER_ROLES = frozenset({"admin", "manager"})


def role_of(user: User) -> str:
    """Effective role for a user row.

    Prefers the `role` column, falling back to the legacy `is_admin` flag for
    rows created before migration 21 added the column.
    """
    role = getattr(user, "role", None)
    if role in VALID_ROLES:
        return role
    return "admin" if getattr(user, "is_admin", False) else "user"


def get_current_staff(
    current_user: User = Depends(get_current_user)
):
    """Anyone who owns a media workspace: admin, manager or field staff."""
    if role_of(current_user) not in STAFF_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Staff access required."
        )
    return current_user
```

Then replace the body of `get_current_manager_or_admin` so both gates read the role the same way:

```python
def get_current_manager_or_admin(
    current_user: User = Depends(get_current_user)
):
    """Allow either admins or managers — used for endpoints that managers can access."""
    if role_of(current_user) not in MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Manager or admin access required."
        )

    return current_user
```

- [ ] **Step 4: Widen the role allowlist and the comments**

In `backend/routers/admin.py`, delete the local `VALID_ROLES` on line 197 and import
the one in `auth_utils` instead, so the set of legal role strings is defined once.
If the two ever drift, an admin could create a user with a role the auth gates do
not recognise, and that user would be silently treated as a donor:

```python
from auth_utils import VALID_ROLES, role_of
```

Then replace the two surviving copies of the old inline derivation
(`getattr(user, "role", None) or ("admin" if user.is_admin else "user")` at roughly
lines 217 and 369) with `role_of(user)`. Those copies lack the `VALID_ROLES`
check, so a row with a bad role reads as that bad role in the admin UI while every
auth gate treats the user as a donor.

Leave `user.role = "admin" if user.is_admin else "user"` in `toggle_user_admin`
(around line 435) alone — that is a write deriving the column from the just-toggled
flag, not a read of an effective role. `role_of()` does not apply there.

In `backend/models.py`, change the comment on line 68 and add a property beside `is_manager`:

```python
    # role: 'admin' | 'manager' | 'field_staff' | 'user'. `is_admin` is kept in sync for legacy code.
```

```python
    @property
    def is_field_staff(self) -> bool:
        return self.role == "field_staff"
```

In `backend/schemas.py`, change line 44:

```python
    # 'admin' | 'manager' | 'field_staff' | 'user'. If omitted, falls back to is_admin for legacy callers.
```

- [ ] **Step 5: Fix the stale admin fixture and add staff fixtures**

In `backend/conftest.py`, add `role="admin"` to the existing `admin_user` fixture:

```python
    admin = User(
        email="testadmin@example.com",
        password=get_password_hash(test_password),
        name="Test Admin",
        is_active=True,
        is_admin=True,
        role="admin",
    )
```

Then append these fixtures to the end of the file:

```python
TEST_PASSWORD = "testpass"


def _make_user(db_session, email, role):
    user = User(
        email=email,
        password=get_password_hash(TEST_PASSWORD),
        name=email.split("@")[0],
        is_active=True,
        is_admin=(role == "admin"),
        role=role,
        # routers/auth.py rejects a login from any non-admin whose email is
        # unverified, so without this every *_headers fixture below errors.
        email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _headers_for(client, email):
    response = client.post(
        "/api/auth/login", json={"email": email, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="function")
def manager_user(db_session):
    return _make_user(db_session, "manager@example.com", "manager")


@pytest.fixture(scope="function")
def field_staff_user(db_session):
    return _make_user(db_session, "field@example.com", "field_staff")


@pytest.fixture(scope="function")
def other_field_staff_user(db_session):
    return _make_user(db_session, "field2@example.com", "field_staff")


@pytest.fixture(scope="function")
def donor_user(db_session):
    return _make_user(db_session, "donor@example.com", "user")


@pytest.fixture(scope="function")
def manager_headers(client, manager_user):
    return _headers_for(client, manager_user.email)


@pytest.fixture(scope="function")
def field_staff_headers(client, field_staff_user):
    return _headers_for(client, field_staff_user.email)


@pytest.fixture(scope="function")
def other_field_staff_headers(client, other_field_staff_user):
    return _headers_for(client, other_field_staff_user.email)


@pytest.fixture(scope="function")
def donor_headers(client, donor_user):
    return _headers_for(client, donor_user.email)
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_field_staff_role.py -v`

Expected: PASS, 10 tests (the parametrized case counts as 3).

- [ ] **Step 7: Run the full backend suite to check nothing regressed**

Run: `cd backend && python -m pytest tests -v`

Expected: PASS. The `role="admin"` fixture change and the `role_of` refactor must not break existing tests.

- [ ] **Step 8: Commit**

```bash
git add backend/auth_utils.py backend/routers/admin.py backend/models.py backend/schemas.py backend/conftest.py backend/tests/test_field_staff_role.py
git commit -m "feat: add field_staff role and staff-level auth dependency"
```

---

### Task 2: Frontend role plumbing

**Files:**
- Modify: `frontend/src/store/authStore.ts`
- Modify: `frontend/src/components/AdminLayout.tsx:118-127,146-172,229,340-343`
- Modify: `frontend/src/pages/admin/AdminUsers.tsx:6,20-30,816-824,890-900`
- Modify: `frontend/src/App.tsx:85-88`
- Test: `frontend/src/store/__tests__/authStore.test.ts`

**Context you need:** `AdminLayout` currently filters nav with `filterNavForRole(nav, isAdmin)` — a binary admin-or-manager decision driven by a single `MANAGER_ALLOWED` set. A third staff role makes that shape wrong, so it becomes a per-role allowlist map.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/store/__tests__/authStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../authStore'
import type { User } from '../authStore'

const baseUser: User = {
  id: 1,
  email: 'field@example.com',
  is_active: true,
  is_admin: false,
  created_at: '2026-01-01T00:00:00Z',
}

describe('authStore roles', () => {
  beforeEach(() => {
    useAuthStore.getState().logout()
  })

  it('treats field_staff as staff but not admin or manager', () => {
    useAuthStore.getState().login({ ...baseUser, role: 'field_staff' }, 'token')
    const state = useAuthStore.getState()
    expect(state.role).toBe('field_staff')
    expect(state.isFieldStaff).toBe(true)
    expect(state.isStaff).toBe(true)
    expect(state.isAdmin).toBe(false)
    expect(state.isManager).toBe(false)
  })

  it('leaves donors out of staff', () => {
    useAuthStore.getState().login({ ...baseUser, role: 'user' }, 'token')
    const state = useAuthStore.getState()
    expect(state.isStaff).toBe(false)
    expect(state.isFieldStaff).toBe(false)
  })

  it('still derives admin from the legacy is_admin flag', () => {
    useAuthStore.getState().login({ ...baseUser, is_admin: true, role: undefined }, 'token')
    expect(useAuthStore.getState().isAdmin).toBe(true)
  })

  it('clears isFieldStaff on logout', () => {
    useAuthStore.getState().login({ ...baseUser, role: 'field_staff' }, 'token')
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().isFieldStaff).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/store/__tests__/authStore.test.ts`

Expected: FAIL — `isFieldStaff` is `undefined`.

- [ ] **Step 3: Update the auth store**

In `frontend/src/store/authStore.ts`, make these edits:

```typescript
export type Role = 'admin' | 'manager' | 'field_staff' | 'user'
```

```typescript
function deriveRole(user: User | null): Role {
  if (!user) return 'user'
  if (
    user.role === 'admin' ||
    user.role === 'manager' ||
    user.role === 'field_staff' ||
    user.role === 'user'
  ) {
    return user.role
  }
  return user.is_admin ? 'admin' : 'user'
}
```

```typescript
interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isAdmin: boolean
  isManager: boolean
  isFieldStaff: boolean
  isStaff: boolean // admin, manager OR field_staff — anyone who can access /admin/*
  role: Role
  login: (user: User, token: string) => void
  logout: () => void
  initFromStorage: () => void
}

function buildAuthState(user: User | null) {
  const role = deriveRole(user)
  return {
    isAdmin: role === 'admin',
    isManager: role === 'manager',
    isFieldStaff: role === 'field_staff',
    isStaff: role === 'admin' || role === 'manager' || role === 'field_staff',
    role,
  }
}
```

Add `isFieldStaff: false` to both the initial state object and the `logout()` reset object.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/store/__tests__/authStore.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Convert AdminLayout to a per-role allowlist**

In `frontend/src/components/AdminLayout.tsx`, replace the `MANAGER_ALLOWED` constant and the `filterNavForRole` function (lines 146-172) with:

```typescript
// Items each non-admin role is allowed to access. Admins see everything.
const ROLE_ALLOWED: Record<string, Set<string>> = {
  manager: new Set([
    '/admin/contacts',
    '/admin/volunteers',
    '/admin/stories',
    '/admin/project-proposals',
    '/admin/media',
    '/admin/media/all',
  ]),
  field_staff: new Set(['/admin/media']),
  user: new Set<string>(),
}

const STORAGE_KEY = 'myzakat_admin_nav_expanded'

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function filterNavForRole(nav: NavEntry[], role: string): NavEntry[] {
  if (role === 'admin') return nav
  const allowed = ROLE_ALLOWED[role] ?? new Set<string>()
  return nav
    .map((entry) => {
      if (entry.kind === 'link') {
        return allowed.has(entry.href) ? entry : null
      }
      const items = entry.items.filter((i) => allowed.has(i.href))
      return items.length > 0 ? { ...entry, items } : null
    })
    .filter((e): e is NavEntry => e !== null)
}
```

Update the call site: find `filterNavForRole(NAV, isAdmin)` in the component body and change it to `filterNavForRole(NAV, role)`. Then run `grep -n "isAdmin" frontend/src/components/AdminLayout.tsx` — if there are no remaining uses, drop `isAdmin` from the `useAuthStore()` destructure on line 229.

Add the two new links to the Media nav group (lines 118-127), keeping `S3 Browser` for now — Task 17 removes it:

```typescript
  {
    kind: 'group',
    id: 'media',
    label: 'Media',
    icon: Film,
    items: [
      { kind: 'link', name: 'My Workspace', href: '/admin/media', icon: FolderOpen },
      { kind: 'link', name: 'All Media', href: '/admin/media/all', icon: Layers },
      { kind: 'link', name: 'Gallery', href: '/admin/gallery', icon: Film },
      { kind: 'link', name: 'S3 Browser', href: '/admin/s3-media', icon: FolderOpen },
      { kind: 'link', name: 'Cleanup', href: '/admin/cleanup', icon: Trash2 },
    ],
  },
```

Extend the role badge (lines 340-343):

```typescript
  const roleLabel =
    role === 'admin' ? 'Admin'
      : role === 'manager' ? 'Manager'
      : role === 'field_staff' ? 'Field Staff'
      : 'User'
  const roleBadgeClass =
    role === 'admin' ? 'bg-purple-100 text-purple-800'
      : role === 'manager' ? 'bg-amber-100 text-amber-800'
      : role === 'field_staff' ? 'bg-teal-100 text-teal-800'
      : 'bg-gray-100 text-gray-800'
```

- [ ] **Step 6: Send field staff to their workspace on login**

In `frontend/src/App.tsx`, update `AdminIndex` (around line 85):

```typescript
const AdminIndex = () => {
  const { isManager, isFieldStaff } = useAuthStore()
  if (isFieldStaff) return <Navigate to="/admin/media" replace />
  if (isManager) return <Navigate to="/admin/stories" replace />
  return <AdminDashboard />
}
```

- [ ] **Step 7: Add the role to AdminUsers**

In `frontend/src/pages/admin/AdminUsers.tsx`:

```typescript
type Role = 'admin' | 'manager' | 'field_staff' | 'user'
```

Add to `ROLE_LABEL` (line ~22) and `ROLE_BADGE` (line ~28) respectively:

```typescript
  field_staff: 'Field Staff',
```

```typescript
  field_staff: 'bg-teal-100 text-teal-800',
```

Add the option to the create dropdown (after line 821):

```typescript
                    <option value="field_staff">Field Staff — media workspace only</option>
```

And to the edit dropdown (after line 898):

```typescript
                    <option value="field_staff">Field Staff</option>
```

- [ ] **Step 7b: Remove the toggle-admin button**

`toggle_user_admin` (`backend/routers/admin.py`, `PATCH /api/admin/users/{id}/toggle-admin`)
recomputes `role` from the `is_admin` boolean:

```python
    user.is_admin = not user.is_admin
    user.role = "admin" if user.is_admin else "user"
```

So toggling admin off on a `manager` or `field_staff` account silently rewrites
their role to plain `user`. The role dropdown on the same screen already does this
correctly via `PUT /api/admin/users/{id}`, which sets `role` and `is_admin` together.
One control on the page respects roles; the other erases them. The endpoint has no
test coverage. Once workspaces exist, an accidental click locks a member out of
their own uploaded media.

Remove the button and its handler from `frontend/src/pages/admin/AdminUsers.tsx`
(the `fetch` to `/toggle-admin` around line 203, its calling button, and any
now-unused state), and delete the `toggleAdmin` helper in
`frontend/src/utils/api.ts` around line 586.

Leave the backend endpoint in place and unchanged — nothing else calls it, and
removing a route is a separate decision from removing the UI that drove it.

Verify nothing still references it:

Run: `cd frontend && grep -rn "toggle-admin\|toggleAdmin" src/`

Expected: no matches.

- [ ] **Step 7c: Add placeholder routes so the redirect is not dead**

Step 6 redirects field staff to `/admin/media`, and Step 5 adds nav links to
`/admin/media` and `/admin/media/all` — but those routes do not exist until Tasks
16 and 17. There is no catch-all route in this app, so in React Router v6 an
unmatched descendant makes the whole `/admin` branch fail to match and `<Routes>`
renders `null`: a white screen, with nothing thrown for `ErrorBoundary` to catch.

Add placeholders in `frontend/src/App.tsx` beside the other `/admin` children:

```tsx
                {/* Placeholders: Tasks 16 and 17 replace these with the real pages. */}
                <Route path="media" element={<div className="p-8 text-gray-500">Media workspace — coming soon.</div>} />
                <Route path="media/all" element={<div className="p-8 text-gray-500">All media — coming soon.</div>} />
```

- [ ] **Step 8: Type-check and run the frontend suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`

Expected: no type errors; all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/store/authStore.ts frontend/src/components/AdminLayout.tsx frontend/src/pages/admin/AdminUsers.tsx frontend/src/utils/api.ts frontend/src/App.tsx frontend/src/store/__tests__/authStore.test.ts
git commit -m "feat: surface the field_staff role in the admin UI"
```

---

## Phase 2 — Data layer

### Task 3: Pure helpers (`media_library_service.py`)

**Files:**
- Create: `backend/media_library_service.py`
- Test: `backend/tests/test_media_library_service.py`

**Context you need:** These functions have no DB or S3 dependency, which is why they come first — everything later builds on them. The pipe-delimited tag encoding inside `search_text` is what lets a tag filter be an exact match (`ILIKE '%|gaza|%'`) on both PostgreSQL and the SQLite used in tests, without dialect-specific JSON containment.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_media_library_service.py`:

```python
"""Unit tests for the pure media-library helpers."""
from datetime import datetime

import pytest

from media_library_service import (
    build_object_key,
    build_search_text,
    build_thumbnail_key,
    detect_media_type,
    normalize_tags,
    tag_filter_pattern,
)


def test_normalize_tags_lowercases_strips_and_dedupes():
    assert normalize_tags(["  Gaza ", "gaza", "Water-Well", ""]) == ["gaza", "water-well"]


def test_normalize_tags_handles_none():
    assert normalize_tags(None) == []


def test_build_search_text_lowercases_every_part():
    text = build_search_text("IMG_4821.JPG", "Well Opening", "In Rafah", ["Gaza"])
    assert "img_4821.jpg" in text
    assert "well opening" in text
    assert "in rafah" in text


def test_build_search_text_wraps_tags_in_delimiters():
    text = build_search_text("a.jpg", None, None, ["gaza", "water-well"])
    assert "|gaza|water-well|" in text


def test_build_search_text_tolerates_empty_input():
    assert build_search_text(None, None, None, None) == ""


def test_tag_filter_pattern_matches_only_the_whole_tag():
    text = build_search_text("a.jpg", None, None, ["gaza", "water-well"])
    assert tag_filter_pattern("gaza").strip("%") in text
    # 'gaz' is a prefix of 'gaza' but is not itself a tag
    assert tag_filter_pattern("gaz").strip("%") not in text


def test_tag_filter_pattern_returns_none_for_an_empty_tag():
    assert tag_filter_pattern("   ") is None


def test_detect_media_type_prefers_the_content_type():
    assert detect_media_type("whatever.bin", "image/png") == "image"
    assert detect_media_type("whatever.bin", "video/mp4") == "video"


def test_detect_media_type_falls_back_to_the_extension():
    assert detect_media_type("photo.JPEG", "application/octet-stream") == "image"
    assert detect_media_type("clip.MOV", "application/octet-stream") == "video"


def test_detect_media_type_returns_none_for_unsupported_files():
    assert detect_media_type("notes.pdf", "application/pdf") is None


def test_build_object_key_is_namespaced_dated_and_random():
    now = datetime(2026, 3, 14, 12, 0, 0)
    key = build_object_key(7, "My Photo.JPG", now=now)
    assert key.startswith("workspaces/7/2026/03/")
    assert key.endswith(".jpg")
    # The uploaded filename must not survive into the key
    assert "my photo" not in key.lower()
    assert key != build_object_key(7, "My Photo.JPG", now=now)


def test_build_object_key_drops_a_hostile_extension():
    now = datetime(2026, 3, 14)
    key = build_object_key(7, "evil.../../x", now=now)
    assert ".." not in key
    assert key.startswith("workspaces/7/2026/03/")


def test_build_thumbnail_key_sits_beside_the_object():
    key = "workspaces/7/2026/03/abc123.mp4"
    assert build_thumbnail_key(key) == "workspaces/7/2026/03/abc123_thumb.jpg"


def test_build_thumbnail_key_handles_a_key_without_an_extension():
    assert build_thumbnail_key("workspaces/7/2026/03/abc123") == "workspaces/7/2026/03/abc123_thumb.jpg"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_media_library_service.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'media_library_service'`.

- [ ] **Step 3: Write the implementation**

Create `backend/media_library_service.py`:

```python
"""Pure helpers for the media library.

No database and no S3 here on purpose — everything in this module is a plain
function over plain values, which keeps the security-relevant string handling
(object keys, search text) cheap to test.
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime
from typing import Iterable, Optional

# Tags are stored inside `search_text` wrapped in this delimiter so an exact-tag
# filter is a plain ILIKE ('%|gaza|%') that behaves the same on PostgreSQL and
# on the SQLite used by the test suite.
TAG_DELIM = "|"

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")
VIDEO_EXTENSIONS = (".mp4", ".webm", ".ogg", ".avi", ".mov", ".mkv")

# Allow-lists, not a deny-list: anything unlisted is refused by default, so the
# next script-carrying format nobody has thought of is excluded too. SVG is
# absent rather than named — a deny-list entry lost to a "; charset=utf-8"
# parameter, because the deny check matched exactly while the allow check
# matched by prefix.
IMAGE_CONTENT_TYPES = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp",
})
VIDEO_CONTENT_TYPES = frozenset({
    "video/mp4", "video/webm", "video/ogg", "video/x-msvideo",
    "video/quicktime", "video/x-matroska",
})

# LIKE metacharacters survive tag normalization, so tag=% would otherwise
# enumerate every tagged asset. Callers must pass escape=LIKE_ESCAPE.
LIKE_ESCAPE = "\\"

MAX_TAG_LENGTH = 64
MAX_TAGS = 25

_SAFE_EXTENSION = re.compile(r"^\.[a-z0-9]{1,8}$")


def normalize_tags(tags: Optional[Iterable]) -> list:
    """Lowercase, strip and dedupe tags, preserving first-seen order.

    The delimiter is removed rather than escaped: a tag containing TAG_DELIM
    would otherwise match several exact-tag filters at once (["gaza|evil"] would
    answer to both tag=gaza and tag=evil). Replaced with a space rather than
    deleted so two words are not silently fused.
    """
    result: list = []
    for raw in tags or []:
        tag = str(raw).replace(TAG_DELIM, " ").strip().lower()
        if tag and tag not in result:
            result.append(tag)
    return result


def build_search_text(
    filename: Optional[str],
    title: Optional[str],
    description: Optional[str],
    tags: Optional[Iterable],
) -> str:
    """Build the lowercased haystack a single ILIKE searches against.

    The delimiter is stripped from the free-text fields too, not just the tags:
    otherwise a title or filename containing "|gaza|" would answer to tag=gaza,
    which is the same false positive the delimiter exists to prevent. Pipes are
    ordinary in filenames on Linux and macOS, so this fires by accident as well
    as on purpose.
    """
    parts = [
        (filename or "").replace(TAG_DELIM, " ").lower(),
        (title or "").replace(TAG_DELIM, " ").lower(),
        (description or "").replace(TAG_DELIM, " ").lower(),
    ]
    normalized = normalize_tags(tags)
    if normalized:
        parts.append(TAG_DELIM + TAG_DELIM.join(normalized) + TAG_DELIM)
    return " ".join(part for part in parts if part)


def tag_filter_pattern(tag: Optional[str]) -> Optional[str]:
    """ILIKE pattern matching one whole tag, or None if the tag is empty."""
    normalized = normalize_tags([tag] if tag is not None else [])
    if not normalized:
        return None
    return f"%{TAG_DELIM}{normalized[0]}{TAG_DELIM}%"


def detect_media_type(filename: Optional[str], content_type: Optional[str]) -> Optional[str]:
    """Classify a file from its declared type, falling back to its extension.

    Advisory only. `content_type` is an attacker-controlled header, so a caller
    holding the actual bytes must verify them independently — Task 5's upload
    endpoint does exactly that before compressing.
    """
    # UploadFile.content_type carries parameters ("image/png; charset=utf-8"),
    # so match on the bare type.
    ct = (content_type or "").split(";", 1)[0].strip().lower()
    if ct in IMAGE_CONTENT_TYPES:
        return "image"
    if ct in VIDEO_CONTENT_TYPES:
        return "video"

    name = (filename or "").lower()
    if name.endswith(IMAGE_EXTENSIONS):
        return "image"
    if name.endswith(VIDEO_EXTENSIONS):
        return "video"
    return None


def _safe_extension(filename: Optional[str]) -> str:
    """The lowercased extension, or '' if it is missing or suspicious."""
    ext = os.path.splitext(filename or "")[1].lower()
    return ext if _SAFE_EXTENSION.match(ext) else ""


def build_object_key(owner_id: int, filename: Optional[str], now: Optional[datetime] = None) -> str:
    """Namespaced, dated, random object key.

    The uploaded filename never reaches the key — a UUID replaces it — which
    removes both collisions and path traversal. The original name is kept in the
    `filename` column, where it stays searchable.
    """
    # Interpolated straight into the key, so a non-integer owner could escape its
    # own namespace ("7/../../other-owner"). isinstance(True, int) is True, hence
    # the explicit bool exclusion.
    if isinstance(owner_id, bool) or not isinstance(owner_id, int) or owner_id <= 0:
        raise ValueError(f"owner_id must be a positive integer, got {owner_id!r}")
    moment = now or datetime.utcnow()
    return (
        f"workspaces/{owner_id}/{moment:%Y}/{moment:%m}/"
        f"{uuid.uuid4().hex}{_safe_extension(filename)}"
    )


def build_thumbnail_key(object_key: str) -> str:
    """Thumbnail key sitting beside the object it belongs to."""
    directory, _, basename = object_key.rpartition("/")
    stem = basename.rsplit(".", 1)[0] if "." in basename else basename
    prefix = f"{directory}/" if directory else ""
    return f"{prefix}{stem}_thumb.jpg"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_media_library_service.py -v`

Expected: PASS, 14 tests plus the hardening tests added alongside them.

- [ ] **Step 5: Commit**

```bash
git add backend/media_library_service.py backend/tests/test_media_library_service.py
git commit -m "feat: add pure helpers for media library keys, tags and search text"
```

---

### Task 4: The `media_assets` model and migration

**Files:**
- Modify: `backend/models.py:1` (imports) and end of file
- Create: `migrations/31_add_media_library.sql`
- Test: `backend/tests/test_media_library_api.py` (first test only)

**Context you need:** The test suite builds its schema from `Base.metadata.create_all`, so the model is what tests see; the SQL migration is what production sees. **Both must be written, and they must agree.** `JSONType` (line 10 of `models.py`) is the existing cross-dialect JSON helper — real JSONB on PostgreSQL, plain JSON on SQLite.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_media_library_api.py`:

```python
"""Media library API tests: model, upload, listing, metadata, transitions."""
from datetime import datetime

import pytest

from models import MediaAsset


def test_media_asset_defaults(db_session, field_staff_user):
    asset = MediaAsset(
        owner_id=field_staff_user.id,
        object_key="workspaces/1/2026/03/abc.jpg",
        filename="abc.jpg",
        media_type="image",
        content_type="image/jpeg",
        size_bytes=1234,
        search_text="abc.jpg",
    )
    db_session.add(asset)
    db_session.commit()
    db_session.refresh(asset)

    assert asset.id is not None
    assert asset.status == "private"
    assert asset.tags == []
    assert asset.reviewed_by_id is None
    assert isinstance(asset.created_at, datetime)


def test_object_key_is_unique(db_session, field_staff_user):
    for _ in range(2):
        db_session.add(
            MediaAsset(
                owner_id=field_staff_user.id,
                object_key="workspaces/1/2026/03/dupe.jpg",
                filename="dupe.jpg",
                media_type="image",
                content_type="image/jpeg",
                size_bytes=1,
                search_text="dupe.jpg",
            )
        )
    with pytest.raises(Exception):
        db_session.commit()
    db_session.rollback()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v`

Expected: FAIL — `ImportError: cannot import name 'MediaAsset' from 'models'`.

- [ ] **Step 3: Add the model**

In `backend/models.py`, add `BigInteger` to the first import line:

```python
from sqlalchemy import Column, Integer, BigInteger, String, Text, Float, DateTime, Boolean, ForeignKey, UniqueConstraint, JSON
```

Then append to the end of the file:

```python
# ─────────────────────────────────────────────────────────────────────
# Media library — per-user workspaces on top of S3
# ─────────────────────────────────────────────────────────────────────

class MediaAsset(Base):
    """A single photo or video in a staff member's media workspace.

    Privacy is a column, not a location: the object lands once at `object_key`
    and never moves, and `status` alone decides who may read the bytes.
    `search_text` is denormalized on every write so search is one ILIKE that
    behaves identically on PostgreSQL and on the SQLite used in tests.
    """
    __tablename__ = "media_assets"

    id = Column(Integer, primary_key=True, index=True)
    # NULL owner = the "Unassigned" workspace: legacy media, or media whose
    # owner's account was deleted.
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    object_key = Column(String(500), nullable=False, unique=True, index=True)
    filename = Column(String(255), nullable=False)
    media_type = Column(String(10), nullable=False)  # 'image' | 'video'
    content_type = Column(String(100), nullable=False)
    size_bytes = Column(BigInteger, nullable=False, default=0)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    thumbnail_key = Column(String(500), nullable=True)
    checksum_sha256 = Column(String(64), nullable=True, index=True)
    title = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    tags = Column(JSONType, nullable=False, default=list)
    search_text = Column(Text, nullable=False, default="")
    # 'private' (owner + admins) | 'submitted' (awaiting review, still private)
    # | 'public' (served to anyone)
    status = Column(String(20), nullable=False, default="private", index=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v`

Expected: PASS, 2 tests.

- [ ] **Step 5: Write the migration to match**

Create `migrations/31_add_media_library.sql`:

```sql
-- Migration 31: Media library — per-user workspaces on top of S3
--
-- One row per photo or video. S3 holds only bytes; this table is the index
-- that browse, search and sort run against.
--
-- Privacy is the `status` column, not the object location: an object lands once
-- at `object_key` and never moves, so a URL stored in a story can never break.
--
-- `search_text` is denormalized on write (lowercased filename + title +
-- description + pipe-wrapped tags) so search is a single ILIKE that behaves the
-- same on PostgreSQL and on the SQLite used by the test suite.

CREATE TABLE IF NOT EXISTS media_assets (
    id                  SERIAL PRIMARY KEY,
    -- NULL owner = the "Unassigned" workspace: legacy media, or media whose
    -- owner's account was deleted.
    owner_id            INTEGER        REFERENCES users(id) ON DELETE SET NULL,
    object_key          VARCHAR(500)   NOT NULL UNIQUE,
    filename            VARCHAR(255)   NOT NULL,   -- original name, as uploaded
    media_type          VARCHAR(10)    NOT NULL,   -- image | video
    content_type        VARCHAR(100)   NOT NULL,
    size_bytes          BIGINT         NOT NULL DEFAULT 0,
    width               INTEGER,
    height              INTEGER,
    duration_seconds    DOUBLE PRECISION,
    thumbnail_key       VARCHAR(500),
    checksum_sha256     VARCHAR(64),               -- duplicate detection per workspace
    -- Metadata the owner supplies
    title               VARCHAR(200),
    description         TEXT,
    tags                JSONB          NOT NULL DEFAULT '[]'::jsonb,
    search_text         TEXT           NOT NULL DEFAULT '',
    -- Lifecycle
    status              VARCHAR(20)    NOT NULL DEFAULT 'private', -- private | submitted | public
    reviewed_by_id      INTEGER        REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMP,
    review_note         TEXT,
    created_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_assets_owner ON media_assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON media_assets(status);
CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_checksum ON media_assets(checksum_sha256);
CREATE INDEX IF NOT EXISTS idx_media_assets_owner_status ON media_assets(owner_id, status);

-- The review queue is small and read often.
CREATE INDEX IF NOT EXISTS idx_media_assets_submitted
    ON media_assets(created_at DESC) WHERE status = 'submitted';

SELECT 'Migration 31 completed successfully!' as message;
```

- [ ] **Step 6: Check the migration parses**

Run: `cd migrations && grep -c "CREATE INDEX" 31_add_media_library.sql`

Expected: `6`.

If a local PostgreSQL is reachable, apply it for real instead:
`docker compose exec -T db psql -U postgres -d myzakat -f /migrations/31_add_media_library.sql`
Expected: `Migration 31 completed successfully!`

- [ ] **Step 7: Commit**

```bash
git add backend/models.py migrations/31_add_media_library.sql backend/tests/test_media_library_api.py
git commit -m "feat: add media_assets table and model"
```

---

## Phase 3 — Backend API

### Task 5: Upload endpoint

**Files:**
- Create: `backend/routers/media_library.py`
- Modify: `backend/main.py:222` (register beside the other media routers)
- Test: `backend/tests/test_media_library_api.py` (append)

**Context you need:** `media_processing.py` already provides `compress_image`, `compress_video`, `generate_video_thumbnail`, `should_compress_image` and `should_compress_video` — reuse them unchanged. `s3_service.upload_file(content, object_key, content_type=...)` returns a URL we ignore, because our URLs are id-addressed. `delete_file()` defaults to `cleanup_db=True`, which spawns a background thread; always pass `cleanup_db=False` from this router.

**Verify the bytes, not the header.** `detect_media_type` deliberately trusts the caller-supplied `content_type`, which on an upload is just the multipart header and is trivially spoofed — `payload.exe` declared as `image/png` classifies as an image. This endpoint is the boundary where that must be checked against actual file content, because it is the first place the bytes exist. Sniff before compressing, so a hostile file never reaches Pillow or ffmpeg.

**Ordering rule:** write to S3 first, insert the row second. If the insert fails, delete the object. The reverse order would leave a row pointing at nothing, which is worse than an orphan object — `cleanup.py` already sweeps orphan objects.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_media_library_api.py`:

```python
# ── Upload ───────────────────────────────────────────────────────────

@pytest.fixture
def fake_s3(monkeypatch):
    """Capture S3 writes instead of performing them."""
    store = {}

    def _upload(content, object_key, content_type=None, metadata=None):
        store[object_key] = (content, content_type)
        return f"http://s3.test/{object_key}"

    def _delete(object_key, cleanup_db=True):
        store.pop(object_key, None)
        return True

    monkeypatch.setattr("routers.media_library.upload_file", _upload)
    monkeypatch.setattr("routers.media_library.delete_file", _delete)
    return store


@pytest.fixture
def no_compression(monkeypatch):
    """media_processing needs Pillow/ffmpeg; keep uploads byte-for-byte in tests."""
    monkeypatch.setattr("routers.media_library.should_compress_image", lambda ct: False)
    monkeypatch.setattr("routers.media_library.should_compress_video", lambda ct: False)
    monkeypatch.setattr("routers.media_library.generate_video_thumbnail", lambda data: None)
    monkeypatch.setattr("routers.media_library._image_dimensions", lambda data: (800, 600))


def _upload(client, headers, filename="photo.jpg", content=b"fake-image-bytes",
            content_type="image/jpeg", **form):
    return client.post(
        "/api/media-library",
        headers=headers,
        files={"file": (filename, content, content_type)},
        data=form,
    )


def test_upload_creates_a_private_asset_in_the_callers_workspace(
    client, field_staff_headers, field_staff_user, fake_s3, no_compression
):
    response = _upload(
        client, field_staff_headers,
        title="Well opening", description="In Rafah", tags="Gaza, Water-Well",
    )
    assert response.status_code == 201, response.text
    body = response.json()

    assert body["status"] == "private"
    assert body["owner_id"] == field_staff_user.id
    assert body["media_type"] == "image"
    assert body["filename"] == "photo.jpg"
    assert body["tags"] == ["gaza", "water-well"]
    assert body["url"] == f"/api/media-library/{body['id']}/file"
    assert body["object_key"].startswith(f"workspaces/{field_staff_user.id}/")
    assert body["object_key"] in fake_s3


def test_upload_rejects_an_unsupported_file_type(
    client, field_staff_headers, fake_s3, no_compression
):
    response = _upload(client, field_staff_headers, filename="notes.pdf",
                       content=b"%PDF-", content_type="application/pdf")
    assert response.status_code == 400


def test_upload_rejects_an_empty_file(client, field_staff_headers, fake_s3, no_compression):
    response = _upload(client, field_staff_headers, content=b"")
    assert response.status_code == 400


def test_upload_rejects_a_file_over_the_size_limit(
    client, field_staff_headers, fake_s3, no_compression, monkeypatch
):
    monkeypatch.setattr("routers.media_library.MAX_UPLOAD_BYTES", 10)
    response = _upload(client, field_staff_headers, content=b"more than ten bytes")
    assert response.status_code == 413


def test_uploading_the_same_bytes_twice_returns_409(
    client, field_staff_headers, fake_s3, no_compression
):
    assert _upload(client, field_staff_headers).status_code == 201
    duplicate = _upload(client, field_staff_headers, filename="copy.jpg")
    assert duplicate.status_code == 409
    assert "existing" in duplicate.json()["detail"]


def test_the_same_bytes_in_two_workspaces_are_not_duplicates(
    client, field_staff_headers, other_field_staff_headers, fake_s3, no_compression
):
    assert _upload(client, field_staff_headers).status_code == 201
    assert _upload(client, other_field_staff_headers).status_code == 201


def test_a_failed_insert_leaves_no_orphan_object(
    client, field_staff_headers, fake_s3, no_compression, monkeypatch
):
    from sqlalchemy.orm import Session

    def boom(self):
        raise RuntimeError("database is on fire")

    monkeypatch.setattr(Session, "commit", boom)
    response = _upload(client, field_staff_headers)
    assert response.status_code == 500
    assert fake_s3 == {}


def test_a_donor_cannot_upload(client, donor_headers, fake_s3, no_compression):
    assert _upload(client, donor_headers).status_code == 403


def test_an_anonymous_caller_cannot_upload(client, fake_s3, no_compression):
    response = client.post(
        "/api/media-library",
        files={"file": ("photo.jpg", b"bytes", "image/jpeg")},
    )
    assert response.status_code in (401, 403)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v -k upload`

Expected: FAIL — every upload test returns 404, because the route does not exist.

- [ ] **Step 3: Write the router**

Create `backend/routers/media_library.py`:

```python
"""Media library — per-user workspaces on top of S3.

Staff (admin | manager | field_staff):
  POST   /api/media-library                upload into own workspace
  GET    /api/media-library                list / search / sort / paginate
  GET    /api/media-library/{id}           detail + site-usage cross-reference
  PATCH  /api/media-library/{id}           edit title / description / tags
  POST   /api/media-library/{id}/submit    owner: private -> submitted
  DELETE /api/media-library/{id}           owner (private only) or admin/manager

Admin or manager only:
  GET    /api/media-library/workspaces     workspaces with counts and total size
  POST   /api/media-library/{id}/review    approve -> public, reject -> private
  POST   /api/media-library/{id}/reassign  move an asset into another workspace

Byte serving lives in media_library_files.py.
"""
from __future__ import annotations

import hashlib
import io
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth_utils import role_of, get_current_manager_or_admin, get_current_staff
from database import get_db
from logging_config import get_logger
from media_library_service import (
    build_object_key,
    build_search_text,
    build_thumbnail_key,
    detect_media_type,
    normalize_tags,
    search_pattern,
    tag_filter_pattern,
    validate_tags,
    IMAGE_CONTENT_TYPES,
    VIDEO_CONTENT_TYPES,
)
from media_processing import (
    compress_image,
    compress_video,
    generate_video_thumbnail,
    should_compress_image,
    should_compress_video,
)
from models import MediaAsset, User
from s3_service import delete_file, upload_file

logger = get_logger(__name__)
router = APIRouter()

MAX_MEDIA_UPLOAD_MB = int(os.getenv("MAX_MEDIA_UPLOAD_MB", "100"))
MAX_UPLOAD_BYTES = MAX_MEDIA_UPLOAD_MB * 1024 * 1024


# ── Helpers ──────────────────────────────────────────────────────────

def _serialize(asset: MediaAsset) -> dict:
    has_thumbnail = bool(asset.thumbnail_key) or asset.media_type == "image"
    return {
        "id": asset.id,
        "owner_id": asset.owner_id,
        "object_key": asset.object_key,
        "filename": asset.filename,
        "media_type": asset.media_type,
        "content_type": asset.content_type,
        "size_bytes": asset.size_bytes,
        "width": asset.width,
        "height": asset.height,
        "duration_seconds": asset.duration_seconds,
        "title": asset.title,
        "description": asset.description,
        "tags": asset.tags or [],
        "status": asset.status,
        "review_note": asset.review_note,
        "reviewed_at": asset.reviewed_at,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
        "url": f"/api/media-library/{asset.id}/file",
        "thumbnail_url": f"/api/media-library/{asset.id}/thumb" if has_thumbnail else None,
    }


# Leading bytes for the formats we accept. The declared Content-Type is attacker
# controlled; this is not.
_MAGIC = (
    (b"ÿØÿ", "image"),               # jpeg
    (b"PNG

", "image"),         # png
    (b"GIF87a", "image"), (b"GIF89a", "image"),
    (b"BM", "image"),                           # bmp
)


def _sniffed_type(content: bytes) -> Optional[str]:
    """Media type implied by the file's own leading bytes, or None."""
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image"
    # ISO base media (mp4/mov/m4v) puts an 'ftyp' box at offset 4.
    if content[4:8] == b"ftyp":
        return "video"
    if content[:4] == b"Eß£":     # matroska / webm
        return "video"
    for prefix, kind in _MAGIC:
        if content.startswith(prefix):
            return kind
    return None


def _image_dimensions(data: bytes):
    """(width, height) for image bytes, or (None, None) if unreadable."""
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as img:
            return img.size
    except Exception:
        return (None, None)


def _load_asset(db: Session, asset_id: int) -> MediaAsset:
    asset = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Media not found")
    return asset


def _require_can_edit(asset: MediaAsset, user: User) -> None:
    """Owner, admin or manager. 404 rather than 403: a 403 confirms it exists."""
    if role_of(user) in ("admin", "manager"):
        return
    if asset.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Media not found")


# ── Upload ───────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """Upload one photo or video into the caller's own workspace."""
    media_type = detect_media_type(file.filename, file.content_type)
    if media_type is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload an image or a video.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is larger than the {MAX_MEDIA_UPLOAD_MB} MB limit.",
        )

    # The declared type got us this far; the bytes have to agree before we hand
    # them to Pillow or ffmpeg.
    if _sniffed_type(content) != media_type:
        raise HTTPException(
            status_code=400,
            detail="File content does not match its declared type.",
        )

    # Never store the raw header. A file named a.jpg, declared text/html, whose
    # body is a real GIF passes both the extension fallback and the byte sniff —
    # and would then be stored and served as text/html, which is stored XSS on
    # the serving origin. The stored type comes from the allow-list or not at all.
    declared = (file.content_type or "").split(";", 1)[0].strip().lower()
    allowed = IMAGE_CONTENT_TYPES if media_type == "image" else VIDEO_CONTENT_TYPES
    content_type = declared if declared in allowed else (
        "image/jpeg" if media_type == "image" else "video/mp4"
    )
    width = height = None
    thumbnail_bytes = None

    if media_type == "image":
        if should_compress_image(content_type):
            content = compress_image(content)
            content_type = "image/jpeg"
        width, height = _image_dimensions(content)
    else:
        if should_compress_video(content_type):
            content = compress_video(content)
        thumbnail_bytes = generate_video_thumbnail(content)

    checksum = hashlib.sha256(content).hexdigest()
    duplicate = (
        db.query(MediaAsset)
        .filter(
            MediaAsset.owner_id == current_user.id,
            MediaAsset.checksum_sha256 == checksum,
        )
        .first()
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "This file is already in your workspace.",
                "existing": _serialize(duplicate),
            },
        )

    # normalize_tags is lenient because it also runs on the read path; this is
    # the write-path gate that tells the user instead of silently rewriting.
    tag_problems = validate_tags((tags or "").split(","))
    if tag_problems:
        raise HTTPException(status_code=400, detail={"tags": tag_problems})

    parsed_tags = normalize_tags((tags or "").split(","))
    object_key = build_object_key(current_user.id, file.filename)
    thumbnail_key = None

    # S3 first, row second: an orphan object is recoverable, a row pointing at
    # nothing is not.
    upload_file(content, object_key, content_type=content_type)
    if thumbnail_bytes:
        thumbnail_key = build_thumbnail_key(object_key)
        try:
            upload_file(thumbnail_bytes, thumbnail_key, content_type="image/jpeg")
        except Exception as exc:
            logger.warning("Thumbnail upload failed for %s: %s", object_key, exc)
            thumbnail_key = None

    asset = MediaAsset(
        owner_id=current_user.id,
        object_key=object_key,
        filename=file.filename or "upload",
        media_type=media_type,
        content_type=content_type,
        size_bytes=len(content),
        width=width,
        height=height,
        thumbnail_key=thumbnail_key,
        checksum_sha256=checksum,
        title=(title or None),
        description=(description or None),
        tags=parsed_tags,
        search_text=build_search_text(file.filename, title, description, parsed_tags),
        status="private",
    )

    try:
        db.add(asset)
        db.commit()
        db.refresh(asset)
    except Exception as exc:
        db.rollback()
        delete_file(object_key, cleanup_db=False)
        if thumbnail_key:
            delete_file(thumbnail_key, cleanup_db=False)
        logger.error("Could not index uploaded media %s: %s", object_key, exc)
        raise HTTPException(status_code=500, detail="Could not save the uploaded file.")

    return _serialize(asset)
```

- [ ] **Step 4: Register the router**

In `backend/main.py`, add after line 222 (`s3_media` registration):

```python
app.include_router(media_library.router, prefix="/api/media-library", tags=["media-library"])
```

Add `media_library` to the `from routers import (...)` block at the top of the file — match the existing import style there.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v`

Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/media_library.py backend/main.py backend/tests/test_media_library_api.py
git commit -m "feat: upload media into a per-user workspace"
```

---

### Task 6: List, search, sort and paginate

**Files:**
- Modify: `backend/routers/media_library.py`
- Test: `backend/tests/test_media_library_api.py` (append)

**Context you need:** Scoping is applied **inside the query**, never by trusting a caller-supplied filter — a field-staff request must be structurally incapable of returning another member's rows. Admins and managers may additionally pass `owner_id`, including the literal `unassigned` for the backfilled legacy pool.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_media_library_api.py`:

```python
# ── Listing ──────────────────────────────────────────────────────────

def _make_asset(db_session, owner_id, filename="a.jpg", title=None, description=None,
                tags=None, status="private", size=100, media_type="image"):
    from media_library_service import build_search_text
    asset = MediaAsset(
        owner_id=owner_id,
        object_key=f"workspaces/{owner_id}/2026/03/{filename}-{size}-{status}",
        filename=filename,
        media_type=media_type,
        content_type="image/jpeg" if media_type == "image" else "video/mp4",
        size_bytes=size,
        title=title,
        description=description,
        tags=tags or [],
        search_text=build_search_text(filename, title, description, tags),
        status=status,
    )
    db_session.add(asset)
    db_session.commit()
    db_session.refresh(asset)
    return asset


def test_field_staff_only_sees_their_own_workspace(
    client, db_session, field_staff_headers, field_staff_user, other_field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="mine.jpg")
    _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")

    body = client.get("/api/media-library", headers=field_staff_headers).json()
    assert [item["filename"] for item in body["items"]] == ["mine.jpg"]
    assert body["total"] == 1


def test_field_staff_cannot_widen_scope_with_owner_id(
    client, db_session, field_staff_headers, field_staff_user, other_field_staff_user
):
    _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")
    body = client.get(
        f"/api/media-library?owner_id={other_field_staff_user.id}",
        headers=field_staff_headers,
    ).json()
    assert body["items"] == []


def test_an_admin_sees_every_workspace(
    client, db_session, auth_headers, field_staff_user, other_field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="mine.jpg")
    _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")
    _make_asset(db_session, None, filename="legacy.jpg", status="public")

    body = client.get("/api/media-library", headers=auth_headers).json()
    assert body["total"] == 3


def test_an_admin_can_filter_to_the_unassigned_workspace(
    client, db_session, auth_headers, field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="mine.jpg")
    _make_asset(db_session, None, filename="legacy.jpg", status="public")

    body = client.get("/api/media-library?owner_id=unassigned", headers=auth_headers).json()
    assert [item["filename"] for item in body["items"]] == ["legacy.jpg"]


def test_search_matches_filename_title_description_and_tags(
    client, db_session, field_staff_headers, field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="IMG_4821.jpg",
                title="Well opening", description="Ceremony in Rafah", tags=["gaza"])
    _make_asset(db_session, field_staff_user.id, filename="other.jpg", title="Nothing")

    for query in ("img_4821", "well", "rafah", "gaza"):
        body = client.get(f"/api/media-library?q={query}", headers=field_staff_headers).json()
        assert body["total"] == 1, f"query {query!r} matched {body['total']} rows"


def test_search_is_case_insensitive(client, db_session, field_staff_headers, field_staff_user):
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", title="Well Opening")
    body = client.get("/api/media-library?q=WELL", headers=field_staff_headers).json()
    assert body["total"] == 1


def test_the_tag_filter_matches_whole_tags_only(
    client, db_session, field_staff_headers, field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", tags=["gaza", "water-well"])
    assert client.get("/api/media-library?tag=gaza", headers=field_staff_headers).json()["total"] == 1
    assert client.get("/api/media-library?tag=gaz", headers=field_staff_headers).json()["total"] == 0


def test_filter_by_type_and_status(client, db_session, field_staff_headers, field_staff_user):
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", media_type="image")
    _make_asset(db_session, field_staff_user.id, filename="b.mp4", media_type="video",
                status="submitted")

    assert client.get("/api/media-library?type=video", headers=field_staff_headers).json()["total"] == 1
    assert client.get("/api/media-library?status=submitted", headers=field_staff_headers).json()["total"] == 1


def test_sorting_by_size_in_both_directions(
    client, db_session, field_staff_headers, field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="small.jpg", size=10)
    _make_asset(db_session, field_staff_user.id, filename="big.jpg", size=999)

    asc = client.get("/api/media-library?sort=size&order=asc", headers=field_staff_headers).json()
    assert [i["filename"] for i in asc["items"]] == ["small.jpg", "big.jpg"]

    desc = client.get("/api/media-library?sort=size&order=desc", headers=field_staff_headers).json()
    assert [i["filename"] for i in desc["items"]] == ["big.jpg", "small.jpg"]


def test_wildcards_in_search_and_tag_are_literal_not_patterns(
    client, db_session, field_staff_headers, field_staff_user
):
    """Fails if a caller ever drops escape= from the ilike() call."""
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", tags=["gaza"])
    _make_asset(db_session, field_staff_user.id, filename="b.jpg", tags=["water"])

    # "%" is a LIKE wildcard; as a query it must match nothing, not everything.
    assert client.get("/api/media-library?q=%25", headers=field_staff_headers).json()["total"] == 0
    assert client.get("/api/media-library?tag=%25", headers=field_staff_headers).json()["total"] == 0


def test_an_unknown_sort_field_is_rejected(client, field_staff_headers):
    response = client.get("/api/media-library?sort=password", headers=field_staff_headers)
    assert response.status_code == 400


def test_pagination_reports_totals_and_slices(
    client, db_session, field_staff_headers, field_staff_user
):
    for index in range(5):
        _make_asset(db_session, field_staff_user.id, filename=f"f{index}.jpg", size=index)

    body = client.get(
        "/api/media-library?page=2&page_size=2&sort=size&order=asc",
        headers=field_staff_headers,
    ).json()
    assert body["total"] == 5
    assert body["page"] == 2
    assert body["page_size"] == 2
    assert [i["filename"] for i in body["items"]] == ["f2.jpg", "f3.jpg"]


def test_a_donor_cannot_list(client, donor_headers):
    assert client.get("/api/media-library", headers=donor_headers).status_code == 403
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v -k "list or search or sort or pagination or tag_filter or filter_by"`

Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Write the list endpoint**

Append to `backend/routers/media_library.py`:

```python
# ── Listing ──────────────────────────────────────────────────────────

SORT_FIELDS = {
    "created_at": MediaAsset.created_at,
    "filename": MediaAsset.filename,
    "title": MediaAsset.title,
    "size": MediaAsset.size_bytes,
    "type": MediaAsset.media_type,
}

MEDIA_TYPES = ("image", "video")
STATUSES = ("private", "submitted", "public")


@router.get("")
async def list_media(
    q: Optional[str] = Query(None, description="Match filename, title, description or tags"),
    type: Optional[str] = Query(None, description="image | video"),
    status: Optional[str] = Query(None, description="private | submitted | public"),
    tag: Optional[str] = Query(None, description="Exact tag match"),
    owner_id: Optional[str] = Query(None, description="Admin/manager only; accepts 'unassigned'"),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """List the caller's workspace, or every workspace for admins and managers."""
    if sort not in SORT_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown sort field. Use one of: {', '.join(sorted(SORT_FIELDS))}",
        )
    if order not in ("asc", "desc"):
        raise HTTPException(status_code=400, detail="order must be 'asc' or 'desc'")

    query = db.query(MediaAsset)

    # Scope first, and structurally: a field-staff query can never widen.
    role = role_of(current_user)
    if role not in ("admin", "manager"):
        query = query.filter(MediaAsset.owner_id == current_user.id)
    elif owner_id:
        if owner_id == "unassigned":
            query = query.filter(MediaAsset.owner_id.is_(None))
        else:
            try:
                query = query.filter(MediaAsset.owner_id == int(owner_id))
            except ValueError:
                raise HTTPException(status_code=400, detail="owner_id must be an integer or 'unassigned'")

    # Both helpers escape LIKE metacharacters and hand back the escape character
    # with the pattern — without it, q="%" or tag="%" matches every row, and a
    # trailing backslash behaves differently on PostgreSQL than on SQLite.
    if q:
        found = search_pattern(q)
        if found is not None:
            pattern, escape = found
            query = query.filter(MediaAsset.search_text.ilike(pattern, escape=escape))
    if tag:
        found = tag_filter_pattern(tag)
        if found is None:
            raise HTTPException(status_code=400, detail="tag must not be empty")
        pattern, escape = found
        query = query.filter(MediaAsset.search_text.ilike(pattern, escape=escape))
    if type:
        if type not in MEDIA_TYPES:
            raise HTTPException(status_code=400, detail="type must be 'image' or 'video'")
        query = query.filter(MediaAsset.media_type == type)
    if status:
        if status not in STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(STATUSES)}")
        query = query.filter(MediaAsset.status == status)

    total = query.count()

    column = SORT_FIELDS[sort]
    query = query.order_by(column.asc() if order == "asc" else column.desc())
    # Stable tiebreak so pagination cannot repeat or drop a row.
    query = query.order_by(None).order_by(
        column.asc() if order == "asc" else column.desc(), MediaAsset.id.asc()
    )

    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [_serialize(asset) for asset in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v`

Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/media_library.py backend/tests/test_media_library_api.py
git commit -m "feat: list, search, sort and paginate media assets"
```

---

### Task 7: Detail, metadata editing, reassignment and the workspaces summary

**Files:**
- Modify: `backend/routers/media_library.py`
- Test: `backend/tests/test_media_library_api.py` (append)

**Context you need:** `routers/s3_media.py` already has `get_media_usage(filename_or_url, db)`, which cross-references a media URL against Gallery, Stories, Testimonials, Events, Programs, Program Categories, Slideshow Slides and Settings. Import and reuse it — do not write a second copy.

**Route ordering matters:** `/workspaces` must be declared **before** `/{asset_id}`, because `asset_id` is typed `int` and FastAPI would reject the literal string `workspaces` with a 422 rather than falling through.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_media_library_api.py`:

```python
# ── Detail, metadata, workspaces ─────────────────────────────────────

def test_detail_returns_the_asset_and_its_site_usage(
    client, db_session, field_staff_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    body = client.get(f"/api/media-library/{asset.id}", headers=field_staff_headers).json()
    assert body["id"] == asset.id
    assert body["usage_count"] == 0
    assert "usage" in body


def test_detail_hides_another_members_asset_behind_a_404(
    client, db_session, field_staff_headers, other_field_staff_user
):
    asset = _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")
    response = client.get(f"/api/media-library/{asset.id}", headers=field_staff_headers)
    assert response.status_code == 404


def test_patch_updates_metadata_and_rebuilds_search_text(
    client, db_session, field_staff_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.patch(
        f"/api/media-library/{asset.id}",
        headers=field_staff_headers,
        json={"title": "Well Opening", "description": "Rafah", "tags": ["Gaza", "gaza", " "]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["tags"] == ["gaza"]

    found = client.get("/api/media-library?q=rafah", headers=field_staff_headers).json()
    assert found["total"] == 1


def test_patch_cannot_change_status(client, db_session, field_staff_headers, field_staff_user):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    client.patch(
        f"/api/media-library/{asset.id}",
        headers=field_staff_headers,
        json={"title": "x", "status": "public"},
    )
    db_session.refresh(asset)
    assert asset.status == "private"


def test_patch_on_another_members_asset_is_a_404(
    client, db_session, field_staff_headers, other_field_staff_user
):
    asset = _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")
    response = client.patch(
        f"/api/media-library/{asset.id}", headers=field_staff_headers, json={"title": "mine now"}
    )
    assert response.status_code == 404


def test_an_admin_can_edit_any_members_asset(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.patch(
        f"/api/media-library/{asset.id}", headers=auth_headers, json={"title": "Reviewed"}
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Reviewed"


def test_an_admin_reassigns_an_unassigned_asset_to_a_member(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, None, filename="legacy.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/reassign",
        headers=auth_headers,
        json={"owner_id": field_staff_user.id},
    )
    assert response.status_code == 200, response.text
    assert response.json()["owner_id"] == field_staff_user.id


def test_reassigning_to_a_nonexistent_user_is_rejected(
    client, db_session, auth_headers
):
    asset = _make_asset(db_session, None, filename="legacy.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/reassign", headers=auth_headers, json={"owner_id": 999999}
    )
    assert response.status_code == 404


def test_field_staff_cannot_reassign(client, db_session, field_staff_headers, field_staff_user):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.post(
        f"/api/media-library/{asset.id}/reassign",
        headers=field_staff_headers,
        json={"owner_id": field_staff_user.id},
    )
    assert response.status_code == 403


def test_workspaces_summarises_every_member(
    client, db_session, auth_headers, field_staff_user, other_field_staff_user
):
    _make_asset(db_session, field_staff_user.id, filename="a.jpg", size=100)
    _make_asset(db_session, field_staff_user.id, filename="b.jpg", size=50, status="submitted")
    _make_asset(db_session, other_field_staff_user.id, filename="c.jpg", size=7)
    _make_asset(db_session, None, filename="legacy.jpg", size=3, status="public")

    body = client.get("/api/media-library/workspaces", headers=auth_headers).json()
    by_id = {w["owner_id"]: w for w in body["workspaces"]}

    assert by_id[field_staff_user.id]["asset_count"] == 2
    assert by_id[field_staff_user.id]["total_bytes"] == 150
    assert by_id[field_staff_user.id]["submitted_count"] == 1
    assert by_id[field_staff_user.id]["owner_email"] == field_staff_user.email
    assert by_id[None]["owner_name"] == "Unassigned"


def test_workspaces_includes_staff_who_have_uploaded_nothing(
    client, db_session, auth_headers, field_staff_user
):
    """An empty workspace must still be selectable when reassigning legacy media."""
    body = client.get("/api/media-library/workspaces", headers=auth_headers).json()
    by_id = {w["owner_id"]: w for w in body["workspaces"]}

    assert field_staff_user.id in by_id
    assert by_id[field_staff_user.id]["asset_count"] == 0
    assert None not in by_id, "Unassigned should not appear while it holds nothing"


def test_field_staff_cannot_read_the_workspaces_summary(client, field_staff_headers):
    response = client.get("/api/media-library/workspaces", headers=field_staff_headers)
    assert response.status_code == 403
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v -k "detail or patch or workspaces"`

Expected: FAIL — 404 / 405 on the missing routes.

- [ ] **Step 3: Write the endpoints**

Append to `backend/routers/media_library.py`. **`/workspaces` must come first in the file** so it is matched before `/{asset_id}`:

```python
# ── Workspaces summary (declare before /{asset_id}) ──────────────────

@router.get("/workspaces")
async def list_workspaces(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Every staff member's workspace, plus Unassigned if it holds anything.

    Every staff account gets a row even when it holds nothing yet — a workspace
    exists because the person does, and an empty one still has to be selectable
    when a reviewer reassigns legacy media.
    """
    from sqlalchemy import func

    totals = {
        row.owner_id: row
        for row in db.query(
            MediaAsset.owner_id,
            func.count(MediaAsset.id).label("asset_count"),
            func.coalesce(func.sum(MediaAsset.size_bytes), 0).label("total_bytes"),
        ).group_by(MediaAsset.owner_id).all()
    }

    submitted = dict(
        db.query(MediaAsset.owner_id, func.count(MediaAsset.id))
        .filter(MediaAsset.status == "submitted")
        .group_by(MediaAsset.owner_id)
        .all()
    )

    staff = (
        db.query(User)
        .filter(User.role.in_(("admin", "manager", "field_staff")))
        .all()
    )

    def _row(owner_id, name, email):
        total = totals.get(owner_id)
        return {
            "owner_id": owner_id,
            "owner_name": name,
            "owner_email": email,
            "asset_count": int(total.asset_count) if total else 0,
            "total_bytes": int(total.total_bytes) if total else 0,
            "submitted_count": int(submitted.get(owner_id, 0)),
        }

    workspaces = [_row(user.id, user.name or user.email, user.email) for user in staff]

    # Owners who are no longer staff, plus the owner-less legacy pool.
    known = {user.id for user in staff}
    for owner_id in totals:
        if owner_id is None:
            workspaces.append(_row(None, "Unassigned", None))
        elif owner_id not in known:
            owner = db.query(User).filter(User.id == owner_id).first()
            workspaces.append(_row(
                owner_id,
                (owner.name or owner.email) if owner else f"User {owner_id}",
                owner.email if owner else None,
            ))

    workspaces.sort(key=lambda w: (w["owner_id"] is None, -w["asset_count"], w["owner_name"]))
    return {"workspaces": workspaces}


# ── Detail and metadata ──────────────────────────────────────────────

class MediaAssetUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    tags: Optional[list] = None


@router.get("/{asset_id}")
async def get_media_detail(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """One asset, plus where it is used across the public site."""
    from routers.s3_media import get_media_usage

    asset = _load_asset(db, asset_id)
    _require_can_edit(asset, current_user)

    usage = get_media_usage(f"/api/media-library/{asset.id}/file", db)
    payload = _serialize(asset)
    payload["usage"] = usage
    payload["usage_count"] = sum(len(v) for v in usage.values())
    return payload


@router.patch("/{asset_id}")
async def update_media_metadata(
    asset_id: int,
    payload: MediaAssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """Edit title, description and tags. Status is deliberately not editable here."""
    asset = _load_asset(db, asset_id)
    _require_can_edit(asset, current_user)

    fields = payload.dict(exclude_unset=True)
    if "title" in fields:
        asset.title = fields["title"] or None
    if "description" in fields:
        asset.description = fields["description"] or None
    if "tags" in fields:
        asset.tags = normalize_tags(fields["tags"])

    asset.search_text = build_search_text(
        asset.filename, asset.title, asset.description, asset.tags
    )
    db.commit()
    db.refresh(asset)
    return _serialize(asset)


class ReassignRequest(BaseModel):
    owner_id: Optional[int] = None


@router.post("/{asset_id}/reassign")
async def reassign_media(
    asset_id: int,
    payload: ReassignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Move an asset into another member's workspace.

    Chiefly for backfilled legacy media, which arrives owner-less. A null
    owner_id sends the asset back to the Unassigned workspace. Ownership is
    deliberately not part of PATCH: it is a privileged action, and keeping it on
    its own route keeps the privilege check out of the metadata path.
    """
    asset = _load_asset(db, asset_id)

    if payload.owner_id is not None:
        owner = db.query(User).filter(User.id == payload.owner_id).first()
        if owner is None:
            raise HTTPException(status_code=404, detail="No such user")
        if role_of(owner) not in ("admin", "manager", "field_staff"):
            raise HTTPException(
                status_code=400, detail="Only staff accounts can own media."
            )

    asset.owner_id = payload.owner_id
    db.commit()
    db.refresh(asset)
    return _serialize(asset)
```

Because `MediaAssetUpdate` has no `status` field, Pydantic drops an attempted `"status": "public"` from the body — that is what makes `test_patch_cannot_change_status` pass, and it is why status changes live on their own endpoints.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v`

Expected: PASS, 35 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/media_library.py backend/tests/test_media_library_api.py
git commit -m "feat: media asset detail, metadata editing and workspace summaries"
```

---

### Task 8: Submit and review transitions

**Files:**
- Modify: `backend/routers/media_library.py`
- Test: `backend/tests/test_media_library_api.py` (append)

**Context you need:** The legal transitions are exactly the table in the spec. Everything else is a 400. Unpublishing (`public → private`) is the one transition with a guard: it is refused while site content still points at the asset.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_media_library_api.py`:

```python
# ── Submit and review ────────────────────────────────────────────────

def test_owner_submits_a_private_asset_for_review(
    client, db_session, field_staff_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    response = client.post(f"/api/media-library/{asset.id}/submit", headers=field_staff_headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "submitted"


def test_submitting_an_already_submitted_asset_is_rejected(
    client, db_session, field_staff_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.post(f"/api/media-library/{asset.id}/submit", headers=field_staff_headers)
    assert response.status_code == 400


def test_field_staff_cannot_review(client, db_session, field_staff_headers, field_staff_user):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.post(
        f"/api/media-library/{asset.id}/review",
        headers=field_staff_headers,
        json={"decision": "approve"},
    )
    assert response.status_code == 403


def test_a_manager_approves_a_submitted_asset(
    client, db_session, manager_headers, manager_user, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.post(
        f"/api/media-library/{asset.id}/review",
        headers=manager_headers,
        json={"decision": "approve"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "public"
    assert body["reviewed_at"] is not None

    db_session.refresh(asset)
    assert asset.reviewed_by_id == manager_user.id


def test_rejection_returns_the_asset_to_private_with_a_note(
    client, db_session, manager_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.post(
        f"/api/media-library/{asset.id}/review",
        headers=manager_headers,
        json={"decision": "reject", "note": "Beneficiary faces are visible"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "private"
    assert body["review_note"] == "Beneficiary faces are visible"


def test_an_admin_can_promote_a_private_asset_directly(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="private")
    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "approve"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "public"


def test_unpublishing_a_public_asset_returns_it_to_private(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "unpublish"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "private"


def test_unpublishing_is_refused_while_the_site_uses_the_asset(
    client, db_session, auth_headers, field_staff_user
):
    from models import GalleryItem

    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    db_session.add(GalleryItem(media_filename=f"/api/media-library/{asset.id}/file"))
    db_session.commit()

    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "unpublish"}
    )
    assert response.status_code == 409
    assert "gallery_items" in str(response.json()["detail"])

    db_session.refresh(asset)
    assert asset.status == "public"


def test_an_unknown_decision_is_rejected(client, db_session, auth_headers, field_staff_user):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="submitted")
    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "shred"}
    )
    assert response.status_code == 422


def test_approving_an_already_public_asset_is_rejected(
    client, db_session, auth_headers, field_staff_user
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    response = client.post(
        f"/api/media-library/{asset.id}/review", headers=auth_headers, json={"decision": "approve"}
    )
    assert response.status_code == 400
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v -k "submit or review or reject or unpublish or promote"`

Expected: FAIL — 404 on the missing routes.

- [ ] **Step 3: Write the endpoints**

Append to `backend/routers/media_library.py`:

```python
# ── Lifecycle ────────────────────────────────────────────────────────

class ReviewDecision(BaseModel):
    decision: str = Field(..., pattern="^(approve|reject|unpublish)$")
    note: Optional[str] = None


def _usage_for(asset: MediaAsset, db: Session) -> dict:
    from routers.s3_media import get_media_usage
    return get_media_usage(f"/api/media-library/{asset.id}/file", db)


def _refuse_if_in_use(asset: MediaAsset, db: Session, action: str) -> None:
    """Block an action that would break the public site, naming what points here."""
    usage = _usage_for(asset, db)
    referenced = {key: value for key, value in usage.items() if value}
    if referenced:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": f"Cannot {action}: this media is still used on the site.",
                "usage": referenced,
            },
        )


@router.post("/{asset_id}/submit")
async def submit_for_review(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """Owner asks for the asset to be reviewed. It stays private until approved."""
    asset = _load_asset(db, asset_id)
    _require_can_edit(asset, current_user)

    if asset.status != "private":
        raise HTTPException(
            status_code=400,
            detail=f"Only private media can be submitted (this is '{asset.status}').",
        )

    asset.status = "submitted"
    asset.review_note = None
    db.commit()
    db.refresh(asset)
    return _serialize(asset)


@router.post("/{asset_id}/review")
async def review_media(
    asset_id: int,
    payload: ReviewDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Approve (-> public), reject (-> private + note), or unpublish (-> private)."""
    asset = _load_asset(db, asset_id)

    if payload.decision == "approve":
        if asset.status not in ("private", "submitted"):
            raise HTTPException(status_code=400, detail="This media is already public.")
        asset.status = "public"
        asset.review_note = None
    elif payload.decision == "reject":
        if asset.status != "submitted":
            raise HTTPException(status_code=400, detail="Only submitted media can be rejected.")
        asset.status = "private"
        asset.review_note = payload.note
    else:  # unpublish
        if asset.status != "public":
            raise HTTPException(status_code=400, detail="Only public media can be unpublished.")
        _refuse_if_in_use(asset, db, "unpublish")
        asset.status = "private"
        asset.review_note = payload.note

    asset.reviewed_by_id = current_user.id
    asset.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(asset)
    return _serialize(asset)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v`

Expected: PASS, 45 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/media_library.py backend/tests/test_media_library_api.py
git commit -m "feat: submit-for-review and approve/reject/unpublish transitions"
```

---

### Task 9: Delete

**Files:**
- Modify: `backend/routers/media_library.py`
- Test: `backend/tests/test_media_library_api.py` (append)

**Context you need:** An owner may delete only their own **private** media — once something has been submitted or published, removing it is a review decision. Deletion is refused entirely while site content references the asset. The row goes in the transaction; the object goes after the commit, so a failed object delete leaves an orphan for `cleanup.py` rather than a row pointing at nothing.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_media_library_api.py`:

```python
# ── Delete ───────────────────────────────────────────────────────────

def test_owner_deletes_their_own_private_asset(
    client, db_session, field_staff_headers, field_staff_user, fake_s3
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg")
    fake_s3[asset.object_key] = (b"bytes", "image/jpeg")

    response = client.delete(f"/api/media-library/{asset.id}", headers=field_staff_headers)
    assert response.status_code == 200, response.text

    assert db_session.query(MediaAsset).filter(MediaAsset.id == asset.id).first() is None
    assert asset.object_key not in fake_s3


def test_owner_cannot_delete_a_public_asset(
    client, db_session, field_staff_headers, field_staff_user, fake_s3
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    response = client.delete(f"/api/media-library/{asset.id}", headers=field_staff_headers)
    assert response.status_code == 403


def test_an_admin_can_delete_a_public_asset(
    client, db_session, auth_headers, field_staff_user, fake_s3
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    response = client.delete(f"/api/media-library/{asset.id}", headers=auth_headers)
    assert response.status_code == 200


def test_delete_is_refused_while_the_site_uses_the_asset(
    client, db_session, auth_headers, field_staff_user, fake_s3
):
    from models import GalleryItem

    asset = _make_asset(db_session, field_staff_user.id, filename="a.jpg", status="public")
    db_session.add(GalleryItem(media_filename=f"/api/media-library/{asset.id}/file"))
    db_session.commit()

    response = client.delete(f"/api/media-library/{asset.id}", headers=auth_headers)
    assert response.status_code == 409
    assert db_session.query(MediaAsset).filter(MediaAsset.id == asset.id).first() is not None


def test_deleting_another_members_asset_is_a_404(
    client, db_session, field_staff_headers, other_field_staff_user, fake_s3
):
    asset = _make_asset(db_session, other_field_staff_user.id, filename="theirs.jpg")
    response = client.delete(f"/api/media-library/{asset.id}", headers=field_staff_headers)
    assert response.status_code == 404


def test_delete_also_removes_the_thumbnail(
    client, db_session, auth_headers, field_staff_user, fake_s3
):
    asset = _make_asset(db_session, field_staff_user.id, filename="a.mp4", media_type="video")
    asset.thumbnail_key = "workspaces/1/2026/03/a_thumb.jpg"
    db_session.commit()
    fake_s3[asset.object_key] = (b"v", "video/mp4")
    fake_s3[asset.thumbnail_key] = (b"t", "image/jpeg")

    client.delete(f"/api/media-library/{asset.id}", headers=auth_headers)
    assert fake_s3 == {}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v -k delete`

Expected: FAIL — 405 Method Not Allowed.

- [ ] **Step 3: Write the endpoint**

Append to `backend/routers/media_library.py`:

```python
@router.delete("/{asset_id}")
async def delete_media(
    asset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_staff),
):
    """Remove an asset. Owners may only delete their own still-private media."""
    asset = _load_asset(db, asset_id)
    _require_can_edit(asset, current_user)

    is_privileged = role_of(current_user) in ("admin", "manager")
    if not is_privileged and asset.status != "private":
        raise HTTPException(
            status_code=403,
            detail="Once media has been submitted or published, an admin must remove it.",
        )

    _refuse_if_in_use(asset, db, "delete")

    object_key = asset.object_key
    thumbnail_key = asset.thumbnail_key

    db.delete(asset)
    db.commit()

    # After the commit: a failed object delete leaves an orphan for cleanup.py to
    # sweep, which is recoverable. A row pointing at deleted bytes is not.
    delete_file(object_key, cleanup_db=False)
    if thumbnail_key:
        delete_file(thumbnail_key, cleanup_db=False)

    return {"message": "Media deleted", "id": asset_id}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_media_library_api.py -v`

Expected: PASS, 51 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/media_library.py backend/tests/test_media_library_api.py
git commit -m "feat: delete media with an in-use guard"
```

---

### Task 10: Byte serving

**Files:**
- Modify: `backend/auth_utils.py` (add `get_optional_user`)
- Modify: `backend/routers/static_files.py` (extract `stream_s3_object`)
- Create: `backend/routers/media_library_files.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_media_library_permissions.py`

**Context you need:** This is the security-critical path, which is why it is its own module and its own test file. `static_files.py:92-226` (`serve_video`) already implements Range, HEAD and full-body serving from S3; three other routes in that file duplicate it. Extract that logic once as `stream_s3_object` and have both `serve_video` and the new route call it.

**The cache header differs by status.** Public assets get `public, max-age=86400` like today. Private and submitted assets must get `private, no-store` — otherwise an intermediary could cache a beneficiary photo.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_media_library_permissions.py`:

```python
"""The security-critical matrix: who can read which bytes, and who can call what."""
import pytest

from models import MediaAsset


@pytest.fixture
def fake_s3_read(monkeypatch):
    """Serve fixed bytes for any object key.

    Note the two different patch targets: the existence check runs in
    media_library_files, but the bytes are fetched inside stream_s3_object,
    which lives in static_files.
    """
    monkeypatch.setattr("routers.media_library_files.file_exists", lambda key: True)
    monkeypatch.setattr(
        "routers.static_files.get_file_info",
        lambda key: {"size": 5, "content_type": "image/jpeg", "last_modified": None, "etag": "x"},
    )
    monkeypatch.setattr("routers.static_files.download_file", lambda key: b"bytes")


def _asset(db_session, owner_id, status="private", media_type="image"):
    asset = MediaAsset(
        owner_id=owner_id,
        object_key=f"workspaces/{owner_id}/2026/03/{status}-{media_type}.jpg",
        filename="a.jpg",
        media_type=media_type,
        content_type="image/jpeg",
        size_bytes=5,
        search_text="a.jpg",
        status=status,
    )
    db_session.add(asset)
    db_session.commit()
    db_session.refresh(asset)
    return asset


# ── Serving ──────────────────────────────────────────────────────────

def test_a_public_asset_is_served_without_authentication(
    client, db_session, field_staff_user, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="public")
    response = client.get(f"/api/media-library/{asset.id}/file")
    assert response.status_code == 200
    assert response.content == b"bytes"
    assert "max-age" in response.headers["cache-control"]


def test_a_private_asset_is_not_served_anonymously(
    client, db_session, field_staff_user, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")
    response = client.get(f"/api/media-library/{asset.id}/file")
    assert response.status_code == 404


def test_a_private_asset_is_hidden_from_another_member(
    client, db_session, other_field_staff_user, field_staff_headers, fake_s3_read
):
    asset = _asset(db_session, other_field_staff_user.id, status="private")
    response = client.get(f"/api/media-library/{asset.id}/file", headers=field_staff_headers)
    assert response.status_code == 404, "a 403 here would confirm the asset exists"


def test_a_private_asset_is_served_to_its_owner(
    client, db_session, field_staff_user, field_staff_headers, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")
    response = client.get(f"/api/media-library/{asset.id}/file", headers=field_staff_headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"


def test_a_private_asset_is_served_to_an_admin(
    client, db_session, field_staff_user, auth_headers, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")
    response = client.get(f"/api/media-library/{asset.id}/file", headers=auth_headers)
    assert response.status_code == 200


def test_a_submitted_asset_is_still_private(
    client, db_session, field_staff_user, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="submitted")
    assert client.get(f"/api/media-library/{asset.id}/file").status_code == 404


def test_a_missing_asset_is_a_404(client, fake_s3_read):
    assert client.get("/api/media-library/999999/file").status_code == 404


def test_a_donor_gets_no_more_than_an_anonymous_caller(
    client, db_session, field_staff_user, donor_headers, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="private")
    response = client.get(f"/api/media-library/{asset.id}/file", headers=donor_headers)
    assert response.status_code == 404


def test_range_requests_return_partial_content(
    client, db_session, field_staff_user, monkeypatch, fake_s3_read
):
    asset = _asset(db_session, field_staff_user.id, status="public", media_type="video")

    class _Body:
        def read(self):
            return b"yt"

    class _Client:
        def get_object(self, Bucket, Key, Range):
            return {"Body": _Body()}

    monkeypatch.setattr("routers.static_files.get_s3_client", lambda: _Client())

    response = client.get(f"/api/media-library/{asset.id}/file", headers={"Range": "bytes=1-2"})
    assert response.status_code == 206
    assert response.headers["content-range"] == "bytes 1-2/5"


# ── Endpoint permission matrix ───────────────────────────────────────

@pytest.mark.parametrize(
    "method,path_suffix,body",
    [
        ("get", "", None),
        ("get", "/workspaces", None),
    ],
)
def test_donors_are_refused_everywhere(client, donor_headers, method, path_suffix, body):
    response = getattr(client, method)(
        f"/api/media-library{path_suffix}", headers=donor_headers
    )
    assert response.status_code == 403


def test_field_staff_are_refused_on_manager_only_endpoints(
    client, db_session, field_staff_headers, field_staff_user
):
    asset = _asset(db_session, field_staff_user.id, status="submitted")
    assert client.get("/api/media-library/workspaces", headers=field_staff_headers).status_code == 403
    assert client.post(
        f"/api/media-library/{asset.id}/review",
        headers=field_staff_headers,
        json={"decision": "approve"},
    ).status_code == 403
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_media_library_permissions.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'routers.media_library_files'`.

- [ ] **Step 3: Add the optional-auth dependency**

In `backend/auth_utils.py`, add beside the existing `security` object:

```python
optional_security = HTTPBearer(auto_error=False)


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db)
):
    """Current user if a valid token is present, otherwise None.

    Used by routes that serve public content to anonymous callers but must still
    recognise a signed-in owner.
    """
    if credentials is None:
        return None
    email = verify_token(credentials.credentials)
    if email is None:
        return None
    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        return None
    return user
```

Add `Optional` to the `typing` import at the top of the file if it is not already imported.

- [ ] **Step 4: Extract the streaming helper**

In `backend/routers/static_files.py`, add after `get_content_type`:

```python
def stream_s3_object(
    object_key: str,
    request: Request,
    content_type: str = None,
    cache_control: str = 'public, max-age=86400',
):
    """Serve one S3 object, honouring HEAD and Range requests.

    Shared by the media-library routes and the legacy per-section video routes so
    range handling exists in exactly one place.
    """
    file_info = get_file_info(object_key)
    if not file_info:
        raise HTTPException(status_code=404, detail="File not found in S3")

    file_size = file_info['size']
    resolved_type = content_type or file_info.get('content_type') or get_content_type(object_key)

    base_headers = {
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Cache-Control': cache_control,
    }

    if request.method == 'HEAD':
        return Response(
            status_code=200,
            headers={**base_headers, 'Content-Type': resolved_type,
                     'Content-Length': str(file_size)},
        )

    range_header = request.headers.get('range')
    if range_header:
        bounds = range_header.replace('bytes=', '').split('-')
        start = int(bounds[0]) if bounds[0] else 0
        end = int(bounds[1]) if len(bounds) > 1 and bounds[1] else file_size - 1
        if start >= file_size:
            raise HTTPException(status_code=416, detail="Range Not Satisfiable")
        end = min(end, file_size - 1)

        client = get_s3_client()
        s3_response = client.get_object(
            Bucket=S3_BUCKET_NAME, Key=object_key, Range=f'bytes={start}-{end}'
        )
        chunk = s3_response['Body'].read()
        return Response(
            content=chunk,
            status_code=206,
            media_type=resolved_type,
            headers={**base_headers,
                     'Content-Range': f'bytes {start}-{end}/{file_size}',
                     'Content-Length': str(len(chunk)),
                     'Content-Type': resolved_type},
        )

    content = download_file(object_key)
    if content is None:
        raise HTTPException(status_code=404, detail="File not found in S3")
    return Response(
        content=content,
        media_type=resolved_type,
        headers={**base_headers, 'Content-Length': str(file_size)},
    )
```

Add `get_s3_client` and `S3_BUCKET_NAME` to the `from s3_service import ...` line at the top of `static_files.py`. These must be **module-level** imports, not function-local ones: the range test monkeypatches `routers.static_files.get_s3_client`, and a function-local `from s3_service import ...` would re-fetch the real object at call time and ignore the patch.

Then replace the body of `serve_video`'s S3 branch (`static_files.py:126-219`) with a call to it, keeping the existing key-resolution logic above it intact:

```python
    if object_key and file_exists(object_key):
        try:
            logger.info("Serving video from S3: %s", object_key)
            return stream_s3_object(object_key, request, content_type='video/mp4')
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            logger.error("Error serving video from S3: %s", object_key)
            logger.error("   Error: %s", str(e))
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Failed to retrieve video from S3: {str(e)}")
```

Leave the other three video routes alone in this task — they are unrelated to this feature and changing them widens the blast radius.

- [ ] **Step 5: Write the serving router**

Create `backend/routers/media_library_files.py`:

```python
"""Media library byte serving.

  GET /api/media-library/{id}/file   the asset itself
  GET /api/media-library/{id}/thumb  its thumbnail

Kept apart from media_library.py because this is the path where a mistake leaks a
photo. There is exactly one rule here, and it reads the `status` column:

  public              -> anyone, cacheable
  private | submitted -> the owner, an admin or a manager; everyone else gets 404
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from auth_utils import role_of, get_optional_user
from database import get_db
from logging_config import get_logger
from models import MediaAsset, User
from routers.static_files import stream_s3_object
from s3_service import download_file, file_exists

logger = get_logger(__name__)
router = APIRouter()

PUBLIC_CACHE = 'public, max-age=86400'
PRIVATE_CACHE = 'private, no-store'


def _visible_asset(db: Session, asset_id: int, user: Optional[User]) -> MediaAsset:
    """The asset, if this caller may read its bytes. Otherwise 404.

    404 rather than 403 throughout: a 403 tells an unauthorised caller that the
    asset exists.
    """
    asset = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="Media not found")

    if asset.status == "public":
        return asset
    if user is None:
        raise HTTPException(status_code=404, detail="Media not found")
    if role_of(user) in ("admin", "manager"):
        return asset
    if asset.owner_id == user.id:
        return asset
    raise HTTPException(status_code=404, detail="Media not found")


@router.get("/{asset_id}/file")
@router.head("/{asset_id}/file")
async def serve_media_file(
    asset_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Serve the asset bytes, subject to its status."""
    asset = _visible_asset(db, asset_id, user)

    if not file_exists(asset.object_key):
        logger.warning("Media row %s points at a missing object %s", asset.id, asset.object_key)
        raise HTTPException(status_code=404, detail="Media not found")

    return stream_s3_object(
        asset.object_key,
        request,
        content_type=asset.content_type,
        cache_control=PUBLIC_CACHE if asset.status == "public" else PRIVATE_CACHE,
    )


@router.get("/{asset_id}/thumb")
async def serve_media_thumbnail(
    asset_id: int,
    request: Request,
    w: int = 0,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Serve the thumbnail, falling back to the image itself when there is none."""
    from fastapi.responses import Response
    from image_cache import cache_get, cache_put, make_cache_key, resize_image

    asset = _visible_asset(db, asset_id, user)
    key = asset.thumbnail_key or (asset.object_key if asset.media_type == "image" else None)
    if key is None:
        raise HTTPException(status_code=404, detail="No thumbnail for this media")

    cache_control = PUBLIC_CACHE if asset.status == "public" else PRIVATE_CACHE

    if not w:
        return stream_s3_object(key, request, content_type="image/jpeg",
                                cache_control=cache_control)

    cache_key = make_cache_key(key, width=w, fmt="jpeg")
    cached = cache_get(cache_key)
    if cached is not None:
        data, content_type = cached
        return Response(content=data, media_type=content_type,
                        headers={'Cache-Control': cache_control})

    original = download_file(key)
    if original is None:
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    data, content_type = resize_image(original, width=w, fmt="jpeg")
    cache_put(cache_key, data, content_type)
    return Response(content=data, media_type=content_type,
                    headers={'Cache-Control': cache_control})
```

Before running the tests, confirm the `resize_image` signature matches this call:
Run: `cd backend && sed -n '61,80p' image_cache.py`
If its parameters differ, adjust the call rather than the module.

- [ ] **Step 6: Register the serving router**

In `backend/main.py`, add immediately after the `media_library` registration:

```python
app.include_router(media_library_files.router, prefix="/api/media-library", tags=["media-library"])
```

Add `media_library_files` to the `from routers import (...)` block.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_media_library_permissions.py -v`

Expected: PASS, 12 tests (the parametrized donor case counts as 2).

Then confirm nothing regressed in the existing serving path:

Run: `cd backend && python -m pytest tests -v`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/auth_utils.py backend/routers/static_files.py backend/routers/media_library_files.py backend/main.py backend/tests/test_media_library_permissions.py
git commit -m "feat: serve media bytes with per-asset access control"
```

---

## Phase 4 — Frontend

### Task 11: Typed API client

**Files:**
- Create: `frontend/src/utils/mediaLibraryApi.ts`
- Test: `frontend/src/utils/__tests__/mediaLibraryApi.test.ts`

**Context you need:** `frontend/src/utils/api.ts` exports a configured axios instance as its default export, with an interceptor that attaches `auth_token` and redirects to `/login` on 401. Reuse it — do not create a second axios instance. `getStaticFileUrl()` from the same module turns an `/api/...` path into an absolute URL, which `<img>` and `<video>` elements need in development where Vite proxies only some paths.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/__tests__/mediaLibraryApi.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildListParams, mediaLibraryApi } from '../mediaLibraryApi'
import api from '../api'

vi.mock('../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getStaticFileUrl: (path: string) => `http://api.test${path}`,
}))

describe('buildListParams', () => {
  it('omits empty values so the URL stays clean', () => {
    expect(buildListParams({ q: '', type: 'all', page: 1 })).toEqual({ page: 1 })
  })

  it('keeps real filters', () => {
    expect(
      buildListParams({ q: 'gaza', type: 'video', status: 'submitted', tag: 'well', page: 2 })
    ).toEqual({ q: 'gaza', type: 'video', status: 'submitted', tag: 'well', page: 2 })
  })

  it('passes ownerId through as owner_id', () => {
    expect(buildListParams({ ownerId: 'unassigned' })).toEqual({ owner_id: 'unassigned' })
  })

  it('treats a null ownerId as no filter', () => {
    expect(buildListParams({ ownerId: null })).toEqual({})
  })
})

describe('mediaLibraryApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists with the built params', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 48 } })
    await mediaLibraryApi.list({ q: 'gaza', type: 'all' })
    expect(api.get).toHaveBeenCalledWith('/api/media-library', { params: { q: 'gaza' } })
  })

  it('uploads as multipart with the metadata fields', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 1 } })
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    await mediaLibraryApi.upload(file, { title: 'T', description: 'D', tags: ['a', 'b'] })

    const [url, body] = vi.mocked(api.post).mock.calls[0]
    expect(url).toBe('/api/media-library')
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('title')).toBe('T')
    expect((body as FormData).get('tags')).toBe('a,b')
  })

  it('builds an absolute thumbnail URL with a width', () => {
    expect(mediaLibraryApi.thumbUrl(7, 400)).toBe('http://api.test/api/media-library/7/thumb?w=400')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/utils/__tests__/mediaLibraryApi.test.ts`

Expected: FAIL — cannot resolve `../mediaLibraryApi`.

- [ ] **Step 3: Write the client**

Create `frontend/src/utils/mediaLibraryApi.ts`:

```typescript
import api, { getStaticFileUrl } from './api'

export type MediaStatus = 'private' | 'submitted' | 'public'
export type MediaType = 'image' | 'video'

export interface MediaAsset {
  id: number
  owner_id: number | null
  object_key: string
  filename: string
  media_type: MediaType
  content_type: string
  size_bytes: number
  width: number | null
  height: number | null
  duration_seconds: number | null
  title: string | null
  description: string | null
  tags: string[]
  status: MediaStatus
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  url: string
  thumbnail_url: string | null
}

export interface MediaAssetDetail extends MediaAsset {
  usage: Record<string, unknown[]>
  usage_count: number
}

export interface MediaListResponse {
  items: MediaAsset[]
  total: number
  page: number
  page_size: number
}

export interface Workspace {
  owner_id: number | null
  owner_name: string
  owner_email: string | null
  asset_count: number
  total_bytes: number
  submitted_count: number
}

export interface ListQuery {
  q?: string
  type?: MediaType | 'all'
  status?: MediaStatus | 'all'
  tag?: string
  ownerId?: number | 'unassigned' | null
  sort?: 'created_at' | 'filename' | 'title' | 'size' | 'type'
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

/** Drop empty / "all" filters so the request URL only carries real constraints. */
export function buildListParams(query: ListQuery): Record<string, string | number> {
  const params: Record<string, string | number> = {}
  if (query.q) params.q = query.q
  if (query.type && query.type !== 'all') params.type = query.type
  if (query.status && query.status !== 'all') params.status = query.status
  if (query.tag) params.tag = query.tag
  if (query.ownerId !== undefined && query.ownerId !== null) params.owner_id = query.ownerId
  if (query.sort) params.sort = query.sort
  if (query.order) params.order = query.order
  if (query.page) params.page = query.page
  if (query.pageSize) params.page_size = query.pageSize
  return params
}

export const mediaLibraryApi = {
  async list(query: ListQuery = {}): Promise<MediaListResponse> {
    const { data } = await api.get('/api/media-library', { params: buildListParams(query) })
    return data
  },

  async detail(id: number): Promise<MediaAssetDetail> {
    const { data } = await api.get(`/api/media-library/${id}`)
    return data
  },

  async upload(
    file: File,
    meta: { title?: string; description?: string; tags?: string[] } = {},
    onProgress?: (percent: number) => void
  ): Promise<MediaAsset> {
    const form = new FormData()
    form.append('file', file)
    if (meta.title) form.append('title', meta.title)
    if (meta.description) form.append('description', meta.description)
    if (meta.tags?.length) form.append('tags', meta.tags.join(','))

    const { data } = await api.post('/api/media-library', form, {
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      },
    })
    return data
  },

  async update(
    id: number,
    fields: { title?: string | null; description?: string | null; tags?: string[] }
  ): Promise<MediaAsset> {
    const { data } = await api.patch(`/api/media-library/${id}`, fields)
    return data
  },

  async submit(id: number): Promise<MediaAsset> {
    const { data } = await api.post(`/api/media-library/${id}/submit`)
    return data
  },

  async review(
    id: number,
    decision: 'approve' | 'reject' | 'unpublish',
    note?: string
  ): Promise<MediaAsset> {
    const { data } = await api.post(`/api/media-library/${id}/review`, { decision, note })
    return data
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/api/media-library/${id}`)
  },

  async reassign(id: number, ownerId: number | null): Promise<MediaAsset> {
    const { data } = await api.post(`/api/media-library/${id}/reassign`, { owner_id: ownerId })
    return data
  },

  async workspaces(): Promise<{ workspaces: Workspace[] }> {
    const { data } = await api.get('/api/media-library/workspaces')
    return data
  },

  /** Absolute URL — <img> and <video> cannot use the relative API path in dev. */
  fileUrl(id: number): string {
    return getStaticFileUrl(`/api/media-library/${id}/file`)
  },

  thumbUrl(id: number, width?: number): string {
    const suffix = width ? `?w=${width}` : ''
    return getStaticFileUrl(`/api/media-library/${id}/thumb${suffix}`)
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/utils/__tests__/mediaLibraryApi.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/mediaLibraryApi.ts frontend/src/utils/__tests__/mediaLibraryApi.test.ts
git commit -m "feat: typed client for the media library API"
```

---

### Task 12: MediaCard and MediaGrid

**Files:**
- Create: `frontend/src/components/media/MediaCard.tsx`
- Create: `frontend/src/components/media/MediaGrid.tsx`
- Test: `frontend/src/components/media/__tests__/MediaGrid.test.tsx`

**Context you need:** Both admin pages render the same grid, so these components take everything through props and hold no data-fetching logic. That is what keeps `AdminMediaWorkspace` and `AdminMediaLibrary` small — the 743-line `AdminS3Media.tsx` is the shape to avoid.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/media/__tests__/MediaGrid.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MediaGrid from '../MediaGrid'
import type { MediaAsset } from '../../../utils/mediaLibraryApi'

const asset = (overrides: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 1,
  owner_id: 3,
  object_key: 'workspaces/3/2026/03/a.jpg',
  filename: 'IMG_4821.jpg',
  media_type: 'image',
  content_type: 'image/jpeg',
  size_bytes: 2048,
  width: 800,
  height: 600,
  duration_seconds: null,
  title: null,
  description: null,
  tags: [],
  status: 'private',
  review_note: null,
  reviewed_at: null,
  created_at: '2026-03-14T10:00:00Z',
  updated_at: '2026-03-14T10:00:00Z',
  url: '/api/media-library/1/file',
  thumbnail_url: '/api/media-library/1/thumb',
  ...overrides,
})

describe('MediaGrid', () => {
  it('shows the empty state when there is nothing to show', () => {
    render(<MediaGrid items={[]} loading={false} onSelect={vi.fn()} />)
    expect(screen.getByText(/no media yet/i)).toBeInTheDocument()
  })

  it('shows a skeleton while loading rather than the empty state', () => {
    render(<MediaGrid items={[]} loading onSelect={vi.fn()} />)
    expect(screen.queryByText(/no media yet/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('media-grid-loading')).toBeInTheDocument()
  })

  it('falls back to the filename when an asset has no title', () => {
    render(<MediaGrid items={[asset()]} loading={false} onSelect={vi.fn()} />)
    expect(screen.getByText('IMG_4821.jpg')).toBeInTheDocument()
  })

  it('prefers the title when one is set', () => {
    render(<MediaGrid items={[asset({ title: 'Well opening' })]} loading={false} onSelect={vi.fn()} />)
    expect(screen.getByText('Well opening')).toBeInTheDocument()
  })

  it('labels the status so private media is obvious at a glance', () => {
    render(<MediaGrid items={[asset({ status: 'submitted' })]} loading={false} onSelect={vi.fn()} />)
    expect(screen.getByText(/in review/i)).toBeInTheDocument()
  })

  it('calls onSelect with the asset when a card is clicked', () => {
    const onSelect = vi.fn()
    const item = asset()
    render(<MediaGrid items={[item]} loading={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /IMG_4821.jpg/i }))
    expect(onSelect).toHaveBeenCalledWith(item)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/media/__tests__/MediaGrid.test.tsx`

Expected: FAIL — cannot resolve `../MediaGrid`.

- [ ] **Step 3: Write MediaCard**

Create `frontend/src/components/media/MediaCard.tsx`:

```tsx
import { Film, Image as ImageIcon, Lock, Clock, Globe } from 'lucide-react'
import { clsx } from 'clsx'
import { mediaLibraryApi, type MediaAsset } from '../../utils/mediaLibraryApi'

const STATUS_META = {
  private: { label: 'Private', icon: Lock, className: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'In review', icon: Clock, className: 'bg-amber-100 text-amber-800' },
  public: { label: 'Public', icon: Globe, className: 'bg-emerald-100 text-emerald-800' },
} as const

/** Shared by the card, the drawer and the workspace sidebar — define it once here. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

interface MediaCardProps {
  asset: MediaAsset
  onSelect: (asset: MediaAsset) => void
}

const MediaCard = ({ asset, onSelect }: MediaCardProps) => {
  const status = STATUS_META[asset.status]
  const StatusIcon = status.icon
  const label = asset.title || asset.filename

  return (
    <button
      type="button"
      onClick={() => onSelect(asset)}
      aria-label={label}
      className="group text-left bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-emerald-400 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-emerald-500"
    >
      <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
        {asset.thumbnail_url ? (
          <img
            src={mediaLibraryApi.thumbUrl(asset.id, 400)}
            alt={label}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : asset.media_type === 'video' ? (
          <Film className="w-10 h-10 text-gray-400" />
        ) : (
          <ImageIcon className="w-10 h-10 text-gray-400" />
        )}
      </div>

      <div className="p-2.5">
        <p className="text-sm font-medium text-gray-900 truncate" title={label}>
          {label}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span
            className={clsx(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
              status.className
            )}
          >
            <StatusIcon className="w-3 h-3" />
            {status.label}
          </span>
          <span className="text-[11px] text-gray-500">{formatBytes(asset.size_bytes)}</span>
        </div>
      </div>
    </button>
  )
}

export default MediaCard
```

- [ ] **Step 4: Write MediaGrid**

Create `frontend/src/components/media/MediaGrid.tsx`:

```tsx
import { ImageOff } from 'lucide-react'
import MediaCard from './MediaCard'
import type { MediaAsset } from '../../utils/mediaLibraryApi'

interface MediaGridProps {
  items: MediaAsset[]
  loading: boolean
  onSelect: (asset: MediaAsset) => void
  emptyHint?: string
}

const MediaGrid = ({ items, loading, onSelect, emptyHint }: MediaGridProps) => {
  if (loading) {
    return (
      <div
        data-testid="media-grid-loading"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4"
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="bg-gray-100 rounded-lg aspect-square animate-pulse" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <ImageOff className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">No media yet</p>
        <p className="text-sm text-gray-500 mt-1">
          {emptyHint || 'Upload a photo or video to get started.'}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {items.map((asset) => (
        <MediaCard key={asset.id} asset={asset} onSelect={onSelect} />
      ))}
    </div>
  )
}

export default MediaGrid
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/media/__tests__/MediaGrid.test.tsx`

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/media/MediaCard.tsx frontend/src/components/media/MediaGrid.tsx frontend/src/components/media/__tests__/MediaGrid.test.tsx
git commit -m "feat: media card and grid components"
```

---

### Task 13: MediaFilters

**Files:**
- Create: `frontend/src/components/media/MediaFilters.tsx`
- Test: `frontend/src/components/media/__tests__/MediaFilters.test.tsx`

**Context you need:** The search box is debounced so typing does not fire a request per keystroke. The component is fully controlled — it owns no filter state, only the debounce timer for the text input.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/media/__tests__/MediaFilters.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import MediaFilters from '../MediaFilters'
import type { ListQuery } from '../../../utils/mediaLibraryApi'

const baseQuery: ListQuery = { q: '', type: 'all', status: 'all', sort: 'created_at', order: 'desc' }

describe('MediaFilters', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces the search box instead of firing per keystroke', () => {
    const onChange = vi.fn()
    render(<MediaFilters query={baseQuery} onChange={onChange} showStatusFilter />)

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'gaza' } })
    expect(onChange).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(350) })
    expect(onChange).toHaveBeenCalledWith({ q: 'gaza' })
  })

  it('reports a type change immediately', () => {
    const onChange = vi.fn()
    render(<MediaFilters query={baseQuery} onChange={onChange} showStatusFilter />)
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'video' } })
    expect(onChange).toHaveBeenCalledWith({ type: 'video' })
  })

  it('hides the status filter when asked to', () => {
    render(<MediaFilters query={baseQuery} onChange={vi.fn()} showStatusFilter={false} />)
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument()
  })

  it('flips sort order when the direction button is pressed', () => {
    const onChange = vi.fn()
    render(<MediaFilters query={baseQuery} onChange={onChange} showStatusFilter />)
    fireEvent.click(screen.getByRole('button', { name: /sort direction/i }))
    expect(onChange).toHaveBeenCalledWith({ order: 'asc' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/media/__tests__/MediaFilters.test.tsx`

Expected: FAIL — cannot resolve `../MediaFilters`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/media/MediaFilters.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Search, ArrowUpDown } from 'lucide-react'
import type { ListQuery } from '../../utils/mediaLibraryApi'

interface MediaFiltersProps {
  query: ListQuery
  onChange: (patch: Partial<ListQuery>) => void
  showStatusFilter: boolean
}

const SEARCH_DEBOUNCE_MS = 300

const MediaFilters = ({ query, onChange, showStatusFilter }: MediaFiltersProps) => {
  const [searchText, setSearchText] = useState(query.q || '')

  // Keep the box in step when the parent resets filters.
  useEffect(() => {
    setSearchText(query.q || '')
  }, [query.q])

  // Debounce: one request per pause in typing, not one per keystroke.
  useEffect(() => {
    if (searchText === (query.q || '')) return
    const timer = setTimeout(() => onChange({ q: searchText }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText])

  const selectClass =
    'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[220px]">
        <label htmlFor="media-search" className="block text-xs font-medium text-gray-600 mb-1">
          Search
        </label>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="media-search"
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search name, title, description or tags"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="media-type" className="block text-xs font-medium text-gray-600 mb-1">
          Type
        </label>
        <select
          id="media-type"
          value={query.type || 'all'}
          onChange={(e) => onChange({ type: e.target.value as ListQuery['type'] })}
          className={selectClass}
        >
          <option value="all">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
      </div>

      {showStatusFilter && (
        <div>
          <label htmlFor="media-status" className="block text-xs font-medium text-gray-600 mb-1">
            Status
          </label>
          <select
            id="media-status"
            value={query.status || 'all'}
            onChange={(e) => onChange({ status: e.target.value as ListQuery['status'] })}
            className={selectClass}
          >
            <option value="all">All statuses</option>
            <option value="private">Private</option>
            <option value="submitted">In review</option>
            <option value="public">Public</option>
          </select>
        </div>
      )}

      <div>
        <label htmlFor="media-sort" className="block text-xs font-medium text-gray-600 mb-1">
          Sort by
        </label>
        <div className="flex gap-1">
          <select
            id="media-sort"
            value={query.sort || 'created_at'}
            onChange={(e) => onChange({ sort: e.target.value as ListQuery['sort'] })}
            className={selectClass}
          >
            <option value="created_at">Date added</option>
            <option value="filename">File name</option>
            <option value="title">Title</option>
            <option value="size">Size</option>
            <option value="type">Type</option>
          </select>
          <button
            type="button"
            aria-label="Toggle sort direction"
            title={query.order === 'asc' ? 'Ascending' : 'Descending'}
            onClick={() => onChange({ order: query.order === 'asc' ? 'desc' : 'asc' })}
            className="px-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <ArrowUpDown className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default MediaFilters
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/media/__tests__/MediaFilters.test.tsx`

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/media/MediaFilters.tsx frontend/src/components/media/__tests__/MediaFilters.test.tsx
git commit -m "feat: media filter bar with debounced search"
```

---

### Task 14: MediaUploader

**Files:**
- Create: `frontend/src/components/media/MediaUploader.tsx`
- Test: `frontend/src/components/media/__tests__/MediaUploader.test.tsx`

**Context you need:** Uploads run one at a time so a phone-sized video does not saturate the connection, and each file reports its own progress and its own error. A 409 (duplicate) is an expected outcome, not a failure — it is reported as "already in your workspace".

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/media/__tests__/MediaUploader.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MediaUploader from '../MediaUploader'
import { mediaLibraryApi } from '../../../utils/mediaLibraryApi'

vi.mock('../../../utils/mediaLibraryApi', () => ({
  mediaLibraryApi: { upload: vi.fn() },
}))

const file = (name: string) => new File(['bytes'], name, { type: 'image/jpeg' })

describe('MediaUploader', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploads each selected file and reports completion once', async () => {
    vi.mocked(mediaLibraryApi.upload).mockResolvedValue({ id: 1 } as never)
    const onUploaded = vi.fn()
    render(<MediaUploader onUploaded={onUploaded} />)

    fireEvent.change(screen.getByTestId('media-file-input'), {
      target: { files: [file('a.jpg'), file('b.jpg')] },
    })

    await waitFor(() => expect(mediaLibraryApi.upload).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
  })

  it('shows a duplicate as an explanation, not a crash', async () => {
    vi.mocked(mediaLibraryApi.upload).mockRejectedValue({
      response: { status: 409, data: { detail: { message: 'This file is already in your workspace.' } } },
    })
    render(<MediaUploader onUploaded={vi.fn()} />)

    fireEvent.change(screen.getByTestId('media-file-input'), { target: { files: [file('a.jpg')] } })

    expect(await screen.findByText(/already in your workspace/i)).toBeInTheDocument()
  })

  it('surfaces a size rejection from the server', async () => {
    vi.mocked(mediaLibraryApi.upload).mockRejectedValue({
      response: { status: 413, data: { detail: 'File is larger than the 100 MB limit.' } },
    })
    render(<MediaUploader onUploaded={vi.fn()} />)

    fireEvent.change(screen.getByTestId('media-file-input'), { target: { files: [file('big.jpg')] } })

    expect(await screen.findByText(/larger than the 100 MB limit/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/media/__tests__/MediaUploader.test.tsx`

Expected: FAIL — cannot resolve `../MediaUploader`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/media/MediaUploader.tsx`:

```tsx
import { useRef, useState } from 'react'
import { UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { mediaLibraryApi } from '../../utils/mediaLibraryApi'

interface UploadItem {
  name: string
  percent: number
  state: 'uploading' | 'done' | 'error'
  message?: string
}

interface MediaUploaderProps {
  onUploaded: () => void
}

/** Pull a readable message out of a FastAPI error body. */
function errorMessage(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: unknown }).message)
  }
  return 'Upload failed. Please try again.'
}

const MediaUploader = ({ onUploaded }: MediaUploaderProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return

    setItems(files.map((f) => ({ name: f.name, percent: 0, state: 'uploading' as const })))

    let anySucceeded = false

    // Sequential on purpose: a phone-sized video should not have to share the
    // connection with five others.
    for (let index = 0; index < files.length; index += 1) {
      try {
        await mediaLibraryApi.upload(files[index], {}, (percent) => {
          setItems((current) =>
            current.map((item, i) => (i === index ? { ...item, percent } : item))
          )
        })
        anySucceeded = true
        setItems((current) =>
          current.map((item, i) =>
            i === index ? { ...item, percent: 100, state: 'done' } : item
          )
        )
      } catch (error) {
        setItems((current) =>
          current.map((item, i) =>
            i === index ? { ...item, state: 'error', message: errorMessage(error) } : item
          )
        )
      }
    }

    if (anySucceeded) onUploaded()
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition',
          dragging ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400'
        )}
      >
        <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-700">
          Drop photos or videos here, or click to choose
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Uploads land in your workspace as private until an admin publishes them.
        </p>
        <input
          ref={inputRef}
          data-testid="media-file-input"
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex items-center gap-3 text-sm">
              {item.state === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {item.state === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
              <span className="truncate max-w-[200px] text-gray-700">{item.name}</span>
              {item.state === 'uploading' && (
                <div className="flex-1 h-1.5 bg-gray-200 rounded overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${item.percent}%` }} />
                </div>
              )}
              {item.message && <span className="text-red-600">{item.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default MediaUploader
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/media/__tests__/MediaUploader.test.tsx`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/media/MediaUploader.tsx frontend/src/components/media/__tests__/MediaUploader.test.tsx
git commit -m "feat: media uploader with per-file progress"
```

---

### Task 15: MediaDetailDrawer

**Files:**
- Create: `frontend/src/components/media/MediaDetailDrawer.tsx`
- Test: `frontend/src/components/media/__tests__/MediaDetailDrawer.test.tsx`

**Context you need:** One drawer serves both pages; which actions appear is decided by props, not by the component reading the auth store — that keeps it testable and keeps the permission decision in one obvious place per page.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/media/__tests__/MediaDetailDrawer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MediaDetailDrawer from '../MediaDetailDrawer'
import { mediaLibraryApi } from '../../../utils/mediaLibraryApi'
import type { MediaAsset } from '../../../utils/mediaLibraryApi'

vi.mock('../../../utils/mediaLibraryApi', () => ({
  mediaLibraryApi: {
    detail: vi.fn(),
    update: vi.fn(),
    submit: vi.fn(),
    review: vi.fn(),
    remove: vi.fn(),
    reassign: vi.fn(),
    fileUrl: (id: number) => `http://api.test/api/media-library/${id}/file`,
    thumbUrl: (id: number) => `http://api.test/api/media-library/${id}/thumb`,
  },
}))

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

const asset: MediaAsset = {
  id: 1, owner_id: 3, object_key: 'k', filename: 'IMG_1.jpg', media_type: 'image',
  content_type: 'image/jpeg', size_bytes: 2048, width: 800, height: 600, duration_seconds: null,
  title: null, description: null, tags: [], status: 'private', review_note: null,
  reviewed_at: null, created_at: '2026-03-14T10:00:00Z', updated_at: '2026-03-14T10:00:00Z',
  url: '/api/media-library/1/file', thumbnail_url: '/api/media-library/1/thumb',
}

const detail = (overrides: Partial<MediaAsset> = {}) =>
  ({ ...asset, ...overrides, usage: {}, usage_count: 0 })

describe('MediaDetailDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail() as never)
  })

  it('offers Submit for review on a private asset the owner can edit', async () => {
    render(<MediaDetailDrawer assetId={1} canReview={false} onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /submit for review/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument()
  })

  it('offers review actions to a reviewer on a submitted asset', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(detail({ status: 'submitted' }) as never)
    render(<MediaDetailDrawer assetId={1} canReview onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /publish/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('saves edited metadata', async () => {
    vi.mocked(mediaLibraryApi.update).mockResolvedValue(detail({ title: 'Well opening' }) as never)
    render(<MediaDetailDrawer assetId={1} canReview={false} onClose={vi.fn()} onChanged={vi.fn()} />)

    fireEvent.change(await screen.findByLabelText(/title/i), { target: { value: 'Well opening' } })
    fireEvent.change(screen.getByLabelText(/tags/i), { target: { value: 'gaza, water-well' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(mediaLibraryApi.update).toHaveBeenCalledWith(1, {
        title: 'Well opening',
        description: '',
        tags: ['gaza', 'water-well'],
      })
    )
  })

  it('warns instead of deleting when the asset is used on the site', async () => {
    vi.mocked(mediaLibraryApi.detail).mockResolvedValue(
      { ...detail({ status: 'public' }), usage_count: 2, usage: { stories: [{ id: 1 }] } } as never
    )
    render(<MediaDetailDrawer assetId={1} canReview onClose={vi.fn()} onChanged={vi.fn()} />)
    expect(await screen.findByText(/used in 2 place/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/media/__tests__/MediaDetailDrawer.test.tsx`

Expected: FAIL — cannot resolve `../MediaDetailDrawer`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/media/MediaDetailDrawer.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { X, Trash2, Send, Globe, Undo2 } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { mediaLibraryApi, type MediaAssetDetail, type Workspace } from '../../utils/mediaLibraryApi'
import { formatBytes } from './MediaCard'

interface MediaDetailDrawerProps {
  assetId: number
  canReview: boolean
  onClose: () => void
  onChanged: () => void
  /** Supplied only by All Media, where a reviewer may move an asset between
   *  workspaces — chiefly to give backfilled legacy media an owner. */
  workspaces?: Workspace[]
}

const MediaDetailDrawer = ({
  assetId, canReview, onClose, onChanged, workspaces,
}: MediaDetailDrawerProps) => {
  const { showSuccess, showError } = useToast()
  const [asset, setAsset] = useState<MediaAssetDetail | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tagText, setTagText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    mediaLibraryApi
      .detail(assetId)
      .then((data) => {
        if (cancelled) return
        setAsset(data)
        setTitle(data.title || '')
        setDescription(data.description || '')
        setTagText((data.tags || []).join(', '))
      })
      .catch(() => showError('Could not load this media.'))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await action()
      showSuccess(success)
      onChanged()
      const fresh = await mediaLibraryApi.detail(assetId)
      setAsset(fresh)
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      const message =
        typeof detail === 'string'
          ? detail
          : detail && typeof detail === 'object' && 'message' in detail
            ? String((detail as { message: unknown }).message)
            : 'That did not work.'
      showError(message)
    } finally {
      setBusy(false)
    }
  }

  const inUse = (asset?.usage_count ?? 0) > 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-xl">
        <header className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Media details</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </header>

        {!asset ? (
          <div className="p-5 text-sm text-gray-500">Loading…</div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="bg-gray-100 rounded-lg overflow-hidden">
              {asset.media_type === 'video' ? (
                <video src={mediaLibraryApi.fileUrl(asset.id)} controls className="w-full" />
              ) : (
                <img src={mediaLibraryApi.fileUrl(asset.id)} alt={asset.filename} className="w-full" />
              )}
            </div>

            <dl className="text-sm text-gray-600 space-y-1">
              <div className="flex justify-between"><dt>File</dt><dd className="font-medium text-gray-900 truncate max-w-[220px]">{asset.filename}</dd></div>
              <div className="flex justify-between"><dt>Size</dt><dd>{formatBytes(asset.size_bytes)}</dd></div>
              {asset.width && <div className="flex justify-between"><dt>Dimensions</dt><dd>{asset.width} × {asset.height}</dd></div>}
              <div className="flex justify-between"><dt>Status</dt><dd className="capitalize">{asset.status}</dd></div>
            </dl>

            {asset.review_note && (
              <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
                <strong>Reviewer note:</strong> {asset.review_note}
              </p>
            )}

            {inUse && (
              <p className="text-sm bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3">
                Used in {asset.usage_count} place{asset.usage_count === 1 ? '' : 's'} on the site.
                It cannot be deleted or unpublished until those references are removed.
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="media-title" className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input id="media-title" value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label htmlFor="media-description" className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea id="media-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label htmlFor="media-tags" className="block text-xs font-medium text-gray-600 mb-1">Tags (comma separated)</label>
                <input id="media-tags" value={tagText} onChange={(e) => setTagText(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              {workspaces && (
                <div>
                  <label htmlFor="media-owner" className="block text-xs font-medium text-gray-600 mb-1">
                    Workspace
                  </label>
                  <select
                    id="media-owner"
                    value={asset.owner_id ?? ''}
                    disabled={busy}
                    onChange={(e) => {
                      const value = e.target.value === '' ? null : Number(e.target.value)
                      return run(() => mediaLibraryApi.reassign(asset.id, value), 'Workspace updated')
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {workspaces
                      .filter((w) => w.owner_id !== null)
                      .map((w) => (
                        <option key={w.owner_id} value={w.owner_id as number}>
                          {w.owner_name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => run(
                  () => mediaLibraryApi.update(asset.id, {
                    title,
                    description,
                    tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
                  }),
                  'Details saved'
                )}
                className="w-full bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                Save details
              </button>
            </div>

            <div className="border-t pt-4 space-y-2">
              {asset.status === 'private' && (
                <button type="button" disabled={busy}
                  onClick={() => run(() => mediaLibraryApi.submit(asset.id), 'Submitted for review')}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
                  <Send className="w-4 h-4" /> Submit for review
                </button>
              )}

              {canReview && asset.status !== 'public' && (
                <button type="button" disabled={busy}
                  onClick={() => run(() => mediaLibraryApi.review(asset.id, 'approve'), 'Published')}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-lg py-2 text-sm hover:bg-emerald-700 disabled:opacity-50">
                  <Globe className="w-4 h-4" /> Publish
                </button>
              )}

              {canReview && asset.status === 'submitted' && (
                <button type="button" disabled={busy}
                  onClick={() => {
                    const note = window.prompt('Why is this being rejected?') || ''
                    return run(() => mediaLibraryApi.review(asset.id, 'reject', note), 'Returned to the owner')
                  }}
                  className="w-full border border-amber-300 text-amber-800 rounded-lg py-2 text-sm hover:bg-amber-50 disabled:opacity-50">
                  Reject
                </button>
              )}

              {canReview && asset.status === 'public' && (
                <button type="button" disabled={busy || inUse}
                  onClick={() => run(() => mediaLibraryApi.review(asset.id, 'unpublish'), 'Unpublished')}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
                  <Undo2 className="w-4 h-4" /> Unpublish
                </button>
              )}

              <button type="button" disabled={busy || inUse}
                onClick={() => {
                  if (!window.confirm('Delete this media permanently?')) return
                  return run(async () => { await mediaLibraryApi.remove(asset.id); onClose() }, 'Deleted')
                }}
                className="w-full flex items-center justify-center gap-2 border border-red-300 text-red-700 rounded-lg py-2 text-sm hover:bg-red-50 disabled:opacity-50">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

export default MediaDetailDrawer
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/media/__tests__/MediaDetailDrawer.test.tsx`

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/media/MediaDetailDrawer.tsx frontend/src/components/media/__tests__/MediaDetailDrawer.test.tsx
git commit -m "feat: media detail drawer with metadata editing and review actions"
```

---

### Task 16: My Workspace page

**Files:**
- Create: `frontend/src/pages/admin/AdminMediaWorkspace.tsx`
- Modify: `frontend/src/App.tsx`

**Context you need:** This page is deliberately thin — it owns query state and data fetching, and delegates every pixel to the Task 12-15 components. Follow the lazy-import pattern used by every other admin page in `App.tsx`.

- [ ] **Step 1: Write the page**

Create `frontend/src/pages/admin/AdminMediaWorkspace.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { useAuthStore } from '../../store/authStore'
import MediaFilters from '../../components/media/MediaFilters'
import MediaGrid from '../../components/media/MediaGrid'
import MediaUploader from '../../components/media/MediaUploader'
import MediaDetailDrawer from '../../components/media/MediaDetailDrawer'
import { mediaLibraryApi, type ListQuery, type MediaAsset } from '../../utils/mediaLibraryApi'

const PAGE_SIZE = 48

const AdminMediaWorkspace = () => {
  const { showError } = useToast()
  const { isAdmin, isManager } = useAuthStore()
  const [query, setQuery] = useState<ListQuery>({
    q: '', type: 'all', status: 'all', sort: 'created_at', order: 'desc', page: 1,
  })
  const [items, setItems] = useState<MediaAsset[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await mediaLibraryApi.list({ ...query, pageSize: PAGE_SIZE })
      setItems(data.items)
      setTotal(data.total)
    } catch {
      showError('Could not load your media.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => { load() }, [load])

  // Any filter change resets to page 1; an explicit page change does not.
  const patchQuery = (patch: Partial<ListQuery>) =>
    setQuery((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">My Workspace</h1>
        <p className="text-sm text-gray-600 mt-1">
          Your photos and videos. Everything here is private until an admin publishes it.
        </p>
      </header>

      <MediaUploader onUploaded={load} />

      <MediaFilters query={query} onChange={patchQuery} showStatusFilter />

      <p className="text-sm text-gray-500">
        {total} item{total === 1 ? '' : 's'}
      </p>

      <MediaGrid
        items={items}
        loading={loading}
        onSelect={(asset) => setSelectedId(asset.id)}
        emptyHint="Drop a photo or video above to add your first item."
      />

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" disabled={(query.page || 1) <= 1}
            onClick={() => setQuery((c) => ({ ...c, page: (c.page || 1) - 1 }))}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">
            Previous
          </button>
          <span className="text-sm text-gray-600">Page {query.page || 1} of {pageCount}</span>
          <button type="button" disabled={(query.page || 1) >= pageCount}
            onClick={() => setQuery((c) => ({ ...c, page: (c.page || 1) + 1 }))}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">
            Next
          </button>
        </div>
      )}

      {selectedId !== null && (
        <MediaDetailDrawer
          assetId={selectedId}
          canReview={isAdmin || isManager}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}

export default AdminMediaWorkspace
```

- [ ] **Step 2: Wire the route**

In `frontend/src/App.tsx`, add the lazy import beside the other admin pages:

```typescript
const AdminMediaWorkspace = lazy(() => import('./pages/admin/AdminMediaWorkspace'))
```

Then **replace** the `media` placeholder route Task 2 added inside the `/admin`
route block (it renders "Media workspace — coming soon.") with the real page —
do not add a second route for the same path:

```tsx
                <Route path="media" element={<AdminMediaWorkspace />} />
```

- [ ] **Step 3: Verify it builds and the suite still passes**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`

Expected: no type errors; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/AdminMediaWorkspace.tsx frontend/src/App.tsx
git commit -m "feat: My Workspace media page"
```

---

### Task 17: All Media page, and retire AdminS3Media

**Files:**
- Create: `frontend/src/pages/admin/AdminMediaLibrary.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AdminLayout.tsx`
- Delete: `frontend/src/pages/admin/AdminS3Media.tsx`

**Context you need:** `/admin/s3-media` is repointed at the new page rather than removed, so an existing bookmark still lands somewhere sensible. The usage cross-reference people relied on in AdminS3Media now lives in `MediaDetailDrawer` (the blue "used in N places" panel), and delete still works from there — so nothing that page did is lost.

- [ ] **Step 1: Write the page**

Create `frontend/src/pages/admin/AdminMediaLibrary.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useToast } from '../../contexts/ToastContext'
import MediaFilters from '../../components/media/MediaFilters'
import MediaGrid from '../../components/media/MediaGrid'
import MediaDetailDrawer from '../../components/media/MediaDetailDrawer'
import { formatBytes } from '../../components/media/MediaCard'
import {
  mediaLibraryApi,
  type ListQuery,
  type MediaAsset,
  type Workspace,
} from '../../utils/mediaLibraryApi'

const PAGE_SIZE = 48

const AdminMediaLibrary = () => {
  const { showError } = useToast()
  const [tab, setTab] = useState<'all' | 'review'>('all')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [ownerId, setOwnerId] = useState<number | 'unassigned' | null>(null)
  const [query, setQuery] = useState<ListQuery>({
    q: '', type: 'all', status: 'all', sort: 'created_at', order: 'desc', page: 1,
  })
  const [items, setItems] = useState<MediaAsset[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await mediaLibraryApi.workspaces()
      setWorkspaces(data.workspaces)
    } catch {
      showError('Could not load workspaces.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await mediaLibraryApi.list({
        ...query,
        // The review queue is the submitted-status view of every workspace.
        status: tab === 'review' ? 'submitted' : query.status,
        ownerId: tab === 'review' ? null : ownerId,
        pageSize: PAGE_SIZE,
      })
      setItems(data.items)
      setTotal(data.total)
    } catch {
      showError('Could not load media.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ownerId, tab])

  useEffect(() => { loadWorkspaces() }, [loadWorkspaces])
  useEffect(() => { load() }, [load])

  const refresh = () => { load(); loadWorkspaces() }
  const patchQuery = (patch: Partial<ListQuery>) =>
    setQuery((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))

  const pendingTotal = workspaces.reduce((sum, w) => sum + w.submitted_count, 0)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">All Media</h1>
        <p className="text-sm text-gray-600 mt-1">Every workspace, and the queue waiting on review.</p>
      </header>

      <div className="flex gap-1 border-b border-gray-200">
        {(['all', 'review'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => { setTab(value); setQuery((c) => ({ ...c, page: 1 })) }}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              tab === value
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            )}
          >
            {value === 'all' ? 'All media' : `Review queue${pendingTotal ? ` (${pendingTotal})` : ''}`}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start">
        {tab === 'all' && (
          <nav className="w-56 shrink-0 space-y-1">
            <button type="button" onClick={() => setOwnerId(null)}
              className={clsx('w-full text-left px-3 py-2 rounded-lg text-sm',
                ownerId === null ? 'bg-emerald-50 text-emerald-800 font-medium' : 'hover:bg-gray-50')}>
              Every workspace
            </button>
            {workspaces.map((workspace) => {
              const value = workspace.owner_id ?? 'unassigned'
              return (
                <button key={String(value)} type="button" onClick={() => setOwnerId(value)}
                  className={clsx('w-full text-left px-3 py-2 rounded-lg text-sm',
                    ownerId === value ? 'bg-emerald-50 text-emerald-800 font-medium' : 'hover:bg-gray-50')}>
                  <span className="block truncate">{workspace.owner_name}</span>
                  <span className="block text-xs text-gray-500">
                    {workspace.asset_count} item{workspace.asset_count === 1 ? '' : 's'} · {formatBytes(workspace.total_bytes)}
                    {workspace.submitted_count > 0 && ` · ${workspace.submitted_count} in review`}
                  </span>
                </button>
              )
            })}
          </nav>
        )}

        <div className="flex-1 space-y-4 min-w-0">
          <MediaFilters query={query} onChange={patchQuery} showStatusFilter={tab === 'all'} />
          <p className="text-sm text-gray-500">{total} item{total === 1 ? '' : 's'}</p>

          <MediaGrid
            items={items}
            loading={loading}
            onSelect={(asset) => setSelectedId(asset.id)}
            emptyHint={tab === 'review' ? 'Nothing is waiting for review.' : 'No media matches these filters.'}
          />

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button type="button" disabled={(query.page || 1) <= 1}
                onClick={() => setQuery((c) => ({ ...c, page: (c.page || 1) - 1 }))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">
                Previous
              </button>
              <span className="text-sm text-gray-600">Page {query.page || 1} of {pageCount}</span>
              <button type="button" disabled={(query.page || 1) >= pageCount}
                onClick={() => setQuery((c) => ({ ...c, page: (c.page || 1) + 1 }))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40">
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedId !== null && (
        <MediaDetailDrawer
          assetId={selectedId}
          canReview
          workspaces={workspaces}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

export default AdminMediaLibrary
```

- [ ] **Step 2: Wire the routes and retire the old page**

In `frontend/src/App.tsx`:

```typescript
const AdminMediaLibrary = lazy(() => import('./pages/admin/AdminMediaLibrary'))
```

Remove the `AdminS3Media` lazy import, then set both routes to the new page —
replacing the `media/all` placeholder Task 2 added, rather than adding a duplicate:

```tsx
                <Route path="media/all" element={<AdminMediaLibrary />} />
                <Route path="s3-media" element={<AdminMediaLibrary />} />
```

In `frontend/src/components/AdminLayout.tsx`, drop the `S3 Browser` entry from the Media group so the nav has one obvious destination.

**While you are in that file, extract the nav data.** Task 2 exported `NAV`,
`ROLE_ALLOWED` and `filterNavForRole` from `AdminLayout.tsx` for testability, which
left one file holding four responsibilities: nav data, role policy, a pure filter,
and a React component — and the first three have nothing to do with React. Move
those three into a sibling `frontend/src/components/adminNav.ts`, re-point the
import in `AdminLayout.tsx` and in
`frontend/src/components/__tests__/AdminLayout.test.tsx`, and type the exports as
`Partial<Record<Role, ReadonlySet<string>>>` and `readonly NavEntry[]` so importers
cannot mutate shared module state (`export const` prevents rebinding, not mutation).
This task is already editing `NAV`, which makes it the natural moment.

The Media group after the edit:

```typescript
    items: [
      { kind: 'link', name: 'My Workspace', href: '/admin/media', icon: FolderOpen },
      { kind: 'link', name: 'All Media', href: '/admin/media/all', icon: Layers },
      { kind: 'link', name: 'Gallery', href: '/admin/gallery', icon: Film },
      { kind: 'link', name: 'Cleanup', href: '/admin/cleanup', icon: Trash2 },
    ],
```

- [ ] **Step 3: Confirm nothing else imports the old page**

Run: `cd frontend && grep -rn "AdminS3Media" src/`

Expected: no matches. If anything is still listed, update it before continuing.

- [ ] **Step 4: Delete the old page**

Run: `git rm frontend/src/pages/admin/AdminS3Media.tsx`

- [ ] **Step 5: Verify**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`

Expected: no type errors; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/AdminMediaLibrary.tsx frontend/src/App.tsx frontend/src/components/AdminLayout.tsx frontend/src/components/adminNav.ts frontend/src/components/__tests__/AdminLayout.test.tsx
git commit -m "feat: All Media page with workspace sidebar and review queue"
```

---

## Phase 5 — Rollout

### Task 18: Backfill existing S3 objects

**Files:**
- Create: `backend/scripts/backfill_media_library.py`
- Test: `backend/tests/test_backfill_media_library.py`

**Context you need:** `s3_service.list_files(prefix)` returns dicts with `key`, `size`, `last_modified` and `url`. The existing `/browse` endpoint skips generated thumbnails by filtering names containing `_thumb` — do the same, or thumbnails will appear as standalone assets. The script must be idempotent: it is keyed on `object_key`, so re-running only adds what is missing.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_backfill_media_library.py`:

```python
"""Backfill of pre-existing S3 objects into media_assets."""
import pytest

from models import MediaAsset


@pytest.fixture
def fake_listing(monkeypatch):
    listing = {
        "images/": [
            {"key": "images/hero.jpg", "size": 1000, "last_modified": None},
            {"key": "images/hero_thumb.jpg", "size": 50, "last_modified": None},
        ],
        "videos/": [
            {"key": "videos/story.mp4", "size": 9000, "last_modified": None},
        ],
    }
    monkeypatch.setattr(
        "scripts.backfill_media_library.list_files",
        lambda prefix: listing.get(prefix, []),
    )


def test_backfill_imports_existing_objects_as_public_and_unassigned(db_session, fake_listing):
    from scripts.backfill_media_library import backfill

    created = backfill(db_session)
    assert created == 2

    assets = db_session.query(MediaAsset).order_by(MediaAsset.object_key).all()
    assert [a.object_key for a in assets] == ["images/hero.jpg", "videos/story.mp4"]
    assert all(a.status == "public" for a in assets)
    assert all(a.owner_id is None for a in assets)


def test_backfill_skips_generated_thumbnails(db_session, fake_listing):
    from scripts.backfill_media_library import backfill

    backfill(db_session)
    keys = [a.object_key for a in db_session.query(MediaAsset).all()]
    assert "images/hero_thumb.jpg" not in keys


def test_backfill_sets_a_searchable_filename(db_session, fake_listing):
    from scripts.backfill_media_library import backfill

    backfill(db_session)
    asset = db_session.query(MediaAsset).filter(MediaAsset.object_key == "images/hero.jpg").one()
    assert asset.filename == "hero.jpg"
    assert "hero.jpg" in asset.search_text
    assert asset.media_type == "image"


def test_backfill_is_idempotent(db_session, fake_listing):
    from scripts.backfill_media_library import backfill

    assert backfill(db_session) == 2
    assert backfill(db_session) == 0
    assert db_session.query(MediaAsset).count() == 2
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_backfill_media_library.py -v`

Expected: FAIL — `ModuleNotFoundError: No module named 'scripts'`.

- [ ] **Step 3: Write the script**

Create `backend/scripts/__init__.py` (empty file), then `backend/scripts/backfill_media_library.py`:

```python
"""One-time import of pre-existing S3 objects into media_assets.

Everything already in the bucket predates workspaces, so it lands owner-less
(the "Unassigned" workspace) and already public — it is on the live site today.
An admin can reassign an asset to a member afterwards.

Idempotent: keyed on object_key, so re-running only adds what is missing.

    docker compose exec backend python -m scripts.backfill_media_library
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from database import SessionLocal
from logging_config import get_logger
from media_library_service import build_search_text, detect_media_type
from models import MediaAsset
from s3_service import list_files

logger = get_logger(__name__)

PREFIXES = ("images/", "videos/")


def _is_generated_thumbnail(filename: str) -> bool:
    """Thumbnails are derived files, not assets — /browse skips them the same way."""
    return "_thumb" in filename.lower()


def backfill(db: Session) -> int:
    """Insert a row for every S3 object that does not have one. Returns the count."""
    existing = {key for (key,) in db.query(MediaAsset.object_key).all()}
    created = 0

    for prefix in PREFIXES:
        for file_info in list_files(prefix):
            object_key = file_info["key"]
            if object_key in existing or object_key.endswith("/"):
                continue

            filename = object_key.split("/")[-1]
            if not filename or _is_generated_thumbnail(filename):
                continue

            media_type = detect_media_type(filename, None)
            if media_type is None:
                # Includes any .svg already in the bucket: SVG was dropped from the
                # allowed types as a script-carrying document format. Read whatever
                # this logs before treating the backfill as complete.
                logger.info("Skipping unsupported object %s", object_key)
                continue

            db.add(MediaAsset(
                owner_id=None,
                object_key=object_key,
                filename=filename,
                media_type=media_type,
                content_type="image/jpeg" if media_type == "image" else "video/mp4",
                size_bytes=file_info.get("size") or 0,
                search_text=build_search_text(filename, None, None, None),
                status="public",
            ))
            existing.add(object_key)
            created += 1

    db.commit()
    return created


def main() -> None:
    db = SessionLocal()
    try:
        created = backfill(db)
        logger.info("Backfill complete: %s asset(s) imported", created)
        print(f"Backfill complete: {created} asset(s) imported")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_backfill_media_library.py -v`

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/__init__.py backend/scripts/backfill_media_library.py backend/tests/test_backfill_media_library.py
git commit -m "feat: backfill existing S3 objects into the media library"
```

---

### Task 19: Direct-URL audit and bucket lockdown

**Files:**
- Create: `backend/scripts/audit_direct_s3_urls.py`
- Modify: `backend/s3_service.py` (remove the public-read policy)

**Context you need:** This is the only step that can break the live site, which is why it is last and separate. `get_file_url()` returns a backend proxy URL when `FRONTEND_URL` is set, but falls back to a **direct** S3 URL when it is not — so some older content rows may hold a direct MinIO URL that only works while the bucket is public. Audit first; lock down only when the audit is clean.

**Do not run step 3 until step 2 reports zero rows.**

- [ ] **Step 1: Write the audit script**

Create `backend/scripts/audit_direct_s3_urls.py`:

```python
"""Report content rows holding a direct S3/MinIO URL rather than a proxy URL.

Every such row would 404 the moment the bucket stops being publicly readable, so
this must report nothing before the public-read policy is removed.

    docker compose exec backend python -m scripts.audit_direct_s3_urls
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import SessionLocal
from models import (
    Event, GalleryItem, Program, ProgramCategory, Setting, SlideshowSlide,
    Story, Testimonial,
)
from s3_service import S3_BUCKET_NAME

# (model, label, [columns that can hold a media URL])
TARGETS = [
    (GalleryItem, "gallery_items", ["media_filename", "thumbnail_url"]),
    (Story, "stories", ["image_filename", "video_filename"]),
    (Testimonial, "testimonials", ["image", "video_filename"]),
    (Event, "events", ["image"]),
    (Program, "programs", ["image_url", "video_filename"]),
    (ProgramCategory, "program_categories", ["image_url", "video_filename"]),
    (SlideshowSlide, "slideshow_slides", ["image_url", "image_filename"]),
    (Setting, "settings", ["value"]),
]


def _is_direct_s3_url(value) -> bool:
    if not isinstance(value, str) or not value.startswith(("http://", "https://")):
        return False
    if "/api/uploads/" in value or "/api/media-library/" in value:
        return False
    return S3_BUCKET_NAME in value or ":9000" in value


def audit(db) -> list:
    findings = []
    for model, label, columns in TARGETS:
        for row in db.query(model).all():
            for column in columns:
                value = getattr(row, column, None)
                if _is_direct_s3_url(value):
                    findings.append({
                        "table": label,
                        "id": getattr(row, "id", getattr(row, "key", "?")),
                        "column": column,
                        "value": value,
                    })
    return findings


def main() -> None:
    db = SessionLocal()
    try:
        findings = audit(db)
        if not findings:
            print("Clean: no direct S3 URLs found. Safe to remove the public-read policy.")
            return
        print(f"Found {len(findings)} direct S3 URL(s). Fix these before locking the bucket:")
        for finding in findings:
            print(f"  {finding['table']}#{finding['id']}.{finding['column']} = {finding['value']}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the audit against production data**

Run: `docker compose exec backend python -m scripts.audit_direct_s3_urls`

Expected: `Clean: no direct S3 URLs found.`

If it lists rows, rewrite each listed value to its proxy form (`/api/uploads/media/<images|videos>/<filename>`) and re-run until clean. **Do not continue while any row is listed.**

- [ ] **Step 3: Remove the public-read bucket policy**

In `backend/s3_service.py`, inside `ensure_bucket_exists()`, delete both `put_bucket_policy` blocks — the one in the "bucket exists" branch and the one in the "bucket created" branch — replacing each with:

```python
            # No public-read policy: the application is the only path to a byte.
            # Access is decided per asset by media_library_files.py.
```

Then remove the now-unused `import json` statements inside that function.

- [ ] **Step 4: Verify public media still serves and private media does not**

Run: `cd backend && python -m pytest tests -v`

Expected: PASS.

Then, against a running stack, confirm the two ends of the rule:

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/media-library/<a public id>/file`
Expected: `200`

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/media-library/<a private id>/file`
Expected: `404`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/audit_direct_s3_urls.py backend/s3_service.py
git commit -m "feat: audit direct S3 URLs and remove the public-read bucket policy"
```

---

### Task 20: End-to-end test

**Files:**
- Create: `e2e/media-workspaces.spec.ts`

**Context you need:** Playwright config lives at `playwright.config.ts` in the repo root; specs live in `e2e/`. This test covers the one path that spans every layer: a field staff member uploads and submits, an admin reviews and publishes.

- [ ] **Step 1: Write the test**

Create `e2e/media-workspaces.spec.ts`:

```typescript
import { test, expect, Page } from '@playwright/test'
import path from 'path'

const FIELD_STAFF = { email: 'e2e-field@example.com', password: 'e2e-testpass' }
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PASSWORD! }

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(user.email)
  await page.getByLabel(/password/i).fill(user.password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL(/\/admin/)
}

test.describe('media workspaces', () => {
  test('field staff land on their workspace and see nothing else', async ({ page }) => {
    await login(page, FIELD_STAFF)
    await expect(page).toHaveURL(/\/admin\/media$/)
    await expect(page.getByRole('heading', { name: /my workspace/i })).toBeVisible()

    // The only nav destination is the workspace itself.
    await expect(page.getByRole('link', { name: /donations/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /settings/i })).toHaveCount(0)
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
```

- [ ] **Step 2: Add the fixture image**

Run: `mkdir -p e2e/fixtures && python -c "from PIL import Image; Image.new('RGB', (64, 64), 'teal').save('e2e/fixtures/sample.jpg')"`

Expected: `e2e/fixtures/sample.jpg` exists.

- [ ] **Step 3: Seed the field staff account**

Run:
```bash
docker compose exec backend python -c "
from database import SessionLocal
from models import User
from auth_utils import get_password_hash
db = SessionLocal()
if not db.query(User).filter(User.email=='e2e-field@example.com').first():
    db.add(User(email='e2e-field@example.com', password=get_password_hash('e2e-testpass'),
                name='E2E Field', is_active=True, is_admin=False, role='field_staff'))
    db.commit()
print('seeded')
"
```

Expected: `seeded`

- [ ] **Step 4: Run the E2E test**

Run: `npx playwright test e2e/media-workspaces.spec.ts`

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add e2e/media-workspaces.spec.ts e2e/fixtures/sample.jpg
git commit -m "test: end-to-end media workspace upload, review and publish"
```

---

## Follow-up work (not in this plan)

Recorded here so it is not lost; each needs its own spec/plan cycle.

**HEIC/HEIF support.** iPhones shoot HEIC by default, and a photo uploaded from
Files or a share sheet (rather than through Safari, which auto-transcodes) arrives
as `image/heic`. Task 3 gives it a named error telling the user how to switch to
"Most Compatible", which is the honest short-term answer, but the real fix is
support. It needs three things together, and doing any one alone makes things
worse: an allow-list entry, **brand-aware sniffing** (HEIC is ISO-BMFF, so the
`ftyp`-at-offset-4 check classifies it as *video* — the major brand has to be read
to tell `heic`/`mif1` from `isom`/`mp4`), and `pillow-heif` to transcode to JPEG,
since browsers cannot display HEIC natively. Note the native dependency has to
build in the backend Docker image.

**`safe_download_filename()` before any Content-Disposition use.** `filename` is
stored raw, and `backend/routers/project_proposals.py:266` already builds
`f'attachment; filename="{filename}"'` unescaped. A name containing a quote or a
CR/LF is filename spoofing or header injection. Task 10 does not currently set
that header, but the local precedent makes it likely a future reader copies it.
The helper belongs in `media_library_service.py`, same shape as `_safe_extension`.

**`toggle_user_admin` has no test coverage.** Task 2 removed the UI that drove it
(it clobbered `role` from the `is_admin` boolean, silently demoting managers and
field staff to donors). The endpoint itself was deliberately left in place and
unchanged — removing a route is a separate decision from removing its UI — but it
is now unreachable from the app and still untested.

**The backend suite is not order-independent.** Two independent measurements of
the same base commit disagreed on the failure count (19 versus 31 of the same 167
tests), which points at shared state between tests rather than at any change here.
Worth knowing before the suite grows much further.

## Deployment order

The tasks are ordered so `main` stays deployable, but the production rollout has its own sequence:

1. Apply `migrations/31_add_media_library.sql`.
2. Deploy backend and frontend.
3. Run `python -m scripts.backfill_media_library`, then read its "Skipping unsupported
   object" lines — any `.svg` in the bucket is skipped by design and will not appear
   in the library.
4. Run `python -m scripts.audit_direct_s3_urls` until it reports clean.
5. Only then deploy the `s3_service.py` change from Task 19 that drops the public-read policy.

Steps 4 and 5 are separable and independently revertible on purpose — that is the one change that can take the public site's images down.


