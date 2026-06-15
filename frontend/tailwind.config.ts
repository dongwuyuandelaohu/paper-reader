import type { Config } from 'tailwindcss'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        white: 'var(--white)',
        sand: 'var(--sand)',
        fg: 'var(--fg)',
        fg2: 'var(--fg2)',
        muted: 'var(--muted)',
        stone: 'var(--stone)',
        dark: 'var(--dark)',
        silver: 'var(--silver)',
        border: 'var(--border)',
        border2: 'var(--border2)',
        deep: 'var(--deep)',
        accent: 'var(--accent)',
        coral: 'var(--coral)',
        focus: 'var(--focus)',
        error: 'var(--error)',
        ring: 'var(--ring)',
        success: 'var(--success)',
        warn: 'var(--warn)',
      },
      fontFamily: {
        serif: ["Georgia", "'Times New Roman'", 'serif'],
        sans: ["-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "system-ui", "sans-serif"],
        mono: ["'SF Mono'", "'JetBrains Mono'", "'Consolas'", 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
