// Helper line under blocklist inputs: explains the advanced entry forms.
export function EntryHint({ error }) {
  if (error) return <p class="text-[12px] text-danger mb-3 -mt-1">{error}</p>;
  return (
    <p class="text-[12px] text-ink-4 mb-3 -mt-1 leading-relaxed">
      A domain blocks all its subdomains. Advanced: add a path like <span class="font-mono text-ink-3">youtube.com/shorts</span>,
      or <span class="font-mono text-ink-3">keyword:poker</span> to block any URL containing a word.
    </p>
  );
}
