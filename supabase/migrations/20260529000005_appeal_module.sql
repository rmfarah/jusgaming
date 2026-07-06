-- =============================================================================
-- JusGaming — Migration 008: Módulo Recursal (2º Grau)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. instance_level enum — novos graus recursais
-- ---------------------------------------------------------------------------
ALTER TYPE instance_level ADD VALUE IF NOT EXISTS 'appeal_interlocutory';
ALTER TYPE instance_level ADD VALUE IF NOT EXISTS 'appeal_sentence';

-- ---------------------------------------------------------------------------
-- 2. document_type enum — novos tipos
-- ---------------------------------------------------------------------------
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'certificate_distribution';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'substitution_of_attorney';

-- ---------------------------------------------------------------------------
-- 3. Colunas adicionais em cases e case_templates
-- ---------------------------------------------------------------------------
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS email_sender_type    text DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS appealed_decision_type text;

ALTER TABLE case_templates
  ADD COLUMN IF NOT EXISTS email_sender_type    text DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS appealed_decision_type text;

-- ---------------------------------------------------------------------------
-- 4. Atualizar auto_certificates() para também pular substitution_of_attorney
--    e certificate_distribution (documentos sem cert automática)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_certificates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_role public.team_role;
  v_now_sp    timestamptz := now() AT TIME ZONE 'America/Sao_Paulo';
  v_date_str  text := to_char(v_now_sp, 'DD/MM/YYYY');
  v_time_str  text := to_char(v_now_sp, 'HH24:MI');
  v_d1_str    text := to_char(public.next_business_day((v_now_sp::date)), 'DD/MM/YYYY');
BEGIN
  IF NEW.uploaded_by IS NULL OR NEW.team_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.document_type IN (
    'case_material',
    'certificate_citation',
    'certificate_distribution',
    'hearing_notice',
    'certificate_conclusion',
    'certificate_publication',
    'substitution_of_attorney'   -- sem certidão de conclusão para substabelecimento
  ) THEN RETURN NEW; END IF;

  SELECT role INTO v_team_role FROM public.teams WHERE id = NEW.team_id;

  IF v_team_role IN ('plaintiff', 'defendant') THEN
    INSERT INTO public.documents (case_id, uploaded_by, team_id, document_type, title, certificate_text, triggered_by)
    VALUES (NEW.case_id, NULL, NULL, 'certificate_conclusion', 'Certidão de Conclusão',
      'Certifico que os presentes autos foram conclusos ao MM. Juiz(a) em '
      || v_date_str || ' às ' || v_time_str
      || ', para os fins de direito. São Paulo, ' || v_date_str || '.', NEW.id);

  ELSIF v_team_role = 'judge' THEN
    INSERT INTO public.documents (case_id, uploaded_by, team_id, document_type, title, certificate_text, triggered_by)
    VALUES (NEW.case_id, NULL, NULL, 'certificate_publication', 'Certidão de Publicação no DJe',
      'Certifico que o presente ato (ID ' || LPAD(NEW.sequence_number::text, 3, '0')
      || ') foi disponibilizado no Diário de Justiça Eletrônico no dia ' || v_date_str
      || ', considerando-se dia de sua publicação o dia ' || v_d1_str
      || ', iniciando-se a contagem dos prazos no primeiro dia útil subsequente à publicação. São Paulo, '
      || v_date_str || '.', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;
