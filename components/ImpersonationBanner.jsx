import React, { useEffect } from 'react';
import useImpersonationStore from '../stores/impersonationStore';
import { Mail } from 'lucide-react';

const IMPERSONATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export default function ImpersonationBanner() {
  const { isImpersonating, impersonatedUser, stopImpersonation, getDurationSeconds, sendEmails, setSendEmails } = useImpersonationStore();

  useEffect(() => {
    if (!isImpersonating) return;
    const t = setTimeout(() => {
      stopImpersonation();
      if (typeof window !== 'undefined') {
        window.location.href = '/admin/users';
      }
    }, IMPERSONATION_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isImpersonating, stopImpersonation]);

  if (!isImpersonating || !impersonatedUser) return null;

  const handleExit = async () => {
    try {
      await fetch('/api/admin/impersonation-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetUserId: impersonatedUser.id,
          durationSeconds: getDurationSeconds(),
        }),
        credentials: 'include',
      });
    } catch (e) {
      console.warn('[Impersonation] end log failed', e);
    }
    stopImpersonation();
    window.location.href = '/admin/users';
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-2 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold">Impersonating:</span>
        <span>{impersonatedUser.email}</span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={sendEmails}
            onChange={(e) => setSendEmails(e.target.checked)}
            className="w-4 h-4 rounded border-white"
          />
          <span className="flex items-center gap-1">
            <Mail className={`w-4 h-4 ${sendEmails ? '' : 'opacity-50'}`} />
            Send emails
          </span>
        </label>
        <button
          type="button"
          onClick={handleExit}
          className="bg-white text-red-600 px-4 py-1.5 rounded font-medium hover:bg-red-50 transition-colors text-sm whitespace-nowrap"
        >
          Exit impersonation
        </button>
      </div>
    </div>
  );
}
