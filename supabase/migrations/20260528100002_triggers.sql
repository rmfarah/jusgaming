-- =============================================================================
-- JusGaming — Migration 003: Triggers e Funções Automáticas
--
-- Ordem de disparo dos triggers AFTER INSERT em documents:
--   1. trg_auto_certificates (gera certidão_conclusão ou certidão_publicação)
--   2. trg_auto_incident_case (cria caso incidente para AI/MS)
--
-- BEFORE INSERT:
--   1. trg_set_sequence_number (numera automaticamente por case_id)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FUNÇÃO: próximo sequence_number para um case_id
--
-- Usa FOR UPDATE na linha do caso para serializar inserções concorrentes
-- e evitar dois documentos receberem o mesmo número.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_sequence_number(p_case_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  -- Serializa inserções no mesmo caso (evita race condition)
  PERFORM id FROM cases WHERE id = p_case_id FOR UPDATE;

  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_next
  FROM documents
  WHERE case_id = p_case_id;

  RETURN v_next;
END;
$$;

-- ---------------------------------------------------------------------------
-- TRIGGER 1 (BEFORE INSERT): atribui sequence_number automaticamente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_sequence_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sequence_number IS NULL THEN
    NEW.sequence_number := next_sequence_number(NEW.case_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_sequence_number
  BEFORE INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION set_sequence_number();

-- ---------------------------------------------------------------------------
-- TRIGGER 2 (AFTER INSERT): gera certidões automáticas
--
-- Lógica: verifica o papel (role) do time que protocolou o documento
--   • Time Autor/Réu (plaintiff/defendant) → certificate_conclusion
--   • Time Juiz (judge)                    → certificate_publication
--
-- Documentos de sistema (uploaded_by IS NULL) são ignorados para evitar
-- recursão infinita.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_certificates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_role public.team_role;
BEGIN
  -- Certidões do sistema não disparam novas certidões
  IF NEW.uploaded_by IS NULL OR NEW.team_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_team_role
  FROM public.teams
  WHERE id = NEW.team_id;

  -- -------------------------------------------------------------------------
  -- Time Advogado → certidão de conclusão ao juiz
  -- -------------------------------------------------------------------------
  IF v_team_role IN ('plaintiff', 'defendant') THEN
    INSERT INTO public.documents (
      case_id,
      uploaded_by,
      team_id,
      document_type,
      title,
      certificate_text,
      triggered_by
    ) VALUES (
      NEW.case_id,
      NULL,
      NULL,
      'certificate_conclusion',
      'Certidão de Conclusão',
      'Certifico que os presentes autos foram conclusos ao MM. Juiz(a) em '
        || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
        || ' às '
        || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
        || ', para os fins de direito.',
      NEW.id
    );

  -- -------------------------------------------------------------------------
  -- Time Juiz → certidão de publicação no DJe
  -- -------------------------------------------------------------------------
  ELSIF v_team_role = 'judge' THEN
    INSERT INTO public.documents (
      case_id,
      uploaded_by,
      team_id,
      document_type,
      title,
      certificate_text,
      triggered_by
    ) VALUES (
      NEW.case_id,
      NULL,
      NULL,
      'certificate_publication',
      'Certidão de Publicação no DJe',
      'Certifico que o ato '
        || LPAD(NEW.sequence_number::text, 3, '0')
        || ' foi disponibilizado no Diário de Justiça Eletrônico em '
        || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
        || '. Considera-se publicado no primeiro dia útil subsequente, '
        || 'iniciando-se a contagem dos prazos no dia útil seguinte à publicação.',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_certificates
  AFTER INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_certificates();

-- ---------------------------------------------------------------------------
-- TRIGGER 3 (AFTER INSERT): cria caso incidente para appeal_ai e appeal_ms
--
-- O incidente herda institution_id, course_id e professor_id do caso pai.
-- O Time Juiz do caso pai é copiado para o incidente (com seus membros),
-- pois o mesmo juiz julga o incidente.
-- Numeração do incidente começa em 001, independente do caso principal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_incident_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent    public.cases%ROWTYPE;
  v_new_case  uuid;
  v_judge_team_id uuid;
  v_new_judge_team_id uuid;
BEGIN
  -- Apenas para AI e MS protocolados por usuário
  IF NEW.document_type NOT IN ('appeal_ai', 'appeal_ms') THEN
    RETURN NEW;
  END IF;
  IF NEW.uploaded_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_parent FROM public.cases WHERE id = NEW.case_id;

  -- Cria o caso incidente
  INSERT INTO public.cases (
    institution_id,
    course_id,
    professor_id,
    parent_case_id,
    incident_type,
    title,
    type,
    instance_level,
    arbitration_rules,
    status,
    activated_at
  ) VALUES (
    v_parent.institution_id,
    v_parent.course_id,
    v_parent.professor_id,
    NEW.case_id,
    NEW.document_type::text::public.incident_type,
    v_parent.title || ' — ' || CASE NEW.document_type
      WHEN 'appeal_ai' THEN 'Agravo de Instrumento'
      WHEN 'appeal_ms' THEN 'Mandado de Segurança'
    END,
    v_parent.type,
    v_parent.instance_level,
    v_parent.arbitration_rules,
    'active',
    now()
  ) RETURNING id INTO v_new_case;

  -- Copia o Time Juiz do caso pai para o incidente
  SELECT id INTO v_judge_team_id
  FROM public.teams
  WHERE case_id = NEW.case_id AND role = 'judge';

  IF v_judge_team_id IS NOT NULL THEN
    INSERT INTO public.teams (case_id, role, name)
    SELECT v_new_case, role, name
    FROM public.teams
    WHERE id = v_judge_team_id
    RETURNING id INTO v_new_judge_team_id;

    -- Copia os membros do Time Juiz
    INSERT INTO public.team_members (team_id, user_id)
    SELECT v_new_judge_team_id, user_id
    FROM public.team_members
    WHERE team_id = v_judge_team_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_incident_case
  AFTER INSERT ON documents
  FOR EACH ROW
  EXECUTE FUNCTION auto_incident_case();

-- ---------------------------------------------------------------------------
-- TRIGGER 4 (BEFORE UPDATE): atualiza updated_at em evaluations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_evaluations_updated_at
  BEFORE UPDATE ON evaluations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_case_evaluations_updated_at
  BEFORE UPDATE ON case_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
