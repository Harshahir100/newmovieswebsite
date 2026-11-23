/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: '#e50914', 
        darkbg: '#141414',
        cardbg: '#1f1f1f'
      }
    },
  },
  plugins: [],
}