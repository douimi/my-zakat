# Media Workspaces — Design

**Date:** 2026-09-09
**Status:** Approved for planning

## Summary

A media management system on top of the existing MinIO/S3 storage. Every MyZakat
team member gets a private workspace for the photos and videos they upload, with
browse, search and sort. Admins and managers get a view across all workspaces.
Media that belongs on the public site is promoted through an explicit review step.

A fourth role, `field_staff`, is introduced for people whose only job is
contributing media.

## Goals

- Each staff member uploads photos and videos into a workspace only they (and
  admins/managers) can see.
- Browse, search and sort that media by filename, title, description, tags, type,
  date and size.
- Admins and managers see all media, grouped by workspace.
- Media can be promoted from a workspace to the public site, gated by review.
- Media already in the bucket is absorbed into the new system rather than
  stranded outside it.

## Non-goals

- Folders or collections inside a workspace. Tags cover the grouping need at
  current volume.
- Sharing individual assets between staff members. Visibility is: owner, or
  admin/manager, or public.
- Per-workspace storage quotas.
- Donor-facing uploads.

## Current state

- `backend/s3_service.py` — MinIO client. Flat key layout (`images/<filename>`,
  `videos/<filename>`), a blanket public-read bucket policy, and `get_file_url()`
  which returns a backend proxy URL (`/api/uploads/media/...`) whenever
  `FRONTEND_URL` is set, falling back to a direct S3 URL otherwise.
- `backend/routers/s3_media.py` — admin-only `/browse`, which lists S3 objects and
  cross-references usage across Stories, Testimonials, Events, Programs,
  Program Categories, Slideshow Slides, Gallery Items and Settings. There is no
  database index; the S3 listing *is* the index, with a `head_object` per file.
- `backend/routers/static_files.py` — the serving layer. Four near-identical video
  routes each hand-roll Range/HEAD/OPTIONS handling.
- `backend/media_processing.py` — image compression, video compression, video
  thumbnail generation. Reused as-is.
- `backend/image_cache.py` — in-memory LRU plus on-the-fly resize for images.
- `frontend/src/pages/admin/AdminS3Media.tsx` — 743 lines, the current browser UI.
- Roles are `admin | manager | user` on `users.role` (`String(20)`), with
  `is_admin` kept in sync for legacy code. `AdminRoute` admits anyone `isStaff`
  (admin or manager); per-section gating happens in `AdminLayout` and pages.

## Decisions

| Question | Decision |
|---|---|
| Purpose of workspace media | Private working area **and** an explicit promote-to-site path. One pool, ownership tracked. |
| Visibility | Private to the owner. Admins and managers see everything. |
| Privacy depth | Truly private: un-promoted bytes are unreachable without auth. |
| Search | Filename + title + description + tags. Sort by date, name, size, type. |
| Existing media | Backfilled as owner-less `public` assets in an "Unassigned" workspace. The new admin view supersedes `AdminS3Media`. |
| Who gets a workspace | Staff only: `admin`, `manager`, `field_staff`. |
| Promote rights | `admin` and `manager` only. Field staff submit for review. |

### Rationale for the storage approach

Privacy is a **column**, not a location. Objects land once at a stable key and
never move; `status` decides who may read them.

The alternative — separate `workspaces/` and `public/` prefixes with promotion
physically copying the object — puts enforcement in S3 itself, which is auditable
outside the app. It was rejected because promotion would become a copy-and-delete
of a file up to the upload limit, the object key would mutate mid-life (so a URL
stored in a Story could break), and every asset would gain two possible
addresses. That is permanent complexity bought to guard a single conditional.

A no-database design (prefix-per-user plus S3 object metadata) was also rejected:
it cannot search descriptions or sort by size across workspaces without listing
every object and issuing a `head_object` per file — the N+1 that already makes
`/browse` slow, worsening with every upload.

## Roles and permissions

`field_staff` becomes a fourth value of `users.role`. No schema change — the
column is already `String(20)`.

| Role | `/admin` reach | Own workspace | All workspaces | Promote |
|---|---|---|---|---|
| `admin` | everything | yes | yes | yes |
| `manager` | current sections | yes | yes | yes |
| `field_staff` | media workspace only | yes | no | submit only |
| `user` | none | no | no | no |

**Backend.** `auth_utils.py` gains `get_current_staff` (admin, manager or
field_staff) for the workspace endpoints. The existing
`get_current_manager_or_admin` gates the cross-workspace and review endpoints.

**Frontend.** `Role` in `authStore.ts` gains `'field_staff'`; `buildAuthState`
gains `isFieldStaff` and widens `isStaff` to include it, so `AdminRoute` admits
them. `AdminLayout` renders only the Media entry for field staff. `AdminIndex`
redirects them to `/admin/media`, mirroring how managers are already redirected
to `/admin/stories`. `AdminUsers` gains the role in its dropdown.

Field staff must not reach any other admin section. This is enforced on the
server per endpoint, not only by hiding nav entries.

## Data model

New table `media_assets`:

