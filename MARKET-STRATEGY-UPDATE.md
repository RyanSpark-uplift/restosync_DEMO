# MARKET-STRATEGY-UPDATE.md — RestoSync 시장/경쟁 데이터
> Generated: 2026-05-09 via web_search · Refresh cycle: 90 days
> Next refresh due: 2026-08-07 (or earlier on user request)

---

## 🌍 Industry size + growth

| 시장 | 2024/2025 | 2026 전망 | 2031/2032/2033 | CAGR |
|---|---|---|---|---|
| Restaurant Management Software | $6.54B (2025) | $7.49B | $14.73B (2031) | **14.52%** |
| Restaurant POS Software | $9.44B (2024) | — | $17.88B (2032) | **6.88%** |
| Restaurant Online Ordering | $24.6B (2024) | — | $78.9B (2033) | **14.8%** |
| Global Point of Sale (전체) | $38.56B (2025) | $44.6B | $138.92B (2034) | **15.3%** |

**핵심 신호:**
- Cloud-based POS가 시장의 ~68% 점유 (2026년 초 기준)
- 클라우드 SaaS 모델이 SME 도입 가속 (자본지출 부담 제거)
- 북미가 ~33–45% 점유, 아시아태평양은 가장 빠른 성장
- AI agent 통합 (예측 인벤토리, 추천)이 2026 핵심 트렌드

> *출처: Mordor Intelligence (2026-01), Verified Market Research (2026-02), Fortune Business Insights*
> 위 수치는 시장조사기관 추정치이며, 기관 간 정의/범위가 달라 직접 비교는 신중히.

---

## 🥊 Competitors + pricing

| 회사 | 시장 점유 (POS) | 가격대 (월) | 특이사항 |
|---|---|---|---|
| **Toast** | ~23% (전체 POS) / ~16% (US 레스토랑) | $69~ + 하드웨어/카드수수료 | 레스토랑 전문, NYSE:TOST, 117% net revenue retention |
| **Square (Block)** | ~28% (전체 POS) | 무료 시작 + 거래수수료 2.6%+ | 수평적 SMB 포커스, 레스토랑 깊이는 약함 |
| **Clover (Fiserv)** | ~6% | $14.95~ + 거래수수료 | POS+결제, 하드웨어 의존 |
| **Lightspeed** | ~6–7% | $69~$399 | Upserve/Restaurant365 인수, 레스토랑 특화 강화 중 |
| **NCR/Aloha (Voyix)** | 엔터프라이즈 강세 | 견적 기반 | 레거시, 체인/엔터프라이즈 |
| **SpotOn** | 마이너 | $0~$135 | G2 2025 #1, month-to-month 청구 |
| **TouchBistro** | 마이너 | $69~ | iPad 기반 |

**RestoSync의 차별 포지션:**
- **4-screen 통합 사이니지** — 메뉴/픽업/이벤트/광고 4 TV + 태블릿 컨트롤
- **하드웨어:** MECOOL KM2 Plus (~$87) — 기존 POS 위에 add-on
- **가격:** $49–99/월/위치 — Toast/Lightspeed 대비 30–50% 낮음
- **Open API / WS 프로토콜:** 기존 POS와 공존 (대체 아님)
- **다국적 배달 통합:** DoorDash + UberEats + Grubhub + Fantuan + HungryPanda — 아시아계 매장 강점

---

## 🚧 Regulation / headwind

| 항목 | 영향도 | 조치 |
|---|---|---|
| **PCI-DSS** | 필수 | RestoSync는 카드정보 직접 처리 안 함 (POS가 처리). 자체 PCI scope 회피 |
| **SOC 2 / ISO 27001** | 점차 필수 | 파일럿 단계에선 미필요, 50+ 매장 시점 검토 |
| **데이터 프라이버시 (CCPA, GDPR)** | 미국 캘리포니아 우선 | 개인정보처리방침 + 이용약관 필수 (TOOL-REVIEW.md 등재) |
| **Phase 2 AI (DALL-E, Runway, Kling)** | 중간 | Kling은 중국 API → 15 CFR Part 791 ICTS/VCS 검토 필요. featureFlag로 출하 전까지 비활성 |
| **레이버 컴플라이언스** | 낮음 | RestoSync는 직원 시간 추적 안 함 (Toast/Square가 처리) |

**Cybersecurity 트렌드(2025–2026):** 호스피탈리티 ransomware 공격 증가로 SOC 2/ISO 27001/PCI-DSS가 must-have로 자리잡는 중. RestoSync도 1년 내 SOC 2 Type 1은 검토 권장.

---

## 📈 Trajectory of segment

**상승 (Growing):**
- Mobile-first POS, 핸드핼드 / QR 주문 (2026 표준화)
- AI 통합 (수요 예측, 메뉴 최적화, 개인화)
- 클라우드 SaaS (capex → opex 전환)
- API 개방성 — 결제/회계/근로 도구와 상호운용
- 아시아 태평양 (16.24% CAGR, 북미보다 빠름)

**하락 / 정체:**
- 온프레미스 POS (cloud로 대체 중)
- 단일 기능 도구 (통합 ecosystem이 승)
- 하드웨어-only 매출 (소프트웨어 + 결제 + 데이터로 수익 모델 이동)

**투자 환경:** Toast가 $25B 시가총액으로 S&P 500 진입 후보. Private equity 활동 활발.
민감점: US recession 시 레스토랑 capex 위축 → SaaS 신규 도입 둔화 가능.

---

## ⚠️ Conflict flag — 사용자 PT 데이터 vs web data

| 항목 | 사용자 PT (Final-v4) | Web 검증 (2026-05) | 판정 |
|---|---|---|---|
| BullMQ 라이선스 | "BSL 1.1, SaaS 제한" | **MIT** (BullMQ 표준) | **❌ 정정 필요** — TOOL-REVIEW.md [TR-003] v3에서 정정 완료 |
| Toast 가격 | 언급 없음 | $69~/월 + 거래수수료 | RestoSync $49–99는 합리적 범위 |
| 시장 CAGR | 언급 없음 | 6.88%~14.8% (정의에 따라) | 시장 환경 OK |

---

## 🎯 RestoSync에 대한 시사점

1. **레스토랑 SaaS 시장은 14% CAGR로 성장 중** — 진입 타이밍 양호
2. **Toast/Square의 가격 압박은 약함** — 차별 가능 ($49 vs $69)
3. **4-screen 통합 사이니지는 niche** — 직접 경쟁자 적음, 그러나 시장 사이즈도 작음
4. **AI 통합은 phase 2로 충분** — 2026 트렌드지만 RestoSync MVP는 운영 효율 우선
5. **아시아 매장 (Fantuan/HungryPanda 통합)은 기회** — 첫 파일럿(demo-store-a)도 SD 한인 매장이 적합

---

## 90일 refresh 절차

```bash
# 다음 refresh: 2026-08-07
# 커맨드:
# claude > "Refresh MARKET-STRATEGY-UPDATE.md with current data"
#
# 자동 실행:
# 1. web_search "restaurant POS market 2026 size CAGR"
# 2. web_search "Toast Square Lightspeed pricing 2026"
# 3. web_search "PCI-DSS SOC 2 restaurant SaaS requirements"
# 4. diff 보여주고 사용자 승인 후 commit
```
