const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun

export function DayPills({ days = [], onChange, readOnly = false }) {
  const allActive = days.length === 0;

  function toggle(dayIndex) {
    if (readOnly) return;
    if (days.includes(dayIndex)) {
      onChange(days.filter(d => d !== dayIndex));
    } else {
      onChange([...days, dayIndex]);
    }
  }

  return (
    <div class="flex gap-1">
      {DISPLAY_ORDER.map(d => {
        const active = allActive || days.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            class={`w-7 h-7 inline-flex items-center justify-center font-mono text-[10.5px] font-medium italic border ${
              active ? 'bg-accent border-accent text-white' : 'border-rule text-ink-3'
            }`}
            disabled={readOnly}
          >
            {DAY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}

export function QuickDayButtons({ onChange }) {
  return (
    <div class="flex gap-2">
      <button type="button" class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0"
        onClick={() => onChange([1, 2, 3, 4, 5])}>Weekdays</button>
      <button type="button" class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0"
        onClick={() => onChange([0, 6])}>Weekends</button>
      <button type="button" class="mono-cap hover:text-ink cursor-pointer bg-transparent border-none p-0"
        onClick={() => onChange([0, 1, 2, 3, 4, 5, 6])}>Every day</button>
    </div>
  );
}
