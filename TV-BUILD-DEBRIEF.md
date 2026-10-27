# TV APK 빌드 — 어디서 꼬였고, 어떻게 풀었나 ✅ RESOLVED

> 작성: 2026-05-29 (Henry + Claude) · **해결: 2026-05-31 옵션 B 채택**
> 이 문서는 archive 가능. 옵션 B (RN/Expo 통일)이 표준 경로로 확정.

---

## ✅ 해결 (2026-05-31) — 옵션 B로 단일화 완료

**채택:** apps/tv를 RN 0.83 / Expo SDK 55 / React 19.2로 업그레이드 (태블릿과 동일 스택). 커밋 `41feadc`.

**검증:**
- pnpm install 깨끗 (`npx expo install --check` → "Dependencies are up to date")
- tsc 0 errors (tv / shared / tablet 전부)
- gradle assembleRelease 17m58s → app-release.apk 36MB
- Onn 4K (armeabi-v7a 32-bit) 설치 + 실행 → SetupScreen 정상 렌더 ✓
- 이전 silent crash 지점 (`Invariant Violation: Failed to call into JavaScript module method AppRegistry.runApplication()`) 통과 — Hermes bytecode v96 unified

**핵심 변경:**
- `apps/tv/package.json`: expo ~51→55.0.26 / react 18.2→19.2.0 / RN 0.74→0.83.6 / expo-font/keep-awake/speech SDK 55 정렬
- `apps/tv/metro.config.js`: expo/metro-config + react/RN 단일 인스턴스 핀
- `apps/tv/app.json` 신설: prebuild 매니페스트 (com.restosync.tv, landscape)
- `apps/tv/index.js`: `registerRootComponent` from 'expo' (raw AppRegistry → Expo convention)
- `apps/tv/android/`: `expo prebuild --clean` 재생성
- `apps/tv/android/gradle.properties`: `reactNativeArchitectures=armeabi-v7a,arm64-v8a` (Onn 4K 32-bit 대응) + `parallel=false`/`workers.max=1` (16GB PC 제약)

**기록 (참고):**

---

## (archived) TL;DR 원본

1. **태블릿 앱(`apps/tablet`) APK는 잘 됩니다** — 빌드 OK, 에뮬에서 로그인까지 동작 확인.
2. **TV 앱(`apps/tv`) APK는 빌드는 어찌어찌 됐지만 실행이 안 됩니다** — Onn 4K에 설치하면 JS 초기화에서 silent 크래시.
3. **근본 원인은 모노레포 안에 RN 0.83(태블릿)과 RN 0.74(TV)가 공존**하는 구조 자체. pnpm 호이스팅이 한쪽만 root로 끌어올리고 빌드 도구들이 root만 보기 때문. junction/swap으로 우회를 시도했지만 끝에서 Hermes bytecode 버전(v96 vs v95)이 안 맞아 멈춤. 다음엔 우회 말고 구조를 고쳐야 함.

---

## 이번 세션에 한 일

1. **태블릿 APK** 처음 빌드부터 에뮬레이터에서 로그인 화면까지 보이게 만든 과정
2. API 서버 가동, DB seed 확인, JWT 로그인 동작 검증
3. **Settings 탭 가시화** — Android 14 태블릿의 시스템 taskbar에 가려져 있던 탭바를 safe-area-inset으로 위로 올림 (테마/TV 페어링 같은 관리자용 설정 접근 가능하게)
4. Onn 4K 무선 adb 연결 (`192.168.1.196:43855`)
5. Windows 방화벽 :3000 인바운드 허용 (Onn 4K → 호스트 API 도달용)
6. **TV APK 빌드 — 약 10번의 실패 끝에 빌드는 성공**, 그러나 Onn 4K에서 실행은 실패

---

## 잘 된 것 (자산으로 남음)

| 항목 | 결과 |
|------|------|
| `apps/tablet` 릴리스 APK (`apps/tablet/android/app/build/outputs/apk/release/app-release.apk`, 28MB) | ✅ 에뮬레이터에서 동작 |
| API 서버 (`apps/api`, host :3000) + Docker(Postgres/Redis) | ✅ |
| Login flow: `license_key=RS-TEST-0001-AAAA` + `pin=1234` → JWT 발급 | ✅ |
| Windows 방화벽 규칙 `RestoSync API :3000` (Private profile) | ✅ |
| Onn 4K adb 페어링 캐시 (다음에도 `adb connect 192.168.1.196:5555` 등으로 바로 연결 가능) | ✅ |
| 태블릿 빌드 안정성 fix (`apps/tablet/android/`에 적용 — 다만 이 디렉터리는 `.gitignore`라 커밋 안 됨) | ✅ |

