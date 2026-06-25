import { useState, useEffect } from 'preact/hooks';
import { getSchedules, getLists, saveSchedule, deleteSchedule } from '../../../lib/storage.js';
import { isScheduleActive } from '../../../lib/schedule-engine.js';
import { applyTemplateToStorage, TEMPLATES } from '../../../lib/templates.js';
import { Icon } from '../../../components/Icon.jsx';
import { DayPills } from '../../../components/DayPills.jsx';
import { Modal } from '../../../components/Modal.jsx';
import { ScheduleModal } from './ScheduleModal.jsx';
import { windowLabel } from '../../../lib/formatting.js';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const EMPTY_TEMPLATE_META = [
  { key: 'work', iconName: 'calendar', title: 'Work Focus', desc: 'Block social, Mon–Fri 9–5.' },
  { key: 'bedtime', iconName: 'moon', title: 'Bedtime', desc: 'Wind down, 10pm–7am.' },
  { key: 'deepwork', iconName: 'braces', title: 'Deep Work', desc: 'Hard block, allowlist only.' }
];

export function SchedulesTab({ onNavigateTab }) {
  const [schedules, setSchedules] = useState([]);
  const [lists, setLists] = useState([]);
  const autoOpen = new URLSearchParams(window.location.search).get('newSchedule') === '1';
  const [editingSchedule, setEditingSchedule] = useState(autoOpen ? null : undefined);
  const [deletingSchedule, setDeletingSchedule] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  useEffect(() => {
    refresh();
    if (autoOpen) {
      const url = new URL(window.location.href);
      url.searchParams.delete('newSchedule');
      window.history.replaceState({}, '', url.toString());
    }
    const onChange = (changes) => {
      if (changes.justConcentrate) refresh();
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [autoOpen]);

  async function refresh() {
    const [s, l] = await Promise.all([getSchedules(), getLists()]);
    setSchedules(s);
    setLists(l);
  }

  async function toggleSchedule(schedule, enabled) {
    if (!enabled && isScheduleActive(schedule)) {
      const url = chrome.runtime.getURL(
        `blocked.html?action=endFocus&schedule=${encodeURIComponent(schedule.name)}`
      );
      chrome.tabs.create({ url });
      return;
    }
    await doDisable(schedule, enabled);
  }

  async function doDisable(schedule, enabled = false) {
    const updated = { ...schedule, enabled };
    await saveSchedule(updated);
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    refresh();
  }

  function handleDelete(schedule) {
    if (schedule.enabled && isScheduleActive(schedule)) {
      const url = chrome.runtime.getURL(
        `blocked.html?action=deleteSchedule&schedule=${encodeURIComponent(schedule.name)}&scheduleId=${encodeURIComponent(schedule.id)}`
      );
      chrome.tabs.create({ url });
      return;
    }
    setDeletingSchedule(schedule);
  }

  async function confirmDelete() {
    if (!deletingSchedule) return;
    await deleteSchedule(deletingSchedule.id);
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    setDeletingSchedule(null);
    refresh();
  }

  async function applyTemplate(key) {
    setTemplateLoading(true);
    await applyTemplateToStorage(key);
    chrome.runtime.sendMessage({ type: 'refreshRules' });
    await refresh();
    setTemplateLoading(false);
  }

  return (
    <section>
      <div class="flex items-center gap-2 mb-5">
        <h2 class="text-[22px] font-medium text-ink">Schedules</h2>
        <button class="btn btn-ink ml-auto" onClick={() => setEditingSchedule(null)}>+ NEW SCHEDULE</button>
      </div>

      {schedules.length === 0 ? (
        <EmptyState onTemplate={applyTemplate} onNew={() => setEditingSchedule(null)} loading={templateLoading} />
      ) : (
        <div class="flex flex-col gap-3">
          {schedules.map(s => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              lists={lists}
              onToggle={toggleSchedule}
              onEdit={() => setEditingSchedule(s)}
              onDelete={() => handleDelete(s)}
              onNavigateTab={onNavigateTab}
            />
          ))}
        </div>
      )}

      {editingSchedule !== undefined && (
        <ScheduleModal
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(undefined)}
          onSaved={() => { setEditingSchedule(undefined); refresh(); }}
        />
      )}

      <Modal visible={!!deletingSchedule} onClose={() => setDeletingSchedule(null)} title="Delete Schedule">
        <p class="text-sm text-ink-3 mb-5">
          Are you sure you want to delete <strong class="text-ink">{deletingSchedule?.name}</strong>? This action cannot be undone.
        </p>
        <div class="flex justify-end gap-3">
          <button class="btn btn-outline" onClick={() => setDeletingSchedule(null)}>Cancel</button>
          <button class="btn bg-red-600 text-white hover:bg-red-700" onClick={confirmDelete}>Delete</button>
        </div>
      </Modal>

    </section>
  );
}

