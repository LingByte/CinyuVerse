import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import './index.css';
import { initTheme } from '@/theme/theme';

const originalError = console.error;
console.error = (...args: unknown[]) => {
  const message = String(args[0] || '');
  const errorString = `${message} ${args.slice(1).map(String).join(' ')}`;

  if (
    errorString.includes("Cannot read properties of undefined (reading 'dimensions')") ||
    errorString.includes('get dimensions') ||
    errorString.includes('RenderService') ||
    errorString.includes('Viewport._innerRefresh') ||
    errorString.includes('t2.Viewport._innerRefresh')
  ) {
    return;
  }
  originalError.apply(console, args);
};

window.addEventListener('error', (event) => {
  const errorString = String(event.message || '');
  if (
    errorString.includes("Cannot read properties of undefined (reading 'dimensions')") ||
    errorString.includes('get dimensions') ||
    errorString.includes('RenderService') ||
    errorString.includes('Viewport._innerRefresh') ||
    errorString.includes('t2.Viewport._innerRefresh')
  ) {
    event.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const errorString = String((event.reason as Error)?.message || event.reason || '');
  if (
    errorString.includes("Cannot read properties of undefined (reading 'dimensions')") ||
    errorString.includes('get dimensions') ||
    errorString.includes('RenderService') ||
    errorString.includes('Viewport._innerRefresh') ||
    errorString.includes('t2.Viewport._innerRefresh')
  ) {
    event.preventDefault();
    return;
  }

  if (
    errorString === 'Canceled' ||
    errorString === 'Cancelled' ||
    errorString.includes('Canceled: Canceled') ||
    errorString.includes('Cancelled: Cancelled')
  ) {
    event.preventDefault();
  }
});

initTheme();

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/settings', component: { template: '<div />' } },
  ],
});

const app = createApp(App);
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue error]', info, err);
};
app.use(createPinia()).use(router).mount('#root');

document.body.classList.add('app-loaded');
