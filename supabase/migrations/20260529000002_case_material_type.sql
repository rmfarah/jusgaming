-- =============================================================================
-- ADD: case_material to document_type enum
-- =============================================================================
-- Used for files uploaded by the professor during case setup (draft phase).
-- These documents appear in the autos pinned header, visible only to the
-- team they are addressed to (enforced at application level).
-- They are NOT sequenced in the main autos table — filtered out in the UI.
-- =============================================================================

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'case_material';
