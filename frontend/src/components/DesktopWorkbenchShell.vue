<template>
  <div class="desktop-workbench-shell" :class="{ 'desktop-workbench-shell--compact': compact }">
    <aside v-if="$slots.rail" class="desktop-workbench-shell__rail">
      <div class="desktop-workbench-shell__pane desktop-workbench-shell__pane--rail">
        <div class="desktop-workbench-shell__scroll">
          <slot name="rail" />
        </div>
      </div>
    </aside>
    <section class="desktop-workbench-shell__main">
      <div class="desktop-workbench-shell__pane desktop-workbench-shell__pane--main">
        <div class="desktop-workbench-shell__scroll">
          <slot />
        </div>
      </div>
    </section>
    <aside v-if="$slots.inspector" class="desktop-workbench-shell__inspector">
      <div class="desktop-workbench-shell__pane desktop-workbench-shell__pane--inspector">
        <div class="desktop-workbench-shell__scroll">
          <slot name="inspector" />
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  {
    compact: false
  }
);
</script>

<style scoped>
.desktop-workbench-shell {
  --rail-width: 280px;
  --inspector-width: 360px;
  --pane-radius: 18px;
  --pane-line: rgba(172, 188, 214, 0.7);
  --pane-bg: rgba(255, 255, 255, 0.88);
  --pane-shadow: 0 18px 40px rgba(15, 23, 40, 0.08);
  display: grid;
  grid-template-columns: minmax(220px, var(--rail-width)) minmax(0, 1fr) minmax(280px, var(--inspector-width));
  gap: 18px;
  min-height: calc(100vh - 112px);
  max-height: calc(100vh - 112px);
  align-items: stretch;
}

.desktop-workbench-shell--compact {
  gap: 14px;
}

.desktop-workbench-shell__rail,
.desktop-workbench-shell__main,
.desktop-workbench-shell__inspector {
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.desktop-workbench-shell__pane {
  min-height: 0;
  height: 100%;
  width: 100%;
  border-radius: var(--pane-radius);
  border: 1px solid var(--pane-line);
  background: var(--pane-bg);
  box-shadow: var(--pane-shadow);
  backdrop-filter: blur(16px);
  overflow: hidden;
}

.desktop-workbench-shell__pane--main {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(250, 252, 255, 0.94) 100%);
}

.desktop-workbench-shell__scroll {
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  scrollbar-width: thin;
  scrollbar-color: rgba(120, 143, 183, 0.5) transparent;
}

.desktop-workbench-shell__scroll::-webkit-scrollbar {
  width: 9px;
}

.desktop-workbench-shell__scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(120, 143, 183, 0.45);
  border: 2px solid transparent;
  background-clip: padding-box;
}

.desktop-workbench-shell__scroll > :deep(*) {
  margin-bottom: 14px;
}

.desktop-workbench-shell__scroll > :deep(*:last-child) {
  margin-bottom: 0;
}

@media (max-width: 1480px) {
  .desktop-workbench-shell {
    --rail-width: 248px;
    --inspector-width: 312px;
  }
}

@media (max-width: 1180px) {
  .desktop-workbench-shell {
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    grid-template-areas:
      'rail main'
      'inspector inspector';
    min-height: auto;
    max-height: none;
  }

  .desktop-workbench-shell__rail {
    grid-area: rail;
  }

  .desktop-workbench-shell__main {
    grid-area: main;
  }

  .desktop-workbench-shell__inspector {
    grid-area: inspector;
  }

  .desktop-workbench-shell__scroll {
    height: auto;
    max-height: none;
    overflow: visible;
    padding: 14px;
  }
}

@media (max-width: 860px) {
  .desktop-workbench-shell {
    grid-template-columns: 1fr;
    grid-template-areas:
      'rail'
      'main'
      'inspector';
  }
}
</style>
