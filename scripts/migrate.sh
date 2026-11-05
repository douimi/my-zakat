#!/usr/bin/env bash
#
# Apply pending database migrations. Run by the deploy job; safe to run by hand.
#
#   ./scripts/migrate.sh                 apply pending "pre" migrations
#   ./scripts/migrate.sh --phase post    apply pending "post" migrations
#   ./scripts/migrate.sh --phase all     both, in file order
#   ./scripts/migrate.sh --list          show what is applied and what is pending
#   ./scripts/migrate.sh --dry-run       say what would run, change nothing
#
# Options: --compose-file F  --env-file F  --db-user U  --db-name N
#          --service S       --no-baseline
#
# How it works
# ------------
# `schema_migrations` records every file that has been applied, with a checksum.
# Each pending file is applied inside a transaction together with its own
# tracking row, so a migration that fails records nothing and leaves the
# database exactly as it was. A file whose checksum no longer matches what was
# applied is a hard error: editing an applied migration means the database and
# the repository disagree, and silently carrying on would hide that forever.
#
# Phases
# ------
# Most migrations are additive and must run BEFORE the new image starts, because
# the new code selects columns the old schema lacks. A few are destructive and
# must run AFTER, because the OLD image is still writing the columns they drop.
# A file declares the second kind with a header line:
#
#     -- migrate:phase post
#
# Default is `pre`. The deploy job runs `--phase pre` before `up -d` and
# `--phase post` after.
#
# Baselining
# ----------
# On a database that predates this script, migrations up to a known point have
# already been applied by hand. If `schema_migrations` is missing but
# application tables are present, the files up to the watermark in
# migrations/.baseline are RECORDED WITHOUT BEING RUN — re-running them would
# duplicate seed data (16_populate_programs) and drop columns (33) — and
# everything AFTER the watermark is applied normally.
#
# The watermark is why that file exists. Baselining the whole directory would
# mark a migration that has never run as applied and skip it forever, which is
# how a new migration silently fails to reach production.
#
# An empty database is built from zero instead, which is what makes a fresh VPS
# work with no manual step.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/migrations"
BASELINE_FILE="$MIGRATIONS_DIR/.baseline"

COMPOSE_FILE="${MIGRATE_COMPOSE_FILE:-docker-compose.traefik.yml}"
ENV_FILE="${MIGRATE_ENV_FILE:-env.production}"
DB_USER="${MIGRATE_DB_USER:-myzakat_user}"
DB_NAME="${MIGRATE_DB_NAME:-myzakat}"
DB_SERVICE="${MIGRATE_DB_SERVICE:-db}"
PHASE="pre"
DRY_RUN=""
LIST_ONLY=""
ALLOW_BASELINE="1"

die() { printf '\n\033[1;31mmigrate: %s\033[0m\n' "$1" >&2; exit 1; }
info() { printf '  %s\n' "$1"; }
ok() { printf '  \033[0;32m%s\033[0m\n' "$1"; }
warn() { printf '  \033[0;33m%s\033[0m\n' "$1"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --phase)        [ $# -ge 2 ] || die "--phase needs pre|post|all"; PHASE="$2"; shift 2 ;;
    --compose-file) [ $# -ge 2 ] || die "--compose-file needs a path"; COMPOSE_FILE="$2"; shift 2 ;;
    --env-file)     [ $# -ge 2 ] || die "--env-file needs a path"; ENV_FILE="$2"; shift 2 ;;
    --db-user)      [ $# -ge 2 ] || die "--db-user needs a name"; DB_USER="$2"; shift 2 ;;
    --db-name)      [ $# -ge 2 ] || die "--db-name needs a name"; DB_NAME="$2"; shift 2 ;;
    --service)      [ $# -ge 2 ] || die "--service needs a name"; DB_SERVICE="$2"; shift 2 ;;
    --dry-run)      DRY_RUN="1"; shift ;;
    --list)         LIST_ONLY="1"; shift ;;
    --no-baseline)  ALLOW_BASELINE=""; shift ;;
    -h|--help)      sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)              die "unknown argument '$1' (try --help)" ;;
  esac
done

case "$PHASE" in pre|post|all) ;; *) die "--phase must be pre, post or all" ;; esac
[ -d "$MIGRATIONS_DIR" ] || die "no migrations directory at $MIGRATIONS_DIR"
cd "$REPO_ROOT" || die "cannot enter $REPO_ROOT"

