# RestoSync — 2-Version Product Architecture (정본 정리)

> 작성 2026-06-07. 사용자 제품 스펙 확정에 따른 최적 정리.
> 상용화는 **두 버전**으로 분리한다. 코드/설정/테마가 버전별로 깔끔히 갈라져야 한다.

---

## 0. 버전 정의 (사용자 스펙 정본)

| 항목 | **Ready-Only (Standalone)** | **Two-Display (Full)** |
|------|------------------------------|------------------------|
| 외부/클라우드 API 서버 | ❌ 없음 | ✅ 클라우드 API 서버 |
| 네트워크 | 공유기 1대 아래 LAN only | 인터넷 + 클라우드 |
| 두뇌(backend) | **태블릿 only** (on-device) | 클라우드 API + DB |
| 화면 수 | TV 1대 (픽업 전용) | 4-screen (메뉴/픽업/이벤트/광고) |
| TV 디스플레이 테마 | **8 레이아웃** (ready-only) | **12 테마** (themed) — 8 레이아웃 미적용 |
| TV 출력 | ONN 4K 통해 TV에 **디스플레이 + 음성(TTS)** | 동일 + 멀티스크린 |
| 입력 | 태블릿 키패드 (Manual) | POS 자동 + 키패드 + 하이브리드 |

**핵심 불변식**
- Ready-Only ⇒ `pickup_flow = 'ready_only'` ⇒ **8 레이아웃만**, 클라우드 없음.
- Two-Display ⇒ `pickup_flow = 'two_stage'` ⇒ **12 테마만**, 클라우드 API.
- 두 테마 세트는 **상호 배타**. 한 버전에 다른 세트 노출 금지.

---

## 1. 현재 코드 vs 계획 — 정렬/격차

| 영역 | 현재 상태 | 계획과의 격차 |
|------|-----------|----------------|
| 8 레이아웃 | `apps/tv`(네이티브)에만. WebSocket→API 의존 | Ready-Only는 무클라우드여야 함 → **API 의존 제거 필요** |
| 8 레이아웃 공유 | apps/tv 안에 갇힘 | 태블릿 standalone에서도 써야 함 → **shared 패키지로 승격** |
| 무클라우드 경로 | `tablet/app/tv.tsx` + `localPickup`(localStorage 크로스탭) 존재하나 **`isStandalone=false`로 비활성**, 하드코딩 색상(8레이아웃 아님) | 활성화 + 8레이아웃 렌더 + 음성 추가 |
| 음성(TTS) | 네이티브 ONN 앱만 | Ready-Only standalone에도 필요 |
| 브라우저 뷰어 `tv-view.html` | 12테마만 구현 (8레이아웃 없음) | Two-Display 전용 도구로 명확화 (Ready-Only 테스트에 쓰면 안 됨 — 이번 혼동의 원인) |
| 테마 설정 화면 `theme.tsx` | ready_only→8레이아웃 저장, two_stage→12테마 저장 (✅ 이미 분기) | 정상. 버전 락만 추가 |

**이번 테스트 혼동의 근본 원인**: Ready-Only(8레이아웃)를 **브라우저 뷰어(12테마 전용)** 로 테스트해서 "테마 안 바뀜"이 발생. 도구-버전 불일치.

---

## 1.5 🔒 복원력 필수 요구사항 (NON-NEGOTIABLE — 2026-06-07 사용자 확정)

이 프로젝트 디자인의 **불변 요구사항**. 모든 전송/아키텍처 결정은 이를 만족해야 한다.

- **R1. 인터넷 장애 무관:** 외부 인터넷이 끊겨도 공유기 아래 WiFi의 **모든 TV는 정상 동작**.
- **R2. TV 전원 재투입 복구:** TV를 껐다 켜도 **마지막 상태로 그대로 복구**.
- **R3. 태블릿 재부팅 생존:** 태블릿이 재부팅돼도 **TV는 마지막 로드된 내용을 그대로 유지·동작**.

⇒ 강제되는 설계 원칙 — **모든 TV(ONN)는 오프라인-퍼스트**:
1. 마지막 렌더 상태를 **로컬 영속화**(AsyncStorage/MMKV). 현재 `apps/tv/tvStore.ts`는 credential만
   저장(`K={id,url}`)하고 주문은 메모리뿐 → **주문/ready 상태 영속화 추가 필수.**
2. 부팅 시 캐시에서 **즉시 렌더** 후 백그라운드 재동기화(stale-while-revalidate).
3. 상류 단절(인터넷/태블릿 재부팅) 중 **화면 유지 + 은은한 "재연결 중"** — blank 절대 금지.
4. Ready-Only standalone(`localPickup`)도 동일 영속화.

---

## 2. 무클라우드 Ready-Only 전송 방식 — ✅ 결정: **옵션 B**

