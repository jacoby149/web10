import { useSyncExternalStore } from 'react';
import { createAppearanceStore } from '../../../marketing/shared/appearance/store';
export type { ThemePreference, ResolvedTheme } from '../../../marketing/shared/appearance/store';

export const THEME_KEY = 'web10-auth:theme';
export const createThemeStore = () => createAppearanceStore(THEME_KEY);
let store: ReturnType<typeof createThemeStore> | undefined;
export const getThemeStore = () => store ??= createThemeStore();
export function useTheme() {
  const theme = getThemeStore();
  return { ...useSyncExternalStore(theme.subscribe, theme.getSnapshot), setPreference: theme.setPreference };
}