# ── Talking to the database ──────────────────────────────────────────
compose() {
  local env_args=()
  [ -f "$ENV_FILE" ] && env_args=(--env-file "$ENV_FILE")
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "${env_args[@]}" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "${env_args[@]}" "$@"
  fi
}

# -q so psql prints only what the SQL itself emits; ON_ERROR_STOP so a failure
# aborts instead of letting the rest of the file run against a broken state.
psql_stdin() {
  compose exec -T "$DB_SERVICE" \
    psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}
psql_value() {
  compose exec -T "$DB_SERVICE" \
    psql -U "$DB_USER" -d "$DB_NAME" -At -v ON_ERROR_STOP=1 -c "$1" 2>/dev/null | tr -d '\r'
}

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -c1-16
  else shasum -a 256 "$1" | cut -c1-16; fi
}

file_phase() {
  # "-- migrate:phase post" anywhere in the first 40 lines.
  local p
  p="$(head -40 "$1" | grep -m1 -oE '^--[[:space:]]*migrate:phase[[:space:]]+(pre|post)' \
        | grep -oE '(pre|post)$')"
  printf '%s' "${p:-pre}"
}

printf '\nmigrate: %s (phase=%s)\n' "$COMPOSE_FILE" "$PHASE"

compose ps "$DB_SERVICE" >/dev/null 2>&1 || die "cannot reach compose project — wrong --compose-file?"
if ! psql_value "SELECT 1" >/dev/null 2>&1; then
  die "database '$DB_NAME' is not reachable as '$DB_USER'. Is the '$DB_SERVICE' service up?"
fi

# ── The tracking table ───────────────────────────────────────────────
tracking_exists="$(psql_value "SELECT to_regclass('public.schema_migrations') IS NOT NULL")"

if [ "$tracking_exists" != "t" ]; then
  # Does this database already hold an application schema?
  #
  # This answer decides between "record everything as applied" and "run
  # everything from zero", and getting it wrong on a live database would replay
  # 16_populate_programs (duplicate seed rows) and 33 (drops columns). So a
  # failed or unparseable count is a hard stop, never a default: defaulting to
  # 0 here would mean a transient connection hiccup replays every migration
  # against production.
  existing="$(psql_value "SELECT count(*) FROM information_schema.tables
                           WHERE table_schema = 'public'")"
  case "$existing" in
    ''|*[!0-9]*)
      die "could not determine whether the database is empty (got '${existing}').
    Refusing to continue — guessing wrong here would replay every migration
    against a live schema. Check the connection and run again." ;;
  esac

  psql_stdin <<'SQL' >/dev/null || die "could not create schema_migrations"
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT PRIMARY KEY,
    checksum    TEXT NOT NULL,
    phase       TEXT NOT NULL DEFAULT 'pre',
    applied_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    baselined   BOOLEAN NOT NULL DEFAULT FALSE
);
SQL
  ok "created schema_migrations"

  if [ "$existing" -gt 0 ] && [ -n "$ALLOW_BASELINE" ]; then
    warn "database already has $existing table(s) and no migration history."
    warn "recording every existing migration as applied WITHOUT running it."
    warn "(re-running them would duplicate seed data and drop columns)"
    # The watermark: the last migration applied by hand. Everything after it
    # has never run and must NOT be recorded as though it had.
    watermark=""
    if [ -f "$BASELINE_FILE" ]; then
      watermark="$(grep -vE '^[[:space:]]*(#|$)' "$BASELINE_FILE" | head -1 | tr -d '[:space:]')"
    fi
    if [ -z "$watermark" ]; then
      warn "migrations/.baseline names no watermark — baselining NOTHING."
      warn "every migration will run. Stop now if this database is not empty."
    else
      if [ ! -f "$MIGRATIONS_DIR/$watermark" ]; then
        die "migrations/.baseline names '$watermark', which is not in migrations/.
    Refusing to guess how far this database was migrated by hand."
      fi
      info "watermark: $watermark (recorded as applied; later files will run)"
    fi

    baselined=0
    for f in $(ls "$MIGRATIONS_DIR"/[0-9]*.sql 2>/dev/null | sort); do
      base="$(basename "$f")"
      psql_value "INSERT INTO schema_migrations (filename, checksum, phase, baselined)
                  VALUES ('$base', '$(checksum "$f")', '$(file_phase "$f")', TRUE)
                  ON CONFLICT (filename) DO NOTHING" >/dev/null
      baselined=$((baselined + 1))
      # Filename sort is the same total order the apply loop uses, so stopping
      # here leaves exactly the files after the watermark pending.
      [ "$base" = "$watermark" ] && break
    done
    ok "baselined $baselined migration(s); the rest will be applied"
  elif [ "$existing" -gt 0 ]; then
    warn "--no-baseline: existing tables will NOT be recorded; every migration will run"
  else
    info "empty database — every migration will be applied from zero"
  fi
