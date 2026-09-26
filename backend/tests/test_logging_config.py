"""
Tests for the logfmt logging layer.

These exist because the log format is consumed by machines now: Promtail parses
it, the Grafana dashboards filter on the fields it produces, and scripts/logs.sh
greps it. A formatting regression is therefore a monitoring outage, not a
cosmetic problem, and it would otherwise be invisible until someone needed the
dashboard during an incident.

Two of these guard bugs that were actually shipped:
  - test_every_record_carries_a_timestamp  (datefmt set, %(asctime)s absent)
  - test_exception_is_folded_into_one_line (tracebacks as separate records)
"""
import logging
import re

import pytest

from logging_config import LogfmtFormatter, EventLogger, mask_email, get_logger
import log_events


def render(record) -> str:
    return LogfmtFormatter().format(record)


def make_record(msg="hello", level=logging.INFO, args=(), **kwargs):
    record = logging.LogRecord(
        name="donations", level=level, pathname=__file__, lineno=1,
        msg=msg, args=args, exc_info=kwargs.pop("exc_info", None),
    )
    for key, value in kwargs.items():
        setattr(record, key, value)
    return record


def parse_logfmt(line: str) -> dict:
    """Minimal logfmt reader, mirroring what Loki's `| logfmt` does."""
    out = {}
    for match in re.finditer(r'(\w+)=(?:"((?:[^"\\]|\\.)*)"|([^\s]*))', line):
        key, quoted, bare = match.groups()
        if quoted is not None:
            value = (quoted.replace('\\"', '"').replace("\\n", "\n")
                           .replace("\\r", "\r").replace("\\t", "\t")
                           .replace("\\\\", "\\"))
        else:
            value = bare
        out[key] = value
    return out


# --------------------------------------------------------------------------
# The two shipped bugs
# --------------------------------------------------------------------------

def test_every_record_carries_a_timestamp():
    """The old formatter set datefmt but omitted %(asctime)s, so no line had
    a timestamp at all — the original complaint."""
    fields = parse_logfmt(render(make_record()))
    assert "ts" in fields, "no timestamp in the rendered line"
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", fields["ts"]), fields["ts"]


def test_exception_is_folded_into_one_line():
    """An exception must not become a second record: multi-line output arrives
    in Loki as unrelated entries, scattering tracebacks away from their event."""
    try:
        raise ValueError("card exploded")
    except ValueError as exc:
        record = make_record("boom", level=logging.ERROR,
                             exc_info=(type(exc), exc, exc.__traceback__))
    line = render(record)

    assert "\n" not in line, "record spans multiple lines"
    fields = parse_logfmt(line)
    assert fields["error"] == "ValueError: card exploded"
    assert "ValueError: card exploded" in fields["stack"]
    assert "Traceback" in fields["stack"]


# --------------------------------------------------------------------------
# logfmt correctness — Loki has to be able to parse this
# --------------------------------------------------------------------------

def test_core_fields_and_ordering():
    line = render(make_record("hi", event="donation.succeeded"))
    assert line.startswith("ts=")
    # level then logger then event, so the eye lands on the event when scrolling.
    assert re.search(r"level=info logger=donations event=donation\.succeeded", line)


def test_message_is_percent_formatted():
    fields = parse_logfmt(render(make_record("donation %s for $%s", args=(412, 50))))
    assert fields["msg"] == "donation 412 for $50"


def test_a_broken_format_string_still_logs():
    """A bad %-format must never destroy the record; the money path logs here."""
    line = render(make_record("donation %s %s", args=(412,)))
    fields = parse_logfmt(line)
    assert "unformattable" in fields["msg"]
    assert fields["level"] == "info"


@pytest.mark.parametrize("value,expected", [
    ("plain", "plain"),
    ("has space", '"has space"'),
    ('has"quote', '"has\\"quote"'),
    ("has=equals", '"has=equals"'),
    ("line\nbreak", '"line\\nbreak"'),
    ("", '""'),
    (None, '""'),
    (True, "true"),
    (False, "false"),
    (50.0, "50"),
    (50.5, "50.5"),
])
def test_value_quoting(value, expected):
    from logging_config import _quote
    assert _quote(value) == expected


