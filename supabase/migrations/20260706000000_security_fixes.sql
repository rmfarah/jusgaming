-- =============================================================================
-- JusGaming — Migration: Correções de segurança (auditoria 06/07/2026)
--
-- 1. users: impedir auto-escalação de privilégio (role/institution_id/active)
-- 2. documents INSERT: amarrar case_id ao time, exigir membership real e caso ativo
-- 3. evaluations SELECT: aluno vê apenas notas publicadas do PRÓPRIO time
-- 4. Storage: policies versionadas para uploads em cases/{caseId}/
-- 5. evaluations: UNIQUE (document_id, professor_id) — evita duplicata em corrida
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. USERS — bloquear escalação de privilégio
--
-- A policy users_update_own permite UPDATE na própria linha, mas RLS não
-- restringe colunas: qualquer aluno podia setar role='professor'/'admin',
-- trocar institution_id (cross-tenant) ou reverter active=false.
-- Privilégio de coluna resolve: authenticated só pode alterar full_name.
-- (Server actions usam service_role e não são afetadas.)
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON public.users FROM anon, authenticated;
GRANT UPDATE (full_name) ON public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers — times em que o usuário logado é MEMBRO (não todos os do caso)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_team_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.team_case_id(p_team_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT case_id FROM public.teams WHERE id = p_team_id
$$;

CREATE OR REPLACE FUNCTION public.case_is_active(p_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT status = 'active' FROM public.cases WHERE id = p_case_id
$$;

-- ---------------------------------------------------------------------------
-- 3. DOCUMENTS INSERT — a policy anterior tinha 3 furos:
--    a) case_id não era validado → dava para protocolar em QUALQUER caso
--    b) participant_team_ids() incluía todos os times do caso → aluno do
--       Time Autor podia protocolar como Time Juiz (e disparar certidão DJe)
--    c) sem checagem de status → protocolo em rascunho/encerrado
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "documents_insert_participant" ON documents;
CREATE POLICY "documents_insert_participant"
  ON documents FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND team_id IN (SELECT public.member_team_ids())
    AND case_id = public.team_case_id(team_id)
    AND public.case_is_active(case_id)
  );

-- ---------------------------------------------------------------------------
-- 4. EVALUATIONS SELECT — regressão do fix de recursão: participant_team_ids()
--    inclui todos os times do caso, expondo notas de outros times.
--    Voltar à regra original: apenas documentos do PRÓPRIO time.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "evaluations_select_published_participant" ON evaluations;
CREATE POLICY "evaluations_select_published_participant"
  ON evaluations FOR SELECT
  USING (
    published_at IS NOT NULL
    AND document_id IN (
      SELECT d.id FROM public.documents d
      WHERE d.case_id IN (SELECT public.participant_case_ids())
        AND d.team_id IN (SELECT public.member_team_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. STORAGE — uploads client-side em cases/{caseId}/...
--    As policies do boilerplate só permitiam caminhos {auth.uid()}/..., o que
--    quebra o protocolo com PDF. Regras novas:
--      INSERT: participante do caso ou professor dono, só dentro da pasta
--              do próprio caso
--      DELETE: autor do upload (cleanup quando o server action falha)
--    Download continua exclusivamente via signed URL (service role).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "cases_upload_case_participant" ON storage.objects;
CREATE POLICY "cases_upload_case_participant"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'files'
    AND (storage.foldername(name))[1] = 'cases'
    AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      ((storage.foldername(name))[2])::uuid IN (SELECT public.participant_case_ids())
      OR ((storage.foldername(name))[2])::uuid IN (SELECT public.professor_case_ids())
    )
  );

DROP POLICY IF EXISTS "cases_delete_own_upload" ON storage.objects;
CREATE POLICY "cases_delete_own_upload"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'files'
    AND (storage.foldername(name))[1] = 'cases'
    AND (owner = auth.uid() OR owner_id = auth.uid()::text)
  );

-- ---------------------------------------------------------------------------
-- 6. EVALUATIONS — unicidade por (document_id, professor_id)
--    upsertEvaluation faz select+insert manual; corrida podia duplicar e
--    quebrar o maybeSingle() seguinte. Remove duplicatas (mantém a mais
--    recente) e cria a constraint.
-- ---------------------------------------------------------------------------
DELETE FROM evaluations a
USING evaluations b
WHERE a.document_id = b.document_id
  AND a.professor_id = b.professor_id
  AND a.id <> b.id
  AND (a.updated_at < b.updated_at
       OR (a.updated_at = b.updated_at AND a.id < b.id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evaluations_document_professor_unique'
  ) THEN
    ALTER TABLE evaluations
      ADD CONSTRAINT evaluations_document_professor_unique
      UNIQUE (document_id, professor_id);
  END IF;
END $$;
