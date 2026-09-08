import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { telegramUrl } from '@/lib/links.js';
import ThemeToggle from './ThemeToggle.jsx';

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur dark:border-night-border dark:bg-night/90">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-lg font-bold text-primary sm:text-xl dark:text-primary-light"
        >
          <img src="/logo-sent-mark.svg" alt="" className="h-7 w-7 shrink-0" aria-hidden="true" />
          <span>Telex</span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          <a href="#features" className="text-sm font-medium text-slate-600 transition-colors hover:text-primary dark:text-slate-300 dark:hover:text-primary-light">
            Features
          </a>
          <a href="#how-it-works" className="text-sm font-medium text-slate-600 transition-colors hover:text-primary dark:text-slate-300 dark:hover:text-primary-light">
            How it works
          </a>
          <a href="#faq" className="text-sm font-medium text-slate-600 transition-colors hover:text-primary dark:text-slate-300 dark:hover:text-primary-light">
            FAQ
          </a>
          <Link to="/onboarding" className="text-sm font-medium text-slate-600 transition-colors hover:text-primary dark:text-slate-300 dark:hover:text-primary-light">
            Onboarding
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <a
          href={telegramUrl('create wallet')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:focus-visible:outline-primary-light"
        >
          <MessageCircle size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Open Telegram</span>
          <span className="sm:hidden">Start</span>
        </a>
        </div>
      </div>
    </nav>
  );
}
