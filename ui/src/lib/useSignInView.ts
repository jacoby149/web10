import { useEffect, useState } from 'react';

// Only presentation belongs in this URL. Never put an account or credential here.
export function useSignInView() {
  const read = () => new URLSearchParams(window.location.search).get('signin') === 'password';
  const [passwordView, setPasswordView] = useState(read);
  useEffect(() => {
    const sync = () => setPasswordView(read());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  function showPassword(show: boolean) {
    const url = new URL(window.location.href);
    if (show) url.searchParams.set('signin', 'password');
    else url.searchParams.delete('signin');
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
    console.log('[auth-ui] sign-in presentation changed', { view: show ? 'password' : 'accounts' });
    setPasswordView(show);
  }
  return { passwordView, showPassword };
}
