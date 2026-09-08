import { ADMIN_URL, GITHUB_URL, STELLAR_URL, telegramUrl } from '@/lib/links.js';

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
  {
    title: 'Developers',
    // A link with no href is filtered out rather than rendered as a dead
    // anchor — GITHUB_URL is empty until VITE_GITHUB_URL is configured.
    links: [
      { label: 'GitHub', href: GITHUB_URL, external: true },
      { label: 'Stellar', href: STELLAR_URL, external: true },
      { label: 'Admin dashboard', href: ADMIN_URL },
    ].filter((link) => Boolean(link.href)),
  },
];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-100 bg-slate-50 dark:border-night-border dark:bg-night-card">
      <div className="container mx-auto grid gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold text-primary dark:text-primary-light">
            <img src="/logo-sent-mark.svg" alt="" className="h-6 w-6" aria-hidden="true" />
            <span>Telex</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Telegram-first payments powered by the Stellar network.
          </p>
          <a
            href={telegramUrl('create wallet')}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-sm font-semibold text-primary hover:underline dark:text-primary-light"
          >
            Start on Telegram →
          </a>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {col.title}
            </h2>
            <ul className="mt-4 space-y-3">
              {col.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    {...(link.external
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                    className="text-sm text-slate-600 transition-colors hover:text-primary dark:text-slate-300 dark:hover:text-primary-light"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 dark:border-night-border">
        <div className="container mx-auto flex flex-col gap-2 px-4 py-6 text-center text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:text-left dark:text-slate-400">
          <p>&copy; {new Date().getFullYear()} Telex. All rights reserved.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            MVP on Stellar Testnet — not for real-money use yet.
          </p>
        </div>
      </div>
    </footer>
  );
}
