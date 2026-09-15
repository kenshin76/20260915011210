/* ============================================================
   프로토타입 목(mock) 데이터
   실제 서비스 데이터가 아니라 화면 시연용 표본입니다.
   브랜드명·회원명·번호는 모두 가상입니다.
   ============================================================ */
window.DB = (function () {
  'use strict';

  /* ── 회원 등급 4단계 (공고 2-2) ───────────────────────────── */
  var GRADES = {
    none: {
      key: 'none', name: '비승인회원', short: '비승인',
      account: 'instant-only',   // 「즉시 구매 가능」으로 지정된 상품만
      reveal: false,
      note: '가입 직후 등급입니다. 카드·휴대폰·토스로 구매하실 수 있으나 상품권 번호는 관리자 유선 승인 후에 확인하실 수 있습니다.'
    },
    card: {
      key: 'card', name: '카드승인회원', short: '카드승인',
      account: 'none',
      reveal: true,
      note: '카드·휴대폰·토스 구매와 번호 확인이 가능합니다. 계좌결제는 이용하실 수 없습니다.'
    },
    full: {
      key: 'full', name: '승인회원', short: '승인',
      account: 'all',
      reveal: true,
      note: '모든 상품을 모든 결제 수단으로 구매하실 수 있고 번호도 바로 확인하실 수 있습니다.'
    },
    biz: {
      key: 'biz', name: '비즈회원', short: '비즈',
      account: 'biz-only', bizOnly: true,
      reveal: true,
      note: '기업 고객을 위한 비즈 전용 상품을 구매하실 수 있습니다.'
    }
  };

  /* ── 결제 수단 4종 (공고 2-1) ─────────────────────────────── */
  var METHODS = [
    { key: 'account', name: '계좌결제', sub: '무통장 · 가상계좌', limited: false,
      desc: '주문 후 안내되는 전용 가상계좌로 입금하시면 결제 상태가 자동으로 변경됩니다.',
      badge: '한도 없음' },
    { key: 'card', name: '카드결제', sub: '국내 카드 · PG 통합', limited: true,
      desc: '국내 주요 신용카드와 체크카드로 편리하게 결제하실 수 있습니다.',
      badge: '카드+휴대폰 합계 100만원' },
    { key: 'phone', name: '휴대폰결제', sub: '통신사 소액결제', limited: true,
      desc: '본인 명의 휴대전화 인증 후 통신사 결제로 이용하실 수 있습니다.',
      badge: '카드+휴대폰 합계 100만원' },
    { key: 'toss', name: '토스 간편계좌', sub: 'PG 간편결제 항목', limited: false,
      desc: '토스 간편 인증으로 등록된 계좌에서 빠르게 결제하실 수 있습니다.',
      badge: '간편 인증 1회' }
  ];

  /* ── 상품 5종 (공고: 취급 상품 5종 내외) ──────────────────────
     prices: 결제 수단별 판매가 (공고 2-1 「상품 등록 시 결제 수단별 금액 설정」)
     methods: 결제 수단별 사용 여부   ·   visible: 판매 노출 여부         */
  var PRODUCTS = [
    {
      id: 1, brand: '온기상품권', name: '온기상품권 5만원권', face: 50000,
      img: 'assets/img/giftcard-paper-v3.webp', stock: 128, bizOnly: false, accountMode: 'approval', visible: true,
      prices: { account: 48000, card: 48500, phone: 48500, toss: 48300 },
      methods: { account: true, card: true, phone: true, toss: true },
      lead: '전국 2만여 가맹점에서 쓰이는 기본 상품권입니다. 주문 즉시 번호가 배정되고, 승인된 회원에게만 번호가 열립니다.',
      seo: { title: '온기상품권 5만원권 구매 | 상품권 스토어',
             desc: '온기상품권 5만원권을 계좌·카드·휴대폰·토스로 구매하실 수 있습니다. 번호는 승인 후 열람됩니다.' }
    },
    {
      id: 2, brand: '모아페이', name: '모아페이 1만원권', face: 10000,
      img: 'assets/img/giftcard-iceblue-v2.webp', stock: 0, bizOnly: false, accountMode: 'instant', visible: true,
      prices: { account: 9600, card: 9700, phone: 9700, toss: 9650 },
      methods: { account: true, card: true, phone: true, toss: true },
      lead: '소액 선물용으로 가장 많이 나가는 권종입니다. 재고가 소진되면 자동으로 품절 표시되고 구매가 막힙니다.',
      seo: { title: '모아페이 1만원권 구매 | 상품권 스토어',
             desc: '모아페이 1만원권. 현재 재고 소진으로 판매가 중지되어 있습니다.' }
    },
    {
      id: 3, brand: '그린티켓', name: '그린티켓 3만원권 (비즈 전용)', face: 30000,
      img: 'assets/img/giftcard-forest-v2.webp', stock: 540, bizOnly: true, accountMode: 'approval', visible: true,
      prices: { account: 28500, card: 28900, phone: 28900, toss: 28700 },
      methods: { account: true, card: false, phone: false, toss: true },
      lead: '기업 복지·프로모션용 대량 발주 권종입니다. 비즈회원 등급에서만 구매 화면이 열립니다.',
      seo: { title: '그린티켓 3만원권 (비즈 전용) | 상품권 스토어',
             desc: '기업 복지·프로모션용 그린티켓 3만원권. 비즈 등급 회원만 구매하실 수 있습니다.' }
    },
    {
      id: 4, brand: '시티기프트', name: '시티기프트 10만원권', face: 100000,
      img: 'assets/img/giftcard-metal-v3.webp', stock: 76, bizOnly: false, accountMode: 'instant', visible: true,
      prices: { account: 96000, card: 97000, phone: 97000, toss: 96500 },
      methods: { account: true, card: true, phone: true, toss: true },
      lead: '가입 즉시 계좌결제로 구매하실 수 있도록 지정된 상품입니다. 고액권이라 카드·휴대폰은 합계 한도에 먼저 걸립니다.',
      seo: { title: '시티기프트 10만원권 구매 | 상품권 스토어',
             desc: '시티기프트 10만원권. 가입 즉시 계좌결제로 구매하실 수 있습니다.' }
    },
    {
      id: 5, brand: '데일리상품권', name: '데일리상품권 5천원권', face: 5000,
      img: 'assets/img/giftcard-vermilion-v2.webp', stock: 12, bizOnly: false, accountMode: 'instant', visible: true,
      prices: { account: 4800, card: 4850, phone: 4850, toss: 4820 },
      methods: { account: true, card: true, phone: true, toss: true },
      lead: '낱개 선물용 최소 권종입니다. 남은 수량이 얼마 없으며, 0이 되면 자동으로 구매가 막힙니다.',
      seo: { title: '데일리상품권 5천원권 구매 | 상품권 스토어',
             desc: '데일리상품권 5천원권. 남은 수량이 얼마 없습니다.' }
    }
  ];

  /* ── 주문 (사용자 화면 시연용)
     amount = 결제 수단별 단가 × 수량 (+ 휴대폰은 통신사 수수료 5.5%)   */
  var ORDERS = [
    { id: 'ORD-26091501', pid: 1, qty: 2, method: 'card', status: 'paid',
      date: '2026-09-14 11:24', amount: 97000,          /* 48,500 × 2 */
      codes: ['8842-1097-5531-0264', '8842-1097-5531-0731'] },
    { id: 'ORD-26091402', pid: 4, qty: 1, method: 'account', status: 'waiting',
      date: '2026-09-14 09:02', amount: 96000,          /* 96,000 × 1 */
      vacct: '기업은행 015-812345-04-118', codes: ['5510-7734-9920-4417'] },
    { id: 'ORD-26091203', pid: 5, qty: 3, method: 'phone', status: 'paid',
      date: '2026-09-12 18:41', amount: 15350,          /* 4,850 × 3 = 14,550 + 5.5% 800 */
      codes: ['2301-5567-1180-7742', '2301-5567-1180-9903', '2301-5567-1181-2260'] },
    { id: 'ORD-26090904', pid: 1, qty: 1, method: 'toss', status: 'cancelled',
      date: '2026-09-09 14:10', amount: 48300, codes: [] }
  ];

  /* ── 관리자 — 회원
     revealOK : 최초 1회 관리자 유선 승인 여부 (등급과 별개 · 공고 2-1)   */
  var MEMBERS = [
    { phone: '010-2841-0**7', name: '김O민', grade: 'full', revealOK: true,
      approvedAt: '2025-03-12 10:41', approvedBy: '관리자01', joined: '2025-03-11', orders: 41, last: '2026-09-14' },
    { phone: '010-9930-5**2', name: '이O아', grade: 'card', revealOK: true,
      approvedAt: '2026-01-08 15:22', approvedBy: '관리자02', joined: '2026-01-08', orders: 7, last: '2026-09-13' },
    { phone: '010-4417-2**0', name: '박O준', grade: 'none', revealOK: false,
      approvedAt: '', approvedBy: '', joined: '2026-09-13', orders: 0, last: '2026-09-13' },
    { phone: '010-7702-8**5', name: '(주)한결', grade: 'biz', revealOK: true,
      approvedAt: '2024-07-23 09:10', approvedBy: '관리자01', joined: '2024-07-22', orders: 188, last: '2026-09-12' },
    { phone: '010-3318-6**1', name: '최O서', grade: 'none', revealOK: false,
      approvedAt: '', approvedBy: '', joined: '2026-09-12', orders: 1, last: '2026-09-12' },
    { phone: '010-5566-1**9', name: '정O훈', grade: 'card', revealOK: true,
      approvedAt: '2025-12-01 11:03', approvedBy: '관리자01', joined: '2025-11-30', orders: 22, last: '2026-09-11' }
  ];

  /* ── 관리자 — 입금 대사 ──────────────────────────────────── */
  var DEPOSITS = [
    { at: '2026-09-14 09:06', payer: '박O준', amount: 96000, acct: '015-812345-04-118',
      order: null, match: 'manual', src: 'vacct',
      memo: '입금자명이 주문자명과 달라 자동 매칭되지 않았습니다' },
    { at: '2026-09-14 08:51', payer: '(주)한결', amount: 2890000, acct: '015-812345-04-101',
      order: 'ORD-26091388', match: 'auto', src: 'vacct', memo: '' },
    { at: '2026-09-13 17:40', payer: '김O민', amount: 48500, acct: '015-812345-04-127',
      order: null, match: 'manual', src: 'app', memo: '앱 알림 인식(별도 선택안)으로 들어온 표본' },
    { at: '2026-09-13 11:12', payer: '이O아', amount: 9700, acct: '015-812345-04-133',
      order: 'ORD-26091355', match: 'auto', src: 'vacct', memo: '' }
  ];

  /* ── 관리자 — 재고 (암호화 저장 시연용)
     tail 만 보관합니다. 평문은 어느 필드에도 두지 않습니다.            */
  var STOCK = [
    { sn: 'ST-0042118', tail: '0264', pid: 1, state: 'sold', at: '2026-09-10 10:22', by: '관리자01', order: 'ORD-26091501' },
    { sn: 'ST-0042119', tail: '0731', pid: 1, state: 'sold', at: '2026-09-10 10:22', by: '관리자01', order: 'ORD-26091501' },
    { sn: 'ST-0042120', tail: '4417', pid: 4, state: 'unused', at: '2026-09-11 14:05', by: '관리자01' },
    { sn: 'ST-0042121', tail: '9903', pid: 5, state: 'sold', at: '2026-09-08 09:40', by: '관리자02', order: 'ORD-26091203' },
    { sn: 'ST-0042122', tail: '1180', pid: 3, state: 'unused', at: '2026-09-12 16:31', by: '관리자01' },
    { sn: 'ST-0042123', tail: '7742', pid: 5, state: 'void', at: '2026-09-05 11:18', by: '관리자02' }
  ];

  /* ── 관리자 — 팝업·공지 (에디터 없이 정해진 칸) ──────────── */
  var POPUPS = [
    { title: '추석 연휴 고객센터 운영 안내', from: '2026-09-20', to: '2026-09-30', on: true,
      body: '연휴 기간에도 상품권 번호는 정상 발급됩니다. 가상계좌 입금은 PG 통지를 수신한 뒤 자동으로 확인하며, 미매칭 건은 운영자가 확인합니다.',
      link: '#/terms' },
    { title: '보안 강화 작업 안내 (관리자 2차 인증 적용)', from: '2026-09-10', to: '2026-09-18', on: true,
      body: '관리자 로그인에 2차 인증이 적용되었습니다. 등록된 IP에서만 접속하실 수 있습니다.',
      link: '' },
    { title: '모아페이 1만원권 재입고 예정', from: '2026-09-16', to: '2026-09-26', on: false,
      body: '재고 소진으로 판매가 중지된 모아페이 1만원권은 9월 넷째 주 재입고 예정입니다.',
      link: '#/product/2' }
  ];

  /* ── 관리자 — 알림톡 템플릿과 발송 이력 (공고 2-1 · 2-4) ──── */
  var ALIMTALK = {
    templates: [
      { code: 'ORD_RECV', name: '주문 접수', when: '주문 생성 직후', on: true,
        body: '[상품권 스토어] 주문이 접수되었습니다. 주문번호 #{주문번호} · 금액 #{금액}' },
      { code: 'DEP_OK', name: '입금 확인', when: '가상계좌 입금 통지 수신', on: true,
        body: '[상품권 스토어] 입금이 확인되었습니다. 주문번호 #{주문번호}' },
      { code: 'RVL_APRV', name: '번호 열람 승인', when: '관리자 유선 승인 처리', on: true,
        body: '[상품권 스토어] 상품권 번호 열람이 승인되었습니다. 주문 상세에서 확인해 주세요.' },
      { code: 'RVL_CODE', name: '번호 확인 1회용 코드', when: '번호 확인 요청', on: true,
        body: '[상품권 스토어] 확인 코드 #{코드} (3분 내 입력)' },
      { code: 'PW_RESET', name: '비밀번호 재설정 링크', when: '비밀번호 찾기 요청', on: true,
        body: '[상품권 스토어] 비밀번호 재설정 링크입니다. 30분 뒤 만료됩니다. #{링크}' }
    ],
    logs: [
      { at: '2026-09-14 11:24', code: 'ORD_RECV', to: '010-2841-0**7', state: 'sent', ch: '알림톡' },
      { at: '2026-09-14 09:06', code: 'DEP_OK', to: '010-4417-2**0', state: 'sent', ch: '알림톡' },
      { at: '2026-09-13 22:18', code: 'PW_RESET', to: '010-3318-6**1', state: 'fail', ch: 'SMS 대체' },
      { at: '2026-09-13 17:41', code: 'RVL_APRV', to: '010-9930-5**2', state: 'sent', ch: '알림톡' }
    ]
  };

  /* ── 개인정보 보유·파기 기준 (공고 2-4) ─────────────────── */
  var RETENTION = [
    ['회원 정보 (전화번호·비밀번호 해시)', '회원 식별·로그인', '정보주체 동의', '탈퇴 후 즉시', '복구 불가 방식 삭제'],
    ['주문·결제 내역', '계약 이행·분쟁 대응', '전자상거래법', '5년', '자동 파기 배치'],
    ['상품권 번호 (암호문)', '상품 제공', '계약 이행', '사용 후 1년', '암호문·키 함께 폐기'],
    ['번호 열람 기록', '침해 대응·감사', '정보통신망법', '1년', '자동 파기 배치'],
    ['관리자 접속 기록', '접근 통제 감사', '개인정보보호법', '1년', '자동 파기 배치']
  ];

  /* ── 화면 목록 (프로토타입 안내용) ───────────────────────── */
  var SCREENS = [
    ['01', '메인', '#/'], ['02', '상품 목록', '#/products'], ['03', '상품 상세', '#/product/1'],
    ['04', '주문·결제', '#/checkout/1'], ['05', '결제 완료', '#/done/ORD-26091501'],
    ['06', '주문 내역', '#/orders'], ['07', '주문 상세 — 번호 확인', '#/order/ORD-26091501'],
    ['08', '로그인', '#/login'], ['09', '회원가입', '#/join'], ['10', '마이페이지', '#/mypage'],
    ['11', '이용약관', '#/terms'], ['12', '개인정보처리방침', '#/privacy'],
    ['13', '관리자 로그인 (2차 인증)', '#/admin'], ['14', '상품 관리', '#/admin/products'],
    ['15', '상품권 재고 관리', '#/admin/stock'], ['16', '회원·등급 관리', '#/admin/members'],
    ['17', '주문·결제 관리', '#/admin/orders'], ['18', '입금 확인', '#/admin/deposits'],
    ['19', '설정 · 알림톡 · 개인정보', '#/admin/settings'], ['20', '팝업·공지 관리', '#/admin/popup']
  ];

  /* ── 운영 설정 (관리자 설정 화면 초기값) ────────────────── */
  var SETTINGS = {
    limitCardPhone: 1000000,       // 카드+휴대폰 합계 한도 (공고 2-1)
    feePhone: 5.5,                 // 통신사 수수료 %
    otp: 'app',                    // 'app' | 'alimtalk'
    allowIp: ['211.104.22.14', '121.78.5.90'],
    revealPerAccount: 5,           // 10분당 계정 요청 상한
    revealPerServer: 50,           // 10분당 서버 전체 상한
    ticketSec: 180,                // 열람권 유효 시간(초)
    adminMaskTail: 4,              // 관리자 화면 노출 자릿수
    adminDailyCap: 20,             // 관리자 일일 열람 상한
    depositMode: 'vacct',          // 'vacct' | 'app' — 입금 확인 방식
    ssl: {
      shop: { domain: 'shop.example.com', expire: '2026-12-07', auto: true, last: '2026-09-08 03:10', method: 'HTTP-01' },
      admin: { domain: 'admin.example.com', expire: '2026-12-07', auto: true, last: '2026-09-08 03:12', method: 'DNS-01 (외부 접속 차단 도메인)' }
    },
    seoTitle: '상품권 스토어 — 모바일 상품권을 안전하게',
    seoDesc: '계좌·카드·휴대폰·토스 간편계좌로 모바일 상품권을 구매하실 수 있습니다. 상품권 번호는 승인된 회원에게만 열립니다.',
    methodOn: { account: true, card: true, phone: true, toss: true }
  };

  /* ── 콘텐츠(매거진) ──────────────────────────────────────── */
  var STORIES = [
    { id: 1, kicker: '이용 가이드', img: 'assets/img/editorial-security-v1.webp', to: '#/orders',
      alt: '스마트폰의 잠금 화면과 종이·카드 상품권을 배치한 보안 이미지',
      title: '구매한 상품권은 어디에서 확인하나요?',
      lead: '결제가 완료된 상품권은 주문 내역에서 확인할 수 있습니다. 본인 확인을 마치면 상품권 번호가 안전하게 열립니다.' },
    { id: 2, kicker: '결제 안내', img: 'assets/img/editorial-payments-v1.webp', to: '#/product/4',
      alt: '스마트폰과 카드·종이 상품권을 배치한 통합 결제 이미지',
      title: '원하는 방식으로 간편하게 결제하세요',
      lead: '계좌·카드·휴대폰·토스 간편계좌 중 상품과 회원 등급에 맞는 결제 수단을 선택하실 수 있습니다.' },
    { id: 3, kicker: '비즈 혜택', img: 'assets/img/editorial-operations-v1.webp', to: '#/product/3',
      alt: '상품권 재고 대시보드가 열린 차가운 금속 질감의 운영 데스크 이미지',
      title: '기업 고객을 위한 비즈 전용 상품권',
      lead: '임직원 복지와 프로모션에 활용할 수 있는 비즈 전용 상품권을 편리하게 구매하세요.' }
  ];

  return { GRADES: GRADES, METHODS: METHODS, PRODUCTS: PRODUCTS, ORDERS: ORDERS,
           MEMBERS: MEMBERS, DEPOSITS: DEPOSITS, STOCK: STOCK, POPUPS: POPUPS,
           ALIMTALK: ALIMTALK, RETENTION: RETENTION,
           STORIES: STORIES, SCREENS: SCREENS, SETTINGS: SETTINGS };
})();
