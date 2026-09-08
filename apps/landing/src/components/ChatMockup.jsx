import { Check, CheckCheck, Mic, Phone } from 'lucide-react';
import PhoneFrame from './PhoneFrame.jsx';

// The first exchange is the one thing Telegram genuinely does differently from
// WhatsApp: Telegram never hands the bot a phone number, so onboarding opens
// with a verified contact share rather than going straight to a command. The
// mockup shows it because it is the first thing a new user actually sees.
const messages = [
  {
    from: 'bot',
    text: 'Welcome to Telex.\nTap below to share your number, Telegram verifies it for you.',
    time: '9:40',
    contactButton: true,
  },
  { from: 'user', text: 'Shared phone number', time: '9:40', contact: true },
  { from: 'user', text: 'Send 25000 NGN to Ada', time: '9:41' },
  {
    from: 'bot',
    text: 'Quote ready\nAda receives USDC value\nFee: 1%\nReply with your PIN to confirm.',
    time: '9:41',
  },
  { from: 'user', text: '****', time: '9:42' },
  {
    from: 'bot',
    text: 'Payment sent.\nReceipt: TLX-9284\nYou can also say: balance, history.',
    time: '9:42',
  },
  { from: 'user', text: 'voice note: what is my balance', time: '9:43', voice: true },
  {
    from: 'bot',
    text: 'Your Telex balance:\nstellar: 340 XLM',
    time: '9:43',
  },
];

export default function ChatMockup() {
  return (
    <PhoneFrame statusBarClassName="bg-telegram-dark text-white">
      {/* Telegram's light chat ground is a soft blue wash rather than WhatsApp's
          beige pattern, so this is a gradient instead of a background image. */}
      <div className="flex h-full flex-col bg-gradient-to-b from-[#dfe9f3] to-[#c9dcec]">
        <div className="flex items-center gap-3 bg-telegram-dark px-4 pb-3 pt-10 text-white">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full font-bold">
            <img src="/logo-sent.svg" alt="" className="h-full w-full object-cover" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Telex</p>
            <p className="text-[11px] text-white/70">bot</p>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-hidden px-3 py-4">
          {messages.map((m, i) => {
            const isUser = m.from === 'user';
            return (
              <div
                key={i}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] whitespace-pre-line rounded-2xl px-3 py-2 text-[12px] leading-snug shadow-sm ${
                    isUser
                      ? 'rounded-br-sm bg-telegram text-white'
                      : 'rounded-bl-sm bg-white text-slate-800'
                  }`}
                >
                  {m.voice && (
                    <Mic size={14} className="mr-1 inline text-white/80" aria-hidden="true" />
                  )}
                  {m.contact && (
                    <Phone size={14} className="mr-1 inline text-white/80" aria-hidden="true" />
                  )}
                  {m.text}
                  <span
                    className={`ml-2 inline-flex items-center gap-0.5 align-bottom text-[10px] ${
                      isUser ? 'text-white/70' : 'text-slate-400'
                    }`}
                  >
                    {m.time}
                    {isUser ? <CheckCheck size={12} /> : <Check size={12} />}
                  </span>

                  {m.contactButton && (
                    <span className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-telegram-dark">
                      <Phone size={12} aria-hidden="true" />
                      Share phone number
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 px-3 pb-7 pt-2">
          <div className="flex-1 rounded-full bg-white/80 px-4 py-2 text-[12px] text-slate-400">
            Message or voice note
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-telegram text-white">
            <Mic size={16} aria-hidden="true" />
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
