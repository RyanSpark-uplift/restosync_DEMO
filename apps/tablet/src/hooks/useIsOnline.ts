// netinfo wrapper — AG-014 Offline 4상태 표시용. dashboard에서 이 훅을 추출.
//
// Web에서는 netinfo가 navigator.onLine 기반. native는 NetInfo 모듈.

import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setOnline(s.isConnected ?? true));
    return unsub;
  }, []);
  return online;
}
