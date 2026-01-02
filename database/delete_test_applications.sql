-- ============================================================================
-- DELETE TEST APPLICATIONS SCRIPT
-- ============================================================================
-- This script deletes all test applications created by "Matt Test" account
-- before December 30, 2025, along with all related records.
--
-- WARNING: This is a production database operation. Review carefully before executing.
--
-- IMPORTANT NOTES:
-- 1. This script deletes records from the following tables:
--    - property_owner_forms (explicitly deleted)
--    - application_property_groups (explicitly deleted, though has CASCADE)
--    - compliance_inspections (explicitly deleted)
--    - notifications (explicitly deleted, though has CASCADE)
--    - applications (parent table)
--
-- 2. Storage files (PDFs, documents) in Supabase storage are NOT automatically
--    deleted by this script. File paths stored in the applications table will
--    be removed, but the actual files in storage buckets will remain.
--    You may want to manually clean up storage files after running this script.
--
-- 3. Run preview_test_applications_deletion.sql FIRST to see what will be deleted.
-- ============================================================================

-- Step 1: Identify the user_id for "Matt Test"
-- First, let's find the user account
DO $$
DECLARE
    matt_test_user_id UUID;
    test_app_count INTEGER;
    forms_count INTEGER;
    notifications_count INTEGER;
    property_groups_count INTEGER;
    compliance_inspections_count INTEGER;
BEGIN
    -- Find the user_id for "Matt Test"
    SELECT id INTO matt_test_user_id
    FROM auth.users
    WHERE email ILIKE '%matt%test%' OR email ILIKE '%test%matt%'
    LIMIT 1;
    
    -- Also check profiles table
    IF matt_test_user_id IS NULL THEN
        SELECT id INTO matt_test_user_id
        FROM profiles
        WHERE (first_name ILIKE '%matt%' AND last_name ILIKE '%test%')
           OR (first_name ILIKE '%test%' AND last_name ILIKE '%matt%')
           OR email ILIKE '%matt%test%'
        LIMIT 1;
    END IF;
    
    -- If still not found, try to find by submitter_name in applications
    IF matt_test_user_id IS NULL THEN
        SELECT DISTINCT user_id INTO matt_test_user_id
        FROM applications
        WHERE submitter_name ILIKE '%matt%test%'
           AND created_at < '2025-12-30 00:00:00'
        LIMIT 1;
    END IF;
    
    -- If user_id found, use it; otherwise delete by submitter_name
    IF matt_test_user_id IS NOT NULL THEN
        RAISE NOTICE 'Found Matt Test user_id: %', matt_test_user_id;
        
        -- Step 2: Count what will be deleted (for verification)
        SELECT COUNT(*) INTO test_app_count
        FROM applications
        WHERE user_id = matt_test_user_id
          AND created_at < '2025-12-30 00:00:00';
        
        SELECT COUNT(*) INTO forms_count
        FROM property_owner_forms pof
        INNER JOIN applications a ON pof.application_id = a.id
        WHERE a.user_id = matt_test_user_id
          AND a.created_at < '2025-12-30 00:00:00';
        
        SELECT COUNT(*) INTO notifications_count
        FROM notifications n
        INNER JOIN applications a ON n.application_id = a.id
        WHERE a.user_id = matt_test_user_id
          AND a.created_at < '2025-12-30 00:00:00';
        
        SELECT COUNT(*) INTO property_groups_count
        FROM application_property_groups apg
        INNER JOIN applications a ON apg.application_id = a.id
        WHERE a.user_id = matt_test_user_id
          AND a.created_at < '2025-12-30 00:00:00';
        
        SELECT COUNT(*) INTO compliance_inspections_count
        FROM compliance_inspections ci
        INNER JOIN applications a ON ci.application_id = a.id
        WHERE a.user_id = matt_test_user_id
          AND a.created_at < '2025-12-30 00:00:00';
        
        RAISE NOTICE '========================================';
        RAISE NOTICE 'DELETION SUMMARY:';
        RAISE NOTICE 'Applications to delete: %', test_app_count;
        RAISE NOTICE 'Property Owner Forms to delete: %', forms_count;
        RAISE NOTICE 'Notifications to delete: %', notifications_count;
        RAISE NOTICE 'Property Groups to delete: %', property_groups_count;
        RAISE NOTICE 'Compliance Inspections to delete: %', compliance_inspections_count;
        RAISE NOTICE '========================================';
        
        -- Step 3: Delete in correct order (child tables first, then parent)
        
        -- Delete property_owner_forms first (child of applications and property_groups)
        DELETE FROM property_owner_forms
        WHERE application_id IN (
            SELECT id FROM applications
            WHERE user_id = matt_test_user_id
              AND created_at < '2025-12-30 00:00:00'
        );
        
        RAISE NOTICE 'Deleted property_owner_forms records';
        
        -- Delete application_property_groups (has CASCADE but being explicit)
        DELETE FROM application_property_groups
        WHERE application_id IN (
            SELECT id FROM applications
            WHERE user_id = matt_test_user_id
              AND created_at < '2025-12-30 00:00:00'
        );
        
        RAISE NOTICE 'Deleted application_property_groups records';
        
        -- Delete compliance_inspections
        DELETE FROM compliance_inspections
        WHERE application_id IN (
            SELECT id FROM applications
            WHERE user_id = matt_test_user_id
              AND created_at < '2025-12-30 00:00:00'
        );
        
        RAISE NOTICE 'Deleted compliance_inspections records';
        
        -- Delete notifications (has CASCADE but being explicit)
        DELETE FROM notifications
        WHERE application_id IN (
            SELECT id FROM applications
            WHERE user_id = matt_test_user_id
              AND created_at < '2025-12-30 00:00:00'
        );
        
        RAISE NOTICE 'Deleted notifications records';
        
        -- Finally, delete the applications themselves
        DELETE FROM applications
        WHERE user_id = matt_test_user_id
          AND created_at < '2025-12-30 00:00:00';
        
        RAISE NOTICE 'Deleted applications records';
    ELSE
        -- User ID not found, delete by submitter_name instead
        -- This handles cases where the user account might have been deleted
        RAISE NOTICE 'User ID not found. Will delete by submitter_name instead.';
        
        -- Count what will be deleted by submitter_name
        SELECT COUNT(*) INTO test_app_count
        FROM applications
        WHERE submitter_name ILIKE '%matt%test%'
          AND created_at < '2025-12-30 00:00:00';
        
        SELECT COUNT(*) INTO forms_count
        FROM property_owner_forms pof
        INNER JOIN applications a ON pof.application_id = a.id
        WHERE a.submitter_name ILIKE '%matt%test%'
          AND a.created_at < '2025-12-30 00:00:00';
        
        SELECT COUNT(*) INTO notifications_count
        FROM notifications n
        INNER JOIN applications a ON n.application_id = a.id
        WHERE a.submitter_name ILIKE '%matt%test%'
          AND a.created_at < '2025-12-30 00:00:00';
        
        SELECT COUNT(*) INTO property_groups_count
        FROM application_property_groups apg
        INNER JOIN applications a ON apg.application_id = a.id
        WHERE a.submitter_name ILIKE '%matt%test%'
          AND a.created_at < '2025-12-30 00:00:00';
        
        SELECT COUNT(*) INTO compliance_inspections_count
        FROM compliance_inspections ci
        INNER JOIN applications a ON ci.application_id = a.id
        WHERE a.submitter_name ILIKE '%matt%test%'
          AND a.created_at < '2025-12-30 00:00:00';
        
        RAISE NOTICE '========================================';
        RAISE NOTICE 'DELETION SUMMARY (by submitter_name):';
        RAISE NOTICE 'Applications to delete: %', test_app_count;
        RAISE NOTICE 'Property Owner Forms to delete: %', forms_count;
        RAISE NOTICE 'Notifications to delete: %', notifications_count;
        RAISE NOTICE 'Property Groups to delete: %', property_groups_count;
        RAISE NOTICE 'Compliance Inspections to delete: %', compliance_inspections_count;
        RAISE NOTICE '========================================';
        
        -- Delete by submitter_name
        DELETE FROM property_owner_forms
        WHERE application_id IN (
            SELECT id FROM applications
            WHERE submitter_name ILIKE '%matt%test%'
              AND created_at < '2025-12-30 00:00:00'
        );
        
        RAISE NOTICE 'Deleted property_owner_forms records';
        
        DELETE FROM application_property_groups
        WHERE application_id IN (
            SELECT id FROM applications
            WHERE submitter_name ILIKE '%matt%test%'
              AND created_at < '2025-12-30 00:00:00'
        );
        
        RAISE NOTICE 'Deleted application_property_groups records';
        
        DELETE FROM compliance_inspections
        WHERE application_id IN (
            SELECT id FROM applications
            WHERE submitter_name ILIKE '%matt%test%'
              AND created_at < '2025-12-30 00:00:00'
        );
        
        RAISE NOTICE 'Deleted compliance_inspections records';
        
        DELETE FROM notifications
        WHERE application_id IN (
            SELECT id FROM applications
            WHERE submitter_name ILIKE '%matt%test%'
              AND created_at < '2025-12-30 00:00:00'
        );
        
        RAISE NOTICE 'Deleted notifications records';
        
        DELETE FROM applications
        WHERE submitter_name ILIKE '%matt%test%'
          AND created_at < '2025-12-30 00:00:00';
        
        RAISE NOTICE 'Deleted applications records';
    END IF;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DELETION COMPLETE';
    RAISE NOTICE '========================================';
    
