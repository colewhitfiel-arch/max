/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_MODE?: 'real' | 'mock';
  readonly VITE_MAX_MODE?: 'mock' | 'real';
  readonly VITE_AUTH_MODE?: 'dev' | 'max';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
