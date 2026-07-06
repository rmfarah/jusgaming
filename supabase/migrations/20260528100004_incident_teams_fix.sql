-- =============================================================================
-- JusGaming — Migration 004: Incident Teams Fix + Incident Document Types
--
-- Fixes:
--   1. auto_incident_case() agora copia os 3 times (não só o juiz)
--   2. Novos document_type para incidentes (AI / MS)
--
-- ATENÇÃO: ALTER TYPE ADD VALUE não pode rodar dentro de uma transação
-- em PostgreSQL < 12. Supabase usa PG 15, portanto é seguro aqui.
-- Se necessário, rode cada ALTER TYPE fora de um bloco BEGIN/COMMIT.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Novos tipos de documento para incidentes
-- ---------------------------------------------------------------------------

-- Decisões do juiz/relator no incidente
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'acordao';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'decision_monocratica';

-- Atos das partes no incidente
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'complementation';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'counterargument';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'withdrawal';

-- ---------------------------------------------------------------------------
-- 2. Corrige auto_incident_case para copiar os 3 times + membros
--    (antes copiava apenas o Time Juiz)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_incident_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent        public.cases%ROWTYPE;
  v_new_case      uuid;
  v_team_rec      RECORD;
  v_new_team_id   uuid;
BEGIN
  -- Apenas para AI e MS protocolados por usuário real
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

  -- Copia TODOS os 3 times do caso principal (não só o juiz)
  FOR v_team_rec IN
    SELECT id, role, name FROM public.teams WHERE case_id = NEW.case_id
  LOOP
    INSERT INTO public.teams (case_id, role, name)
    VALUES (v_new_case, v_team_rec.role, v_team_rec.name)
    RETURNING id INTO v_new_team_id;

    -- Copia membros do time
    INSERT INTO public.team_members (team_id, user_id)
    SELECT v_new_team_id, user_id
    FROM public.team_members
    WHERE team_id = v_team_rec.id;
  END LOOP;

  RETURN NEW;
END;
$$;
