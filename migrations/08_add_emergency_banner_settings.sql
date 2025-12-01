-- Migration 08: Add emergency banner settings
-- This allows admins to customize the emergency banner message and CTA from the admin console

-- Add emergency banner settings
INSERT INTO settings (key, value, description) VALUES
('emergency_banner_enabled', 'true', 'Enable or disable the emergency banner at the top of pages'),
('emergency_banner_message', 'Emergency Relief Needed: Support families affected by the crisis.', 'Emergency banner message text'),
('emergency_banner_cta_text', 'Donate Now', 'Emergency banner call-to-action button text'),
('emergency_banner_cta_url', '/donate', 'Emergency banner call-to-action button URL')
ON CONFLICT (key) DO NOTHING;

SELECT 'Migration 08 completed successfully!' as message;

