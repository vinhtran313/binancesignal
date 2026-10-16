import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0f1118',
          surface: '#161923',
          border: '#1e2231',
          'border-subtle': '#262b3d',
          muted: '#3a4157',
          text: '#e1e4ed',
          'text-secondary': '#8b93a7',
          'text-muted': '#5a6378',
          accent: '#3b82f6',
          'accent-hover': '#2563eb',
          long: '#22c55e',
          'long-bg': 'rgba(34, 197, 94, 0.1)',
          'long-muted': '#166534',
          short: '#ef4444',
          'short-bg': 'rgba(239, 68, 68, 0.1)',
          'short-muted': '#991b1b',
          warning: '#f59e0b',
          'warning-bg': 'rgba(245, 158, 11, 0.1)',
          info: '#3b82f6',
          'info-bg': 'rgba(59, 130, 246, 0.1)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'xxs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.5rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
