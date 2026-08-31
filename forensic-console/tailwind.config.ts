import type { Config } from 'tailwindcss';

/**
 * SendWiseForensic design tokens.
 *
 * Palette intent:
 *   - slate       — neutral canvas of the register / judicial portal
 *   - indigo-800  — single primary action accent (buttons, links, focus)
 *   - red-700     — RESERVED for prototype banner, warnings, destructive intent
 *   - emerald-700 — RESERVED for successful, in-scope authorizations only
 *
 * Everything else is intentionally desaturated.
 */
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    // Jurisdiction theme utilities are composed in lib/jurisdiction-theme.ts;
    // enumerate them so the JIT scanner keeps them even though they never
    // appear as literal class strings in a component file.
    'bg-slate-900',
    'bg-neutral-900',
    'bg-indigo-800',
    'bg-teal-700',
    'bg-[#1e3a8a]',
    'bg-indigo-800/20',
    'bg-[#1e3a8a]/25',
    'bg-teal-700/25',
    'text-indigo-100',
    'text-slate-100',
    'text-teal-100',
    'border-indigo-700',
    'border-[#1e3a8a]',
    'border-teal-600',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic aliases — use these in components, not raw palette names.
        canvas: '#f8fafc',      // slate-50
        ink: '#0f172a',         // slate-900
        rule: '#e2e8f0',        // slate-200 — hairline dividers
        muted: '#475569',       // slate-600
        primary: '#3730a3',     // indigo-800
        primaryHover: '#312e81',// indigo-900
        warning: '#b91c1c',     // red-700
        success: '#047857',     // emerald-700
        filter:  '#b45309',     // amber-700 — RESERVED for Filter Team console (independent-review scope)
        // Per-jurisdiction accents. See lib/jurisdiction-theme.ts for the
        // theme record. Every jurisdiction status bar / pill reads from
        // JURISDICTION_THEME rather than raw palette names.
        'us-accent': '#1e3a8a',  // slate-blue-700 — Title III / Berger accent
        'uk-accent': '#0f766e',  // teal-700 — IPA 2016 / ECHR accent
      },
      fontFamily: {
        // UI: Inter with system fallback.
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Legal / warrant headings: a serif register.
        serif: [
          'Georgia',
          'Cambria',
          '"Times New Roman"',
          'Times',
          'serif',
        ],
        // Hashes, refs, evidence IDs.
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      letterSpacing: {
        register: '0.08em', // for uppercase eyebrow labels ("IN THE MATTER OF")
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      boxShadow: {
        // Restrained — no floating card look.
        register: '0 1px 0 0 rgb(15 23 42 / 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
