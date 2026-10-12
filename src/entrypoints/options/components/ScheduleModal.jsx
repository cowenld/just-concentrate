import { useState, useEffect, useRef } from 'preact/hooks';
import { saveSchedule, getData, getLists } from '../../../lib/storage.js';
import { isScheduleInForce } from '../../../lib/schedule-engine.js';
import { DayPills } from '../../../components/DayPills.jsx';
import { normalizeEntry, formatEntry } from '../../../lib/formatting.js';
import { isScheduleWeakened } from '../../../lib/friction.js';
import { useFrictionGate } from '../../../hooks/useFrictionGate.jsx';
import { EntryHint } from './EntryHint.jsx';

function ListPicker({ lists, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div class="relative inline-block" ref={ref}>
      <button
        type="button"
        class="chip border-rule text-ink-3 cursor-pointer hover:border-ink hover:text-ink transition-colors"
        onClick={() => setOpen(!open)}
      >
        + attach list
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" class={`ml-0.5 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 bg-card border border-ink shadow-pop z-10 min-w-[180px]">
          {lists.map(l => (
            <button
              key={l.id}
              type="button"
              class="w-full text-left px-3 py-2 font-mono text-[12px] text-ink-2 hover:bg-accent-faint hover:text-accent cursor-pointer border-none bg-transparent transition-colors"
              onClick={() => { onSelect(l.id); setOpen(false); }}
            >
              {l.name} <span class="text-ink-4">({l.sites.length})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScheduleModal({ schedule, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [blackout, setBlackout] = useState(false);
  const [action, setAction] = useState('block');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [sites, setSites] = useState([]);
  const [siteInput, setSiteInput] = useState('');
  const [listIds, setListIds] = useState([]);
  const [allLists, setAllLists] = useState([]);
  const [siteError, setSiteError] = useState('');
  const { gate, frictionModal } = useFrictionGate();

  useEffect(() => {
    getLists().then(setAllLists);
    if (schedule) {
      setName(schedule.name || '');
      setDays(schedule.days || [1, 2, 3, 4, 5]);
      setStartTime(schedule.startTime || '09:00');
      setEndTime(schedule.endTime || '17:00');
      setBlackout(schedule.blackout || false);
      setAction(schedule.action || 'block');
      setRedirectUrl(schedule.redirectUrl || '');
      setSites([...(schedule.adHocSites || [])]);
      setListIds([...(schedule.listIds || [])]);
    } else {
      setName(''); setDays([1,2,3,4,5]); setStartTime('09:00'); setEndTime('17:00');
      setBlackout(false); setAction('block'); setRedirectUrl('');
      setSites([]); setListIds([]);
    }
    setSiteInput('');
  }, [schedule]);

  function addSite() {
    if (!siteInput.trim()) return;
    const val = normalizeEntry(siteInput);
    if (!val) {
      setSiteError(`“${siteInput.trim()}” isn't a domain, path or keyword: entry.`);
      return;
    }
    if (!sites.includes(val)) setSites([...sites, val]);
    setSiteInput('');
    setSiteError('');
  }

  function removeSite(i) { setSites(sites.filter((_, idx) => idx !== i)); }

  function attachList(id) {
    if (id && !listIds.includes(id)) setListIds([...listIds, id]);
  }

  function detachList(id) { setListIds(listIds.filter(lid => lid !== id)); }

  function isOvernight() {
    if (!startTime || !endTime) return false;
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    return (eH * 60 + eM) < (sH * 60 + sM);
  }

  function getSummary() {
    const n = name || 'Untitled';
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activeDays = days.length === 0 ? [0,1,2,3,4,5,6] : [...days];
    const sorted = [...activeDays].sort((a, b) => a - b);
    let daysStr;
    if (sorted.length === 7) daysStr = 'Every day';
    else if (sorted.length === 5 && sorted.join(',') === '1,2,3,4,5') daysStr = 'Weekdays';
    else if (sorted.length === 0) daysStr = 'No days';
    else daysStr = sorted.map(d => DAY_NAMES[d]).join(', ');
    const listSiteCount = listIds.reduce((n, id) => {
      const list = allLists.find(l => l.id === id);
      return n + (list ? list.sites.length : 0);
    }, 0);
    const itemCount = sites.length + listSiteCount;
    const what = blackout
      ? 'block everything except allowed sites'
      : `block ${itemCount} site${itemCount !== 1 ? 's' : ''}`;
    return `${n} · ${daysStr} · ${startTime}–${endTime} · ${what}`;
  }

  async function save() {
    if (action === 'redirect' && redirectUrl && !redirectUrl.startsWith('https://') && !redirectUrl.startsWith('http://')) {
      alert('Redirect URL must start with https:// or http://');
      return;
    }
    const sched = {
      id: schedule ? schedule.id : undefined,
      name: name.trim() || 'Untitled schedule',
      days, startTime, endTime, blackout, action,
      redirectUrl: action === 'redirect' ? redirectUrl : '',
      adHocSites: sites,
      listIds,
      enabled: true
    };
    if (startTime === endTime) {
      alert('Start and end times must be different.');
      return;
    }
    // Read fresh state at save time: a window may have started since the editor opened.
    const data = await getData();
    let existing = null;
    if (schedule && schedule.id) {
      existing = data.schedules.find(s => s.id === schedule.id) || null;
      if (existing) sched.enabled = existing.enabled;
    }
    const inForce = !!existing && isScheduleInForce(existing, data.suspensions);
    const doSave = async () => {
      await saveSchedule(sched);
      chrome.runtime.sendMessage({ type: 'refreshRules' });
      onSaved();
    };
    if (inForce && isScheduleWeakened(existing, sched)) {
      gate({
        title: 'Loosen an active schedule',
        description: `“${existing.name}” is blocking right now, and these changes block less.`,
        confirmLabel: 'Save changes'
      }, doSave);
      return;
    }
    await doSave();
  }

  const attachedLists = listIds.map(id => allLists.find(l => l.id === id)).filter(Boolean);
  const availableLists = allLists.filter(l => !listIds.includes(l.id));

  return (
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="bg-card border border-ink w-[90%] max-w-[520px] max-h-[85vh] flex flex-col shadow-pop">
        <div class="flex justify-between items-center px-6 pt-5 pb-3 shrink-0">
          <h2 class="text-[18px] font-semibold text-ink">{schedule ? 'Edit schedule' : 'New schedule'}</h2>
          <button class="bg-transparent border-none text-[24px] cursor-pointer text-ink-3 hover:text-ink px-1" onClick={onClose}>&times;</button>
        </div>
        <div class="px-6 pb-5 overflow-y-auto">
          <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5">NAME</label>
          <input type="text" value={name} onInput={e => setName(e.target.value)} class="field" placeholder="e.g. Work focus" />

          <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5 mt-4">DAYS</label>
          <DayPills days={days} onChange={setDays} />
          <div class="flex gap-1.5 mt-2">
            <button type="button" class="btn btn-outline h-[30px] px-2.5 text-[10.5px]" onClick={() => setDays([1,2,3,4,5])}>WEEKDAYS</button>
            <button type="button" class="btn btn-outline h-[30px] px-2.5 text-[10.5px]" onClick={() => setDays([0,1,2,3,4,5,6])}>EVERY DAY</button>
            <button type="button" class="btn btn-outline h-[30px] px-2.5 text-[10.5px]" onClick={() => setDays([0,6])}>WEEKENDS</button>
          </div>

          <div class="flex gap-4 mt-2">
            <div class="flex-1">
              <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5 mt-4">START</label>
              <input type="time" value={startTime} onInput={e => setStartTime(e.target.value)} class="field" />
            </div>
            <div class="flex-1">
              <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5 mt-4">END</label>
              <input type="time" value={endTime} onInput={e => setEndTime(e.target.value)} class="field" />
            </div>
          </div>
          {isOvernight() && <p class="text-[13px] text-warn mt-1.5">Overnight, ends the next morning</p>}

          <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5 mt-4">BLOCK THESE SITES</label>
          <div class="mb-3">
            <label class="text-sm flex items-center gap-2 cursor-pointer text-ink-2">
              <input type="checkbox" checked={blackout} onChange={e => setBlackout(e.target.checked)} />
              Block everything except allowed sites
            </label>
          </div>

          {!blackout && (
            <div>
              <div class="flex gap-2 mb-3">
                <input
                  type="text"
                  value={siteInput}
                  onInput={e => { setSiteInput(e.target.value); setSiteError(''); }}
                  onKeyDown={e => e.key === 'Enter' && addSite()}
                  class="field flex-1"
                  placeholder="e.g. youtube.com"
                />
                <button class="btn btn-outline" onClick={addSite}>ADD</button>
              </div>
              <EntryHint error={siteError} />
              <div class="flex flex-wrap gap-1.5 min-h-8">
                {sites.map((site, i) => (
                  <span key={site + i} class="chip">
                    {formatEntry(site)}
                    <button class="chip-remove" onClick={() => removeSite(i)}>&times;</button>
                  </span>
                ))}
              </div>

              <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5 mt-4">ATTACH LISTS</label>
              <div class="flex flex-wrap gap-1.5 min-h-8">
                {attachedLists.map(l => (
                  <span key={l.id} class="chip border-accent-soft bg-accent-faint text-accent">
                    {l.name} · {l.sites.length} sites
                    <button class="chip-remove" onClick={() => detachList(l.id)}>&times;</button>
                  </span>
                ))}
                {availableLists.length > 0 && (
                  <ListPicker lists={availableLists} onSelect={attachList} />
                )}
              </div>
            </div>
          )}

          <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5 mt-4">ACTION</label>
          <div class="flex gap-4">
            <label class="text-sm flex items-center gap-1.5 cursor-pointer text-ink-2">
              <input type="radio" name="sched-action" value="block" checked={action === 'block'} onChange={() => setAction('block')} />
              Show block page
            </label>
            <label class="text-sm flex items-center gap-1.5 cursor-pointer text-ink-2">
              <input type="radio" name="sched-action" value="redirect" checked={action === 'redirect'} onChange={() => setAction('redirect')} />
              Redirect to URL
            </label>
          </div>
          {action === 'redirect' && (
            <input type="url" value={redirectUrl} onInput={e => setRedirectUrl(e.target.value)} class="field mt-2" placeholder="https://example.com" />
          )}

          <label class="block font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3 mb-1.5 mt-4">SUMMARY</label>
          <p class="text-sm text-ink-2 bg-bg py-2.5 px-3.5 border border-rule leading-relaxed">{getSummary()}</p>
        </div>
        <div class="flex justify-end gap-2 px-6 pb-5 pt-3 border-t border-rule shrink-0">
          <button class="btn btn-ghost" onClick={onClose}>CANCEL</button>
          <button class="btn btn-ink" onClick={save}>SAVE SCHEDULE</button>
        </div>
      </div>
      {frictionModal}
    </div>
  );
}
