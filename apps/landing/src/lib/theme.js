// Theme resolution shared by the no-flash inline script in index.html and the
// React toggle. Three states, not two: 'light' and 'dark' are explicit user
// choices that are persisted, while 'system' (the default) follows the OS and
// keeps following it as the OS changes.

export const STORAGE_KEY = 'telex-theme';
export const THEMES = ['light', 'dark', 'system'];

/**
 * Read the stored preference. Storage can throw outright in a private window or
 * when site data is blocked, so this never assumes access — an unreadable store
 * simply means "no preference expressed".
 */
export const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
};

export const storeTheme = (theme) => {
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A rejected write is not worth failing the interaction over; the toggle
    // still applies for this page view.
  }
};

export const systemPrefersDark = () => {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
};

/** Which of light/dark a preference actually resolves to right now. */
export const resolveTheme = (preference) =>
  preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference;

/**
 * Apply a resolved theme to the document. `color-scheme` is set alongside the
 * class so form controls, scrollbars and the caret follow the theme too —
 * Tailwind's class strategy alone does not reach browser-native UI.
 */
export const applyTheme = (preference) => {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;

  // Keep the mobile browser chrome in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b1220' : '#1878a6');

  return resolved;
};
