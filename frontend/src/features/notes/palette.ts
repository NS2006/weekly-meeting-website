/**
 * Text colors offered in the toolbar: the BLUE3 palette (styles/blue-tokens.css). The note stores the hex value
 * (the server accepts #rrggbb only), so these are the token values, not var() references. `key` names the color in
 * the word lists (notes.toolbar.colors).
 */
export const TEXT_COLORS = [
  { key: 'gray', value: '#6c757d', token: '--blue-color-neutral-600' },
  { key: 'blue', value: '#0095da', token: '--blue-color-blue-500' },
  { key: 'darkBlue', value: '#006494', token: '--blue-color-blue-700' },
  { key: 'red', value: '#e53935', token: '--blue-color-red-500' },
  { key: 'green', value: '#2e7d32', token: '--blue-color-green-500' },
  { key: 'amber', value: '#f9a825', token: '--blue-color-yellow-500' },
] as const;
