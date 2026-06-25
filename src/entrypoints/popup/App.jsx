import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../../components/Icon.jsx';
import { useStorage } from '../../hooks/useStorage.js';
import { useCountdown, formatMS } from '../../hooks/useCountdown.js';
import { sendMessage } from '../../hooks/useMessage.js';
import { getActiveBlockedDomains, isScheduleActive, getWindowEndTimestamp } from '../../lib/schedule-engine.js';
import { domainMatches, getEffectiveBlocklist, extractRegistrableDomain } from '../../lib/matching.js';
import { windowLabel } from '../../lib/formatting.js';
import { saveSchedule } from '../../lib/storage.js';

export function App() {
  const data = useStorage(d => d);
  if (!data) return null;

  const { schedules, lists, allowlist, focusSession } = data;
  const result = getActiveBlockedDomains(schedules, lists, allowlist, focusSession);
  const focusActive = focusSession && focusSession.endTime > Date.now();

  return (
    <div class="w-[360px] bg-bg font-sans">
      <Header />
      <div class="px-4 py-4 flex flex-col gap-3">
        <StatusBar result={result} schedules={schedules} />
        {focusActive
          ? <FocusTimer session={focusSession} lists={lists} />
          : <FocusStart lists={lists} />
        }
        <CurrentSite schedules={schedules} lists={lists} allowlist={allowlist} />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div class="flex items-center justify-between px-4 py-3 border-b border-rule">
      <div class="flex items-center gap-1.5 text-ink font-semibold text-sm">
        <Icon name="shield-check" size={18} />
        <span>Just Concentrate</span>
      </div>
      <button class="icon-btn" onClick={() => chrome.runtime.openOptionsPage()}>
        <Icon name="settings" size={16} />
      </button>
    </div>
  );
}

