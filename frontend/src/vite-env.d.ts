/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_DEV_PORT?: string;
  readonly VITE_ASSET_BATCH_CLEAR_CONFIRM_TEXT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
