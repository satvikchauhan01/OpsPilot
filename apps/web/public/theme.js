// Runs before the app loads so the page never flashes the wrong theme.
// A saved choice wins; otherwise the operating system's preference decides.
(() => {
  let theme = null;
  try {
    theme = localStorage.getItem('opspilot-theme');
  } catch {
    // storage can be unavailable (private windows, blocked cookies)
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();
