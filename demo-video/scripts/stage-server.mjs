/**
 * A stand-in LedgerMark build, for proving the pipeline when the deployed demo is out of
 * reach (no network route, or a take rehearsed before the site is up).
 *
 * It is a stage set, not the product: the routes, roles, UID state machine and module list
 * mirror what the real app exposes, and the element ids match the first selector each step
 * in `ir-full-tour.json` tries. So a `--check` against this stage proves the scenario's
 * *shape* — 19 scenes, per-role sign-in, trimming, captions, production — while only a
 * `--check` against the deployed build proves the real selectors.
 *
 *   node scripts/stage-server.mjs --port 4173
 *
 * Nothing here is IR footage. Every page carries a watermark saying so, on purpose: a
 * still from a stand-in must never be mistaken for the product in an investor deck.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fontFiles } from '../src/lib/env.mjs';

const port = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 4173);

const FONTS = fontFiles();
const FONT_CSS = Object.entries(FONTS)
  .map(
    ([weight, path]) =>
      `@font-face{font-family:Pretendard;font-weight:${weight};font-display:block;` +
      `src:url(data:font/woff2;base64,${readFileSync(path).toString('base64')}) format('woff2')}`,
  )
  .join('');

const UID = 'PH-2026-DEMO-000001';
const TRACE = [
  ['MINTED', '2026-03-02 09:14', '코니아랩 생산 · Lot L-2603-A', '생산 UID 발행 + 원장 1번 기록'],
  ['EXPORTED', '2026-03-11 17:40', '부산항 → 마닐라 · B/L 2603117', '수출 신고 수리'],
  ['WHOLESALE', '2026-03-24 11:05', '마닐라 통관 완료 · 세액 ₱48.00', '관세·물품세 납부 확인'],
  ['RETAIL_SOLD', '2026-04-02 15:22', 'Store #PH-014 · 연령확인 완료', 'RA 11900 성인인증 통과'],
  ['EXCHANGED', '2026-04-19 10:48', '교환권 V-0419-7 수령', '불량 교환 1회 · 3개월 유효'],
  ['RESOLD', '2026-05-07 19:03', 'Store #PH-014 재판매', '원장 6번 기록 · 체인 고정'],
];

const ROLE_BAND = {
  consumer: ['#0f172a', '#4ADE80', 'ConiaMark · 소비자'],
  store: ['#13203a', '#60a5fa', 'LedgerMark Partner · 가맹점'],
  field: ['#1c1917', '#f59e0b', 'LedgerMark Field · 현장 단속'],
  inspector: ['#0b2545', '#f4c542', 'Bureau of Customs · 정부 포털'],
  admin: ['#0b0d10', '#4ADE80', 'LedgerMark Console · 통합 관리'],
};

function layout({ role = 'admin', title, body, nav = '' }) {
  const [bg, accent, bandText] = ROLE_BAND[role] ?? ROLE_BAND.admin;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0}
body{font-family:Pretendard,sans-serif;background:#f6f7f9;color:#14181f;word-break:keep-all;-webkit-font-smoothing:antialiased}
.band{background:${bg};color:#fff;border-bottom:3px solid ${accent};padding:18px 44px;display:flex;align-items:center;gap:16px}
.band b{font-weight:700;font-size:19px;letter-spacing:-.01em}
.band span{font-size:14px;opacity:.68}
.band .mark{margin-left:auto;font-size:12px;letter-spacing:.14em;color:${accent};font-weight:600}
nav{display:flex;gap:6px;padding:14px 44px;background:#fff;border-bottom:1px solid #e3e6eb;flex-wrap:wrap}
nav button{font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:8px;border:1px solid #dfe3e9;background:#fff;color:#4b5563;cursor:pointer}
nav button[aria-current="true"]{background:${bg};color:#fff;border-color:${bg}}
main{padding:36px 44px 56px;max-width:1700px}
h1{font-size:30px;font-weight:700;letter-spacing:-.02em;margin-bottom:6px}
.lede{color:#6b7280;font-size:15px;margin-bottom:28px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
.card{background:#fff;border:1px solid #e3e6eb;border-radius:14px;padding:22px 24px}
.card .k{font-size:12.5px;font-weight:600;color:#8b93a1;letter-spacing:.03em;margin-bottom:10px}
.card .v{font-size:34px;font-weight:700;letter-spacing:-.025em;font-variant-numeric:tabular-nums}
.card .d{font-size:13px;color:#9aa2b1;margin-top:6px}
.panel{background:#fff;border:1px solid #e3e6eb;border-radius:14px;padding:26px 28px;margin-bottom:20px}
.panel h2{font-size:18px;font-weight:700;margin-bottom:4px}
.panel p.sub{font-size:13.5px;color:#8b93a1;margin-bottom:20px}
table{width:100%;border-collapse:collapse;font-size:14.5px}
th{text-align:left;font-weight:600;color:#8b93a1;font-size:12.5px;padding:0 12px 11px;border-bottom:1px solid #e9ecf1}
td{padding:14px 12px;border-bottom:1px solid #f1f3f6;font-variant-numeric:tabular-nums}
.pill{display:inline-block;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:#eef2f7;color:#4b5563}
.pill.ok{background:#dcfce7;color:#15803d}.pill.warn{background:#fef3c7;color:#92400e}.pill.bad{background:#fee2e2;color:#b91c1c}
input{font:inherit;font-size:16px;padding:14px 16px;border:1px solid #d8dde5;border-radius:10px;width:380px}
.btn{font:inherit;font-size:15px;font-weight:700;padding:14px 26px;border:0;border-radius:10px;background:${bg};color:#fff;cursor:pointer}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
ol.tl{list-style:none;counter-reset:s}
ol.tl li{position:relative;padding:0 0 26px 46px;border-left:2px solid #e3e6eb;margin-left:13px}
ol.tl li:last-child{border-left-color:transparent;padding-bottom:0}
ol.tl li::before{counter-increment:s;content:counter(s);position:absolute;left:-15px;top:-2px;width:28px;height:28px;border-radius:50%;background:${bg};color:#fff;font-size:13px;font-weight:700;display:grid;place-items:center}
ol.tl .st{font-size:15px;font-weight:700;letter-spacing:.01em}
ol.tl .at{font-size:13px;color:#9aa2b1;margin:3px 0 5px;font-variant-numeric:tabular-nums}
ol.tl .no{font-size:14px;color:#4b5563}
.hash{font-family:ui-monospace,monospace;font-size:13px;color:#6b7280;word-break:break-all}
.wm{position:fixed;right:16px;bottom:14px;font-size:11px;letter-spacing:.1em;color:#b6bcc7;font-weight:600;pointer-events:none}
</style></head><body>
<div class="band"><b>LedgerMark</b><span>${bandText}</span><span class="mark">STAND-IN STAGE</span></div>
${nav}<main>${body}</main><div class="wm">STAND-IN STAGE · NOT PRODUCT FOOTAGE</div></body></html>`;
}

const MODULES = [
  ['dashboard', '대시보드'], ['lookup', 'UID 조회'], ['alerts', '밀수 경보'],
  ['exchanges', '교환 원장'], ['ledger', '원장 상태'], ['audit', '감사 로그'],
  ['production', '생산 관리'], ['customs', '통관 관리'], ['accounts', '계정 관리'],
];

// The real console swaps modules in place; the stage navigates instead, so the same
// `click #module-ledger` step works against either one.
const MODULE_HREF = {
  ledger: '/console/ledger',
  audit: '/console/audit',
  production: '/console/production',
  customs: '/console/customs-admin',
  exchanges: '/console/exchanges',
};
const consoleNav = (active) =>
  `<nav>${MODULES.map(
    ([id, label]) =>
      `<button id="module-${id}" data-module="${id}" aria-current="${id === active}"` +
      ` onclick="location.href='${MODULE_HREF[id] ?? '/console'}'">${label}</button>`,
  ).join('')}</nav>`;

const traceList = () =>
  `<ol class="tl">${TRACE.map(([st, at, where, note]) => `<li><div class="st">${st}</div><div class="at">${at} · ${where}</div><div class="no">${note}</div></li>`).join('')}</ol>`;

const PAGES = {
  '/app': () =>
    layout({
      role: 'consumer',
      title: 'ConiaMark · 정품 확인',
      body: `<h1>정품 확인</h1><p class="lede">제품 하단 UID를 입력하면 생산부터 현재까지의 전 이력이 원장에서 조회됩니다.</p>
<div class="panel"><div class="row"><input id="uid-input" placeholder="PH-2026-XXXX-XXXXXX" autocomplete="off"><button class="btn" id="uid-submit">조회</button></div>
<div id="verdict" style="margin-top:22px"><span class="pill ok">정품 확인</span> <span style="font-size:15px;color:#4b5563">${UID} · 원장 기록 6건 · 체인 고정 완료</span></div></div>
<div class="panel" id="trace-timeline"><h2>유통 이력</h2><p class="sub">추가만 가능한 해시 체인 · 각 단계가 직전 기록의 해시를 포함합니다</p>${traceList()}</div>
<div class="panel" id="consent-panel"><h2>데이터 제공 동의</h2><p class="sub">동의·철회 모두 원장에 기록되며, 동의 시 포인트가 적립됩니다</p>
<div class="row"><button class="btn" id="consent-accept">동의하고 적립</button><span id="points-balance" style="font-size:22px;font-weight:700">1,250 P</span></div></div>
<div class="panel" id="survey-panel"><h2>설문 참여</h2><p class="sub">동의한 소비자에게만 노출 · 응답은 SurveyResponse 로 1인 1회 기록됩니다</p>
<table><thead><tr><th>설문</th><th>문항</th><th>적립</th><th>상태</th></tr></thead><tbody>
<tr><td>구매 경로 조사 2026-Q2</td><td>6</td><td>300 P</td><td><span class="pill ok">응답 완료</span></td></tr>
<tr><td>니코틴 농도 선호도</td><td>4</td><td>200 P</td><td><span class="pill warn">참여 가능</span></td></tr>
<tr><td>교환 경험 만족도</td><td>5</td><td>250 P</td><td><span class="pill">교환 이력 필요</span></td></tr>
</tbody></table>
<div class="row" style="margin-top:18px"><button class="btn" id="survey-start">설문 시작</button><span style="font-size:14px;color:#6b7280">응답 자체가 아니라 <b>응답했다는 사실</b>이 원장에 남습니다</span></div></div>
<div class="panel" id="reward-panel"><h2>리워드 교환</h2><p class="sub">포인트 차감과 리워드 발급이 한 트랜잭션 · RewardRedemption 으로 보존</p>
<table><thead><tr><th>리워드</th><th>필요 포인트</th><th>재고</th><th></th></tr></thead><tbody>
<tr><td>정품 케이스</td><td>1,000 P</td><td>남음 42</td><td><span class="pill ok">교환 가능</span></td></tr>
<tr><td>클리닝 키트</td><td>1,500 P</td><td>남음 8</td><td><span class="pill warn">포인트 부족</span></td></tr>
<tr><td>가맹점 할인권</td><td>2,000 P</td><td>남음 120</td><td><span class="pill warn">포인트 부족</span></td></tr>
</tbody></table>
<div class="row" style="margin-top:18px"><button class="btn" id="reward-redeem">교환하기</button><span id="reward-balance" style="font-size:22px;font-weight:700">1,250 P</span></div></div>`,
    }),
  '/partner': () =>
    layout({
      role: 'store',
      title: 'LedgerMark Partner',
      body: `<h1>판매 등록 · 교환권</h1><p class="lede">판매 시 연령확인과 UID 상태 전이가 한 번에 원장에 기록됩니다.</p>
<div class="panel"><h2>판매 등록</h2><p class="sub">RA 11900 성인인증 통과 후에만 RETAIL_SOLD 전이가 허용됩니다</p>
<div class="row"><input id="sale-uid" placeholder="UID 스캔 또는 입력"><button class="btn" id="sale-submit">판매 확정</button></div>
<div id="sale-result" style="margin-top:20px"><span class="pill ok">연령확인 완료</span> <span class="pill">RETAIL_SOLD</span> <span style="font-size:14px;color:#6b7280">원장 4번 기록</span></div></div>
<div class="panel" id="exchange-panel"><h2>불량 교환</h2><p class="sub">예약 후 수령의 2단계 · 동일 제품군 내 1회, 유효기간 3개월</p>
<div class="row"><button class="btn" id="exchange-reserve">교환 예약</button><button class="btn" id="exchange-claim">교환권 수령</button></div>
<div id="exchange-voucher" style="margin-top:20px"><span class="pill warn">V-0419-7 · 2026-07-19 까지</span> <span style="font-size:14px;color:#6b7280">재교환 불가 (voucherState: NONE)</span></div></div>`,
    }),
  '/kiosk': () =>
    layout({
      role: 'store',
      title: 'LedgerMark Kiosk',
      body: `<h1>무인 판매기</h1><p class="lede">키오스크 판매도 동일한 원장에 기록됩니다.</p>
<div class="panel" id="kiosk-screen"><h2>KioskSale</h2><p class="sub">연령확인 → UID 전이 → 원장 기록이 단일 트랜잭션으로 묶입니다</p>
<div class="grid"><div class="card"><div class="k">오늘 판매</div><div class="v">38</div><div class="d">전일 +6</div></div>
<div class="card"><div class="k">연령확인 실패</div><div class="v">2</div><div class="d">판매 차단</div></div>
<div class="card"><div class="k">미통관 UID 차단</div><div class="v">1</div><div class="d">경보 생성</div></div>
<div class="card"><div class="k">원장 기록</div><div class="v">38</div><div class="d">누락 0</div></div></div>
<button class="btn" id="kiosk-scan">스캔 시작</button></div>`,
    }),
  // Reachable with no session at all — the consumer buying at the machine has no account.
  // The staff POS view at the same route is the signed-in one; see effectivePath below.
  '/kiosk-consumer': () =>
    layout({
      role: 'consumer',
      title: 'ConiaMark 자판기',
      body: `<h1>자판기 구매</h1><p class="lede">로그인 없이 구매합니다. 연령확인만 통과하면 거래가 성립하고, 그 사실이 원장에 기록됩니다.</p>
<div class="panel" id="kiosk-products"><h2>제품 선택</h2><p class="sub">재고는 UID 단위로 잡혀 있습니다 — 판매 즉시 해당 UID 가 전이됩니다</p>
<table><thead><tr><th>제품</th><th>용량 · 농도</th><th>가격</th><th>재고</th><th></th></tr></thead><tbody>
<tr><td>ConiaMark Classic</td><td>30mL · 12mg/mL</td><td>₱480</td><td>14</td><td><button class="btn" id="kiosk-pick" style="padding:8px 18px;font-size:14px">선택</button></td></tr>
<tr><td>ConiaMark Light</td><td>60mL · 6mg/mL</td><td>₱620</td><td>9</td><td><span class="pill">선택</span></td></tr>
<tr><td>ConiaMark Device</td><td>—</td><td>₱1,850</td><td>3</td><td><span class="pill">선택</span></td></tr>
</tbody></table></div>
<div class="panel" id="kiosk-age"><h2>연령확인</h2><p class="sub">RA 11900 · 신분증 스캔 + 라이브니스 · 통과하지 못하면 결제 단계로 넘어가지 않습니다</p>
<div class="row"><span class="pill ok">신분증 스캔 완료</span><span class="pill ok">라이브니스 통과</span><span class="pill ok">만 18세 이상</span></div>
<div class="row" style="margin-top:18px"><button class="btn" id="kiosk-buy">결제</button><span style="font-size:14px;color:#6b7280">신분증 이미지는 저장하지 않고 판정 결과만 남깁니다</span></div></div>
<div class="panel" id="kiosk-receipt"><h2>거래 완료</h2><p class="sub">KioskSale · 연령확인 · UID 전이 · 원장 기록이 단일 트랜잭션</p>
<table><thead><tr><th>항목</th><th>값</th></tr></thead><tbody>
<tr><td>UID</td><td>PH-2026-DEMO-004912</td></tr>
<tr><td>상태 전이</td><td>WHOLESALE → <span class="pill ok">RETAIL_SOLD</span></td></tr>
<tr><td>연령확인</td><td>RA11900_ID_LIVENESS · 통과</td></tr>
<tr><td>구매자 식별</td><td><span class="pill">익명 · 계정 없음</span></td></tr>
<tr><td>원장 기록</td><td>#186,403</td></tr>
</tbody></table></div>`,
    }),
  '/field': () =>
    layout({
      role: 'field',
      title: 'LedgerMark Field',
      body: `<h1>현장 단속</h1><p class="lede">현장에서 UID를 조회하면 통관 여부와 정·위품 판정이 즉시 반환됩니다.</p>
<div class="panel"><div class="row"><input id="field-uid" placeholder="UID 스캔"><button class="btn" id="field-check">판정</button></div>
<div id="field-verdict" style="margin-top:20px"><span class="pill ok">VERIFIED</span> <span style="font-size:14px;color:#6b7280">통관 기록 일치 · 세액 ₱48.00 납부 확인</span></div></div>
<div class="panel" id="field-verdicts"><h2>판정 3종</h2><p class="sub">판정 결과는 FieldInspection 으로 원장과 함께 보존됩니다</p>
<table><thead><tr><th>판정</th><th>의미</th><th>후속 조치</th><th>오늘</th></tr></thead><tbody>
<tr><td><span class="pill ok">VERIFIED</span></td><td>통관·원장 기록 일치</td><td>통과</td><td>142</td></tr>
<tr><td><span class="pill warn">SEIZURE_GROUNDS</span></td><td>통관 기록 없음</td><td>압수 근거 확보</td><td>11</td></tr>
<tr><td><span class="pill bad">COUNTERFEIT_SUSPECTED</span></td><td>원장에 없는 UID</td><td>위품 의심 · 수사 이첩</td><td>4</td></tr>
</tbody></table></div>
<div class="panel" id="alert-panel"><h2>밀수 경보</h2><p class="sub">미통관 UID가 소매 단계에서 관측되면 자동 생성됩니다</p>
<table><thead><tr><th>경보</th><th>UID</th><th>지점</th><th>상태</th></tr></thead><tbody>
<tr><td>SA-0507-18</td><td>PH-2026-DEMO-004471</td><td>Store #PH-031</td><td><span class="pill bad">미통관</span></td></tr>
<tr><td>SA-0507-19</td><td>PH-2026-DEMO-004472</td><td>Store #PH-031</td><td><span class="pill bad">미통관</span></td></tr>
</tbody></table></div>`,
    }),
  '/customs': () =>
    layout({
      role: 'inspector',
      title: 'Bureau of Customs · LedgerMark',
      body: `<h1 id="customs-band">통관 · 세액 포털</h1><p class="lede">수입 배치별 납부 세액과 UID 발행 내역을 대조합니다. 조회 전용 권한입니다.</p>
<div class="grid"><div class="card"><div class="k">통관 배치</div><div class="v">26</div><div class="d">최근 90일</div></div>
<div class="card"><div class="k">납부 세액</div><div class="v">₱1.42M</div><div class="d">물품세 + 관세</div></div>
<div class="card"><div class="k">미통관 관측</div><div class="v">15</div><div class="d">경보 발생</div></div>
<div class="card"><div class="k">세액 대조</div><div class="v">100%</div><div class="d">불일치 0</div></div></div>
<div class="panel" id="customs-batches"><h2>수입 배치</h2><p class="sub">배치 통관 시점의 세율표가 고정 적용됩니다</p>
<table><thead><tr><th>배치</th><th>통관일</th><th>품목</th><th>수량</th><th>적용 세율</th><th>세액</th></tr></thead><tbody>
<tr><td>IB-2603-07</td><td>2026-03-24</td><td>LIQUID 30mL · 니코틴 12mg/mL</td><td>4,800</td><td>₱57.00 / mL</td><td>₱821,000</td></tr>
<tr><td>IB-2604-02</td><td>2026-04-08</td><td>DEVICE</td><td>1,200</td><td>₱60.00 / 개</td><td>₱72,000</td></tr>
<tr><td>IB-2605-01</td><td>2026-05-02</td><td>LIQUID 60mL · 니코틴 6mg/mL</td><td>2,400</td><td>₱52.00 / mL</td><td>₱529,000</td></tr>
</tbody></table></div>
<div class="panel" id="customs-tax"><h2>세액 산정 근거</h2><p class="sub">LIQUID 은 용량 × 세율, DEVICE 는 개당 정액 · 니코틴 농도 구간은 하한 포함 상한 제외</p>
<div class="hash">tariff(effectiveFrom ≤ clearedAt) → pickTariff() → taxPerUnit() → ImportBatch.taxTotal</div></div>`,
    }),
  '/console': () =>
    layout({
      role: 'admin',
      title: 'LedgerMark Console',
      nav: consoleNav('dashboard'),
      body: `<h1>통합 대시보드</h1><p class="lede">생산부터 재판매까지 6단계 상태와 원장 무결성을 한 화면에서 확인합니다.</p>
<div class="grid" id="kpi-grid"><div class="card"><div class="k">발행 UID</div><div class="v">48,210</div><div class="d">Lot 26건</div></div>
<div class="card"><div class="k">소매 판매</div><div class="v">31,884</div><div class="d">연령확인 100%</div></div>
<div class="card"><div class="k">원장 기록</div><div class="v">186,402</div><div class="d">해시 체인 연속</div></div>
<div class="card"><div class="k">현장 판정</div><div class="v">157</div><div class="d">정품 142 · 미통관 11 · 위품 4</div></div></div>
<div class="panel"><h2>UID 상태 분포</h2><p class="sub">MINTED → EXPORTED → WHOLESALE → RETAIL_SOLD → EXCHANGED → RESOLD</p>
<table><thead><tr><th>상태</th><th>수량</th><th>비중</th><th>직전 단계 대비</th></tr></thead><tbody>
<tr><td>MINTED</td><td>48,210</td><td>100%</td><td>—</td></tr>
<tr><td>EXPORTED</td><td>44,900</td><td>93.1%</td><td>−3,310</td></tr>
<tr><td>WHOLESALE</td><td>41,120</td><td>85.3%</td><td>−3,780</td></tr>
<tr><td>RETAIL_SOLD</td><td>31,884</td><td>66.1%</td><td>−9,236</td></tr>
<tr><td>EXCHANGED</td><td>612</td><td>1.3%</td><td>교환 1회 한정</td></tr>
<tr><td>RESOLD</td><td>418</td><td>0.9%</td><td>재판매 기록</td></tr>
</tbody></table></div>`,
    }),
  '/console/ledger': () =>
    layout({
      role: 'admin',
      title: 'LedgerMark Console · 원장',
      nav: consoleNav('ledger'),
      body: `<h1>원장 무결성 · 체인 고정</h1><p class="lede">전체 원장을 재해시하여 체인 연속성을 검증하고, 머클 루트를 퍼블릭 체인에 고정합니다.</p>
<div class="panel" id="ledger-integrity"><h2>무결성 검증</h2><p class="sub">verifyLedgerIntegrity() · 186,402건 전수 재해시</p>
<div class="row"><span class="pill ok">체인 연속 · 불일치 0</span><span class="hash">lastHash 4f1c…a82e</span></div></div>
<div class="panel" id="anchor-panel"><h2>퍼블릭 체인 고정</h2><p class="sub">머클 루트를 트랜잭션 calldata 로 기록 · 사후 변경 불가</p>
<table><thead><tr><th>앵커</th><th>구간</th><th>머클 루트</th><th>체인</th><th>상태</th></tr></thead><tbody>
<tr><td>AN-0042</td><td>#171,001 – #186,402</td><td class="hash">9b7d…1f04</td><td>Base Sepolia</td><td><span class="pill warn">simulated</span></td></tr>
<tr><td>AN-0041</td><td>#155,600 – #171,000</td><td class="hash">2c58…77ab</td><td>Base Sepolia</td><td><span class="pill warn">simulated</span></td></tr>
</tbody></table>
<p class="sub" style="margin:18px 0 0">현재 ANCHOR_MODE=simulated · 퍼블릭 체인에는 게시되지 않은 상태입니다.</p></div>`,
    }),
  '/console/audit': () =>
    layout({
      role: 'admin',
      title: 'LedgerMark Console · 감사',
      nav: consoleNav('audit'),
      body: `<h1>감사 로그</h1><p class="lede">27종 행위를 행위자·대상·시각과 함께 보존합니다. 삭제 경로는 없습니다.</p>
<div class="panel" id="audit-table"><table><thead><tr><th>시각</th><th>행위</th><th>행위자</th><th>대상</th><th>결과</th></tr></thead><tbody>
<tr><td>2026-05-07 19:03</td><td>UID_TRANSFER</td><td>PARTNER_STAFF #PH-014</td><td>${UID}</td><td><span class="pill ok">성공</span></td></tr>
<tr><td>2026-05-07 18:41</td><td>FIELD_INSPECTION</td><td>FIELD_OFFICER #PNP-2210</td><td>PH-2026-DEMO-004471</td><td><span class="pill bad">압수 근거</span></td></tr>
<tr><td>2026-05-07 17:12</td><td>ANCHOR_PUBLISH</td><td>SYSTEM</td><td>AN-0042</td><td><span class="pill warn">simulated</span></td></tr>
<tr><td>2026-05-07 16:55</td><td>EXCHANGE_CLAIM</td><td>PARTNER_STAFF #PH-014</td><td>V-0419-7</td><td><span class="pill ok">성공</span></td></tr>
<tr><td>2026-05-07 15:30</td><td>CONSENT_GRANT</td><td>CONSUMER #41882</td><td>ConsentRecord #9921</td><td><span class="pill ok">성공</span></td></tr>
<tr><td>2026-05-07 14:02</td><td>LOT_MINT</td><td>ADMIN</td><td>Lot L-2605-C · 2,400 UID</td><td><span class="pill ok">성공</span></td></tr>
</tbody></table></div>`,
    }),
  '/console/production': () =>
    layout({
      role: 'admin',
      title: 'LedgerMark Console · 생산',
      nav: consoleNav('production'),
      body: `<h1>생산 · Lot 발행</h1><p class="lede">Lot 하나를 발행하면 수량만큼의 UID 와 원장 기록이 같은 트랜잭션 안에서 만들어집니다.</p>
<div class="panel" id="production-mint"><h2>신규 Lot 발행</h2><p class="sub">mintLot() · Lot 당 최대 10,000 UID · 부분 성공은 없습니다</p>
<div class="row"><input id="lot-name" placeholder="제품명 · 용량 · 니코틴 농도" value="ConiaMark LIQUID 30mL · 12mg/mL" style="width:520px"><input id="lot-qty" placeholder="수량" value="2,400" style="width:160px"><button class="btn" id="lot-mint">발행</button></div>
<div style="margin-top:20px"><span class="pill ok">L-2605-C · 2,400 UID</span> <span style="font-size:14px;color:#6b7280">UID 2,400건 + 원장 2,400건이 한 트랜잭션으로 커밋됨</span></div></div>
<div class="panel" id="production-lots"><h2>Lot 원장</h2><p class="sub">발행 시점이 모든 UID 의 1번 기록이 됩니다</p>
<table><thead><tr><th>Lot</th><th>제품</th><th>수량</th><th>발행일</th><th>현재 단계</th></tr></thead><tbody>
<tr><td>L-2605-C</td><td>LIQUID 30mL · 12mg/mL</td><td>2,400</td><td>2026-05-07</td><td><span class="pill">MINTED</span></td></tr>
<tr><td>L-2604-B</td><td>DEVICE</td><td>1,200</td><td>2026-04-05</td><td><span class="pill">EXPORTED</span></td></tr>
<tr><td>L-2603-A</td><td>LIQUID 30mL · 12mg/mL</td><td>4,800</td><td>2026-03-02</td><td><span class="pill ok">RETAIL_SOLD</span></td></tr>
</tbody></table></div>`,
    }),
  '/console/customs-admin': () =>
    layout({
      role: 'admin',
      title: 'LedgerMark Console · 통관 관리',
      nav: consoleNav('customs'),
      body: `<h1>통관 관리 · 세율표</h1><p class="lede">세율은 덮어쓰지 않고 적용 시작일과 함께 쌓입니다. 배치는 통관 시점에 유효했던 세율로 고정됩니다.</p>
<div class="panel" id="tariff-form"><h2>세율 등록</h2><p class="sub">니코틴 농도 구간은 하한 포함, 상한 제외 · DEVICE 는 개당 정액</p>
<div class="row"><input id="tariff-from" placeholder="적용 시작일" value="2026-07-01" style="width:200px"><input id="tariff-rate" placeholder="세율 (PHP)" value="61.00" style="width:180px"><button class="btn" id="tariff-save">등록</button></div></div>
<div class="panel" id="tariff-table"><h2>세율 이력</h2><p class="sub">pickTariff() 는 clearedAt 이전의 가장 최근 세율을 고릅니다</p>
<table><thead><tr><th>적용 시작</th><th>품목</th><th>니코틴 구간</th><th>세율</th><th>적용 배치</th></tr></thead><tbody>
<tr><td>2026-07-01</td><td>LIQUID</td><td>0 – 12 mg/mL</td><td>₱61.00 / mL</td><td><span class="pill warn">예정</span></td></tr>
<tr><td>2026-05-01</td><td>LIQUID</td><td>0 – 12 mg/mL</td><td>₱52.00 / mL</td><td>IB-2605-01</td></tr>
<tr><td>2026-03-01</td><td>LIQUID</td><td>12 – 24 mg/mL</td><td>₱57.00 / mL</td><td>IB-2603-07</td></tr>
<tr><td>2026-03-01</td><td>DEVICE</td><td>—</td><td>₱60.00 / 개</td><td>IB-2604-02</td></tr>
</tbody></table>
<p class="sub" style="margin:18px 0 0">7월 세율을 지금 등록해도 3월 배치의 세액은 바뀌지 않습니다 — 과거 납부액이 소급 변동하지 않는다는 뜻입니다.</p></div>`,
    }),
  '/console/exchanges': () =>
    layout({
      role: 'admin',
      title: 'LedgerMark Console · 교환 원장',
      nav: consoleNav('exchanges'),
      body: `<h1>교환 원장 · 정산</h1><p class="lede">가맹점이 예약한 교환품은 본사 재고에서 선점되고, 수령·만료가 정산 대상입니다.</p>
<div class="grid" id="exchange-kpis"><div class="card"><div class="k">예약 중</div><div class="v">37</div><div class="d">재고 선점 상태</div></div>
<div class="card"><div class="k">수령 완료</div><div class="v">612</div><div class="d">정산 대상</div></div>
<div class="card"><div class="k">기간 만료</div><div class="v">19</div><div class="d">선점 해제됨</div></div>
<div class="card"><div class="k">재교환 시도</div><div class="v">0</div><div class="d">구조적으로 차단</div></div></div>
<div class="panel" id="exchange-settlement"><h2>가맹점별 정산</h2><p class="sub">예약은 재고를 묶고, 수령이 비용을 확정합니다</p>
<table><thead><tr><th>가맹점</th><th>예약</th><th>수령</th><th>만료</th><th>정산 금액</th><th>상태</th></tr></thead><tbody>
<tr><td>Store #PH-014</td><td>6</td><td>88</td><td>2</td><td>₱44,000</td><td><span class="pill ok">정산 완료</span></td></tr>
<tr><td>Store #PH-031</td><td>11</td><td>64</td><td>7</td><td>₱32,000</td><td><span class="pill warn">검토 중</span></td></tr>
<tr><td>총판 DIST-02</td><td>20</td><td>460</td><td>10</td><td>₱230,000</td><td><span class="pill ok">정산 완료</span></td></tr>
</tbody></table>
<p class="sub" style="margin:18px 0 0">수령 시 voucherState 가 NONE 으로 내려가므로, 같은 UID 의 두 번째 교환은 정산에 올라올 수 없습니다.</p></div>`,
    }),
  '/download': () =>
    layout({
      role: 'admin',
      title: 'LedgerMark · 배포',
      body: `<h1>현장 앱 배포</h1><p class="lede">단속 요원용 Android 앱은 서버와 동일한 원장 API 를 사용합니다.</p>
<div class="panel"><div class="row"><button class="btn" id="download-apk">APK 내려받기</button><span class="pill ok">apk-v1.0.0</span><span style="font-size:14px;color:#6b7280">서버 정상 · 200</span></div></div>`,
    }),
};

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const path = url.pathname.replace(/\/$/, '') || '/app';

  // Mirrors the deployed build's switch-account deep link: /login?next=…&switch=1&email=…
  if (path === '/login') {
    const next = url.searchParams.get('next') ?? '/console';
    const email = url.searchParams.get('email') ?? '';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      layout({
        role: 'admin',
        title: '로그인',
        body: `<h1>로그인</h1><p class="lede">${email || '계정을 선택하세요'}</p>
<form class="panel" method="GET" action="/_signin"><input type="hidden" name="next" value="${next}"><input type="hidden" name="email" value="${email}">
<div class="row"><input id="lm-password" name="password" type="password" placeholder="비밀번호"><button class="btn" id="lm-signin" type="submit">로그인</button></div></form>`,
      }),
    );
    return;
  }

  if (path === '/_signin') {
    const next = url.searchParams.get('next') ?? '/console';
    const email = url.searchParams.get('email') ?? 'stage@local';
    res.writeHead(302, {
      'set-cookie': `lm_stage_session=${encodeURIComponent(email)}; Path=/; SameSite=Lax`,
      location: next,
    });
    res.end();
    return;
  }

  // The real console renders the customs view, not the admin modules, when the signed-in
  // role is GOV_INSPECTOR — same URL, different product. The stage has to model that or
  // the one scene whose whole argument is "권한이 다르면 다른 화면" films the wrong page.
  const signedInAs = decodeURIComponent(
    /lm_stage_session=([^;]*)/.exec(req.headers.cookie ?? '')?.[1] ?? '',
  );
  let effectivePath = path;
  if (path === '/console' && signedInAs.startsWith('inspector@')) effectivePath = '/customs';
  // No session at the kiosk means a consumer is standing in front of it; a signed-in
  // session means staff. Same route, as the deployed build has it — /kiosk is not behind
  // the auth middleware at all.
  if (path === '/kiosk' && !signedInAs) effectivePath = '/kiosk-consumer';

  const render = PAGES[effectivePath];
  if (!render) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(layout({ title: '404', body: `<h1>404</h1><p class="lede">${effectivePath} 는 이 스탠드인에 없습니다.</p>` }));
    return;
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(render());
}).listen(port, '127.0.0.1', () => {
  console.log(`stand-in stage on http://127.0.0.1:${port} — not product footage`);
});
