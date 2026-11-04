const P = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l4-5 4 3 5-7" /></>,
  bell: <><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 003.4 0" /></>,
  file: <><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  foot: <path d="M10 22c-3 0-4.4-2.6-4-6 .4-3-1-5-1-8.5C5 4 7.6 2 11 2s5.6 2.6 5.2 6.6c-.4 4-1.6 6.9-1.6 9.4S14 22 10 22z" />,
  steps: <><path d="M5 17c-1.3 0-2-1.2-1.8-2.8.2-1.4-.5-2.4-.5-4C2.7 8.6 4 7.5 5.6 7.5s2.7 1.2 2.5 3.1c-.2 1.9-.8 3.3-.8 4.5S7 17 5 17z" /><path d="M18 13c-1.3 0-2-1.2-1.8-2.8.2-1.4-.5-2.4-.5-4C15.7 4.6 17 3.5 18.6 3.5s2.7 1.2 2.5 3.1c-.2 1.9-.8 3.3-.8 4.5S20 13 18 13z" /><path d="M4 20.5h3M17 16.5h3" /></>,
  walk: <><circle cx="13" cy="4" r="2" /><path d="M10 21l2-6 3 3v3M8 12l2-4 4 1 2 4 3 1M10 8l-1 5" /></>,
  stand: <><circle cx="12" cy="4" r="2" /><path d="M12 7v7M9 21l1.5-7h3L15 21M8 10h8" /></>,
  rest: <><path d="M3 18v-6a2 2 0 012-2h6v8M3 18h18M11 14h10v4M3 21v-3M21 21v-3" /><circle cx="6.5" cy="7" r="2" /></>,
  thermo: <><path d="M14 14.8V4a2 2 0 10-4 0v10.8a4 4 0 104 0z" /><path d="M12 9v7" /></>,
  drop: <path d="M12 2.7l5.7 5.7a8 8 0 11-11.4 0z" />,
  wifi: <><path d="M5 12.6a10 10 0 0114 0M8.5 16.1a5 5 0 017 0M2 9a15 15 0 0120 0" /><circle cx="12" cy="20" r="1" /></>,
  wifiOff: <><path d="M2 2l20 20M8.5 16.1a5 5 0 017 0M5 12.6a10 10 0 015.2-2.8M16.7 10.4A10 10 0 0119 12.6M2 9a15 15 0 014.4-2.9M10.7 5.1A15 15 0 0122 9" /><circle cx="12" cy="20" r="1" /></>,
  battery: <><rect x="2" y="7" width="17" height="10" rx="2" /><path d="M22 11v2" /></>,
  balance: <><path d="M12 3v18M5 7h14M5 7l-3 7a3.5 3.5 0 006 0zM19 7l-3 7a3.5 3.5 0 006 0z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  device: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
};
export default function Icon({ name, size, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      width={size} height={size} aria-hidden="true" {...rest}>{P[name]}</svg>
  );
}