R1/R2/R3 + "태블릿 only"를 **모두 만족하는 유일한 방식이 B**.

| | A. Cast | **B. 태블릿 서버 + ONN 네이티브** | C. 별도/ONN authority |
|---|---|---|---|
| R1 인터넷 장애 | ❌ 수신기 클라우드 등록·HTTPS | ✅ | ✅ |
| R2 TV 재부팅 | ❌ 세션 소멸 | ✅ (TV 캐시) | ✅ |
| R3 태블릿 재부팅 | ❌ 송신측 죽음 | ✅ (TV 오프라인-퍼스트) | ✅ |
| 태블릿 only | △ | ✅ | ❌ 별도 상주 |

- **A 탈락:** 오프라인 커스텀 Cast 불가(클라우드 등록·HTTPS), 세션 휘발성.
- **C 탈락:** authority가 태블릿 밖 상주 → "태블릿 only" 위배.
- **B 채택:** 키패드(입력원)가 태블릿이라 태블릿 재부팅 중엔 새 입력이 없음 → TV가 마지막 내용만
  유지하면 R3 충족. 네이티브 8레이아웃+TTS 재사용. 경량 변형으로 LAN WS 또는 UDP 멀티캐스트.

---

## 3. 최적 코드 재구성안 (옵션 B 기준)

> 전제: ONN은 우리 **네이티브 앱**을 실행(8레이아웃+TTS 재사용). 태블릿이 LAN 전송원(WS 또는
> UDP 멀티캐스트). 모든 TV는 §1.5 오프라인-퍼스트(로컬 영속화).

### 3.1 ONN 네이티브 TV 앱 = Ready-Only 디스플레이 (재사용)
- ONN은 `apps/tv` 네이티브 앱 실행 → **8레이아웃(`readyOnlyLayouts/`) + expo-speech TTS 그대로 사용.**
- API 연결원만 교체: 클라우드 → **태블릿 LAN 주소**(아래 3.2). 8레이아웃 렌더 코드는 무수정.

### 3.2 태블릿 = 로컬 전송원 (LAN, 무클라우드)
- 태블릿 키패드 → 주문을 **태블릿 로컬 저장**(`expo-sqlite`)에 기록(source of truth).
- 태블릿이 LAN 전송 채널 제공 → ONN 네이티브 앱이 수신. 두 변형:
  - **B1. 로컬 WS 서버**: 태블릿이 WS 서버 구동(Android 포그라운드 서비스). ONN이 접속. 신규 라이브러리 = AG-017 승인 필요.
  - **B2. UDP 멀티캐스트**: 태블릿이 ready 이벤트를 LAN에 브로드캐스트, ONN 수신. 서버·페어링 최소. 신뢰성(재전송) 보완.
- ONN ↔ 태블릿 **디스커버리**: mDNS/NSD 또는 QR/수동 IP.

### 3.3 🔒 오프라인-퍼스트 영속화 (§1.5 — R1/R2/R3 충족 핵심)
- `apps/tv/tvStore.ts`: 주문/ready 상태를 **AsyncStorage/MMKV에 영속화**(현재 credential만).
- 부팅 시 캐시 즉시 렌더 → 백그라운드 재동기화. 단절 중 화면 유지 + "재연결 중" 표시(blank 금지).
- 태블릿 standalone 경로의 `localPickup`도 동일하게 영속.

### 3.4 버전 락 (테마 세트 상호 배타)
- Ready-Only: **8레이아웃만**(`ready_only_layout`). theme.tsx 이미 분기됨 — 엔지니어 강제 토글만 정리.
- Two-Display: **12테마만**(`theme_key`). `tv-view.html`/native `ThemedPickup` = 12테마 전용.

### 3.5 빌드/설정 분리
- `EXPO_PUBLIC_PRODUCT_TIER = ready_only | two_display` 빌드 변수.
- Ready-Only: 클라우드 URL 미요구·로컬 전송·8레이아웃 폰트(10종). Two-Display: 클라우드 URL·12테마 폰트(23종).

### 3.6 도구 정리 (이번 혼동 방지)
- `apps/api/public/tv-view.html` = **Two-Display(12테마) 전용** 명시. Ready-Only 테스트 금지.
- 태블릿 `tv.tsx`(/tv 캐스트 경로)는 B에서 **비주력** — Cast 미채택이므로 deprecate 또는 Two-Display 웹 미러 용도로만.

---

## 4. 잔여 확인
1. B 전송 변형: **B1(로컬 WS)** vs **B2(UDP 멀티캐스트)** — 신뢰성 vs 단순성.
2. 디스커버리 방식: mDNS/NSD(자동) vs QR/수동 IP.
3. Two-Display의 12테마 ↔ 8레이아웃 전환 시 설정 마이그레이션 필요 여부.
4. 신규 의존성(WS 서버/UDP/mDNS 라이브러리) AG-017 화이트리스트 승인.
