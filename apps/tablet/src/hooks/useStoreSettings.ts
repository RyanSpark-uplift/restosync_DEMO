// Shared React Query wrapper around /api/store_settings.
// Each settings screen calls useStoreSettings() once; PATCH triggers a refetch
// + the server broadcasts settings:updated WS so other clients hot-swap.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export type StoreSettingsShape = Record<string, unknown>;
type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export function useStoreSettings() {
  const qc = useQueryClient();
  const q = useQuery<StoreSettingsShape>({
    queryKey: ['store_settings'],
    queryFn:  () => api.get('/api/store_settings'),
  });

  const m = useMutation({
    mutationFn: (patch: DeepPartial<StoreSettingsShape>) =>
      api.patch('/api/store_settings', patch),
    onSuccess: (data) => {
      qc.setQueryData(['store_settings'], data);
    },
  });

  return {
    settings:  q.data,
    isLoading: q.isLoading,
    error:     q.error as Error | null,
    refetch:   q.refetch,
    patch:     m.mutate,
    isPatching: m.isPending,
  };
}
