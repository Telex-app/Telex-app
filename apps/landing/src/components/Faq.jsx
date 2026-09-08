import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'Do users need to understand crypto?',
    a: 'No. Users interact through Telegram, phone numbers, contacts, receipts, PINs, and flows. The blockchain rail is selected by Telex in the background.',
  },
  {
    q: 'Which blockchain does Telex use?',
    a: 'Telex settles on Stellar, a payment network designed for fast, low-cost transfers and cross-border corridors.',
  },
  {
    q: 'How are wallets managed?',
    a: 'Every phone number maps to a managed wallet through a Wallet-as-a-Service provider such as Thirdweb Engine. The app talks only to Telex wallet services.',
  },
  {
    q: 'Is this production-ready today?',
    a: 'The architecture is being upgraded for production, including KYC, PIN verification, queues, audit logs, and provider integrations. Live money movement should wait for credentials, contracts, compliance review, and monitoring.',
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 dark:border-night-border">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-4 py-5 text-left text-base font-semibold text-dark transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-white dark:hover:text-primary-light dark:focus-visible:outline-primary-light"
        >
          {q}
          <ChevronDown
            size={20}
            aria-hidden="true"
            className={`shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>
      {open && (
        <p className="pb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{a}</p>
      )}
    </div>
  );
}

export default function Faq() {
  return (
    <section id="faq" className="container mx-auto px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-dark sm:text-4xl dark:text-white">
            Frequently asked questions
          </h2>
        </div>
        <div>
          {faqs.map((f) => (
            <FaqItem key={f.q} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}
