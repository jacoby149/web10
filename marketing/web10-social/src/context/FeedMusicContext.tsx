import { createContext, useContext } from 'react';
import type { MusicTrack } from '@/data/musicTrack';

/** Already-readable tracks on this board, never a catalog or a fetch trigger. */
export const FeedMusicQueue = createContext<MusicTrack[] | undefined>(undefined);
export const useFeedMusicQueue = () => useContext(FeedMusicQueue);
