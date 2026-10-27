# Sprint 0 — 결정 요청 (Ryan)
> PRD v1.0/v1.1/v1.2 누적 Open Questions 16건 + Sprint 0 신규 1건 = **총 17건**
> 우선순위: 🔴 Sprint 1 차단 / 🟠 Sprint 2~5 차단 / 🟡 Phase 1.5~2 결정 / 🟢 운영 미세 조정
> ✅ = 내가 합리적 결정으로 이미 처리. ⏳ = Ryan 회신 대기.

---

## 🎯 2026-05-17 확정 (Ryan 답변)

| # | 결정 | 비고 |
|---|------|------|
| **D0** | ✅ Daypart additive 6-value `[breakfast,lunch,snack,dinner,late,all]` | Sprint 1 S1.3 단일 commit |
| **Q2** | ✅ Cloudflare R2 1차 채택 | Phase 2+ S3 전환 가능 — `@aws-sdk/client-s3` endpoint만 변경, rclone로 데이터 복사 (코드 ~5줄) |
| **Q4** | ✅ 미적용 (orders.line_items_snapshot) | Sprint 1 S1.10에서 컬럼 추가 |
| **Q18** | ✅ lenient (사용자 토글로 strict) | Sprint 5 S5.12 두 경로 |

미결 (해당 Sprint 진입 D-3까지): Q9/Q10/Q14/Q15/Q16/Q17/Q19/Q20/Q21

---

## ✅ 사전 결정 (보고만, 이의 시 회신)

### D0. Daypart enum — additive 6-value
**결정:** `['breakfast','lunch','snack','dinner','late','all']`
**사유:** PRD v1.2 6-Daypart 차별화 + 기존 4값 무파괴 + AG-013 additive 패턴 (orderStatus 확장과 동일). `closed`는 daypart가 아닌 `stores.business_hours` 영역으로 분리.
**적용 시점:** Sprint 1 S1.3 — `enums.ts` + `schema.ts` + `migrations/0006_daypart_add_snack_late.sql` 단일 commit.
**이의 시:** "D0 재검토" 회신.

---

## 🔴 Sprint 1 차단 (즉시 회신 필요 — 2건)

### Q2 — Media 저장: R2 vs S3
- **PRD 추천:** Cloudflare R2
- **R2 (추천):** egress 무료. 매장 50곳·TV 200대·일 1GB 가정 시 연간 ~$6.5K 절감. S3 API 호환 → Phase 2+ 마이그레이션 코드 0 변경. AWS 종속 회피.
- **S3:** 성숙도 최강, Lambda/RDS 통합 강함. 단 egress $0.09/GB.
- **선택 기준:** Phase 1 (1~5 매장)은 비용 차이 미미. Phase 2+ R2 절대 유리.

### Q4 — 가격 변경 중인 주문 적용
- **PRD 추천:** 미적용 (orders.line_items_snapshot)
- **미적용 (추천):** 주문 생성 시점 `price_cents + variants + modifiers` 전체 JSON snapshot 저장. 회계/세금 정합성 보장. 캘리포니아 prepared food tax 준수.
- **적용 (실시간 join):** 가격 변경 시 진행 주문 영수증 변동 → 분쟁 위험.
- **영향:** Sprint 1 S1.10 `orders.line_items_snapshot jsonb` 컬럼 추가 여부 결정.

---

## 🟠 Sprint 2~5 차단 (Sprint 진입 전 회신 — 5건)

### Q16 — Import 템플릿 기본 포맷: XLSX vs CSV ZIP
- **PRD 추천:** XLSX (검증 드롭다운, 다중 시트 1파일). CSV ZIP은 옵션 다운로드로 제공.
- **영향:** Sprint 5 S5.3 템플릿 생성 (ExcelJS vs JSON+ZIP).

### Q17 — AI OCR LLM: Claude 3.5 Sonnet vs GPT-4o
- **PRD 추천:** Claude 1차, GPT 자동 fallback
- **Claude (추천):** 한국어/이모지/한자 vision 정확도 95%+ (한식 베타 우선). 단, vision rate limit 보수적.
- **GPT-4o:** 영문 메뉴 빠름, structured output 강제. 단 한글 ~85%.
- **영향:** Sprint 7-8 Anthropic SDK + OpenAI SDK 듀얼 작업.

