import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
export default {
  base: './',
  esbuild: { jsx: 'automatic' },
  resolve: { alias: [
    { find: 'next/link', replacement: resolve(here, 'next-link.tsx') },
    { find: 'next/navigation', replacement: resolve(here, 'next-navigation.tsx') },
    { find: /^react($|\/)/, replacement: resolve(here, 'node_modules/react') + '$1' },
    { find: /^react-dom($|\/)/, replacement: resolve(here, 'node_modules/react-dom') + '$1' },
    { find: /^lucide-react($|\/)/, replacement: resolve(here, 'node_modules/lucide-react') + '$1' },
    { find: /^@radix-ui\/react-dialog($|\/)/, replacement: resolve(here, 'node_modules/@radix-ui/react-dialog') + '$1' },
    { find: /^react-markdown($|\/)/, replacement: resolve(here, 'node_modules/react-markdown') + '$1' },
    { find: /^remark-gfm($|\/)/, replacement: resolve(here, 'node_modules/remark-gfm') + '$1' },
    { find: /^sonner($|\/)/, replacement: resolve(here, 'node_modules/sonner') + '$1' }
  ] },
  define: { 'process.env.NEXT_PUBLIC_PORTFOLIO_DEMO': '"true"', 'process.env.NEXT_PUBLIC_LANDING_DEMO_FALLBACK': '"true"', 'process.env.NEXT_PUBLIC_DEFAULT_DOMAIN_SLUG': '"japan_immigration"', 'process.env.NEXT_PUBLIC_API_BASE_URL': '""' },
  css: { postcss: { plugins: [] } },
  build: { outDir: 'dist', emptyOutDir: true }
};
