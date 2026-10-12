export function Modal({ visible, onClose, title, children }) {
  if (!visible) return null;

  return (
    <div
      class="fixed inset-0 bg-black/40 z-[200] flex items-start justify-center pt-16 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="bg-bg w-full max-w-xl border border-rule shadow-pop">
        <div class="flex items-center justify-between px-5 py-4 border-b border-rule">
          <span class="text-[15px] font-semibold text-ink">{title}</span>
          <button class="icon-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div class="p-5">{children}</div>
      </div>
    </div>
  );
}