def test_newlines_in_a_message_cannot_break_the_line():
    line = render(make_record("first\nsecond"))
    assert "\n" not in line
    assert parse_logfmt(line)["msg"] == "first\nsecond"


def test_extra_fields_are_rendered():
    fields = parse_logfmt(render(make_record("x", donation_id=412, amount=50.0)))
    assert fields["donation_id"] == "412"
    assert fields["amount"] == "50"


def test_long_text_fields_come_last():
    """msg/error/stack trail the structured fields so they cannot push
    donation_id or reason off the right edge of a terminal."""
    line = render(make_record("a very long human readable message",
                              event="donation.failed", reason="card_declined",
                              donation_id=412))
    assert line.index("reason=") < line.index("msg=")
    assert line.index("donation_id=") < line.index("msg=")


# --------------------------------------------------------------------------
# .event()
# --------------------------------------------------------------------------

def test_event_helper_emits_structured_record(caplog):
    logger = get_logger("test.events")
    assert isinstance(logger, EventLogger), "setLoggerClass did not take effect"

    with caplog.at_level(logging.INFO, logger="test.events"):
        logger.event(log_events.DONATION_SUCCEEDED, "donation succeeded",
                     donation_id=412, amount=50.0, outcome=log_events.OUTCOME_SUCCESS)

    fields = parse_logfmt(render(caplog.records[-1]))
    assert fields["event"] == "donation.succeeded"
    assert fields["donation_id"] == "412"
    assert fields["outcome"] == "success"
    assert fields["msg"] == "donation succeeded"


def test_event_helper_folds_the_exception(caplog):
    logger = get_logger("test.events")
    with caplog.at_level(logging.ERROR, logger="test.events"):
        logger.event(log_events.DONATION_FAILED, "could not charge",
                     level=logging.ERROR, exc=RuntimeError("stripe is down"),
                     reason=log_events.REASON_STRIPE_ERROR)

    line = render(caplog.records[-1])
    assert "\n" not in line
    fields = parse_logfmt(line)
    assert fields["level"] == "error"
    assert fields["reason"] == "stripe_error"
    assert fields["error"] == "RuntimeError: stripe is down"


def test_event_drops_none_fields_but_keeps_falsey_ones(caplog):
    """None means "not applicable" and is noise; 0 and "" are real values."""
    logger = get_logger("test.events")
    with caplog.at_level(logging.INFO, logger="test.events"):
        logger.event("x.y", "m", donation_id=None, amount=0, note="")

    fields = parse_logfmt(render(caplog.records[-1]))
    assert "donation_id" not in fields
    assert fields["amount"] == "0"
    assert fields["note"] == ""


# --------------------------------------------------------------------------
# Donor PII
# --------------------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("ahmed@gmail.com", "a***@gmail.com"),
    ("a@b.co", "a***@b.co"),
    ("", "-"),
    (None, "-"),
    ("not-an-email", "-"),
    ("@nolocal.com", "-"),
    (12345, "-"),
])
def test_mask_email(raw, expected):
    assert mask_email(raw) == expected


def test_masked_email_is_still_matchable_to_a_donor():
    """Masking has to leave enough to line a log line up against a donation
    row when a donor writes in, or it defeats the purpose of logging it."""
    assert mask_email("ahmed@gmail.com").endswith("@gmail.com")
    assert mask_email("ahmed@gmail.com").startswith("a")


# --------------------------------------------------------------------------
# The noise policy
#
# These pin the "cut hard" decision so a future change to setup_logging()
# cannot quietly put thousands of lines a day back into the log, and cannot
# quietly make the api-key redaction filter unreachable either.
# --------------------------------------------------------------------------

def test_third_party_chatter_is_clamped_by_default():
    """httpx logs one INFO line per outbound request — every Resend email and
    every metals.dev lookup. main.py has already called setup_logging()."""
    import logging_config
    logging_config.setup_logging()
    for name in ("httpx", "httpcore", "botocore", "stripe", "urllib3"):
        assert logging.getLogger(name).level == logging.WARNING, name