---

## 막힌 곳: TV 앱 Onn 4K 실행 실패

증상:
- APK 설치 OK
- 앱 프로세스 시작 OK
- 네이티브 라이브러리(libhermes, libexpo-modules-core 등) 로드 OK
- ExpoModulesCore: `✅ AppContext initialized`, `✅ JSI interop installed`, `✅ Constants exported`
- **그 직후** JS 번들이 실행돼야 하는데 silent하게 throw → 결과만 출력:
  ```
  Invariant Violation: Failed to call into JavaScript module method
  AppRegistry.runApplication(). Module has not been registered as callable.
  Registered callable JavaScript modules (n = 0)
  ```

---

## 왜 꼬였나 — 진짜 원인

### 1줄 진단
**한 pnpm 모노레포 안에 호환 안 되는 RN 두 버전이 공존**:
- 태블릿: React Native **0.83** + Expo SDK **55** + React **19.2** + Hermes 바이트코드 **v96**
- TV: React Native **0.74** + Expo SDK **51** + React **18.2** + Hermes 바이트코드 **v95**

### 왜 이게 문제인가
pnpm의 `node-linker=hoisted` 옵션은 모든 의존성을 `node_modules/` 최상위로 끌어올립니다 (Windows ninja의 260자 path 한계 회피용으로 의도적으로 선택한 것 — `pnpm-workspace.yaml`에 이유 적혀있음).

같은 패키지가 두 버전이 필요하면:
- **한 버전만 root에 살아남음** (보통 더 많이 의존되는 쪽 — 여기선 RN 0.83)
- 다른 버전은 그 앱의 local `node_modules`로 격리됨 (apps/tv에 RN 0.74가 있음)

문제는 **빌드 도구(metro, @expo/cli, hermes-compiler, gradle plugin 등)는 자기가 깔린 곳(root)에서부터 모듈을 찾기 시작**한다는 것. apps/tv에서 빌드를 돌려도 그 빌드를 수행하는 metro CLI는 root의 RN 0.83을 보고, root의 hermes-compiler 0.14를 쓰고, root의 expo 55를 봅니다 — TV 앱이 0.74 / 51을 원해도.

### 우회 시도가 왜 끝까지 안 됐나

이번 세션에서 시도한 우회:
1. `apps/tv/metro.config.js`에 `extraNodeModules`로 react-native를 강제 지정 → metro 자체는 따라줬지만 다른 도구는 무시
2. `root/node_modules/@expo/cli/node_modules/`에 apps/tv의 metro 14개 패키지를 **junction**(NTFS 디렉터리 심볼릭링크) → 일부 통과
3. `root/node_modules/react-native, react, expo`를 백업해두고 apps/tv 것을 junction → JS 번들링까지는 성공
4. root `hermes-compiler` 자체를 백업 폴더로 옮김 → 그래도 v96 bytecode 그대로 나옴

각 단계마다 새로운 모듈 충돌이 줄줄이 등장. 게다가 **Hermes bytecode 생성하는 hermesc가 어디서 호출되는지 끝까지 잡지 못함**. RN 0.74 + libhermes는 v95까지만 실행 가능한데 우리 번들은 v96 → 런타임에서 silent fail.

이 우회들은 본질적으로 **"OS 파일시스템 레벨에서 모듈 해석을 속이는"** 시도. 빌드 한 단계에선 통하지만 다른 단계에선 다른 코드 패스가 root를 보고 다시 충돌. 끝없이 깊어짐.

---

## 다음 세션 권장 — 세 가지 선택지

> 모두 똑같이 "지금 구조를 받아들이고 그 위에 다시 우회 쌓기"가 아니라 **구조를 고치는 방향**이라는 공통점이 있습니다. 우회는 이미 충분히 시도했음을 학습했습니다.

### 옵션 A: TV를 모노레포 밖에서 빌드 (가장 빠름)

