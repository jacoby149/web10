// Canonical production web10 destinations the console links out to. Overridable
// at build time (VITE_WEB10_HOME etc.) but defaulting to the live marketing
// site — the marketing-ui serves Home at /, docs at /docs, store at /app-store.
import { env } from '../env';

export const WEB10_HOME: string = env?.VITE_WEB10_HOME || 'https://web10.app';
export const WEB10_DOCS: string = env?.VITE_WEB10_DOCS || 'https://web10.app/docs';
export const WEB10_APP_STORE: string = env?.VITE_WEB10_APP_STORE || 'https://web10.app/app-store';
