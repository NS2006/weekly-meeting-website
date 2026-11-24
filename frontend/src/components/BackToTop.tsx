import { useEffect, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

/** How far down the page (pixels) before the button shows: about a screen. */
const SHOW_AFTER = 600;

/**
 * "Back to top" (owner, 2026-11-24): a round button at the bottom right, shown once the page is scrolled about a
 * screen down, that brings it back to the top in one press (smoothly, or at once for people who asked for less
 * motion). The keyboard focus then goes to `focusTarget` (it needs tabIndex -1), so it is not lost when the button
 * hides.
 */
export function BackToTop({ focusTarget }: { focusTarget?: RefObject<HTMLElement | null> }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setShown(window.scrollY > SHOW_AFTER));
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', check);
    };
  }, []);

  if (!shown) return null;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <button
      type="button"
      className="back-to-top"
      aria-label={t('ui.backToTop')}
      title={t('ui.backToTop')}
      onClick={() => {
        window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
        focusTarget?.current?.focus({ preventScroll: true });
      }}
    >
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
        <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="back-to-top__text">{t('ui.backToTopShort')}</span>
    </button>
  );
}