fi

# ── What is pending ──────────────────────────────────────────────────
applied_list="$(psql_value "SELECT filename FROM schema_migrations" || true)"
is_applied() { printf '%s\n' "$applied_list" | grep -qxF "$1"; }
applied_sum() { psql_value "SELECT checksum FROM schema_migrations WHERE filename = '$1'"; }

if [ -n "$LIST_ONLY" ]; then
  printf '\n  %-48s %-5s %s\n' "FILE" "PHASE" "STATE"
  for f in $(ls "$MIGRATIONS_DIR"/[0-9]*.sql 2>/dev/null | sort); do
    base="$(basename "$f")"
    if is_applied "$base"; then
      if [ "$(applied_sum "$base")" != "$(checksum "$f")" ]; then
        printf '  %-48s %-5s \033[1;31m%s\033[0m\n' "$base" "$(file_phase "$f")" "CHANGED SINCE APPLIED"
      else
        printf '  %-48s %-5s applied\n' "$base" "$(file_phase "$f")"
      fi
    else
      printf '  %-48s %-5s \033[0;33m%s\033[0m\n' "$base" "$(file_phase "$f")" "pending"
    fi
  done
  echo
  exit 0
fi

# ── Apply ────────────────────────────────────────────────────────────
applied_count=0
pending_count=0
drift=0

for f in $(ls "$MIGRATIONS_DIR"/[0-9]*.sql 2>/dev/null | sort); do
  base="$(basename "$f")"
  sum="$(checksum "$f")"
  fphase="$(file_phase "$f")"

  if is_applied "$base"; then
    recorded="$(applied_sum "$base")"
    if [ -n "$recorded" ] && [ "$recorded" != "$sum" ]; then
      warn "$base was edited after being applied ($recorded -> $sum)"
      drift=$((drift + 1))
    fi
    continue
  fi

  if [ "$PHASE" != "all" ] && [ "$fphase" != "$PHASE" ]; then
    pending_count=$((pending_count + 1))
    continue
  fi

  if [ -n "$DRY_RUN" ]; then
    info "would apply $base (phase=$fphase)"
    applied_count=$((applied_count + 1))
    continue
  fi

  printf '  applying %s ... ' "$base"

  # A file that opens its own transaction (migration 32) cannot be wrapped in
  # another: its COMMIT would close ours early and the tracking row would land
  # outside the migration's transaction. Those run as-is and are recorded
  # immediately afterwards — a window of one statement, and only for files that
  # manage their own atomicity anyway.
  if grep -qiE '^[[:space:]]*(BEGIN|COMMIT)[[:space:]]*;' "$f"; then
    if ! psql_stdin < "$f" >/dev/null; then
      printf '\n'; die "$base failed — nothing was recorded, database unchanged by this script"
    fi
    psql_value "INSERT INTO schema_migrations (filename, checksum, phase)
                VALUES ('$base', '$sum', '$fphase')" >/dev/null \
      || die "$base ran but could not be recorded — record it by hand before deploying again"
  else
    # Migration and its tracking row commit together, so a failure records
    # nothing and leaves no half-applied state behind.
    if ! { echo "BEGIN;"
           cat "$f"
           printf "INSERT INTO schema_migrations (filename, checksum, phase) VALUES ('%s','%s','%s');\n" \
                  "$base" "$sum" "$fphase"
           echo "COMMIT;"; } | psql_stdin >/dev/null; then
      printf '\n'; die "$base failed and was rolled back — database unchanged"
    fi
  fi

  printf '\033[0;32mok\033[0m\n'
  applied_count=$((applied_count + 1))
done

echo
if [ "$applied_count" -eq 0 ]; then
  ok "nothing to do — schema is up to date for phase '$PHASE'"
else
  ok "$applied_count migration(s) applied"
fi
[ "$pending_count" -gt 0 ] && info "$pending_count file(s) pending in another phase"
if [ "$drift" -gt 0 ]; then
  die "$drift applied migration(s) differ from the repository. The database and the
    repo disagree about what was run. Resolve it deliberately — either restore
    the file, or update its checksum if the edit was cosmetic:
      UPDATE schema_migrations SET checksum = '<new>' WHERE filename = '<file>';"
fi
exit 0
