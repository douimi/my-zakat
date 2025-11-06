import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr, formatdate, make_msgid
from email.header import Header
import os
from dotenv import load_dotenv
import logging
from datetime import datetime

load_dotenv()

logger = logging.getLogger(__name__)

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
        
        logger.info(f"Verification email sent successfully to {email}")
        return True
        
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error sending verification email to {email}: {str(e)}")
        return False
    except Exception as e:
        logger.error(f"Failed to send verification email to {email}: {str(e)}")
        return False