| Column | Type | Notes |
|---|---|---|
| `id` | PK | |
| `owner_id` | FK `users(id)`, nullable, `ON DELETE SET NULL` | `NULL` = the "Unassigned" workspace |
| `object_key` | `VARCHAR(500)` unique | the S3 key; never changes after creation |
| `filename` | `VARCHAR(255)` | original name as uploaded |
| `media_type` | `VARCHAR(10)` | `image` or `video` |
| `content_type` | `VARCHAR(100)` | |
| `size_bytes` | `BIGINT` | after compression |
| `width`, `height` | `INTEGER` nullable | |
| `duration_seconds` | `NUMERIC` nullable | videos |
| `thumbnail_key` | `VARCHAR(500)` nullable | |
| `checksum_sha256` | `CHAR(64)` nullable | duplicate detection within a workspace |
| `title` | `VARCHAR(200)` nullable | |
| `description` | `TEXT` nullable | |
| `tags` | `JSONType`, default `list` | uses the existing cross-dialect helper |
| `search_text` | `TEXT` | denormalized, lowercased |
| `status` | `VARCHAR(20)` | `private`, `submitted` or `public` |
| `reviewed_by_id` | FK `users(id)` nullable | |
| `reviewed_at` | `TIMESTAMP` nullable | |
| `review_note` | `TEXT` nullable | reason on rejection |
| `created_at`, `updated_at` | `TIMESTAMP` | |

Indexes: `owner_id`, `status`, `created_at`, `checksum_sha256`, and
`(owner_id, status)`.

Deleting a user sets `owner_id` to `NULL`, moving their assets into the
Unassigned workspace rather than cascading the delete. Media outlives the account
that produced it, and an admin can reassign it afterwards via `/{id}/reassign`.

### Why `status` is one column

A file is `private` (owner and admins only), `submitted` (owner has asked for
review; still private) or `public` (served to anyone). Rejection is
`submitted → private` with a `review_note`. Backfilled legacy files start at
`public`.

Splitting this into separate visibility and review-state columns would create
combinations with no meaning (public-and-rejected) and two things to check in the
serving path — the one place where a mistake exposes a photo of a beneficiary.

### Why `search_text` is denormalized

Maintained on every write as the lowercased concatenation of `filename`, `title`,
`description` and the tags, with each tag wrapped in pipe delimiters
(`…|water-well|gaza|…`). The delimiters let the `tag` filter do an exact-tag match
as `ILIKE '%|water-well|%'` without dialect-specific JSON containment, while `q`
still matches tags as free text. Search is then a single `ILIKE`, which behaves
identically on production Postgres and on the in-memory SQLite the unit tests use.
Dialect-specific JSON containment or `tsvector` would not. At current volume this
is the right trade; a `pg_trgm` GIN index can be added later without changing the
API.

### Status transitions

| From | To | Who | Guard |
|---|---|---|---|
| `private` | `submitted` | owner | — |
| `submitted` | `private` | **owner** | withdraw: the only exit from a mistaken submission |
| `submitted` | `public` | admin, manager | — |
| `submitted` | `private` | admin, manager | records `review_note` |
| `private` | `public` | admin, manager | direct promote, no queue |
| `public` | `private` | admin, manager | **rejected if referenced by site content** |

Any transition not listed is rejected with `400`.

Unpublishing runs the existing `get_media_usage()` cross-reference from
`s3_media.py`. If a Story, Event, Gallery item, Slideshow slide, Program, Program
Category, Testimonial or Setting points at the asset, the API refuses and names
the referencing content rather than silently breaking the public site. Deletion
is guarded the same way.

## Storage and serving

### Key layout

New uploads: `workspaces/{owner_id}/{yyyy}/{mm}/{uuid}{ext}`, with the thumbnail
alongside as `{uuid}_thumb.jpg`. Using a UUID rather than the uploaded filename
eliminates collisions and path-traversal handling; the original name lives in the
`filename` column, where it is searchable.

Legacy assets keep their existing `images/…` and `videos/…` keys. `object_key`
simply records whatever is true for that asset.

### Serving

One route, `GET /api/media-library/{id}/file`, loads the row and branches on
`status`:

- `public` — served unauthenticated and cacheable. This is what the public site hits.
- `private` or `submitted` — requires authentication, and requires the owner, an
  admin or a manager. **Everyone else receives `404`, not `403`**, because a `403`
  confirms the asset exists.

`GET /api/media-library/{id}/thumb?w=` follows the same rules and reuses
`image_cache.py`.

The blanket public-read bucket policy in `ensure_bucket_exists()` is removed, so
the application is the only path to a byte.

### Refactor in passing

`static_files.py` currently has four near-identical video routes, each hand-rolling
Range, HEAD and OPTIONS handling. Instead of adding a fifth copy, factor out a
single `stream_s3_object(object_key, request)` helper and have the new route use
it. Scope is limited to extracting the helper and pointing the existing routes at
it — no other changes to `static_files.py`.

## API

