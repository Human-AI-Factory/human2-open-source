<template>
  <AppShell fullWidth>
    <div class="login-page">
      <main class="login-content">
        <section class="hero-section">
          <header class="hero-header">
            <span class="eyebrow">DESKTOP ENTRY</span>
            <h1 class="title">进入漫剧生产工作台</h1>
            <p class="description">
              这里不再是传统后台表单入口，而是桌面端工作台的开始页。后续的剧本、分镜、资产、视频、音频与交付都会在统一的工作台结构中完成。
            </p>
          </header>

          <div class="feature-grid">
            <div class="feature-item">
              <span class="num">01</span>
              <div class="text">
                <h3>Workflow First</h3>
                <p>围绕剧本到成片的生产链，拒绝零散表单。</p>
              </div>
            </div>
            <div class="feature-item">
              <span class="num">02</span>
              <div class="text">
                <h3>Desktop Workbench</h3>
                <p>固定布局减少跳页，让创作流程更连贯。</p>
              </div>
            </div>
            <div class="feature-item">
              <span class="num">03</span>
              <div class="text">
                <h3>Provider Ready</h3>
                <p>统一接入模型配置，收口复杂厂商接口。</p>
              </div>
            </div>
          </div>
        </section>

        <aside class="auth-section">
          <div class="auth-card">
            <div class="auth-header">
              <p class="subtitle">欢迎回来</p>
              <h2>登录账号</h2>
              <div class="credential-hint">
                默认账号：<strong>admin</strong> / <strong>admin123</strong>
              </div>
            </div>

            <form @submit.prevent="onSubmit" class="auth-form">
              <div class="form-group">
                <label>用户名</label>
                <input 
                  v-model="username" 
                  type="text" 
                  placeholder="请输入用户名" 
                  required 
                />
              </div>
              <div class="form-group">
                <label>密码</label>
                <input 
                  v-model="password" 
                  type="password" 
                  placeholder="请输入密码" 
                  required 
                />
              </div>
              
              <button class="primary login-btn" :disabled="loading">
                <span v-if="!loading">进入工作台</span>
                <span v-else class="spinner"></span>
              </button>
              
              <Transition name="fade">
                <p v-if="error" class="error-text">{{ error }}</p>
              </Transition>
            </form>
          </div>
        </aside>
      </main>
    </div>
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
    error.value = err instanceof Error ? err.message : '登录失败，请检查账号密码';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-page {
  min-height: calc(100vh - 112px);
  display: grid;
  align-items: center;
  padding: clamp(24px, 5vw, 56px) 0;
}

.login-content {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(360px, 420px);
  gap: clamp(28px, 5vw, 56px);
  max-width: 1180px;
  width: min(1180px, 100%);
  margin: 0 auto;
  align-items: center;
}

.hero-section {
  display: grid;
  gap: var(--space-10);
}

.eyebrow {
  color: var(--brand);
  font-weight: 700;
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  display: block;
  margin-bottom: var(--space-5);
  text-transform: uppercase;
}

.title {
  font-size: clamp(34px, 5vw, 48px);
  font-weight: 800;
  color: var(--ink-1);
  margin-bottom: var(--space-9);
  letter-spacing: -0.04em;
  line-height: 1.02;
}

.description {
  font-size: var(--text-lg);
  line-height: 1.75;
  color: var(--ink-2);
  margin-bottom: 0;
  max-width: 560px;
}

.feature-grid {
  display: grid;
  gap: var(--space-6);
}

.feature-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-8);
  align-items: flex-start;
  padding: var(--space-8) var(--space-9);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  background: var(--surface-panel);
  box-shadow: var(--shadow-sm);
}

.num {
  font-size: var(--text-2xl);
  font-weight: 800;
  line-height: 1;
  color: var(--brand-ghost);
  padding-top: 2px;
}

.feature-item h3 {
  font-size: var(--text-lg);
  margin-bottom: var(--space-1);
  color: var(--ink-1);
}

.feature-item p {
  font-size: var(--text-base);
  color: var(--ink-2);
  margin: 0;
}

.auth-section {
  min-width: 380px;
}

.auth-card {
  background: var(--surface-panel-strong);
  padding: var(--space-11);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--line);
}

.auth-header h2 {
  font-size: var(--text-2xl);
  margin: var(--space-3) 0 var(--space-7);
  color: var(--ink-1);
}

.subtitle {
  font-size: var(--text-base);
  color: var(--ink-2);
  margin: 0;
}

.credential-hint {
  background: var(--status-info-bg);
  border: 1px solid var(--status-info-border);
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  color: var(--status-info-ink);
  margin-bottom: var(--space-12);
}

.auth-form {
  display: grid;
  gap: var(--space-8);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.form-group label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ink-1);
}

.login-btn {
  width: 100%;
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.error-text {
  color: var(--status-danger-ink);
  font-size: var(--text-sm);
  margin: 0;
  text-align: center;
}

@media (max-width: 968px) {
  .login-content {
    grid-template-columns: 1fr;
    gap: 60px;
  }

  .description {
    margin: 0 auto 40px;
  }

  .feature-item {
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }

  .auth-section {
    min-width: 0;
  }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid var(--contrast-soft);
  border-radius: 50%;
  border-top-color: var(--card);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