END $$;

-- ============================================================================
-- VERIFICATION QUERIES (Run these separately to verify deletion)
-- ============================================================================

-- Check if any test applications remain
-- SELECT COUNT(*) as remaining_test_apps
-- FROM applications a
-- INNER JOIN profiles p ON a.user_id = p.user_id
-- WHERE (p.first_name ILIKE '%matt%' AND p.last_name ILIKE '%test%')
--    OR a.submitter_name ILIKE '%matt%test%'
--    AND a.created_at < '2025-12-30 00:00:00';

-- Check for orphaned records (should return 0)
-- SELECT COUNT(*) as orphaned_forms
-- FROM property_owner_forms pof
-- LEFT JOIN applications a ON pof.application_id = a.id
-- WHERE a.id IS NULL;

-- SELECT COUNT(*) as orphaned_notifications
-- FROM notifications n
-- LEFT JOIN applications a ON n.application_id = a.id
-- WHERE a.id IS NULL;

-- SELECT COUNT(*) as orphaned_property_groups
-- FROM application_property_groups apg
-- LEFT JOIN applications a ON apg.application_id = a.id
-- WHERE a.id IS NULL;

-- SELECT COUNT(*) as orphaned_compliance_inspections
-- FROM compliance_inspections ci
-- LEFT JOIN applications a ON ci.application_id = a.id
-- WHERE a.id IS NULL;

