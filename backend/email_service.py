import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from email.utils import formataddr, formatdate, make_msgid
from email.header import Header
import os
from dotenv import load_dotenv
from logging_config import get_logger
from datetime import datetime

load_dotenv()

logger = get_logger(__name__)

# SMTP Configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "netsol-smtp-oxcs.hostingplatform.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "info@myzakat.org")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "emailPassWord123@")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "My Zakat")


def send_verification_email(email: str, name: str, verification_token: str) -> bool:
    """
    Send email verification link to user with best practices for deliverability
    
    Args:
        email: User's email address
        name: User's name
        verification_token: Unique verification token
        
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Create verification link
        verification_link = f"{FRONTEND_URL}/verify-email?token={verification_token}"
        
        # Create email message with proper headers
        msg = MIMEMultipart("alternative")
        
        # Essential headers for deliverability
        msg["Subject"] = Header("Verify Your Email Address - My Zakat", "utf-8")
        msg["From"] = formataddr((EMAIL_FROM_NAME, SMTP_USERNAME))
        msg["To"] = email
        msg["Reply-To"] = SMTP_USERNAME
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain="myzakat.org")
        msg["MIME-Version"] = "1.0"
        
        # Add List-Unsubscribe header (helps with deliverability)
        msg["List-Unsubscribe"] = f"<mailto:{SMTP_USERNAME}?subject=Unsubscribe>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        
        # X-Headers for better deliverability
        msg["X-Mailer"] = "My Zakat Platform"
        msg["X-Priority"] = "1"  # High priority for transactional emails
        msg["X-MSMail-Priority"] = "High"
        
        # Create HTML email body with better structure
        html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email Address</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 20px 0; text-align: center;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #2563eb; color: #ffffff; padding: 30px 20px; text-align: center;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">My Zakat</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="color: #2563eb; margin-top: 0; font-size: 20px;">Email Verification Required</h2>
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0;">Hello {name or 'there'},</p>
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0;">Thank you for registering with My Zakat. Please verify your email address by clicking the button below:</p>
                            
                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 30px 0;">
                                <tr>
                                    <td style="text-align: center;">
                                        <a href="{verification_link}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px;">Verify Email Address</a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0;">Or copy and paste this link into your browser:</p>
                            <p style="color: #2563eb; font-size: 14px; word-break: break-all; margin: 10px 0; padding: 10px; background-color: #f9fafb; border-radius: 4px;">{verification_link}</p>
                            
                            <p style="color: #666666; font-size: 12px; line-height: 1.6; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5;">If you did not create an account with My Zakat, please ignore this email. This verification link will expire in 7 days.</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e5e5;">
                            <p style="color: #999999; font-size: 12px; margin: 0;">© {datetime.now().year} My Zakat. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""
        
        # Create plain text version (important for deliverability)
        text_body = f"""My Zakat - Email Verification Required

Hello {name or 'there'},

Thank you for registering with My Zakat. Please verify your email address by visiting the following link:

{verification_link}

This verification link will expire in 7 days.

If you did not create an account with My Zakat, please ignore this email.

