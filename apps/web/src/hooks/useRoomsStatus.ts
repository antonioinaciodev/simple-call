import { useEffect, useState } from 'react';
import { getRoomsStatus, type RoomStatus } from '../lib/api';

// De quanto em quanto tempo pergunta quem está em cada sala. Só enquanto a janela está na
// frente: com o jogo aberto por cima, o app não fica gastando nada à toa.
const EVERY_MS = 20_000;

export function useRoomsStatus(rooms: string[]) {
  const [status, setStatus] = useState<Record<string, RoomStatus>>({});
  const [loaded, setLoaded] = useState(false);
  const key = rooms.join(',');

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (!list.length) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;

    const active = () => document.visibilityState === 'visible' && document.hasFocus();

    async function refresh() {
      clearTimeout(timer);
      last = Date.now();
      try {
        const next = await getRoomsStatus(list);
        if (!cancelled) setStatus(next);
      } catch {
        // Sem internet: mantém o que já tinha e tenta de novo depois.
      }
      if (cancelled) return;
      setLoaded(true);
      if (active()) timer = setTimeout(refresh, EVERY_MS);
    }

    // Voltou pra janela: atualiza na hora se a última olhada já tem um tempo.
    const onFocus = () => {
      if (!active()) return;
      const since = Date.now() - last;
      if (since > 3000) void refresh();
      else {
        clearTimeout(timer);
        timer = setTimeout(refresh, EVERY_MS - since);
      }
    };
    const onBlur = () => clearTimeout(timer);

    void refresh();
    addEventListener('focus', onFocus);
    addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      removeEventListener('focus', onFocus);
      removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [key]);

  return { status, loaded };
}
