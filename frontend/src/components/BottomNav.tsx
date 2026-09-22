import type { ReactNode } from 'react';
import { haptic } from '../telegram';

export interface NavItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

/**
 * Нижняя навигация. Активную вкладку подсвечивает «таблетка», которая
 * переезжает между пунктами — она одна на всю панель, поэтому движение
 * получается непрерывным, а не морганием фона у каждой кнопки.
 */
export function BottomNav<T extends string>({
  items,
  active,
  onChange,
}: {
  items: NavItem<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  const activeIndex = Math.max(
    items.findIndex((item) => item.id === active),
    0,
  );

  return (
    <nav
      className="bottom-nav"
      style={{ '--nav-count': items.length, '--nav-index': activeIndex } as React.CSSProperties}
    >
      <span className="nav-pill" aria-hidden="true" />
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav-button${item.id === active ? ' active' : ''}`}
          aria-current={item.id === active ? 'page' : undefined}
          onClick={() => {
            if (item.id !== active) haptic('tap');
            onChange(item.id);
          }}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
