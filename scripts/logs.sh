#!/usr/bin/env bash
#
# Read MyZakat logs on the VPS without remembering any of this.
#
#   ./scripts/logs.sh                      follow donation events + anything wrong
#   ./scripts/logs.sh donations            the whole money path
#   ./scripts/logs.sh donations --failed   only donations that failed
#   ./scripts/logs.sh errors               errors and warnings, all services
#   ./scripts/logs.sh event donation.succeeded
#   ./scripts/logs.sh grep cs_live_a1OI4h  find one Stripe session
#   ./scripts/logs.sh raw                  unfiltered, unformatted
#
# Options (anywhere): --since 30m | --lines 500 | --follow/-f | --no-color
#                     --container myzakat-worker
#
# The backend emits logfmt, so everything here is grep on key=value. The same
# fields drive the Grafana dashboards, so what you match here matches there.
set -uo pipefail

CONTAINER="${MYZAKAT_CONTAINER:-myzakat-backend}"
SINCE=""
LINES="300"
FOLLOW=""
COLOR="auto"
MODE=""
PATTERN=""

die() { printf 'logs.sh: %s\n' "$1" >&2; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --since)     [ $# -ge 2 ] || die "--since needs a value, e.g. --since 30m"; SINCE="$2"; shift 2 ;;
    --lines|-n)  [ $# -ge 2 ] || die "--lines needs a number"; LINES="$2"; shift 2 ;;
    --container) [ $# -ge 2 ] || die "--container needs a name"; CONTAINER="$2"; shift 2 ;;
    --follow|-f) FOLLOW="1"; shift ;;
    --no-color)  COLOR="never"; shift ;;
    --failed)    MODE="${MODE:-donations}"; FAILED_ONLY="1"; shift ;;
    -h|--help)   sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    donations|errors|raw|all|receipts|webhooks)
                 MODE="$1"; shift ;;
    event)       [ $# -ge 2 ] || die "event needs a name, e.g. event donation.succeeded"
                 MODE="event"; PATTERN="$2"; shift 2 ;;
    grep)        [ $# -ge 2 ] || die "grep needs a pattern"
                 MODE="grep"; PATTERN="$2"; shift 2 ;;
    *)           die "unknown argument '$1' (try --help)" ;;
  esac
done
MODE="${MODE:-default}"
FAILED_ONLY="${FAILED_ONLY:-}"

command -v docker >/dev/null 2>&1 || die "docker is not on PATH"
docker inspect "$CONTAINER" >/dev/null 2>&1 \
  || die "no container named '$CONTAINER' (set --container or MYZAKAT_CONTAINER)"

# ── Build the docker logs command ───────────────────────────────────────────
set -- logs
[ -n "$FOLLOW" ] && set -- "$@" --follow
[ -n "$SINCE" ] && set -- "$@" --since "$SINCE"
set -- "$@" --tail "$LINES" "$CONTAINER"

# ── Pick the filter ─────────────────────────────────────────────────────────
# Matching on key=value, never on wording. Anchoring each pattern with 'event='
# or 'level=' keeps a donor's name or a Stripe id from matching by accident.
case "$MODE" in
  default)   FILTER='(event=(donation|subscription|webhook)\.|level=(error|warning|critical))' ;;
  donations) FILTER='event=(donation|subscription|webhook)\.' ;;
  receipts)  FILTER='event=donation\.certificate_' ;;
  webhooks)  FILTER='event=webhook\.' ;;
  errors)    FILTER='level=(error|warning|critical|fatal)' ;;
  event)     FILTER="event=$(printf '%s' "$PATTERN" | sed 's/[.[\*^$]/\\&/g')( |$)" ;;
  grep)      FILTER="$PATTERN" ;;
  raw|all)   FILTER='' ;;
esac
[ -n "$FAILED_ONLY" ] && FILTER='outcome=failure'

use_color() {
  [ "$COLOR" = "never" ] && return 1
  [ -t 1 ] || return 1
  return 0
}
if use_color; then USE_COLOR=1; else USE_COLOR=0; fi

# ── Format ──────────────────────────────────────────────────────────────────
# Pull ts / level / event to the front as fixed columns and leave the remaining
# key=value pairs alone, so the line stays greppable after formatting.
pretty() {
  awk -v color="$USE_COLOR" '
    function esc(c) { return color ? sprintf("\033[%sm", c) : "" }
    BEGIN {
      RESET = esc("0"); BOLD = esc("1"); DIM = esc("2")
      C["error"]=esc("1;31"); C["critical"]=esc("1;31"); C["fatal"]=esc("1;31")
      C["warning"]=esc("33"); C["warn"]=esc("33")
      C["info"]=esc("32"); C["debug"]=esc("2;37"); C["trace"]=esc("2;37")
    }
    {
      line = $0
      ts = lvl = evt = ""
      # ts=2026-09-26T18:45:12.108Z -> 18:45:12 (the date is the log filter s job)
      if (match(line, /ts=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z/)) {
        full = substr(line, RSTART+3, RLENGTH-3)
        ts = substr(full, 12, 8)
        line = substr(line, 1, RSTART-1) substr(line, RSTART+RLENGTH+1)
      }
      if (match(line, /level=[a-z]+/)) {
        lvl = substr(line, RSTART+6, RLENGTH-6)
        line = substr(line, 1, RSTART-1) substr(line, RSTART+RLENGTH+1)
      }
      if (match(line, /event=[a-zA-Z0-9_.]+/)) {
        evt = substr(line, RSTART+6, RLENGTH-6)
        line = substr(line, 1, RSTART-1) substr(line, RSTART+RLENGTH+1)
      }
      sub(/^logger=[^ ]+ /, "", line)   # the event name is the useful identifier
      gsub(/^ +| +$/, "", line)
      if (ts == "") { print line; next }   # not one of ours: pass through intact
      c = (lvl in C) ? C[lvl] : ""
      printf "%s%s%s %s%-7s%s %s%-32s%s %s\n", DIM, ts, RESET, c, toupper(lvl), RESET, BOLD, evt, RESET, line
    }
  '
}

if [ -z "$FILTER" ]; then
  exec docker "$@"
fi

# --line-buffered so --follow stays live through the pipe.
docker "$@" 2>&1 | grep -E --line-buffered "$FILTER" | pretty
