-- Add explicit conversation mode so AI chat does not interfere with the onboarding flow.

ALTER TABLE wa_users
ADD COLUMN IF NOT EXISTS conversation_mode text DEFAULT 'flow';

UPDATE wa_users
SET conversation_mode = 'flow'
WHERE conversation_mode IS NULL;
    