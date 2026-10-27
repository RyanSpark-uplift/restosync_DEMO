// M01 Sprint 3 — Tablet Menu UI state (Zustand)
//
// 서버 데이터는 TanStack Query가 책임. 이 store는 UI filter/selection만 보관.
// "slice render only, never re-render whole tree from a single setter" 원칙:
// 컴포넌트에서 `useMenuStore(s => s.filters.daypart)` 식으로 좁게 select.

import { create } from 'zustand';
import type { Daypart } from '@restosync/shared';

export interface MenuFilters {
  daypart:     Daypart | null;        // null = 모든 daypart
  category_id: string | null;          // null = 모든 카테고리
  search:      string;                 // client-side filter (server endpoint 미지원)
}

interface MenuUiState {
  filters:           MenuFilters;
  selectedItemId:    string | null;
  isAddModalOpen:    boolean;

  setDaypart:        (d: Daypart | null) => void;
  setCategoryId:     (id: string | null) => void;
  setSearch:         (q: string) => void;
  resetFilters:      () => void;

  setSelectedItemId: (id: string | null) => void;
  openAddModal:      () => void;
  closeAddModal:     () => void;
}

const DEFAULT_FILTERS: MenuFilters = {
  daypart:     null,
  category_id: null,
  search:      '',
};

export const useMenuStore = create<MenuUiState>((set) => ({
  filters:        DEFAULT_FILTERS,
  selectedItemId: null,
  isAddModalOpen: false,

  setDaypart:    (daypart)     => set((s) => ({ filters: { ...s.filters, daypart } })),
  setCategoryId: (category_id) => set((s) => ({ filters: { ...s.filters, category_id } })),
  setSearch:     (search)      => set((s) => ({ filters: { ...s.filters, search } })),
  resetFilters:  ()            => set({ filters: DEFAULT_FILTERS }),

  setSelectedItemId: (selectedItemId) => set({ selectedItemId }),
  openAddModal:      ()                => set({ isAddModalOpen: true }),
  closeAddModal:     ()                => set({ isAddModalOpen: false }),
}));
