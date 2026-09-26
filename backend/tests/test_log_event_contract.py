"""
Guard the contract between log_events.py, the Grafana dashboards and logs.sh.

The event names are an interface with no compiler behind it. Rename one in the
code and the dashboard keeps working -- it just returns nothing, forever, and an
empty panel is indistinguishable from a quiet system. That failure is silent
until someone needs the dashboard during an incident, which is the worst possible
moment to discover it. These tests make the rename fail here instead.
"""
import json
import os
import re

import pytest

import log_events as ev

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(BACKEND)
DASHBOARD_DIR = os.path.join(REPO, "monitoring", "grafana", "dashboards")
LOGS_SH = os.path.join(REPO, "scripts", "logs.sh")

# event="x" and event=~"a|b" and event!="y"
EVENT_FILTER = re.compile(r'event\s*(?:=~|!=|=)\s*\\?"([^"\\]+)')


def dashboard_files():
    return [os.path.join(DASHBOARD_DIR, n)
            for n in sorted(os.listdir(DASHBOARD_DIR)) if n.endswith(".json")]


def exprs_of(path):
    out = []

    def walk(panel):
        for target in panel.get("targets", []) or []:
            if target.get("expr"):
                out.append(target["expr"])
        for sub in panel.get("panels", []) or []:
            walk(sub)

    dash = json.load(open(path, encoding="utf-8"))
    for panel in dash.get("panels", []):
        walk(panel)
    return out


def events_referenced(expr):
    """Event names a query pins down, ignoring open-ended wildcards."""
    found = set()
    for raw in EVENT_FILTER.findall(expr):
        for alt in raw.split("|"):
            alt = alt.strip()
            # 'donation..*' is a deliberate prefix match over a whole family,
            # not a specific event; there is nothing to check it against.
            if not alt or ".*" in alt or alt.endswith("."):
                continue
            # LogQL regex: a literal dot is written '.' here, same as ours.
            found.add(alt)
    return found


def backend_sources():
    for root, dirs, files in os.walk(BACKEND):
        dirs[:] = [d for d in dirs if d not in
                   {"tests", "__pycache__", "uploads", "certificates", "scripts"}]
        for name in files:
            if name.endswith(".py") and name != "log_events.py":
                yield os.path.join(root, name)


@pytest.fixture(scope="module")
def backend_text():
    parts = []
    for path in backend_sources():
        with open(path, encoding="utf-8", errors="replace") as fh:
            parts.append(fh.read())
    return "\n".join(parts)


# --------------------------------------------------------------------------

def test_dashboards_exist():
    files = dashboard_files()
    assert files, "no dashboard JSON found -- provisioning would come up empty"
    for path in files:
        json.load(open(path, encoding="utf-8"))  # raises on malformed JSON


@pytest.mark.parametrize("path", dashboard_files(), ids=os.path.basename)
def test_every_event_a_dashboard_filters_on_still_exists(path):
    """A panel naming an event that log_events.py no longer defines is a panel
    that will silently return nothing."""
    known = set(ev.ALL_EVENTS)
    unknown = set()
    for expr in exprs_of(path):
        unknown |= events_referenced(expr) - known
    assert not unknown, (
        "%s filters on event name(s) that log_events.py does not define: %s\n"
        "Either the event was renamed in code without updating this dashboard, "
        "or the dashboard has a typo." % (os.path.basename(path), sorted(unknown))
    )


def test_every_payment_event_is_actually_emitted(backend_text):
    """An event defined but never emitted means a dashboard tile that can only
    ever read zero -- which looks exactly like 'nothing went wrong'."""
    missing = []
    for name in ev.PAYMENT_EVENTS:
        const = next((k for k, v in vars(ev).items()
                      if isinstance(v, str) and v == name and k.isupper()), None)
        # Call sites reference the constant (ev.DONATION_SUCCEEDED), not the
        # string, so look for either.
        if const and re.search(r"\b%s\b" % const, backend_text):
            continue
        if ('"%s"' % name) in backend_text or ("'%s'" % name) in backend_text:
            continue
        missing.append(name)
    assert not missing, (
        "defined in log_events.py but never emitted: %s" % sorted(missing))


def test_outcome_values_are_only_the_two_we_group_by(backend_text):
    """`outcome` is a grouping key; a third value would quietly split every
    success-rate calculation."""
    used = set(re.findall(r'outcome\s*=\s*"([a-z_]+)"', backend_text))
    used |= set(re.findall(r'outcome=ev\.OUTCOME_([A-Z]+)', backend_text))
    allowed = {ev.OUTCOME_SUCCESS, ev.OUTCOME_FAILURE, "SUCCESS", "FAILURE"}
    assert used <= allowed, "unexpected outcome value(s): %s" % sorted(used - allowed)


def test_failure_reasons_come_from_the_bounded_vocabulary(backend_text):
    """Free-text reasons would turn `sum by (reason)` into one bucket per
    message, which is what the bounded list exists to prevent."""
    used = set(re.findall(r'reason=ev\.(REASON_[A-Z_]+)', backend_text))
    declared = {k for k in vars(ev) if k.startswith("REASON_")}
    assert used <= declared, (
        "reason constants used but not declared in log_events.py: %s"
        % sorted(used - declared))
    assert used, "no reason= fields found -- failures would be ungroupable"


def test_logs_sh_event_prefixes_match_the_taxonomy():
    """scripts/logs.sh greps on event= prefixes; they have to be real families."""
    if not os.path.exists(LOGS_SH):
        pytest.skip("scripts/logs.sh not present")
    text = open(LOGS_SH, encoding="utf-8").read()

    families = {e.split(".", 1)[0] for e in ev.ALL_EVENTS}
    # e.g.  event=(donation|subscription|webhook)\.
    for group in re.findall(r"event=\(([a-z|]+)\)", text):
        for family in group.split("|"):
            assert family in families, (
                "logs.sh greps for event family '%s', which no event in "
                "log_events.py uses" % family)

    # e.g.  event=donation\.certificate_
    for literal in re.findall(r"event=([a-z_]+)\\\.", text):
        assert literal in families, (
            "logs.sh greps for event family '%s', which does not exist" % literal)


def test_the_priority_events_are_present():
    """The tiles the Donations dashboard leads with must have events behind them.
    Spelled out rather than derived, so deleting one is a deliberate act."""
    for name in ("donation.succeeded", "donation.failed", "donation.session_failed",
                 "donation.certificate_failed", "webhook.failed", "webhook.rejected"):
        assert name in ev.ALL_EVENTS, "%s went missing from the taxonomy" % name