function StatusBar({ result, schedules }) {
  if (result.blackout) {
    return (
      <div class="border border-rule border-l-2 border-l-accent p-3 flex items-center gap-2.5 bg-card">
        <span class="w-2 h-2 rounded-pill bg-accent shrink-0" />
        <span class="font-mono text-[13px] text-ink">Blocking</span>
        <span class="mono-cap text-ink-3 ml-auto">{result.scheduleName}</span>
      </div>
    );
  }
  if (result.domains && result.domains.length > 0) {
    const activeSchedules = schedules.filter(s => isScheduleActive(s));
    return (
      <div class="flex flex-col gap-2">
        {activeSchedules.map(s => (
          <ActiveScheduleRow key={s.id || s.name} schedule={s} />
        ))}
      </div>
    );
  }
  const armed = schedules.filter(s => s.enabled);
  if (armed.length === 0) {
    return (
      <div class="border border-rule p-3 flex items-center gap-2.5 bg-card">
        <span class="w-2 h-2 rounded-pill bg-ink-4 shrink-0" />
        <span class="font-mono text-[13px] text-ink-3">No schedules set up</span>
        <button class="ml-auto mono-cap text-accent hover:text-accent-hover cursor-pointer bg-transparent border-none p-0"
          onClick={() => chrome.runtime.openOptionsPage()}>
          Add schedule
        </button>
      </div>
    );
  }
  return (
    <div class="flex flex-col gap-2">
      {armed.map(s => {
        const timeLabel = windowLabel(s.startTime, s.endTime);
        return (
          <div key={s.id || s.name} class="border border-rule p-3 flex items-center gap-2.5 bg-card">
            <span class="w-2 h-2 rounded-pill bg-ink-4 shrink-0" />
            <span class="text-[13px] font-semibold text-ink truncate min-w-0">{s.name}</span>
            <span class="mono-cap text-ink-3 ml-auto shrink-0">{timeLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function ActiveScheduleRow({ schedule }) {
  const endTime = getWindowEndTimestamp(schedule);
  const remaining = useCountdown(endTime);
  const timeLabel = windowLabel(schedule.startTime, schedule.endTime);

  return (
    <div class="border border-rule border-l-2 border-l-accent p-3 flex items-center gap-2.5 bg-card">
      <span class="w-2 h-2 rounded-pill bg-accent shrink-0" />
      <span class="text-[13px] font-semibold text-ink truncate min-w-0">{schedule.name}</span>
      <span class="mono-cap text-ink-3 ml-auto flex items-center gap-2 shrink-0">
        {remaining > 0 && <span class="text-accent">{String(Math.floor(remaining / 3600000)).padStart(2, '0')}:{String(Math.floor((remaining % 3600000) / 60000)).padStart(2, '0')} left</span>}
        <span>{timeLabel}</span>
      </span>
    </div>
  );
}

function FocusTimer({ session, lists }) {
  const remaining = useCountdown(session.endTime);
  const totalDuration = session.endTime - (session.startTime || (session.endTime - remaining));
  const elapsed = totalDuration - remaining;
  const pct = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
  const totalMin = Math.floor(totalDuration / 60000);
  const totalH = Math.floor(totalMin / 60);
  const totalM = totalMin % 60;
  const totalStr = totalH > 0 ? `${totalH}:${totalM.toString().padStart(2, '0')}` : `0:${totalM.toString().padStart(2, '0')}`;
  const sessionDomains = new Set(session.domains || []);
  const matchedLists = lists.filter(l =>
    l.sites.some(s => sessionDomains.has(extractRegistrableDomain(s)))
  );
  const blockingLabel = session.blackout
    ? 'BLACKOUT MODE'
    : matchedLists.map(l => l.name).join(', ') || `${sessionDomains.size} site${sessionDomains.size !== 1 ? 's' : ''}`;

  function handleEndEarly() {
    const url = chrome.runtime.getURL('blocked.html?action=endFocus&schedule=Focus%20Now');
    chrome.tabs.create({ url });
    window.close();
  }

  return (
    <div class="bg-card border border-rule p-4">
      <div class="flex justify-between items-center mb-2">
        <span class="font-mono text-2xl font-semibold text-ink">{formatMS(remaining)}</span>
        <span class="mono-cap">{totalStr}</span>
      </div>
      <div class="h-1 bg-rule-2 mb-2">
        <div class="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div class="flex justify-between items-center">
        <span class="mono-cap">{blockingLabel}</span>
        <button class="btn btn-outline h-8 px-3 text-[10px]" onClick={handleEndEarly}>End early</button>
      </div>
    </div>
  );
}

function FocusStart({ lists }) {
  const [step, setStep] = useState(1);
  const [duration, setDuration] = useState(null);
  const [selectedListIds, setSelectedListIds] = useState(() => lists.map(l => l.id));
  const [blackout, setBlackout] = useState(lists.length === 0);

  function toggleList(id) {
    setSelectedListIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function pickDuration(minutes) {
    setDuration(minutes);
    if (lists.length === 0) {
      setBlackout(true);
      startFocus(minutes, true);
    } else {
      setStep(2);
    }
  }

  async function startFocus(minutes, forceBlackout) {
    const useBlackout = forceBlackout || blackout;
    const domains = new Set();
    if (!useBlackout) {
      for (const list of lists) {
        if (!selectedListIds.includes(list.id)) continue;
        for (const site of list.sites) domains.add(extractRegistrableDomain(site));
      }
    }
    await sendMessage('startFocus', { duration: minutes, blackout: useBlackout, domains: [...domains] });
  }

  if (step === 1) {
    return (
      <div class="bg-card border border-rule p-4">
        <div class="mono-cap mb-3">Focus now</div>
        <div class="flex gap-1.5">
          {[15, 30, 60, 240, 1440].map(m => (
            <button key={m} class="btn btn-ink flex-1 px-0" onClick={() => pickDuration(m)}>
              {m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const canStart = blackout || selectedListIds.length > 0;
  const durationLabel = duration < 60 ? `${duration}m` : `${duration / 60}h`;

  return (
    <div class="bg-card border border-rule p-4">
      <div class="flex items-center justify-between mb-3">
        <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0 inline-flex items-center gap-1"
          onClick={() => setStep(1)}>
          <Icon name="arrow-left" size={12} /> {durationLabel} session
        </button>
      </div>
      <div class="flex flex-col gap-1.5 mb-3">
        {lists.map(l => (
          <label key={l.id} class={`flex items-center gap-2 cursor-pointer ${blackout ? 'opacity-40' : ''}`}>
            <input type="checkbox"
              checked={!blackout && selectedListIds.includes(l.id)}
              onChange={() => toggleList(l.id)}
              disabled={blackout}
              class="hidden" />
            <span class="fb-check" />
            <span class="text-[13px] text-ink-2">{l.name}</span>
            <span class="mono-cap text-ink-4 ml-auto">{l.sites.length}</span>
          </label>
        ))}
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={blackout} onChange={e => setBlackout(e.target.checked)}
            class="hidden" />
          <span class="fb-check" />
          <span class="text-[13px] text-ink-2">Block everything (blackout)</span>
        </label>
      </div>
      <button class="btn btn-ink w-full" disabled={!canStart}
        onClick={() => startFocus(duration, false)}>
        Start {durationLabel} focus
      </button>
    </div>
  );
}

function CurrentSite({ schedules, lists, allowlist }) {
  const [tab, setTab] = useState(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t));
  }, []);

  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return null;
  }

  let hostname;
  try { hostname = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { return null; }
  const firstLetter = hostname.charAt(0).toLowerCase();
  const isAllowed = allowlist.some(d => domainMatches(hostname, d));
  const isBlocked = !isAllowed && schedules.some(s => {
    if (!isScheduleActive(s)) return false;
    return getEffectiveBlocklist(s, lists).some(d => domainMatches(hostname, d));
  });

  async function quickBlock() {
    let target = schedules.find(s => s.name === 'Quick blocks');
    if (!target) {
      target = { name: 'Quick blocks', days: [0,1,2,3,4,5,6], startTime: '00:00', endTime: '23:59', blackout: false, adHocSites: [], listIds: [], enabled: true };
    }
    if (!target.adHocSites) target.adHocSites = [];
    if (!target.adHocSites.includes(hostname)) {
      target.adHocSites.push(hostname);
      await saveSchedule(target);
      sendMessage('refreshRules');
    }
  }

  const favicon = (
    <div class="w-7 h-7 border border-rule flex items-center justify-center font-mono text-xs text-ink-3 bg-elev shrink-0">
      {firstLetter}
    </div>
  );
  const info = (
    <div class="flex-1 min-w-0">
      <div class="text-sm font-semibold text-ink truncate">{hostname}</div>
      <div class="mono-cap mt-px">CURRENT TAB</div>
    </div>
  );

  return (
    <div class="flex items-center gap-2.5">
      {favicon}{info}
      {isAllowed && <span class="text-[13px] text-ink-3">On your allowlist</span>}
      {isBlocked && <span class="text-[13px] text-ink-3">Currently blocked</span>}
      {!isAllowed && !isBlocked && (
        <button class="btn btn-ink shrink-0" onClick={quickBlock}>BLOCK SITE</button>
      )}
    </div>
  );
}
