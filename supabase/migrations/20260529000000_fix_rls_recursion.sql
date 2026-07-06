-- =============================================================================
-- FIX: Infinite recursion in RLS policies
-- =============================================================================
-- Root cause: professor policies query tables that have student policies, which
-- query tables that have professor policies → circular dependency.
--
-- Example cycle:
--   teams_all_professor   → SELECT FROM cases
--   cases_select_participant → SELECT FROM teams        ← loop!
--
-- Fix: wrap all cross-table subqueries in SECURITY DEFINER functions.
-- SECURITY DEFINER bypasses RLS inside the function, breaking every cycle.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS (SECURITY DEFINER = bypass RLS inside)
-- ---------------------------------------------------------------------------

-- IDs das turmas do professor logado
CREATE OR REPLACE FUNCTION professor_course_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT id FROM public.courses WHERE professor_id = auth.uid()
$$;

-- IDs dos casos do professor logado
CREATE OR REPLACE FUNCTION professor_case_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT id FROM public.cases WHERE professor_id = auth.uid()
$$;

-- IDs dos times dos casos do professor logado
CREATE OR REPLACE FUNCTION professor_team_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT id FROM public.teams WHERE case_id IN (SELECT public.professor_case_ids())
$$;

-- IDs dos casos em que o usuário logado é participante (via team_members)
CREATE OR REPLACE FUNCTION participant_case_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT DISTINCT t.case_id
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = auth.uid()
$$;

-- IDs dos times dos casos em que o usuário logado é participante
CREATE OR REPLACE FUNCTION participant_team_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT id FROM public.teams
  WHERE case_id IN (SELECT public.participant_case_ids())
$$;

-- ---------------------------------------------------------------------------
-- 2. COURSE_MEMBERS — recriar policy do professor
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "course_members_all_professor" ON course_members;
CREATE POLICY "course_members_all_professor"
  ON course_members FOR ALL
  USING (course_id IN (SELECT professor_course_ids()));

-- ---------------------------------------------------------------------------
-- 3. CASES — recriar policies que causavam loop
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "cases_select_participant" ON cases;
CREATE POLICY "cases_select_participant"
  ON cases FOR SELECT
  USING (id IN (SELECT participant_case_ids()));

-- ---------------------------------------------------------------------------
-- 4. TEAMS — recriar ambas as policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "teams_all_professor" ON teams;
CREATE POLICY "teams_all_professor"
  ON teams FOR ALL
  USING (case_id IN (SELECT professor_case_ids()));

DROP POLICY IF EXISTS "teams_select_participant" ON teams;
CREATE POLICY "teams_select_participant"
  ON teams FOR SELECT
  USING (case_id IN (SELECT participant_case_ids()));

-- ---------------------------------------------------------------------------
-- 5. TEAM_MEMBERS — recriar ambas as policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "team_members_all_professor" ON team_members;
CREATE POLICY "team_members_all_professor"
  ON team_members FOR ALL
  USING (team_id IN (SELECT professor_team_ids()));

DROP POLICY IF EXISTS "team_members_select_participant" ON team_members;
CREATE POLICY "team_members_select_participant"
  ON team_members FOR SELECT
  USING (team_id IN (SELECT participant_team_ids()));

-- ---------------------------------------------------------------------------
-- 6. DOCUMENTS — recriar policies que consultavam teams diretamente
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "documents_all_professor" ON documents;
CREATE POLICY "documents_all_professor"
  ON documents FOR ALL
  USING (case_id IN (SELECT professor_case_ids()));

DROP POLICY IF EXISTS "documents_select_participant" ON documents;
CREATE POLICY "documents_select_participant"
  ON documents FOR SELECT
  USING (case_id IN (SELECT participant_case_ids()));

DROP POLICY IF EXISTS "documents_insert_participant" ON documents;
CREATE POLICY "documents_insert_participant"
  ON documents FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND team_id IN (SELECT participant_team_ids())
  );

-- ---------------------------------------------------------------------------
-- 7. NOTIFICATIONS — recriar policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_all_professor" ON notifications;
CREATE POLICY "notifications_all_professor"
  ON notifications FOR ALL
  USING (case_id IN (SELECT professor_case_ids()));

DROP POLICY IF EXISTS "notifications_select_participant" ON notifications;
CREATE POLICY "notifications_select_participant"
  ON notifications FOR SELECT
  USING (
    case_id IN (SELECT participant_case_ids())
    AND (
      recipient_team_id IS NULL
      OR recipient_team_id IN (SELECT participant_team_ids())
    )
  );

DROP POLICY IF EXISTS "notifications_update_participant" ON notifications;
CREATE POLICY "notifications_update_participant"
  ON notifications FOR UPDATE
  USING (
    case_id IN (SELECT participant_case_ids())
    AND (
      recipient_team_id IS NULL
      OR recipient_team_id IN (SELECT participant_team_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 8. EVALUATIONS — a policy de aluno consultava documents → teams (loop)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "evaluations_select_published_participant" ON evaluations;
CREATE POLICY "evaluations_select_published_participant"
  ON evaluations FOR SELECT
  USING (
    published_at IS NOT NULL
    AND document_id IN (
      SELECT d.id FROM public.documents d
      WHERE d.case_id IN (SELECT participant_case_ids())
        AND d.team_id IN (SELECT participant_team_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 9. CASE_EVALUATIONS — policy de aluno consultava teams (loop)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "case_evaluations_select_participant" ON case_evaluations;
CREATE POLICY "case_evaluations_select_participant"
  ON case_evaluations FOR SELECT
  USING (team_id IN (SELECT participant_team_ids()));
