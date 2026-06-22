---
ticket_id: T-PATCH-113
version: v0.5
round: patch
type: refactor
status: done
phase: 3
assignee: pdt-developer
model: sonnet
effort: small
estimated_complexity: L1
qa_status: pending
qa_loops: 0
slug: brand-logo-trim-margin
area_tags: [gui/branding, gui/electron, assets]
created_at: 2026-06-11T00:00:00Z
---

# T-PATCH-113: 브랜드 로고 투명 여백 트림 — HomeView 로고 + macOS 앱 아이콘 재생성

## §1. Request

shawn (ad-hoc): 신규 브랜드 로고 원본이 `/Users/x/Downloads/productune_logo_block.png` 에 있다 (PNG **1254×1254 RGBA**, 다크 글로시 앱아이콘 블록 + 네온 `{}` 마크, **블록 주변에 큰 투명 여백**). 투명 여백 때문에 렌더 시 로고가 실제보다 작게 보이고 주변 레이아웃과 정렬이 어긋난다. **투명 여백을 트림해서** 각 surface 에 깨끗하게 적용하라.

### 원본 자산 계측 (조사 결과 — Pillow `getbbox()`)

- 캔버스: 1254×1254, RGBA.
- 알파 bbox: `(167, 132, 1087, 1062)` → **콘텐츠 920×930** (정사각 아님 — 세로가 10px 더 큼; 드롭섀도/글로우 포함 추정).
- 여백: 좌 167 / 상 132 / 우 167 / 하 192 px (캔버스 대비 약 10~15%).

### 현재 자산 상태 (교체 대상)

- `packages/gui/src/assets/logo.png` — **512×512 RGB(알파 없음)**. `src/views/HomeView.tsx` L5 에서 import, 런처 화면에 height 52px 로 렌더 (T-PATCH-109 §4.b).
- `packages/gui/build/icon.png` — **1024×1024 RGB(알파 없음)**. dev BrowserWindow icon(`electron/main.ts` `resolveAppIcon()`), macOS Dock(`app.dock.setIcon`), electron-builder 마스터.
- `packages/gui/build/icon.icns` — 멀티해상도 패키징 아이콘 (`electron-builder.yml` `mac.icon`).
- 코드 배선은 T-PATCH-109/110 에서 완료 — **이번 티켓은 자산 파일 교체 only, 코드 변경 없음** (코드 변경이 필요해지면 OOS 위반으로 보고).

## §2. Acceptance

- [ ] **AC-1 (HomeView 로고 — full trim)**: `packages/gui/src/assets/logo.png` 이 알파 bbox 기준 **완전 트림**된 신규 자산으로 교체된다. 콘텐츠(920×930)를 트림 후 **height 256px 로 다운스케일(LANCZOS, 비율 유지)** — 렌더 52px 의 약 5x 로 레티나 여유 충분. RGBA(투명 배경) 유지.
- [ ] **AC-2 (앱 아이콘 마스터 — 10% inset)**: `packages/gui/build/icon.png` 이 **1024×1024 RGBA 투명 캔버스** 위에 트림된 콘텐츠를 **최대변 824px(= 캔버스의 ~80.5%)로 스케일해 중앙 배치**한 신규 자산으로 교체된다. 즉 사방 약 100px(~10%) inset. **근거**: Apple HIG — macOS Big Sur+ 아이콘 그리드에서 라운드렉트 아트워크는 1024 캔버스 중 824×824 영역을 차지한다. full-bleed 로 채우면 Dock 에서 옆 아이콘들보다 비대해 보인다. 이 로고는 자체가 라운드 블록(앱아이콘 형태)이므로 824 그리드에 정확히 맞춘다.
- [ ] **AC-3 (icns 재생성)**: AC-2 의 1024 마스터로부터 `iconutil` iconset 절차(§4.C)로 `packages/gui/build/icon.icns` 가 재생성된다. 필수 10개 사이즈 전부 포함.
- [ ] **AC-4 (코드 무변경)**: `HomeView.tsx` / `electron/main.ts` / `electron-builder.yml` 등 코드·설정 파일은 **한 줄도 변경하지 않는다**. 자산 3개 파일만 교체. `tsc --noEmit` 0 errors 유지(당연 — 코드 무변경).
- [ ] **AC-5 (비주얼 — HomeView)**: 런처 화면에서 로고 블록 주변에 떠다니는 투명 패딩이 없고, 로고가 height 52px 시각 크기를 온전히 채우며 title/tagline 과의 간격이 자연스럽다.
- [ ] **AC-6 (비주얼 — Dock/창)**: dev 실행 시 Dock 아이콘이 다른 Dock 아이콘들과 **비슷한 시각적 크기**(과대/과소 없음)로 렌더되고, dev BrowserWindow 아이콘도 정상.

## §3. Out of scope / Dependency

**Dependency:**
- 원본 `/Users/x/Downloads/productune_logo_block.png` — repo 밖(Downloads) 경로. 구현 시점에 파일이 존재해야 함. 처리 전 `getbbox()` 재계측으로 §1 수치와 일치 확인(다른 파일로 바뀌었을 가능성 가드).
- icns 재생성은 macOS `iconutil` 필요(현 환경 darwin — OK).

