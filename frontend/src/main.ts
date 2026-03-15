import { createApp } from 'vue';
import App from '@/App.vue';
import router from '@/router';
import { AUTH_EXPIRED_EVENT } from '@/api/client';
import '@/styles/base.css';

window.addEventListener(AUTH_EXPIRED_EVENT, () => {
  if (router.currentRoute.value.path !== '/login') {
    void router.replace('/login');
  }
});

createApp(App).use(router).mount('#app');