---
© {datetime.now().year} My Zakat. All rights reserved."""
        
        # Attach both versions (plain text first, then HTML)
        part1 = MIMEText(text_body, "plain", "utf-8")
        part2 = MIMEText(html_body, "html", "utf-8")
        
        msg.attach(part1)
        msg.attach(part2)
        
        # Send email with proper error handling
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=30) as server:
            server.set_debuglevel(0)  # Set to 1 for debugging
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg, from_addr=SMTP_USERNAME, to_addrs=[email])
        
        logger.info("Verification email sent successfully to %s", email)
        return True
        
    except smtplib.SMTPException as e:
        logger.error("SMTP error sending verification email to %s: %s", email, str(e))
        return False
    except Exception as e:
        logger.error("Failed to send verification email to %s: %s", email, str(e))
        return False


def send_donation_certificate_email(email: str, name: str, amount: float, pdf_path: str) -> bool:
    """
    Send donation certificate PDF via email
    
    Args:
        email: Donor's email address
        name: Donor's name
        amount: Donation amount
        pdf_path: Path to the PDF certificate file
        
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Create email message
        msg = MIMEMultipart()
        
        # Essential headers for deliverability
        msg["Subject"] = Header("Thank You for Your Donation - Certificate of Donation", "utf-8")
        msg["From"] = formataddr((EMAIL_FROM_NAME, SMTP_USERNAME))
        msg["To"] = email
        msg["Reply-To"] = SMTP_USERNAME
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain="myzakat.org")
        msg["MIME-Version"] = "1.0"
        
        # Add List-Unsubscribe header
        msg["List-Unsubscribe"] = f"<mailto:{SMTP_USERNAME}?subject=Unsubscribe>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        
        # X-Headers
        msg["X-Mailer"] = "My Zakat Platform"
        msg["X-Priority"] = "1"
        msg["X-MSMail-Priority"] = "High"
        
        # Create HTML email body
        html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thank You for Your Donation</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 20px 0; text-align: center;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #2563eb; color: #ffffff; padding: 30px 20px; text-align: center;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">My Zakat</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="color: #2563eb; margin-top: 0; font-size: 20px;">Thank You for Your Generous Donation</h2>
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0;">Hello {name or 'there'},</p>
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0;">We are deeply grateful for your generous donation of <strong>${amount:,.2f}</strong>. Your contribution makes a meaningful difference in our community.</p>
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0;">Please find attached your Certificate of Donation as a token of our appreciation.</p>
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0;">You can also download your certificate anytime from your user dashboard.</p>
                            <p style="color: #666666; font-size: 14px; line-height: 1.6; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5;">May your generosity be rewarded abundantly.</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e5e5;">
                            <p style="color: #999999; font-size: 12px; margin: 0;">© {datetime.now().year} My Zakat. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""
        
        # Create plain text version
        text_body = f"""My Zakat - Thank You for Your Donation

Hello {name or 'there'},

We are deeply grateful for your generous donation of ${amount:,.2f}. Your contribution makes a meaningful difference in our community.

Please find attached your Certificate of Donation as a token of our appreciation.

You can also download your certificate anytime from your user dashboard.

May your generosity be rewarded abundantly.

---
© {datetime.now().year} My Zakat. All rights reserved."""
        
        # Attach text versions
        part1 = MIMEText(text_body, "plain", "utf-8")
        part2 = MIMEText(html_body, "html", "utf-8")
        msg.attach(part1)
        msg.attach(part2)
        
        # Attach PDF certificate
        if os.path.exists(pdf_path):
            with open(pdf_path, "rb") as pdf_file:
                pdf_attachment = MIMEBase("application", "pdf")
                pdf_attachment.set_payload(pdf_file.read())
                encoders.encode_base64(pdf_attachment)
                pdf_attachment.add_header(
                    "Content-Disposition",
                    f'attachment; filename="donation_certificate_{name.replace(" ", "_")}_{datetime.now().strftime("%Y%m%d")}.pdf"'
                )
                msg.attach(pdf_attachment)
        
        # Send email
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=30) as server:
            server.set_debuglevel(0)
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg, from_addr=SMTP_USERNAME, to_addrs=[email])
        
        logger.info("Donation certificate email sent successfully to %s", email)
        return True
        
    except smtplib.SMTPException as e:
        logger.error("SMTP error sending donation certificate email to %s: %s", email, str(e))
        return False
    except Exception as e:
        logger.error("Failed to send donation certificate email to %s: %s", email, str(e))
        return False


def send_contact_reply_email(recipient_email: str, recipient_name: str, original_message: str, reply_message: str) -> bool:
    """
    Send reply email to contact form submission
    
    Args:
        recipient_email: Contact's email address
        recipient_name: Contact's name
        original_message: Original message from contact
        reply_message: Admin's reply message
        
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Create email message with proper headers
        msg = MIMEMultipart("alternative")
        
        # Essential headers for deliverability
        msg["Subject"] = Header("Re: Your Contact Form Submission - My Zakat", "utf-8")
        msg["From"] = formataddr((EMAIL_FROM_NAME, SMTP_USERNAME))
        msg["To"] = recipient_email
        msg["Reply-To"] = SMTP_USERNAME
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain="myzakat.org")
        msg["MIME-Version"] = "1.0"
        
        # Add List-Unsubscribe header
        msg["List-Unsubscribe"] = f"<mailto:{SMTP_USERNAME}?subject=Unsubscribe>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        
        # X-Headers
        msg["X-Mailer"] = "My Zakat Platform"
        msg["X-Priority"] = "1"
        msg["X-MSMail-Priority"] = "High"
        
        # Create HTML email body
        html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Re: Your Contact Form Submission</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 20px 0; text-align: center;">
                <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #2563eb; color: #ffffff; padding: 30px 20px; text-align: center;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">My Zakat</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="color: #2563eb; margin-top: 0; font-size: 20px;">Thank You for Contacting Us</h2>
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0;">Hello {recipient_name or 'there'},</p>
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0;">Thank you for reaching out to us. We have received your message and are responding below:</p>
                            
                            <!-- Original Message -->
                            <div style="background-color: #f9fafb; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; border-radius: 4px;">
                                <p style="color: #666666; font-size: 12px; margin: 0 0 10px 0; font-weight: bold; text-transform: uppercase;">Your Original Message:</p>
                                <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">{original_message}</p>
                            </div>
                            
                            <!-- Reply Message -->
                            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
                                <p style="color: #1e40af; font-size: 12px; margin: 0 0 10px 0; font-weight: bold; text-transform: uppercase;">Our Response:</p>
                                <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">{reply_message}</p>
                            </div>
                            
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin-top: 30px;">If you have any further questions or concerns, please don't hesitate to contact us again.</p>
                            <p style="color: #666666; font-size: 14px; line-height: 1.6; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e5e5;">Best regards,<br>The My Zakat Team</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e5e5;">
                            <p style="color: #999999; font-size: 12px; margin: 0;">© {datetime.now().year} My Zakat. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""
        
        # Create plain text version
        text_body = f"""My Zakat - Re: Your Contact Form Submission

