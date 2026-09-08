import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import { telegramUrl } from '@/lib/links.js';

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>
  );
}

describe('Navbar', () => {
  it('exposes a navigation landmark', () => {
    renderNavbar();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('links the brand mark back to the home route', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: /telex/i })).toHaveAttribute('href', '/');
  });

  it('links in-page sections to their matching anchors', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '#features');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '#how-it-works'
    );
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq');
  });

  it('points the primary CTA at the configured Telegram destination', () => {
    renderNavbar();
    const cta = screen.getByRole('link', { name: /telegram|start/i });
    expect(cta).toHaveAttribute('href', telegramUrl('create wallet'));
    expect(cta).toHaveAttribute('target', '_blank');
    // External-tab links must carry noopener/noreferrer so the new tab can't
    // reach back into this page via window.opener.
    expect(cta).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(cta).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('is fully reachable by keyboard, in document order', async () => {
    const user = userEvent.setup();
    const { container } = renderNavbar();

    // Assert over every focusable control rather than links alone: the theme
    // toggle sits between the last nav link and the CTA, so a links-only walk
    // would silently stop matching document order the moment a button is added.
    const focusable = [...container.querySelectorAll('a[href], button:not([disabled])')];
    expect(focusable.length).toBeGreaterThan(0);

    for (const el of focusable) {
      await user.tab();
      expect(el).toHaveFocus();
    }
  });

  it('exposes the theme toggle in the navbar', () => {
    renderNavbar();
    const group = screen.getByRole('radiogroup', { name: /colour theme/i });
    expect(group).toBeInTheDocument();
    // Three states, not two: without an explicit "system" option there is no
    // way back to following the OS once a choice has been made.
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
  });

  it('gives the primary CTA an explicit visible focus style', () => {
    // The brand mark and plain in-page anchors rely on the browser's default
    // focus ring (confirmed non-violating by the axe scan in App.test.jsx).
    // The CTA button overrides its own background/text color, so it needs an
    // explicit focus-visible outline to stay visible against that styling.
    renderNavbar();
    const cta = screen.getByRole('link', { name: /telegram|start/i });
    expect(cta.className).toMatch(/focus-visible:outline/);
  });
});
