import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
} from '@/lib/theme.js';

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Three-state theme control rendered as a radiogroup.
 *
 * "System" is a real, selectable state rather than just the initial default:
 * once someone has chosen dark, they need a way back to "follow my OS", and a
 * two-state toggle cannot express that. While system is selected the component
 * keeps listening to the media query, so a user whose OS switches at sunset
 * sees the page follow without touching anything.
 */
export default function ThemeToggle({ className = '' }) {
  const [preference, setPreference] = useState('system');

  // Read on mount rather than in useState's initializer: the inline script in
  // index.html has already applied the right class, so this only syncs React's
  // view of it and keeps the component safe to render without a DOM.
  useEffect(() => {
    setPreference(readStoredTheme());
  }, []);

  useEffect(() => {
    applyTheme(preference);

    if (preference !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const choose = (value) => {
    setPreference(value);
    storeTheme(value);
  };

  const resolved = resolveTheme(preference);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={
        'inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 '
        + 'dark:border-night-border dark:bg-night '
        + className
      }
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={`${label} theme`}
            onClick={() => choose(value)}
            className={
              'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors '
              + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary '
              + 'dark:focus-visible:outline-primary-light '
              + (selected
                ? 'bg-white text-primary shadow-sm dark:bg-night-card dark:text-primary-light'
                : 'text-slate-500 hover:text-primary dark:text-slate-400 dark:hover:text-primary-light')
            }
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        );
      })}
      {/* Announce the effective theme without duplicating the radio labels. */}
      <span className="sr-only" aria-live="polite">
        {`${resolved} theme active`}
      </span>
    </div>
  );
}
