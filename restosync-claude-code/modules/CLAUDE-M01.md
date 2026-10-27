# CLAUDE-M01.md — TV① Menu Board
> **세션 로드 순서:** CLAUDE.md → ANTI-GLOBAL.md → ANTI-M01.md → 이 파일
> v2 | Sonnet 4.6 UX 감사 반영 — Loading/Empty 상태, Dayparting, CloudFront 추가

---

## 확정 스택
React Native TV 0.74 · Zustand (menuStore) · expo-keep-awake · CloudFront (이미지 CDN)

## UI 스펙 (1920×1080)
- 카테고리별 그리드 (음식 사진 포함, CloudFront URL)
- Dayparting 자동 전환 (breakfast/lunch/dinner/all)
- 품절: available=false → 취소선 + 반투명
- 하단 Ticker: M03 이벤트 ticker_text 연동 (선택)

## Dayparting 로직 (4-value 정본 — AG-013)
```typescript
function getCurrentDaypart() {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 16 && h < 22) return 'dinner';
  return 'all';
}
// daypart enum: ['breakfast','lunch','dinner','all']
// GET /api/menu/items?store_id=X&daypart=lunch&available=true
// setInterval 1시간마다 daypart 체크 → 변경 시 자동 재로드
```

## WS 이벤트
| 이벤트 | 처리 |
|--------|------|
| `display:menu_refresh` | 전체 메뉴 재로드 |
| `display:item_toggle` | 특정 아이템 available 변경 ({item_id, available}) |

## MenuBoardScreen — 4가지 상태 포함 (UX-001)
```typescript
export function MenuBoardScreen({ storeId }) {
  useKeepAwake();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { items } = useMenuStore();

  if (loading) return <LoadingView text="메뉴 불러오는 중..." />;
  if (error)   return <ErrorView onRetry={loadMenu} />;
  if (items.length === 0) return (
    <View style={styles.center}>
      <Text style={styles.emptyText}>등록된 메뉴가 없습니다</Text>
      <Text style={styles.sub}>태블릿 앱에서 메뉴를 추가하세요</Text>
    </View>
  );
  return <MenuGrid items={items} />;
}
```

## 완료 체크리스트
- [ ] 초기 메뉴 로드 (daypart 필터)
- [ ] 카테고리별 그리드 (CloudFront 이미지)
- [ ] 품절 처리 (취소선 + 반투명)
- [ ] Dayparting 자동 전환 (1시간 인터벌)
- [ ] display:menu_refresh → 전체 새로고침
- [ ] display:item_toggle → 개별 토글
- [ ] Loading/Empty/Error/Offline 4상태 (UX-001)
- [ ] WS 자동재접속 (AG-002)
- [ ] expo-keep-awake
- [ ] tv:heartbeat 30초
- [ ] MECOOL KM2 Plus 실기 테스트
