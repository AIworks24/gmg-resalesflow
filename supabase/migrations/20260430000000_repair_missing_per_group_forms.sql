-- Data repair: create missing per-group property_owner_forms for multi-community
-- applications 1450, 1497, 1498, 1518 whose per-group forms were never created
-- because PDF generation failed in the Stripe webhook before createPropertyOwnerFormsForGroups
-- could run. Each new per-group form is seeded from the existing ungrouped form data so
-- admins see their previous work and the resale certificate flow is unblocked.

DO $$
DECLARE
  app_id_val    INT;
  group_record  RECORD;
  ungrouped_resale     RECORD;
  ungrouped_inspection RECORD;
BEGIN
  FOREACH app_id_val IN ARRAY ARRAY[1450, 1497, 1498, 1518]
  LOOP
    -- Fetch the ungrouped (trigger-created) resale form for this application
    SELECT form_data, response_data, recipient_email
    INTO ungrouped_resale
    FROM property_owner_forms
    WHERE application_id = app_id_val
      AND form_type = 'resale_certificate'
      AND property_group_id IS NULL
    ORDER BY id DESC
    LIMIT 1;

    -- Fetch the ungrouped inspection form for this application
    SELECT form_data, response_data, recipient_email
    INTO ungrouped_inspection
    FROM property_owner_forms
    WHERE application_id = app_id_val
      AND form_type = 'inspection_form'
      AND property_group_id IS NULL
    ORDER BY id DESC
    LIMIT 1;

    -- For every property group that belongs to this application, create both
    -- form types if they don't already exist with that property_group_id.
    FOR group_record IN
      SELECT id
      FROM application_property_groups
      WHERE application_id = app_id_val
    LOOP
      INSERT INTO property_owner_forms
        (application_id, form_type, status, property_group_id,
         access_token, recipient_email, expires_at,
         form_data, response_data, created_at)
      SELECT
        app_id_val,
        'resale_certificate',
        CASE WHEN ungrouped_resale.response_data IS NOT NULL THEN 'in_progress' ELSE 'not_started' END,
        group_record.id,
        gen_random_uuid()::text,
        COALESCE(ungrouped_resale.recipient_email, 'admin@gmgva.com'),
        NOW() + INTERVAL '30 days',
        ungrouped_resale.form_data,
        ungrouped_resale.response_data,
        NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM property_owner_forms
        WHERE application_id = app_id_val
          AND form_type = 'resale_certificate'
          AND property_group_id = group_record.id
      );

      INSERT INTO property_owner_forms
        (application_id, form_type, status, property_group_id,
         access_token, recipient_email, expires_at,
         form_data, response_data, created_at)
      SELECT
        app_id_val,
        'inspection_form',
        CASE WHEN ungrouped_inspection.response_data IS NOT NULL THEN 'in_progress' ELSE 'not_started' END,
        group_record.id,
        gen_random_uuid()::text,
        COALESCE(ungrouped_inspection.recipient_email, 'admin@gmgva.com'),
        NOW() + INTERVAL '30 days',
        ungrouped_inspection.form_data,
        ungrouped_inspection.response_data,
        NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM property_owner_forms
        WHERE application_id = app_id_val
          AND form_type = 'inspection_form'
          AND property_group_id = group_record.id
      );
    END LOOP;
  END LOOP;
END $$;
