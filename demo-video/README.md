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
| 배속본 | `npm run produce -- out/take-1 --speed 1.2 --out fast.mp4` | 같은 테이크의 1.2배속 |

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

### 역할별 계정 전환

LedgerMark는 소비자·가맹점·현장 단속·관세청·통합 관리가 **같은 원장을 다른 권한으로**
보는 제품이다. 그 구조를 보여주려면 한 영상 안에서 계정이 바뀌어야 한다. `auth.accounts`에
계정을 선언하고 장면에 `as`를 적으면, 로그인 스텝이 계정별 값으로 채워져 각각 별도
세션으로 저장된다.

```json
"auth": {
  "statePath": ".auth/{account}.json",
  "defaultAccount": "admin",
  "accounts": {
    "field": { "email": "officer@pnp.test", "password": { "env": "LM_DEMO_PASSWORD" }, "home": "/field" },
    "admin": { "email": "admin@ledgermark.test", "password": { "env": "LM_DEMO_PASSWORD" }, "home": "/console" }
  },
  "steps": [
    { "do": "goto", "url": "/login?next={home}&switch=1&email={email}" },
    { "do": "fill", "selector": "#password", "value": "{password}" },
    { "do": "click", "selector": "button[type=submit]" }
  ]
}
```

- `{email}` `{password}` `{home}` `{account}` 는 계정 값으로 치환된다.
- 계정이 둘 이상이면 `statePath`에 `{account}`가 **반드시** 들어가야 한다. 안 그러면 뒤에
  로그인한 계정이 앞 세션을 덮어쓰고, 모든 장면이 마지막 계정으로 찍힌다 — 영상만 보면
  멀쩡해 보이는 종류의 사고다.
- 비밀번호는 `{ "env": "VAR" }` 형태만 허용한다. 이 저장소는 공개 저장소이고 데모 사이트는
  외부에서 접속 가능하므로, 시나리오에 적힌 비밀번호는 곧 공개된 비밀번호다. 검증 단계에서
  `pass`/`secret`/`token`이 들어간 키가 평문이면 거부한다.
- `--only`로 한 장면만 찍을 때는 그 장면이 쓰는 계정만 로그인한다.
- 로그인 없이 열리는 화면(키오스크 소비자 구매 등)은 장면에 `"signedOut": true` 를 준다.
  저장된 세션을 비운 컨텍스트로 녹화하므로, "계정 없이 된다"는 주장이 연출이 아니라 촬영
  조건이 된다. 세션을 들고 찍으면 화면은 똑같이 나오면서 주장만 거짓이 되는데, 영상으로는
  구별되지 않는다. `as` 와 함께 쓰면 검증에서 거부한다.
- 저장된 세션 옆에 `.fingerprint` 파일이 함께 남는다. 계정 값이나 로그인 스텝이 바뀌면
  지문이 달라져 **자동으로 다시 로그인**한다. 이메일만 고치고 `--refresh-auth`를 깜빡하면
  예전 쿠키가 그대로 통해서 전 장면이 이전 계정으로 찍히는데, 영상에는 그 사실이 전혀
  드러나지 않는다. 지문에는 해시만 들어간다 — 비밀번호가 디스크에 남을 자리를 만들지
  않기 위해서다.

### 셀렉터 후보와 선택적 스텝

배포된 빌드를 찍을 때는 DOM을 매 테이크마다 확인할 수 없다. `selector`에 배열을 주면
**실제로 존재하는 첫 번째**가 선택된다.

```json
{ "do": "click", "selector": ["button:has-text(\"조회\")", "button[type=submit]", "#uid-submit"] }
```

강조용 KPI처럼 **없어도 영상이 성립하는** 스텝에는 `"optional": true`를 준다. 실패하면
그 스텝만 건너뛰고 로그에 남긴다. 21장면짜리 테이크가 3번째 장면에서 멈추는 쪽이
훨씬 비싸기 때문이다. 반대로 `goto`에는 `optional`을 허용하지 않는다 — 페이지가 안 열린
채로 다음 스텝이 전부 이전 화면 위에서 찍히기 때문이다.

`--check`는 건너뛸 스텝까지 미리 세어서 알려준다.

### 스탠드인 스테이지

배포 데모에 네트워크가 닿지 않거나 사이트를 띄우기 전에 리허설할 때 쓰는 대역 서버다.
라우트·역할·UID 상태 머신·모듈 목록이 실제 앱과 같은 모양이고, 각 스텝의 **첫 번째**
셀렉터 후보를 그대로 구현한다.

```bash
node scripts/stage-server.mjs --port 4173
npm run check -- scenarios/ir-full-tour.json --base-url http://127.0.0.1:4173 --check
```

여기서 통과한다는 것은 시나리오의 **구조**(장면 수, 역할 전환, 트리밍, 캡션, 편집)가
맞다는 뜻이지, 실제 셀렉터가 맞다는 뜻이 아니다. 실제 셀렉터는 배포된 빌드를 상대로
`--check`를 돌려야 확인된다. 모든 프레임에 `STAND-IN STAGE · NOT PRODUCT FOOTAGE`
워터마크가 박히는 것은 의도된 것이다 — 대역 화면 스틸이 IR 자료에 제품 화면으로
섞여 들어가는 사고를 막는다.

`--base-url`로 같은 시나리오를 리허설용 스테이지와 실제 배포본 양쪽에 쓴다.

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

## 배속본

```bash
npm run produce -- out/full --out out/full/fast.mp4 --speed 1.2
```

같은 테이크에서 길이만 다른 파일을 하나 더 만든다. 메일로 먼저 보낼 때처럼 길이가 곧
열람률인 자리에 쓴다. 1.5배를 넘기면 거부한다 — 그 위로는 화면은 따라가도 한글 캡션이
한눈에 읽히지 않고, 그건 배속이 치러도 되는 비용이 아니다.

1x 는 세그먼트를 복사해 붙이지만 배속은 전 프레임을 재타이밍해야 해서 재인코딩한다.
기본값으로 두지 않은 이유다.

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

## 수록 시나리오

| 파일 | 길이 | 용도 |
|---|---|---|
| `scenarios/signup-to-trace.json` | 약 40초 | 등록 → 원장 기록 → 추적, 3단 요약본 |
| `scenarios/ir-full-tour.json` | 3분 52초 | 6개 역할 · 28장면 전수 투어 (스토리보드: `storyboard/ir-full-tour.md`) |

## 아직 남은 것

타이틀 카드의 색·타이포는 중립 기본값이다. LedgerMark 브랜드 토큰이 확정되면
`src/lib/cards.mjs`의 `THEME`과 시나리오의 `theme` 필드로 교체한다.
