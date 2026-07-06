-- ADD: judge to document_recipient enum so template documents can target the judge team
ALTER TYPE document_recipient ADD VALUE IF NOT EXISTS 'judge';
