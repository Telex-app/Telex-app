import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggle from './ThemeToggle.jsx';
import { STORAGE_KEY } from '@/lib/theme.js';

/**
 * jsdom has no real matchMedia, so the OS preference is stubbed. `listeners`
 * captures the change handler so a system theme flip can be simulated.
 */
const listeners = new Set();
const mockMatchMedia = (prefersDark) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    addEventListener: (_event, handler) => listeners.add(handler),
    removeEventListener: (_event, handler) => listeners.delete(handler),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
};

beforeEach(() => {
  listeners.clear();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  mockMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ThemeToggle', () => {
  it('renders a labelled radiogroup with all three states', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radiogroup', { name: /colour theme/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('defaults to system when nothing has been chosen', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it('follows a dark OS preference without any stored choice', () => {
    mockMatchMedia(true);
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies dark mode and persists the choice', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('sets color-scheme so native controls and scrollbars follow', async () => {
    // Tailwind's class strategy only reaches elements it styles; browser-native
    // UI needs color-scheme or it stays light against a dark page.
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.style.colorScheme).toBe('dark');

    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('keeps an explicit light choice even when the OS prefers dark', async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('radio', { name: 'Light' }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('clears the stored value when returning to system', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

    await user.click(screen.getByRole('radio', { name: 'System' }));
    // Removed rather than stored as "system", so a later OS change is followed
    // instead of being pinned to whatever it resolved to today.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('restores a previously stored preference on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    render(<ThemeToggle />);

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('keeps following the OS while system is selected', () => {
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Simulate the OS flipping to dark at sunset.
    mockMatchMedia(true);
    listeners.forEach((handler) => handler({ matches: true }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('survives localStorage being unavailable', async () => {
    // Private windows and blocked site data make these throw outright; the
    // toggle must still work for the current page view.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    const user = userEvent.setup();
    expect(() => render(<ThemeToggle />)).not.toThrow();
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
