/** This file defines the Tailwind scan paths and extends the base theme with project-specific colors so the interface has a consistent visual language across the setup, session, and report screens. */

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        shell: '#0f172a',
        mist: '#edf2f7',
        ember: '#f97316',
        brass: '#d4a373',
        slateglass: '#1e293b'
      },
      boxShadow: {
        panel: '0 18px 60px rgba(15, 23, 42, 0.18)'
      }
    }
  },
  plugins: []
};
