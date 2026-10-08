/**
 * Per-application "Additional Files" attached to the completion email.
 *
 * Single-property applications keep files at application_attachments/{applicationId}.
 * Multi-community applications keep each property's files in a sub-folder named after
 * its application_property_groups id, so one property's files never ride along in
 * another property's email.
 */

export function attachmentFolder(applicationId, propertyGroupId = null) {
  const base = `application_attachments/${applicationId}`;
  return propertyGroupId ? `${base}/${propertyGroupId}` : base;
}

/**
 * List the files in one attachment folder with signed URLs.
 * `name` drops the upload timestamp prefix; `originalName` is the stored name, needed to delete.
 */
export async function listAttachments(supabase, applicationId, propertyGroupId, expirySeconds) {
  const folder = attachmentFolder(applicationId, propertyGroupId);
  const bucket = supabase.storage.from('bucket0');

  const { data, error } = await bucket.list(folder, { limit: 100, offset: 0 });
  if (error) {
    console.error('Error listing attachments:', error);
    return [];
  }

  // Sub-folders (a multi-community property's files) come back as entries with a null id.
  const files = (data || []).filter((entry) => entry.id !== null);

  return Promise.all(files.map(async (file) => {
    const { data: urlData } = await bucket.createSignedUrl(`${folder}/${file.name}`, expirySeconds);
    return {
      name: file.name.replace(/^\d+_/, ''),
      originalName: file.name,
      size: file.metadata?.size || 0,
      type: file.metadata?.mimetype || 'application/octet-stream',
      url: urlData?.signedUrl,
    };
  }));
}

/**
 * Email download links for the files uploaded to this application (or, for multi-community,
 * this property within it).
 */
export async function buildAttachmentDownloadLinks(supabase, applicationId, propertyGroupId, expirySeconds) {
  const files = await listAttachments(supabase, applicationId, propertyGroupId, expirySeconds);
  return files
    .filter((file) => file.url)
    .map((file) => ({
      filename: file.name,
      downloadUrl: file.url,
      type: 'document',
      description: 'Additional Document',
      size: file.size || 'Unknown',
    }));
}
