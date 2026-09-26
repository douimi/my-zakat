"""
Centralized logging configuration for MyZakat backend.

Every line this emits is a single line of logfmt: space-separated key=value
pairs, values quoted only when they need it. One format serves both readers:

  VPS    grep event=donation.failed, or ./scripts/logs.sh donations --failed
  Loki   `| logfmt` turns every key into a real field, so Grafana can filter
         and chart on event, reason or amount instead of matching prose

Two rules make that work, and both were previously broken:

  1. Every record carries `ts`. The old formatter set `datefmt` but never put
     %(asctime)s in the format string, so the date format was simply unused
     and no line had a timestamp.

  2. One event is one line. Exceptions are folded into the same record as
     `error=` plus a `stack=` with newlines escaped, instead of being emitted
     as a second `logger.error("Traceback: %s", ...)` record. Multi-line
     records arrive in Loki as unrelated entries, which is why tracebacks
     used to scatter across the log instead of sitting with their event.

Emitting an event
-----------------
    from logging_config import get_logger
    logger = get_logger(__name__)

    logger.event(DONATION_SUCCEEDED, "donation succeeded",
                 donation_id=d.id, amount=d.amount)

    logger.event(DONATION_FAILED, "card was declined", level=logging.ERROR,
                 exc=err, reason="card_declined", amount=d.amount)

Plain logger.info/.warning/.error keep working and still get a timestamp;
they just have no `event` field, so the dashboards ignore them. Prefer
.event() for anything worth finding again.
"""
import logging
import os
import sys
import time

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# Attribute name used to smuggle structured fields onto a LogRecord. Chosen to
# not collide with any stdlib LogRecord attribute.
_FIELDS_ATTR = "_logfmt_fields"

# Marks the stdout handler this module owns, so setup_logging() can reconfigure
# its own handler without touching anyone else's.
_OUR_HANDLER = "_myzakat_logfmt_handler"

# LogRecord attributes that are stdlib-owned. Anything else a caller attaches
# via extra= is treated as a field to render, so `extra={"donation_id": 4}`
# works as well as the .event() helper.
_RESERVED = frozenset({
    "args", "asctime", "created", "exc_info", "exc_text", "filename",
    "funcName", "levelname", "levelno", "lineno", "module", "msecs",
    "message", "msg", "name", "pathname", "process", "processName",
    "relativeCreated", "stack_info", "thread", "threadName", "taskName",
    _FIELDS_ATTR,
})

# Fields that lead the line, in this order, before any caller-supplied ones.
# `event` sits right after the logger so it is the first thing the eye lands
# on when scrolling `docker logs`.
_LEADING = ("event",)

# Long free text goes last so it can never push the structured fields off the
# right-hand edge of a terminal.
_TRAILING = ("msg", "error", "stack")


