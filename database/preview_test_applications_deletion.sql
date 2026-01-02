-- ============================================================================
-- PREVIEW TEST APPLICATIONS DELETION
-- ============================================================================
-- This script shows what will be deleted BEFORE actually deleting anything.
-- Run this first to verify the scope of the deletion.
-- ============================================================================

-- Step 1: Find the user_id for "Matt Test"
WITH matt_test_user AS (
    SELECT 
        COALESCE(
            (SELECT id FROM auth.users WHERE email ILIKE '%matt%test%' OR email ILIKE '%test%matt%' LIMIT 1),
            (SELECT id FROM profiles WHERE (first_name ILIKE '%matt%' AND last_name ILIKE '%test%') OR email ILIKE '%matt%test%' LIMIT 1),
            (SELECT DISTINCT user_id FROM applications WHERE submitter_name ILIKE '%matt%test%' AND created_at < '2025-12-30 00:00:00' LIMIT 1)
        ) AS user_id
)
SELECT 
    'Matt Test User ID' AS info_type,
    user_id::text AS value
FROM matt_test_user;

-- Step 2: Show all test applications that will be deleted
SELECT 
    a.id,
    a.property_address,
    a.submitter_name,
    a.submitter_email,
    a.application_type,
    a.status,
    a.created_at,
    a.submitted_at,
    p.first_name || ' ' || p.last_name AS profile_name,
    p.email AS profile_email
FROM applications a
LEFT JOIN profiles p ON a.user_id = p.id
WHERE a.user_id IN (
    SELECT COALESCE(
        (SELECT id FROM auth.users WHERE email ILIKE '%matt%test%' OR email ILIKE '%test%matt%' LIMIT 1),
        (SELECT id FROM profiles WHERE (first_name ILIKE '%matt%' AND last_name ILIKE '%test%') OR email ILIKE '%matt%test%' LIMIT 1),
        (SELECT DISTINCT user_id FROM applications WHERE submitter_name ILIKE '%matt%test%' AND created_at < '2025-12-30 00:00:00' LIMIT 1)
    )
)
AND a.created_at < '2025-12-30 00:00:00'
ORDER BY a.created_at DESC;

-- Step 3: Count related records that will be deleted
SELECT 
    'Applications' AS table_name,
    COUNT(*) AS record_count
FROM applications a
WHERE a.user_id IN (
    SELECT COALESCE(
        (SELECT id FROM auth.users WHERE email ILIKE '%matt%test%' OR email ILIKE '%test%matt%' LIMIT 1),
        (SELECT id FROM profiles WHERE (first_name ILIKE '%matt%' AND last_name ILIKE '%test%') OR email ILIKE '%matt%test%' LIMIT 1),
        (SELECT DISTINCT user_id FROM applications WHERE submitter_name ILIKE '%matt%test%' AND created_at < '2025-12-30 00:00:00' LIMIT 1)
    )
)
AND a.created_at < '2025-12-30 00:00:00'

UNION ALL

SELECT 
    'Property Owner Forms' AS table_name,
    COUNT(*) AS record_count
FROM property_owner_forms pof
INNER JOIN applications a ON pof.application_id = a.id
WHERE a.user_id IN (
    SELECT COALESCE(
        (SELECT id FROM auth.users WHERE email ILIKE '%matt%test%' OR email ILIKE '%test%matt%' LIMIT 1),
        (SELECT id FROM profiles WHERE (first_name ILIKE '%matt%' AND last_name ILIKE '%test%') OR email ILIKE '%matt%test%' LIMIT 1),
        (SELECT DISTINCT user_id FROM applications WHERE submitter_name ILIKE '%matt%test%' AND created_at < '2025-12-30 00:00:00' LIMIT 1)
    )
)
AND a.created_at < '2025-12-30 00:00:00'

UNION ALL

SELECT 
    'Notifications' AS table_name,
    COUNT(*) AS record_count
