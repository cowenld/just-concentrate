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
    version: '0.1.0',
    description: 'A free, privacy-respecting website blocker. Block distracting sites on recurring schedules. Fully local, zero data collection.',
    permissions: ['declarativeNetRequest', 'storage', 'alarms', 'tabs', 'webNavigation', 'offscreen'],
    incognito: 'spanning',
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    declarative_net_request: {
      rule_resources: []
    },
    web_accessible_resources: [{
      resources: ['presets/social.json', 'presets/news.json', 'presets/streaming.json', 'presets/adult.json'],
      matches: ['<all_urls>']
    }]
  }
});
