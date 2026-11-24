/** Links open web pages or write an email: http, https and mailto only (the server drops anything else). */
export function isSafeHref(href: string): boolean {
  try {
    const { protocol } = new URL(href.trim());
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

/**
 * What the person typed in the link box, as an address: "example.com/x" becomes "https://example.com/x" and
 * "someone@example.com" becomes a mailto link. Null when it cannot be a safe link.
 */
export function normalizeLink(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  let href = text;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    href = /^[^@/]+@[^@/]+\.[^@/]+$/.test(text) ? `mailto:${text}` : `https://${text.replace(/^\/+/, '')}`;
  }
  if (!isSafeHref(href)) return null;
  // A web address needs a dot in its host ("https://intranet" is most likely a typo).
  if (/^https?:/i.test(href) && !new URL(href).hostname.includes('.') && new URL(href).hostname !== 'localhost') return null;
  return href;
}
