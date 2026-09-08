import { MessageCircle, ArrowDown, ShieldCheck, Zap, Smartphone } from 'lucide-react';
import ChatMockup from './ChatMockup.jsx';
import { telegramUrl } from '@/lib/links.js';

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-secondary/60 to-white dark:from-night-card dark:to-night">
      <div className="container mx-auto grid items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:py-12">
        <div className="animate-fade-up text-center lg:text-left">

          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-dark sm:text-5xl lg:text-6xl dark:text-white">
            Telegram payments with <span className="text-primary dark:text-primary-light">chat and voice</span>.
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base text-slate-600 sm:text-lg lg:mx-0 dark:text-slate-300">
            Telex maps your phone number to a managed wallet, routes each
            payment over the best rail, and lets you send and receive money
            without installing a crypto app.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a
              href={telegramUrl('create wallet')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-7 py-4 font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:-translate-y-0.5 hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:focus-visible:outline-primary-light"
            >
              <MessageCircle size={20} aria-hidden="true" />
              Start on Telegram
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-7 py-4 font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-night-border dark:bg-night-card dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white dark:focus-visible:outline-primary-light"
            >
              See how it works
              <ArrowDown size={18} aria-hidden="true" />
            </a>
          </div>

          <ul className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-slate-500 lg:justify-start dark:text-slate-400">
            <li className="inline-flex items-center gap-1.5">
              <Smartphone size={16} className="text-primary dark:text-primary-light" aria-hidden="true" />
              No app to install
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-primary dark:text-primary-light" aria-hidden="true" />
              Phone number as wallet
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Zap size={16} className="text-primary dark:text-primary-light" aria-hidden="true" />
              Built on Stellar rails
            </li>
          </ul>
        </div>

        {/* Visual */}
        <div className="animate-fade-up [animation-delay:120ms]">
          <ChatMockup />
        </div>
      </div>
    </section>
  );
}
