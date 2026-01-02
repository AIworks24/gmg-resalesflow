-- Fix for duplicate profile creation issue
-- This creates a function that safely handles profile creation/updates
-- Use this if you have a trigger or need to handle existing profiles gracefully

-- ============================================
-- OPTION 1: Create a safe profile creation function
-- ============================================
-- This function will INSERT if profile doesn't exist, or UPDATE if it does
CREATE OR REPLACE FUNCTION handle_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert or update profile when user is created
    INSERT INTO public.profiles (
        id,
        email,
        role,
        active,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        'requester', -- Default role
        true,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        updated_at = NOW(),
        active = COALESCE(profiles.active, true)
    WHERE profiles.email IS DISTINCT FROM EXCLUDED.email;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- OPTION 2: Alternative - Use UPSERT in application code
-- ============================================
-- Instead of using a trigger, you can modify your application code to use:
-- 
-- INSERT INTO profiles (id, email, role, ...)
-- VALUES (...)
-- ON CONFLICT (id) DO UPDATE
-- SET email = EXCLUDED.email, updated_at = NOW();

-- ============================================
-- OPTION 3: Clean up orphaned profiles
-- ============================================
-- If you have orphaned profiles (profiles without auth users), clean them up:
-- 
-- DELETE FROM profiles
-- WHERE id NOT IN (SELECT id FROM auth.users);

-- ============================================
-- OPTION 4: Check and remove auto-create trigger if it exists
-- ============================================
-- If there's a trigger causing this, you can remove it:
-- 
-- DROP TRIGGER IF EXISTS handle_new_user ON auth.users;
-- 
-- Then recreate it with the safe function above:
-- CREATE TRIGGER handle_new_user
--     AFTER INSERT ON auth.users
--     FOR EACH ROW
--     EXECUTE FUNCTION handle_user_profile();

-- ============================================
-- VERIFICATION
-- ============================================
-- Run this to check if the function was created:
SELECT 
    'Function created' AS status,
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'handle_user_profile';





