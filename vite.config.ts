import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works on GitHub Pages project sites and any static host.
  base: './',
  plugins: [react()],
});
