import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../../../components/Icon.jsx';
import { useCountdown, formatHMS } from '../../../hooks/useCountdown.js';
import { getData } from '../../../lib/storage.js';
import { isScheduleActive, getWindowEndTimestamp } from '../../../lib/schedule-engine.js';
import { formatDaysLabel, formatTimeLabel } from '../../../lib/formatting.js';

export function BlockedState({ domain, scheduleName, onEndEarly }) {
  const [endTime, setEndTime] = useState(null);
  const [scheduleInfo, setScheduleInfo] = useState(null);
  const remaining = useCountdown(endTime);

  useEffect(() => {
    findEndTime().then(setEndTime);
    loadScheduleInfo(scheduleName).then(setScheduleInfo);
  }, [domain, scheduleName]);

  // Once the window has elapsed, redirect back to the site (once).
  const expired = !!endTime && remaining <= 0;
  useEffect(() => {
    if (!expired) return;
    const t = setTimeout(() => { window.location.href = 'https://' + domain; }, 1500);
    return () => clearTimeout(t);
  }, [expired, domain]);

  const daysLabel = scheduleInfo ? formatDaysLabel(scheduleInfo.days) : '';
  const timeLabel = scheduleInfo ? `${formatTimeLabel(scheduleInfo.startTime)}–${formatTimeLabel(scheduleInfo.endTime)}` : '';

  return (
    <div class="dotfield bg-bg text-ink font-sans min-h-screen flex items-center justify-center px-6">
      <div class="max-w-[480px] w-full bg-card border border-ink p-8 text-center">
        <div class="flex justify-center mb-4">
          <div class="w-12 h-12 border border-rule flex items-center justify-center text-ink-2">
            <Icon name="shield-check" size={24} />
          </div>
        </div>
        <div class="text-xl font-semibold text-ink mb-1">{domain}</div>
        <div class="mono-cap mb-1">{scheduleName}</div>
        {scheduleInfo && <div class="mono-cap mb-6">{daysLabel} &middot; {timeLabel}</div>}
        <div class="font-mono text-4xl font-semibold text-ink mb-8">{formatHMS(remaining)}</div>
        <div class="flex flex-col items-center gap-3">
          <button class="btn btn-ink" onClick={() => {
            chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); });
          }}>
            <Icon name="arrow-left" size={16} /> Keep me blocked
          </button>
          <button class="btn btn-warn" onClick={onEndEarly}>
            End block early <Icon name="arrow-right" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

async function findEndTime() {
  const data = await getData();
  if (!data) return null;
  const now = new Date();
  if (data.focusSession && data.focusSession.endTime > now.getTime()) return data.focusSession.endTime;
  for (const schedule of data.schedules || []) {
    if (!isScheduleActive(schedule, now)) continue;
    return getWindowEndTimestamp(schedule, now);
  }
  return null;
}

async function loadScheduleInfo(scheduleName) {
  const data = await getData();
  if (!data) return null;
  const schedule = (data.schedules || []).find(s => s.name === scheduleName);
  if (!schedule) return null;
  return { days: schedule.days || [], startTime: schedule.startTime || '', endTime: schedule.endTime || '' };
}
