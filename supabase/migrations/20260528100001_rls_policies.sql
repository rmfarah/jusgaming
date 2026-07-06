-- =============================================================================
-- JusGaming — Migration 002: Row Level Security
-- Isolamento por tenant (institution_id) + regras por papel
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Funções auxiliares (stable = cacheadas dentro da query)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_user_institution_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT institution_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

-- Retorna true se o usuário atual é professor ou admin
CREATE OR REPLACE FUNCTION auth_is_professor_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role IN ('professor', 'admin') FROM public.users WHERE id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 1. INSTITUTIONS
-- ---------------------------------------------------------------------------
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "institution_select_own"
  ON institutions FOR SELECT
  USING (id = auth_user_institution_id());

-- ---------------------------------------------------------------------------
-- 2. USERS
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Cada usuário vê a si mesmo e os demais da mesma instituição
CREATE POLICY "users_select_same_institution"
  ON users FOR SELECT
  USING (institution_id = auth_user_institution_id());

-- Cada usuário pode atualizar somente o próprio perfil
CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. COURSES
-- ---------------------------------------------------------------------------
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Professores gerenciam as próprias turmas
CREATE POLICY "courses_all_professor"
  ON courses FOR ALL
  USING (
    institution_id = auth_user_institution_id()
    AND professor_id = auth.uid()
  );

