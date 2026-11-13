import { createContext } from 'react';

/** Display-only personal chrome, reusing the shell's existing scoped read. */
export const PersonalProfileContext = createContext<{ name: string; avatarUrl?: string } | null>(null);
