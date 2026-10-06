import { useState } from 'react';
import { AVATARS } from '@cityguess/shared';
import { storage, type StoredProfile } from '../services/storage';

export function useProfile(): [StoredProfile, (patch: Partial<StoredProfile>) => void] {
  const [profile, setProfile] = useState<StoredProfile>(() => {
    const saved = storage.getProfile();
    if (saved) return saved;
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)]?.id ?? 'fox';
    return { name: '', avatar };
  });
  return [
    profile,
    (patch) => {
      setProfile((prev) => {
        const next = { ...prev, ...patch };
        storage.setProfile(next);
        return next;
      });
    },
  ];
}
