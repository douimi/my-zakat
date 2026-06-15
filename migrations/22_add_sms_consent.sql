-- Migration 22: SMS consent tracking on subscriptions
--
-- For 10DLC / TCPA compliance we need to be able to prove when, where, and
-- on what exact wording a user opted in to SMS messages. Adds three nullable
-- columns to the existing subscriptions table.

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS sms_consent_at   TIMESTAMP;

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS sms_consent_ip   VARCHAR(45);  -- room for IPv6

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS sms_consent_text TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_phone ON subscriptions(phone);

SELECT 'Migration 22 completed successfully!' as message;
