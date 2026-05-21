// Client-side tracking for the audit micro-site.
// Fires open + scroll_depth + section_dwell + click events to /api/track/audit-event
// which calls S019 engagement-tracker server-side.

(function () {
  var hash = (location.pathname.match(/\/audit\/[^/]+\/([^/?#]+)/) || [])[1];
  if (!hash) return;

  function post(event_type, extra) {
    var body = Object.assign({ hash: hash, event_type: event_type, ts: Date.now(), referer: document.referrer || null, user_agent: navigator.userAgent }, extra || {});
    try { navigator.sendBeacon('/api/track/audit-event', new Blob([JSON.stringify(body)], { type: 'application/json' })); }
    catch (e) { fetch('/api/track/audit-event', { method: 'POST', body: JSON.stringify(body), keepalive: true }).catch(function(){}); }
  }

  // 1. open
  post('open');

  // 2. scroll_depth (25/50/75/100)
  var marks = [25, 50, 75, 100]; var hit = {};
  window.addEventListener('scroll', function () {
    var max = (window.scrollY + window.innerHeight) / document.body.scrollHeight * 100;
    marks.forEach(function (m) { if (max >= m && !hit[m]) { hit[m] = true; post('scroll_depth', { scroll_pct: m }); } });
  }, { passive: true });

  // 3. section dwell
  var sections = document.querySelectorAll('section[id]');
  var dwellStart = {};
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var id = e.target.id;
        if (e.isIntersecting) dwellStart[id] = performance.now();
        else if (dwellStart[id]) {
          var dwell = Math.round(performance.now() - dwellStart[id]);
          if (dwell > 1500) post('section_dwell', { section_id: id, dwell_ms: dwell });
          delete dwellStart[id];
        }
      });
    }, { threshold: 0.6 });
    sections.forEach(function (s) { io.observe(s); });
  }

  // 4. high-intent click tracking
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-track]');
    if (!t) return;
    post(t.getAttribute('data-track'));
  });

  // 5. cal.com iframe open (the closing event)
  var calIframes = document.querySelectorAll('iframe[src*="cal.com"]');
  calIframes.forEach(function (f) { post('cal_iframe_open', { section_id: f.closest('section')?.id || null }); });

  // 6. PDF link click
  document.querySelectorAll('a[href$=".pdf"]').forEach(function (a) {
    a.addEventListener('click', function () { post('pdf_download', { href: a.href }); });
  });
})();