Mounted at `/api/media-library`. (`/api/media` is already taken by `media.py`.)

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/` | staff | upload; compress, thumbnail, checksum |
| `GET` | `/` | staff | list, search, sort, paginate |
| `GET` | `/{id}` | owner or admin/manager | detail plus usage cross-reference |
| `GET` | `/{id}/file` | per `status` | serve bytes |
| `GET` | `/{id}/thumb` | per `status` | serve thumbnail |
| `PATCH` | `/{id}` | owner or admin/manager | title, description, tags |
| `POST` | `/{id}/submit` | owner | `private → submitted` |
| `POST` | `/{id}/withdraw` | owner | `submitted → private` |
| `POST` | `/{id}/review` | admin, manager | approve or reject |
| `POST` | `/{id}/reassign` | admin, manager | move an asset into another workspace |
| `DELETE` | `/{id}` | owner (private only) or admin/manager | blocked while referenced |
| `GET` | `/workspaces` | admin, manager | workspaces with counts and total size |

### Listing

Query parameters: `q`, `type`, `status`, `tag`, `sort`, `order`, `page`,
`page_size`, and `owner_id` (admin and manager only, accepting `unassigned`).

Scoping is applied **in the query**, not by trusting a caller-supplied filter: a
field staff request can only ever produce rows where `owner_id` is their own id.

### Upload

Reuses `compress_image`, `compress_video` and `generate_video_thumbnail` from
`media_processing.py` unchanged. Computes sha256 after compression. If an asset
with the same checksum already exists in the same workspace, responds `409` with
a pointer to the existing asset rather than storing a second copy.

The size limit stays at the current `MAX_VIDEO_SIZE` of 100 MB, exposed as a
`MAX_MEDIA_UPLOAD_MB` setting. Raising it requires matching changes to the
Traefik and nginx body-size limits, which is out of scope here.

Ordering: write to S3 first, then insert the row. If the insert fails, delete the
object. On delete, remove the row inside the transaction and the object after
commit; a failed object delete is logged and reconciled by the existing
`cleanup.py` orphan sweep, which leaves an unreferenced object rather than a row
pointing at nothing.

## Frontend

Two pages sharing one component set, so neither grows into another
743-line file:

- `/admin/media` — **My Workspace**. Uploader, grid/list toggle, search box, type
  and status filters, sort control, and a detail drawer for editing metadata and
  submitting for review.
- `/admin/media/all` — **All Media**, for admins and managers. The same grid plus
  a workspace sidebar with per-member counts, and a **Review queue** tab listing
  everything in `submitted`.

Shared components: `MediaUploader`, `MediaGrid`, `MediaCard`, `MediaFilters`,
`MediaDetailDrawer`.

The existing `/admin/s3-media` route renders All Media, carrying over the usage
cross-reference and delete behaviour already in use. `AdminS3Media.tsx` is removed
once the route points at the new page.

## Migration

1. `migrations/31_add_media_library.sql` — create `media_assets` and its indexes.
2. Deploy the backend and frontend.
3. Run `backend/scripts/backfill_media_library.py` — walks the existing `images/`
   and `videos/` prefixes, skips `_thumb` files as `/browse` already does, and
   inserts each object as `owner_id NULL, status 'public'`. Idempotent: keyed on
   `object_key`, so re-running adds only what is missing.
4. Audit for direct MinIO URLs stored in content tables. `get_file_url()` falls
   back to a direct S3 URL when `FRONTEND_URL` is unset, so older rows may hold
   one.
5. Only after that audit is clean, remove the public-read bucket policy.

Steps 4 and 5 are deliberately separate from the rest so the policy change is
independently revertible.

## Testing

**Permission matrix.** Table-driven tests covering every endpoint against every
role, for both the caller's own asset and another member's. This is where a bug
has real cost, so it is enumerated rather than sampled. Includes: a stranger
requesting a private file receives `404`; a field staff listing never returns
another member's rows; a field staff request to any other admin endpoint is
rejected server-side.

**Status transitions.** Every legal transition, and a rejection for each illegal
one.

**Listing.** Search across filename, title, description and tags; each sort field
in both directions; pagination boundaries.

**Upload.** Duplicate checksum returns `409`; oversized upload is rejected;
a failed DB insert leaves no orphan object.

**Guards.** Unpublish and delete are both refused while the asset is referenced,
and the response names the referencing content.

**E2E (Playwright).** Field staff logs in, lands on the workspace, uploads,
searches, submits. Admin reviews, promotes, and the asset appears in the gallery
picker.

## Open risks

- **Proxy load.** All public image and video bytes already flow through FastAPI in
  production, so this adds no new class of load — but removing the bucket policy
  removes the direct-S3 escape hatch. If the proxy becomes a bottleneck, short-lived
  presigned URLs for `public` assets are the natural next step, and the id-addressed
  route means that change stays behind the existing API.
- **Backfill accuracy.** Legacy objects have no owner and no metadata, so they are
  searchable only by filename until an admin edits them. Reassigning a legacy
  asset to a member is supported but manual.