**무엇:**
```
1. C:\temp\restosync-tv-isolated\에 apps/tv 전체 복사
2. workspace 참조 deps(@restosync/shared, @restosync/ui)는 일시적으로 풀어버리거나 file: 경로로 변경
3. 거기서 pnpm install (또는 npm install — 단독이라 호이스팅 충돌 없음)
4. gradle assembleRelease → 깨끗한 APK
```

**왜 동작할 것 같은가:**
- 격리된 환경엔 RN 0.83이 존재하지 않음 → 그 어떤 도구도 잘못된 버전 픽업 불가
- pnpm hoisted의 단점이 사라짐
- TV는 어차피 production에서 모노레포 안에서 빌드되지 않음 (CI/CD에서 따로 빌드해도 됨)

**왜 권장:**
- 30분~1시간이면 결판
- 만약 잘 되면 → CI 파이프라인을 이 격리 방식으로 잡으면 됨 (TV 빌드 잡 = 격리 디렉터리에서 install + build)
- 만약 안 되면 → 모노레포 호이스팅이 원인이 아니라는 게 증명되어 다른 문제(예: 코드 자체) 추적 가능

**리스크:**
- workspace 참조(@restosync/shared 등) 해체 노력
- "모노레포의 이점"을 일부 포기 (TV만)

---

### 옵션 B: TV를 RN 0.83 / Expo SDK 55로 업그레이드 (가장 깔끔)

**무엇:**
- apps/tv의 package.json을 RN 0.83 / Expo 55 / React 19로 올림
- Breaking changes 대응:
  - New Architecture (TurboModules, Fabric) — 어차피 새 아키텍처는 켜야 함
  - React 19 (use, ref-as-prop 등)
  - ESM (`import.meta` 같은 새 문법 등장)
  - Expo SDK 50→55 마이그레이션 가이드 (`expo-cli upgrade` 명령으로 일부 자동화)

**왜 권장:**
- **모노레포 본래 의도와 맞음** — 두 앱이 같은 RN/Expo 위에 서면 shared/ui 패키지 재사용 자연스러움
- pnpm 호이스팅 충돌 자체가 사라짐
- 미래 보수 비용 최저 (RN 0.74는 2024년 릴리스, 곧 EOL)

**왜 망설일 만한가:**
- RN 0.74→0.83은 마이너 두 단계 점프 + 메이저 React 변경 — 시간 더 필요 (1~2일?)
- TV 화면(`apps/tv/src/screens/`)이 작동하는 한 굳이 안 건드리고 싶을 수 있음

**리스크:**
- 화면 깨질 수 있는 부분: TTS(expo-speech), keep-awake, font 로더(`useThemeFonts()`), 23개 ttf 번들 — RN 새 버전에서 다 점검 필요
- M02의 12-theme 시스템과 ttf assets가 SDK 55의 새 asset 처리와 호환되는지

---

### 옵션 C: pnpm overrides로 패키지별 버전 강제 (중간)

**무엇:**
- `pnpm-workspace.yaml` 또는 root `package.json`에 `pnpm.overrides` 추가해 metro 패밀리, hermes-compiler, react-native 등을 워크스페이스 레벨에서 **고정 한 버전**으로 강제
- 예: `pnpm.overrides = { "metro": "0.83.7", "hermes-compiler": "0.14.1" }` → 모든 의존자가 이 버전을 봄 (TV도 강제로 새 버전 사용)
- 또는 `dependenciesMeta.{pkg}.injected=true` 로 패키지별 격리

**왜 검토 가치 있나:**
- 코드 수정 없이 dependency tree만 손봄
- 옵션 B의 일부를 자동화 — TV가 자기도 모르게 새 metro/hermes를 쓰게 만듦

**왜 망설일 만한가:**
- 코드와 dep 버전이 불일치 → 런타임 에러 가능성. TV 코드는 RN 0.74용인데 metro/hermes는 0.83용 → 빌드는 통과해도 런타임 깨짐 가능 (이번 세션에서 일부 본 패턴)
- 우회의 "사이즈 큰 형제" 같은 느낌 — 깔끔하진 않음

---

## 내 의견 (Claude의 권장)

**옵션 A → 옵션 B 순서로** 가시는 게 좋아 보입니다.