def _quote(value) -> str:
    """Render one logfmt value, quoting and escaping only when required."""
    if value is None:
        return '""'
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        # Money and durations: keep them readable rather than 50.000000000001.
        text = ("%.2f" % value).rstrip("0").rstrip(".") or "0"
    else:
        text = str(value)

    if text == "":
        return '""'
    # Newlines and tabs must be escaped or the record stops being one line,
    # which is exactly the bug that scattered tracebacks across the log.
    needs_quotes = any(c in text for c in ' ="\\\n\r\t')
    if not needs_quotes:
        return text
    text = (text.replace("\\", "\\\\").replace('"', '\\"')
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t"))
    return '"%s"' % text


class LogfmtFormatter(logging.Formatter):
    """Render a LogRecord as one line of logfmt."""

    # RFC3339 in UTC. Sorts lexicographically, unambiguous across timezones,
    # and Loki parses it without help.
    def formatTime(self, record, datefmt=None):
        base = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
        return "%s.%03dZ" % (base, record.msecs)

    def format(self, record: logging.LogRecord) -> str:
        fields = {}

        # 1. Fields attached by .event()
        fields.update(getattr(record, _FIELDS_ATTR, None) or {})

        # 2. Fields attached by a bare extra={...}
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                fields.setdefault(key, value)

        # 3. The message itself, %-formatted as the caller intended.
        try:
            fields["msg"] = record.getMessage()
        except Exception as exc:  # a bad %-format must not lose the record
            fields["msg"] = "%r (unformattable: %s)" % (record.msg, exc)
        # stdlib Formatter.format() sets this, and callers reasonably read it —
        # pytest's caplog assertions do, for one. Overriding format() without
        # setting it silently broke `record.message` for everyone downstream.
        record.message = fields["msg"]

        # 4. Exception and stack, folded into THIS record rather than a second
        #    one, with newlines escaped by _quote so the line stays a line.
        if record.exc_info:
            exc_type, exc_value, _ = record.exc_info
            if exc_type is not None:
                fields.setdefault("error", "%s: %s" % (exc_type.__name__, exc_value))
                fields.setdefault("stack", self.formatException(record.exc_info))
        if record.stack_info:
            fields.setdefault("stack", record.stack_info)

        parts = [
            "ts=%s" % self.formatTime(record),
            "level=%s" % record.levelname.lower(),
            "logger=%s" % _quote(record.name),
        ]
        for key in _LEADING:
            if key in fields:
                parts.append("%s=%s" % (key, _quote(fields.pop(key))))
        trailing = [(k, fields.pop(k)) for k in _TRAILING if k in fields]
        for key, value in fields.items():
            parts.append("%s=%s" % (key, _quote(value)))
        for key, value in trailing:
            parts.append("%s=%s" % (key, _quote(value)))
        return " ".join(parts)


class EventLogger(logging.Logger):
    """A Logger with .event() for structured, queryable records."""

    def event(self, event: str, msg: str = "", *, level: int = logging.INFO,
              exc=None, **fields):
        """
        Emit one structured record.

        event   stable dotted name, e.g. "donation.succeeded". Dashboards and
                alerts match on this, so it must not be reworded casually —
                the taxonomy lives in log_events.py.
        msg     free text for a human; never parsed.
        level   logging.INFO / WARNING / ERROR.
        exc     an exception to fold in as error= and stack=.
        fields  any extra key=value pairs.
        """
        if not self.isEnabledFor(level):
            return
        payload = {"event": event}
        payload.update({k: v for k, v in fields.items() if v is not None})
        exc_info = None
        if exc is not None:
            exc_info = (type(exc), exc, exc.__traceback__)
        self.log(level, msg, extra={_FIELDS_ATTR: payload}, exc_info=exc_info)


# Must be set before any of our loggers are instantiated. Every module reaches
# its logger through get_logger() below, which is imported from here, so this
# line always runs first.
logging.setLoggerClass(EventLogger)


def mask_email(email) -> str:
    """
    Reduce an email to something safe to log but still recognisable when a
    donor writes in: ahmed@gmail.com -> a***@gmail.com

    Logs ship to Loki and are retained for weeks, so donor addresses do not
    belong in them verbatim. Keeping the first character and the domain is
    enough to line a log line up against a donation record.
    """
    if not email or not isinstance(email, str) or "@" not in email:
        return "-"
    local, _, domain = email.partition("@")
    if not local:
        return "-"
    return "%s***@%s" % (local[0], domain)


def setup_logging():
    """Call once at startup, before any request is handled."""
    root = logging.getLogger()

    # Find OUR handler rather than reformatting whatever is attached. Other
    # handlers on root belong to someone else — pytest's caplog is one, and
    # restyling it made `record.message` disagree with what its owner expected.
    # Idempotent: calling setup_logging() twice reconfigures, never duplicates.
    ours = next((h for h in root.handlers if getattr(h, _OUR_HANDLER, False)), None)
    if ours is None:
        ours = logging.StreamHandler(sys.stdout)
        setattr(ours, _OUR_HANDLER, True)
        root.addHandler(ours)
    ours.setFormatter(LogfmtFormatter())

    root.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

    # Third-party loggers that say nothing we act on. httpx and httpcore are
    # in here because they log a line per outbound request at INFO, which means
    # every Resend email and every metals.dev price lookup announced itself.
    #
    # Skipped entirely at LOG_LEVEL=DEBUG: the point of clamping these is a
    # quiet steady state, and someone who has deliberately asked for DEBUG is
    # troubleshooting and wants everything. That also keeps nisab_service's
    # api-key redaction filter meaningful — a filter only runs on records that
    # pass the level check, so clamping unconditionally would mean the key
    # redaction was never exercised on the very records it exists to protect.
    # Set explicitly in both directions rather than skipping the clamp at
    # DEBUG: logger levels are global and sticky, so a clamp applied by an
    # earlier call would otherwise survive a later switch to DEBUG and leave
    # the verbosity that was just asked for permanently suppressed.
    third_party_level = logging.NOTSET if root.level <= logging.DEBUG else logging.WARNING
    for name in ("urllib3", "botocore", "boto3", "s3transfer", "stripe",
                 "asyncio", "multipart", "PIL", "httpx", "httpcore",
                 "watchfiles", "arq"):
        logging.getLogger(name).setLevel(third_party_level)

    # Uvicorn installs its own handlers and formatters with propagate=False,
    # so its lines bypass everything above — that is why the log was full of
    # timestamp-less "INFO:     10.0.1.4:0 - "GET /health" 200" entries.
    # Take its handlers away and let the records reach our root handler.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.asgi"):
        log = logging.getLogger(name)
        log.handlers.clear()
        log.propagate = True

    # The access log is pure volume: one line per request, including every
    # media file, and Traefik already records access at the edge (and ships it
    # to Loki too). Dockerfile passes --no-access-log; this makes it stick even
    # when uvicorn is started without the flag.
    access = logging.getLogger("uvicorn.access")
    access.handlers.clear()
    access.propagate = False
    access.disabled = True


def get_logger(name: str) -> EventLogger:
    """Get a named logger. Usage: logger = get_logger(__name__)"""
    return logging.getLogger(name)  # type: ignore[return-value]
