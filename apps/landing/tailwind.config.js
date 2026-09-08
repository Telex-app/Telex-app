/** @type {import('tailwindcss').Config} */
export default {
  // Class-based rather than media-based so the toggle can override the OS
  // setting. The class is applied by an inline script in index.html before
  // React mounts, so there is no light-mode flash on load.
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
    '../../packages/shared/src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Telegram's brand blue (#229ED9) is only 3.0:1 against white, which
        // fails WCAG AA for normal-size text. So `primary` is a deepened blue
        // used for anything carrying white text (4.9:1), and the bright brand
        // blue lives on `telegram`/`accent` for decoration, icons and large
        // display text, where the 3:1 threshold applies.
        primary: '#1878A6',
        'primary-dark': '#12607F', // hover/active: darker, so contrast improves
        'primary-light': '#5CBDEA', // dark-mode text/links: 8.9:1 on night
        secondary: '#eff8fd', // pale blue tint for section grounds
        accent: '#229ED9',
        dark: '#0f172a', // Slate 900
        telegram: '#229ED9',
        'telegram-dark': '#1b7fae',

        // Dark-mode surfaces. A blue-leaning near-black rather than pure grey,
        // so the palette stays one family across both themes.
        night: '#0b1220', // page ground
        'night-card': '#131c2b', // raised surfaces: cards, navbar, footer
        'night-border': '#1e2a3c',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
      },
    },
  },
  plugins: [],
};
