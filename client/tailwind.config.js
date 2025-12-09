/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        'grandios': ['Inter', 'sans-serif'],
      },
      colors: {
        'grandios-dark': '#1a1a2e',
        'grandios-green': '#10b981',
        'grandios-red': '#ef4444',
        'grandios-orange': '#f97316',
      },
    },
  },
  plugins: [],
}

