/**
 * Иконки нижней навигации. Рисуются линиями и красятся currentColor,
 * поэтому подхватывают цвет активной вкладки и тему Telegram сами.
 */
const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function ChartIcon() {
  return (
    <svg {...base}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M21 20H3" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7" />
      <path d="M8.5 12h7" />
    </svg>
  );
}

export function ReceiptIcon() {
  return (
    <svg {...base}>
      <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21V3Z" />
      <path d="M9.5 8h5" />
      <path d="M9.5 12h5" />
    </svg>
  );
}

export function TrophyIcon() {
  return (
    <svg {...base}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5.5v1.5A3.5 3.5 0 0 0 8 9.9" />
      <path d="M16 5h2.5v1.5A3.5 3.5 0 0 1 16 9.9" />
      <path d="M12 13v3" />
      <path d="M9 20h6" />
      <path d="M10.5 16h3l.5 4h-4l.5-4Z" />
    </svg>
  );
}

export function CameraIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1-2h7.6l1 2h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" />
    </svg>
  );
}

export function CheckIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function RetryIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M4 12a8 8 0 1 1 2.6 5.9" />
      <path d="M4 20v-5h5" />
    </svg>
  );
}

export function CloseIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function GalleryIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="m5 16 4-4 3 3 3-3 4 4" />
      <circle cx="9" cy="9.5" r="1.2" />
    </svg>
  );
}
