import { useState } from 'preact/hooks';
import { SchedulesTab } from './components/SchedulesTab.jsx';
import { AllowlistTab } from './components/AllowlistTab.jsx';
import { ListsTab } from './components/ListsTab.jsx';
import { UsageTab } from './components/UsageTab.jsx';
import { SettingsTab } from './components/SettingsTab.jsx';

const TABS = [
  { key: 'schedules', label: 'SCHEDULES' },
  { key: 'allowed', label: 'ALLOWED SITES' },
  { key: 'usage', label: 'USAGE' },
  { key: 'lists', label: 'SITE LISTS' },
  { key: 'settings', label: 'SETTINGS' },
];

const TAB_COMPONENTS = {
  schedules: SchedulesTab,
  allowed: AllowlistTab,
  usage: UsageTab,
  lists: ListsTab,
  settings: SettingsTab,
};

export function App() {
  const [activeTab, setActiveTab] = useState('schedules');
  const TabContent = TAB_COMPONENTS[activeTab];

  return (
    <div class="dotfield bg-bg text-ink font-sans min-h-screen py-10 px-6">
      <div class="max-w-[720px] mx-auto bg-card border border-ink p-8">
        <header class="mb-8">
          <div class="flex items-center justify-between mb-5">
            <div class="flex items-center gap-2.5">
              <span class="inline-flex items-center text-ink">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
                </svg>
              </span>
              <span class="text-[15px] font-semibold text-ink">Just Concentrate</span>
            </div>
          </div>
          <nav class="flex border-b border-rule">
            {TABS.map(t => (
              <button
                key={t.key}
                class={`bg-transparent border-0 border-b-2 border-solid py-2.5 px-4 font-mono text-[11.5px] uppercase tracking-[0.06em] cursor-pointer -mb-px transition-colors duration-150 ${
                  activeTab === t.key
                    ? 'text-ink border-b-accent'
                    : 'text-ink-3 border-b-transparent hover:text-ink'
                }`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>
        <main>
          <TabContent onNavigateTab={setActiveTab} />
        </main>
      </div>
    </div>
  );
}