function EmptyState({ onTemplate, onNew, loading }) {
  return (
    <div class="py-10 px-2">
      <div class="text-center mb-6">
        <p class="mb-3 text-ink-4 flex justify-center"><Icon name="clipboard-list" size={32} /></p>
        <p class="text-[16px] font-semibold mb-2 text-ink">Start with a template</p>
        <p class="text-sm text-ink-3">Pick a ready-made schedule, or build your own from scratch.</p>
      </div>
      <div class="grid grid-cols-3 gap-3 mb-5">
        {EMPTY_TEMPLATE_META.map(t => {
          const tmpl = TEMPLATES[t.key];
          const sched = tmpl ? tmpl.schedule : null;
          const timeLabel = sched ? windowLabel(sched.startTime, sched.endTime) : '';
          return (
            <button
              key={t.key}
              class="bg-card border border-rule p-5 cursor-pointer text-left flex flex-col transition-colors duration-150 hover:border-ink-3"
              disabled={loading}
              onClick={() => onTemplate(t.key)}
            >
              <div class="w-9 h-9 border border-rule flex items-center justify-center shrink-0 text-ink-2">
                <Icon name={t.iconName} size={20} />
              </div>
              <div class="text-[14px] font-medium text-ink mt-3">{t.title}</div>
              <div class="text-[12px] text-ink-3 leading-snug mt-1">{t.desc}</div>
              {sched && (
                <div class="mt-auto pt-4 flex flex-col gap-3">
                  <span class="chip chip-muted text-[10px] h-[20px] px-2 self-start">{timeLabel}</span>
                  <div class="flex justify-between w-full">
                    {DISPLAY_ORDER.map(d => {
                      const on = sched.days.length === 0 || sched.days.includes(d);
                      return (
                        <span key={d} class={`w-6 h-6 rounded-full inline-flex items-center justify-center font-mono text-[9px] font-medium ${
                          on ? 'bg-ink text-bg' : 'bg-rule-2 text-ink-4'
                        }`}>{DAY_LABELS[d]}</span>
                      );
                    })}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div class="text-center">
        <button class="btn btn-outline" onClick={onNew}>+ BUILD FROM SCRATCH</button>
      </div>
    </div>
  );
}

function ScheduleCard({ schedule: s, lists, onToggle, onEdit, onDelete, onNavigateTab }) {
  const siteCount = (s.adHocSites || []).length;
  const listNames = (s.listIds || []).map(id => {
    const list = lists.find(l => l.id === id);
    return list ? list.name : null;
  }).filter(Boolean);

  let detailParts = [`${s.startTime} - ${s.endTime}`];
  if (!s.blackout) {
    const totalSites = siteCount + listNames.reduce((n, name) => {
      const list = lists.find(l => l.name === name);
      return n + (list ? list.sites.length : 0);
    }, 0);
    if (totalSites > 0) detailParts.push(`${totalSites} SITES`);
  }
  const hasListLinks = !s.blackout && listNames.length > 0;

  let typeLabel = null;
  let typeChipClass = '';
  if (s.blackout) { typeLabel = 'BLOCK EVERYTHING'; typeChipClass = 'chip-ink'; }
  else if (s.action === 'redirect') { typeLabel = 'REDIRECT'; typeChipClass = 'chip-muted'; }

  const borderClass = s.enabled ? 'border-l-2 border-l-accent' : 'border-l-2 border-l-rule';
  const nameClass = s.enabled ? 'text-ink' : 'text-ink-3';
  const detailsClass = s.enabled ? 'text-ink-3' : 'text-ink-4';
  const statusLabel = s.enabled ? 'ON' : 'OFF';

  return (
    <div class={`bg-card border border-rule p-5 flex justify-between items-center gap-4 ${borderClass}`}>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1.5">
          <span class={`text-[15px] font-semibold ${nameClass}`}>{s.name}</span>
          {typeLabel && <span class={`chip ${typeChipClass} h-6 px-2 text-[10px]`} title={s.blackout ? 'Blocks all sites except those on your permanent allowed list' : ''}>{typeLabel}</span>}
        </div>
        <div class={`mono-cap mb-2.5 ${detailsClass}`}>
          {detailParts.join(' · ')}
          {hasListLinks && (
            <>{' · '}{listNames.map((name, i) => (
              <span key={name}>
                {i > 0 && ' + '}
                <button
                  class="bg-transparent border-none p-0 cursor-pointer underline font-mono text-[10.5px] uppercase tracking-[0.07em] text-accent hover:text-accent-hover"
                  onClick={() => onNavigateTab('lists')}
                >{name}</button>
              </span>
            ))}</>
          )}
        </div>
        <DayPills days={s.days || []} readOnly />
      </div>
      <div class="flex flex-col items-center gap-1.5 shrink-0 pl-5 border-l border-rule-2">
        <span class="mono-cap">{statusLabel}</span>
        <label class="toggle">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={e => onToggle(s, e.target.checked)}
          />
          <span class="toggle-slider" />
        </label>
        <div class="flex gap-1 items-center mt-1">
          <button class="icon-btn" onClick={onEdit} title="Edit"><Icon name="pencil" size={14} /></button>
          <button class="icon-btn" onClick={onDelete} title="Delete"><Icon name="trash" size={14} /></button>
        </div>
      </div>
    </div>
  );
}
