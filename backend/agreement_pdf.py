"""Render a funding & implementation agreement as a PDF.

Reproduces the document MyZakat already issues by hand — see
"agreement for project 7.pdf", which this was built against:

  * running header  : logo + "Zakat Distribution Foundation" / www.myzakat.org
  * running footer  : a rule, then the P.O. Box / email / phone line
  * page 1          : title block, then the labelled header fields
  * sections 1-8    : Purpose, Use of Funds, Required Distribution,
                      Beneficiary Selection, Financial Documentation,
                      Project Documentation, Final Report, Acknowledgment
  * last page       : the two signature blocks, left blank to be signed

Pure rendering: no HTTP, no ORM, no database session. The single argument is
duck-typed, like proposal_pdf.render_proposal_pdf — anything exposing the
agreement's fields renders, which keeps this module out of the models import
graph and makes it trivial to test with a stub.

The numbers in the header block are quoted again in sections 3, 4 and 7. They
are therefore read from the agreement record ONCE here and interpolated, rather
than being re-derived per section, so a corrected figure cannot end up
disagreeing with itself halfway down the document.
"""
from __future__ import annotations

import io
import os
from typing import Any

# Same constants the receipt uses, so both documents are unmistakably from the
# same organisation. Imported lazily inside the renderer to keep this module
# free of reportlab at import time (pdf_service pulls in reportlab.lib.colors
# at module scope, and importing it here would do the same).
ORG_NAME = "Zakat Distribution Foundation"
ORG_WEBSITE = "www.myzakat.org"
ORG_ADDRESS_LINE = (
    "P.O. Box 2250, Winchester, VA 22604 | info@myzakat.org | "
    "(540) 676-0330 or 1-800-myzakat"
)
CHAIRPERSON_NAME = "Naser Hdieb"
CHAIRPERSON_TITLE = "Chairperson"

LOGO_PATH = os.path.join(os.path.dirname(__file__), "logo.png")


def safe_slug(text: str) -> str:
    import re
    return re.sub(r"[^a-zA-Z0-9]+", "-", text or "agreement").strip("-").lower()[:40] or "agreement"


def _money(value: Any) -> str:
    """$4,500 — no cents when there are none, which is how the example reads."""
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        return "$0 USD"
    if abs(amount - round(amount)) < 0.005:
        return "${:,.0f} USD".format(amount)
    return "${:,.2f} USD".format(amount)


