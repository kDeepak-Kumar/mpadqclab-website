/* Inertial smooth scrolling on desktop (mouse/trackpad). Touch devices keep native scrolling.
   Build: npx esbuild src/smooth.js --bundle --minify --format=iife --outfile=js/smooth.js */
import Lenis from 'lenis';
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(pointer: coarse)').matches) return;
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true, anchors: { offset: -96 }, autoRaf: true, prevent: n => !!(n.closest && n.closest('.drawer, .dd-panel, .atlas-ch, .lab-side, .lightbox, .jr-viewport')) });
  window.__lenis = lenis;
  document.documentElement.classList.add('has-lenis');
})();
