import { useEffect, useState } from 'react';

function fmt(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function useClock(): string {
  const [time, setTime] = useState(() => fmt(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTime(fmt(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}
