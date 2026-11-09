/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand primary. Text on white: use 600+ (600 = 5.2:1, 700 = 6.7:1). 500 is for fills/icons only.
        // (Retuning to the logo indigo is an owner decision still pending: do not change these hexes here.)
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Logo green (#25C44C) for progress fills, "funded" and success accents.
        // Use as TEXT only at 700+ (700 on white = 5.4:1); 500/600 are for fills and icons.
        accent: {
          50: '#effcf2',
          100: '#d8f7e0',
          200: '#b0eec2',
          500: '#25c44c',
          600: '#1a9e3c',
          700: '#157a30',
          800: '#14612a',
        },
        // `secondary` (a slate copy) was removed: it had 0 uses. Use gray-* for neutrals.
      },
      fontFamily: {
        // Neither Inter nor Poppins has Arabic glyphs, so the browser falls
        // through to IBM Plex Sans Arabic for Arabic text only (loaded on the
        // /ar site by main.tsx), and Latin text keeps its usual face.
        sans: ['Inter', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
        heading: ['Poppins', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
      },
      animation: {
        // `both` keeps the first frame during an animation-delay (no flash before a staggered fade).
        'fade-in': 'fadeIn 0.6s ease-out both',
        'slide-up': 'slideUp 0.6s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
