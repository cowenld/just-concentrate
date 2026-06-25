import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../../components/Icon.jsx';
import { saveSettings } from '../../lib/storage.js';
import { TEMPLATES, applyTemplateToStorage, loadPresets } from '../../lib/templates.js';
import { windowLabel } from '../../lib/formatting.js';
import { ImportModal } from '../options/components/ImportModal.jsx';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun

const TEMPLATE_CARDS = [
  { key: 'work', icon: 'calendar', title: 'Work Focus', desc: 'Block social media during work hours.' },
  { key: 'bedtime', icon: 'moon', title: 'Bedtime', desc: 'Wind down by blocking social + streaming.' },
  { key: 'deepwork', icon: 'braces', title: 'Deep Work', desc: 'Block everything except your allowed sites.' },
  { key: 'custom', icon: 'plus', title: 'Start from scratch', desc: 'Set up your own schedule in settings.' },
];

export function App() {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState(null);
  const [siteCount, setSiteCount] = useState(0);
  const [phraseWasSaved, setPhraseWasSaved] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [imported, setImported] = useState(null);

  useEffect(() => { loadPresets(); }, []);

  async function applyTemplate() {
    if (!selected) return;
    if (selected === 'custom') {
      await saveSettings({ onboardingComplete: true });
      window.location.href = chrome.runtime.getURL('options.html?newSchedule=1');
      return;
    }
    const { siteCount: count } = await applyTemplateToStorage(selected);
    setSiteCount(count);
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    await saveSettings({ onboardingComplete: true });
    setStep(2);
  }

  async function savePhrase() {
    const input = document.getElementById('ob-phrase-input');
    const phrase = input.value.trim();
    if (phrase) {
      await saveSettings({ passphrase: phrase, frictionLevel: 'passphrase' });
      setPhraseWasSaved(true);
    }
    setStep(3);
  }

  if (step === 1) {
    return (
      <div class="dotfield bg-bg text-ink font-sans min-h-screen py-10 px-6">
        <div class="max-w-[720px] mx-auto bg-card border border-ink p-8">
          <div class="flex items-center gap-2 mb-1">
            <Icon name="shield-check" size={24} />
            <span class="text-xl font-semibold text-ink">Just Concentrate</span>
          </div>
          <p class="text-ink-3 text-sm mb-8">Choose a template to get started, or build your own.</p>
          <div class="grid grid-cols-2 gap-3 mb-6">
            {TEMPLATE_CARDS.map(t => (
              <button
                key={t.key}
                onClick={() => setSelected(t.key)}
                class={selected === t.key
                  ? 'border-2 border-accent bg-accent-faint p-[19px] cursor-pointer text-left flex flex-col transition-colors duration-150'
                  : 'bg-card border border-rule p-5 cursor-pointer text-left flex flex-col transition-colors duration-150 hover:border-ink-3'
                }
              >
                <div class={`w-9 h-9 border ${selected === t.key ? 'border-accent-soft' : 'border-rule'} flex items-center justify-center shrink-0 text-ink-2`}>
                  <Icon name={t.icon} size={20} />
                </div>
                <div class="text-[14px] font-medium text-ink mt-3">{t.title}</div>
                <div class="text-[12px] text-ink-3 leading-snug mt-1">{t.desc}</div>
                {TEMPLATES[t.key] && (
                  <div class="mt-auto pt-4 flex flex-col gap-4">
                    <span class="chip chip-muted text-[10px] h-[20px] px-2 self-start">
                      {windowLabel(TEMPLATES[t.key].schedule.startTime, TEMPLATES[t.key].schedule.endTime)}
                    </span>
                    <div class="flex justify-between w-full">
                      {DISPLAY_ORDER.map(d => {
                        const sched = TEMPLATES[t.key].schedule;
                        const active = sched.days.length === 0 || sched.days.includes(d);
                        return (
                          <span key={d} class={`w-6 h-6 rounded-full inline-flex items-center justify-center font-mono text-[9px] font-medium ${
                            active ? 'bg-ink text-bg' : 'bg-rule-2 text-ink-4'
                          }`}>{DAY_LABELS[d]}</span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
          {imported && (
            <div class="callout mb-4" style="border-left-color: var(--color-ok); background: var(--color-ok-soft)">
              <strong>Imported {imported.lists.length} {imported.lists.length === 1 ? 'list' : 'lists'}</strong> ({imported.lists.reduce((s, l) => s + l.sites.length, 0)} sites) from {imported.source}.
            </div>
          )}

          <div class="flex justify-between items-center">
            <button
              class="text-sm text-ink-3 hover:text-ink cursor-pointer bg-transparent border-none p-0 underline underline-offset-2"
              onClick={() => setShowImport(true)}
            >
              Switching from another blocker?
            </button>
            <button class="btn btn-ink" disabled={!selected && !imported} onClick={imported ? async () => {
              await saveSettings({ onboardingComplete: true });
              setStep(2);
            } : applyTemplate}>
              Continue <Icon name="arrow-right" size={14} />
            </button>
          </div>

          <ImportModal
            visible={showImport}
            onClose={() => setShowImport(false)}
            onImported={(result) => setImported(result)}
          />
        </div>
      </div>
    );
  }

  if (step === 2) {
    const defaultPhrase = 'I am choosing deep focus over distraction right now';
    return (
      <div class="dotfield bg-bg text-ink font-sans min-h-screen py-10 px-6">
        <div class="max-w-[720px] mx-auto bg-card border border-ink p-8">
          <div class="flex items-center gap-2 mb-1">
            <Icon name="shield-check" size={24} />
            <span class="text-xl font-semibold text-ink">Your commitment phrase</span>
          </div>
          <p class="text-ink-3 text-sm mb-2">
            To override a block, you'll type this phrase. It's a moment to pause and remember why you're here.
          </p>
          <p class="text-ink-3 text-sm mb-6">
            We've set a default. Personalise it or keep it as is.
          </p>
          <input id="ob-phrase-input" class="field mb-4" type="text" value={defaultPhrase} />
          <div class="flex justify-between items-center">
            <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0"
              onClick={() => { setPhraseWasSaved(true); setStep(3); }}>
              Keep default
            </button>
            <button class="btn btn-ink" onClick={savePhrase}>
              Save <Icon name="arrow-right" size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const templateLabel = imported ? imported.source : (TEMPLATES[selected] ? TEMPLATES[selected].label : 'Custom');
  const importedSiteCount = imported ? imported.lists.reduce((s, l) => s + l.sites.length, 0) : 0;
  const displaySiteCount = imported ? importedSiteCount : siteCount;
  const scheduleCount = imported ? (imported.schedules || []).length : 1;
  return (
    <div class="dotfield bg-bg text-ink font-sans min-h-screen py-10 px-6">
      <div class="max-w-[720px] mx-auto bg-card border border-ink p-8 text-center">
        <div class="flex justify-center mb-4 text-accent">
          <Icon name="check" size={24} />
        </div>
        <div class="text-xl font-semibold text-ink mb-2">You're all set</div>
        <p class="text-ink-3 text-sm mb-6">
          {imported
            ? <>Your <strong>{templateLabel}</strong> data has been imported{phraseWasSaved ? ' and a commitment phrase is in place' : ''}.</>
            : <>Your <strong>{templateLabel}</strong> schedule is armed{phraseWasSaved ? ' and a commitment phrase is in place' : ''}.</>
          }
          {' '}Just Concentrate runs quietly in your toolbar.
        </p>
        <div class="flex justify-center gap-8 mb-8">
          <div><div class="font-mono text-lg font-semibold text-accent">{scheduleCount}</div><div class="mono-cap">{scheduleCount === 1 ? 'Schedule' : 'Schedules'}</div></div>
          <div><div class="font-mono text-lg font-semibold text-accent">{displaySiteCount}</div><div class="mono-cap">Sites</div></div>
          <div><div class="font-mono text-lg font-semibold text-accent">{phraseWasSaved ? 'On' : 'Off'}</div><div class="mono-cap">Phrase</div></div>
        </div>
        <button class="btn btn-ink" onClick={() => chrome.runtime.openOptionsPage()}>
          Open settings <Icon name="arrow-right" size={14} />
        </button>
      </div>
    </div>
  );
}
