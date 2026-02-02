import { create } from 'zustand';

const STORAGE_KEY = 'gmg_impersonation';

const getStored = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const setStored = (data) => {
  if (typeof window === 'undefined') return;
  try {
    if (data) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.warn('[impersonation] storage write failed', e);
  }
};

const useImpersonationStore = create((set, get) => ({
  isImpersonating: false,
  impersonatedUser: null,
  startedAt: null,

  initialize: () => {
    const stored = getStored();
    if (stored?.id && stored?.email) {
      set({
        isImpersonating: true,
        impersonatedUser: { id: stored.id, email: stored.email, first_name: stored.first_name, last_name: stored.last_name },
        startedAt: stored.startedAt ? new Date(stored.startedAt) : new Date(),
      });
    }
  },

  startImpersonation: (user) => {
    const payload = {
      id: user.id,
      email: user.email || '',
      first_name: user.first_name,
      last_name: user.last_name,
      startedAt: new Date().toISOString(),
    };
    setStored(payload);
    set({
      isImpersonating: true,
      impersonatedUser: { id: user.id, email: user.email || '', first_name: user.first_name, last_name: user.last_name },
      startedAt: new Date(),
    });
  },

  stopImpersonation: () => {
    setStored(null);
    set({ isImpersonating: false, impersonatedUser: null, startedAt: null });
  },

  getDurationSeconds: () => {
    const { startedAt } = get();
    if (!startedAt) return 0;
    return Math.round((Date.now() - startedAt.getTime()) / 1000);
  },
}));

export default useImpersonationStore;
