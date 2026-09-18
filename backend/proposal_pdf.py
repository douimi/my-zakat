"""Render a project proposal as a formal funding-request PDF.

Pure rendering: no HTTP, no ORM queries, no database session. The single
argument is duck-typed — anything exposing the proposal content attributes plus
`id`, `status` and `submitted_at` renders. That is what lets the router pass a
ProposalVersion (with the dossier's id and status attached) without this module
knowing about versioning at all.

Layout mirrors a formal letter of request:
  • Page 1 — cover letter (bold labeled header, justified body, signature block).
  • Following pages — the four review-packet sections with underlined headings
    and bold question labels.
"""
from __future__ import annotations

import io
from typing import Any


def safe_slug(text: str) -> str:
    import re
    return re.sub(r"[^a-zA-Z0-9]+", "-", text or "proposal").strip("-").lower()[:40] or "proposal"


def render_proposal_pdf(p: Any) -> bytes:
    """Render the proposal as a polished funding-request document.

    `p` is deliberately untyped: this module must not import the ORM models it
    would otherwise name, and the object it receives changes by caller — a
    dossier today, a version with the dossier's id and status attached once the
    router serves the version chain. Any object exposing the content attributes
    plus `id`, `status` and `submitted_at` renders.

    Layout mirrors a formal letter of request:
      • Page 1 — cover letter (bold labeled header, justified body,
        signature block).
      • Following pages — the four review-packet sections with clear
        underlined headings and bold question labels.
    """
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        HRFlowable, ListFlowable, ListItem, PageBreak, Paragraph,
        SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    buf = io.BytesIO()

    # Slightly larger margins + running footer with page number make the
    # document feel like a real word-processed letter.
    def _footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#9ca3af"))
        canvas.drawRightString(
            LETTER[0] - 0.75 * inch, 0.5 * inch,
            f"Page {doc_.page}",
        )
        canvas.drawString(
            0.75 * inch, 0.5 * inch,
            f"Ref #{p.id} · myzakat.org",
        )
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        leftMargin=1.0 * inch, rightMargin=1.0 * inch,
        topMargin=0.9 * inch, bottomMargin=0.9 * inch,
        title=f"Project Proposal — {p.project_name}",
        author=p.full_name,
    )

    styles = getSampleStyleSheet()

    # ── Type scale ────────────────────────────────────────────────────
    title_style = ParagraphStyle(
        "Title", parent=styles["Heading1"],
        fontName="Helvetica-Bold", fontSize=18, leading=22,
        textColor=colors.HexColor("#111827"),
        spaceAfter=14, spaceBefore=0, alignment=TA_LEFT,
    )
    section_h = ParagraphStyle(
        "SectionH", parent=styles["Heading1"],
        fontName="Helvetica-Bold", fontSize=14, leading=18,
        textColor=colors.HexColor("#111827"),
        spaceAfter=4, spaceBefore=18, alignment=TA_LEFT,
    )
    sub_h = ParagraphStyle(
        "SubH", parent=styles["Heading2"],
        fontName="Helvetica-Bold", fontSize=11, leading=14,
        textColor=colors.HexColor("#1f2937"),
        spaceAfter=4, spaceBefore=12,
    )
    body = ParagraphStyle(
        "Body", parent=styles["BodyText"],
        fontName="Helvetica", fontSize=11, leading=16,
        alignment=TA_JUSTIFY, spaceAfter=10,
        textColor=colors.HexColor("#1f2937"),
    )
    body_left = ParagraphStyle("BodyLeft", parent=body, alignment=TA_LEFT)
    label_line = ParagraphStyle(
        "LabelLine", parent=body_left,
        spaceAfter=4, leading=15,
    )
    meta = ParagraphStyle(
        "Meta", parent=body_left,
        textColor=colors.HexColor("#6b7280"), fontSize=9, leading=12,
        spaceAfter=0,
    )

    def esc(text: str) -> str:
        return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def para(text: str, style=body):
        safe = esc(text).replace("\n", "<br/>")
        return Paragraph(safe, style)

    def rule():
        return HRFlowable(
            width="100%", thickness=0.7,
            color=colors.HexColor("#111827"),
            spaceBefore=0, spaceAfter=10,
        )

    def bullet_list(text: str):
        lines = [ln.strip().lstrip("-•*").strip() for ln in (text or "").split("\n") if ln.strip()]
        if len(lines) <= 1:
            return para(text)
        return ListFlowable(
            [ListItem(para(ln, style=body_left), leftIndent=10, spaceAfter=4) for ln in lines],
            bulletType="bullet", start="•", leftIndent=18, bulletFontSize=10,
        )

    def kv_table(rows):
        data = [[Paragraph(f"<b>{esc(k)}</b>", label_line), para(v or "—", style=body_left)] for k, v in rows]
        t = Table(data, colWidths=[2.0 * inch, 4.0 * inch])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#e5e7eb")),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        return t

    # ── Compose the cover letter (page 1) ────────────────────────────
    story = []
    story.append(Paragraph("TO: ZAKAT DISTRIBUTION FOUNDATION", title_style))

    story.append(Paragraph(
        f"<b>Subject:</b> Request for Funding Support for {esc(p.project_name)} "
        f"&mdash; ${p.total_amount_usd:,.0f} USD",
        label_line,
    ))
    story.append(Paragraph(
        f"<b>Date:</b> {p.submitted_at.strftime('%B %d, %Y')}",
        label_line,
    ))
    story.append(Spacer(1, 14))

    story.append(para("Dear Sir/Madam,", style=body_left))

    # Opening paragraph — introduce the request in the letter voice.
    story.append(para(
        f"I hope this message finds you well. I am writing to request your kind support and "
        f"funding for a humanitarian initiative titled &ldquo;{esc(p.project_name)}.&rdquo; "
        f"{esc(p.project_description)}"
    ))

    # Problem paragraph.
    story.append(para(p.problem_solved))

    # Beneficiaries + budget paragraph.
    story.append(para(
        f"This project seeks to serve {esc(p.target_beneficiaries)}. "
        f"The total required budget for the project is ${p.total_amount_usd:,.2f} USD, which "
        f"will cover the purchase, transportation, packaging, and distribution to the targeted "
        f"beneficiaries. The implementation will be carried out in coordination with local "
        f"community committees to ensure efficient, transparent, and equitable distribution to "
        f"those most in need."
    ))

    # Impact paragraph.
    story.append(para(
        f"{esc(p.expected_impact)} {esc(p.community_impact)}"
    ))

    # Closing.
    story.append(para(
        "We deeply appreciate your consideration of this request and your continued commitment "
        "to humanitarian work. May your generous support bring relief and hope to those most in "
        "need."
    ))

    story.append(Spacer(1, 18))
    story.append(para("Sincerely,", style=body_left))
    story.append(Spacer(1, 22))
    story.append(Paragraph(f"<b>{esc(p.full_name)}</b>", label_line))
    story.append(Paragraph(esc(p.place_of_residence), label_line))
    story.append(Paragraph(f"Mobile: {esc(p.mobile_number)}", label_line))
    story.append(Paragraph(f"Email: {esc(p.email)}", label_line))

    story.append(PageBreak())

    # ── Review packet (page 2+) ──────────────────────────────────────
    story.append(Paragraph("Project Proposal — Full Details", title_style))
    story.append(para(
        f"The pages that follow contain the full project proposal for "
        f"&ldquo;<b>{esc(p.project_name)}</b>&rdquo; as submitted through the online proposal "
        f"form, structured to mirror the four sections of the funding request template.",
        style=body,
    ))

    # ── Section 1 ────────────────────────────────────────────────────
    story.append(Paragraph("Section 1 &mdash; Personal Information", section_h))
    story.append(rule())
    story.append(kv_table([
        ("Full Name",           p.full_name),
        ("National ID Number",  p.national_id),
        ("Date of Birth",       str(p.date_of_birth_year)),
        ("Place of Residence",  p.place_of_residence),
        ("Mobile Number",       p.mobile_number),
        ("Email",               p.email),
        ("Educational Level",   p.educational_level),
    ]))

    # ── Section 2 ────────────────────────────────────────────────────
    story.append(Paragraph("Section 2 &mdash; Project Information", section_h))
    story.append(rule())
    story.append(Paragraph("Project Name", sub_h));                                         story.append(para(p.project_name))
    story.append(Paragraph("Project Idea Description", sub_h));                             story.append(para(p.project_description))
    story.append(Paragraph("What problem does the project solve?", sub_h));                 story.append(para(p.problem_solved))
    story.append(Paragraph("Target Beneficiaries", sub_h));                                 story.append(para(p.target_beneficiaries))
    story.append(Paragraph("How will the project serve the community?", sub_h));            story.append(para(p.community_impact))
    story.append(Paragraph("Expected Economic or Social Impact", sub_h));                   story.append(para(p.expected_impact))

    # ── Section 3 ────────────────────────────────────────────────────
    story.append(Paragraph("Section 3 &mdash; Project Plan", section_h))
    story.append(rule())
    story.append(Paragraph("Steps for implementing the project", sub_h))
    story.append(bullet_list(p.implementation_steps))
    story.append(Paragraph("Where will the project be implemented?", sub_h));               story.append(para(p.implementation_location))
    story.append(Paragraph("Required materials or equipment", sub_h))
    story.append(bullet_list(p.required_materials))
    story.append(Paragraph("Expected duration to start implementation", sub_h));            story.append(para(p.expected_duration))
    story.append(Paragraph("How will the project continue after funding?", sub_h));         story.append(para(p.continuity_plan))
    story.append(Paragraph("Why is it feasible under current conditions?", sub_h));         story.append(para(p.feasibility))
    story.append(Paragraph("Expected challenges and how to address them", sub_h))
    story.append(bullet_list(p.expected_challenges))

    # ── Section 4 ────────────────────────────────────────────────────
    story.append(Paragraph("Section 4 &mdash; Required Budget", section_h))
    story.append(rule())

    subtotal = float(p.number_of_beneficiaries) * float(p.cost_per_unit_usd)
    extra = float(p.additional_expenses_usd or 0)

    budget_rows = [
        [Paragraph("<b>Item</b>", label_line),
         Paragraph("<b>Quantity</b>", label_line),
         Paragraph("<b>Unit cost</b>", label_line),
         Paragraph("<b>Amount</b>", label_line)],
        [para(f"{esc(p.unit_type).title()}s served", style=body_left),
         para(f"{p.number_of_beneficiaries:,}", style=body_left),
         para(f"${p.cost_per_unit_usd:,.2f}", style=body_left),
         para(f"${subtotal:,.2f}", style=body_left)],
    ]
    if extra > 0:
        budget_rows.append([
            para(esc(p.additional_expenses_description) or "Additional expenses", style=body_left),
            para("—", style=body_left),
            para("—", style=body_left),
            para(f"${extra:,.2f}", style=body_left),
        ])
    budget_rows.append([
        Paragraph("<b>Total</b>", label_line),
        para("", style=body_left),
        para("", style=body_left),
        Paragraph(f"<b>${p.total_amount_usd:,.2f} USD</b>", label_line),
    ])

    budget_table = Table(budget_rows, colWidths=[2.6 * inch, 1.0 * inch, 1.2 * inch, 1.2 * inch])
    budget_table.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND",   (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
        ("LINEBELOW",    (0, 0), (-1, 0), 0.6, colors.HexColor("#111827")),
        ("LINEBELOW",    (0, 1), (-1, -2), 0.3, colors.HexColor("#e5e7eb")),
        ("LINEABOVE",    (0, -1), (-1, -1), 0.6, colors.HexColor("#111827")),
        ("TOPPADDING",   (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(budget_table)

    # ── Footer note ──────────────────────────────────────────────────
    story.append(Spacer(1, 24))
    story.append(HRFlowable(width="100%", thickness=0.3, color=colors.HexColor("#e5e7eb"),
                            spaceBefore=0, spaceAfter=6))
    story.append(Paragraph(
        f"Submitted via myzakat.org on {p.submitted_at.strftime('%B %d, %Y at %H:%M UTC')} "
        f"&nbsp;·&nbsp; reference #{p.id} &nbsp;·&nbsp; status: {p.status.replace('_', ' ')}",
        meta,
    ))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()
