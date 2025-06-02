/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'gmg-green': {
          50: '#f0f9f4',
          100: '#dcf2e4',
          200: '#bce5cd',
          300: '#8dd2ab',
          400: '#57b882',
          500: '#339d63',
          600: '#26804e',
          700: '#1f6641',
          800: '#1b5236',
          900: '#17432d',
        }
      }
    },
  },
  plugins: [],
}
