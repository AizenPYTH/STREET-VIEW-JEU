import { useState } from 'react';
import { AVATARS } from '@cityguess/shared';
import { storage, type StoredProfile } from '../services/storage';

export function useProfile(): [StoredProfile, (patch: Partial<StoredProfile>) => void] {
  const [profile, setProfile] = useState<StoredProfile>(() => storage.getProfile() ?? { name: '', avatar: AVATARS[0]?.id ?? 'diamond' });
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
