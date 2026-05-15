"""
PDF donation receipt generator for Zakat Distribution Foundation.

Layout matches the official ZDF receipt template:
  - Header: logo (left) + organization name (right) in bordered box
  - Tagline: www.myzakat.org + "Your Zakat, Their Lifeline."
  - OFFICIAL DONATION RECEIPT title
  - Receipt info table: Receipt #, Donation Date, Donor Name
  - Donation Summary table: Description / Amount
  - Tax-Exempt Statement + EIN
  - Signature: Naser Hdieb, Chairperson
"""
import os
from datetime import datetime
from io import BytesIO
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── Branding constants ────────────────────────────────────────────────
ORG_NAME = "Zakat Distribution Foundation"
ORG_WEBSITE = "www.myzakat.org"
ORG_TAGLINE = "Your Zakat, Their Lifeline."
ORG_EIN = "33-2494058"
CHAIRPERSON_NAME = "Naser Hdieb"
CHAIRPERSON_TITLE = "Chairperson"

BRAND_BLUE = colors.HexColor("#1e3a8a")
TEXT_DARK = colors.HexColor("#1f2937")
TEXT_MUTED = colors.HexColor("#6b7280")
BORDER_COLOR = colors.HexColor("#9ca3af")

LOGO_PATH = os.path.join(os.path.dirname(__file__), "logo.png")


# ── Receipt number generator ──────────────────────────────────────────
def generate_receipt_number(donation_id: Optional[int], donation_date: datetime) -> str:
    """Build a human-friendly receipt number: ZDF-YYYY-NNNN.

    Uses the donation row ID padded to 4 digits. If no ID is available
    yet (e.g. preview), falls back to a date+time-based code.
    """
    if donation_id is not None:
        return f"ZDF-{donation_date.year}-{donation_id:04d}"
    return f"ZDF-{donation_date.year}-{donation_date.strftime('%m%d%H%M')}"


