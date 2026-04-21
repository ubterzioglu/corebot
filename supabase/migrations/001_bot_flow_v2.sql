-- Bot Flow v2: New columns, drop old ones, reset users
-- Run this migration against the wa_users table.

-- Step 1: Reset all existing users to WELCOME and clear legacy fields
UPDATE wa_users SET current_step = 'WELCOME', intent = NULL, role = NULL;

-- Step 2: Add new columns
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS surname text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE wa_users ADD COLUMN IF NOT EXISTS funnel_interest boolean;

-- Step 3: Drop old columns
ALTER TABLE wa_users DROP COLUMN IF EXISTS intent;
ALTER TABLE wa_users DROP COLUMN IF EXISTS role;
