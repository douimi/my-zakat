from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import datetime
import os
from typing import Optional
from io import BytesIO

def generate_donation_certificate(
    donor_name: str,
    amount: float,
    donation_date: datetime,
    output_path: str
) -> str:
    """
    Generate a PDF certificate for a donation
    
    Args:
        donor_name: Name of the donor
        amount: Donation amount
        donation_date: Date of donation
        output_path: Full path where PDF should be saved
        
    Returns:
        Path to the generated PDF file
    """
    # Create the PDF document
    doc = SimpleDocTemplate(output_path, pagesize=letter)
    story = []
    
    # Get styles
    styles = getSampleStyleSheet()
    
    # Create custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=28,
        textColor=colors.HexColor('#2563eb'),
        spaceAfter=30,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=20,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=20,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['BodyText'],
        fontSize=14,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=15,
        alignment=TA_CENTER,
        leading=20
    )
    
    signature_style = ParagraphStyle(
        'Signature',
        parent=styles['BodyText'],
        fontSize=12,
        textColor=colors.HexColor('#4b5563'),
        spaceAfter=10,
        alignment=TA_LEFT,
        leading=16
    )
    
    # Title
    title = Paragraph("Certificate of Donation", title_style)
    story.append(title)
    story.append(Spacer(1, 0.5 * inch))
    
    # Certificate text
    cert_text = Paragraph(
        "This is to certify that",
        body_style
    )
    story.append(cert_text)
    story.append(Spacer(1, 0.2 * inch))
    
    # Donor name (highlighted)
    donor_paragraph = Paragraph(
        f"<b>{donor_name}</b>",
        ParagraphStyle(
            'DonorName',
            parent=body_style,
            fontSize=18,
            textColor=colors.HexColor('#2563eb'),
            fontName='Helvetica-Bold'
        )
    )
    story.append(donor_paragraph)
    story.append(Spacer(1, 0.2 * inch))
    
    # Donation amount
    amount_text = Paragraph(
        f"has generously donated the amount of",
        body_style
    )
    story.append(amount_text)
    story.append(Spacer(1, 0.2 * inch))
    
    amount_paragraph = Paragraph(
        f"<b>${amount:,.2f}</b>",
        ParagraphStyle(
            'Amount',
            parent=body_style,
            fontSize=22,
            textColor=colors.HexColor('#2563eb'),
            fontName='Helvetica-Bold'
        )
    )
    story.append(amount_paragraph)
    story.append(Spacer(1, 0.2 * inch))
    
    # Purpose text
    purpose_text = Paragraph(
        "to support the charitable activities and initiatives of My Zakat.",
        body_style
    )
    story.append(purpose_text)
    story.append(Spacer(1, 0.4 * inch))
    
    # Date
    date_text = Paragraph(
        f"Date: {donation_date.strftime('%B %d, %Y')}",
        body_style
    )
    story.append(date_text)
    story.append(Spacer(1, 0.6 * inch))
    
    # Signature section
    signature_data = [
        ['', ''],
        ['', ''],
        ['_________________________', '_________________________'],
        ['My Zakat Organization', 'Date']
    ]
    
    signature_table = Table(signature_data, colWidths=[3.5 * inch, 3.5 * inch])
    signature_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 2), (-1, 2), 'Helvetica'),
        ('FONTSIZE', (0, 2), (-1, 2), 10),
        ('FONTNAME', (0, 3), (-1, 3), 'Helvetica'),
        ('FONTSIZE', (0, 3), (-1, 3), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(signature_table)
    story.append(Spacer(1, 0.3 * inch))
    
    # Footer note
    footer_text = Paragraph(
        "<i>This certificate is issued in recognition of your generous contribution. "
        "Your support helps us make a positive impact in our community.</i>",
        ParagraphStyle(
            'Footer',
            parent=body_style,
            fontSize=11,
            textColor=colors.HexColor('#6b7280'),
            spaceBefore=20
        )
    )
    story.append(footer_text)
    
    # Build PDF
    doc.build(story)
    
    return output_path


def generate_donation_certificate_to_bytes(
    donor_name: str,
    amount: float,
    donation_date: datetime
) -> bytes:
    """
    Generate a PDF certificate for a donation and return as bytes (no file storage)
    
    Args:
        donor_name: Name of the donor
        amount: Donation amount
        donation_date: Date of donation
        
    Returns:
        PDF content as bytes
    """
    # Create PDF in memory
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    story = []
    
    # Get styles
    styles = getSampleStyleSheet()
    
    # Create custom styles (same as file-based version)
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=28,
        textColor=colors.HexColor('#2563eb'),
        spaceAfter=30,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=20,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=20,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['BodyText'],
        fontSize=14,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=15,
        alignment=TA_CENTER,
        leading=20
    )
    
    signature_style = ParagraphStyle(
        'Signature',
        parent=styles['BodyText'],
        fontSize=12,
        textColor=colors.HexColor('#4b5563'),
        spaceAfter=10,
        alignment=TA_LEFT,
        leading=16
    )
    
    # Title
    title = Paragraph("Certificate of Donation", title_style)
    story.append(title)
    story.append(Spacer(1, 0.5 * inch))
    
    # Certificate text
    cert_text = Paragraph(
        "This is to certify that",
        body_style
    )
    story.append(cert_text)
    story.append(Spacer(1, 0.2 * inch))
    
    # Donor name (highlighted)
    donor_paragraph = Paragraph(
        f"<b>{donor_name}</b>",
        ParagraphStyle(
            'DonorName',
            parent=body_style,
            fontSize=18,
            textColor=colors.HexColor('#2563eb'),
            fontName='Helvetica-Bold'
        )
    )
    story.append(donor_paragraph)
    story.append(Spacer(1, 0.2 * inch))
    
    # Donation amount
    amount_text = Paragraph(
        f"has generously donated the amount of",
        body_style
    )
    story.append(amount_text)
    story.append(Spacer(1, 0.2 * inch))
    
    amount_paragraph = Paragraph(
        f"<b>${amount:,.2f}</b>",
        ParagraphStyle(
            'Amount',
            parent=body_style,
            fontSize=22,
            textColor=colors.HexColor('#2563eb'),
            fontName='Helvetica-Bold'
        )
    )
    story.append(amount_paragraph)
    story.append(Spacer(1, 0.2 * inch))
    
    # Purpose text
    purpose_text = Paragraph(
        "to support the charitable activities and initiatives of My Zakat.",
        body_style
    )
    story.append(purpose_text)
    story.append(Spacer(1, 0.4 * inch))
    
    # Date
    date_text = Paragraph(
        f"Date: {donation_date.strftime('%B %d, %Y')}",
        body_style
    )
    story.append(date_text)
    story.append(Spacer(1, 0.6 * inch))
    
    # Signature section
    signature_data = [
        ['', ''],
        ['', ''],
        ['_________________________', '_________________________'],
        ['My Zakat Organization', 'Date']
    ]
    
    signature_table = Table(signature_data, colWidths=[3.5 * inch, 3.5 * inch])
    signature_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 2), (-1, 2), 'Helvetica'),
        ('FONTSIZE', (0, 2), (-1, 2), 10),
        ('FONTNAME', (0, 3), (-1, 3), 'Helvetica'),
        ('FONTSIZE', (0, 3), (-1, 3), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(signature_table)
    story.append(Spacer(1, 0.3 * inch))
    
    # Footer note
    footer_text = Paragraph(
        "<i>This certificate is issued in recognition of your generous contribution. "
        "Your support helps us make a positive impact in our community.</i>",
        ParagraphStyle(
            'Footer',
            parent=body_style,
            fontSize=11,
            textColor=colors.HexColor('#6b7280'),
            spaceBefore=20
        )
    )
    story.append(footer_text)
    
    # Build PDF
    doc.build(story)
    
    # Get PDF bytes
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes

