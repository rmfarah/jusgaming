-- =============================================================================
-- JusGaming — Migration 001: Schema Inicial
-- 14 tabelas + ENUMs + índices
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensões
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- ENUMs
-- ---------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('admin', 'professor', 'student');

CREATE TYPE case_type AS ENUM ('civil', 'arbitration');

CREATE TYPE instance_level AS ENUM ('first', 'appeal', 'arbitral');

CREATE TYPE case_status AS ENUM ('draft', 'active', 'closed');

CREATE TYPE team_role AS ENUM ('plaintiff', 'defendant', 'judge');

CREATE TYPE document_recipient AS ENUM ('plaintiff', 'defendant', 'both');

CREATE TYPE incident_type AS ENUM ('appeal_ai', 'appeal_ms');

CREATE TYPE notification_type AS ENUM (
  'case_activated',
  'citation',
  'new_document',
  'new_document_judge'
);

CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

CREATE TYPE case_preset_type AS ENUM ('civil_first', 'civil_appeal', 'arbitration');

-- Todos os tipos de documento num único enum
CREATE TYPE document_type AS ENUM (
  -- Times advogados
  'petition',
  'counterclaim',
  'appeal_ai',
  'appeal_ms',
  'appeal_ed',
  'appeal_general',
  'incident_request',
  'document_filing',
  'other',
  -- Time Juiz
  'order',
  'decision',
  'intimation',
  'sentence',
  'minutes',
  'saneamento',
  -- Sistema (automático)
  'certificate_conclusion',
  'certificate_publication'
);

-- ---------------------------------------------------------------------------
-- 1. INSTITUTIONS — tenant raiz
-- ---------------------------------------------------------------------------
CREATE TABLE institutions (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. USERS — id vem do Supabase Auth
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  email          text UNIQUE NOT NULL,
  full_name      text NOT NULL,
  role           user_role NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. COURSES — turmas
-- ---------------------------------------------------------------------------
CREATE TABLE courses (
  id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id              uuid NOT NULL REFERENCES institutions(id),
  professor_id                uuid NOT NULL REFERENCES users(id),
  name                        text NOT NULL,
  code                        text UNIQUE NOT NULL,
  semester                    text NOT NULL,
  active                      boolean NOT NULL DEFAULT true,
  email_notifications_enabled boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. COURSE_MEMBERS — alunos inscritos em turmas
-- ---------------------------------------------------------------------------
CREATE TABLE course_members (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 5. CASE_TEMPLATES — biblioteca de modelos de caso
--    institution_id NULL = biblioteca global da plataforma
-- ---------------------------------------------------------------------------
CREATE TABLE case_templates (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id    uuid REFERENCES institutions(id),
  created_by        uuid REFERENCES users(id),
  title             text NOT NULL,
  subject           text,
  type              case_type NOT NULL,
  instance_level    instance_level NOT NULL,
  arbitration_rules text,
  plaintiff_brief   text,
  defendant_brief   text,
  is_public         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. CASE_TEMPLATE_DOCUMENTS — documentos base do template
-- ---------------------------------------------------------------------------
CREATE TABLE case_template_documents (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id uuid NOT NULL REFERENCES case_templates(id) ON DELETE CASCADE,
  recipient   document_recipient NOT NULL,
  label       text NOT NULL,
  description text,
  file_path   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. CASES — instâncias de casos numa turma
--    parent_case_id preenchido = incidente (AI ou MS)
-- ---------------------------------------------------------------------------
CREATE TABLE cases (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id    uuid NOT NULL REFERENCES institutions(id),
  course_id         uuid NOT NULL REFERENCES courses(id),
  template_id       uuid REFERENCES case_templates(id),
  professor_id      uuid NOT NULL REFERENCES users(id),
  parent_case_id    uuid REFERENCES cases(id),
  incident_type     incident_type,
  title             text NOT NULL,
  type              case_type NOT NULL,
  instance_level    instance_level NOT NULL,
  arbitration_rules text,
  status            case_status NOT NULL DEFAULT 'draft',
  activated_at      timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 8. TEAMS — times de cada caso
-- ---------------------------------------------------------------------------
CREATE TABLE teams (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id    uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  role       team_role NOT NULL,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, role)
);

-- ---------------------------------------------------------------------------
-- 9. TEAM_MEMBERS — membros de cada time
-- ---------------------------------------------------------------------------
CREATE TABLE team_members (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id   uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 10. DOCUMENTS — coração do sistema (os autos)
--     uploaded_by e team_id são null para certidões automáticas do sistema
-- ---------------------------------------------------------------------------
CREATE TABLE documents (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id          uuid NOT NULL REFERENCES cases(id),
  sequence_number  integer NOT NULL,
  uploaded_by      uuid REFERENCES users(id),
  team_id          uuid REFERENCES teams(id),
  document_type    document_type NOT NULL,
  title            text NOT NULL,
  file_path        text,
  certificate_text text,
  triggered_by     uuid REFERENCES documents(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, sequence_number)
);

-- ---------------------------------------------------------------------------
-- 11. NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id           uuid NOT NULL REFERENCES cases(id),
  document_id       uuid REFERENCES documents(id),
  recipient_team_id uuid REFERENCES teams(id),
  notification_type notification_type NOT NULL,
  email_subject     text,
  email_body        text,
  send_email        boolean NOT NULL DEFAULT false,
  read_at           timestamptz,
  sent_at           timestamptz,
  status            notification_status NOT NULL DEFAULT 'pending',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 12. EVALUATIONS — avaliação por documento
-- ---------------------------------------------------------------------------
CREATE TABLE evaluations (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id  uuid NOT NULL REFERENCES documents(id),
  professor_id uuid NOT NULL REFERENCES users(id),
  score        integer CHECK (score >= 0 AND score <= 10),
  comments     text,
  rubric_data  jsonb,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 13. CASE_EVALUATIONS — avaliação por time ao final do caso
-- ---------------------------------------------------------------------------
CREATE TABLE case_evaluations (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id      uuid NOT NULL REFERENCES cases(id),
  team_id      uuid NOT NULL REFERENCES teams(id),
  professor_id uuid NOT NULL REFERENCES users(id),
  score        integer CHECK (score >= 0 AND score <= 10),
  comments     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, team_id)
);

-- ---------------------------------------------------------------------------
-- 14. DEADLINE_PRESETS — sugestões de prazo (não obrigatórios)
-- ---------------------------------------------------------------------------
CREATE TABLE deadline_presets (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_type    case_preset_type NOT NULL,
  label        text NOT NULL,
  default_days integer NOT NULL,
  description  text,
  sort_order   integer NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- ÍNDICES — colunas mais usadas em WHERE e JOIN
-- ---------------------------------------------------------------------------
CREATE INDEX idx_users_institution_id          ON users(institution_id);
CREATE INDEX idx_courses_institution_id        ON courses(institution_id);
CREATE INDEX idx_courses_professor_id          ON courses(professor_id);
CREATE INDEX idx_course_members_course_id      ON course_members(course_id);
CREATE INDEX idx_course_members_user_id        ON course_members(user_id);
CREATE INDEX idx_case_templates_institution_id ON case_templates(institution_id);
CREATE INDEX idx_cases_institution_id          ON cases(institution_id);
CREATE INDEX idx_cases_course_id               ON cases(course_id);
CREATE INDEX idx_cases_professor_id            ON cases(professor_id);
CREATE INDEX idx_cases_parent_case_id          ON cases(parent_case_id);
CREATE INDEX idx_cases_status                  ON cases(status);
CREATE INDEX idx_teams_case_id                 ON teams(case_id);
CREATE INDEX idx_team_members_team_id          ON team_members(team_id);
CREATE INDEX idx_team_members_user_id          ON team_members(user_id);
CREATE INDEX idx_documents_case_id             ON documents(case_id);
CREATE INDEX idx_documents_case_seq            ON documents(case_id, sequence_number);
CREATE INDEX idx_documents_uploaded_by         ON documents(uploaded_by);
CREATE INDEX idx_documents_team_id             ON documents(team_id);
CREATE INDEX idx_documents_triggered_by        ON documents(triggered_by);
CREATE INDEX idx_notifications_case_id         ON notifications(case_id);
CREATE INDEX idx_notifications_document_id     ON notifications(document_id);
CREATE INDEX idx_notifications_recipient_team  ON notifications(recipient_team_id);
CREATE INDEX idx_evaluations_document_id       ON evaluations(document_id);
CREATE INDEX idx_evaluations_professor_id      ON evaluations(professor_id);
CREATE INDEX idx_case_eval_case_id             ON case_evaluations(case_id);
CREATE INDEX idx_case_eval_team_id             ON case_evaluations(team_id);
CREATE INDEX idx_deadline_presets_case_type    ON deadline_presets(case_type, sort_order);