FROM notifications n
INNER JOIN applications a ON n.application_id = a.id
WHERE a.user_id IN (
    SELECT COALESCE(
        (SELECT id FROM auth.users WHERE email ILIKE '%matt%test%' OR email ILIKE '%test%matt%' LIMIT 1),
        (SELECT id FROM profiles WHERE (first_name ILIKE '%matt%' AND last_name ILIKE '%test%') OR email ILIKE '%matt%test%' LIMIT 1),
        (SELECT DISTINCT user_id FROM applications WHERE submitter_name ILIKE '%matt%test%' AND created_at < '2025-12-30 00:00:00' LIMIT 1)
    )
)
AND a.created_at < '2025-12-30 00:00:00'

UNION ALL

SELECT 
    'Application Property Groups' AS table_name,
    COUNT(*) AS record_count
FROM application_property_groups apg
INNER JOIN applications a ON apg.application_id = a.id
WHERE a.user_id IN (
    SELECT COALESCE(
        (SELECT id FROM auth.users WHERE email ILIKE '%matt%test%' OR email ILIKE '%test%matt%' LIMIT 1),
        (SELECT id FROM profiles WHERE (first_name ILIKE '%matt%' AND last_name ILIKE '%test%') OR email ILIKE '%matt%test%' LIMIT 1),
        (SELECT DISTINCT user_id FROM applications WHERE submitter_name ILIKE '%matt%test%' AND created_at < '2025-12-30 00:00:00' LIMIT 1)
    )
)
AND a.created_at < '2025-12-30 00:00:00'

UNION ALL

SELECT 
    'Compliance Inspections' AS table_name,
    COUNT(*) AS record_count
FROM compliance_inspections ci
INNER JOIN applications a ON ci.application_id = a.id
WHERE a.user_id IN (
    SELECT COALESCE(
        (SELECT id FROM auth.users WHERE email ILIKE '%matt%test%' OR email ILIKE '%test%matt%' LIMIT 1),
        (SELECT id FROM profiles WHERE (first_name ILIKE '%matt%' AND last_name ILIKE '%test%') OR email ILIKE '%matt%test%' LIMIT 1),
        (SELECT DISTINCT user_id FROM applications WHERE submitter_name ILIKE '%matt%test%' AND created_at < '2025-12-30 00:00:00' LIMIT 1)
    )
)
AND a.created_at < '2025-12-30 00:00:00';

-- Step 4: Show detailed breakdown of related records
-- Property Owner Forms details
SELECT 
    'Property Owner Forms Detail' AS info_type,
    pof.id,
    pof.form_type,
    pof.status,
    a.id AS application_id,
    a.property_address
FROM property_owner_forms pof
INNER JOIN applications a ON pof.application_id = a.id
WHERE a.user_id IN (
    SELECT COALESCE(
        (SELECT id FROM auth.users WHERE email ILIKE '%matt%test%' OR email ILIKE '%test%matt%' LIMIT 1),
        (SELECT id FROM profiles WHERE (first_name ILIKE '%matt%' AND last_name ILIKE '%test%') OR email ILIKE '%matt%test%' LIMIT 1),
        (SELECT DISTINCT user_id FROM applications WHERE submitter_name ILIKE '%matt%test%' AND created_at < '2025-12-30 00:00:00' LIMIT 1)
    )
)
AND a.created_at < '2025-12-30 00:00:00'
ORDER BY a.id, pof.form_type;

-- Compliance Inspections details
SELECT 
    'Compliance Inspections Detail' AS info_type,
    ci.id,
    ci.inspection_date,
    ci.status,
    a.id AS application_id,
    a.property_address
FROM compliance_inspections ci
INNER JOIN applications a ON ci.application_id = a.id
WHERE a.user_id IN (
    SELECT COALESCE(
        (SELECT id FROM auth.users WHERE email ILIKE '%matt%test%' OR email ILIKE '%test%matt%' LIMIT 1),
        (SELECT id FROM profiles WHERE (first_name ILIKE '%matt%' AND last_name ILIKE '%test%') OR email ILIKE '%matt%test%' LIMIT 1),
        (SELECT DISTINCT user_id FROM applications WHERE submitter_name ILIKE '%matt%test%' AND created_at < '2025-12-30 00:00:00' LIMIT 1)
    )
)
AND a.created_at < '2025-12-30 00:00:00'
ORDER BY a.id, ci.inspection_date;

