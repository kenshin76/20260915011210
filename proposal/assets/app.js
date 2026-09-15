/* ============================================================
   웹 제안서 — 인터랙션 (의존성 없음)
   스타일.md §13.6 모션 규격
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 0. 화면 모드 3상태 (시스템 → 라이트 → 다크) ---------- */
  var MODES = ['system', 'light', 'dark'];
  var LABEL = { system: '시스템', light: '라이트', dark: '다크' };
  var mode = 'system';

  try {
    var saved = localStorage.getItem('p158459-theme');
    if (saved && MODES.indexOf(saved) > -1) mode = saved;
  } catch (e) { /* 저장소 접근 불가 — 기본값 유지 */ }

  function applyMode() {
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    var tx = document.getElementById('themeTx');
    if (tx) tx.textContent = LABEL[mode];
    var btn = document.getElementById('themeBtn');
    if (btn) btn.setAttribute('title', '화면 모드: ' + LABEL[mode] + ' (클릭하면 전환)');
  }
  applyMode();

  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      applyMode();
      try { localStorage.setItem('p158459-theme', mode); } catch (e) { /* 무시 */ }
    });
  }

  /* ---------- 1. 히어로 티커 ---------- */
  var TICK = [
    '클린 환경 신규 구축 권고', '기존 코드 0줄 유입', '복호화 권한 분리',
    '공개 웹 에디터 미사용', '결제 금액 서버 재계산', '관리자 다중 통제 7겹',
    '화면 20개', '결제 수단 4종', '회원 등급 4단계', '인수 기준 14항목',
    '승인 게이트 5회', '산출물 13종', '리스크 7건 선공개', '하자보수 6개월',
    '표준 산정 95~135 MD 대비 40 MD'
  ];
  var tick = document.getElementById('tick');
  if (tick) {
    var html = TICK.map(function (t) { return '<span>' + t + '</span>'; }).join('');
    tick.innerHTML = html + html;   /* §13.6 — 내용 2회 반복 */
  }

  /* ---------- 2. 숫자 카운터 ---------- */
  function fmt(v, dec) {
    var s = dec > 0 ? v.toFixed(dec) : String(Math.round(v));
    var p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.');
  }
  function runCounter(el) {
    if (el.dataset.done === '1') return;
    el.dataset.done = '1';
    var to = parseFloat(el.dataset.to || '0');
    var dec = parseInt(el.dataset.dec || '0', 10);
    if (reduce) { el.textContent = fmt(to, dec); return; }
    var t0 = null, DUR = 1100;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / DUR, 1);
      var e = 1 - Math.pow(1 - p, 3);            /* easeOutCubic */
      el.textContent = fmt(to * e, dec);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = fmt(to, dec);
    }
    requestAnimationFrame(step);
  }

  /* ---------- 3. 스크롤 리빌 ---------- */
  var revealables = [].slice.call(document.querySelectorAll(
    '.rv, .bars, .gantt, .h-stats, .stat, .tbl, .grid, .cards, .scr-list, .acc'
  ));
  function activate(el) {
    el.classList.add('in');
    [].slice.call(el.querySelectorAll('.ctr')).forEach(runCounter);
    if (el.classList.contains('ctr')) runCounter(el);
  }

  if (reduce || !('IntersectionObserver' in window)) {
    revealables.forEach(activate);
    [].slice.call(document.querySelectorAll('.ctr')).forEach(runCounter);
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        var d = parseInt(el.dataset.d || '0', 10);
        if (d) setTimeout(function () { activate(el); }, d);
        else activate(el);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 4. 탭 ---------- */
  [].slice.call(document.querySelectorAll('.tabs')).forEach(function (box) {
    var btns = [].slice.call(box.querySelectorAll('.tab-b button'));
    var pans = [].slice.call(box.querySelectorAll('.tab-p'));
    function select(i) {
      btns.forEach(function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      pans.forEach(function (p, k) { p.classList.toggle('on', k === i); });
      var pan = pans[i];
      if (pan) {
        [].slice.call(pan.querySelectorAll('.ctr')).forEach(runCounter);
        [].slice.call(pan.querySelectorAll('.bars, .tbl, .grid')).forEach(function (e) { e.classList.add('in'); });
      }
    }
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () { select(i); });
      b.addEventListener('keydown', function (ev) {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        ev.preventDefault();
        var n = (i + (ev.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length;
        btns[n].focus(); select(n);
      });
    });
  });

  /* ---------- 5. 상단 바 · 진행 바 · 맨 위로 ---------- */
  var topbar = document.getElementById('topbar');
  var prog = document.getElementById('prog');
  var totop = document.getElementById('totop');
  var hero = document.querySelector('.hero');
  var lastY = window.pageYOffset;
  var ticking = false;

  function onScroll() {
    var y = window.pageYOffset;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (prog) prog.style.width = (h > 0 ? Math.min(y / h, 1) * 100 : 0) + '%';

    var hh = hero ? hero.offsetHeight : 400;
    if (topbar) {
      var past = y > hh * 0.62;
      var up = y < lastY;
      topbar.classList.toggle('show', past && (up || y > hh));
    }
    if (totop) totop.classList.toggle('show', y > hh);
    lastY = y;
    spy(y);
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });

  if (totop) {
    totop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  /* ---------- 6. 스크롤스파이 ---------- */
  var navLinks = [].slice.call(document.querySelectorAll('#tbnav a'));
  var targets = navLinks.map(function (a) {
    return document.querySelector(a.getAttribute('href'));
  });
  function spy(y) {
    var cur = -1;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t && t.offsetTop - 90 <= y) cur = i;
    }
    navLinks.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
    if (cur > -1 && navLinks[cur]) {
      var a = navLinks[cur], nav = document.getElementById('tbnav');
      if (nav && nav.scrollWidth > nav.clientWidth) {
        var want = a.offsetLeft - nav.clientWidth / 2 + a.clientWidth / 2;
        if (Math.abs(nav.scrollLeft - want) > 40) nav.scrollLeft = want;
      }
    }
  }

  navLinks.forEach(function (a) {
    a.addEventListener('click', function (ev) {
      var t = document.querySelector(a.getAttribute('href'));
      if (!t) return;
      ev.preventDefault();
      window.scrollTo({ top: t.offsetTop - 54, behavior: reduce ? 'auto' : 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });

  /* ---------- 7. 인쇄 — 접힌 것을 모두 펼치고 애니메이션을 확정 ---------- */
  function finalize() {
    revealables.forEach(function (el) { el.classList.add('in'); });
    [].slice.call(document.querySelectorAll('.ctr')).forEach(runCounter);
    [].slice.call(document.querySelectorAll('.acc details')).forEach(function (d) { d.open = true; });
    [].slice.call(document.querySelectorAll('.tab-p')).forEach(function (p) { p.classList.add('on'); });
  }
  var printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', function () { finalize(); setTimeout(function () { window.print(); }, 60); });
  }
  window.addEventListener('beforeprint', finalize);

  /* ---------- 8. 초기 1회 실행 ---------- */
  onScroll();
  window.addEventListener('load', function () { setTimeout(onScroll, 40); });
})();
