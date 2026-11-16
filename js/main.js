/* MPAD QC Lab — site script (no dependencies) */
(function () {
  'use strict';
  var d = document, root = d.body.getAttribute('data-root') || './';
  var WA = d.body.getAttribute('data-wa') || '919000219015';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  d.documentElement.classList.remove('no-js');
  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function getJSON(path) { return fetch(root + path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw r.status; return r.json(); }); }

  /* Old single-page-app links (#/modern/...) → new pages */
  var h = location.hash;
  if (h.indexOf('#/') === 0) {
    var map = { about: 'about/', services: 'services/', projects: 'projects/', gallery: 'gallery/', equipment: 'equipment/', contact: 'contact/',
      'services/geotechnical': 'services/geotechnical-investigation/', 'services/concrete-cement': 'services/concrete-cement-testing/',
      'services/aggregate-sand': 'services/aggregate-sand-testing/', 'services/steel-testing': 'services/steel-reinforcement-testing/',
      'services/brick-block': 'services/brick-block-testing/', 'services/water-chemical': 'services/water-chemical-testing/', 'services/ndt': 'services/non-destructive-testing/' };
    var k = h.replace(/^#\/(modern|original)\/?/, '').replace(/^#\//, '');
    if (map[k]) { location.replace(root + map[k]); return; }
  }

  /* Header shadow */
  var header = $('.header');
  function onScrollHeader() { if (header) header.classList.toggle('scrolled', scrollY > 10); }
  addEventListener('scroll', onScrollHeader, { passive: true }); onScrollHeader();

  /* Dropdown (click/touch + keyboard) */
  $$('.dd > button').forEach(function (b) {
    b.addEventListener('click', function (e) {
      var dd = b.parentNode, open = !dd.classList.contains('open');
      $$('.dd.open').forEach(function (x) { x.classList.remove('open'); });
      dd.classList.toggle('open', open); b.setAttribute('aria-expanded', open); e.stopPropagation();
    });
  });
  d.addEventListener('click', function () { $$('.dd.open').forEach(function (x) { x.classList.remove('open'); x.firstElementChild.setAttribute('aria-expanded', 'false'); }); });

  /* Mobile drawer */
  var drawer = $('#drawer');
  function setDrawer(o) { if (!drawer) return; drawer.classList.toggle('open', o); d.body.style.overflow = o ? 'hidden' : ''; $('.menu-btn').setAttribute('aria-expanded', o); if (o) $('.close', drawer).focus(); }
  $$('.menu-btn').forEach(function (b) { b.addEventListener('click', function () { setDrawer(true); }); });
  $$('[data-close-drawer]').forEach(function (b) { b.addEventListener('click', function () { setDrawer(false); }); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setDrawer(false); closeLb(); } });

  /* Reveal on scroll */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;
  function watchReveal(c) { $$('.rv:not(.in)', c).forEach(function (el) { io ? io.observe(el) : el.classList.add('in'); }); }
  watchReveal();

  /* Years since founding */
  $$('[data-since]').forEach(function (el) { el.textContent = (new Date().getFullYear() - (+el.getAttribute('data-since'))) + '+'; });

  /* Count-up numbers */
  var cio = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return; cio.unobserve(e.target);
      var el = e.target, end = parseFloat(el.getAttribute('data-count')), suf = el.getAttribute('data-suffix') || '', t0 = null;
      if (reduce) { el.textContent = end + suf; return; }
      function step(t) { if (!t0) t0 = t; var p = Math.min((t - t0) / 1200, 1); el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + suf; if (p < 1) requestAnimationFrame(step); }
      requestAnimationFrame(step);
    });
  }, { threshold: .6 }) : null;
  $$('[data-count]').forEach(function (el) { cio && cio.observe(el); });

  /* Scroll-linked effects: hero parallax + flip story */
  var phs = $$('.hero-visual .ph'), story = $('.story'), card = $('.flip-card'), steps = $$('.story-steps li'), ticking = false;
  var stagesData = story ? JSON.parse(story.getAttribute('data-stages') || '[]') : [];
  var faceF = card && $('.flip-face.front', card), faceB = card && $('.flip-face.back', card), shownF = -1, shownB = -1;
  function setFace(face, i, cur) {
    if (!face || i === cur || !stagesData[i]) return cur;
    var img = $('img', face), s = stagesData[i];
    img.src = s.img; img.alt = s.alt; $('.cap b', face).textContent = 'STEP ' + (i + 1); $('.cap span', face).textContent = s.label;
    return i;
  }
  function frame() {
    ticking = false;
    var y = scrollY;
    if (phs.length && y < innerHeight * 1.2) {
      phs.forEach(function (p, i) { var k = [0.06, -0.1, 0.14][i] || 0; p.style.transform = 'translate3d(0,' + (y * k).toFixed(1) + 'px,0) rotate(' + (y * k * 0.02).toFixed(2) + 'deg)'; });
    }
    if (story && card) {
      var r = story.getBoundingClientRect(), total = r.height - innerHeight;
      var p = Math.min(Math.max(-r.top / total, 0), 1);
      var n = stagesData.length || 4, segs = n - 1, pos = p * segs, seg = Math.min(Math.floor(pos), segs - 1), t = pos - seg;
      // hold each photo face-on, then flip quickly (Apple-style "pause & turn")
      var k = Math.min(Math.max((t - 0.3) / 0.4, 0), 1), ease = k * k * (3 - 2 * k), rot = (seg + ease) * 180;
      // front face visible near 0,360…; back near 180,540…
      var fIdx = Math.min(2 * Math.floor((rot + 90) / 360), n - 1), bIdx = Math.min(2 * Math.floor((rot - 90) / 360) + 1, n - 1);
      if (bIdx < 1) bIdx = 1;
      shownF = setFace(faceF, fIdx, shownF); shownB = setFace(faceB, bIdx, shownB);
      var local = (rot % 180) / 180, tilt = Math.sin(local * Math.PI) * 8;
      card.style.setProperty('--rot', rot.toFixed(2));
      card.style.setProperty('--tilt', tilt.toFixed(2));
      card.style.setProperty('--sc', (1 - Math.sin(local * Math.PI) * 0.08).toFixed(3));
      story.style.setProperty('--p', p.toFixed(3));
      var act = Math.min(seg + (ease > 0.5 ? 1 : 0), n - 1);
      steps.forEach(function (li, i) { li.classList.toggle('active', i === act); });
    }
  }
  if (!reduce && (phs.length || story)) {
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
    addEventListener('resize', frame); frame();
  } else if (story) { steps.forEach(function (li) { li.classList.add('active'); }); }

  /* ---------- Editable data (JSON files in /data) ---------- */
  function clientHTML(c) {
    return '<div class="client' + (c.featured ? ' featured' : '') + (c.logo ? ' has-logo' : '') + '">' + (c.logo ? '<span class="lg"><img src="' + esc(root + c.logo) + '" alt="' + esc(c.name) + ' logo" loading="lazy"></span>' : '<span class="lg lg-txt">' + esc(c.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 3)) + '</span>') + '<b>' + esc(c.name) + '</b>' + (c.sector ? '<small>' + esc(c.sector) + '</small>' : '') + '</div>';
  }
  function projHTML(p) {
    var meta = [['Client', p.client], ['Location', p.location], ['Year', p.year]].filter(function (x) { return x[1]; });
    return '<article class="proj rv"><div class="img">' + (p.image ? '<img src="' + esc(root + p.image) + '" alt="' + esc(p.title) + '" loading="lazy" width="480" height="360">' : PH) + (p.category ? '<span class="tag amber">' + esc(p.category) + '</span>' : '') +
      '</div><div class="body"><h3>' + esc(p.title) + '</h3><p>' + esc(p.summary) + '</p>' + (meta.length ? '<dl>' + meta.map(function (m) { return '<dt>' + m[0] + '</dt><dd>' + esc(m[1]) + '</dd>'; }).join('') + '</dl>' : '') + '</div></article>';
  }
  /* Data boxes: the page ships with content baked in (good for Google). If the JSON file was edited
     after publishing, its signature changes and the box is re-rendered from the file. */
  function djb2(t) { var h = 5381; for (var i = 0; i < t.length; i++) h = (Math.imul(h, 33) ^ t.charCodeAt(i)) >>> 0; return String(h); }
  var cache = {};
  function loadData(file) { return cache[file] || (cache[file] = fetch(root + 'data/' + file, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw r.status; return r.text(); }).then(function (t) { return { sig: djb2(t), json: JSON.parse(t) }; })); }
  function bindData(sel, file, render) {
    $$(sel).forEach(function (box) {
      loadData(file).then(function (d) {
        if (box.getAttribute('data-sig') === d.sig) return;
        var html = render(d.json, box); if (html == null) return;
        box.innerHTML = html; watchReveal(box);
      }).catch(function () {});
    });
  }
  var PH = '<div class="ph-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/></svg></div>';
  function pic(path, alt) { return path ? '<img src="' + esc(root + path) + '" alt="' + esc(alt) + '" loading="lazy">' : PH; }
  bindData('[data-clients]', 'clients.json', function (j, box) {
    var mode = box.getAttribute('data-clients');
    var list = (j.clients || []).filter(function (c) { return c.show !== false && (mode !== 'featured' || c.featured); });
    return list.length ? list.map(clientHTML).join('') : null;
  });
  bindData('[data-projects]', 'projects.json', function (j, box) {
    var mode = box.getAttribute('data-projects');
    var list = (j.projects || []).filter(function (p) { return p.published && (mode !== 'featured' || p.featured); });
    return list.length ? list.map(projHTML).join('') : null;
  });
  bindData('[data-equipment]', 'equipment.json', function (j) {
    return (j.equipment || []).filter(function (e) { return e.published; }).map(function (e) {
      return '<article class="eq rv"><div class="img">' + pic(e.image, e.name) + '</div><div class="body"><h3>' + esc(e.name) + '</h3><p>' + esc(e.description) + '</p><div class="tests">' + (e.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div></div></article>';
    }).join('');
  });
  bindData('[data-gallery]', 'gallery.json', function (j) {
    return (j.photos || []).map(function (ph) {
      return '<button type="button" data-full="' + esc(root + ph.image) + '" data-cap="' + esc(ph.caption) + '" aria-label="Open photo: ' + esc(ph.caption) + '"><figure style="margin:0">' + pic(ph.thumb || ph.image, ph.caption) + '<figcaption>' + esc(ph.caption) + '</figcaption></figure></button>';
    }).join('');
  });
  bindData('[data-more-services]', 'more-services.json', function (j) {
    var list = (j.services || []).filter(function (m) { return m.published; });
    $$('[data-more-wrap]').forEach(function (w) { w.hidden = !list.length; });
    return list.map(function (m) {
      return '<div class="rv in"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l9 5v10l-9 5-9-5V7z"/></svg></span><h3>' + esc(m.name) + '</h3><p>' + esc(m.description) + '</p><div class="tests" style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0">' + (m.tests || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div><a href="' + root + 'contact/?service=' + encodeURIComponent(m.name) + '">Enquire →</a></div>';
    }).join('');
  });
  /* extra services also appear in every form's service list */
  if ($('select[name=service]')) loadData('more-services.json').then(function (d) {
    (d.json.services || []).filter(function (m) { return m.published; }).forEach(function (m) {
      $$('select[name=service]').forEach(function (sel) {
        if ([].some.call(sel.options, function (o) { return o.value === m.name; })) return;
        var o = new Option(m.name, m.name); sel.insertBefore(o, sel.options[sel.options.length - 1]);
      });
    });
    var sv2 = new URLSearchParams(location.search).get('service'); if (sv2) $$('select[name=service]').forEach(function (x) { x.value = sv2; });
  }).catch(function () {});

  /* NABL details + certificate file check */
  getJSON('data/nabl.json').then(function (n) {
    $$('[data-nabl]').forEach(function (el) { var k = el.getAttribute('data-nabl'); if (n[k]) el.textContent = n[k]; });
    [['certificate_file', '[data-cert-link]'], ['scope_file', '[data-scope-link]']].forEach(function (pair) {
      var file = n[pair[0]], els = $$(pair[1]);
      if (!els.length) return;
      if (!file) { els.forEach(function (a) { a.hidden = true; }); return; }
      fetch(root + file, { method: 'HEAD' }).then(function (r) {
        els.forEach(function (a) { if (r.ok) { a.href = root + file; a.hidden = false; } else a.hidden = true; });
        $$('[data-cert-fallback]').forEach(function (x) { x.hidden = r.ok || pair[0] !== 'certificate_file' ? x.hidden : false; });
      }).catch(function () { els.forEach(function (a) { a.hidden = true; }); });
    });
  }).catch(function () {});

  /* Google reviews (data/reviews.json is refreshed by api/refresh-reviews.php) */
  var rbox = $('[data-reviews]');
  if (rbox) getJSON('data/reviews.json').then(function (j) {
    var list = (j.reviews || []).slice(0, 5);
    if (j.rating) {
      $$('[data-g-rating]').forEach(function (el) { el.textContent = Number(j.rating).toFixed(1); });
      $$('[data-g-count]').forEach(function (el) { el.textContent = j.count ? j.count + ' Google reviews' : 'Google reviews'; });
      $$('[data-g-summary]').forEach(function (el) { el.hidden = false; });
    }
    if (j.maps_uri) $$('[data-g-link]').forEach(function (a) { a.href = j.maps_uri; });
    if (!list.length) return;
    rbox.innerHTML = list.map(function (r) {
      return '<figure class="review rv"><div class="stars" aria-label="' + r.rating + ' out of 5 stars">' + '★★★★★'.slice(0, r.rating) + '</div><blockquote class="mt0" style="margin:0"><p>' + esc(r.text) + '</p></blockquote>' +
        '<figcaption class="who">' + (r.photo ? '<img src="' + esc(r.photo) + '" alt="" loading="lazy" referrerpolicy="no-referrer" width="36" height="36">' : '') + '<div><b>' + (r.author_uri ? '<a href="' + esc(r.author_uri) + '" target="_blank" rel="noopener nofollow">' + esc(r.author) + '</a>' : esc(r.author)) + '</b><span>' + esc(r.relative || '') + ' · Google</span></div></figcaption></figure>';
    }).join('');
    rbox.hidden = false; watchReveal(rbox);
    $$('[data-reviews-empty]').forEach(function (el) { el.hidden = true; });
    $$('[data-reviews-note]').forEach(function (el) { el.hidden = false; });
    $$('[data-reviews-intro]').forEach(function (el) { el.hidden = true; });
  }).catch(function () {});

  /* Map facade (loads Google Maps only when asked) */
  $$('[data-map]').forEach(function (box) {
    var b = $('button', box);
    b && b.addEventListener('click', function () {
      box.innerHTML = '<iframe title="MPAD QC Lab location on Google Maps" src="' + box.getAttribute('data-map') + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>';
    });
  });

  /* Gallery lightbox (works for photos added later too) */
  var lb = $('#lightbox'), gi = 0;
  function gItems() { return $$('.gallery button'); }
  function openLb(i) { var it = gItems(); if (!it.length) return; gi = (i + it.length) % it.length; var b = it[gi]; $('img', lb).src = b.getAttribute('data-full'); $('img', lb).alt = b.getAttribute('data-cap'); $('p', lb).textContent = b.getAttribute('data-cap'); lb.classList.add('open'); $('.lb-close', lb).focus(); }
  function closeLb() { if (lb && lb.classList.contains('open')) { lb.classList.remove('open'); var it = gItems(); it[gi] && it[gi].focus(); } }
  if (lb) {
    d.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.gallery button'); if (b) openLb(gItems().indexOf(b)); });
    $('.lb-close', lb).addEventListener('click', closeLb);
    $('.lb-prev', lb).addEventListener('click', function () { openLb(gi - 1); });
    $('.lb-next', lb).addEventListener('click', function () { openLb(gi + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
    d.addEventListener('keydown', function (e) { if (!lb.classList.contains('open')) return; if (e.key === 'ArrowRight') openLb(gi + 1); if (e.key === 'ArrowLeft') openLb(gi - 1); });
  }

  /* ---------- Enquiry forms ---------- */
  var RULES = {
    name: function (v) { return v.trim().length >= 2 || 'Please enter your name.'; },
    phone: function (v) { var n = v.replace(/[\s\-()]/g, '').replace(/^(\+?91|0)/, ''); return /^[6-9]\d{9}$/.test(n) || 'Enter a valid 10-digit mobile number.'; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Enter a valid email address.'; },
    message: function (v) { return v.trim().length >= 10 || 'Please describe your requirement (at least 10 characters).'; },
    preferred_date: function (v, f) { return !isConsult(f) || !!v || 'Choose a preferred date.'; },
    preferred_time: function (v, f) { return !isConsult(f) || !!v || 'Choose a preferred time slot.'; }
  };
  function isConsult(f) { var r = $('input[name=enquiry_type]:checked', f); return r && r.value === 'Consultation booking'; }
  function check(f, el) {
    var fn = RULES[el.name]; if (!fn) return true;
    var res = fn(el.value, f), wrap = el.closest('.field');
    if (wrap) { wrap.classList.toggle('invalid', res !== true); var e = $('.err', wrap); if (e) e.textContent = res === true ? '' : res; }
    el.setAttribute('aria-invalid', res !== true);
    return res === true;
  }
  function data(f) { var o = {}; new FormData(f).forEach(function (v, k) { o[k] = typeof v === 'string' ? v.trim() : v; }); return o; }
  function waText(o, ref) {
    var lines = ['Hello MPAD QC Lab, I have an enquiry from your website.' + (ref ? ' (Ref ' + ref + ')' : ''), '',
      'Type: ' + (o.enquiry_type || 'General enquiry'), o.service ? 'Service: ' + o.service : '', 'Name: ' + (o.name || ''), o.phone ? 'Phone: ' + o.phone : '', o.email ? 'Email: ' + o.email : '',
      o.company ? 'Company: ' + o.company : '', o.location ? 'Site location: ' + o.location : '',
      o.enquiry_type === 'Consultation booking' && o.preferred_date ? 'Preferred: ' + o.preferred_date + ' ' + (o.preferred_time || '') + ' (' + (o.consult_mode || '') + ')' : '',
      o.message ? '' : '', o.message ? 'Requirement: ' + o.message : ''];
    return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(lines.filter(function (l, i) { return l !== '' || i === 1; }).join('\n'));
  }
  $$('form[data-enquiry]').forEach(function (f) {
    var status = $('.form-status', f), btn = $('button[type=submit]', f), ts = $('input[name=ts]', f);
    if (ts) ts.value = Date.now();
    function syncType() { f.classList.toggle('is-consult', isConsult(f)); var lab = $('[data-msg-label]', f); if (lab) lab.firstChild.nodeValue = isConsult(f) ? 'What would you like to discuss? ' : 'Your requirement '; }
    $$('input[name=enquiry_type]', f).forEach(function (r) { r.addEventListener('change', syncType); }); syncType();
    var dt = $('input[name=preferred_date]', f); if (dt) { var t = new Date(); t.setDate(t.getDate() + 1); dt.min = t.toISOString().slice(0, 10); }
    $$('input,select,textarea', f).forEach(function (el) {
      el.addEventListener('blur', function () { if (el.value) check(f, el); });
      el.addEventListener('input', function () { if (el.closest('.field.invalid')) check(f, el); });
    });
    var waBtn = $('[data-wa-send]', f);
    waBtn && waBtn.addEventListener('click', function () {
      var o = data(f), ok = check(f, f.elements.name);
      if (!ok) { f.elements.name.focus(); return; }
      window.open(waText(o), '_blank', 'noopener');
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); status.className = 'form-status'; status.textContent = '';
      var bad = $$('input,select,textarea', f).filter(function (el) { return !check(f, el); });
      if (bad.length) { bad[0].focus(); return; }
      var o = data(f); o.page = location.pathname; o.elapsed = ts ? Date.now() - (+ts.value || Date.now()) : 0;
      btn.disabled = true; var label = btn.innerHTML; btn.textContent = 'Sending…';
      fetch(root + 'api/enquiry.php', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(o) })
        .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Server error (' + r.status + ').' }; }); })
        .then(function (res) {
          btn.disabled = false; btn.innerHTML = label;
          if (!res.ok) {
            if (res.fields) Object.keys(res.fields).forEach(function (k) { var el = f.elements[k]; if (el) { var w = el.closest('.field'); w && w.classList.add('invalid'); var er = w && $('.err', w); if (er) er.textContent = res.fields[k]; } });
            status.className = 'form-status err'; status.innerHTML = esc(res.error || 'Something went wrong.') + ' You can also <a href="' + waText(o) + '" target="_blank" rel="noopener">send it on WhatsApp</a> or call <a href="tel:+919000219015">+91 90002 19015</a>.';
            return;
          }
          var ok = f.nextElementSibling;
          $('[data-ref]', ok).textContent = res.ref;
          $('[data-wa-after]', ok).href = waText(o, res.ref);
          $('[data-ok-email]', ok).textContent = o.email;
          f.classList.add('sent'); ok.setAttribute('tabindex', '-1'); ok.focus();
          if (window.gtag) gtag('event', 'generate_lead', { form_type: o.enquiry_type, service: o.service || 'none' });
        })
        .catch(function () {
          btn.disabled = false; btn.innerHTML = label;
          status.className = 'form-status err'; status.innerHTML = 'We couldn’t reach the server. Please <a href="' + waText(o) + '" target="_blank" rel="noopener">send it on WhatsApp</a> or call <a href="tel:+919000219015">+91 90002 19015</a>.';
        });
    });
    var again = f.nextElementSibling && $('[data-again]', f.nextElementSibling);
    again && again.addEventListener('click', function () { f.reset(); syncType(); if (ts) ts.value = Date.now(); f.classList.remove('sent'); f.elements.name.focus(); });
  });

  /* Preselect service from ?service= on contact page */
  var qs = new URLSearchParams(location.search), sv = qs.get('service'), ty = qs.get('type');
  if (sv) $$('select[name=service]').forEach(function (s) { s.value = sv; });
  if (ty) $$('input[name=enquiry_type]').forEach(function (r) { if (r.value === ty) { r.checked = true; r.dispatchEvent(new Event('change')); } });

  /* ---------- Presentation layer (v2 redesign): purely visual, no content or behaviour changes ---------- */
  /* Mark the current page in the main nav */
  var here = location.pathname.replace(/index\.html$/, '');
  $$('.nav > a').forEach(function (a) {
    var p = new URL(a.href, location.href).pathname;
    if (p.length > 1 && here.indexOf(p) === 0 && !a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page');
  });
  /* Scroll progress hairline */
  var bar = d.createElement('div'); bar.className = 'progress-bar'; bar.setAttribute('aria-hidden', 'true'); d.body.appendChild(bar);
  var pTick = false;
  function prog() { pTick = false; var h2 = d.documentElement.scrollHeight - innerHeight; bar.style.setProperty('--sp', h2 > 0 ? (scrollY / h2).toFixed(4) : 0); }
  addEventListener('scroll', function () { if (!pTick) { pTick = true; requestAnimationFrame(prog); } }, { passive: true }); prog();
  /* Gentle reveal for section headings, cards and blocks that had no reveal class */
  if (!reduce) {
    $$('.sec-head, .svc-layout .prose > h2, .test-table, .c-item, .card, .faq, .clients, .stats, .timeline li:not(.rv), .gallery').forEach(function (el, i) {
      if (el.closest('.phero, .hero, .drawer, .story') || el.classList.contains('rv')) return;
      el.classList.add('rv');
    });
    watchReveal();
  }
  /* Cursor-follow light on service cards */
  if (!reduce && matchMedia('(hover:hover)').matches) {
    d.addEventListener('pointermove', function (e) {
      var c = e.target.closest && e.target.closest('.svc'); if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* Journey (home): self-playing 3D carousel — independent of page scrolling */
  var jr = $('[data-journey]');
  if (jr) {
    var vp = $('.jr-viewport', jr), cards = $$('.jr-card', jr), rail = $$('.jr-rail li', jr);
    var stagesOrder = rail.map(function (li) { return li.getAttribute('data-stage'); });
    var n = cards.length, cur = 0, timer = 0, hover = false, inView = false, DWELL = 2600;
    jr.classList.add('jr--flow');
    var ctrl = document.createElement('div'); ctrl.className = 'jr-ctrl';
    ctrl.innerHTML = '<button type="button" data-jr="-1" aria-label="Previous service"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><div class="jr-dots" aria-hidden="true"></div><button type="button" data-jr="1" aria-label="Next service"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button><button type="button" class="jr-pp" aria-label="Pause"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg></button>';
    vp.parentNode.insertBefore(ctrl, vp.nextSibling);
    var dots = $('.jr-dots', ctrl); cards.forEach(function () { var d = document.createElement('i'); dots.appendChild(d); });
    var dotEls = $$('i', dots), pp = $('.jr-pp', ctrl), paused = reduce;
    function layout() {
      var w = cards[0].offsetWidth, gap = Math.max(14, w * 0.06);
      cards.forEach(function (c, i) {
        var d = ((i - cur) % n + n) % n; if (d > n / 2) d -= n;
        var a = Math.abs(d), sgn = d < 0 ? -1 : 1, sc = 1 - Math.min(a, 3) * 0.07;
        var x = 0; for (var k = 1; k <= Math.min(a, 3); k++) x += (w * (1 - (k - 1) * 0.07) + w * (1 - k * 0.07)) / 2 + gap - k * 10;
        x *= sgn;
        c.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,' + (-a * 70) + 'px) rotateY(' + (-sgn * Math.min(a, 2) * 9) + 'deg) scale(' + sc.toFixed(3) + ')';
        c.style.opacity = a > 2 ? 0 : a === 2 ? 0.55 : 1;
        c.style.zIndex = 50 - a; c.classList.toggle('is-center', a === 0);
        c.setAttribute('aria-hidden', a === 0 ? 'false' : 'true');
        c.style.pointerEvents = a > 1 ? 'none' : '';
      });
      dotEls.forEach(function (d, i) { d.classList.toggle('on', i === cur); });
      var st = cards[cur].getAttribute('data-stage'), idx = stagesOrder.indexOf(st);
      rail.forEach(function (li, i) { li.classList.toggle('is-on', idx >= 0 && i <= idx); });
      jr.style.setProperty('--jp', (cur / Math.max(1, n - 1)).toFixed(3));
    }
    function go(k) { cur = ((k % n) + n) % n; layout(); schedule(); }
    function schedule() { clearTimeout(timer); if (!paused && !hover && inView && !document.hidden) timer = setTimeout(function () { go(cur + 1); }, DWELL); }
    $$('[data-jr]', ctrl).forEach(function (b) { b.addEventListener('click', function () { go(cur + (+b.getAttribute('data-jr'))); }); });
    pp.addEventListener('click', function () { paused = !paused; pp.classList.toggle('is-paused', paused); pp.setAttribute('aria-label', paused ? 'Play' : 'Pause'); schedule(); });
    if (paused) { pp.classList.add('is-paused'); pp.setAttribute('aria-label', 'Play'); }
    cards.forEach(function (c, i) { c.addEventListener('click', function (e) { if (i !== cur) { e.preventDefault(); go(i); } }, true); });
    vp.addEventListener('mouseenter', function () { hover = true; clearTimeout(timer); });
    vp.addEventListener('mouseleave', function () { hover = false; schedule(); });
    vp.addEventListener('focusin', function () { hover = true; clearTimeout(timer); });
    vp.addEventListener('focusout', function () { hover = false; schedule(); });
    var sx = null; vp.addEventListener('pointerdown', function (e) { sx = e.clientX; }, { passive: true });
    vp.addEventListener('pointerup', function (e) { if (sx == null) return; var dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1)); }, { passive: true });
    vp.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; schedule(); }, { threshold: 0.35 }).observe(vp); else inView = true;
    document.addEventListener('visibilitychange', schedule);
    addEventListener('resize', layout); layout(); schedule();
  }


  /* NABL page: certificate lightbox + searchable scope of accreditation */
  $$('[data-cert-open]').forEach(function (b) {
    b.addEventListener('click', function () {
      var lb = document.createElement('div'); lb.className = 'cert-lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'NABL certificate');
      lb.innerHTML = '<button type="button" class="cert-x" aria-label="Close">×</button><img src="' + root + 'img/nabl-certificate.webp" alt="NABL certificate of accreditation, MPAD QC Lab Private Limited">';
      document.body.appendChild(lb); document.documentElement.classList.add('atlas-lock');
      requestAnimationFrame(function () { lb.classList.add('in'); });
      function close() { lb.classList.remove('in'); document.documentElement.classList.remove('atlas-lock'); setTimeout(function () { lb.remove(); }, 300); document.removeEventListener('keydown', key); }
      function key(e) { if (e.key === 'Escape') close(); }
      lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('cert-x')) close(); });
      document.addEventListener('keydown', key); $('.cert-x', lb).focus();
    });
  });
  var scopeBox = $('[data-scope-list]');
  if (scopeBox) {
    getJSON('data/nabl-scope.json').then(function (d) {
      var items = d.items || [], q = '', w = '', grp = '';
      var groups = []; items.forEach(function (it) { if (groups.indexOf(it.group) < 0) groups.push(it.group); });
      var mats = {}; items.forEach(function (it) { mats[it.material] = 1; });
      $('[data-scope-stats]').innerHTML = [[items.length, 'accredited test parameters'], [items.filter(function (i) { return i.where === 'Lab'; }).length, 'in our permanent lab'], [items.filter(function (i) { return i.where === 'Site'; }).length, 'on site'], [Object.keys(mats).length, 'materials & products']].map(function (x) { return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join('');
      var chips = $('[data-scope-chips]');
      chips.innerHTML = '<button type="button" aria-pressed="true" data-g="">All materials</button>' + groups.map(function (g) { return '<button type="button" aria-pressed="false" data-g="' + esc(g) + '">' + esc(g) + ' <i>' + items.filter(function (i) { return i.group === g; }).length + '</i></button>'; }).join('');
      function render() {
        var ql = q.toLowerCase(), list = items.filter(function (it) { return (!w || it.where === w) && (!grp || it.group === grp) && (!ql || ((it.test + ' ' + it.material + ' ' + it.method + ' ' + it.group).toLowerCase().indexOf(ql) >= 0 || (ql === 'cbr' && /california/i.test(it.test)) || (ql === 'upv' && /ultrasonic/i.test(it.test)))); });
        if (!list.length) { scopeBox.innerHTML = '<p class="scope-empty">No accredited test matches that search. <a href="' + root + 'contact/">Ask us</a>: we may still test it, outside the NABL scope.</p>'; return; }
        var by = {}; list.forEach(function (it) { (by[it.material] = by[it.material] || []).push(it); });
        scopeBox.innerHTML = Object.keys(by).map(function (m) {
          var rows = by[m];
          return '<details class="scope-g" ' + (ql || grp || Object.keys(by).length < 4 ? 'open' : '') + '><summary><span><b>' + esc(m) + '</b><small>' + esc(rows[0].group) + '</small></span><em>' + rows.length + (rows.length > 1 ? ' tests' : ' test') + '</em></summary><table class="test-table"><thead><tr><th>Test / parameter</th><th>Method</th><th>Field / Lab</th></tr></thead><tbody>' +
            rows.map(function (r) { return '<tr><td>' + esc(r.test) + '</td><td>' + esc(r.method) + '</td><td><span class="tag' + (r.where === 'Site' ? ' amber' : '') + '">' + (r.where === 'Site' ? 'Field' : 'Lab') + '</span></td></tr>'; }).join('') + '</tbody></table></details>';
        }).join('');
      }
      $('[data-scope-q]').addEventListener('input', function (e) { q = e.target.value.trim(); render(); });
      $$('[data-scope-w]').forEach(function (b) { b.addEventListener('click', function () { w = b.getAttribute('data-scope-w'); $$('[data-scope-w]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); render(); }); });
      $$('button', chips).forEach(function (b) { b.addEventListener('click', function () { grp = b.getAttribute('data-g'); $$('button', chips).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); render(); }); });
      render();
    }).catch(function () { scopeBox.innerHTML = '<p class="fine">The scope could not be loaded. <a href="' + root + 'docs/nabl-scope.pdf">Open the scope PDF</a>.</p>'; });
  }
  /* Services: "Which test do I need?" stage guide (highlights matching services) */
  var guide = $('[data-guide]'), ggrid = $('[data-guide-grid]');
  if (guide && ggrid) {
    $$('.guide-chip', guide).forEach(function (b) {
      b.addEventListener('click', function () {
        var st = b.getAttribute('data-stage');
        $$('.guide-chip', guide).forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        $$('.guide-note', guide).forEach(function (n) { n.hidden = n.getAttribute('data-stage') !== st; });
        ggrid.classList.toggle('is-filtered', !!st);
        $$('.svc', ggrid).forEach(function (c) { c.classList.toggle('is-match', !!st && (' ' + (c.getAttribute('data-stages') || '') + ' ').indexOf(' ' + st + ' ') > -1); });
      });
    });
  }
  /* Category filters for projects and equipment (built from the cards on the page) */
  function buildFilters(box, cardSel, tagSel) {
    if (!box || box.getAttribute('data-projects') === 'featured') return;
    var bar = box.previousElementSibling && box.previousElementSibling.classList.contains('filters') ? box.previousElementSibling : null;
    var cards = $$(cardSel, box); if (cards.length < 4) { if (bar) bar.remove(); return; }
    var cats = {};
    cards.forEach(function (c) { $$(tagSel, c).forEach(function (t) { var k = t.textContent.trim(); if (k) cats[k] = (cats[k] || 0) + 1; }); });
    var keys = Object.keys(cats).filter(function (k) { return cats[k] > 0; }).sort(function (a, b) { return cats[b] - cats[a]; }).slice(0, 8);
    if (keys.length < 2) return;
    if (!bar) { bar = d.createElement('div'); bar.className = 'filters'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Filter'); box.parentNode.insertBefore(bar, box); }
    bar.innerHTML = '<button type="button" aria-pressed="true" data-f="">All<b>' + cards.length + '</b></button>' + keys.map(function (k) { return '<button type="button" aria-pressed="false" data-f="' + esc(k) + '">' + esc(k) + '<b>' + cats[k] + '</b></button>'; }).join('');
    $$('button', bar).forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-f');
        $$('button', bar).forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        $$(cardSel, box).forEach(function (c) { var tags = $$(tagSel, c).map(function (t) { return t.textContent.trim(); }); c.classList.toggle('is-out', !!f && tags.indexOf(f) < 0); c.classList.add('in'); });
      });
    });
  }
  function filtersAll() { $$('[data-projects]').forEach(function (b) { buildFilters(b, '.proj', '.tag'); }); $$('[data-equipment]').forEach(function (b) { buildFilters(b, '.eq', '.tag'); }); }
  filtersAll();
  if ('MutationObserver' in window) $$('[data-projects],[data-equipment]').forEach(function (b) { new MutationObserver(filtersAll).observe(b, { childList: true }); });

  /* Process (home): light up each step as it reaches the middle of the screen; fill the meter */
  var proc = $('[data-process]');
  if (proc) {
    var psteps = $$('.pr-step', proc), meter = $$('.pr-meter li', proc), pbox = $('.pr-steps', proc);
    function procScroll() {
      var mid = innerHeight * 0.55, on = -1;
      psteps.forEach(function (st, i) { var b = st.getBoundingClientRect(); if (b.top < mid) on = i; st.classList.toggle('is-on', b.top < mid && b.bottom > innerHeight * 0.18 || reduce); });
      meter.forEach(function (li, i) { li.classList.toggle('is-on', i <= on); });
      var r = pbox.getBoundingClientRect(), p = Math.min(1, Math.max(0, (mid - r.top) / Math.max(1, r.height)));
      proc.style.setProperty('--pp', p.toFixed(3));
    }
    addEventListener('scroll', procScroll, { passive: true }); addEventListener('resize', procScroll); procScroll();
  }
})();