Hello {recipient_name or 'there'},

Thank you for reaching out to us. We have received your message and are responding below:

Your Original Message:
{original_message}

Our Response:
{reply_message}

If you have any further questions or concerns, please don't hesitate to contact us again.

Best regards,
The My Zakat Team

---
© {datetime.now().year} My Zakat. All rights reserved."""
        
        # Attach both versions
        part1 = MIMEText(text_body, "plain", "utf-8")
        part2 = MIMEText(html_body, "html", "utf-8")
        
        msg.attach(part1)
        msg.attach(part2)
        
        # Send email
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=30) as server:
            server.set_debuglevel(0)
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg, from_addr=SMTP_USERNAME, to_addrs=[recipient_email])
        
        logger.info("Contact reply email sent successfully to %s", recipient_email)
        return True
        
    except smtplib.SMTPException as e:
        logger.error("SMTP error sending contact reply email to %s: %s", recipient_email, str(e))
        return False
    except Exception as e:
        logger.error("Failed to send contact reply email to %s: %s", recipient_email, str(e))
        return False


# Where to send admin notifications (defaults to the SMTP sender = info@myzakat.org)
ADMIN_NOTIFICATION_EMAIL = os.getenv("ADMIN_NOTIFICATION_EMAIL", SMTP_USERNAME)


def _send_simple_email(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Send a simple multipart email. Returns True on success."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = Header(subject, "utf-8")
        msg["From"] = formataddr((EMAIL_FROM_NAME, SMTP_USERNAME))
        msg["To"] = to_email
        msg["Reply-To"] = SMTP_USERNAME
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain="myzakat.org")

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg, from_addr=SMTP_USERNAME, to_addrs=[to_email])

        logger.info("Email sent successfully to %s — %s", to_email, subject)
        return True
    except Exception as e:
        logger.error("Failed to send email to %s (%s): %s", to_email, subject, e)
        return False


def send_contact_admin_notification(submitter_name: str, submitter_email: str, message: str) -> bool:
    """Notify admin that a new contact form was submitted."""
    subject = f"New Contact Form Submission from {submitter_name}"
    text_body = (
        f"A new contact form has been submitted on MyZakat.\n\n"
        f"From: {submitter_name} <{submitter_email}>\n"
        f"Submitted: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n\n"
        f"Message:\n{message}\n\n"
        f"View it in the admin panel: {FRONTEND_URL}/admin/contacts\n"
    )
    html_body = f"""<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
