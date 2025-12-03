const { createClient } = require('@supabase/supabase-js');
const { generateMultiCommunityDocuments } = require('./settlementPdfService');
const { sendPropertyManagerNotificationEmail } = require('./emailService');
const { parseEmails } = require('./emailUtils');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Creates property groups for a multi-community application
 * @param {number} applicationId - The application ID
 * @param {Object} primaryProperty - The primary property object
 * @param {Array} linkedProperties - Array of linked property objects
 * @returns {Promise<Array>} Array of created property groups
 */
async function createPropertyGroups(applicationId, primaryProperty, linkedProperties) {
  try {
    // Validate primary property
    if (!primaryProperty || !primaryProperty.id) {
      throw new Error(`Primary property not found or invalid`);
    }

    // Create groups array starting with primary property
    const groups = [
      {
        application_id: applicationId,
        property_id: primaryProperty.id,
        property_name: primaryProperty.name,
        property_location: primaryProperty.location,
        property_owner_email: primaryProperty.property_owner_email,
        is_primary: true,
        status: 'pending'
      }
    ];

    // Add linked properties
    for (const linkedProp of linkedProperties) {
      groups.push({
        application_id: applicationId,
        property_id: linkedProp.linked_property_id,
        property_name: linkedProp.property_name,
        property_location: linkedProp.location,
        property_owner_email: linkedProp.property_owner_email,
        is_primary: false,
        status: 'pending'
      });
    }

    // Insert all groups
    const { data: createdGroups, error: insertError } = await supabase
      .from('application_property_groups')
      .insert(groups)
      .select();

    if (insertError) {
      throw new Error(`Failed to create property groups: ${insertError.message}`);
    }

    console.log(`Created ${createdGroups.length} property groups for application ${applicationId}`);
    return createdGroups;

  } catch (error) {
    console.error('Error creating property groups:', error);
    throw error;
  }
}

/**
 * Generates documents for all property groups in an application
 * @param {number} applicationId - The application ID
 * @param {Object} applicationData - The application data
 * @returns {Promise<Object>} Results of document generation
 */
async function generateDocumentsForAllGroups(applicationId, applicationData) {
  try {
    // Get all property groups for this application
    const { data: groups, error: groupsError } = await supabase
      .from('application_property_groups')
      .select('*')
      .eq('application_id', applicationId)
      .order('is_primary', { ascending: false }); // Primary first

    if (groupsError) {
      throw new Error(`Failed to fetch property groups: ${groupsError.message}`);
    }

    if (!groups || groups.length === 0) {
      throw new Error(`No property groups found for application ${applicationId}`);
    }

    const results = {
      success: true,
      groups: [],
      errors: []
    };

    // Generate documents for each group
    for (const group of groups) {
      try {
        console.log(`Generating documents for group: ${group.property_name}`);
        
        // Create a copy of application data with property-specific info
        const groupApplicationData = {
          ...applicationData,
          hoaProperty: group.property_name,
          propertyId: group.property_id,
          propertyOwnerEmail: group.property_owner_email
        };

        // Generate documents for this property group
        const docResult = await generateMultiCommunityDocuments(
          groupApplicationData,
          group.property_id
        );

        // Update group status to completed
        await supabase
          .from('application_property_groups')
          .update({ 
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', group.id);

        results.groups.push({
          groupId: group.id,
          propertyName: group.property_name,
          status: 'completed',
          documents: docResult
        });

        console.log(`Successfully generated documents for ${group.property_name}`);

      } catch (groupError) {
        console.error(`Error generating documents for group ${group.property_name}:`, groupError);
        
        // Update group status to failed
        await supabase
          .from('application_property_groups')
          .update({ 
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', group.id);

        results.groups.push({
          groupId: group.id,
          propertyName: group.property_name,
          status: 'failed',
          error: groupError.message
        });

        results.errors.push({
          groupId: group.id,
          propertyName: group.property_name,
          error: groupError.message
        });
      }
    }

    // Send notification emails to property managers
    await sendNotificationEmailsToPropertyManagers(groups, applicationData);

    return results;

  } catch (error) {
    console.error('Error generating documents for all groups:', error);
    throw error;
  }
}

/**
 * Sends notification emails to property managers for each group
 * @param {Array} groups - Array of property groups
 * @param {Object} applicationData - The application data
 */
async function sendNotificationEmailsToPropertyManagers(groups, applicationData) {
  try {
    // Group by property manager email to avoid duplicate emails
    // Support multiple emails per property (comma-separated)
    const managerGroups = {};
    const allEmails = new Set(); // Track all unique emails to avoid duplicates
    
    for (const group of groups) {
      if (group.property_owner_email) {
        // Parse emails (handles both single email string and comma-separated string)
        const emails = parseEmails(group.property_owner_email);
        
        for (const email of emails) {
          // Remove "owner." prefix if present
          const cleanEmail = email.replace(/^owner\./, '');
          
          if (!managerGroups[cleanEmail]) {
            managerGroups[cleanEmail] = [];
          }
          managerGroups[cleanEmail].push(group);
          allEmails.add(cleanEmail);
        }
      }
    }

    // Send email to each unique property manager
    for (const email of allEmails) {
      try {
        const groupsForEmail = managerGroups[email];
        await sendPropertyManagerNotificationEmail(
          email,
          applicationData,
          groupsForEmail,
          applicationData.packageType === 'rush'
        );
        console.log(`Sent notification email to property manager: ${email}`);
      } catch (emailError) {
        console.error(`Failed to send email to ${email}:`, emailError);
      }
    }

  } catch (error) {
    console.error('Error sending notification emails:', error);
    // Don't throw - email failures shouldn't break the main flow
  }
}

/**
 * Gets all property groups for an application
 * @param {number} applicationId - The application ID
 * @returns {Promise<Array>} Array of property groups
 */
async function getPropertyGroups(applicationId) {
  try {
    const { data: groups, error } = await supabase
      .from('application_property_groups')
      .select('*')
      .eq('application_id', applicationId)
      .order('is_primary', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch property groups: ${error.message}`);
    }

    return groups || [];

  } catch (error) {
    console.error('Error fetching property groups:', error);
    throw error;
  }
}

/**
 * Updates the status of a specific property group
 * @param {number} groupId - The group ID
 * @param {string} status - The new status
 * @returns {Promise<Object>} Updated group data
 */
async function updateGroupStatus(groupId, status) {
  try {
    const { data, error } = await supabase
      .from('application_property_groups')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', groupId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update group status: ${error.message}`);
    }

    return data;

  } catch (error) {
    console.error('Error updating group status:', error);
    throw error;
  }
}

module.exports = {
  createPropertyGroups,
  generateDocumentsForAllGroups,
  getPropertyGroups,
  updateGroupStatus
};