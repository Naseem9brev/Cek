/** Inline SVG icons — 16×16, currentColor */

export const ICONS = {
  graph: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="4" cy="4" r="2.5" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="4" r="2.5" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="12" r="2.5" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 5.5L7 10M10.5 5.5L9 10M6 4h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  settings: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  pin: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5l1.2 4.5H13l-3.5 2.5 1.2 4.5L8 10.5 5.3 13l1.2-4.5L3 6h3.8L8 1.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 5.5V4a1.5 1.5 0 00-1.5-1.5H4A1.5 1.5 0 002.5 4v5A1.5 1.5 0 004 10.5h1.5" stroke="currentColor" stroke-width="1.2"/></svg>`,
  delete: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  more: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="4" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/></svg>`,
  memory: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8a5 5 0 0110 0c0 2.5-1.5 4-3 5l-.5 2.5H6.5L6 13c-1.5-1-3-2.5-3-5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  chevron: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  mark: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="5" cy="5" r="2.2" fill="currentColor" opacity="0.85"/><circle cx="13" cy="5" r="2.2" fill="currentColor" opacity="0.65"/><circle cx="9" cy="13" r="2.2" fill="currentColor"/><path d="M6.5 6.2L8 11M11.5 6.2L10 11" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.5"/></svg>`,
  sparkles: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5l.8 3.2L12 6l-3.2 1.3L8 10.5 7.2 7.3 4 6l3.2-1.3L8 1.5z" fill="currentColor"/><path d="M13 10l.5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5.5-2z" fill="currentColor" opacity="0.7"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;

export function iconHtml(name: IconName): string {
  return ICONS[name];
}
