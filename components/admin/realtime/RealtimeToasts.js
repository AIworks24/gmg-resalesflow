import React from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { EVENT_TYPES } from '../../../lib/realtime/events';

function toastCopy(event) {
  const actor = event.actorName || 'Another admin';
  const property = event.propertyName || 'this property';

  if (event.type === EVENT_TYPES.PROPERTY_STATUS_CHANGED && event.status === 'draft') {
    return {
      tone: 'draft',
      title: `${actor} moved ${property} to Draft.`,
      body: 'Document emails for its applications are paused until it’s published again.',
    };
  }
  return {
    tone: 'published',
    title: `${actor} published ${property}.`,
    body: 'Document emails can be sent again.',
  };
}

const TONES = {
  draft: { box: 'bg-amber-50 border-amber-300 text-amber-900', icon: <EyeOff className='w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5' /> },
  published: { box: 'bg-emerald-50 border-emerald-300 text-emerald-900', icon: <Eye className='w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5' /> },
};

/** Top-level, sticky (dismiss-only) notifications for realtime admin events. */
export default function RealtimeToasts({ toasts, onDismiss }) {
  return (
    <div
      aria-live='polite'
      className='fixed top-4 left-1/2 -translate-x-1/2 z-[10000] w-[calc(100%-2rem)] max-w-lg space-y-2 pointer-events-none'
    >
      {toasts.map((toast) => {
        const { tone, title, body } = toastCopy(toast);
        return (
          <div
            key={toast.key}
            role='status'
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg ${TONES[tone].box}`}
          >
            {TONES[tone].icon}
            <div className='flex-1 text-sm'>
              <p className='font-semibold'>{title}</p>
              <p className='mt-0.5'>{body}</p>
            </div>
            <button
              type='button'
              onClick={() => onDismiss(toast.key)}
              className='p-1 rounded hover:bg-black/5'
              aria-label='Dismiss notification'
            >
              <X className='w-4 h-4' />
            </button>
          </div>
        );
      })}
    </div>
  );
}
