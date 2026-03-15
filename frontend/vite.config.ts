import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:60000';
  const devPort = Number(env.VITE_DEV_PORT || 5173);

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    server: {
      host: '127.0.0.1',
      port: devPort,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    },
    preview: {
      host: '127.0.0.1',
      port: devPort
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            const normalized = id.split(path.sep).join('/');

            if (normalized.includes('/node_modules/')) {
              if (normalized.includes('/node_modules/vue/') || normalized.includes('/node_modules/vue-router/')) {
                return 'vendor-vue';
              }
              if (normalized.includes('/node_modules/@vue/')) {
                return 'vendor-vue-ecosystem';
              }
              return 'vendor-misc';
            }

            if (normalized.includes('/src/api/')) {
              return 'app-api';
            }
            if (normalized.includes('/src/composables/') || normalized.includes('/src/utils/')) {
              return 'app-utils';
            }
            if (normalized.includes('/src/components/')) {
              return 'app-components';
            }

            if (normalized.includes('/src/views/TaskCenterView.vue')) {
              return 'view-task-center';
            }
            if (normalized.includes('/src/views/TimelineEditorView.vue')) {
              return 'view-timeline-editor';
            }
            if (normalized.includes('/src/views/WorkflowWorkbenchView.vue')) {
              return 'view-workflow-workbench';
            }
            if (normalized.includes('/src/views/SettingsView.vue')) {
              return 'view-settings';
            }
            if (normalized.includes('/src/views/DomainEntityWorkbenchView.vue')) {
              return 'view-domain-workbench';
            }

            return undefined;
          }
        }
      }
    }
  };
});