### Q18 — Import partial failure 기본 모드
- **PRD 추천:** lenient (사용자 토글로 strict)
- **lenient (추천):** 100건 중 5건 오류 → 95건 등록 + 5건 CSV 에러 리포트. Toast/Lightspeed 둘 다 lenient 기본.
- **strict:** 한 건 실패 시 전체 rollback. 회계 매칭 중시 매장용.
- **영향:** Sprint 5 S5.12 트랜잭션 두 경로.

### Q20 — 사진 일괄 업로드 매칭 방식
- **PRD 추천:** ZIP (filename = external_id.jpg)
- **대안:** 폴더 다중 선택 / 클라우드 링크 일괄 / 개별 업로드만.
- **영향:** Sprint 5 S5.13 (Step4 사진 일괄 매칭).

### Q19 — Web Scrape 자체 운영 vs Apify
- **PRD 추천:** Apify Actor 위임 (Phase 2)
- **Apify:** Actor 위임 → 유지보수 0. 비용 $30~$100/mo. 단 외부 의존.
- **자체:** Puppeteer/Playwright 직접. 유지보수 부담 + IP ban 위험.
- **영향:** Phase 2 Sprint 10+ Web Scrape 어댑터.

---

## 🟡 Phase 1.5~2 결정 (Phase 진입 전 — 5건)

### Q9 — Modifier TV 표시 정책
- **PRD 추천:** TV는 base 가격만 (옵션은 키오스크/주문 화면)
- **영향:** Sprint 4 TV 5-Zone Menu Grid 렌더링 단순화 vs 확장.

### Q10 — Combo 카드 분리 vs 혼재
- **PRD 추천:** 별도 카드 + Featured Banner 노출
- **영향:** Sprint 4 Zone C 카드 컴포넌트 두 종류 vs 통일.

### Q14 — POS sync 충돌 시 master
- **PRD 추천:** `external_updated_at` 더 최근 + 운영자 알림
- **영향:** Phase 2 POS Adapter 충돌 정책.

### Q15 — Variant 별도 photo
- **PRD 추천:** 옵션 (default는 base item photo 상속)
- **영향:** Sprint 2 S2.3 transcode 워커 + Page B Tab 5 UI.

### Q21 — external_id 자동 생성
- **PRD 추천:** 옵션. 비어 있으면 `IMP-YYYYMMDD-NNN` 자동
- **영향:** Sprint 5 S5.8 validation 엔진.

---

## 🟢 운영 미세 조정 (PRD 추천 채택 — 이의 없으면 자동 진행, 5건)

> 이의 시에만 회신. 무응답 = 추천 채택.

| # | Question | 채택 (PRD 추천) |
|---|----------|----------------|
| Q1 | 다국어 default 매장별 변경 | 매장별 (stores.default_language) |
| Q3 | TV snapshot TTL | 60s + WS invalidation |
| Q5 | 사진 없음 fallback | 카테고리 일러스트 (Phase 1) |
| Q6 | LTO 종료 자동화 | TV 매분 체크 + 서버 매시 cron |
| Q7 | 카테고리 삭제 정책 | 차단 + "옵션 이동" 강제 |
| Q8 | 자동 번역 API | Phase 2 이후 |
| Q11 | Recipe 단위 변환 | 자동 (g↔kg, oz↔lb), piece는 별도 |
| Q12 | Analytics 기간 default | 지난 30일 |
| Q13 | FoodCourt 매장 간 가격 노출 | 각 매장 자체 결정 (옵트인) |

---

## 답변 양식

```
D0: OK / 재검토 → 사유
Q2: R2 / S3 → 사유
Q4: 미적용 / 적용 → 사유
Q16: XLSX / CSV ZIP / 둘 다 → 사유
Q17: Claude / GPT / 둘 다 → 사유
Q18: lenient / strict → 사유
Q20: ZIP / 폴더 / 클라우드 / 개별 → 사유
Q19: Apify / 자체 → 사유
Q9: TV base만 / TV 옵션도 → 사유
Q10: 별도 카드 / 혼재 → 사유
Q14: external_updated_at / 우리 우선 → 사유
Q15: 옵션 / 강제 / 없음 → 사유
Q21: 자동 생성 옵션 / 항상 자동 / 항상 수동 → 사유

🟢 운영 미세 조정 (Q1/Q3/Q5/Q6/Q7/Q8/Q11/Q12/Q13): 이의 있는 항목만 적기
```

Sprint 1 진입 차단 = D0 + Q2 + Q4 (3건). 나머지는 해당 Sprint 시작일 D-3까지 회신.
