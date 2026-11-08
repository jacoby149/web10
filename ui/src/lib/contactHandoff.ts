// Capture once before telemetry startup. Secrets never go in query strings,
// localStorage, event capture, logs or an automatic verification request.
const fragment = new URLSearchParams(window.location.hash.slice(1));
export const contactHandoff = {
  gmail: fragment.get('gmail') || '',
  recovery: fragment.get('recovery') || '',
  node: fragment.get('node') || '',
};
if (contactHandoff.gmail || contactHandoff.recovery) {
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(window.history.state, '', url);
}

export function recoveryDestination(issuer: string, configuredApi: string): string {
  const url = new URL(configuredApi);
  if (!issuer || url.protocol !== 'https:' || url.host !== issuer || url.username || url.password || url.search || url.hash) {
    throw new Error('Open this recovery link in its issuing node’s authenticator.');
  }
  return url.origin;
}