# ── Internal: build the story (reusable for file + bytes variants) ────
def _build_receipt_story(
    donor_name: str,
    amount: float,
    donation_date: datetime,
    receipt_number: str,
) -> list:
    styles = getSampleStyleSheet()

    # Custom styles
    org_name_style = ParagraphStyle(
        "OrgName",
        parent=styles["Heading1"],
        fontSize=20,
        textColor=BRAND_BLUE,
        alignment=TA_CENTER,
        fontName="Helvetica-Bold",
        leading=24,
    )
    tagline_link_style = ParagraphStyle(
        "Tagline",
        parent=styles["BodyText"],
        fontSize=11,
        textColor=BRAND_BLUE,
        alignment=TA_CENTER,
        spaceAfter=2,
    )
    tagline_italic_style = ParagraphStyle(
        "TaglineItalic",
        parent=styles["BodyText"],
        fontSize=11,
        textColor=TEXT_DARK,
        alignment=TA_CENTER,
        fontName="Helvetica-Oblique",
    )
    receipt_title_style = ParagraphStyle(
        "ReceiptTitle",
        parent=styles["Heading2"],
        fontSize=13,
        textColor=TEXT_DARK,
        alignment=TA_CENTER,
        fontName="Helvetica-Bold",
        spaceAfter=12,
    )
    section_header_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading3"],
        fontSize=14,
        textColor=TEXT_DARK,
        fontName="Helvetica-Bold",
        spaceAfter=8,
        spaceBefore=10,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontSize=11,
        textColor=TEXT_DARK,
        leading=16,
        spaceAfter=10,
    )
    signature_style = ParagraphStyle(
        "Signature",
        parent=styles["BodyText"],
        fontSize=11,
        textColor=TEXT_DARK,
        leading=15,
    )

    story = []

    # ── Header box: logo + organization name ──
    if os.path.exists(LOGO_PATH):
        logo = Image(LOGO_PATH, width=1.1 * inch, height=1.1 * inch, kind="proportional")
    else:
        logo = Paragraph("<b>MyZakat</b>", org_name_style)

    org_para = Paragraph(ORG_NAME, org_name_style)
    header_data = [[logo, org_para]]
    header_table = Table(header_data, colWidths=[1.5 * inch, 5.5 * inch], rowHeights=[1.3 * inch])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("BOX", (0, 0), (-1, -1), 1, BORDER_COLOR),
        ("LINEAFTER", (0, 0), (0, 0), 1, BORDER_COLOR),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.25 * inch))

    # ── Tagline ──
    story.append(Paragraph(ORG_WEBSITE, tagline_link_style))
    story.append(Paragraph(ORG_TAGLINE, tagline_italic_style))
    story.append(Spacer(1, 0.2 * inch))

    # ── OFFICIAL DONATION RECEIPT title ──
    story.append(Paragraph("OFFICIAL DONATION RECEIPT", receipt_title_style))

    # ── Receipt info table ──
    info_data = [
        ["Receipt #:", receipt_number],
        ["Donation Date:", donation_date.strftime("%B %d, %Y")],
        ["Donor Name:", donor_name],
    ]
    info_table = Table(info_data, colWidths=[2.0 * inch, 5.0 * inch])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("TEXTCOLOR", (0, 0), (-1, -1), TEXT_DARK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.25 * inch))

    # ── Donation Summary ──
    story.append(Paragraph("Donation Summary", section_header_style))
    summary_data = [
        ["Description", "Amount"],
        ["Charitable Donation", f"${amount:,.2f}"],
        ["Total Donation", f"${amount:,.2f}"],
    ]
    summary_table = Table(summary_data, colWidths=[4.5 * inch, 2.5 * inch])
    summary_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 11),
        ("TEXTCOLOR", (0, 0), (-1, -1), TEXT_DARK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.25 * inch))

    # ── Tax-Exempt Statement ──
    story.append(Paragraph("<b>Tax-Exempt Statement</b>", section_header_style))
    story.append(Paragraph(
        f"{ORG_NAME} is a registered 501(c)(3) nonprofit organization "
        f"recognized by the Internal Revenue Service.",
        body_style,
    ))
    story.append(Paragraph(f"<b>EIN:</b> {ORG_EIN}", body_style))
    story.append(Paragraph(
        "No goods or services were provided in exchange for this contribution.",
        body_style,
    ))
    story.append(Paragraph(
        "Please retain this receipt for your tax records.",
        body_style,
    ))
    story.append(Spacer(1, 0.3 * inch))

    # ── Signature ──
    story.append(Paragraph("<b>With appreciation,</b>", signature_style))
    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph(CHAIRPERSON_NAME, signature_style))
    story.append(Paragraph(CHAIRPERSON_TITLE, signature_style))
    story.append(Paragraph(ORG_NAME, signature_style))

    return story


# ── Public API: file-based ────────────────────────────────────────────
def generate_donation_certificate(
    donor_name: str,
    amount: float,
    donation_date: datetime,
    output_path: str,
    donation_id: Optional[int] = None,
    receipt_number: Optional[str] = None,
) -> str:
    """Generate a donation receipt PDF and save it to ``output_path``."""
    receipt_number = receipt_number or generate_receipt_number(donation_id, donation_date)
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
    )
    story = _build_receipt_story(donor_name, amount, donation_date, receipt_number)
    doc.build(story)
    return output_path


# ── Public API: bytes-based (used by webhook email flow) ──────────────
def generate_donation_certificate_to_bytes(
    donor_name: str,
    amount: float,
    donation_date: datetime,
    donation_id: Optional[int] = None,
    receipt_number: Optional[str] = None,
) -> bytes:
    """Generate a donation receipt PDF in memory and return its bytes."""
    receipt_number = receipt_number or generate_receipt_number(donation_id, donation_date)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
    )
    story = _build_receipt_story(donor_name, amount, donation_date, receipt_number)
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