-- Alunos veem as turmas em que estão inscritos
CREATE POLICY "courses_select_enrolled_student"
  ON courses FOR SELECT
  USING (
    id IN (
      SELECT course_id FROM course_members WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. COURSE_MEMBERS
-- ---------------------------------------------------------------------------
ALTER TABLE course_members ENABLE ROW LEVEL SECURITY;

-- Professores gerenciam membros das próprias turmas
CREATE POLICY "course_members_all_professor"
  ON course_members FOR ALL
  USING (
    course_id IN (
      SELECT id FROM courses WHERE professor_id = auth.uid()
    )
  );

-- Alunos veem suas próprias inscrições
CREATE POLICY "course_members_select_own"
  ON course_members FOR SELECT
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. CASE_TEMPLATES
-- ---------------------------------------------------------------------------
ALTER TABLE case_templates ENABLE ROW LEVEL SECURITY;

-- Templates globais (institution_id IS NULL e is_public = true) → todos leem
CREATE POLICY "case_templates_select_global"
  ON case_templates FOR SELECT
  USING (institution_id IS NULL AND is_public = true);

-- Templates da própria instituição → membros da instituição leem
CREATE POLICY "case_templates_select_institution"
  ON case_templates FOR SELECT
  USING (institution_id = auth_user_institution_id());

-- Professores gerenciam templates que criaram
CREATE POLICY "case_templates_all_creator"
  ON case_templates FOR ALL
  USING (
    institution_id = auth_user_institution_id()
    AND created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 6. CASE_TEMPLATE_DOCUMENTS
-- ---------------------------------------------------------------------------
ALTER TABLE case_template_documents ENABLE ROW LEVEL SECURITY;

-- Leitura: se o template é visível, seus documentos também são
CREATE POLICY "case_template_docs_select"
  ON case_template_documents FOR SELECT
  USING (
    template_id IN (
      SELECT id FROM case_templates
      WHERE institution_id = auth_user_institution_id()
         OR (institution_id IS NULL AND is_public = true)
    )
  );

-- Professores gerenciam docs de templates que criaram
CREATE POLICY "case_template_docs_all_creator"
  ON case_template_documents FOR ALL
  USING (
    template_id IN (
      SELECT id FROM case_templates WHERE created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. CASES
-- ---------------------------------------------------------------------------
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

-- Professores gerenciam os próprios casos
CREATE POLICY "cases_all_professor"
  ON cases FOR ALL
  USING (
    institution_id = auth_user_institution_id()
    AND professor_id = auth.uid()
  );

-- Alunos veem casos em que participam (via team_members)
CREATE POLICY "cases_select_participant"
  ON cases FOR SELECT
  USING (
    id IN (
      SELECT t.case_id
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 8. TEAMS
-- ---------------------------------------------------------------------------
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Professores gerenciam times dos próprios casos
CREATE POLICY "teams_all_professor"
  ON teams FOR ALL
  USING (
    case_id IN (
      SELECT id FROM cases WHERE professor_id = auth.uid()
    )
  );

-- Participantes veem todos os times do seu caso (para ver quem é quem)
CREATE POLICY "teams_select_participant"
  ON teams FOR SELECT
  USING (
    case_id IN (
      SELECT t2.case_id
      FROM teams t2
      JOIN team_members tm ON tm.team_id = t2.id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 9. TEAM_MEMBERS
-- ---------------------------------------------------------------------------
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Professores gerenciam membros de times dos próprios casos
CREATE POLICY "team_members_all_professor"
  ON team_members FOR ALL
  USING (
    team_id IN (
      SELECT t.id
      FROM teams t
      JOIN cases c ON c.id = t.case_id
      WHERE c.professor_id = auth.uid()
    )
  );

-- Participantes veem todos os membros do próprio caso
CREATE POLICY "team_members_select_participant"
  ON team_members FOR SELECT
  USING (
    team_id IN (
      SELECT t.id
      FROM teams t
      JOIN team_members tm2 ON tm2.team_id = t.id
      WHERE tm2.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 10. DOCUMENTS
-- ---------------------------------------------------------------------------
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Professores gerenciam todos os documentos dos seus casos
CREATE POLICY "documents_all_professor"
  ON documents FOR ALL
  USING (
    case_id IN (
      SELECT id FROM cases WHERE professor_id = auth.uid()
    )
  );

-- Alunos leem todos os documentos dos casos em que participam
CREATE POLICY "documents_select_participant"
  ON documents FOR SELECT
  USING (
    case_id IN (
      SELECT t.case_id
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Alunos protocolam documentos no próprio case/time
CREATE POLICY "documents_insert_participant"
  ON documents FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND team_id IN (
      SELECT t.id
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 11. NOTIFICATIONS
-- ---------------------------------------------------------------------------
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Professores gerenciam notificações dos seus casos
CREATE POLICY "notifications_all_professor"
  ON notifications FOR ALL
  USING (
    case_id IN (
      SELECT id FROM cases WHERE professor_id = auth.uid()
    )
  );

-- Alunos leem notificações destinadas ao seu time ou a todos
CREATE POLICY "notifications_select_participant"
  ON notifications FOR SELECT
  USING (
    case_id IN (
      SELECT t.case_id
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
    AND (
      recipient_team_id IS NULL
      OR recipient_team_id IN (
        SELECT t.id
        FROM teams t
        JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.user_id = auth.uid()
      )
    )
  );

-- Alunos marcam como lidas as próprias notificações
CREATE POLICY "notifications_update_participant"
  ON notifications FOR UPDATE
  USING (
    case_id IN (
      SELECT t.case_id
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
    AND (
      recipient_team_id IS NULL
      OR recipient_team_id IN (
        SELECT t.id
        FROM teams t
        JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 12. EVALUATIONS
-- ---------------------------------------------------------------------------
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

-- Professores gerenciam avaliações que criaram
CREATE POLICY "evaluations_all_professor"
  ON evaluations FOR ALL
  USING (professor_id = auth.uid());

-- Alunos veem avaliações publicadas de documentos do próprio time
-- REGRA CRÍTICA: nunca mostrar antes de published_at estar preenchido
CREATE POLICY "evaluations_select_published_participant"
  ON evaluations FOR SELECT
  USING (
    published_at IS NOT NULL
    AND document_id IN (
      SELECT d.id
      FROM documents d
      JOIN teams t ON t.id = d.team_id
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 13. CASE_EVALUATIONS
-- ---------------------------------------------------------------------------
ALTER TABLE case_evaluations ENABLE ROW LEVEL SECURITY;

-- Professores gerenciam avaliações de caso
CREATE POLICY "case_evaluations_all_professor"
  ON case_evaluations FOR ALL
  USING (professor_id = auth.uid());

-- Alunos veem avaliação do próprio time
CREATE POLICY "case_evaluations_select_participant"
  ON case_evaluations FOR SELECT
  USING (
    team_id IN (
      SELECT t.id
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 14. DEADLINE_PRESETS — dados de referência, leitura pública
-- ---------------------------------------------------------------------------
ALTER TABLE deadline_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deadline_presets_select_all"
  ON deadline_presets FOR SELECT
  USING (true);