**Out of scope:**
- 코드/설정 변경 일체(배선은 T-PATCH-109/110 완료).
- FreshComposer 의 `logo.svg` placeholder — 별도 surface, 현 상태 유지.
- Windows `.ico` / Linux 아이콘.
- 원본 PNG 의 repo 내 보관(원하면 후속 — 현재는 산출물 3개만 커밋).
- `dist:mac` 패키징 빌드(아이콘 검증은 dev Dock 으로 충분; 패키징은 릴리즈 라운드에서).

## §4. Implementation plan

### A. 자산 처리 스크립트 (one-shot, Pillow — ImageMagick 없음)

`python3` + Pillow 12 로 일회성 처리(스크립트 파일 커밋 불필요, inline 실행):

```python
from PIL import Image

SRC = '/Users/x/Downloads/productune_logo_block.png'
im = Image.open(SRC).convert('RGBA')
bbox = im.getbbox()                      # 기대값 (167, 132, 1087, 1062)
content = im.crop(bbox)                  # 920×930

# (1) HomeView 로고 — full trim + height 256 다운스케일
h = 256
w = round(content.width * h / content.height)
logo = content.resize((w, h), Image.LANCZOS)
logo.save('packages/gui/src/assets/logo.png')

# (2) 앱 아이콘 마스터 — 1024 캔버스, 최대변 824 스케일, 중앙 배치
GRID = 824
scale = GRID / max(content.size)
icon_art = content.resize(
    (round(content.width * scale), round(content.height * scale)), Image.LANCZOS)
canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
canvas.paste(icon_art,
    ((1024 - icon_art.width) // 2, (1024 - icon_art.height) // 2), icon_art)
canvas.save('packages/gui/build/icon.png')
```

- 콘텐츠가 비정사각(920×930)이므로 아이콘은 **세로변이 824** 가 되고 가로는 ~815 — 중앙 배치로 좌우 ~4~5px 추가 여백. 시각적으로 무시 가능, 보정 불필요.
- 저장 후 산출물 재검증: `logo.png` 의 `getbbox()` 가 전체 캔버스와 일치(트림 완료), `icon.png` 는 1024² RGBA + bbox 가 ~(100,100,924,924) 근방.

### B. (참고) 처리 정책 요약

| Surface | 트림 정책 | 근거 |
|:--|:--|:--|
| `src/assets/logo.png` (HomeView) | **full trim** (여백 0) | 인라인 `<img>` height 52 — CSS 가 크기·간격 제어, 자산 내 패딩은 정렬만 깨뜨림 |
| `build/icon.png` / `icon.icns` (Dock) | **~10% inset** (824/1024 그리드) | Apple HIG 아이콘 그리드 — full-bleed 시 옆 Dock 아이콘 대비 비대; 로고가 자체 라운드블록이라 824 그리드 정합 |

### C. icns 재생성 (T-PATCH-109 §4 노트의 구체화)

```bash
cd packages/gui/build
mkdir icon.iconset
python3 - <<'EOF'
from PIL import Image
master = Image.open('icon.png')
for size in [16, 32, 128, 256, 512]:
    for scale in [1, 2]:
        px = size * scale
        suffix = f'{size}x{size}' + ('@2x' if scale == 2 else '')
        master.resize((px, px), Image.LANCZOS).save(f'icon.iconset/icon_{suffix}.png')
EOF
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

- 필수 10개 사이즈: 16/16@2x/32/32@2x/128/128@2x/256/256@2x/512/512@2x.
- `icon.iconset` 디렉터리는 커밋하지 않음(임시 산출물).

### D. 검증 순서

1. 처리 전 원본 `getbbox()` 재계측 → §1 수치 일치 확인.
2. §4.A 실행 → 산출물 2개 재검증(크기/모드/bbox).
3. §4.C 실행 → `icon.icns` 재생성, `iconutil` 에러 없음.
4. dev 실행(dist-electron 재빌드 + 앱 재시작 — T-PATCH-109 §4.b 노트: main 프로세스 변경/Dock setIcon 은 핫리로드 미적용, 자산 교체도 재시작 필요) → AC-5/AC-6 eyeball.

## §5. QA — smoke

| Area | Check |
|:--|:--|
| asset | `src/assets/logo.png`: RGBA, height 256, `getbbox()` == 전체 캔버스(트림 완료) |
| asset | `build/icon.png`: 1024×1024 RGBA, 콘텐츠 bbox ~(100,100,924,924) — 사방 ~10% inset |
| asset | `build/icon.icns`: `iconutil` green, 10개 사이즈 포함 |
| build | `pnpm build` (또는 최소 `tsc --noEmit` + `vite build`) green — 자산 교체가 번들을 깨지 않음 |
| visual (HomeView) | 런처 로고 주변 잉여 투명 패딩 없음, height 52 시각 크기 온전, title/tagline 정렬 자연스러움 (AC-5) |
| visual (Dock) | dev 재시작 후 Dock 아이콘이 인접 아이콘들과 동급 시각 크기, 과대/과소 없음; BrowserWindow 아이콘 정상 (AC-6) |
| regression | 코드 diff 0 — 자산 3개 파일만 변경 (AC-4); FreshComposer/OnboardingWizard 무영향 |

## §6. Persona Activity

(대기 — 구현 시 기록)
