# demo-video

LedgerMark 제품 화면을 **실제로 구동해 녹화**하고, IR 피칭용 mp4로 편집하는 파이프라인.

AI로 생성한 컨셉 영상이 아니라 살아 있는 앱을 조작한 화면이므로, 투자 심사 자리에서
"구현된 것"으로 제시해도 표기 리스크가 없다.

## 구성

| 단계 | 명령 | 산출물 |
|---|---|---|
| 환경 점검 | `npm run doctor` | Chromium·ffmpeg·인코더 가용성 |
| 녹화 | `npm run record -- scenarios/example.json --out out/take-1` | 장면별 `.webm` + `manifest.json` |
| 편집 | `npm run produce -- out/take-1` | `ledgermark-ir-demo.mp4` |

```bash
npm install
npx playwright install chromium   # 클라우드 컨테이너 외 환경에서만 필요
npm run doctor
npm run record  -- scenarios/example.json --out out/take-1
npm run produce -- out/take-1
```

한 장면만 다시 찍으려면 `--only <sceneId>`를 쓴다.

## 시나리오

시연 흐름은 코드가 아니라 `scenarios/*.json`에 데이터로 적는다. 대상 투자자가 바뀌어
대본을 다시 짤 때 녹화 코드를 건드리지 않기 위해서다.

```json
{
  "baseUrl": "http://localhost:3000",
  "scenes": [
    { "id": "00-title", "card": { "headline": "...", "sub": "..." }, "seconds": 3.6 },
    { "id": "10-flow", "steps": [
      { "do": "goto", "url": "/" },
      { "do": "wait", "selector": "#title" },
      { "do": "caption", "text": "거래 원장 대시보드", "sub": "...", "ms": 3400 },
      { "do": "fill", "selector": "#q", "value": "8703.23", "typeDelayMs": 90 },
      { "do": "click", "selector": "#go" },
      { "do": "highlight", "selector": "#kpi-2", "ms": 2200 }
    ]}
  ]
}
```

스텝: `goto` `wait` `settle` `hover` `click` `fill` `press` `scroll` `highlight` `caption`.

### 촬영 전 셀렉터 점검

```bash
npm run check -- scenarios/signup-to-trace.json --check
```

앱을 실제로 구동한 상태에서 시나리오를 빠르게 훑고, 깨진 셀렉터를 **전부 한 번에**
보고한다. 실패는 어느 스텝의 어느 셀렉터인지까지 찍어준다.

```
FAIL   10-signup  fill "#does-not-exist" — locator.scrollIntoViewIfNeeded: Timeout 5000ms exceeded.
ok     20-register
FAIL   30-trace   wait "#also-missing" — page.waitForSelector: Timeout 5000ms exceeded.
```

셀렉터를 고치고 통과할 때까지 반복한 뒤 녹화하면, 촬영 도중 실패로 날리는 시간이 없다.

### 로그인이 필요한 앱

```json
"auth": {
  "statePath": ".auth/state.json",
  "steps": [
    { "do": "goto", "url": "/login" },
    { "do": "fill", "selector": "#email", "value": "demo@example.test" },
    { "do": "fill", "selector": "#password", "value": "..." },
    { "do": "click", "selector": "button[type=submit]" },
    { "do": "wait", "selector": ".dashboard" }
  ]
}
```

로그인은 **한 번만** 수행하고 세션을 저장해 모든 장면이 재사용한다. 장면마다 `setup`에
로그인을 넣어도 되지만, 그러면 매 테이크마다 비밀번호를 다시 타이핑하고 그 화면이
영상에 담겼다가 나중에 잘려나간다. 세션을 새로 받으려면 `--refresh-auth`.

`.auth/`는 `.gitignore`에 들어 있다. 세션 쿠키가 들어 있으므로 커밋하지 말 것.

### 화면의 실제 데이터 가리기

IR 영상은 투자자에게 메일로 전달되므로, 실제 거래처명·사업자번호·금액이 그대로 담기면
안 된다. 시나리오 최상위 `redact`는 화면 전환·리렌더와 무관하게 계속 적용된다.

```json
"redact": [
  { "selector": ".biz-no",  "mode": "blur" },
  { "selector": ".partner", "mode": "replace", "value": "○○상사" },
  { "selector": ".amount",  "mode": "block" }
]
```

세 모드 모두 레이아웃을 유지한다. 가린 뒤 화면이 재배치되면 제품의 실제 모습이 아니게
된다. `block`은 글자 색 그대로의 검은 막대를 남기므로, 데이터가 **누락된 것이 아니라
가려진 것**임이 보는 사람에게 드러난다.

시나리오는 녹화 시작 전에 전부 검증한다 — 6장면짜리 대본의 오타가 앱을 다 띄운 뒤
몇 분 지나서야 드러나는 것을 막기 위해서다.

## 설계상 알아둘 것

- **커서가 보인다.** 헤드리스 Chromium은 마우스를 녹화하지 않아 UI가 저절로 움직이는 것처럼
  보인다. 합성 커서를 주입하고 클릭 전마다 이징 경로로 이동시킨다.
- **캡션은 녹화가 아니라 편집 단계에서 입힌다.** 문구만 고칠 때 앱을 다시 돌리지 않는다.
- **장면당 파일 1개.** 어긋난 장면만 다시 찍는다.
- **한글 폰트를 번들한다.** 컨테이너에는 한글 폰트가 없어(일본어 IPAGothic만 존재) 자막이
  전부 두부(□)로 깨진다. Pretendard를 npm 의존성으로 고정하고 woff2를 data URI로 인라인해
  fontconfig 의존을 없앴다.
- **ffmpeg는 `ffmpeg-static`을 쓴다.** Playwright 번들 ffmpeg에는 VP8과 PNG뿐이라 H.264
  mp4를 만들 수 없다.

## PC(Windows·macOS)에서 돌릴 때

Chromium은 클라우드 컨테이너에만 미리 깔려 있으므로 `npx playwright install chromium`을
한 번 실행한다. ffmpeg는 `ffmpeg-static`이 OS별 바이너리를 같이 받으므로 별도 설치가 없다.
`npm run doctor`가 전부 PASS면 준비된 것이다.

앱을 먼저 띄운 뒤(예: `npm run dev`), 시나리오의 `baseUrl`을 그 주소로 맞추고 녹화한다.

## 아직 남은 것

타이틀 카드의 색·타이포는 중립 기본값이다. LedgerMark 브랜드 토큰이 확정되면
`src/lib/cards.mjs`의 `THEME`과 시나리오의 `theme` 필드로 교체한다.
