// M01 Sprint 4 S4.6 — Ingredients tab (Page B #6, P1.5 BR-19 prep).
//
// PRD §3.2 #6 / §5.4. Recipe = item ↔ ingredient N:M with per-line quantity + unit.
// Persistence: PUT /api/menu/items/:id/recipe (entire replacement, 1 tx).
//
// UX:
//   - Local state holds editable recipe array (lines).
//   - Dirty button surfaces "Save recipe" when local ≠ server.
//   - Per-row controls: ingredient picker, quantity, unit dropdown, delete.
//   - Add-line picker offers store ingredients not already in recipe.
//   - Inline create-ingredient mini form (name + unit) → POST + auto-attach.
//   - BR-20 lock banner when sync_source≠'restosync' (read-only).
//   - AM01-016 raw text local state, onBlur commit pattern.
//   - AM01-018 web confirm branch on destructive ops.

import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@restosync/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchIngredients, createIngredient, fetchItemRecipe, putItemRecipe,
  type Ingredient, type IngredientUnit, type RecipeLine, type RecipeLineInput,
} from '../../../api/menu';

interface Props {
  itemId: string;
  syncSource?: string | null;
}

const RECIPE_KEY      = (id: string) => ['menu', 'item', id, 'recipe'] as const;
const INGREDIENTS_KEY = ['menu', 'ingredients'] as const;

const UNITS: IngredientUnit[] = ['g', 'kg', 'ml', 'L', 'oz', 'lb', 'each', 'piece', 'dozen'];

// Local row shape — recipe line as the user is editing it.
interface DraftLine {
  ingredient_id: string;
  quantity:      string;            // raw text — only validated on save
  unit:          IngredientUnit;
}

function recipeToDraft(rows: RecipeLine[]): DraftLine[] {
  return rows.map((r) => ({
    ingredient_id: r.ingredient_id,
    quantity:      String(Number(r.quantity)),   // strip trailing zeros for display
    unit:          r.unit,
  }));
}

function draftsEqual(a: DraftLine[], b: DraftLine[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].ingredient_id !== b[i].ingredient_id) return false;
    if (a[i].quantity      !== b[i].quantity)      return false;
    if (a[i].unit          !== b[i].unit)          return false;
  }
  return true;
}

function isValidQty(q: string): boolean {
  return /^\d+(\.\d{1,3})?$/.test(q.trim()) && Number(q) > 0;
}

