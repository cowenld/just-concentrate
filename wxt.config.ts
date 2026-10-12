import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  vite: () => ({
    plugins: [preact(), tailwindcss()],
  }),
  manifest: {
    name: 'Just Concentrate',
    description: 'A free, privacy-respecting website blocker. Block distracting sites on recurring schedules. Fully local, zero data collection.',
    // No host permissions and no network: blocking uses DNR `block` rules plus
    // webNavigation (see src/entrypoints/background/index.js).
    permissions: ['declarativeNetRequest', 'storage', 'alarms', 'tabs', 'webNavigation', 'idle'],
    incognito: 'spanning',
    icons: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    declarative_net_request: {
      rule_resources: []
    }
  }
});
