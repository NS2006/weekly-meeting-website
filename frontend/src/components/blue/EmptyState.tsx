import type { ReactNode } from 'react';

// BLUE3 BEmptyState → BlueEmptyState (no plugin template yet). `icon` is the image slot, `action` a button below.
export function BlueEmptyState({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="blue-empty">
      {icon ? (
        <span className="blue-empty__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <p className="blue-empty__title">{title}</p>
      {children ? <div className="muted">{children}</div> : null}
      {action ? <div className="blue-empty__action">{action}</div> : null}
    </div>
  );
}
