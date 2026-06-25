import { useState, useEffect } from 'preact/hooks';

export function useCountdown(endTime) {
  const [remaining, setRemaining] = useState(() =>
    endTime ? Math.max(0, endTime - Date.now()) : 0
  );

  useEffect(() => {
    if (!endTime) { setRemaining(0); return; }
    setRemaining(Math.max(0, endTime - Date.now()));
    const id = setInterval(() => {
      const r = endTime - Date.now();
      setRemaining(r > 0 ? r : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return remaining;
}

export function formatHMS(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(n => String(n).padStart(2, '0')).join(':');
}

export function formatMS(ms) {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatCooldownMMSS(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
