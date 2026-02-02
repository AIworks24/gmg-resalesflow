import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { formatEmailsForStorage, validateEmails } from '../../lib/emailUtils';
import { resolveActingUser } from '../../lib/impersonation';
import { logApplicationUpdate } from '../../lib/auditLog';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });
    const identity = await resolveActingUser(req, res);

    if (!identity.authenticated || !identity.actingUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { 
      applicationId, 
      submitter_name, 
      property_address, 
      submitter_email,
      submitter_phone,
      buyer_name,
      buyer_email,
      seller_email,
      sale_price,
      closing_date
    } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('user_id')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const isOwner = application.user_id === identity.actingUserId;
    const isAdminOrStaff = !identity.isImpersonating && (identity.effectiveRole === 'admin' || identity.effectiveRole === 'staff' || identity.effectiveRole === 'accounting');

    if (!isOwner && !isAdminOrStaff) {
      return res.status(403).json({ error: 'Forbidden. You can only update your own applications.' });
    }

    // Build update object with only provided fields
    const updateData = {
      updated_at: new Date().toISOString(),
    };

    // Validate and add submitter_name if provided
    if (submitter_name !== undefined) {
      if (!submitter_name || submitter_name.trim() === '') {
        return res.status(400).json({ error: 'Submitter name cannot be empty' });
      }
      updateData.submitter_name = submitter_name.trim();
    }

    // Validate and add property_address if provided
    if (property_address !== undefined) {
      if (!property_address || property_address.trim() === '') {
        return res.status(400).json({ error: 'Property address cannot be empty' });
      }
      updateData.property_address = property_address.trim();
    }

    // Validate and add submitter_email if provided
    if (submitter_email !== undefined) {
      if (!submitter_email || submitter_email.trim() === '') {
        return res.status(400).json({ error: 'Submitter email cannot be empty' });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(submitter_email.trim())) {
        return res.status(400).json({ error: 'Invalid submitter email format' });
      }
      updateData.submitter_email = submitter_email.trim();
    }

    // Validate and add submitter_phone if provided
    if (submitter_phone !== undefined) {
      // Phone is optional, allow empty string or null
      if (submitter_phone && submitter_phone.trim() !== '') {
        updateData.submitter_phone = submitter_phone.trim();
      } else {
        // Allow clearing phone
        updateData.submitter_phone = null;
      }
    }

    // Validate and add buyer_email if provided (can be array or comma-separated string)
    // Buyer email is optional - allow empty/null
    if (buyer_email !== undefined) {
      let buyerEmailsArray = [];
      if (Array.isArray(buyer_email)) {
        buyerEmailsArray = buyer_email.filter(e => e && e.trim());
      } else if (typeof buyer_email === 'string') {
        buyerEmailsArray = buyer_email.split(',').map(e => e.trim()).filter(e => e);
      }

      if (buyerEmailsArray.length === 0) {
        // Allow clearing buyer email (optional field)
        updateData.buyer_email = null;
      } else {
        // Validate emails if provided
        const emailValidation = validateEmails(buyerEmailsArray);
        if (!emailValidation.valid) {
          return res.status(400).json({ 
            error: 'Invalid buyer email(s): ' + emailValidation.errors.join(', ') 
          });
        }

        updateData.buyer_email = formatEmailsForStorage(buyerEmailsArray);
      }
    }

    // Validate and add seller_email if provided
    if (seller_email !== undefined) {
      if (seller_email && seller_email.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(seller_email.trim())) {
          return res.status(400).json({ error: 'Invalid seller email format' });
        }
        updateData.seller_email = seller_email.trim();
      } else {
        // Allow clearing seller email
        updateData.seller_email = null;
      }
    }

    // Validate and add buyer_name if provided (optional)
    // Only update if it has a value - if empty/null, only update if migration has been applied
    // To be safe, we'll only include buyer_name in update if it has a value
    // If it's empty, we'll skip updating it (preserves existing value) to avoid constraint errors
    if (buyer_name !== undefined) {
      if (buyer_name && buyer_name.trim() !== '') {
        updateData.buyer_name = buyer_name.trim();
      }
      // If buyer_name is empty/null, we skip updating it to avoid NOT NULL constraint errors
      // This is safe because:
      // 1. If migration was applied, we could set to null, but skipping is also fine
      // 2. If migration wasn't applied, skipping prevents the constraint error
      // The existing value in the database will be preserved
    }

    // Validate and add sale_price if provided
    if (sale_price !== undefined) {
      if (sale_price === '' || sale_price === null) {
        // Allow clearing sale price
        updateData.sale_price = null;
      } else {
        const price = parseFloat(sale_price);
        if (isNaN(price) || price < 0) {
          return res.status(400).json({ error: 'Invalid sale price. Must be a positive number.' });
        }
        updateData.sale_price = price;
      }
    }

    // Validate and add closing_date if provided
    if (closing_date !== undefined) {
      if (closing_date === '' || closing_date === null) {
        // Allow clearing closing date
        updateData.closing_date = null;
      } else {
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(closing_date)) {
          return res.status(400).json({ error: 'Invalid closing date format. Use YYYY-MM-DD format.' });
        }
        // Validate it's a valid date
        const date = new Date(closing_date);
        if (isNaN(date.getTime())) {
          return res.status(400).json({ error: 'Invalid closing date' });
        }
        updateData.closing_date = closing_date;
      }
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 1) {
      // Only updated_at was set
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Update the application (explicitly prevent hoa_property_id from being updated)
    const { data: updatedApplication, error: updateError } = await supabase
      .from('applications')
      .update(updateData)
      .eq('id', applicationId)
      .select();

    if (updateError) {
      throw updateError;
    }

    if (!updatedApplication || updatedApplication.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (identity.isImpersonating) {
      logApplicationUpdate({
        adminUserId: identity.adminUserId,
        actingUserId: identity.actingUserId,
        applicationId,
        changes: updateData,
        isImpersonating: true,
        req,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Application details updated successfully',
      application: updatedApplication[0],
    });
  } catch (error) {
    console.error('Error updating application details:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
