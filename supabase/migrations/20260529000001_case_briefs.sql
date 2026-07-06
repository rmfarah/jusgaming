-- =============================================================================
-- ADD: Brief columns to cases and case_templates
-- =============================================================================
-- cases: plaintiff_brief, defendant_brief, judge_brief
--   → text that professor configures per case; sent to each team on activation
-- case_templates: judge_brief
--   → matches the per-role brief pattern already in cases

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS plaintiff_brief text,
  ADD COLUMN IF NOT EXISTS defendant_brief text,
  ADD COLUMN IF NOT EXISTS judge_brief      text;

ALTER TABLE case_templates
  ADD COLUMN IF NOT EXISTS judge_brief text;
