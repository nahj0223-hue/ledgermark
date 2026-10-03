# 빌드 테스트

소스를 이 브랜치 루트에 올리면 GitHub Actions가 자동으로 아래를 실행한다.

| 단계 | 명령 |
|---|---|
| 의존성 | `npm ci` (실패 시 `npm install`) |
| Prisma 클라이언트 | `npx prisma generate` |
| 스키마 반영 | `npx prisma migrate deploy` (PostgreSQL 16 서비스 컨테이너) |
| 타입체크 | `npm run typecheck` |
| 단위 테스트 | `npm test` (vitest) |
| 빌드 | `npm run build` (Next.js) |

결과는 저장소의 **Actions** 탭에서 확인한다. 실패하면 어느 단계에서 깨졌는지 로그에 그대로 남는다.

## 올려야 하는 것

루트 기준으로 다음이 있어야 빌드가 돈다.

```
package.json
package-lock.json
tsconfig.json
next.config.mjs
prisma/schema.prisma
prisma/migrations/
src/
```

`node_modules/`, `.next/`, `.pgdata/`, `.git/`, `*.apk`, `*.zip` 은 올리지 않는다. 용량만 키우고
빌드에는 쓰이지 않는다.

`.env` 는 올리지 않는다. CI는 자체 `DATABASE_URL` 과 `SESSION_SECRET` 을 주입하며,
앵커링은 `ANCHOR_MODE=simulated` 로 돌려 외부 체인에 쓰지 않는다.

## 로컬에서 같은 검사 돌리기

```bash
git clone -b claude/lucid-bohr-kdldyq https://github.com/nahj0223-hue/ledgermark.git
cd ledgermark
npm install
docker compose up -d db          # 또는 npm run db:local (embedded-postgres)
npx prisma generate && npx prisma migrate deploy
npm run typecheck && npm test && npm run build
```
