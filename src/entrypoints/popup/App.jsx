import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../../components/Icon.jsx';
import { useStorage } from '../../hooks/useStorage.js';
import { useCountdown, formatMS } from '../../hooks/useCountdown.js';
import { sendMessage } from '../../hooks/useMessage.js';
import {
  computeBlockState, evaluateUrl, isScheduleInForce, getWindowEndTimestamp,
  isFocusActive, getPomodoroPhase, getBudgetUsedSeconds, localDateKey
} from '../../lib/schedule-engine.js';
import { domainMatches, extractRegistrableDomain } from '../../lib/matching.js';
import { windowLabel } from '../../lib/formatting.js';
import { formatDuration } from '../../lib/tracking.js';
import { saveSchedule, clearSuspension, getUsage, USAGE_KEY } from '../../lib/storage.js';

function useSiteTime() {
  const [siteTime, setSiteTime] = useState({});
  useEffect(() => {
    const load = () => getUsage().then(u => setSiteTime(u.siteTime));
    load();
    const onChange = changes => { if (changes[USAGE_KEY]) load(); };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);
  return siteTime;
}

export function App() {
  const data = useStorage(d => d);
  const siteTime = useSiteTime();
  if (!data) return null;

  const { schedules, lists, focusSession, suspensions, budgets } = data;
  const state = computeBlockState({ ...data, siteTime });
  const focusActive = isFocusActive(focusSession, Date.now());

  return (
    <div class="w-[360px] bg-bg font-sans">
      <Header />
      <div class="px-4 py-4 flex flex-col gap-3">
        <StatusBar state={state} schedules={schedules} suspensions={suspensions} />
        {focusActive
          ? <FocusTimer session={focusSession} lists={lists} />
          : <FocusStart lists={lists} />
        }
        <CurrentSite schedules={schedules} state={state} budgets={budgets} siteTime={siteTime} />
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

function StatusBar({ state, schedules, suspensions }) {
  if (state.blackout) {
    return (
      <div class="border border-rule border-l-2 border-l-accent p-3 flex items-center gap-2.5 bg-card">
        <span class="w-2 h-2 rounded-pill bg-accent shrink-0" />
        <span class="font-mono text-[13px] text-ink">Blocking everything</span>
        <span class="mono-cap text-ink-3 ml-auto">{state.blackout.label}</span>
      </div>
    );
  }
  const activeSchedules = schedules.filter(s => isScheduleInForce(s, suspensions));
  if (activeSchedules.length > 0) {
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
  // Re-render each second so the Pomodoro phase flips on time.
  const sessionRemaining = useCountdown(session.endTime);
  const phase = session.pomodoro ? getPomodoroPhase(session, Date.now()) : null;
  const phaseRemaining = useCountdown(phase ? phase.phaseEnd : null);
  const remaining = phase ? phaseRemaining : sessionRemaining;
  const totalDuration = session.endTime - (session.startTime || (session.endTime - remaining));
  const elapsed = totalDuration - sessionRemaining;
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
  const phaseLabel = phase
    ? (phase.phase === 'break' ? `BREAK · ${phase.cycle}/${phase.cycles}` : `FOCUS · ${phase.cycle}/${phase.cycles}`)
    : null;

  function handleEndEarly() {
    const url = chrome.runtime.getURL('blocked.html?action=endFocus&schedule=Focus%20Now');
    chrome.tabs.create({ url });
    window.close();
  }

  return (
    <div class="bg-card border border-rule p-4">
      <div class="flex justify-between items-center mb-2">
        <span class={`font-mono text-2xl font-semibold ${phase && phase.phase === 'break' ? 'text-ok' : 'text-ink'}`}>{formatMS(remaining)}</span>
        <span class="mono-cap">{phaseLabel || totalStr}</span>
      </div>
      {phase && phase.phase === 'break' && <p class="text-[12px] text-ink-3 mb-2">Break time. Sites are unblocked until the next focus block.</p>}
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

const POMODORO_PRESETS = [
  { key: '25-5', label: '25 / 5', workMinutes: 25, breakMinutes: 5 },
  { key: '50-10', label: '50 / 10', workMinutes: 50, breakMinutes: 10 }
];

function FocusStart({ lists }) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState('countdown');
  const [duration, setDuration] = useState(null);
  const [pomodoro, setPomodoro] = useState(null);
  const [cycles, setCycles] = useState(4);
  const [selectedListIds, setSelectedListIds] = useState(() => lists.map(l => l.id));
  const [blackout, setBlackout] = useState(lists.length === 0);

  function toggleList(id) {
    setSelectedListIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function next(choice) {
    if (mode === 'countdown') setDuration(choice);
    else setPomodoro(choice);
    setStep(2);
  }

  async function start() {
    const domains = new Set();
    if (!blackout) {
      for (const list of lists) {
        if (!selectedListIds.includes(list.id)) continue;
        for (const site of list.sites) domains.add(extractRegistrableDomain(site));
      }
    }
    const payload = { blackout, domains: [...domains] };
    if (mode === 'pomodoro') {
      payload.pomodoro = { workMinutes: pomodoro.workMinutes, breakMinutes: pomodoro.breakMinutes, cycles };
    } else {
      payload.duration = duration;
    }
    await sendMessage('startFocus', payload);
  }

  if (step === 1) {
    return (
      <div class="bg-card border border-rule p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="mono-cap">Focus now</span>
          <div class="flex border border-rule">
            {['countdown', 'pomodoro'].map(m => (
              <button key={m}
                class={`px-2 h-6 font-mono text-[10px] uppercase tracking-[0.06em] cursor-pointer border-none ${mode === m ? 'bg-ink text-bg' : 'bg-transparent text-ink-3 hover:text-ink'}`}
                onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
        </div>
        {mode === 'countdown' ? (
          <div class="flex gap-1.5">
            {[15, 30, 60, 240, 1440].map(m => (
              <button key={m} class="btn btn-ink flex-1 px-0" onClick={() => next(m)}>
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
        ) : (
          <div class="flex gap-1.5">
            {POMODORO_PRESETS.map(p => (
              <button key={p.key} class="btn btn-ink flex-1 px-0" onClick={() => next(p)}>{p.label}</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const canStart = blackout || selectedListIds.length > 0;
  const sessionLabel = mode === 'pomodoro'
    ? `${pomodoro.label} × ${cycles}`
    : (duration < 60 ? `${duration}m` : `${duration / 60}h`);

  return (
    <div class="bg-card border border-rule p-4">
      <div class="flex items-center justify-between mb-3">
        <button class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0 inline-flex items-center gap-1"
          onClick={() => setStep(1)}>
          <Icon name="arrow-left" size={12} /> {sessionLabel} {mode === 'pomodoro' ? 'pomodoro' : 'session'}
        </button>
        {mode === 'pomodoro' && (
          <span class="flex items-center gap-1.5 mono-cap">
            Rounds
            <button class="icon-btn w-6 h-6" onClick={() => setCycles(c => Math.max(1, c - 1))}>−</button>
            <span class="text-ink w-3 text-center">{cycles}</span>
            <button class="icon-btn w-6 h-6" onClick={() => setCycles(c => Math.min(8, c + 1))}>+</button>
          </span>
        )}
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
      <button class="btn btn-ink w-full" disabled={!canStart} onClick={start}>
        Start {sessionLabel} {mode === 'pomodoro' ? 'pomodoro' : 'focus'}
      </button>
    </div>
  );
}

function CurrentSite({ schedules, state, budgets, siteTime }) {
  const [tab, setTab] = useState(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t));
  }, []);

  if (!tab || !tab.url || !/^https?:/.test(tab.url)) return null;

  let hostname;
  try { hostname = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { return null; }
  const firstLetter = hostname.charAt(0).toLowerCase();
  const isAllowed = state.allowlist.some(d => domainMatches(hostname, d));
  const match = evaluateUrl(tab.url, state);
  const budget = (budgets || []).find(b => b.enabled && domainMatches(hostname, b.domain));
  const budgetLeft = budget
    ? Math.max(0, budget.minutes * 60 - getBudgetUsedSeconds(siteTime, budget.domain, localDateKey()))
    : null;

  async function quickBlock() {
    let target = schedules.find(s => s.name === 'Quick blocks');
    if (!target) {
      target = { name: 'Quick blocks', days: [0,1,2,3,4,5,6], startTime: '00:00', endTime: '23:59', blackout: false, adHocSites: [], listIds: [], enabled: true };
    }
    if (!target.adHocSites) target.adHocSites = [];
    if (!target.adHocSites.includes(hostname)) target.adHocSites.push(hostname);
    // Blocking is the point: make sure the schedule is on and not paused.
    target.enabled = true;
    await saveSchedule(target);
    if (target.id) await clearSuspension(`schedule:${target.id}`);
    sendMessage('refreshRules');
  }

  return (
    <div class="flex items-center gap-2.5">
      <div class="w-7 h-7 border border-rule flex items-center justify-center font-mono text-xs text-ink-3 bg-elev shrink-0">
        {firstLetter}
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-ink truncate">{hostname}</div>
        <div class="mono-cap mt-px">
          {budgetLeft !== null ? `${formatDuration(budgetLeft)} left today` : 'CURRENT TAB'}
        </div>
      </div>
      {isAllowed && <span class="text-[13px] text-ink-3">On your allowlist</span>}
      {!isAllowed && match && <span class="text-[13px] text-ink-3 truncate max-w-[120px]">Blocked · {match.label}</span>}
      {!isAllowed && !match && (
        <button class="btn btn-ink shrink-0" onClick={quickBlock}>BLOCK SITE</button>
      )}
    </div>
  );
}
