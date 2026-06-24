-- Migration 27: Marketing — attachments on marketing campaigns
--
-- Lets admins attach PDFs, images, or any S3-hosted file to a broadcast.
-- The send worker fetches each attachment from S3, base64-encodes it, and
-- includes it on every recipient's email.

ALTER TABLE marketing_campaigns
    ADD COLUMN IF NOT EXISTS attachment_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

SELECT 'Migration 27 completed successfully!' as message;
