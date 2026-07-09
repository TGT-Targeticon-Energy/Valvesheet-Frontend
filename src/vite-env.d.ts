/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ML_API_URL: string;
  readonly VITE_USER_MGMT_API: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
