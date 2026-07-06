-- Evaluations v2: drop rubric, use decimal score, add weight per document
-- Drop team-level case_evaluations (replaced by weighted average from documents)

ALTER TABLE evaluations DROP COLUMN IF EXISTS rubric_data;
ALTER TABLE evaluations ALTER COLUMN score TYPE numeric(4,1) USING score::numeric(4,1);
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS weight numeric(4,2) NOT NULL DEFAULT 1.0;

DROP TABLE IF EXISTS case_evaluations;
