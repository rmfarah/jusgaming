-- =============================================================================
-- JusGaming — Migration 007: Judge special actions + certificate text fix
-- =============================================================================
-- 1. Add certificate_citation and hearing_notice to document_type enum
-- 2. Create next_business_day() helper function
-- 3. Rewrite auto_certificates() with correct D+1 text + skip case_material
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New document_type enum values
-- ---------------------------------------------------------------------------
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'certificate_citation';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'hearing_notice';

-- ---------------------------------------------------------------------------
-- 2. Helper: próximo dia útil (pula sáb=6 e dom=0)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_business_day(p_date date)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_next date := p_date + 1;
BEGIN
  WHILE EXTRACT(DOW FROM v_next) IN (0, 6) LOOP
    v_next := v_next + 1;
  END LOOP;
  RETURN v_next;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rewrite auto_certificates() trigger function
--
-- Changes:
--   • Skip case_material documents (professor setup docs, not court filings)
--   • Skip certificate_citation and hearing_notice (system docs, judge actions)
--   • certificate_conclusion: text with HH:MM + "São Paulo, DD/MM/AAAA"
--   • certificate_publication: D+1 útil text per spec
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_certificates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_role   public.team_role;
  v_now_sp      timestamptz := now() AT TIME ZONE 'America/Sao_Paulo';
  v_date_str    text        := to_char(v_now_sp, 'DD/MM/YYYY');
  v_time_str    text        := to_char(v_now_sp, 'HH24:MI');
  v_d1_str      text        := to_char(
                                 public.next_business_day((v_now_sp::date)),
                                 'DD/MM/YYYY'
                               );
BEGIN
  -- ── Skip system documents (uploaded_by IS NULL or team_id IS NULL) ─────────
  IF NEW.uploaded_by IS NULL OR NEW.team_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Skip non-protocol document types ─────────────────────────────────────
  IF NEW.document_type IN (
    'case_material',
    'certificate_citation',
    'hearing_notice',
    'certificate_conclusion',
    'certificate_publication'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_team_role
  FROM public.teams
  WHERE id = NEW.team_id;

  -- ── Time Advogado (Autor / Réu) → Certidão de Conclusão ──────────────────
  IF v_team_role IN ('plaintiff', 'defendant') THEN
    INSERT INTO public.documents (
      case_id, uploaded_by, team_id,
      document_type, title, certificate_text, triggered_by
    ) VALUES (
      NEW.case_id, NULL, NULL,
      'certificate_conclusion',
      'Certidão de Conclusão',
      'Certifico que os presentes autos foram conclusos ao MM. Juiz(a) em '
        || v_date_str
        || ' às '
        || v_time_str
        || ', para os fins de direito. São Paulo, '
        || v_date_str
        || '.',
      NEW.id
    );

  -- ── Time Juiz → Certidão de Publicação no DJe ────────────────────────────
  ELSIF v_team_role = 'judge' THEN
    INSERT INTO public.documents (
      case_id, uploaded_by, team_id,
      document_type, title, certificate_text, triggered_by
    ) VALUES (
      NEW.case_id, NULL, NULL,
      'certificate_publication',
      'Certidão de Publicação no DJe',
      'Certifico que o presente ato (ID '
        || LPAD(NEW.sequence_number::text, 3, '0')
        || ') foi disponibilizado no Diário de Justiça Eletrônico no dia '
        || v_date_str
        || ', considerando-se dia de sua publicação o dia '
        || v_d1_str
        || ', iniciando-se a contagem dos prazos no primeiro dia útil subsequente à publicação. São Paulo, '
        || v_date_str
        || '.',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;
