// Blocking before app/CSS paint; same resolution as shared/appearance/store.ts.
// Background values are canonical in design.md §13; never read account state.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('web10-marketing:theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Disabled storage still allows device appearance. */ }
  const theme = preference === 'system'
    ? (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#09090b' : '#fafafa');
})();
