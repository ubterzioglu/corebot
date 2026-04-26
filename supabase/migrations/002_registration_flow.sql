-- Bot registration flow: detailed WhatsApp onboarding fields.
-- Run this migration against the wa_users table.

ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS organization text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS occupation_interest text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS discovery_source text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS whatsapp_group_interest boolean;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS privacy_consent boolean;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS registration_status text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS registration_completed_at timestamptz;
