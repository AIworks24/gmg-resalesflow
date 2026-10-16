import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Mail, X } from 'lucide-react';
import { formatSentAt, getDocumentEmailRecipients } from '../../lib/emailResendGuard';

/**
 * Asks before re-sending a document email that was already sent (ClickUp 14ypaj0jz6v).
 *
 *   const { confirmResend, resendConfirmModal } = useResendConfirm();
 *   const { proceed, resend } = await confirmResend(sentAt, application);
 *
 * Only await it when `sentAt` is set; for a first send use SEND_WITHOUT_CONFIRM directly so the
 * caller's "sending" state is set synchronously in the click (a fast double-click can't slip a
 * second request in before the button disables). Render `resendConfirmModal` once in the JSX.
 */
export const SEND_WITHOUT_CONFIRM = Object.freeze({ proceed: true, resend: false });

export function useResendConfirm() {
  const [pending, setPending] = useState(null);

  const confirmResend = useCallback((sentAt, application) => {
    if (!sentAt) return Promise.resolve(SEND_WITHOUT_CONFIRM);
    return new Promise((resolve) => {
      setPending({ sentAt, recipients: getDocumentEmailRecipients(application), resolve });
    });
  }, []);

  const close = useCallback((confirmed) => {
    setPending((current) => {
      current?.resolve({ proceed: confirmed, resend: confirmed });
      return null;
    });
  }, []);

  const resendConfirmModal = pending ? (
    <ResendConfirmModal
      sentAt={pending.sentAt}
      recipients={pending.recipients}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null;

  return { confirmResend, resendConfirmModal };
}

function ResendConfirmModal({ sentAt, recipients, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Cancel is focused so a stray Enter never re-sends; Escape cancels
  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[85]'
      onClick={onCancel}
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby='resend-confirm-title'
        className='bg-white rounded-lg shadow-xl max-w-md w-full'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='p-5 flex items-start gap-3'>
          <div className='flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center'>
            <AlertTriangle className='w-5 h-5 text-amber-600' />
          </div>
          <div className='flex-1 min-w-0'>
            <h2 id='resend-confirm-title' className='text-lg font-semibold text-gray-900'>
              Resend this email?
            </h2>
            <p className='text-sm text-gray-500 mt-0.5'>It looks like this was already sent.</p>
          </div>
          <button
            type='button'
            onClick={onCancel}
            aria-label='Close'
            className='text-gray-400 hover:text-gray-600'
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        <div className='px-5'>
          <dl className='rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm space-y-2'>
            <div className='flex gap-3'>
              <dt className='w-28 flex-shrink-0 text-gray-500'>Last completed</dt>
              <dd className='text-gray-900'>
                {formatSentAt(sentAt)}
                <span className='block text-xs text-gray-500'>(sent or marked done)</span>
              </dd>
            </div>
            <div className='flex gap-3'>
              <dt className='w-28 flex-shrink-0 text-gray-500'>To</dt>
              <dd className='text-gray-900 break-all'>{recipients.to || '—'}</dd>
            </div>
            {recipients.cc.length > 0 && (
              <div className='flex gap-3'>
                <dt className='w-28 flex-shrink-0 text-gray-500'>CC</dt>
                <dd className='text-gray-900 break-all'>{recipients.cc.join(', ')}</dd>
              </div>
            )}
          </dl>
          <p className='text-sm text-gray-600 mt-3'>
            The requester will receive another copy of the documents.
          </p>
        </div>

        <div className='p-5 flex justify-end gap-2'>
          <button
            ref={cancelRef}
            type='button'
            onClick={onCancel}
            className='px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium'
          >
            Cancel
          </button>
          <button
            type='button'
            onClick={onConfirm}
            className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm'
          >
            <Mail className='w-4 h-4' />
            Resend Email
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResendConfirmModal;
