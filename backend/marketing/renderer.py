"""Jinja2 template loader + Premailer CSS-inlining.

Templates live in backend/email_templates/. Each logical email has matching
.html and .txt files; the renderer auto-discovers both.

Pre-emailer runs once at render time to convert the <style> block in the
base layout into inline CSS attributes — required because most email
clients (Gmail, Outlook desktop) ignore or strip <style>.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from premailer import transform as premailer_transform

from logging_config import get_logger

logger = get_logger(__name__)

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "email_templates"

_env_html = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    undefined=StrictUndefined,  # Fail loud on missing variables
    trim_blocks=True,
    lstrip_blocks=True,
)

# Text templates: NO autoescape (it's plain text), still strict undefined.
_env_text = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=False,
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)


def _default_context(context: dict[str, Any]) -> dict[str, Any]:
    """Inject defaults every template can rely on without exploding on StrictUndefined."""
    import os

    base = {
        "frontend_url": os.getenv("FRONTEND_URL", "https://myzakat.org"),
        "brand_color": "#2563eb",
        "brand_title": "MyZakat",
        "brand_subtitle": None,
        "unsubscribe_url": None,
        "subject": "",
    }
    base.update(context or {})
    return base


def render(template_slug: str, context: dict[str, Any] | None = None) -> tuple[str, str]:
    """Render a template to (html, text) ready for sending.

    The HTML pass:
      1. Jinja renders templates/<slug>.html (which {% extends %} the base layout).
      2. Premailer inlines the CSS so every email client renders correctly.

    The text pass renders templates/<slug>.txt verbatim.

    Raises jinja2.TemplateNotFound if the slug doesn't exist.
    """
    ctx = _default_context(context or {})

    html_tpl = _env_html.get_template(f"{template_slug}.html")
    raw_html = html_tpl.render(**ctx)
    inlined_html = premailer_transform(
        raw_html,
        keep_style_tags=False,
        remove_classes=False,
        strip_important=False,
        disable_validation=True,
    )

    try:
        text_tpl = _env_text.get_template(f"{template_slug}.txt")
        text = text_tpl.render(**ctx)
    except Exception:
        # Text version is optional but strongly recommended; fall back to a
        # crude HTML→text conversion only if no .txt exists.
        from html import unescape
        import re

        text = unescape(re.sub(r"<[^>]+>", "", raw_html)).strip()

    return inlined_html, text
