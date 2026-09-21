import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite-конфиг мини-приложения. `.env` читается из корня монорепо (единый файл для api/web).
 * `@edu/ui` подключается исходниками через workspace-симлинк: Vite обрабатывает его .tsx/.css сам.
 */
export default defineConfig({
  plugins: [react()],
  envDir: '../../',
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') },
    // Симлинк-пакеты (@edu/ui) должны брать React из apps/web, иначе будет два экземпляра React.
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173 },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Code-splitting по вендорам; страницы ролей делятся сами через lazy-роуты.
        manualChunks(id) {
          const norm = id.replace(/\\/g, '/');
          if (/node_modules\/(react|react-dom|scheduler)\//.test(norm)) return 'react';
          if (norm.includes('node_modules/react-router/')) return 'router';
          if (norm.includes('node_modules/@tanstack/')) return 'query';
          if (/node_modules\/(i18next|react-i18next)\//.test(norm)) return 'i18n';
          if (norm.includes('node_modules/zod/') || norm.includes('/packages/contracts/'))
            return 'contracts';
          if (norm.includes('/packages/ui/')) return 'ui';
          return undefined;
        },
      },
    },
  },
});
