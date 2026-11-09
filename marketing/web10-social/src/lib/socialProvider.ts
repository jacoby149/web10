import { API_HOST } from './origins';

/** Bare local author keys historically map to `web10`, not a node hostname. */
export function resolveSocialProvider(provider?: string, localProvider = API_HOST): string {
  return !provider || provider === 'web10' ? localProvider : provider;
}