1. **먼저 옵션 A로 TV 앱이 동작하는지 빠르게 검증** (반나절 이내).
   - 동작하면 → 시연/테스트는 진행 가능, production CI는 격리 빌드로 가닥 잡힘
   - 안 되면 → 원인이 모노레포가 아니라는 신호 (코드/런타임 문제) → 별도 디버깅
2. **그 후 시간 여유 보고 옵션 B 진행**해서 장기적으로 한 RN 버전으로 통일.
   - 옵션 B 진행 중에도 옵션 A 산출물(격리 디렉터리)이 백업 옵션으로 살아있음
3. **옵션 C는 권장 안 함** — "우회의 큰 형제" 느낌. 이번 세션에서 우회로 시간 많이 썼고, 그 길은 끝이 안 보였음.

---

## 이번 세션 워킹트리 상태 (커밋 안 됨)

`git status` 기준 staged 안 된 변경:
```
M  HANDOFF.md                         ← hook 자동 갱신
M  apps/tablet/app.json
M  apps/tablet/app/(tabs)/_layout.tsx ← Settings 탭 가시화 (safe-area-inset) — 보존 권장
M  apps/tablet/metro.config.js
M  apps/tablet/package.json
M  apps/tv/metro.config.js            ← expo/metro-config 기반 재작성 — 보존 권장 (옵션 A에서 활용)
M  pnpm-lock.yaml                     ← 빌드 중 자동 변경됨
M  pnpm-workspace.yaml                ← sharp: true placeholder fix — 보존 권장
?? .npmrc                              ← node-linker=hoisted 정착 — 이미 의도된 파일
?? .claude-onn-shot.png, apps/tablet/.claude-emu-shot.png  ← 디버그 스크린샷, 삭제 가능
```

추가로 `.gitignore`된 곳에 남은 변경 (커밋 대상 아님 — 빌드별 산출물):
```
apps/tablet/android/gradle.properties        ← parallel=false, workers.max=1, useLegacyPackaging=true
apps/tablet/android/app/src/main/AndroidManifest.xml  ← usesCleartextTraffic=true
apps/tv/android/gradle.properties            ← parallel=false, workers.max=1, armeabi-v7a+arm64-v8a, hermesEnabled=true
apps/tv/android/build.gradle                 ← minSdk 24
apps/tv/android/settings.gradle              ← ../../../node_modules 경로 정정
apps/tv/android/app/build.gradle             ← hermesCommand, reactNativeDir, codegenDir 명시 + jscFlavor 신 artifact
```

이 `apps/*/android/` 변경들은 Expo prebuild 산출물이라 `.gitignore`되어 있습니다. 다음 세션에서 옵션 A/B 선택해 새로 빌드할 거라면 어차피 재생성될 가능성 큼.

---

## 메모: 자잘하지만 중요한 사실들

1. **Onn 4K Streaming Box (model `onn__4K_Streaming_Box`, product `onn_4k_gtv`, device `YOC`)는 armeabi-v7a 전용 32-bit ARM 기기**. `ro.product.cpu.abilist64`가 비어있음. "4K"라는 이름이 무색하게 옛 chipset. AG-025의 카테고리 룰에 따른 runtime ABI check가 의미 있는 케이스.
2. **PC LAN IP는 `192.168.1.29`**. Onn 4K에서 API에 닿으려면 `http://192.168.1.29:3000` (방화벽은 이미 열림).
3. **이 PC는 16GB RAM이라 gradle parallel + heavy native 빌드를 동시에 못 견딤**. `org.gradle.parallel=false` + `workers.max=1` 강제 필요. (memory의 `reference_pc_hardware.md`에 이미 기록됨.)
4. **태블릿 APK 사이드로드 시** `useLegacyPackaging=true`가 필요 — x86_64 에뮬에서 arm64 변환으로 돌릴 때 SoLoader가 .so를 찾으려면 OS가 추출해줘야 함. 실제 arm64 기기에선 어느 쪽이든 동작.
5. **Login flow 정본**: `POST /api/auth/login` body는 두 가지 받음 — `{store_id, user_id, pin}` (onboarding 완료 후) 또는 `{license_key, pin}` (단일 매장 단순 모드). 후자가 dev/test의 기본 흐름.

---

*이 문서는 다음 세션 시작 전 빠르게 컨텍스트 회복하는 용도. 옵션 A/B/C 결정 후엔 이 문서는 archive해도 됨.*
