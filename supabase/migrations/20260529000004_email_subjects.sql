-- =============================================================================
-- ADD: plaintiff/defendant email subjects to cases and case_templates
--      sent_at column to notifications
-- =============================================================================

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS plaintiff_email_subject text
    DEFAULT 'Preciso da sua ajuda urgente',
  ADD COLUMN IF NOT EXISTS defendant_email_subject text
    DEFAULT 'Você foi citado — precisamos conversar';

ALTER TABLE case_templates
  ADD COLUMN IF NOT EXISTS plaintiff_email_subject text
    DEFAULT 'Preciso da sua ajuda urgente',
  ADD COLUMN IF NOT EXISTS defendant_email_subject text
    DEFAULT 'Você foi citado — precisamos conversar';

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;
