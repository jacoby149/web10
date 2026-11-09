// Blocking, before the app/CSS paints. Keep resolution aligned with lib/theme.ts
// and the two page backgrounds in design.md §13. No account data is read here.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('web10-social:theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Storage may be disabled; device appearance still works. */ }
  const theme = preference === 'system'
    ? (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#09090b' : '#fafafa');
})();
