-- =============================================================================
-- FIX: Missing enum values that cause runtime errors
-- =============================================================================

-- notification_type: 'citation_served' was used in judgeActionCiteSummons
-- but was never added to the enum — caused every citation to fail silently.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'citation_served';

-- notification_type: fato_novo reused 'case_activated' as a workaround;
-- add a proper type so notifications are distinguishable in the UI.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'fato_novo';
