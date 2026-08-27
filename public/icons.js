'use strict';
/* ================= icon library =================
   Zero-dependency inline SVG icons (stroke-based, 20x20, currentColor).
   Replaces emoji glyphs used throughout the UI so the app renders
   consistently across OS/browser combinations instead of relying on
   the platform's emoji font.
   Usage: ICONS.ambulance  -> returns an <svg> string
          icon('ambulance', 'ic') -> wraps it in a <span class="ic ...">
*/
const ICONS = {
  ambulance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V8a1 1 0 0 1 1-1h9v10"/><path d="M13 10h4.5l3.5 3.5V17h-2"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/><path d="M6.5 5.5v3M5 7h3"/></svg>',
  satellite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 12.5 5 16l3 3 3.5-3.5"/><path d="M13 8l3-3 3 3-3 3"/><path d="M11 10l3 3"/><path d="M9.5 15.5 3 22"/><path d="M15.5 4.5c2.5 1 4 2.5 5 5"/></svg>',
  hospital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="17" rx="1.5"/><path d="M12 8v6M9 11h6"/><path d="M8 21v-3h8v3"/></svg>',
  bed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="M3 18v2M21 18v2M3 12V7M9 10h3a2 2 0 0 0 0-4H6v4"/></svg>',
  family: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="7" r="2.4"/><circle cx="16" cy="7" r="2.4"/><circle cx="12.3" cy="15.2" r="1.8"/><path d="M3.5 19c.6-2.8 2.3-4.3 4.5-4.3s3.6 1.2 4.2 3M13.5 19c.4-2 1.6-3.1 3.3-3.1s2.9 1 3.4 2.6"/><path d="M9 19.5c.4-1.6 1.6-2.5 3.3-2.5s2.8.9 3.2 2.4"/></svg>',
  police: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-2.9 7.9-7 10-4.1-2.1-7-5.5-7-10V6l7-3z"/><path d="M9.2 12.2l1.9 1.9 3.6-3.8"/></svg>',
  traffic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2.5" width="8" height="16" rx="2.5"/><circle cx="12" cy="6.2" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="10.5" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="14.8" r="1.15" fill="currentColor" stroke="none"/><path d="M12 18.5V21M8.5 21h7"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5h4l1.5 2h9A1.5 1.5 0 0 1 20.5 9.5v9A1.5 1.5 0 0 1 19 20H4.5A1.5 1.5 0 0 1 3 18.5v-11z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/></svg>',
  bellOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10a6 6 0 0 1 9.6-4.8M18 10c0 4 1.5 5.5 1.5 5.5H8"/><path d="M4.5 15.5H5M10 19a2.2 2.2 0 0 0 4 0"/><path d="M3.5 3.5l17 17"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10v4h3l5.5 4V6L6 10H3z"/><path d="M14 9a3.2 3.2 0 0 1 0 6M17 6.5a6.5 6.5 0 0 1 0 11"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z"/><path d="M9 4v14M15 6v14"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="8.5" width="15" height="10" rx="2.5"/><path d="M12 8.5V5M9.5 5h5"/><circle cx="9" cy="13.3" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="13.3" r="1.1" fill="currentColor" stroke="none"/><path d="M9 17h6"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21M9 21h6"/></svg>',
  dot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 4h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 4 5.6 1.5 1.5 0 0 1 5.5 4z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  chevronUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15l7-7 7 7"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M4 18.5h16"/></svg>',
  printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8V4h10v4"/><rect x="4.5" y="8" width="15" height="8" rx="1.5"/><path d="M7 14h10v6H7v-6z"/></svg>',
  siren: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15a8 8 0 0 1 16 0v2H4v-2z"/><path d="M12 7V4M8.5 5.2 7.3 3.4M15.5 5.2l1.2-1.8"/><path d="M4 20h16"/></svg>',
  alertTriangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2.5 20h19L12 4z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.4" r="0.9" fill="currentColor" stroke="none"/></svg>',
  checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.3l2.5 2.5 5-5.2"/></svg>',
  calculator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="1.8"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>',
  barChart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M4 20h16"/></svg>',
  wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9a12.5 12.5 0 0 1 17 0"/><path d="M6.5 12.5a8 8 0 0 1 11 0"/><path d="M9.7 16a3.5 3.5 0 0 1 4.6 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>',
  wifiOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9a12.5 12.5 0 0 1 6.4-3.4M20.5 9a12.4 12.4 0 0 0-3-2.1"/><path d="M6.5 12.5a8 8 0 0 1 4.2-2.1M17.5 12.5a8 8 0 0 0-2-1.5"/><path d="M9.7 16a3.5 3.5 0 0 1 4.6 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/><path d="M2.5 3.5l19 19"/></svg>',
  keyboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="1.8"/><path d="M6.5 9.5h.01M9.5 9.5h.01M12.5 9.5h.01M15.5 9.5h.01M17.5 9.5h.01M6.5 12.5h.01M9.5 12.5h.01M12.5 12.5h.01M15.5 12.5h.01M17.5 12.5h.01"/><path d="M7 15.5h10"/></svg>',
  recordDot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>',
};

/* Returns an inline-svg icon wrapped in a <span>. cls defaults to 'ic'. */
function icon(name, cls) {
  return `<span class="${cls || 'ic'}">${ICONS[name] || ''}</span>`;
}

/* Hydrates any static markup that uses <span class="ic" data-icon="name"></span>
   placeholders instead of an inline icon() call. Safe to re-run on dynamically
   inserted content (skips elements already populated). */
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    if (ICONS[name] && !el.innerHTML) el.innerHTML = ICONS[name];
  });
}

document.addEventListener('DOMContentLoaded', () => hydrateIcons());
