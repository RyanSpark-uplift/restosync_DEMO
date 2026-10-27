// M01 Sprint 3 — 3-col grid wrapper. EmptyState 분기는 부모가 처리하고
// 여기는 items가 비어있으면 inline EmptyState 표시.

import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { T } from '@restosync/ui';
import { MenuCard } from './MenuCard';
import { EmptyState } from './StatusViews';
import type { MenuItem } from '../../api/menu';

interface Props {
  items:            MenuItem[];
  numColumns?:      number;
  onPressItem?:     (item: MenuItem) => void;
  onToggleSoldOut?: (item: MenuItem) => void;
  inflightItemIds?: Set<string>;
}

export function MenuGrid({
  items, numColumns = 3, onPressItem, onToggleSoldOut, inflightItemIds,
}: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="restaurant-outline"
        title="No menu items match your filters"
        hint="Try a different daypart or clear the search."
      />
    );
  }

  return (
    <FlatList
      data={items}
      key={`grid-${numColumns}`}
      numColumns={numColumns}
      keyExtractor={(i) => i.id}
      contentContainerStyle={s.list}
      columnWrapperStyle={numColumns > 1 ? s.row : undefined}
      renderItem={({ item }) => (
        <View style={{ flex: 1, maxWidth: `${100 / numColumns}%` }}>
          <MenuCard
            item={item}
            onPress={onPressItem}
            onToggleSoldOut={onToggleSoldOut}
            toggleInFlight={inflightItemIds?.has(item.id)}
          />
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  list: { padding: T.sp[2] },
  row:  { /* gap is handled by card margin */ },
});