def test_uvicorn_access_log_is_off_and_errors_still_reach_us():
    """The access log was a line per request including every media file, with
    no timestamp, and Traefik already records access at the edge. Uvicorn's
    error channel must still come through, and through OUR formatter."""
    import logging_config
    logging_config.setup_logging()

    assert logging.getLogger("uvicorn.access").disabled is True

    for name in ("uvicorn", "uvicorn.error"):
        log = logging.getLogger(name)
        assert log.propagate is True, "%s would bypass the logfmt formatter" % name
        assert not log.handlers, "%s still has its own handler" % name


def test_debug_restores_third_party_verbosity(monkeypatch):
    """The quiet steady state must be recoverable: someone who sets
    LOG_LEVEL=DEBUG is troubleshooting and wants the outbound requests back.

    This is also what keeps nisab_service's api-key redaction filter
    meaningful — a logging.Filter only runs on records that pass the level
    check, so if httpx were clamped unconditionally the redaction would never
    be exercised on the records it exists to protect.
    """
    import importlib
    import logging_config

    root = logging.getLogger()
    saved_root = root.level
    saved = {n: logging.getLogger(n).level
             for n in ("httpx", "httpcore", "botocore", "stripe", "urllib3")}
    try:
        monkeypatch.setenv("LOG_LEVEL", "DEBUG")
        importlib.reload(logging_config)
        logging_config.setup_logging()
        assert root.level == logging.DEBUG
        assert logging.getLogger("httpx").level != logging.WARNING, \
            "DEBUG should not leave httpx clamped"
    finally:
        monkeypatch.delenv("LOG_LEVEL", raising=False)
        importlib.reload(logging_config)
        root.setLevel(saved_root)
        for name, level in saved.items():
            logging.getLogger(name).setLevel(level)


def test_the_api_key_is_still_redacted_when_verbosity_is_restored():
    """Belt and braces across the two changes: cutting httpx noise must not be
    the only thing standing between the metals key and the log."""
    import nisab_service  # noqa: F401 -- importing installs the filter
    from nisab_service import _RedactApiKey

    record = logging.LogRecord(
        name="httpx", level=logging.INFO, pathname=__file__, lineno=1,
        msg='HTTP Request: %s %s', args=(
            "GET",
            "https://api.metals.dev/v1/latest?api_key=SUPERSECRETKEY123&currency=USD",
        ), exc_info=None,
    )
    assert _RedactApiKey().filter(record) is True
    line = render(record)
    assert "SUPERSECRETKEY123" not in line
    assert "api_key=***" in line


# --------------------------------------------------------------------------
# setup_logging() must not vandalise handlers it does not own
#
# Both of these guard bugs this rework introduced and their own suite caught:
# reformatting pytest's caplog handler made record.message disagree with what
# caplog's users expect, which broke an unrelated media-library assertion.
# --------------------------------------------------------------------------

def test_setup_logging_leaves_foreign_handlers_alone():
    import logging_config

    root = logging.getLogger()
    foreign = logging.StreamHandler()
    foreign_formatter = logging.Formatter("%(message)s")
    foreign.setFormatter(foreign_formatter)
    root.addHandler(foreign)
    try:
        logging_config.setup_logging()
        assert foreign.formatter is foreign_formatter, \
            "setup_logging() restyled a handler belonging to someone else"
    finally:
        root.removeHandler(foreign)


def test_setup_logging_is_idempotent():
    """Called twice it must reconfigure, not stack up duplicate handlers that
    would print every line two or more times."""
    import logging_config

    root = logging.getLogger()
    before = len(root.handlers)
    logging_config.setup_logging()
    logging_config.setup_logging()
    assert len(root.handlers) == before, "setup_logging() added duplicate handlers"


def test_formatter_sets_record_message():
    """stdlib Formatter.format() sets record.message and callers read it —
    pytest's caplog assertions among them."""
    record = make_record("donation %s recorded", args=(412,))
    LogfmtFormatter().format(record)
    assert record.message == "donation 412 recorded"
