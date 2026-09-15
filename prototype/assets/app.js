/* ============================================================
   상품권 스토어 — 라우터 · 화면 · 상호작용
   자바스크립트 라이브러리 의존성 없음 (웹폰트 2종만 외부 CDN).
   데이터는 assets/data.js 의 목 데이터입니다.
   ============================================================ */
(function () {
  'use strict';

  var D = window.DB;
  var S = {                       // 브라우저 세션 상태
    grade: 'full',
    login: true,
    admin: false,
    userPhone: '01028410007',
    userPassword: 'Gift!2026',
    products: JSON.parse(JSON.stringify(D.PRODUCTS)),
    orders: JSON.parse(JSON.stringify(D.ORDERS)),
    settings: JSON.parse(JSON.stringify(D.SETTINGS)),
    stock: JSON.parse(JSON.stringify(D.STOCK)),
    popups: JSON.parse(JSON.stringify(D.POPUPS)),
    members: JSON.parse(JSON.stringify(D.MEMBERS)),
    deposits: JSON.parse(JSON.stringify(D.DEPOSITS)),
    alimtalk: JSON.parse(JSON.stringify(D.ALIMTALK)),
    reveal: {},                   // orderId -> { until }
    revealHits: [],               // 현재 계정의 최근 요청 시각 (10분 창)
    revealServerHits: [],         // 서버 전체 최근 요청 시각 (10분 창)
    revealLog: [],
    draft: null,
    otp: ''
  };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ───────── 유틸 ───────── */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function won(n) { return Number(n).toLocaleString('ko-KR') + '원'; }
  function P(id) { for (var i = 0; i < S.products.length; i++) if (S.products[i].id === +id) return S.products[i]; return null; }
  function O(id) { for (var i = 0; i < S.orders.length; i++) if (S.orders[i].id === id) return S.orders[i]; return null; }
  function M(k) { for (var i = 0; i < D.METHODS.length; i++) if (D.METHODS[i].key === k) return D.METHODS[i]; return null; }
  function G() { return D.GRADES[S.grade]; }
  function group4(s) { return s.replace(/(.{4})(?=.)/g, '$1 '); }
  function mask(code) { return group4('•'.repeat(code.replace(/-/g, '').length)); }
  function maskTail(tail) { return group4('•'.repeat(12) + tail); }
  function now() {
    var d = new Date();
    function z(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' +
           z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 2900);
  }
  /* 상품 상태를 재고·노출에서 파생한다 (고정 라벨을 쓰지 않는다) */
  function tagOf(p) {
    if (!p.visible) return { t: '노출 중지', c: 'off' };
    if (p.stock <= 0) return { t: '품절', c: 'off' };
    if (p.bizOnly) return { t: '비즈 전용', c: 't' };
    if (p.stock < 20) return { t: '재고 임박', c: 'g' };
    if (p.accountMode === 'instant') return { t: '즉시 구매', c: 'v' };
    return { t: '판매중', c: 'v' };
  }
  function priceOf(p, mk) { return p.prices[mk || 'card']; }
  function lowPrice(p) {
    var prices = D.METHODS.filter(function (m) {
      return buyCheck(p, m.key).ok;
    }).map(function (m) { return p.prices[m.key]; });
    return prices.length ? Math.min.apply(Math, prices) : p.face;
  }

  /* ───────── 구매 가능 판정 ───────── */
  function buyCheck(p, mk) {
    var g = G();
    if (!p.visible) return { ok: false, why: '판매 노출이 중지된 상품입니다' };
    if (!S.settings.methodOn[mk]) return { ok: false, why: '관리자 설정에서 사용 중지된 결제 수단입니다' };
    if (!p.methods[mk]) return { ok: false, why: '이 상품에서 사용하지 않는 결제 수단입니다' };
    if (p.stock <= 0) return { ok: false, why: '재고가 소진되어 구매하실 수 없습니다' };
    if (p.bizOnly && g.key !== 'biz') return { ok: false, why: '비즈 등급 회원만 구매하실 수 있는 상품입니다' };
    if (g.key === 'biz' && !p.bizOnly) return { ok: false, why: '비즈회원은 비즈 전용 상품만 구매하실 수 있습니다' };
    if (mk === 'account') {
      if (g.account === 'none') return { ok: false, why: '카드승인회원은 계좌결제를 이용하실 수 없습니다' };
      if (g.account === 'instant-only' && p.accountMode !== 'instant')
        return { ok: false, why: '비승인회원은 「즉시 구매 가능」으로 지정된 상품만 계좌결제하실 수 있습니다' };
    }
    return { ok: true, why: '' };
  }
  function anyBuyable(p) {
    for (var i = 0; i < D.METHODS.length; i++) if (buyCheck(p, D.METHODS[i].key).ok) return true;
    return false;
  }
  /* 결제 금액 — 서버가 상품 마스터 단가와 수량으로 다시 계산한다 */
  function payAmount(p, qty, mk) {
    var base = priceOf(p, mk) * qty;
    var fee = mk === 'phone' ? Math.round(base * S.settings.feePhone / 100) : 0;
    return { base: base, fee: fee, total: base + fee };
  }
  /* 카드+휴대폰 합계 한도 (통신사 수수료를 포함한 결제 예정 금액 기준) */
  function limitCheck(p, qty, mk) {
    if (!M(mk).limited) return { ok: true, lim: 0, amt: 0 };
    var a = payAmount(p, qty, mk).total;
    return { ok: a <= S.settings.limitCardPhone, lim: S.settings.limitCardPhone, amt: a };
  }

  /* ───────── 레이아웃 조각 ───────── */
  function header(route) {
    var g = G();
    var nav = [['#/', '홈'], ['#/products', '상품권'], ['#/orders', '주문 내역'],
               ['#/mypage', '마이페이지'], ['#/terms', '이용안내']];
    return '<header class="hd"><div class="wrap hd-in">' +
      '<a class="logo" href="#/"><b>상품권 스토어</b><i>GIFT SHOP</i></a>' +
      '<nav class="gnb">' + nav.map(function (n) {
        var on = (n[0] === '#/' ? route === '/' : route.indexOf(n[0].slice(1)) === 0);
        return '<a href="' + n[0] + '"' + (on ? ' class="on"' : '') + '>' + n[1] + '</a>';
      }).join('') + '</nav>' +
      '<div class="hd-act">' +
        '<a class="main-return" href="../index.html" aria-label="제안 자료 메인으로">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V20h-5v-5.5H9V20H4z"></path></svg>' +
          '<span>메인으로</span></a>' +
        '<span class="gradechip"><i class="dot"></i>내 등급 <b>' + esc(g.name) + '</b></span>' +
        (S.login ? '<a class="lk" href="#/mypage">내 정보</a>' : '<a class="lk" href="#/login">로그인</a>') +
      '</div></div></header>';
  }

  function footer() {
    return '<footer class="ft"><div class="wrap">' +
      '<div class="ft-top">' +
        '<div class="ft-brand"><b>상품권 스토어</b>' +
        '<p>마음을 전하는 가장 간편한 방법.<br>다양한 모바일 상품권을 원하는 결제 수단으로 만나보세요.</p></div>' +
        '<div><h4>상품권</h4><ul>' + S.products.map(function (p) {
          return '<li><a href="#/product/' + p.id + '">' + esc(p.brand) + '</a></li>'; }).join('') + '</ul></div>' +
        '<div><h4>이용</h4><ul>' +
          '<li><a href="#/orders">주문 내역</a></li><li><a href="#/mypage">마이페이지</a></li>' +
          '<li><a href="#/login">로그인</a></li><li><a href="#/join">회원가입</a></li>' +
          '<li><a href="#/admin">관리자 로그인</a></li></ul></div>' +
        '<div><h4>안내</h4><ul>' +
          '<li><a href="#/terms">이용약관</a></li><li><a href="#/privacy">개인정보처리방침</a></li></ul></div>' +
      '</div>' +
      '<div class="ft-btm"><span>© 2026 상품권 스토어. All rights reserved.</span>' +
      '<span>고객센터 평일 09:00–18:00 · 주말 및 공휴일 휴무</span></div>' +
      '</div></footer>';
  }

  function crumb(items) {
    return '<div class="wrap"><div class="crumb">' + items.map(function (it, i) {
      return (i ? ' <span>›</span> ' : '') + (it[1] ? '<a href="' + it[1] + '">' + esc(it[0]) + '</a>' : esc(it[0]));
    }).join('') + '</div></div>';
  }

  /* ───────── 01 메인 ───────── */
  function vHome() {
    var s0 = D.STORIES[0];
    var live = S.popups.filter(function (x) { return x.on; });
    return header('/') +
    '<section class="hero">' +
      '<img class="bg" src="assets/img/hero-giftcards-v3.webp" alt="종이 상품권과 카드 상품권으로 구성한 보안 상품권 스토어 이미지">' +
      '<div class="wrap hero-in">' +
        '<span class="kicker">GIFT FOR EVERY MOMENT</span>' +
        '<h1 class="ser">마음을 전하는 가장 간편한 방법</h1>' +
        '<p class="lead">일상의 작은 감사부터 특별한 축하까지, 필요한 상품권을 원하는 결제 수단으로 편리하게 구매하세요. 결제가 끝나면 주문 내역에서 안전하게 확인하실 수 있습니다.</p>' +
        '<div class="hero-cta">' +
          '<a class="btn v" href="#/products">상품권 보러 가기</a>' +
          '<a class="btn lt" href="#/orders">구매 내역 확인</a>' +
        '</div>' +
        '<div class="hero-meta">' +
          '<div><span class="k">상품 라인업</span><span class="v">5종</span></div>' +
          '<div><span class="k">결제 방식</span><span class="v">4가지</span></div>' +
          '<div><span class="k">상품권 발급</span><span class="v">결제 후</span></div>' +
          '<div><span class="k">번호 확인</span><span class="v">본인 인증</span></div>' +
        '</div>' +
      '</div>' +
    '</section>' +

    (live.length ? '<div class="wrap">' +
      '<div class="note ink rv" style="margin:18px 0 0"><b>공지</b> · ' + esc(live[0].title) +
      ' <span style="color:var(--faint)">(' + esc(live[0].from) + ' ~ ' + esc(live[0].to) + ')</span></div>' +
      '</div>' : '') +

    '<section class="sec"><div class="wrap">' +
      '<div class="sec-h rv"><h2>지금 인기 있는 상품권</h2><a class="more" href="#/products">전체 상품 보기 →</a></div>' +
      '<div class="prod-grid rv">' + S.products.filter(function (p) { return p.visible; }).map(cardHTML).join('') + '</div>' +
    '</div></section>' +

    '<section class="sec tint"><div class="wrap">' +
      '<div class="sec-h rv"><h2>상품권 이용 가이드</h2><span class="more">구매 전에 알아두면 좋은 이야기</span></div>' +
      '<div class="feat rv">' +
        '<a class="feat-main" href="' + s0.to + '">' +
          '<img src="' + s0.img + '" alt="' + esc(s0.alt) + '">' +
          '<div class="cap"><span class="kicker">' + esc(s0.kicker) + '</span>' +
          '<h3>' + esc(s0.title) + '</h3><p>' + esc(s0.lead) + '</p></div>' +
        '</a>' +
        '<div class="feat-side">' + D.STORIES.slice(1).map(function (s) {
          return '<a class="story-r" href="' + s.to + '"><img src="' + s.img + '" alt="' + esc(s.alt) + '">' +
            '<div><span class="kk">' + esc(s.kicker) + '</span><h4>' + esc(s.title) + '</h4>' +
            '<p>' + esc(s.lead) + '</p></div></a>';
        }).join('') +
        '<div class="story-r" style="grid-template-columns:1fr">' +
          '<div><span class="kk">회원 안내</span><h4 style="margin-bottom:8px">회원 등급별 이용 혜택</h4>' +
          '<p style="margin-bottom:10px">회원 등급에 따라 구매 가능한 상품과 결제 수단이 달라질 수 있습니다.</p>' +
          '<a class="btn gh sm" href="#/mypage">내 등급과 혜택 보기</a></div>' +
        '</div>' +
      '</div>' +
    '</div></section>' +

    '<section class="band"><img class="bg" src="assets/img/band.svg" alt="">' +
      '<div class="wrap band-in">' +
        '<div class="rv"><span class="kicker">EASY PAYMENT</span>' +
        '<h2>원하는 방식으로 간편하게 결제하세요</h2>' +
        '<p>상품과 회원 등급에 따라 계좌·카드·휴대폰·토스 간편계좌 중 이용 가능한 결제 수단을 한눈에 비교할 수 있습니다.</p>' +
        '<div style="margin-top:20px"><a class="btn lt" href="#/product/1">상품권 구매하기</a></div></div>' +
        '<ul class="rv">' + D.METHODS.map(function (m) {
          return '<li><span><b style="color:#fff">' + esc(m.name) + '</b> — ' + esc(m.badge) + '</span></li>'; }).join('') +
        '</ul>' +
      '</div>' +
    '</section>' +

    '<section class="sec journey"><div class="wrap">' +
      '<div class="sec-h rv"><div><span class="kicker" style="color:var(--verm)">PURCHASE GUIDE</span>' +
      '<h2 style="margin-top:10px">상품권 구매, 어렵지 않아요</h2></div>' +
      '<a class="more" href="#/terms">이용안내 보기 →</a></div>' +
      '<div class="demo-flow rv">' +
        '<article><span class="step">STEP 1</span><h3>상품권 선택</h3>' +
        '<p>원하는 브랜드와 권종, 남은 수량과 회원 혜택을 확인하세요.</p>' +
        '<a class="btn gh sm" href="#/products">상품권 둘러보기</a></article>' +
        '<article><span class="step">STEP 2</span><h3>결제 수단 선택</h3>' +
        '<p>이용 가능한 결제 수단과 판매가를 비교하고 주문을 완료하세요.</p>' +
        '<a class="btn gh sm" href="#/product/1">결제 정보 보기</a></article>' +
        '<article class="featured"><span class="step">STEP 3</span><h3>상품권 번호 확인</h3>' +
        '<p>결제 완료 후 주문 내역에서 본인 인증을 거쳐 번호를 확인하세요.</p>' +
        '<a class="btn v sm" href="#/orders">주문 내역 보기</a></article>' +
        '<article><span class="step">MEMBERSHIP</span><h3>회원 혜택 확인</h3>' +
        '<p>내 회원 등급과 구매 가능 범위, 번호 확인 상태를 확인하세요.</p>' +
        '<a class="btn gh sm" href="#/mypage">마이페이지 열기</a></article>' +
      '</div>' +
    '</div></section>' + footer();
  }

  function cardHTML(p) {
    var sold = p.stock <= 0;
    var buyable = anyBuyable(p);
    var tg = tagOf(p);
    return '<a class="card' + (!buyable ? ' soldout' : '') + '" href="#/product/' + p.id + '">' +
      '<span class="tagline ' + tg.c + '">' + esc(tg.t) + '</span>' +
      '<span class="th"><img src="' + p.img + '" alt="' + esc(p.name) + '"></span>' +
      '<span class="bd"><span class="br">' + esc(p.brand) + '</span>' +
      '<h3>' + esc(p.name) + '</h3>' +
      '<span class="st">' + (sold ? '품절 · 구매 차단' : !buyable ? '현재 등급에서 구매 불가' : '남은 수량 ' + p.stock.toLocaleString('ko-KR') + '장') + '</span>' +
      (buyable ? '<span class="pr"><b>' + won(lowPrice(p)) + '</b><s>' + won(p.face) + '</s></span>'
               : '<span class="pr"><b>구매 불가</b></span>') + '</span></a>';
  }

  /* ───────── 02 상품 목록 ───────── */
  function vProducts() {
    return header('/products') + crumb([['홈', '#/'], ['상품권']]) +
      '<div class="wrap page-h"><h1 class="ser">상품권 전체보기</h1>' +
      '<p>선물할 분과 사용 목적에 맞는 상품권을 골라보세요. 표시된 금액은 이용 가능한 결제 수단 중 <b>가장 낮은 판매가</b>이며, 품절 상품은 재입고 후 구매하실 수 있습니다.</p></div>' +
      '<section class="sec"><div class="wrap">' +
      '<div class="prod-grid rv">' + S.products.map(cardHTML).join('') + '</div>' +
      '<div class="note teal rv"><b>지금 등급은 ' + esc(G().name) + '입니다.</b> ' + esc(G().note) + '</div>' +
      '</div></section>' + footer();
  }

  /* ───────── 03 상품 상세 ───────── */
  function vProduct(id) {
    var p = P(id);
    if (!p) return notFound();
    var sold = p.stock <= 0;
    var buyable = anyBuyable(p);
    var rows = D.METHODS.map(function (m) {
      var c = buyCheck(p, m.key);
      return '<div class="cr" style="align-items:flex-start">' +
        '<div><b style="color:var(--ink)">' + esc(m.name) + '</b>' +
        '<span class="cs" style="display:block;margin-top:2px">' + won(priceOf(p, m.key)) +
        (m.key === 'phone' ? ' + 통신사 수수료 ' + S.settings.feePhone + '%' : '') + '</span>' +
        '<div style="font-size:12.5px;color:var(--mute);margin-top:5px">' + esc(m.desc) + '</div></div>' +
        '<span class="pill ' + (c.ok ? 'ok' : 'bad') + '">' + (c.ok ? '구매 가능' : esc(c.why)) + '</span></div>';
    }).join('');
    return header('/products') + crumb([['홈', '#/'], ['상품권', '#/products'], [p.brand]]) +
      '<div class="wrap"><div class="pd">' +
        '<div class="pd-img rv"><span class="tagline ' + tagOf(p).c + '">' + esc(tagOf(p).t) + '</span>' +
        '<img src="' + p.img + '" alt="' + esc(p.name) + '"></div>' +
        '<div class="rv">' +
          '<span class="kicker" style="color:var(--verm)">' + esc(p.brand) + '</span>' +
          '<h1 class="ser">' + esc(p.name) + '</h1>' +
          '<p class="lead">' + esc(p.lead) + '</p>' +
          '<div class="price-box"><b>' + (buyable ? won(lowPrice(p)) : '현재 구매 불가') + '</b>' +
            (buyable ? '<s>' + won(p.face) + '</s><span class="save">최대 ' + Math.round((1 - lowPrice(p) / p.face) * 100) + '% 할인</span>' : '') +
            '<span style="margin-left:auto;font-size:13px;color:' + (sold ? 'var(--bad)' : 'var(--mute)') + '">' +
            (sold ? '재고 0장 — 구매 차단' : '남은 수량 ' + p.stock.toLocaleString('ko-KR') + '장') + '</span></div>' +
          '<h3 style="font-size:14px;margin:20px 0 10px">결제 수단별 판매가와 내 등급(' + esc(G().name) + ')에서의 구매 가능 여부</h3>' +
          '<div class="codebox">' + rows + '</div>' +
          '<div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">' +
            (buyable ? '<a class="btn v" href="#/checkout/' + p.id + '">주문하기</a>'
                     : '<button class="btn" disabled>' + (sold ? '품절되었습니다' : '지금 등급으로는 구매하실 수 없습니다') + '</button>') +
            '<a class="btn o" href="#/products">목록으로</a></div>' +
          (!buyable && !sold ? '<div class="note" style="margin-top:16px"><b>구매 가능한 결제 수단이 없습니다.</b> ' +
            '위 표에서 제한 사유를 확인해 주세요. 등급 변경이 필요하시면 고객센터로 문의해 주세요.</div>' : '') +
          '<div class="note gold" style="margin-top:22px"><b>상품권 번호는 결제 후 바로 보이지 않습니다.</b> ' +
          '카드·휴대폰·토스로 구매하신 경우 최초 1회 관리자 유선 승인을 거쳐야 번호를 확인하실 수 있습니다. ' +
          '주문 내역에는 주문 정보가 그대로 보이고, 번호 자리만 「승인 대기」로 표시됩니다.</div>' +
        '</div>' +
      '</div></div>' + footer();
  }

  /* ───────── 04 주문·결제 ───────── */
  function vCheckout(id) {
    var p = P(id);
    if (!p) return notFound();
    if (!S.draft || S.draft.pid !== p.id) S.draft = { pid: p.id, qty: 1, method: null };
    var d = S.draft;
    var amt = payAmount(p, d.qty, d.method || 'card');
    var lim = d.method ? limitCheck(p, d.qty, d.method) : { ok: true, lim: 0, amt: 0 };
    var chk = d.method ? buyCheck(p, d.method) : { ok: false, why: '' };
    var ready = !!d.method && chk.ok && lim.ok;

    var mrows = D.METHODS.map(function (m) {
      var c = buyCheck(p, m.key);
      var l = limitCheck(p, d.qty, m.key);
      var off = !c.ok || !l.ok;
      var why = !c.ok ? c.why : ('카드+휴대폰 합계 ' + won(l.lim) + ' 한도 초과');
      return '<label class="' + (d.method === m.key ? 'sel ' : '') + (off ? 'off' : '') + '"' +
        (off ? '' : ' data-act="pick" data-k="' + m.key + '"') + '>' +
        '<span class="rd"></span>' +
        '<span><span class="nm">' + esc(m.name) + ' · ' + won(priceOf(p, m.key)) + '</span>' +
        '<span class="sb">' + esc(m.sub) + '</span>' +
        '<span class="ds">' + esc(m.desc) + '</span>' +
        (m.key === 'phone' ? '<span class="ds" style="color:var(--warn)">통신사 수수료 ' + S.settings.feePhone +
          '%가 결제 금액에 추가됩니다</span>' : '') + '</span>' +
        '<span class="bg2">' + esc(off ? why : m.badge) + '</span></label>';
    }).join('');

    return header('/products') + crumb([['홈', '#/'], ['상품권', '#/products'],
        [p.brand, '#/product/' + p.id], ['주문·결제']]) +
      '<div class="wrap page-h"><h1 class="ser">주문·결제</h1>' +
      '<p>결제 수단마다 판매가와 이용 조건이 다를 수 있습니다. 아래에서 결제 방법을 선택하면 최종 결제 예정 금액을 확인하실 수 있습니다.</p></div>' +
      '<div class="wrap"><div class="pd" style="grid-template-columns:minmax(0,1.25fr) minmax(0,.85fr)">' +
        '<div class="rv">' +
          '<div class="ord-r" style="border:1px solid var(--line)"><img src="' + p.img + '" alt="">' +
            '<div><span class="id">' + esc(p.brand) + '</span><h4>' + esc(p.name) + '</h4>' +
            '<span class="mt">남은 수량 ' + p.stock + '장 · 결제 수단에 따라 ' + won(lowPrice(p)) + '부터</span></div>' +
            '<div class="rt"><div class="qty">' +
              '<button data-act="qty" data-v="-1" aria-label="수량 감소">−</button><span>' + d.qty + '</span>' +
              '<button data-act="qty" data-v="1" aria-label="수량 증가">+</button></div></div></div>' +
          '<h3 style="font-size:15px;margin:24px 0 10px">결제 수단 선택</h3>' +
          '<div class="mth">' + mrows + '</div>' +
          (d.method === 'account' ? '<div class="note teal"><b>계좌결제를 선택하셨습니다.</b> 주문 후 안내되는 전용 가상계좌로 입금해 주세요. ' +
            '입금이 확인되면 주문 상태가 변경되고 알림톡이 발송됩니다. 카드·휴대폰과 달리 <b>합계 한도가 없습니다.</b></div>' : '') +
          (!lim.ok && d.method ? '<div class="note"><b>한도에 걸렸습니다.</b> 카드·휴대폰은 ' +
            '<b>두 수단을 합쳐</b> ' + won(lim.lim) + '까지만 결제하실 수 있습니다. ' +
            '지금 결제 예정 금액은 ' + won(lim.amt) + '(통신사 수수료 포함)입니다. 수량을 줄이시거나 계좌결제를 이용해 주세요.</div>' : '') +
        '</div>' +
        '<div class="rv"><div class="sum">' +
          '<div class="r"><span>' + (d.method ? esc(M(d.method).name) + ' 판매가' : '판매가') + '</span><b>' +
            won(priceOf(p, d.method || 'card')) + ' × ' + d.qty + '</b></div>' +
          '<div class="r"><span>소계</span><b>' + won(amt.base) + '</b></div>' +
          (d.method === 'phone' ? '<div class="r"><span>통신사 수수료 (' + S.settings.feePhone + '%)</span><b>+ ' +
            won(amt.fee) + '</b></div>' : '') +
          '<div class="tot"><span>결제 예정 금액</span><b>' + won(amt.total) + '</b></div>' +
          '<div style="margin-top:16px"><button class="btn v full" data-act="pay"' + (ready ? '' : ' disabled') + '>' +
            (d.method ? esc(M(d.method).name) + '로 결제' : '결제 수단을 선택해 주세요') + '</button></div>' +
          '<p class="hint" style="margin-top:12px">결제하기를 누르기 전에 상품과 수량, 결제 금액을 다시 확인해 주세요.</p>' +
        '</div>' +
        '<div class="note ink" style="margin-top:16px"><b>안전한 결제를 위해</b> 결제 완료 전 최종 승인 금액을 다시 확인하며, 승인 결과는 주문 내역에서 확인하실 수 있습니다.</div>' +
        '</div>' +
      '</div></div>' + footer();
  }

  /* ───────── 05 결제 완료 ───────── */
  function vDone(oid) {
    var o = O(oid); if (!o) return notFound();
    var p = P(o.pid);
    var acct = o.method === 'account';
    return header('/orders') +
      '<div class="wrap page-h"><span class="kicker" style="color:var(--ok)">ORDER COMPLETE</span>' +
      '<h1 class="ser" style="margin-top:14px">' + (acct ? '주문이 접수되었습니다' : '결제가 완료되었습니다') + '</h1>' +
      '<p>주문번호 <b class="num">' + esc(o.id) + '</b> · ' + esc(p.name) + ' ' + o.qty + '장 · ' + won(o.amount) + '</p></div>' +
      '<div class="wrap"><section class="sec" style="padding-top:28px">' +
        (acct ? '<div class="panel rv"><h3>입금하실 계좌</h3><p class="sb">아래 가상계좌로 입금해 주세요. 입금이 확인되면 주문 상태가 자동으로 변경됩니다.</p>' +
          '<div class="codebox"><div class="cr"><span class="cn">' + esc(o.vacct || '기업은행 015-812345-04-118') + '</span>' +
          '<span class="pill warn">입금 대기</span></div>' +
          '<div class="cr"><span class="cs">입금 금액</span><span class="cn">' + won(o.amount) + '</span></div></div>' +
          '<div class="note teal"><b>입금이 확인되면 알림톡을 보내 드립니다.</b> ' +
          '입금 통지를 받아 주문 상태가 자동으로 바뀌며, 입금자명이 달라 자동 매칭되지 않은 건만 관리자가 수동으로 대사합니다.</div></div>'
        : '<div class="panel rv"><h3>' + (G().reveal ? '상품권 번호를 확인해 주세요' : '상품권 번호는 승인 후 확인할 수 있습니다') + '</h3>' +
          '<p class="sb">' + (G().reveal
            ? '번호 열람 승인이 완료되었습니다. 주문 상세에서 본인 확인 후 상품권 번호를 확인하실 수 있습니다.'
            : '카드·휴대폰·토스 간편계좌로 구매하신 경우, 최초 1회 관리자 유선 승인을 거쳐야 번호를 확인하실 수 있습니다.') + '</p>' +
          '<div class="note gold"><b>지금 상태 — ' + (G().reveal ? '열람 승인 완료' : '승인 대기') + '.</b> ' +
          (G().reveal ? '주문 상세에서 본인 확인을 거치면 번호가 열립니다.'
                      : '관리자 승인이 끝나면 알림톡으로 안내드립니다. 그동안 주문 내역에서 주문은 그대로 확인하실 수 있습니다.') +
          '</div></div>') +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<a class="btn v" href="#/order/' + o.id + '">주문 상세로</a>' +
        '<a class="btn o" href="#/products">계속 쇼핑하기</a></div>' +
      '</section></div>' + footer();
  }

  /* ───────── 06 주문 내역 ───────── */
  function vOrders() {
    var st = { paid: ['결제 완료', 'ok'], waiting: ['입금 대기', 'warn'], cancelled: ['취소됨', ''] };
    return header('/orders') + crumb([['홈', '#/'], ['주문 내역']]) +
      '<div class="wrap page-h"><h1 class="ser">주문 내역</h1>' +
      '<p>주문은 상태와 무관하게 모두 보입니다. 번호 자리만 승인 상태에 따라 가려집니다.</p></div>' +
      '<div class="wrap"><section class="sec" style="padding-top:26px">' +
      '<div class="ord-list rv">' + S.orders.map(function (o) {
        var p = P(o.pid), s = st[o.status] || ['', ''];
        return '<a class="ord-r" href="#/order/' + o.id + '"><img src="' + p.img + '" alt="">' +
          '<div><span class="id">' + esc(o.id) + ' · ' + esc(o.date) + '</span>' +
          '<h4>' + esc(p.name) + ' ' + o.qty + '장</h4>' +
          '<span class="mt">' + esc(M(o.method).name) + ' · ' + won(o.amount) + '</span></div>' +
          '<div class="rt"><span class="pill ' + s[1] + '">' + esc(s[0]) + '</span>' +
          '<span class="pill">' + (o.codes.length
            ? (G().reveal ? '번호 ' + o.codes.length + '장' : '번호 승인 대기') : '번호 없음') + '</span></div></a>';
      }).join('') + '</div>' +
      '</section></div>' + footer();
  }

  /* ───────── 07 주문 상세 — 상품권 번호 확인 (핵심) ───────── */
  function recentHits() {
    var t = Date.now() - 10 * 60 * 1000;
    S.revealHits = S.revealHits.filter(function (x) { return x > t; });
    S.revealServerHits = S.revealServerHits.filter(function (x) { return x > t; });
    return { account: S.revealHits.length, server: S.revealServerHits.length };
  }
  function vOrder(oid) {
    var o = O(oid); if (!o) return notFound();
    var p = P(o.pid);
    var g = G();
    var rv = S.reveal[o.id];
    var open = rv && rv.until > Date.now();
    var left = open ? Math.max(0, Math.ceil((rv.until - Date.now()) / 1000)) : 0;
    var hits = recentHits();
    var accountCapped = hits.account >= S.settings.revealPerAccount;
    var serverCapped = hits.server >= S.settings.revealPerServer;
    var blocked = o.status !== 'paid';

    var reason = '';
    if (blocked) reason = o.status === 'waiting' ? '입금이 확인되면 번호가 배정됩니다' : '취소된 주문입니다';
    else if (!g.reveal) reason = '이 등급은 아직 번호를 확인하실 수 없습니다 (관리자 유선 승인 필요)';
    else if (serverCapped) reason = '현재 번호 확인 요청이 많습니다. 잠시 후 다시 시도해 주세요';
    else if (accountCapped) reason = '10분당 ' + S.settings.revealPerAccount + '건의 확인 한도를 초과했습니다. 잠시 후 다시 시도해 주세요';

    var codes = o.codes.map(function (c, i) {
      return '<div class="cr"><span class="cn' + (open ? '' : ' msk') + '">' + esc(open ? c : mask(c)) + '</span>' +
        '<span class="cs">' + (open ? '열람 중 · 캡처하지 마세요' : '잠김 · ' + (i + 1) + '번째 장') + '</span></div>';
    }).join('');

    return header('/orders') + crumb([['홈', '#/'], ['주문 내역', '#/orders'], [o.id]]) +
      '<div class="wrap page-h"><h1 class="ser">주문 상세</h1>' +
      '<p><b class="num">' + esc(o.id) + '</b> · ' + esc(o.date) + ' · ' + esc(M(o.method).name) + ' · ' + won(o.amount) + '</p></div>' +
      '<div class="wrap"><div class="pd" style="grid-template-columns:minmax(0,1.3fr) minmax(0,.8fr);padding-top:26px">' +
        '<div class="rv">' +
          '<div class="reveal">' +
            '<div class="hdr"><b>상품권 번호 ' + o.codes.length + '장</b>' +
            '<span class="st">' + (open ? '번호 확인 중 · ' + left + '초 남음' : '안전하게 보호 중') + '</span></div>' +
            '<div class="bd">' +
              (o.codes.length ? '<div class="codebox">' + codes + '</div>' : '<div class="empty">배정된 번호가 없습니다</div>') +
              (open ? '<div style="display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap">' +
                  '<span class="tick"><i></i>남은 시간 <b id="cd">' + left + '</b>초</span>' +
                  '<button class="btn gh sm" data-act="close">지금 닫기</button></div>' +
                  '<div class="meter"><i id="mt" style="width:' + (left / S.settings.ticketSec * 100) + '%"></i></div>'
                : (o.codes.length ?
                  '<div style="margin-top:15px">' +
                  (reason ? '<div class="note"><b>지금은 열 수 없습니다.</b> ' + esc(reason) +
                    '</div>' : '') +
                  '<button class="btn v" data-act="reveal"' + (reason ? ' disabled' : '') + '>번호 확인하기</button>' +
                  '<p class="hint" style="margin-top:10px">누르시면 등록된 전화번호로 <b>1회용 확인 코드</b>를 보냅니다. ' +
                  '코드를 넣으시면 이 주문 1건에만 쓸 수 있는 <b>' + Math.round(S.settings.ticketSec / 60) + '분짜리 열람권</b>이 발급됩니다.</p></div>' : '')) +
            '</div>' +
          '</div>' +

          '<h3 style="font-size:14px;margin:26px 0 10px">열람 기록</h3>' +
          '<div class="panel" style="padding:6px 16px">' +
            (S.revealLog.length ? S.revealLog.slice(0, 8).map(function (l) {
              return '<div class="logrow"><span class="t">' + esc(l.t) + '</span><span>' + esc(l.m) + '</span>' +
                '<span class="r">' + esc(l.r) + '</span></div>'; }).join('')
              : '<div class="logrow"><span class="t">—</span><span>아직 기록이 없습니다. 번호 확인을 시도하면 성공·실패가 모두 남습니다.</span><span class="r"></span></div>') +
          '</div>' +
        '</div>' +

        '<div class="rv">' +
          '<div class="guard">' +
            '<div class="g"><span class="k">본인 확인</span><span class="v">알림톡 확인 코드</span></div>' +
            '<div class="g"><span class="k">번호 표시 시간</span><span class="v">' + Math.round(S.settings.ticketSec / 60) + '분</span></div>' +
            '<div class="g"><span class="k">현재 상태</span><span class="v">' + (open ? '번호 확인 중' : '잠김') + '</span></div>' +
          '</div>' +
          '<div class="note teal" style="margin-top:16px"><b>상품권 번호는 본인 확인 후에만 표시됩니다.</b> ' +
          '확인 시간이 지나면 번호가 자동으로 다시 가려집니다. 공용 기기에서는 확인 후 반드시 창을 닫아 주세요.</div>' +
          '<div class="note gold"><b>상품권 번호를 다른 사람에게 전달할 때 주의해 주세요.</b> ' +
          '이미 노출되었거나 사용 여부가 의심되는 경우 고객센터로 문의해 주세요.</div>' +
          '<div class="panel" style="margin-top:16px"><h3 style="font-size:13.5px">주문 정보</h3>' +
          '<div class="sum" style="border:0;padding:0;background:none">' +
            '<div class="r"><span>상품</span><b style="font-family:var(--sans)">' + esc(p.name) + '</b></div>' +
            '<div class="r"><span>수량</span><b>' + o.qty + '장</b></div>' +
            '<div class="r"><span>결제 수단</span><b style="font-family:var(--sans)">' + esc(M(o.method).name) + '</b></div>' +
            '<div class="r"><span>결제 금액</span><b>' + won(o.amount) + '</b></div>' +
          '</div></div>' +
        '</div>' +
      '</div></div>' + footer();
  }

  /* ───────── 08 로그인 ───────── */
  function vLogin() {
    return header('/login') + crumb([['홈', '#/'], ['로그인']]) +
      '<div class="wrap"><section class="sec">' +
      '<div class="narrow" style="margin:0 auto">' +
        '<h1 class="ser" style="font-size:clamp(24px,3.4vw,34px)">로그인</h1>' +
        '<p style="color:var(--mute);margin-top:12px">아이디는 <b>휴대전화 번호</b>입니다.</p>' +
        '<form class="form" style="margin-top:24px" data-act="login">' +
          '<label class="fl"><span>아이디 (휴대전화 번호)<em>*</em></span>' +
          '<input type="tel" id="lid" placeholder="01012345678" inputmode="numeric" autocomplete="username" required></label>' +
          '<label class="fl"><span>비밀번호<em>*</em></span>' +
          '<input type="password" id="lpw" placeholder="특수문자 포함 8자리 이상" autocomplete="current-password" required></label>' +
          '<button class="btn v full" type="submit">로그인</button>' +
          '<div style="display:flex;gap:14px;justify-content:center;font-size:13px">' +
            '<button type="button" class="btn gh sm" data-act="findid">아이디 찾기</button>' +
            '<button type="button" class="btn gh sm" data-act="findpw">비밀번호 찾기</button>' +
            '<a class="btn gh sm" href="#/join">회원가입</a></div>' +
        '</form>' +
      '</div></section></div>' + footer();
  }

  /* ───────── 09 회원가입 ───────── */
  function vJoin() {
    return header('/login') + crumb([['홈', '#/'], ['회원가입']]) +
      '<div class="wrap"><section class="sec">' +
      '<div class="narrow" style="margin:0 auto">' +
        '<h1 class="ser" style="font-size:clamp(24px,3.4vw,34px)">회원가입</h1>' +
        '<p style="color:var(--mute);margin-top:12px">가입 직후 등급은 <b>비승인회원</b>입니다. 카드·휴대폰·토스로 구매하실 수 있고, 번호 확인은 관리자 유선 승인 후에 열립니다.</p>' +
        '<form class="form" style="margin-top:24px" data-act="join">' +
          '<label class="fl"><span>휴대전화 번호 (아이디)<em>*</em></span>' +
          '<input type="tel" id="jid" placeholder="01012345678" inputmode="numeric" required></label>' +
          '<label class="fl"><span>비밀번호<em>*</em></span>' +
          '<input type="password" id="jpw" placeholder="특수문자 포함 8자리 이상" autocomplete="new-password" required>' +
          '<div class="pwbar"><i id="pb1"></i><i id="pb2"></i><i id="pb3"></i></div>' +
          '<ul class="pwrule"><li id="r1">8자리 이상</li><li id="r2">특수문자 1자 이상</li>' +
          '<li id="r3">영문·숫자 포함</li></ul></label>' +
          '<label class="fl"><span>비밀번호 확인<em>*</em></span><input type="password" id="jpw2" required></label>' +
          '<label class="chkline"><input type="checkbox" id="jc1" required><span>[필수] 이용약관에 동의합니다</span></label>' +
          '<label class="chkline"><input type="checkbox" id="jc2" required><span>[필수] 개인정보 수집·이용에 동의합니다 — 수집 항목은 휴대전화 번호와 주문 정보뿐이며, <b>주민등록번호는 수집하지 않습니다</b></span></label>' +
          '<button class="btn v full" type="submit">가입하기</button>' +
        '</form>' +
        '<div class="note teal" style="margin-top:26px"><b>비밀번호는 안전하게 보호됩니다.</b> ' +
        '비밀번호를 잊으신 경우 등록된 휴대전화의 알림톡으로 전송되는 재설정 링크를 이용해 주세요.</div>' +
      '</div></section></div>' + footer();
  }

  /* ───────── 10 마이페이지 ───────── */
  function vMypage() {
    var ks = ['none', 'card', 'full', 'biz'];
    var head = '<tr><th>등급</th><th>계좌결제</th><th>카드·휴대폰·토스</th><th>상품권 번호 확인</th></tr>';
    var body = ks.map(function (k) {
      var g = D.GRADES[k];
      var a = g.account === 'all' ? '전체 상품' : g.account === 'instant-only' ? '「즉시 구매」 상품만'
            : g.account === 'biz-only' ? '비즈 전용 상품' : '불가';
      return '<tr class="' + (k === S.grade ? 'me' : '') + '"><td><b>' + esc(g.name) + '</b>' +
        (k === S.grade ? ' <span class="pill ink">내 등급</span>' : '') + '</td>' +
        '<td class="' + (g.account === 'none' ? 'n' : 'y') + '">' + esc(a) + '</td>' +
        '<td class="y">' + (k === 'biz' ? '비즈 전용 상품만' : '가능') + '</td>' +
        '<td class="' + (g.reveal ? 'y' : 'n') + '">' + (g.reveal ? '가능' : '불가') + '</td></tr>';
    }).join('');

    return header('/mypage') + crumb([['홈', '#/'], ['마이페이지']]) +
      '<div class="wrap page-h"><h1 class="ser">마이페이지</h1>' +
      '<p>지금 등급은 <b>' + esc(G().name) + '</b>입니다. ' + esc(G().note) + '</p></div>' +
      '<div class="wrap"><section class="sec" style="padding-top:26px">' +
      '<div class="grid2 rv">' +
        '<div class="panel"><h3>내 정보</h3><p class="sb">아이디는 전화번호입니다. 변경은 고객센터로 문의해 주세요.</p>' +
          '<div class="form">' +
            '<label class="fl"><span>아이디 (휴대전화 번호)</span><input type="tel" value="010-2841-0**7" readonly></label>' +
            '<label class="fl"><span>회원 등급</span><input type="text" value="' + esc(G().name) + '" readonly></label>' +
            '<label class="fl"><span>번호 열람 승인 (최초 1회 유선 승인)</span><input type="text" value="' +
              (G().reveal ? '승인 완료' : '승인 대기 — 관리자 유선 승인 필요') + '" readonly></label>' +
          '</div></div>' +
        '<div class="panel"><h3>비밀번호 변경</h3><p class="sb">특수문자를 포함한 8자리 이상으로 바꿔 주세요.</p>' +
          '<form class="form" data-act="chpw">' +
            '<label class="fl"><span>현재 비밀번호</span><input type="password" id="cpw" required></label>' +
            '<label class="fl"><span>새 비밀번호</span><input type="password" id="npw" required>' +
            '<div class="pwbar"><i id="pb1"></i><i id="pb2"></i><i id="pb3"></i></div>' +
            '<ul class="pwrule"><li id="r1">8자리 이상</li><li id="r2">특수문자 1자 이상</li>' +
            '<li id="r3">영문·숫자 포함</li></ul></label>' +
            '<label class="fl"><span>새 비밀번호 확인</span><input type="password" id="npw2" required></label>' +
            '<button class="btn v" type="submit">변경하기</button>' +
          '</form></div>' +
      '</div>' +
      '<h3 style="font-size:15px;margin:30px 0 12px">등급별 이용 혜택</h3>' +
      '<div class="tblw rv" style="padding:0"><table class="matrix"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="hint">회원 등급에 따라 이용 가능한 결제 수단과 상품, 상품권 번호 확인 여부가 달라질 수 있습니다. 등급 변경은 고객센터로 문의해 주세요.</p>' +
      '<div class="page-actions rv"><a class="btn v" href="#/products">상품 둘러보기</a>' +
      '<a class="btn o" href="#/orders">주문 내역 확인</a></div>' +
      '</section></div>' + footer();
  }

  /* ───────── 11 · 12 약관 / 방침 ───────── */
  function docPage(title, lead, blocks) {
    return header('/terms') + crumb([['홈', '#/'], [title]]) +
      '<div class="wrap page-h"><h1 class="ser">' + esc(title) + '</h1><p>' + esc(lead) + '</p></div>' +
      '<div class="wrap"><section class="sec" style="padding-top:26px"><div class="narrow">' +
      blocks.map(function (b) {
        return '<h3 style="font-family:var(--serif);font-size:18px;margin:26px 0 10px">' + esc(b[0]) + '</h3>' +
          '<p style="font-size:14.5px">' + b[1] + '</p>';
      }).join('') +
      '</div></section></div>' + footer();
  }
  function vTerms() {
    return docPage('이용약관', '상품권 스토어 이용에 관한 기본 약정입니다.', [
      ['제1조 (목적)', '이 약관은 회사가 제공하는 모바일 상품권 판매 서비스의 이용 조건과 절차, 회원과 회사의 권리·의무를 정하는 것을 목적으로 합니다.'],
      ['제2조 (회원 등급)', '회원 등급은 <b>비승인회원 · 카드승인회원 · 승인회원 · 비즈회원</b>의 4단계로 구분하며, 등급에 따라 이용 가능한 결제 수단과 상품권 번호 확인 권한이 달라집니다. 등급 변경 이력은 모두 기록됩니다.'],
      ['제3조 (상품권 번호의 제공)', '상품권 번호는 결제가 완료되고 회원이 번호 열람 승인을 받은 뒤, 본인 확인을 거친 시점에 <b>주문 1건에 한해 제한된 시간 동안</b> 제공됩니다. 회사는 번호를 암호화해 보관하며 전체 목록을 내려받는 기능을 제공하지 않습니다.'],
      ['제4조 (결제 수단과 한도)', '계좌결제·카드결제·휴대폰결제·토스 간편계좌를 제공합니다. 카드결제와 휴대폰결제는 <b>두 수단을 합쳐 100만원</b>까지 이용하실 수 있으며, 계좌결제에는 한도를 적용하지 않습니다. 휴대폰결제에는 통신사 수수료가 가산됩니다.'],
      ['제5조 (환불)', '미사용 상품권에 한해 관련 법령과 표준약관이 정하는 범위에서 환불을 처리합니다. 번호가 이미 열람된 건은 사용 여부를 확인한 뒤 처리합니다.']
    ]);
  }
  function vPrivacy() {
    return docPage('개인정보처리방침', '수집하는 항목과 보관 기간, 파기 방법을 적었습니다.', [
      ['수집 항목', '휴대전화 번호(아이디), 비밀번호(되돌릴 수 없는 방식으로 저장), 주문·결제 내역, 접속 기록입니다. <b>주민등록번호는 수집하지 않습니다.</b>'],
      ['보관과 파기', '개인정보는 처리 목적과 법적 근거에 따라 필요한 기간만 보관합니다. 보유 기간이 끝나거나 처리 목적이 달성된 개인정보는 관련 법령과 내부 절차에 따라 안전하게 파기합니다.'],
      ['보호 조치', '전화번호는 <b>조회용 해시값과 표시용 암호문을 분리</b>해 저장하고, 쇼핑몰 서버의 DB 계정에는 필요한 표와 권한만 부여합니다. 관리자 접속과 주요 조회는 모두 기록합니다.'],
      ['상품권 번호', '상품권 번호는 개인정보와 별도로 다룹니다. 암호화해 저장하고 복호화 권한을 쇼핑몰과 분리하며, 열람 요청은 계정별·서버 전체 총량으로 제한하고 전 건 기록합니다.'],
      ['문의', '개인정보와 관련한 문의는 고객센터로 접수해 주시면 접수 시각과 처리 결과를 기록해 회신드립니다.']
    ]);
  }

  /* ───────── 13 관리자 로그인 (2차 인증) ───────── */
  function vAdminLogin() {
    return header('/admin') +
      '<div class="wrap"><section class="sec">' +
      '<div class="narrow" style="margin:0 auto;max-width:520px">' +
        '<span class="kicker" style="color:var(--verm)">ADMIN</span>' +
        '<h1 class="ser" style="font-size:clamp(23px,3.2vw,32px);margin-top:14px">관리자 로그인</h1>' +
        '<p style="color:var(--mute);margin-top:12px">비밀번호만으로는 들어올 수 없습니다. 등록된 IP에서 접속한 뒤 2차 인증을 한 단계 더 거칩니다.</p>' +
        '<div class="guard" style="margin-top:20px">' +
          '<div class="g"><span class="k">접속 도메인</span><span class="v" style="font-size:13px">admin.example.com <span class="pill teal">쇼핑몰과 분리</span></span></div>' +
          '<div class="g"><span class="k">접속 IP</span><span class="v" style="font-size:13px">211.104.22.14 <span class="pill ok">허용 목록</span></span></div>' +
          '<div class="g"><span class="k">2차 인증</span><span class="v" style="font-size:13px">' +
            (S.settings.otp === 'app' ? 'OTP 앱 (TOTP)' : '알림톡 인증') + '</span></div>' +
        '</div>' +
        '<form class="form" style="margin-top:20px" data-act="adminlogin">' +
          '<label class="fl"><span>관리자 아이디</span><input type="text" value="admin01" readonly></label>' +
          '<label class="fl"><span>비밀번호</span><input type="password" id="apw" placeholder="비밀번호를 입력해 주세요" required></label>' +
          '<button class="btn v full" type="submit">다음 — 2차 인증</button>' +
        '</form>' +
        '<div class="note"><b>등록되지 않은 IP에서는 관리자 페이지에 접속할 수 없습니다.</b> ' +
        '접속이 차단된 경우 시스템 담당자에게 허용 IP 등록을 요청해 주세요.</div>' +
      '</div></section></div>' + footer();
  }

  /* ───────── 관리자 공통 레이아웃 ───────── */
  var ADMNAV = [
    ['14', '상품 관리', '#/admin/products'], ['15', '상품권 재고 관리', '#/admin/stock'],
    ['16', '회원·등급 관리', '#/admin/members'], ['17', '주문·결제 관리', '#/admin/orders'],
    ['18', '입금 확인', '#/admin/deposits'], ['19', '설정·알림톡·개인정보', '#/admin/settings'],
    ['20', '팝업·공지 관리', '#/admin/popup']
  ];
  function admShell(route, title, lead, body, actions) {
    if (!S.admin) return vAdminLogin();
    return header('/admin') + '<div class="adm">' +
      '<nav class="adm-side"><div class="t">운영 메뉴</div>' +
      ADMNAV.map(function (n) {
        return '<a href="' + n[2] + '"' + (route === n[2].slice(1) ? ' class="on"' : '') + '>' +
          '<span class="no">' + n[0] + '</span>' + esc(n[1]) + '</a>'; }).join('') +
      '<div class="t" style="margin-top:18px">세션</div>' +
      '<a href="#/" data-act="admout"><span class="no">↩</span>쇼핑몰로 나가기</a>' +
      '</nav>' +
      '<div class="adm-main"><div class="adm-h"><div><h1 class="ser">' + esc(title) + '</h1>' +
      '<p>' + lead + '</p></div>' + (actions || '') + '</div>' + body + '</div></div>';
  }

  /* ───────── 14 상품 관리 ───────── */
  function vAdmProducts() {
    var rows = S.products.map(function (p, i) {
      return '<tr><td><b>' + esc(p.brand) + '</b><div style="font-size:11.5px;color:var(--faint)">' +
        esc(p.name) + '</div></td>' +
        D.METHODS.map(function (m) {
          return '<td class="n">' + (p.methods[m.key]
            ? won(priceOf(p, m.key)) : '<span class="pill">중지</span>') + '</td>';
        }).join('') +
        '<td class="n">' + p.stock.toLocaleString('ko-KR') + '</td>' +
        '<td class="c">' + (p.bizOnly ? '<span class="pill teal">비즈 전용</span>' :
          p.accountMode === 'instant' ? '<span class="pill warn">즉시 구매</span>' : '<span class="pill">승인 필요</span>') + '</td>' +
        '<td class="c"><label class="sw"><input type="checkbox" data-act="vis" data-i="' + i + '"' +
          (p.visible ? ' checked' : '') + '><span class="tr"></span></label></td>' +
        '<td class="c"><button class="btn sm gh" data-act="edit" data-i="' + i + '">수정</button></td></tr>';
    }).join('');
    return admShell('/admin/products', '상품 관리',
      '상품 하나에 <b>결제 수단 4종의 판매가와 사용 여부</b>를 한 화면에서 설정합니다. 「노출」을 끄면 재고가 있어도 쇼핑몰에서 사라지고 구매가 막힙니다.',
      '<div class="tblw"><table class="t"><thead><tr>' +
      '<th>상품</th>' + D.METHODS.map(function (m) { return '<th class="n">' + esc(m.name) + '</th>'; }).join('') +
      '<th class="n">재고</th><th class="c">계좌 조건</th><th class="c">노출</th><th class="c">수정</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="note ink" style="margin-top:18px"><b>수수료율은 결제 시점 값이 주문 행에 복제 저장됩니다.</b> ' +
      '이후 설정에서 수수료율을 바꾸셔도 과거 주문 금액은 변하지 않습니다.</div>',
      '<button class="btn sm" data-act="edit" data-i="0">상품 정보 수정</button>');
  }

  function productModal(i) {
    var p = S.products[i];
    modal('상품 수정 — ' + esc(p.brand),
      '<div class="grid2">' +
        '<label class="fl"><span>상품명</span><input type="text" id="e_name" value="' + esc(p.name) + '"></label>' +
        '<label class="fl"><span>액면 금액 (원)</span><input type="number" id="e_face" value="' + p.face + '"></label>' +
      '</div>' +
      '<h4 style="font-size:13px;margin:18px 0 8px">결제 수단별 판매가와 사용 여부</h4>' +
      '<div class="codebox">' + D.METHODS.map(function (m) {
        return '<div class="cr"><span style="min-width:92px"><b style="color:var(--ink)">' + esc(m.name) + '</b></span>' +
          '<span style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
          '<input type="number" step="100" id="e_pr_' + m.key + '" value="' + priceOf(p, m.key) +
          '" style="width:118px;height:36px">' +
          '<label class="sw"><input type="checkbox" id="e_on_' + m.key + '"' + (p.methods[m.key] ? ' checked' : '') +
          '><span class="tr"></span>사용</label></span></div>';
      }).join('') + '</div>' +
      '<div class="grid2" style="margin-top:16px">' +
        '<label class="fl"><span>재고 (장)</span><input type="number" id="e_stock" value="' + p.stock + '"></label>' +
        '<label class="fl"><span>계좌결제 조건</span><select id="e_acct">' +
        '<option value="instant"' + (p.accountMode === 'instant' ? ' selected' : '') + '>가입 즉시 구매 가능</option>' +
        '<option value="approval"' + (p.accountMode === 'approval' ? ' selected' : '') + '>관리자 승인 후 구매</option></select></label>' +
      '</div>' +
      '<div class="grid2" style="margin-top:12px">' +
        '<label class="chkline"><input type="checkbox" id="e_biz"' + (p.bizOnly ? ' checked' : '') +
        '><span>비즈회원 전용 상품</span></label>' +
        '<label class="chkline"><input type="checkbox" id="e_vis"' + (p.visible ? ' checked' : '') +
        '><span>쇼핑몰에 노출 (판매 노출 여부)</span></label>' +
      '</div>' +
      '<h4 style="font-size:13px;margin:18px 0 8px">상품별 검색 노출 정보</h4>' +
      '<label class="fl"><span>검색 제목</span><input type="text" id="e_seot" value="' + esc(p.seo.title) + '"></label>' +
      '<label class="fl" style="margin-top:10px"><span>검색 설명</span>' +
      '<textarea id="e_seod" rows="2">' + esc(p.seo.desc) + '</textarea></label>',
      '<button class="btn gh" data-act="mdclose">취소</button>' +
      '<button class="btn v" data-act="esave" data-i="' + i + '">저장</button>');
  }

  /* ───────── 15 재고 관리 ───────── */
  function vAdmStock() {
    var totalStock = S.products.reduce(function (a, p) { return a + p.stock; }, 0);
    var rows = S.stock.map(function (s) {
      var p = P(s.pid);
      var st = s.state === 'unused' ? ['미사용', 'ok'] : s.state === 'sold' ? ['판매 완료', ''] : ['사용 중지', 'bad'];
      return '<tr><td class="num">' + esc(s.sn) + '</td><td>' + esc(p ? p.brand : '-') + '</td>' +
        '<td class="num">' + esc(maskTail(s.tail)) + '</td>' +
        '<td class="c"><span class="pill ' + st[1] + '">' + st[0] + '</span></td>' +
        '<td class="num">' + esc(s.at) + '</td><td>' + esc(s.by) + '</td>' +
        '<td class="c">' + (s.order ? '<span class="num" style="font-size:11.5px">' + esc(s.order) + '</span>' : '—') + '</td></tr>';
    }).join('');
    return admShell('/admin/stock', '상품권 재고 관리',
      '번호 하나를 한 행으로 관리합니다. 관리자가 번호를 등록하면 <b>처리 과정에서 즉시 암호화</b>하고, 화면·목록에는 끝 ' +
      S.settings.adminMaskTail + '자리만 남깁니다. 아래 표는 <b>최근 등록·판매 이력 표본</b>이며, 상품별 총 재고는 상품 관리 화면의 수량이 기준입니다.',
      '<div class="kpi">' +
        '<div><span class="k">상품별 재고 합계</span><span class="v">' + totalStock.toLocaleString('ko-KR') + '</span><span class="s">장 · 상품 관리 기준</span></div>' +
        '<div><span class="k">이력 표본 — 미사용</span><span class="v">' + S.stock.filter(function (s) { return s.state === 'unused'; }).length + '</span><span class="s">건</span></div>' +
        '<div><span class="k">이력 표본 — 판매 완료</span><span class="v">' + S.stock.filter(function (s) { return s.state === 'sold'; }).length + '</span><span class="s">주문에 연결됨</span></div>' +
        '<div><span class="k">이력 표본 — 사용 중지</span><span class="v">' + S.stock.filter(function (s) { return s.state === 'void'; }).length + '</span><span class="s">회수·취소분</span></div>' +
      '</div>' +
      '<div class="panel"><h3>재고 추가 — 번호 붙여넣기</h3>' +
      '<p class="sb">한 줄에 한 장씩 붙여 넣고 「암호화 저장」을 누르면 입력한 번호를 지우고 <b>끝 ' +
      S.settings.adminMaskTail + '자리만</b> 목록에 표시합니다.</p>' +
      '<div class="grid2">' +
        '<label class="fl"><span>상품 선택</span><select id="stp">' +
        S.products.map(function (p) { return '<option value="' + p.id + '">' + esc(p.brand) + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="fl"><span>등록자</span><input type="text" value="관리자01" readonly></label>' +
      '</div>' +
      '<label class="fl" style="margin-top:14px"><span>상품권 번호 (한 줄에 한 장)</span>' +
      '<textarea id="stx" rows="4" placeholder="8842-1097-5531-0264&#10;8842-1097-5531-0731"></textarea></label>' +
      '<div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap">' +
        '<button class="btn v" data-act="stockadd">암호화 저장</button>' +
        '<button class="btn gh" data-act="stockfill">샘플 번호 입력</button></div>' +
      '<div class="note" style="margin-top:16px"><b>업로드 임시 파일도 처리 직후 삭제합니다.</b> ' +
      '전체 내려받기 기능은 만들지 않으며, 건별 열람은 사유 입력과 2차 인증을 거칩니다.</div></div>' +
      '<div class="tblw"><table class="t"><thead><tr><th>재고 일련번호</th><th>상품</th><th>상품권 번호</th>' +
      '<th class="c">상태</th><th>등록 시각</th><th>등록자</th><th class="c">연결 주문</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>');
  }

  /* ───────── 16 회원·등급 관리 ───────── */
  function vAdmMembers() {
    var rows = S.members.map(function (m, i) {
      return '<tr><td class="num">' + esc(m.phone) + '</td><td>' + esc(m.name) + '</td>' +
        '<td><select data-act="grade" data-i="' + i + '" style="height:32px">' +
        ['none', 'card', 'full', 'biz'].map(function (k) {
          return '<option value="' + k + '"' + (k === m.grade ? ' selected' : '') + '>' + esc(D.GRADES[k].name) + '</option>';
        }).join('') + '</select></td>' +
        '<td class="c">' + (m.revealOK
          ? '<span class="pill ok">승인</span><div style="font-size:11px;color:var(--faint);margin-top:3px">' +
            esc(m.approvedAt) + ' · ' + esc(m.approvedBy) + '</div>'
          : '<button class="btn sm" data-act="approve" data-i="' + i + '">유선 승인</button>') + '</td>' +
        '<td class="n">' + m.orders + '</td><td class="num">' + esc(m.joined) + '</td>' +
        '<td class="num">' + esc(m.last) + '</td></tr>';
    }).join('');
    return admShell('/admin/members', '회원·등급 관리',
      '등급은 값이 아니라 <b>권한 묶음</b>입니다. <b>「최초 1회 유선 승인」은 등급과 별개</b>로, 번호 열람만 열어 주며 결제 권한은 바꾸지 않습니다. 등급 변경과 승인은 모두 이력이 남습니다.',
      '<div class="tblw"><table class="t"><thead><tr><th>아이디(전화번호)</th><th>이름</th><th>등급</th>' +
      '<th class="c">번호 열람 승인</th><th class="n">주문</th><th>가입일</th><th>최근 접속</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="note teal" style="margin-top:18px"><b>카드·휴대폰·토스로 구매한 회원은 최초 1회 유선 승인이 필요합니다.</b> ' +
      '승인 전에는 주문 내역에 주문이 보이되 번호 자리가 「승인 대기」로 표시됩니다. ' +
      '승인 시 <b>번호 열람 승인</b> 알림톡이 발송됩니다.</div>');
  }

  /* ───────── 17 주문·결제 관리 ───────── */
  function vAdmOrders() {
    var st = { paid: ['결제 완료', 'ok'], waiting: ['입금 대기', 'warn'], cancelled: ['취소됨', 'bad'] };
    var rows = S.orders.map(function (o) {
      var p = P(o.pid), s = st[o.status];
      return '<tr><td class="num">' + esc(o.id) + '</td><td class="num">' + esc(o.date) + '</td>' +
        '<td>' + esc(p.name) + '</td><td class="n">' + o.qty + '</td>' +
        '<td>' + esc(M(o.method).name) + '</td><td class="n">' + won(o.amount) + '</td>' +
        '<td class="c"><span class="pill ' + s[1] + '">' + s[0] + '</span></td>' +
        '<td class="c">' + (o.status !== 'cancelled'
          ? '<button class="btn sm gh" data-act="cancel" data-id="' + o.id + '">취소</button>' : '—') + '</td></tr>';
    }).join('');
    var byM = D.METHODS.map(function (m) {
      var n = S.orders.filter(function (o) { return o.method === m.key; }).length;
      return '<div><span class="k">' + esc(m.name) + '</span><span class="v">' + n + '</span><span class="s">건</span></div>';
    }).join('');
    return admShell('/admin/orders', '주문·결제 관리',
      '결제 수단별로 조회하고 취소를 처리합니다. 취소하면 연결된 재고가 <b>사용 중지</b>로 바뀌고 판매 수량이 복구되며, 같은 번호는 다시 나가지 않습니다.',
      '<div class="kpi">' + byM + '</div>' +
      '<div class="tblw"><table class="t"><thead><tr><th>주문번호</th><th>일시</th><th>상품</th>' +
      '<th class="n">수량</th><th>결제 수단</th><th class="n">금액</th><th class="c">상태</th><th class="c">처리</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>');
  }

  /* ───────── 18 입금 확인 ───────── */
  function vAdmDeposits() {
    var mode = S.settings.depositMode;
    var rows = S.deposits.map(function (d, i) {
      return '<tr><td class="num">' + esc(d.at) + '</td><td>' + esc(d.payer) + '</td>' +
        '<td class="n">' + won(d.amount) + '</td><td class="num">' + esc(d.acct) + '</td>' +
        '<td class="c">' + (d.src === 'app' ? '<span class="pill warn">앱 알림</span>' : '<span class="pill teal">가상계좌</span>') + '</td>' +
        '<td class="c">' + (d.order ? '<span class="num" style="font-size:11.5px">' + esc(d.order) + '</span>' :
          '<span class="pill warn">미매칭</span>') + '</td>' +
        '<td class="c">' + (d.match === 'auto' ? '<span class="pill ok">자동 확인</span>' :
          '<button class="btn sm" data-act="match" data-i="' + i + '">수동 대사</button>') + '</td></tr>';
    }).join('');
    var waiting = S.orders.filter(function (o) { return o.status === 'waiting'; });

    return admShell('/admin/deposits', '입금 확인',
      '계좌 입금 확인 방식을 선택하고 자동 확인 결과와 수동 대사 항목을 관리합니다.',
      '<div class="panel"><h3>입금 확인 방식</h3>' +
      '<p class="sb">운영 환경에 연결된 입금 확인 방식을 선택합니다. 현재는 PG 가상계좌 통지를 사용하고 있습니다.</p>' +
      '<div class="mth">' +
        '<label class="' + (mode === 'app' ? 'sel' : '') + '" data-act="depmode" data-k="app">' +
          '<span class="rd"></span><span><span class="nm">앱 알림 인식</span>' +
          '<span class="sb">Android 상시 단말이 은행 알림을 읽어 서버로 전달</span>' +
          '<span class="ds">단말 등록·알림 형식 학습·수동 폴백이 필요하고, 단말이 꺼지면 입금 확인이 멈춥니다. 별도 앱 개발이 필요합니다.</span></span>' +
          '<span class="bg2">미사용</span></label>' +
        '<label class="' + (mode === 'vacct' ? 'sel' : '') + '" data-act="depmode" data-k="vacct">' +
          '<span class="rd"></span><span><span class="nm">PG 가상계좌 통지</span>' +
          '<span class="sb">PG사가 입금 결과를 서버로 직접 통지</span>' +
          '<span class="ds">상시 단말에 의존하지 않고 건당 수수료가 발생합니다. 입금자명이 다른 건만 수동 대사합니다.</span></span>' +
          '<span class="bg2">사용 중</span></label>' +
      '</div>' +
      (mode === 'app' ? '<div class="note gold" style="margin-top:14px"><b>앱 알림 인식을 사용하고 있습니다.</b> ' +
        '아래에 <b>수신 단말</b> 상태가 함께 표시됩니다. 단말이 꺼지거나 알림 형식이 바뀌면 미인식 건이 쌓이고, 그 건은 수동으로 대사하셔야 합니다.</div>'
        : '<div class="note teal" style="margin-top:14px"><b>가상계좌 통지 방식을 고르셨습니다.</b> ' +
        'PG사가 서버로 직접 통지하므로 상시 단말이 필요 없습니다.</div>') +
      '</div>' +

      (mode === 'app' ? '<div class="panel"><h3>수신 단말</h3>' +
        '<p class="sb">알림을 읽어 서버로 보내는 Android 단말입니다. 이 단말이 꺼지면 입금 확인이 멈춥니다.</p>' +
        '<div class="tblw"><table class="t"><thead><tr><th>단말</th><th>은행 앱</th><th class="c">상태</th>' +
        '<th>마지막 수신</th><th class="c">배터리</th></tr></thead><tbody>' +
        '<tr><td>사무실 단말 A</td><td>기업은행</td><td class="c"><span class="pill ok">수신 중</span></td>' +
        '<td class="num">2026-09-14 09:06</td><td class="c">82%</td></tr>' +
        '<tr><td>예비 단말 B</td><td>기업은행</td><td class="c"><span class="pill bad">오프라인</span></td>' +
        '<td class="num">2026-09-11 18:40</td><td class="c">—</td></tr>' +
        '</tbody></table></div>' +
        '<div class="note" style="margin-top:14px"><b>이 구조는 단말에 의존합니다.</b> ' +
        'iOS에서는 같은 방식으로 동작하기 어렵고, 은행 앱의 알림 문구가 바뀌면 인식률이 떨어질 수 있습니다.</div>' +
        '</div>' : '') +

      '<div class="kpi">' +
        '<div><span class="k">오늘 입금</span><span class="v">' + S.deposits.length + '</span><span class="s">건</span></div>' +
        '<div><span class="k">자동 확인</span><span class="v" style="color:var(--ok)">' +
          S.deposits.filter(function (d) { return d.match === 'auto'; }).length + '</span><span class="s">건</span></div>' +
        '<div><span class="k">수동 대사 필요</span><span class="v" style="color:var(--warn)">' +
          S.deposits.filter(function (d) { return d.match !== 'auto'; }).length + '</span><span class="s">건</span></div>' +
        '<div><span class="k">입금 대기 주문</span><span class="v">' + waiting.length + '</span><span class="s">건</span></div>' +
      '</div>' +
      '<div class="tblw"><table class="t"><thead><tr><th>입금 시각</th><th>입금자</th><th class="n">금액</th>' +
      '<th>가상계좌</th><th class="c">경로</th><th class="c">주문</th><th class="c">처리</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>');
  }

  /* ───────── 19 설정 · 알림톡 · 개인정보 ───────── */
  function vAdmSettings() {
    var st = S.settings;
    var ssl = ['shop', 'admin'].map(function (k) {
      var s = st.ssl[k];
      return '<tr><td>' + esc(s.domain) + '</td><td class="num">' + esc(s.expire) + '</td>' +
        '<td class="c">' + (s.auto ? '<span class="pill ok">자동 갱신</span>' : '<span class="pill bad">수동</span>') + '</td>' +
        '<td class="num">' + esc(s.last) + '</td><td>' + esc(s.method) + '</td></tr>';
    }).join('');
    var tpl = S.alimtalk.templates.map(function (t, i) {
      return '<tr><td class="num">' + esc(t.code) + '</td><td>' + esc(t.name) + '</td>' +
        '<td>' + esc(t.when) + '</td><td style="font-size:12px;color:var(--mute)">' + esc(t.body) + '</td>' +
        '<td class="c"><label class="sw"><input type="checkbox" data-act="tpl" data-i="' + i + '"' +
        (t.on ? ' checked' : '') + '><span class="tr"></span></label></td></tr>';
    }).join('');
    var logs = S.alimtalk.logs.slice(0, 8).map(function (l) {
      return '<tr><td class="num">' + esc(l.at) + '</td><td class="num">' + esc(l.code) + '</td>' +
        '<td class="num">' + esc(l.to) + '</td><td>' + esc(l.ch) + '</td>' +
        '<td class="c">' + (l.state === 'sent' ? '<span class="pill ok">발송</span>'
          : '<span class="pill bad">실패</span> <button class="btn sm gh" data-act="resend">재발송</button>') + '</td></tr>';
    }).join('');
    var ips = st.allowIp.map(function (ip, i) {
      return '<div class="cr"><span class="cn" style="font-size:14px">' + esc(ip) + '</span>' +
        '<button class="btn sm gh" data-act="ipdel" data-i="' + i + '">삭제</button></div>';
    }).join('');
    var ret = D.RETENTION.map(function (r) {
      return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
    }).join('');

    return admShell('/admin/settings', '설정 · 알림톡 · 개인정보',
      '결제·보안·SSL·SEO·알림톡·개인정보 기준을 한곳에서 관리합니다. 변경한 설정은 <b>저장 즉시 쇼핑몰에 반영</b>됩니다.',
      '<div class="grid2">' +
        '<div class="panel"><h3>결제 수단 사용 여부</h3><p class="sb">끄면 주문 화면에서 선택할 수 없게 됩니다.</p>' +
        D.METHODS.map(function (m) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;' +
            'border-bottom:1px solid var(--line-2)"><div><b style="color:var(--ink)">' + esc(m.name) + '</b>' +
            '<div style="font-size:11.5px;color:var(--faint)">' + esc(m.sub) + '</div></div>' +
            '<label class="sw"><input type="checkbox" data-act="mon" data-k="' + m.key + '"' +
            (st.methodOn[m.key] ? ' checked' : '') + '><span class="tr"></span></label></div>';
        }).join('') + '</div>' +

        '<div class="panel"><h3>한도와 수수료</h3>' +
        '<p class="sb"><b>카드·휴대폰 합계</b> 한도를 설정합니다. 계좌결제에는 이 한도를 적용하지 않습니다.</p>' +
        '<label class="fl"><span>카드+휴대폰 합계 한도 (원)</span>' +
        '<input type="number" step="100000" value="' + st.limitCardPhone + '" data-act="set" data-k="limitCardPhone"></label>' +
        '<label class="fl" style="margin-top:12px"><span>통신사 수수료 (%)</span>' +
        '<input type="number" step="0.1" value="' + st.feePhone + '" data-act="set" data-k="feePhone"></label>' +
        '<p class="hint">한도는 <b>통신사 수수료를 포함한 결제 예정 금액</b>으로 검사합니다. 결제 시점의 수수료율이 주문 행에 복제 저장되므로 이 값을 바꾸셔도 과거 주문 금액은 변하지 않습니다.</p></div>' +

        '<div class="panel"><h3>보안 — 관리자 접근</h3>' +
        '<label class="fl"><span>2차 인증 방식</span><select data-act="set" data-k="otp">' +
        '<option value="app"' + (st.otp === 'app' ? ' selected' : '') + '>OTP 앱 (TOTP · 추가 발송비 없음)</option>' +
        '<option value="alimtalk"' + (st.otp === 'alimtalk' ? ' selected' : '') + '>알림톡 인증</option></select></label>' +
        '<h4 style="font-size:12.5px;margin:16px 0 8px;color:var(--mute)">접속 허용 IP</h4>' +
        '<div class="codebox">' + ips + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<input type="text" id="newip" placeholder="예) 203.0.113.7" style="flex:1 1 auto">' +
        '<button class="btn sm" data-act="ipadd">추가</button></div>' +
        '<p class="hint">허용 목록 밖에서는 관리자 로그인 화면 자체가 열리지 않습니다.</p></div>' +

        '<div class="panel"><h3>보안 — 번호 열람 통제</h3>' +
        '<div class="grid3">' +
          '<label class="fl"><span>계정당 (10분)</span><input type="number" value="' + st.revealPerAccount + '" data-act="set" data-k="revealPerAccount"></label>' +
          '<label class="fl"><span>서버 전체 (10분)</span><input type="number" value="' + st.revealPerServer + '" data-act="set" data-k="revealPerServer"></label>' +
          '<label class="fl"><span>열람권 유효 (초)</span><input type="number" step="30" value="' + st.ticketSec + '" data-act="set" data-k="ticketSec"></label>' +
        '</div>' +
        '<div class="grid2" style="margin-top:12px">' +
          '<label class="fl"><span>관리자 노출 자릿수</span><input type="number" value="' + st.adminMaskTail + '" data-act="set" data-k="adminMaskTail"></label>' +
          '<label class="fl"><span>관리자 일일 열람 상한</span><input type="number" value="' + st.adminDailyCap + '" data-act="set" data-k="adminDailyCap"></label>' +
        '</div>' +
        '<p class="hint">최근 3개월의 시간대별 정상 주문량을 기준으로 운영 환경에 맞게 조정해 주세요.</p></div>' +
      '</div>' +

      '<div class="panel"><h3>SSL 인증서 자동 갱신</h3>' +
      '<p class="sb">만료로 사이트가 멈추지 않도록 서버가 스스로 갱신합니다. 관리자 도메인은 외부 접속을 막아 두므로 <b>도메인 소유 확인(DNS) 방식</b>으로 갱신합니다.</p>' +
      '<div class="tblw"><table class="t"><thead><tr><th>도메인</th><th>만료일</th><th class="c">갱신</th>' +
      '<th>마지막 갱신</th><th>인증 방식</th></tr></thead><tbody>' + ssl + '</tbody></table></div>' +
      '<div class="note teal" style="margin-top:14px"><b>만료 30일 전에 알림이 발송됩니다.</b> ' +
      '최근 자동 갱신 결과와 다음 만료일은 아래 표에서 확인할 수 있습니다.</div></div>' +

      '<div class="panel"><h3>알림톡 템플릿과 발송 이력</h3>' +
      '<p class="sb">보내는 부분을 따로 떼어 두어, 문자·이메일을 추가해도 주문 처리 코드를 고치지 않습니다. 심사 중에는 SMS로 대체 발송합니다.</p>' +
      '<div class="tblw"><table class="t"><thead><tr><th>코드</th><th>템플릿</th><th>발송 시점</th>' +
      '<th>본문</th><th class="c">사용</th></tr></thead><tbody>' + tpl + '</tbody></table></div>' +
      '<h4 style="font-size:12.5px;margin:18px 0 8px;color:var(--mute)">최근 발송 이력</h4>' +
      '<div class="tblw"><table class="t"><thead><tr><th>시각</th><th>코드</th><th>수신</th>' +
      '<th>채널</th><th class="c">상태</th></tr></thead><tbody>' + logs + '</tbody></table></div></div>' +

      '<div class="panel"><h3>SEO</h3><p class="sb">사이트 전체 기본값입니다. <b>상품별 값은 상품 관리 → 수정</b>에서 고칩니다.</p>' +
      '<label class="fl"><span>사이트 제목</span><input type="text" value="' + esc(st.seoTitle) + '" data-act="set" data-k="seoTitle"></label>' +
      '<label class="fl" style="margin-top:12px"><span>사이트 설명</span><textarea rows="2" data-act="set" data-k="seoDesc">' + esc(st.seoDesc) + '</textarea></label>' +
      '<div class="panel" style="margin:14px 0 0;background:var(--paper-3)">' +
      '<div style="font-size:12px;color:var(--faint)">example.com</div>' +
      '<div style="color:#1a0dab;font-size:16px;margin:4px 0" id="seoT">' + esc(st.seoTitle) + '</div>' +
      '<div style="font-size:13px;color:var(--mute)" id="seoD">' + esc(st.seoDesc) + '</div></div>' +
      '<p class="hint">로그인·회원가입·마이페이지·주문내역·관리자 화면은 <code>noindex</code>로 검색에서 제외하고, 공개 페이지만 사이트맵에 넣습니다.</p></div>' +

      '<div class="panel"><h3>개인정보 보유·파기 기준</h3>' +
      '<p class="sb">데이터별로 처리 목적·법적 근거·보유 기간·파기 방법을 정해 두고, 기간이 지난 데이터는 배치로 파기합니다.</p>' +
      '<div class="tblw"><table class="t"><thead><tr><th>데이터</th><th>처리 목적</th><th>법적 근거</th>' +
      '<th>보유 기간</th><th>파기 방법</th></tr></thead><tbody>' + ret + '</tbody></table></div></div>');
  }

  /* ───────── 20 팝업·공지 관리 ───────── */
  /* 허용 목록 기반 정제 — 파서로 읽어 텍스트만 남긴다 */
  function sanitize(raw) {
    var doc = new DOMParser().parseFromString('<div>' + raw + '</div>', 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function vAdmPopup() {
    var rows = S.popups.map(function (p, i) {
      return '<tr><td>' + esc(p.title) + '<div style="font-size:11.5px;color:var(--faint);margin-top:3px">' +
        esc(p.body.slice(0, 46)) + (p.body.length > 46 ? '…' : '') + '</div></td>' +
        '<td class="num">' + esc(p.from) + ' ~ ' + esc(p.to) + '</td>' +
        '<td class="c">' + (p.link ? '<a class="num" style="font-size:11.5px;color:var(--verm)" href="' +
          esc(p.link) + '">' + esc(p.link) + '</a>' : '—') + '</td>' +
        '<td class="c"><label class="sw"><input type="checkbox" data-act="pop" data-i="' + i + '"' +
        (p.on ? ' checked' : '') + '><span class="tr"></span></label></td></tr>';
    }).join('');
    return admShell('/admin/popup', '팝업·공지 관리',
      '<b>보안을 위해 공개 웹 에디터를 사용하지 않습니다.</b> 정해진 칸(제목·본문·이미지 1장·링크·노출 기간)에만 입력하고, 서버는 <b>허용한 서식만 남깁니다</b>.',
      '<div>' +
        '<div class="panel"><h3>새 팝업 등록</h3><p class="sb">칸이 다섯 개뿐입니다. 파일을 올려 실행시키는 경로가 없습니다.</p>' +
        '<label class="fl"><span>제목<em>*</em></span><input type="text" id="ptt" placeholder="예) 추석 연휴 고객센터 운영 안내"></label>' +
        '<label class="fl" style="margin-top:12px"><span>본문<em>*</em></span>' +
        '<textarea id="pbd" rows="4" placeholder="글자만 입력하실 수 있습니다. 마크업은 저장 단계에서 버려집니다."></textarea></label>' +
        '<div class="grid2" style="margin-top:12px">' +
          '<label class="fl"><span>노출 시작</span><input type="date" id="pfr" value="2026-09-20"></label>' +
          '<label class="fl"><span>노출 종료</span><input type="date" id="pto" value="2026-09-30"></label></div>' +
        '<label class="fl" style="margin-top:12px"><span>링크 (선택 · 사이트 내부 경로)</span>' +
        '<input type="text" id="plk" placeholder="#/product/2"></label>' +
        '<label class="fl" style="margin-top:12px"><span>이미지 1장 (선택)</span>' +
        '<input type="text" value="이미지만 허용 · 확장자·실제 내용·용량 모두 검사" readonly></label>' +
        '<div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap">' +
        '<button class="btn v" data-act="popadd">등록</button></div>' +
        '<div id="popout"></div></div>' +
      '</div>' +
      '<div class="tblw" style="margin-top:20px"><table class="t"><thead><tr><th>제목</th><th>노출 기간</th>' +
      '<th class="c">링크</th><th class="c">노출</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
  }

  function notFound() {
    return header('/') + '<div class="wrap"><section class="sec"><div class="empty">' +
      '해당 화면을 찾을 수 없습니다. <a href="#/" style="color:var(--verm)">홈으로</a></div></section></div>' + footer();
  }

  /* ───────── 라우터 ───────── */
  function route() {
    var h = location.hash.replace(/^#/, '') || '/';
    var seg = h.split('/').filter(Boolean);
    var v;
    if (h === '/') v = vHome();
    else if (seg[0] === 'products') v = vProducts();
    else if (seg[0] === 'product') v = vProduct(seg[1]);
    else if (seg[0] === 'checkout') v = vCheckout(seg[1]);
    else if (seg[0] === 'done') v = vDone(seg[1]);
    else if (seg[0] === 'orders') v = vOrders();
    else if (seg[0] === 'order') v = vOrder(seg[1]);
    else if (seg[0] === 'login') v = vLogin();
    else if (seg[0] === 'join') v = vJoin();
    else if (seg[0] === 'mypage') v = vMypage();
    else if (seg[0] === 'terms') v = vTerms();
    else if (seg[0] === 'privacy') v = vPrivacy();
    else if (seg[0] === 'admin' && !seg[1]) v = vAdminLogin();
    else if (seg[0] === 'admin' && seg[1] === 'products') v = vAdmProducts();
    else if (seg[0] === 'admin' && seg[1] === 'stock') v = vAdmStock();
    else if (seg[0] === 'admin' && seg[1] === 'members') v = vAdmMembers();
    else if (seg[0] === 'admin' && seg[1] === 'orders') v = vAdmOrders();
    else if (seg[0] === 'admin' && seg[1] === 'deposits') v = vAdmDeposits();
    else if (seg[0] === 'admin' && seg[1] === 'settings') v = vAdmSettings();
    else if (seg[0] === 'admin' && seg[1] === 'popup') v = vAdmPopup();
    else v = notFound();

    document.getElementById('app').innerHTML = v;
    window.scrollTo({ top: 0, behavior: 'auto' });
    revealInit();
    if (seg[0] === 'order') startCountdown(seg[1]);
    document.title = titleFor(h);
  }
  function titleFor(h) {
    if (h === '/') return '상품권 스토어 — 모바일 상품권을 안전하게';
    if (/^\/product\//.test(h)) return '상품 상세 | 상품권 스토어';
    if (/^\/checkout\//.test(h)) return '주문·결제 | 상품권 스토어';
    if (/^\/done\//.test(h)) return '결제 완료 | 상품권 스토어';
    if (/^\/order\//.test(h)) return '주문 상세 | 상품권 스토어';
    for (var i = 0; i < D.SCREENS.length; i++)
      if (D.SCREENS[i][2] === '#' + h) return D.SCREENS[i][1] + ' | 상품권 스토어';
    return '상품권 스토어';
  }

  /* ───────── 리빌 ───────── */
  function revealInit() {
    var els = [].slice.call(document.querySelectorAll('.rv'));
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('in'); }); return;
    }
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (x) {
        if (!x.isIntersecting) return;
        x.target.classList.add('in'); io.unobserve(x.target);
      });
    }, { threshold: .1, rootMargin: '0px 0px -6% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ───────── 번호 확인 카운트다운 ───────── */
  var cdTimer = null;
  function startCountdown(oid) {
    clearInterval(cdTimer);
    var rv = S.reveal[oid];
    if (!rv || rv.until <= Date.now()) return;
    cdTimer = setInterval(function () {
      if (!S.reveal[oid]) { clearInterval(cdTimer); return; }
      var el = document.getElementById('cd');
      var mt = document.getElementById('mt');
      var left = Math.ceil((S.reveal[oid].until - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(cdTimer); delete S.reveal[oid];
        S.revealLog.unshift({ t: now(), m: '열람권 만료 — 번호를 다시 가렸습니다', r: '자동' });
        toast('열람권이 만료되어 번호를 다시 가렸습니다.');
        route(); return;
      }
      if (el) el.textContent = left;
      if (mt) mt.style.width = (left / S.settings.ticketSec * 100) + '%';
    }, 1000);
  }

  /* ───────── 모달 ───────── */
  function modal(title, body, foot) {
    var d = document.getElementById('md');
    d.innerHTML = '<div class="md-in"><div class="md-h"><h3>' + title +
      '</h3><button type="button" data-act="mdclose" aria-label="닫기">×</button></div>' +
      '<div class="md-b">' + body + '</div>' +
      (foot ? '<div class="md-f">' + foot + '</div>' : '') + '</div>';
    if (!d.open) d.showModal();
  }
  function closeModal() { var d = document.getElementById('md'); if (d.open) d.close(); }

  function askCode(oid) {
    var hits = recentHits();
    if (hits.server >= S.settings.revealPerServer) {
      S.revealLog.unshift({ t: now(), m: '서버 전체 번호 확인 한도 초과', r: '거부' });
      toast('현재 번호 확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
      route(); return;
    }
    if (hits.account >= S.settings.revealPerAccount) {
      S.revealLog.unshift({ t: now(), m: '계정 번호 확인 한도 초과', r: '거부' });
      toast('10분당 번호 확인 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.');
      route(); return;
    }
    var code = String(Math.floor(100000 + Math.random() * 900000));
    S.otp = code;
    S.revealHits.push(Date.now());
    S.revealServerHits.push(Date.now());
    S.revealLog.unshift({ t: now(), m: '번호 확인 요청 — 등록된 전화번호로 1회용 코드 발송', r: oid });
    S.alimtalk.logs.unshift({ at: now().slice(0, 16), code: 'RVL_CODE', to: '010-2841-0**7', state: 'sent', ch: '알림톡' });
    modal('본인 확인',
      '<p style="margin-top:0">등록하신 전화번호 <b class="num">010-2841-0**7</b> 로 <b>1회용 확인 코드</b>를 보냈습니다. ' +
      '이 코드는 <b>이 주문 1건</b>에만 쓸 수 있고 한 번 사용하면 폐기됩니다.</p>' +
      '<div class="note teal" style="margin:14px 0"><b>알림톡으로 발송된 확인 코드</b> — ' +
      '<b class="num" style="font-size:17px;letter-spacing:.2em">' + code + '</b></div>' +
      '<label class="fl"><span>확인 코드 6자리</span>' +
      '<input type="text" id="otpin" inputmode="numeric" maxlength="6" placeholder="000000" ' +
      'style="text-align:center;font-family:var(--mono);font-size:20px;letter-spacing:.3em"></label>' +
      '<p class="hint">코드가 맞으면 <b>' + Math.round(S.settings.ticketSec / 60) + '분짜리 열람권</b>이 발급됩니다. ' +
      '쇼핑몰 서버는 이 열람권을 만들거나 고칠 수 없습니다.</p>',
      '<button class="btn gh" data-act="mdclose">취소</button>' +
      '<button class="btn v" data-act="otpok" data-id="' + oid + '">확인</button>');
    setTimeout(function () { var i = document.getElementById('otpin'); if (i) i.focus(); }, 60);
  }

  /* ───────── 이벤트 위임 — 클릭 ───────── */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]');
    if (!t) return;
    var a = t.getAttribute('data-act');

    if (a === 'mdclose') {
      closeModal();
      if (location.hash.indexOf('#/order/') === 0) route();   /* 요청 총량 표시 갱신 */
      return;
    }
    if (a === 'noop' || a === 'resend') {
      ev.preventDefault();
      toast(a === 'resend' ? '재발송했습니다.' : '현재 준비 중인 기능입니다.');
      return;
    }

    /* 주문 화면 */
    if (a === 'pick') { S.draft.method = t.getAttribute('data-k'); route(); return; }
    if (a === 'qty') {
      var pq = P(S.draft.pid);
      S.draft.qty = Math.min(Math.max(1, S.draft.qty + (+t.getAttribute('data-v'))), Math.max(1, pq.stock));
      route(); return;
    }
    if (a === 'pay') {
      if (!S.draft) { toast('주문 정보를 다시 확인해 주세요.'); return; }
      var pp = P(S.draft.pid), mk = S.draft.method;
      if (!pp || !mk || !M(mk)) {
        toast('상품 또는 결제 수단을 다시 선택해 주세요. 주문을 생성하지 않았습니다.');
        route(); return;
      }
      var payGuard = buyCheck(pp, mk);
      if (!payGuard.ok) {
        toast(payGuard.why + ' — 주문을 생성하지 않았습니다.');
        route(); return;
      }
      if (S.draft.qty < 1 || S.draft.qty > pp.stock) {
        toast('주문 수량이 현재 재고와 맞지 않습니다. 주문을 생성하지 않았습니다.');
        route(); return;
      }
      var payLimit = limitCheck(pp, S.draft.qty, mk);
      if (!payLimit.ok) {
        toast('결제 한도를 초과했습니다. 주문을 생성하지 않았습니다.');
        route(); return;
      }
      var amt = payAmount(pp, S.draft.qty, mk);
      var id = 'ORD-' + String(Date.now()).slice(-8);
      var c4 = function () { return String(1000 + Math.floor(Math.random() * 8999)); };
      var codes = [];
      for (var i = 0; i < S.draft.qty; i++) codes.push(c4() + '-' + c4() + '-' + c4() + '-' + c4());
      S.orders.unshift({
        id: id, pid: pp.id, qty: S.draft.qty, method: mk,
        status: mk === 'account' ? 'waiting' : 'paid',
        date: now().slice(0, 16), amount: amt.total,
        vacct: '기업은행 015-812345-04-' + String(100 + Math.floor(Math.random() * 800)),
        codes: codes
      });
      codes.forEach(function (c, k) {
        S.stock.unshift({ sn: 'ST-' + String(50000 + Math.floor(Math.random() * 9000) + k),
          tail: c.slice(-4), pid: pp.id, state: 'sold', at: now().slice(0, 16), by: '자동 배정', order: id });
      });
      pp.stock = Math.max(0, pp.stock - S.draft.qty);
      S.alimtalk.logs.unshift({ at: now().slice(0, 16), code: 'ORD_RECV', to: '010-2841-0**7', state: 'sent', ch: '알림톡' });
      S.draft = null;
      location.hash = '#/done/' + id;
      toast(mk === 'account' ? '주문이 접수되었습니다. 가상계좌로 입금해 주세요.' : '결제가 완료되었습니다.');
      return;
    }

    /* 번호 확인 */
    if (a === 'reveal') { askCode(location.hash.split('/')[2]); return; }
    if (a === 'otpok') {
      var v = (document.getElementById('otpin') || {}).value || '';
      var oid = t.getAttribute('data-id');
      if (v.trim() !== S.otp) {
        S.revealLog.unshift({ t: now(), m: '확인 코드 불일치 — 복호화하지 않음', r: '거부' });
        toast('확인 코드가 맞지 않습니다. 기록에 남았습니다.');
        var inp = document.getElementById('otpin'); if (inp) { inp.value = ''; inp.focus(); }
        return;
      }
      S.otp = '';
      S.reveal[oid] = { until: Date.now() + S.settings.ticketSec * 1000 };
      S.revealLog.unshift({ t: now(), m: '열람권 발급 — 주문 1건 · ' + S.settings.ticketSec + '초 · 1회 사용', r: '허용' });
      closeModal(); route();
      toast('열람권이 발급되었습니다. ' + Math.round(S.settings.ticketSec / 60) + '분 뒤 자동으로 다시 가려집니다.');
      return;
    }
    if (a === 'close') {
      delete S.reveal[location.hash.split('/')[2]];
      S.revealLog.unshift({ t: now(), m: '사용자가 열람권을 즉시 반납', r: '종료' });
      route(); toast('번호를 다시 가렸습니다.'); return;
    }

    /* 로그인 화면 */
    if (a === 'findid') {
      modal('아이디 찾기',
        '<p style="margin-top:0">이 서비스의 아이디는 <b>휴대전화 번호</b>입니다. 따로 찾아 드릴 아이디가 없습니다.</p>' +
        '<label class="fl"><span>가입하신 전화번호를 입력해 주세요</span>' +
        '<input type="tel" placeholder="01012345678" inputmode="numeric"></label>' +
        '<p class="hint">입력하신 번호로 가입 여부만 알려 드립니다. 다른 정보는 표시하지 않습니다.</p>',
        '<button class="btn v" data-act="mdclose">확인</button>');
      return;
    }
    if (a === 'findpw') {
      modal('비밀번호 찾기',
        '<p style="margin-top:0">임시 비밀번호를 보내지 않습니다. <b>한 번만 쓸 수 있는 재설정 링크</b>를 알림톡으로 보내 드리며, 링크는 <b>30분 뒤 만료</b>됩니다.</p>' +
        '<label class="fl"><span>가입하신 전화번호</span>' +
        '<input type="tel" id="pwphone" placeholder="01012345678" inputmode="numeric"></label>' +
        '<div id="pwsent"></div>',
        '<button class="btn gh" data-act="mdclose">닫기</button>' +
        '<button class="btn v" data-act="pwsend">재설정 링크 받기</button>');
      return;
    }
    if (a === 'pwsend') {
      S.alimtalk.logs.unshift({ at: now().slice(0, 16), code: 'PW_RESET', to: '010-2841-0**7', state: 'sent', ch: '알림톡' });
      var box = document.getElementById('pwsent');
      if (box) box.innerHTML = '<div class="note teal" style="margin-top:14px"><b>재설정 링크를 보냈습니다.</b> ' +
        '알림톡이 도착하지 않으면 SMS로 자동 대체 발송됩니다. 링크는 30분 뒤 만료되고, 한 번 사용하면 폐기됩니다.</div>';
      return;
    }

    /* 관리자 */
    if (a === 'admout') { S.admin = false; toast('관리자 세션을 종료했습니다.'); return; }
    if (a === 'edit') { productModal(+t.getAttribute('data-i')); return; }
    if (a === 'esave') {
      var ei = +t.getAttribute('data-i'), ep = S.products[ei];
      ep.name = document.getElementById('e_name').value || ep.name;
      ep.face = +document.getElementById('e_face').value || ep.face;
      D.METHODS.forEach(function (m) {
        ep.prices[m.key] = +document.getElementById('e_pr_' + m.key).value || ep.prices[m.key];
        ep.methods[m.key] = document.getElementById('e_on_' + m.key).checked;
      });
      ep.stock = Math.max(0, +document.getElementById('e_stock').value);
      ep.accountMode = document.getElementById('e_acct').value;
      ep.bizOnly = document.getElementById('e_biz').checked;
      ep.visible = document.getElementById('e_vis').checked;
      ep.seo.title = document.getElementById('e_seot').value;
      ep.seo.desc = document.getElementById('e_seod').value;
      closeModal(); route(); toast('상품 정보를 저장했습니다. 쇼핑몰 화면에 즉시 반영됩니다.');
      return;
    }
    if (a === 'approve') {
      var mi = +t.getAttribute('data-i');
      S.members[mi].revealOK = true;
      S.members[mi].approvedAt = now().slice(0, 16);
      S.members[mi].approvedBy = '관리자01';
      S.alimtalk.logs.unshift({ at: now().slice(0, 16), code: 'RVL_APRV', to: S.members[mi].phone, state: 'sent', ch: '알림톡' });
      toast('번호 열람을 승인했습니다. 등급은 바뀌지 않으며 승인 이력이 기록되었습니다.');
      route(); return;
    }
    if (a === 'cancel') {
      var o2 = O(t.getAttribute('data-id'));
      if (o2 && o2.status !== 'cancelled') {
        o2.status = 'cancelled';
        var voided = 0;
        S.stock.forEach(function (s) { if (s.order === o2.id) { s.state = 'void'; voided++; } });
        var pr2 = P(o2.pid); if (pr2) pr2.stock += o2.qty;
        toast('주문을 취소했습니다. 연결 재고 ' + voided + '건을 사용 중지로 바꾸고 판매 수량을 복구했습니다.');
        route();
      }
      return;
    }
    if (a === 'match') {
      var di = +t.getAttribute('data-i');
      var dep = S.deposits[di];
      if (!dep || dep.match === 'auto') { toast('이미 처리됐거나 찾을 수 없는 입금입니다.'); return; }
      var cand = S.orders.filter(function (o) { return o.status === 'waiting'; });
      if (!cand.length) { toast('대사할 입금 대기 주문이 없습니다.'); return; }
      modal('수동 대사 — 주문 선택',
        '<p style="margin-top:0">입금 <b>' + won(dep.amount) + '</b> (' + esc(dep.payer) +
        ')을 어느 주문에 연결할지 고르세요. <b>입금액과 주문액이 같은 주문만</b> 선택할 수 있습니다.</p>' +
        '<div class="codebox">' + cand.map(function (o) {
          var exact = o.amount === dep.amount;
          return '<div class="cr"><span><b class="num">' + esc(o.id) + '</b><span class="cs" style="display:block">' +
            esc(P(o.pid).name) + ' · ' + won(o.amount) + '</span></span>' +
            '<button class="btn sm ' + (exact ? 'v' : 'gh') + '" data-act="matchpick" data-i="' + di +
            '" data-id="' + o.id + '"' + (exact ? '' : ' disabled') + '>' +
            (exact ? '이 주문에 연결' : '금액 불일치') + '</button></div>';
        }).join('') + '</div>',
        '<button class="btn gh" data-act="mdclose">취소</button>');
      return;
    }
    if (a === 'matchpick') {
      var di2 = +t.getAttribute('data-i'), oid2 = t.getAttribute('data-id');
      var dep2 = S.deposits[di2], mo = O(oid2);
      if (!dep2 || !mo || dep2.match === 'auto' || mo.status !== 'waiting') {
        closeModal(); toast('이미 처리됐거나 연결할 수 없는 항목입니다.'); route(); return;
      }
      if (dep2.amount !== mo.amount) {
        toast('입금액과 주문액이 달라 연결하지 않았습니다.'); return;
      }
      dep2.match = 'auto'; dep2.order = oid2;
      mo.status = 'paid';
      S.alimtalk.logs.unshift({ at: now().slice(0, 16), code: 'DEP_OK', to: '010-2841-0**7', state: 'sent', ch: '알림톡' });
      closeModal(); route();
      toast('대사를 완료했습니다. 주문 상태를 결제 완료로 바꾸고 입금 확인 알림톡을 보냈습니다.');
      return;
    }
    if (a === 'depmode') {
      S.settings.depositMode = t.getAttribute('data-k'); route();
      toast('입금 확인 방식을 바꿨습니다.'); return;
    }
    if (a === 'ipadd') {
      var ipv = ((document.getElementById('newip') || {}).value || '').trim();
      if (!ipv4OK(ipv)) { toast('유효한 IPv4 주소를 입력해 주세요.'); return; }
      S.settings.allowIp.push(ipv); route(); toast('허용 IP를 추가했습니다.'); return;
    }
    if (a === 'ipdel') {
      if (S.settings.allowIp.length <= 1) { toast('마지막 허용 IP는 지울 수 없습니다.'); return; }
      S.settings.allowIp.splice(+t.getAttribute('data-i'), 1); route(); toast('허용 IP를 삭제했습니다.'); return;
    }
    if (a === 'stockfill') {
      var tx = document.getElementById('stx');
      if (tx) tx.value = '8842-1097-5531-0264\n8842-1097-5531-0731\n8842-1097-5531-1188';
      return;
    }
    if (a === 'stockadd') {
      var ta = document.getElementById('stx'), sel = document.getElementById('stp');
      var lines = (ta.value || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (!lines.length) { toast('번호를 한 줄에 한 장씩 넣어 주세요.'); return; }
      var pid = +sel.value, base = 42124;
      lines.forEach(function (ln, k) {
        /* 평문은 어느 필드에도 두지 않는다 — 끝 4자리만 남긴다 */
        S.stock.unshift({ sn: 'ST-00' + (base + k), tail: (ln.replace(/[^0-9]/g, '').slice(-4) || '0000'),
          pid: pid, state: 'unused', at: now().slice(0, 16), by: '관리자01' });
      });
      var pr = P(pid); if (pr) pr.stock += lines.length;
      ta.value = '';
      toast(lines.length + '장의 상품권 번호를 암호화해 등록했습니다.');
      route(); return;
    }
    if (a === 'popadd') {
      var tt = document.getElementById('ptt'), bd = document.getElementById('pbd');
      var title = sanitize(tt.value), body = sanitize(bd.value);
      if (!title || !body) { toast('제목과 본문은 필수입니다.'); return; }
      var lk = ((document.getElementById('plk') || {}).value || '').trim();
      if (lk && lk.indexOf('#/') !== 0) { toast('링크는 사이트 내부 경로(#/…) 형식으로 넣어 주세요.'); return; }
      S.popups.unshift({ title: title, body: body,
        from: (document.getElementById('pfr') || {}).value || '2026-09-20',
        to: (document.getElementById('pto') || {}).value || '2026-09-30',
        link: lk, on: true });
      toast('등록했습니다. 본문의 마크업은 저장 단계에서 버려졌습니다.');
      route(); return;
    }
    /* 관리자 2차 인증 확인 */
    if (a === 'admok') {
      var ov = [].slice.call(document.querySelectorAll('.otpc')).map(function (i) { return i.value; }).join('');
      if (ov !== '204815') { toast('인증번호가 맞지 않습니다.'); return; }
      S.admin = true; closeModal();
      location.hash = '#/admin/products';
      toast('2차 인증을 통과했습니다.');
      setTimeout(route, 0);
      return;
    }
  });

  /* ───────── 폼 submit ───────── */
  document.addEventListener('submit', function (ev) {
    var f = ev.target.closest('[data-act]');
    if (!f) return;
    ev.preventDefault();
    var a = f.getAttribute('data-act');
    if (a === 'login') {
      var loginPhone = normalizePhone((document.getElementById('lid') || {}).value || '');
      var loginPw = (document.getElementById('lpw') || {}).value || '';
      if (!phoneOK(loginPhone)) { toast('올바른 휴대전화 번호를 입력해 주세요.'); return; }
      if (!loginPw) { toast('비밀번호를 입력해 주세요.'); return; }
      if (loginPhone !== S.userPhone || loginPw !== S.userPassword) {
        toast('아이디 또는 비밀번호가 올바르지 않습니다.'); return;
      }
      S.login = true; toast('로그인했습니다.'); location.hash = '#/'; return;
    }
    if (a === 'join') {
      var joinPhone = normalizePhone((document.getElementById('jid') || {}).value || '');
      var pw = (document.getElementById('jpw') || {}).value || '';
      var pw2 = (document.getElementById('jpw2') || {}).value || '';
      if (!phoneOK(joinPhone)) { toast('올바른 휴대전화 번호를 입력해 주세요.'); return; }
      if (!pwOK(pw)) { toast('비밀번호는 특수문자를 포함해 8자리 이상이어야 합니다.'); return; }
      if (pw !== pw2) { toast('비밀번호와 비밀번호 확인값이 일치하지 않습니다.'); return; }
      if (!document.getElementById('jc1').checked || !document.getElementById('jc2').checked) {
        toast('필수 항목에 동의해 주세요.'); return;
      }
      S.userPhone = joinPhone; S.userPassword = pw;
      S.grade = 'none'; S.login = true;
      toast('가입되었습니다. 등급은 비승인회원입니다.'); location.hash = '#/mypage'; return;
    }
    if (a === 'chpw') {
      var cp = (document.getElementById('cpw') || {}).value || '';
      var np = (document.getElementById('npw') || {}).value || '';
      var np2 = (document.getElementById('npw2') || {}).value || '';
      if (cp !== S.userPassword) { toast('현재 비밀번호가 올바르지 않습니다.'); return; }
      if (!pwOK(np)) { toast('비밀번호는 특수문자를 포함해 8자리 이상이어야 합니다.'); return; }
      if (np !== np2) { toast('새 비밀번호와 확인값이 일치하지 않습니다.'); return; }
      S.userPassword = np;
      toast('비밀번호를 변경했습니다.'); return;
    }
    if (a === 'adminlogin') {
      var adminPw = (document.getElementById('apw') || {}).value || '';
      if (adminPw !== 'Admin!2026') { toast('관리자 비밀번호가 올바르지 않습니다.'); return; }
      modal('2차 인증',
        '<p style="margin-top:0">' + (S.settings.otp === 'app'
          ? '<b>OTP 앱</b>에 표시된 6자리를 넣어 주세요.'
          : '등록된 전화번호로 <b>알림톡 인증번호</b>를 보냈습니다.') +
        ' 비밀번호를 알아내도 이 단계를 통과해야 관리자 화면이 열립니다.</p>' +
        '<div class="otp">' + [0, 1, 2, 3, 4, 5].map(function (i) {
          return '<input type="text" inputmode="numeric" maxlength="1" class="otpc" data-i="' + i + '">'; }).join('') + '</div>' +
        '<p class="hint">허용 목록 밖 IP에서는 이 화면조차 열리지 않습니다.</p>',
        '<button class="btn gh" data-act="mdclose">취소</button>' +
        '<button class="btn v" data-act="admok">인증</button>');
      setTimeout(function () { var i = document.querySelector('.otpc'); if (i) i.focus(); }, 60);
      return;
    }
  });

  /* ───────── input / change ───────── */
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.classList && el.classList.contains('otpc')) {
      el.value = el.value.replace(/\D/g, '');
      if (el.value) { var n = el.parentNode.querySelectorAll('.otpc')[+el.getAttribute('data-i') + 1]; if (n) n.focus(); }
    }
    if (el.id === 'jpw' || el.id === 'npw') pwMeter(el.value);
    if (el.getAttribute && el.getAttribute('data-act') === 'set' && el.tagName !== 'SELECT') {
      var k = el.getAttribute('data-k');
      S.settings[k] = (el.type === 'number') ? +el.value : el.value;
      if (k === 'seoTitle') { var a1 = document.getElementById('seoT'); if (a1) a1.textContent = el.value; }
      if (k === 'seoDesc') { var a2 = document.getElementById('seoD'); if (a2) a2.textContent = el.value; }
    }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    var a = el.getAttribute && el.getAttribute('data-act');
    if (a === 'mon') { S.settings.methodOn[el.getAttribute('data-k')] = el.checked; toast('설정을 저장했습니다.'); return; }
    if (a === 'pop') { S.popups[+el.getAttribute('data-i')].on = el.checked; toast('노출 설정을 저장했습니다.'); return; }
    if (a === 'tpl') { S.alimtalk.templates[+el.getAttribute('data-i')].on = el.checked; toast('템플릿 사용 여부를 저장했습니다.'); return; }
    if (a === 'vis') {
      S.products[+el.getAttribute('data-i')].visible = el.checked;
      toast('판매 노출 설정을 저장했습니다. 쇼핑몰 화면에 즉시 반영됩니다.'); route(); return;
    }
    if (a === 'grade') {
      S.members[+el.getAttribute('data-i')].grade = el.value;
      toast('등급을 바꿨습니다. 변경 이력이 기록되었습니다.'); route(); return;
    }
    if (a === 'set' && el.tagName === 'SELECT') { S.settings[el.getAttribute('data-k')] = el.value; toast('설정을 저장했습니다.'); }
  });

  function ipv4OK(v) {
    var p = v.split('.');
    return p.length === 4 && p.every(function (x) {
      return /^\d{1,3}$/.test(x) && +x >= 0 && +x <= 255 && String(+x) === x;
    });
  }
  function normalizePhone(v) { return String(v || '').replace(/[^0-9]/g, ''); }
  function phoneOK(v) { return /^01(?:0|1|[6-9])\d{7,8}$/.test(normalizePhone(v)); }
  function pwOK(v) { return v.length >= 8 && /[^A-Za-z0-9]/.test(v) && /[A-Za-z]/.test(v) && /[0-9]/.test(v); }
  function pwMeter(v) {
    var r1 = v.length >= 8, r2 = /[^A-Za-z0-9]/.test(v), r3 = /[A-Za-z]/.test(v) && /[0-9]/.test(v);
    [['r1', r1], ['r2', r2], ['r3', r3]].forEach(function (x) {
      var e = document.getElementById(x[0]); if (e) e.classList.toggle('ok', x[1]);
    });
    var n = (r1 ? 1 : 0) + (r2 ? 1 : 0) + (r3 ? 1 : 0);
    [1, 2, 3].forEach(function (i) {
      var e = document.getElementById('pb' + i); if (e) e.classList.toggle('on', n >= i);
    });
  }

  /* ───────── 시작 ───────── */
  window.addEventListener('hashchange', route);
  route();
})();