def render_agreement_pdf(a: Any) -> bytes:
    """Render the agreement. `a` exposes the ProposalAgreement fields plus
    `proposal_id`."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        Image, ListFlowable, ListItem, PageBreak, Paragraph,
        SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    BRAND_BLUE = colors.HexColor("#1e3a8a")
    TEXT_DARK = colors.HexColor("#1f2937")
    TEXT_MUTED = colors.HexColor("#6b7280")

    # ── Values quoted in more than one place, resolved once ───────────
    target = "%d %s" % (int(a.target_count or 0), (a.target_label or "beneficiaries").strip())
    per_beneficiary = (a.distribution_per_beneficiary or "").strip()
    total_distribution = (a.total_planned_distribution or "").strip()
    # "50 displaced families" -> "families"; used for "all 50 families received".
    unit_noun = (a.target_label or "beneficiaries").strip().split()[-1] or "beneficiaries"

    buf = io.BytesIO()

    styles = {
        "title": ParagraphStyle(
            "AgTitle", fontName="Helvetica-Bold", fontSize=16, leading=20,
            textColor=BRAND_BLUE, alignment=TA_CENTER, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "AgSubtitle", fontName="Helvetica-Bold", fontSize=12.5, leading=16,
            textColor=TEXT_DARK, alignment=TA_CENTER, spaceAfter=14,
        ),
        "field": ParagraphStyle(
            "AgField", fontName="Helvetica", fontSize=10.5, leading=15,
            textColor=TEXT_DARK, alignment=TA_LEFT,
        ),
        "heading": ParagraphStyle(
            "AgHeading", fontName="Helvetica-Bold", fontSize=11.5, leading=15,
            textColor=BRAND_BLUE, spaceBefore=13, spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "AgBody", fontName="Helvetica", fontSize=10, leading=14.5,
            textColor=TEXT_DARK, alignment=TA_JUSTIFY, spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "AgBullet", fontName="Helvetica", fontSize=10, leading=14,
            textColor=TEXT_DARK, alignment=TA_LEFT,
        ),
        "sigLabel": ParagraphStyle(
            "AgSigLabel", fontName="Helvetica-Bold", fontSize=10.5, leading=15,
            textColor=TEXT_DARK, spaceBefore=4, spaceAfter=6,
        ),
        "sigLine": ParagraphStyle(
            "AgSigLine", fontName="Helvetica", fontSize=10.5, leading=22,
            textColor=TEXT_DARK,
        ),
        "headerOrg": ParagraphStyle(
            "AgHeaderOrg", fontName="Helvetica-Bold", fontSize=10, leading=12,
            textColor=BRAND_BLUE, alignment=TA_LEFT,
        ),
        "headerSite": ParagraphStyle(
            "AgHeaderSite", fontName="Helvetica", fontSize=8.5, leading=11,
            textColor=TEXT_MUTED, alignment=TA_LEFT,
        ),
    }

    def _bullets(items):
        return ListFlowable(
            [ListItem(Paragraph(t, styles["bullet"]), leftIndent=14) for t in items],
            bulletType="bullet", bulletChar="•", bulletFontSize=8,
            leftIndent=16, spaceBefore=2, spaceAfter=6,
        )

    def _page_furniture(canvas, doc_):
        """Header and footer on every page, matching the example document."""
        canvas.saveState()

        # Header: logo left, organisation name + site beside it.
        y_top = LETTER[1] - 0.52 * inch
        text_x = 0.75 * inch
        if os.path.exists(LOGO_PATH):
            size = 0.42 * inch
            try:
                canvas.drawImage(
                    LOGO_PATH, 0.75 * inch, y_top - size + 0.1 * inch,
                    width=size, height=size, preserveAspectRatio=True, mask="auto",
                )
                text_x = 0.75 * inch + size + 0.1 * inch
            except Exception:
                # A corrupt or unreadable logo must never cost us the contract.
                text_x = 0.75 * inch
        canvas.setFont("Helvetica-Bold", 9.5)
        canvas.setFillColor(BRAND_BLUE)
        canvas.drawString(text_x, y_top, ORG_NAME)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(TEXT_MUTED)
        canvas.drawString(text_x, y_top - 11, ORG_WEBSITE)

        # Footer: rule, then the address line, then the page number.
        canvas.setStrokeColor(TEXT_MUTED)
        canvas.setLineWidth(0.5)
        canvas.line(0.75 * inch, 0.78 * inch, LETTER[0] - 0.75 * inch, 0.78 * inch)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(TEXT_MUTED)
        canvas.drawCentredString(LETTER[0] / 2.0, 0.62 * inch, ORG_ADDRESS_LINE)
        canvas.drawRightString(
            LETTER[0] - 0.75 * inch, 0.45 * inch, "Page %d" % doc_.page)
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        leftMargin=0.9 * inch, rightMargin=0.9 * inch,
        topMargin=1.05 * inch, bottomMargin=1.0 * inch,
        title="MyZakat Project #%s — Funding & Implementation Agreement" % a.proposal_id,
        author=ORG_NAME,
    )

    story = []

    # ── Title + header fields ─────────────────────────────────────────
    story.append(Paragraph("MyZakat Project #%s" % a.proposal_id, styles["title"]))
    story.append(Paragraph("Funding &amp; Implementation Agreement", styles["subtitle"]))

    def esc(value):
        return (str(value or "")
                .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

    rows = [
        ("Project", esc(a.project_title)),
        ("Location", esc(a.location)),
        ("Field Representative", esc(a.field_representative)),
        ("Approved Funding", esc(_money(a.approved_funding_usd))),
        ("Target", esc(target)),
    ]
    if per_beneficiary:
        rows.append(("Distribution per Beneficiary", esc(per_beneficiary)))
    if total_distribution:
        rows.append(("Total Planned Distribution", esc(total_distribution)))

    field_table = Table(
        [[Paragraph("<b>%s:</b>" % label, styles["field"]),
          Paragraph(value, styles["field"])] for label, value in rows],
        colWidths=[2.15 * inch, None], hAlign="LEFT",
    )
    field_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
    ]))
    story.append(field_table)
    story.append(Spacer(1, 10))

    # ── 1. Purpose ────────────────────────────────────────────────────
    story.append(Paragraph("1. Purpose", styles["heading"]))
    story.append(Paragraph(
        "%s (MyZakat) has approved funding for this humanitarian project to "
        "provide assistance to %s." % (ORG_NAME, esc(target)),
        styles["body"]))

    # ── 2. Use of Funds ───────────────────────────────────────────────
    story.append(Paragraph("2. Use of Funds", styles["heading"]))
    story.append(Paragraph(
        "The approved funds shall be used only for expenses directly related to "
        "this project, including:", styles["body"]))
    uses = []
    if (a.extra_fund_uses or "").strip():
        # One per line, so the reviewer types a list rather than a paragraph.
        uses = [esc(line.strip()) for line in a.extra_fund_uses.splitlines() if line.strip()]
    uses += [
        "Packaging materials",
        "Transportation and distribution",
        "Funds-transfer/local disbursement service fees",
        "Approved photography, video, and documentation expenses",
    ]
    story.append(_bullets(uses))
    story.append(Paragraph(
        "Funds shall not be used for unrelated personal or organizational expenses.",
        styles["body"]))
    story.append(Paragraph(
        "Any significant change to the project or use of funds should be "
        "communicated to and approved by MyZakat.", styles["body"]))

    # ── 3. Required Distribution ──────────────────────────────────────
    story.append(Paragraph("3. Required Distribution", styles["heading"]))
    story.append(Paragraph(
        "The project shall provide assistance to %s." % esc(target), styles["body"]))
    if per_beneficiary:
        story.append(Paragraph("Each beneficiary shall receive:", styles["body"]))
        story.append(Paragraph("<b>%s</b>" % esc(per_beneficiary), styles["body"]))
    if total_distribution:
        story.append(Paragraph("The planned total distribution is therefore:", styles["body"]))
        story.append(Paragraph("<b>%s</b>" % esc(total_distribution), styles["body"]))

    # ── 4. Beneficiary Selection ──────────────────────────────────────
    story.append(Paragraph("4. Beneficiary Selection", styles["heading"]))
    story.append(Paragraph(
        "Priority should be given to vulnerable and displaced %s based on "
        "genuine humanitarian need." % esc(unit_noun), styles["body"]))
    story.append(Paragraph(
        "A beneficiary record shall be maintained to confirm that all %d %s "
        "received their allocated share."
        % (int(a.target_count or 0), esc(unit_noun)), styles["body"]))
    story.append(Paragraph(
        "Personal beneficiary information shall be treated confidentially and "
        "shall not be publicly disclosed without appropriate permission.",
        styles["body"]))

    # ── 5. Financial Documentation ────────────────────────────────────
    story.append(Paragraph("5. Financial Documentation", styles["heading"]))
    story.append(Paragraph(
        "The Field Representative shall make reasonable efforts to obtain and "
        "retain:", styles["body"]))
    story.append(_bullets([
        "Purchase receipts or invoices",
        "Actual quantities purchased",
        "Actual prices paid",
        "Transportation expenses",
        "Transfer/disbursement fees",
        "Other approved project expenses",
    ]))
    story.append(Paragraph(
        "A final accounting of actual project expenditures shall be provided to "
        "MyZakat.", styles["body"]))

    # ── 6. Project Documentation ──────────────────────────────────────
    story.append(Paragraph("6. Project Documentation", styles["heading"]))
    story.append(Paragraph(
        "The implementation should be documented through photographs and video, "
        "including, where reasonably possible:", styles["body"]))
    story.append(_bullets([
        "Purchasing of project materials",
        "Weighing and packaging",
        "Preparation of the %d allocations" % int(a.target_count or 0),
        "Transportation",
        "Distribution to beneficiaries",
        "Overall completion of the project",
    ]))
    story.append(Paragraph(
        "Documentation must respect the privacy and dignity of beneficiaries.",
        styles["body"]))

    # ── 7. Final Report ───────────────────────────────────────────────
    story.append(Paragraph("7. Final Report", styles["heading"]))
    story.append(Paragraph(
        "After completion, the Field Representative shall provide MyZakat with a "
        "final project report containing:", styles["body"]))
    story.append(_bullets([
        "Number of %s served" % esc(unit_noun),
        "Quantities distributed",
        "Actual project expenditures",
        "Receipts/invoices or available supporting documentation",
        "Beneficiary distribution records",
        "Photographs and videos",
        "Explanation of any significant difference from the approved project "
        "plan or budget",
        "Amount of any unused funds",
    ]))
    story.append(Paragraph(
        "Unused project funds may not be redirected to another purpose without "
        "authorization from MyZakat.", styles["body"]))

    # ── 8. Acknowledgment ─────────────────────────────────────────────
    story.append(Paragraph("8. Acknowledgment", styles["heading"]))
    story.append(Paragraph(
        "By accepting the project funding, the Field Representative agrees to "
        "implement the project substantially according to the approved proposal "
        "and these requirements, and to provide reasonable financial and "
        "implementation documentation to MyZakat.", styles["body"]))

    # ── Signatures, on their own page ─────────────────────────────────
    # The example keeps these together on the final page; a page break is
    # simpler and more predictable than a KeepTogether that can still split.
    story.append(PageBreak())
    story.append(Paragraph("For %s (MyZakat)" % ORG_NAME, styles["sigLabel"]))
    story.append(Paragraph("Name: %s" % CHAIRPERSON_NAME, styles["sigLine"]))
    story.append(Paragraph("Title: %s" % CHAIRPERSON_TITLE, styles["sigLine"]))
    story.append(Paragraph("Signature: __________________________", styles["sigLine"]))
    story.append(Paragraph("Date: ______________________________", styles["sigLine"]))
    story.append(Spacer(1, 26))
    story.append(Paragraph("Field Representative", styles["sigLabel"]))
    story.append(Paragraph("Name: %s" % esc(a.field_representative), styles["sigLine"]))
    story.append(Paragraph("Signature: __________________________", styles["sigLine"]))
    story.append(Paragraph("Date: ______________________________", styles["sigLine"]))

    doc.build(story, onFirstPage=_page_furniture, onLaterPages=_page_furniture)
    return buf.getvalue()
