<template>
  <AppShell fullWidth>
    <section class="login-shell">
      <article class="login-shell__hero">
        <p class="login-shell__eyebrow">Desktop Entry</p>
        <h2>进入漫剧生产工作台</h2>
        <p class="muted">
          这里不再是传统后台表单入口，而是桌面端工作台的开始页。后续的剧本、分镜、资产、视频、音频与交付都会在统一的工作台结构中完成。
        </p>
        <div class="login-shell__highlights">
          <section class="panel">
            <p class="muted">01</p>
            <h3>Workflow First</h3>
            <p class="muted">围绕剧本到成片的生产链，而不是围绕零散表单。</p>
          </section>
          <section class="panel">
            <p class="muted">02</p>
            <h3>Desktop Workbench</h3>
            <p class="muted">左侧导航、中部主区、右侧检视的固定布局，减少跳页和来回滚动。</p>
          </section>
          <section class="panel">
            <p class="muted">03</p>
            <h3>Provider Ready</h3>
            <p class="muted">支持通过 API 示例导入模型配置，把复杂厂商接入收口到统一入口。</p>
          </section>
        </div>
      </article>

      <section class="panel login-shell__form">
        <div class="login-shell__form-head">
          <p class="muted">欢迎回来</p>
          <h3>登录</h3>
          <p class="muted">默认账号：admin / admin123</p>
        </div>
        <form @submit.prevent="onSubmit" class="form">
          <label class="login-shell__field">
            <span class="muted">用户名</span>
            <input v-model="username" placeholder="用户名" />
          </label>
          <label class="login-shell__field">
            <span class="muted">密码</span>
            <input v-model="password" placeholder="密码" type="password" />
          </label>
          <button class="primary" :disabled="loading">{{ loading ? '登录中...' : '进入工作台' }}</button>
        </form>
        <p v-if="error" class="error">{{ error }}</p>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import { login } from '@/api/auth';
import { setToken } from '@/api/client';

const router = useRouter();
const username = ref('admin');
const password = ref('admin123');
const loading = ref(false);
const error = ref('');

const onSubmit = async (): Promise<void> => {
  loading.value = true;
  error.value = '';

  try {
    const result = await login(username.value, password.value);
    setToken(result.token);
    await router.push('/');
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登录失败';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(360px, 460px);
  gap: 24px;
  min-height: calc(100vh - 112px);
  align-items: stretch;
}

.login-shell__hero,
.login-shell__form {
  min-height: 0;
}

.login-shell__hero {
  display: grid;
  gap: 18px;
  align-content: start;
  padding: 10px 6px;
}

.login-shell__eyebrow {
  margin: 0;
  color: #0e5bd8;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.login-shell__hero h2 {
  margin: 0;
  font-size: 34px;
  line-height: 1.08;
}

.login-shell__highlights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.login-shell__highlights .panel {
  min-height: 0;
  margin-bottom: 0;
}

.login-shell__highlights h3 {
  margin-bottom: 6px;
}

.login-shell__form {
  align-self: center;
  border-top: 4px solid #0e5bd8;
  padding: 22px;
}

.login-shell__form-head {
  display: grid;
  gap: 4px;
  margin-bottom: 18px;
}

.login-shell__field {
  display: grid;
  gap: 6px;
}

@media (max-width: 1120px) {
  .login-shell {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .login-shell__highlights {
    grid-template-columns: 1fr;
  }

  .login-shell__form {
    max-width: 520px;
  }
}
</style>
