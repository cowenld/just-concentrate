import { Icon } from './Icon.jsx';

export function EmptyState({ icon, title, description, children }) {
  return (
    <div class="text-center py-12">
      {icon && (
        <div class="flex justify-center mb-4 text-ink-3">
          <Icon name={icon} size={32} />
        </div>
      )}
      <div class="text-[15px] font-semibold text-ink mb-1">{title}</div>
      {description && <div class="text-sm text-ink-3 mb-6">{description}</div>}
      {children}
    </div>
  );
}
