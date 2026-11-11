// Blocking, before app/CSS paint. Match lib/theme.ts and design.md §13.
// Appearance only — never read credential or account storage here.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('web10-auth:theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Device appearance still works when storage is unavailable. */ }
  const theme = preference === 'system'
    ? (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#09090b' : '#fafafa');
})();
