# pstack-antigravity

[English](./README.md) | **한국어**

> [pstack](https://github.com/cursor/plugins/tree/main/pstack)(`0.15.48`, MIT, [Lauren Tan / poteto](https://x.com/poteto))의 **비공식 Google Antigravity 포트**다. 업스트림 `pstack`은 Cursor와 Claude Code만 지원하고 Google Antigravity(`agy`)는 지원하지 않는다. 이 저장소는 업스트림 원본에서 하드코딩 경로와 외부 의존성을 제거한 Antigravity용 플러그인을 자동 생성하고 검증한다.

## 주요 특징

- **순수 Antigravity 기반**: Antigravity(`agy`)만 있으면 동작한다. 병렬 작업과 멀티벤더 패널은 Antigravity 내장 `swarm` 도구와 `invoke_subagent`로 실행하며, 외부 CLI 래퍼나 특정 머신 경로를 요구하지 않는다.
- **`/swarm` 명령 충돌 회피**: Antigravity 내장 `/swarm` 명령과 겹치지 않도록 업스트림 `/swarm` 스킬을 `/pstack-swarm`으로 개명한다.
- **업데이트해도 유지되는 모델 설정**: `/setup-pstack`이 계정에서 쓸 수 있는 모델(`swarm{action:"models", all:true}` / `agy models`)을 감지해 플러그인 폴더 밖의 `~/.gemini/config/pstack-models.md`에 저장한다. 플러그인을 재설치하거나 업데이트해도 개인 모델 선택이 덮어쓰이지 않는다.
- **재현 가능한 업스트림 동기화**: `upstream/pstack/`에는 업스트림 원본을 그대로 두고 `overlay/`에는 Antigravity 전용 파일 8개만 유지한다. `scripts/build-antigravity-pstack.mjs`가 `pstack/` 완성본을 결정적으로 생성하며, 업스트림에 번역표가 빠진 Cursor 도구나 깨진 링크가 생기면 빌드를 실패시킨다.

## 설치

```bash
git clone https://github.com/paul-0320/pstack-antigravity.git
agy plugin validate ./pstack-antigravity/pstack --strict
agy plugin install ./pstack-antigravity/pstack
agy plugin list
```

클론 전에 GitHub에 올라간 플러그인을 먼저 검증할 수 있다.

```bash
agy plugin validate https://github.com/paul-0320/pstack-antigravity/tree/main/pstack --strict
```

## 빠른 시작

1. Antigravity에서 `/setup-pstack`을 실행해 계정에서 사용 가능한 모델을 감지하고 `~/.gemini/config/pstack-models.md`를 생성한다.
2. 중요한 개발 작업 앞에 `/poteto-mode`를 붙여 시작한다.
3. Cursor와 Antigravity 간 전체 도구·경로 대응표는 [`pstack/docs/harness/antigravity.md`](./pstack/docs/harness/antigravity.md)에서, 단계별 사용 가이드는 [`pstack/docs/guide/README.md`](./pstack/docs/guide/README.md)에서 확인한다.

## 저장소 구조

```text
.
├── upstream/
│   ├── UPSTREAM.json                   # 업스트림 커밋과 버전 기록
│   └── pstack/                         # 수정 없는 업스트림 원본 (`upstream` 브랜치 추적)
├── overlay/                            # 최소 Antigravity 전용 파일 (8개)
├── scripts/
│   ├── build-antigravity-pstack.mjs    # 결정적 플러그인 생성기 (CI에서 `--check` 실행)
│   ├── lint-port.mjs                   # 패키징 린터 (경로·유출·매니페스트·에이전트 규격 검사)
│   └── sync-upstream.sh                # 새 업스트림 릴리스를 `upstream` 브랜치로 동기화
├── pstack/                             # 생성된 Antigravity 설치용 플러그인
└── .github/workflows/
    ├── ci.yml                          # 드리프트 검사 + 패키징 린터 + 셸 문법 검사
    └── sync-upstream.yml               # 매일 자동 업스트림 확인 → 재생성 → PR 생성 (매핑 누락 시 Issue 생성)
```

## 업스트림 새 버전 동기화

### 자동 동기화 (GitHub Actions)

`.github/workflows/sync-upstream.yml`이 매일 `03:00 UTC`(한국 시각 `12:00`) 또는 **Actions** 탭의 **Run workflow** 실행 시 `cursor/plugins/pstack` 최신본을 확인한다.

- 업스트림 변경이 있고 `build-antigravity-pstack.mjs`와 `lint-port.mjs`가 통과하면 `upstream/pstack/`, `overlay/plugin.json`, `pstack/`을 갱신하는 Pull Request를 자동으로 연다.
- 업스트림에 매핑이 빠진 새 Cursor 도구나 깨진 링크가 추가되면 실패 원인을 담은 GitHub Issue를 자동으로 열어 어댑터 수정 지점을 알려 준다.

### 수동 동기화 (로컬 `upstream` 브랜치)

```bash
./scripts/sync-upstream.sh
# diff 확인 후 `upstream` 브랜치에 커밋하고 `main`에 병합한다.
git add upstream && git commit -m "chore(upstream): sync cursor/plugins pstack <version>"
git checkout main && git merge upstream
# overlay/plugin.json의 `version`을 `<upstream>+agy.1`로 갱신한 뒤 재생성·검증한다.
node scripts/build-antigravity-pstack.mjs
node scripts/lint-port.mjs --with-agy
```

## 사용자 커스텀 오버레이 빌드

이 포트 위에 개인·팀 전용 워크플로 오버레이를 얹어 쓰려면 `--extra-overlay`와 `--out` 옵션으로 Antigravity 플러그인 폴더에 바로 빌드한다.

```bash
node scripts/build-antigravity-pstack.mjs \
  --extra-overlay ~/.gemini/config/my-pstack-overlay \
  --out ~/.gemini/config/plugins/pstack
agy plugin validate ~/.gemini/config/plugins/pstack --strict
```

## 저작권 및 라이선스

- 업스트림 `pstack`은 [MIT 라이선스](./LICENSE)를 따르며 저작권은 Lauren Tan(2026)에게 있다.
- 이 저장소의 Antigravity 포팅 스크립트와 오버레이 파일 역시 동일한 [MIT 라이선스](./LICENSE)로 배포한다.
- 이 프로젝트는 독립적인 커뮤니티 포트이며 Cursor, Lauren Tan, Google과 제휴하거나 공식 보증을 받지 않는다.