export function IngredientsTab({ itemId, syncSource }: Props) {
  const locked = !!syncSource && syncSource !== 'restosync';
  const qc = useQueryClient();

  const { data: recipe, isLoading: recipeLoading, error: recipeError } = useQuery<RecipeLine[]>({
    queryKey: RECIPE_KEY(itemId),
    queryFn:  () => fetchItemRecipe(itemId),
  });
  const { data: catalog, isLoading: catalogLoading } = useQuery<Ingredient[]>({
    queryKey: INGREDIENTS_KEY,
    queryFn:  () => fetchIngredients({ limit: 500 }),
    staleTime: 30_000,
  });

  // Server-baseline draft (recomputed when recipe refetches).
  const serverDraft = useMemo<DraftLine[]>(() => recipeToDraft(recipe ?? []), [recipe]);
  const [draft, setDraft] = useState<DraftLine[] | null>(null);
  const effective = draft ?? serverDraft;

  const dirty = useMemo(() => draft !== null && !draftsEqual(draft, serverDraft), [draft, serverDraft]);
  const allValid = effective.every((l) => isValidQty(l.quantity) && !!l.ingredient_id);

  const [saveErr, setSaveErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const lines: RecipeLineInput[] = effective.map((l, idx) => ({
        ingredient_id: l.ingredient_id,
        quantity:      l.quantity.trim(),
        unit:          l.unit,
        sort_order:    idx + 1,
      }));
      return putItemRecipe(itemId, lines);
    },
    onSuccess: () => {
      setSaveErr(null);
      setDraft(null);
      qc.invalidateQueries({ queryKey: RECIPE_KEY(itemId) });
      qc.invalidateQueries({ queryKey: ['menu', 'item', itemId] });
    },
    onError: (e: unknown) => setSaveErr(e instanceof Error ? e.message : 'Save failed'),
  });

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setDraft((prev) => {
      const base = prev ?? serverDraft;
      return base.map((l, i) => i === idx ? { ...l, ...patch } : l);
    });
  };
  const removeLine = (idx: number) => {
    const target = effective[idx];
    const ingrName = catalog?.find((c) => c.id === target.ingredient_id)?.name.en ?? 'this line';
    if (Platform.OS === 'web') {
      if (!globalThis.confirm(`Remove "${ingrName}" from recipe?`)) return;
    }
    setDraft((prev) => {
      const base = prev ?? serverDraft;
      return base.filter((_, i) => i !== idx);
    });
  };
  const addLine = (ingredient: Ingredient) => {
    setDraft((prev) => {
      const base = prev ?? serverDraft;
      return [...base, { ingredient_id: ingredient.id, quantity: '1', unit: ingredient.unit }];
    });
  };
  const discard = () => {
    setDraft(null);
    setSaveErr(null);
  };

  const usedIds  = new Set(effective.map((l) => l.ingredient_id));
  const remaining = (catalog ?? []).filter((c) => !usedIds.has(c.id));

  return (
    <ScrollView style={s.root} contentContainerStyle={s.body}>
      {locked && (
        <View style={s.lockedBanner}>
          <Ionicons name="lock-closed" size={14} color={T.color.warn} />
          <Text style={s.lockedText}>
            Item is mastered by external POS ({syncSource}). Recipe is read-only here (BR-20).
          </Text>
        </View>
      )}

      <View style={s.tabHint}>
        <Ionicons name="information-circle-outline" size={14} color={T.color.t2} />
        <Text style={s.tabHintText}>
          Recipe changes save independently — use the <Text style={s.tabHintBold}>Save recipe</Text> button below.
          The page Save button at the top applies only to Basic / Schedule / Allergens / Display tabs.
        </Text>
      </View>

      <SectionHeader
        icon="restaurant-outline"
        title="Recipe"
        hint="Per-serving ingredient list. Used for stock tracking (BR-19, P1.5 auto-86)."
      />

      {recipeLoading && <ActivityIndicator color={T.color.t1} />}
      {recipeError && <Text style={s.errorText}>{(recipeError as Error).message}</Text>}

      {!recipeLoading && effective.length === 0 && (
        <Text style={s.emptyText}>No recipe lines yet. Add ingredients below.</Text>
      )}

      {effective.map((line, idx) => {
        const ingr = catalog?.find((c) => c.id === line.ingredient_id);
        return (
          <View key={`${line.ingredient_id}-${idx}`} style={s.lineRow}>
            <View style={s.lineName}>
              <Text style={s.lineNameText} numberOfLines={1}>
                {ingr?.name.en ?? '(unknown ingredient)'}
              </Text>
              {ingr?.min_threshold != null && Number(ingr.stock_quantity) < Number(ingr.min_threshold) && (
                <Text style={s.lineLow}>low stock</Text>
              )}
            </View>
            <TextInput
              style={[s.qtyInput, !isValidQty(line.quantity) && s.inputError]}
              value={line.quantity}
              onChangeText={(t) => updateLine(idx, { quantity: t })}
              keyboardType="decimal-pad"
              editable={!locked}
              placeholder="qty"
              placeholderTextColor={T.color.t2}
            />
            <UnitDropdown
              value={line.unit}
              onChange={(u) => updateLine(idx, { unit: u })}
              disabled={locked}
            />
            {!locked && (
              <TouchableOpacity
                style={s.deleteBtn}
                onPress={() => removeLine(idx)}
                accessibilityRole="button"
                accessibilityLabel="Remove recipe line"
              >
                <Ionicons name="trash-outline" size={16} color={T.color.error} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {!locked && !catalogLoading && remaining.length > 0 && (
        <View style={s.pickerWrap}>
          <Text style={s.pickerLabel}>Add ingredient:</Text>
          {remaining.slice(0, 30).map((ingr) => (
            <TouchableOpacity
              key={ingr.id}
              style={s.pickerChip}
              onPress={() => addLine(ingr)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${ingr.name.en}`}
            >
              <Text style={s.pickerChipText}>{ingr.name.en ?? '(unnamed)'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!locked && !catalogLoading && (catalog?.length ?? 0) === 0 && (
        <Text style={s.emptyText}>
          No ingredients in this store yet. Create one below.
        </Text>
      )}

      {!locked && <CreateIngredientMiniForm onCreated={addLine} />}

      {dirty && (
        <View style={s.saveBar}>
          <TouchableOpacity
            style={s.discardBtn}
            onPress={discard}
            disabled={save.isPending}
            accessibilityRole="button"
            accessibilityLabel="Discard changes"
          >
            <Text style={s.discardText}>Discard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.saveBtn, (!allValid || save.isPending) && { opacity: 0.4 }]}
            onPress={() => save.mutate()}
            disabled={!allValid || save.isPending}
            accessibilityRole="button"
            accessibilityLabel="Save recipe"
          >
            {save.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.saveText}>Save recipe</Text>}
          </TouchableOpacity>
        </View>
      )}
      {saveErr && <Text style={s.errorText}>{saveErr}</Text>}
    </ScrollView>
  );
}

// ── Unit dropdown (simple inline cycler) ─────────────────────────────────────
// Keep tiny: tap to cycle through UNITS. Long-press would open a picker (deferred).
function UnitDropdown({
  value, onChange, disabled,
}: { value: IngredientUnit; onChange: (u: IngredientUnit) => void; disabled?: boolean }) {
  const next = () => {
    const i = UNITS.indexOf(value);
    onChange(UNITS[(i + 1) % UNITS.length]);
  };
  return (
    <TouchableOpacity
      style={s.unitBtn}
      onPress={next}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Unit ${value}, tap to cycle`}
    >
      <Text style={s.unitBtnText}>{value}</Text>
    </TouchableOpacity>
  );
}

// ── Inline create-ingredient mini form ───────────────────────────────────────
function CreateIngredientMiniForm({ onCreated }: { onCreated: (i: Ingredient) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<IngredientUnit>('g');
  const [err, setErr]   = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createIngredient({ name: { en: name.trim() }, unit }),
    onSuccess: (ingr) => {
      setName(''); setErr(null); setOpen(false);
      qc.invalidateQueries({ queryKey: INGREDIENTS_KEY });
      onCreated(ingr);
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : 'Create failed'),
  });

  if (!open) {
    return (
      <TouchableOpacity
        style={s.miniOpen}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Create new ingredient"
      >
        <Ionicons name="add-circle-outline" size={16} color={T.color.brand} />
        <Text style={s.miniOpenText}>Create new ingredient</Text>
      </TouchableOpacity>
    );
  }

  const canCreate = name.trim().length > 0 && !create.isPending;

  return (
    <View style={s.miniForm}>
      <TextInput
        style={[s.input, { flex: 2 }]}
        placeholder="Ingredient name"
        placeholderTextColor={T.color.t2}
        value={name}
        onChangeText={setName}
      />
      <UnitDropdown value={unit} onChange={setUnit} />
      <TouchableOpacity
        style={[s.addBtn, !canCreate && { opacity: 0.4 }]}
        onPress={() => create.mutate()}
        disabled={!canCreate}
        accessibilityRole="button"
        accessibilityLabel="Create ingredient"
      >
        {create.isPending
          ? <ActivityIndicator size="small" color="#fff" />
          : <Ionicons name="checkmark" size={18} color="#fff" />}
      </TouchableOpacity>
      <TouchableOpacity
        style={s.deleteBtn}
        onPress={() => { setOpen(false); setName(''); setErr(null); }}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      >
        <Ionicons name="close" size={16} color={T.color.t1} />
      </TouchableOpacity>
      {err && <Text style={s.errorText}>{err}</Text>}
    </View>
  );
}

function SectionHeader({ icon, title, hint }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; hint: string;
}) {
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={18} color={T.color.brand} />
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionHint}>{hint}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: T.sp[5], gap: T.sp[3] },

  lockedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    backgroundColor: '#3a2c1a',
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    borderRadius: 8,
  },
  lockedText: { color: T.color.warn, fontSize: 12, flex: 1 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: T.sp[2], marginBottom: T.sp[2],
  },
  sectionTitle: { color: T.color.t0, fontSize: 14, fontWeight: '700' },
  sectionHint:  { color: T.color.t2, fontSize: 11 },

  tabHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: T.sp[2],
    backgroundColor: T.color.bg3, borderRadius: 8,
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
  },
  tabHintText: { color: T.color.t2, fontSize: 11, flex: 1, lineHeight: 16 },
  tabHintBold: { color: T.color.t1, fontWeight: '700' },

  emptyText: { color: T.color.t2, fontSize: 12, fontStyle: 'italic' },
  errorText: { color: T.color.error, fontSize: 11 },
  inputError: { borderWidth: 1, borderColor: T.color.error },

  input: {
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    fontSize: 13,
  },

  lineRow: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    paddingVertical: T.sp[2],
    borderBottomWidth: 1, borderBottomColor: T.color.border,
  },
  lineName: { flex: 2, gap: 2 },
  lineNameText: { color: T.color.t0, fontSize: 13, fontWeight: '600' },
  lineLow: { color: T.color.warn, fontSize: 10, fontStyle: 'italic' },

  qtyInput: {
    width: 70,
    backgroundColor: T.color.bg3, color: T.color.t0,
    borderRadius: 8, paddingHorizontal: T.sp[2], paddingVertical: T.sp[2],
    fontSize: 13, textAlign: 'right',
  },

  unitBtn: {
    minWidth: 56, paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    backgroundColor: T.color.bg3, borderRadius: 8,
    borderWidth: 1, borderColor: T.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
  unitBtnText: { color: T.color.t0, fontSize: 12, fontWeight: '700' },

  deleteBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: T.color.bg3, borderWidth: 1, borderColor: T.color.border,
    alignItems: 'center', justifyContent: 'center',
  },

  pickerWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: T.sp[2],
    paddingTop: T.sp[2],
    borderTopWidth: 1, borderTopColor: T.color.border,
    alignItems: 'center',
  },
  pickerLabel: { color: T.color.t2, fontSize: 11, marginRight: T.sp[1] },
  pickerChip: {
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    backgroundColor: T.color.bg3,
    borderRadius: 16, borderWidth: 1, borderColor: T.color.border,
  },
  pickerChipText: { color: T.color.t1, fontSize: 12, fontWeight: '600' },

  miniOpen: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    paddingHorizontal: T.sp[3], paddingVertical: T.sp[2],
    alignSelf: 'flex-start',
  },
  miniOpenText: { color: T.color.brand, fontSize: 12, fontWeight: '600' },

  miniForm: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[2],
    paddingTop: T.sp[2],
    borderTopWidth: 1, borderTopColor: T.color.border,
  },
  addBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: T.color.brand,
    alignItems: 'center', justifyContent: 'center',
  },

  saveBar: {
    flexDirection: 'row', alignItems: 'center', gap: T.sp[3],
    paddingTop: T.sp[3], marginTop: T.sp[2],
    borderTopWidth: 1, borderTopColor: T.color.border,
    justifyContent: 'flex-end',
  },
  discardBtn: {
    paddingHorizontal: T.sp[4], paddingVertical: T.sp[2],
    borderRadius: 8, borderWidth: 1, borderColor: T.color.border,
  },
  discardText: { color: T.color.t1, fontSize: 13, fontWeight: '600' },
  saveBtn: {
    paddingHorizontal: T.sp[5], paddingVertical: T.sp[2],
    borderRadius: 8, backgroundColor: T.color.brand,
  },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