<table style="max-width: 600px; margin: auto; background: white; border-radius: 8px; overflow: hidden;">
  <tr><td style="background: #2563eb; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">New Contact Form Submission</h1>
  </td></tr>
  <tr><td style="padding: 30px;">
    <p><strong>From:</strong> {submitter_name} &lt;<a href="mailto:{submitter_email}">{submitter_email}</a>&gt;</p>
    <p><strong>Submitted:</strong> {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <p><strong>Message:</strong></p>
    <div style="background: #f9fafb; padding: 15px; border-left: 4px solid #2563eb; border-radius: 4px; white-space: pre-wrap;">{message}</div>
    <p style="margin-top: 30px;">
      <a href="{FRONTEND_URL}/admin/contacts" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">View in Admin Panel</a>
    </p>
  </td></tr>
</table></body></html>"""
    return _send_simple_email(ADMIN_NOTIFICATION_EMAIL, subject, html_body, text_body)


def send_contact_acknowledgement(name: str, email: str, message: str) -> bool:
    """Send a 'we received your message' confirmation to the user who contacted us."""
    subject = "We received your message — MyZakat"
    text_body = (
        f"Dear {name},\n\n"
        f"Thank you for reaching out to MyZakat. We have received your message and "
        f"a member of our team will get back to you as soon as possible.\n\n"
        f"For your records, here is a copy of your message:\n\n"
        f"---\n{message}\n---\n\n"
        f"If you have additional information to share, simply reply to this email.\n\n"
        f"With gratitude,\nThe MyZakat Team\n"
    )
    html_body = f"""<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
<table style="max-width: 600px; margin: auto; background: white; border-radius: 8px; overflow: hidden;">
  <tr><td style="background: #2563eb; color: white; padding: 30px; text-align: center;">
    <h1 style="margin: 0;">Thank you for contacting us</h1>
  </td></tr>
  <tr><td style="padding: 30px; color: #374151; line-height: 1.6;">
    <p>Dear {name},</p>
    <p>Thank you for reaching out to <strong>MyZakat</strong>. We have received your message
       and a member of our team will get back to you as soon as possible.</p>
    <p style="color: #6b7280; font-size: 14px;">For your records, here is a copy of your message:</p>
    <div style="background: #f9fafb; padding: 15px; border-left: 4px solid #2563eb; border-radius: 4px; white-space: pre-wrap;">{message}</div>
    <p>If you have additional information to share, simply reply to this email.</p>
    <p>With gratitude,<br><strong>The MyZakat Team</strong></p>
  </td></tr>
  <tr><td style="background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px;">
    MyZakat – Zakat Distribution Foundation • <a href="{FRONTEND_URL}" style="color: #2563eb;">myzakat.org</a>
  </td></tr>
</table></body></html>"""
    return _send_simple_email(email, subject, html_body, text_body)


def send_volunteer_admin_notification(name: str, email: str, interest: str, phone: str = None, message: str = None) -> bool:
    """Notify admin that someone signed up to volunteer."""
    subject = f"New Volunteer Sign-up: {name}"
    extras = ""
    if phone:
        extras += f"\nPhone: {phone}"
    if message:
        extras += f"\n\nMessage:\n{message}"
    text_body = (
        f"A new volunteer has signed up on MyZakat.\n\n"
        f"Name: {name}\n"
        f"Email: {email}\n"
        f"Interest: {interest}{extras}\n\n"
        f"Submitted: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n\n"
        f"View all volunteers: {FRONTEND_URL}/admin/volunteers\n"
    )
    extras_html = ""
    if phone:
        extras_html += f'<p><strong>Phone:</strong> <a href="tel:{phone}">{phone}</a></p>'
    if message:
        extras_html += f'<p><strong>Message:</strong></p><div style="background: #f9fafb; padding: 15px; border-left: 4px solid #16a34a; border-radius: 4px; white-space: pre-wrap;">{message}</div>'
    html_body = f"""<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
<table style="max-width: 600px; margin: auto; background: white; border-radius: 8px; overflow: hidden;">
  <tr><td style="background: #16a34a; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">New Volunteer Sign-up</h1>
  </td></tr>
  <tr><td style="padding: 30px;">
    <p><strong>Name:</strong> {name}</p>
    <p><strong>Email:</strong> <a href="mailto:{email}">{email}</a></p>
    <p><strong>Interest:</strong> {interest}</p>
    {extras_html}
    <p><strong>Submitted:</strong> {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}</p>
    <p style="margin-top: 30px;">
      <a href="{FRONTEND_URL}/admin/volunteers" style="background: #16a34a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">View Volunteers</a>
    </p>
  </td></tr>
</table></body></html>"""
    return _send_simple_email(ADMIN_NOTIFICATION_EMAIL, subject, html_body, text_body)


def send_volunteer_acknowledgement(name: str, email: str, interest: str) -> bool:
    """Thank-you email to the volunteer."""
    subject = "Thank you for volunteering with MyZakat"
    text_body = (
        f"Assalamu alaikum {name},\n\n"
        f"Thank you for offering to volunteer with MyZakat. We have received your application "
        f"and will be in touch soon to discuss next steps for '{interest}'.\n\n"
        f"Your willingness to give your time helps us serve communities in need — "
        f"may Allah reward your generosity.\n\n"
        f"With gratitude,\nThe MyZakat Team\n"
    )
    html_body = f"""<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
<table style="max-width: 600px; margin: auto; background: white; border-radius: 8px; overflow: hidden;">
  <tr><td style="background: #16a34a; color: white; padding: 30px; text-align: center;">
    <h1 style="margin: 0;">Thank You for Volunteering</h1>
  </td></tr>
  <tr><td style="padding: 30px; color: #374151; line-height: 1.6;">
    <p>Assalamu alaikum {name},</p>
    <p>Thank you for offering to volunteer with <strong>MyZakat</strong>. We have received your application
       and will be in touch soon to discuss next steps for <strong>{interest}</strong>.</p>
    <p>Your willingness to give your time helps us serve communities in need —
       may Allah reward your generosity.</p>
    <p>With gratitude,<br><strong>The MyZakat Team</strong></p>
  </td></tr>
  <tr><td style="background: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px;">
    MyZakat – Zakat Distribution Foundation • <a href="{FRONTEND_URL}" style="color: #16a34a;">myzakat.org</a>
  </td></tr>
</table></body></html>"""
    return _send_simple_email(email, subject, html_body, text_body)
