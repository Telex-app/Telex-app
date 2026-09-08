const steps = [
  {
    n: '1',
    title: 'Chat or speak',
    desc: 'Send a message or voice note for balance, payment, or receipt.',
    command: 'Send 25000 NGN to Ada',
  },
  {
    n: '2',
    title: 'Review the quote',
    desc: 'Telex shows the live rate, fees, recipient, and confirmation flow before funds move.',
    command: 'Confirm with PIN',
  },
  {
    n: '3',
    title: 'Settle quietly',
    desc: 'The orchestrator settles the payment on Stellar while the user sees one clean receipt.',
    command: 'Receipt ready',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-secondary/50 py-16 lg:py-24 dark:bg-night-card/40">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-dark sm:text-4xl dark:text-white">
            How it works
          </h2>
          <p className="mt-4 text-slate-600 dark:text-slate-300">
            One Telegram experience, with routing, compliance, and settlement handled behind the scenes.
          </p>
        </div>

        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="relative rounded-2xl border border-slate-100 bg-white p-7 shadow-sm dark:border-night-border dark:bg-night-card dark:shadow-none"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-white">
                {s.n}
              </div>
              <h3 className="mb-2 text-lg font-bold text-dark dark:text-white">{s.title}</h3>
              <p className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{s.desc}</p>
              <code className="inline-block rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-xs text-primary-light dark:bg-night dark:ring-1 dark:ring-night-border">
                {s.command}
              </code>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
