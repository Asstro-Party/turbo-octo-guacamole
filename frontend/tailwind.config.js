/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        orbitron: ['"Orbitron"', 'sans-serif'],
      },
      backgroundImage: {
        space: "url('/space.gif')",
      },
      keyframes: {
        'slow-pan': {
          '0%': { transform: 'scale(1.05) translate3d(0, 0, 0)' },
          '50%': { transform: 'scale(1.05) translate3d(-2%, -3%, 0)' },
          '100%': { transform: 'scale(1.05) translate3d(0, 0, 0)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.2', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.6)' },
        },
      },
      animation: {
        'slow-pan': 'slow-pan 50s linear infinite',
        twinkle: 'twinkle 3s ease-in-out infinite',
      },
      boxShadow: {
        'glass-lg': '0 30px 70px rgba(9, 11, 26, 0.65)',
        'glass-md': '0 22px 55px rgba(8, 10, 26, 0.58)',
      },
    },
  },
  plugins: [],
};
