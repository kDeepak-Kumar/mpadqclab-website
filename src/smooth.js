/* Inertial smooth scrolling on desktop (mouse/trackpad). Touch devices keep native scrolling.
   Build: npx esbuild src/smooth.js --bundle --minify --format=iife --outfile=js/smooth.js */
import Lenis from 'lenis';
// Fresh page visits always start at the top (some embedded/preview hosts carry the previous page's scroll position over)
(function () {
  let nav; try { nav = performance.getEntriesByType('navigation')[0]; } catch (e) {}
  if (location.hash || (nav && nav.type !== 'navigate')) return;
  let touched = false; const mark = () => { touched = true; };
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(e => addEventListener(e, mark, { once: true, passive: true }));
  const top = () => { if (!touched && scrollY > 0) { scrollTo(0, 0); if (window.__lenis) window.__lenis.scrollTo(0, { immediate: true }); } };
  top(); addEventListener('DOMContentLoaded', top); addEventListener('load', () => { top(); setTimeout(top, 60); });
})();
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(pointer: coarse)').matches) return;
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true, anchors: { offset: -96 }, autoRaf: true, prevent: n => !!(n.closest && n.closest('.drawer, .dd-panel, .atlas-ch, .lab-side, .lightbox, .jr-viewport')) });
  window.__lenis = lenis;
  document.documentElement.classList.add('has-lenis');
})();
