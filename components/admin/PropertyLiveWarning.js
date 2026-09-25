import React, { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { AlertTriangle, EyeOff, RefreshCw } from 'lucide-react';
import { countPropertyApplications } from '../../lib/propertyStatus';

/**
 * Shown on screens that change a property's files or configuration (Documents, Link, Edit).
 * While the property is published, requesters can order it and document emails go out, so
 * admins are nudged to move it to Draft before making changes. Renders nothing for drafts.
 */
export default function PropertyLiveWarning({ property, isAdmin, onStatusChanged, className = '' }) {
  const supabase = createClientComponentClient();
  const [confirming, setConfirming] = useState(false);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState('');

  if (!property || property.status !== 'published' || property.deleted_at) return null;

  const openConfirm = async () => {
    setError('');
    try {
      const { inProgress } = await countPropertyApplications(supabase, property.id);
      setInProgressCount(inProgress);
    } catch (err) {
      console.error('Error checking related applications:', err);
      setInProgressCount(0);
    }
    setConfirming(true);
  };

  const moveToDraft = async () => {
    if (isMoving) return;
    setIsMoving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/set-property-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: property.id, status: 'draft' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to move property to Draft');
      setConfirming(false);
      onStatusChanged?.(result.property);
    } catch (err) {
      console.error('Error moving property to Draft:', err);
      setError(err.message || 'Failed to move property to Draft');
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <>
      <div className={`flex flex-col sm:flex-row sm:items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 ${className}`}>
        <AlertTriangle className='w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5' />
        <div className='flex-1 text-sm'>
          <p className='font-semibold'>This property is live.</p>
          <p className='mt-0.5'>
            Requesters can order it and document emails are being sent.{' '}
            {isAdmin
              ? 'If you’re about to change its documents or settings, move it to Draft first so nobody orders or receives documents mid-update. Publish it again when you’re done.'
              : 'If you’re about to change its documents or settings, ask an admin to move it to Draft first.'}
          </p>
          {error && <p className='mt-1 text-red-700'>{error}</p>}
        </div>
        {isAdmin && (
          <button
            type='button'
            onClick={openConfirm}
            className='inline-flex items-center justify-center gap-1.5 self-start px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 whitespace-nowrap'
          >
            <EyeOff className='w-4 h-4' />
            Move to Draft
          </button>
        )}
      </div>

      {confirming && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]'>
          <div className='bg-white rounded-lg max-w-md w-full p-6'>
            <div className='flex items-center gap-3 mb-4'>
              <EyeOff className='w-6 h-6 text-amber-600' />
              <h2 className='text-lg font-semibold'>Move to Draft</h2>
            </div>
            <div className='text-gray-700 mb-6 space-y-2'>
              <p>
                Move <strong>&quot;{property.name}&quot;</strong> to Draft? Requesters will no longer see it (including
                multi-community properties it is linked to), and document emails for its existing applications will be
                paused until it is published again.
              </p>
              {inProgressCount > 0 && (
                <p className='text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2'>
                  {inProgressCount} open application(s) will have document emails paused.
                </p>
              )}
            </div>
            <div className='flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => { if (!isMoving) setConfirming(false); }}
                disabled={isMoving}
                className='px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={moveToDraft}
                disabled={isMoving}
                className='px-4 py-2 text-white rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2'
              >
                {isMoving && <RefreshCw className='w-4 h-4 animate-spin' />}
                {isMoving ? 'Moving...' : 'Move to Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
