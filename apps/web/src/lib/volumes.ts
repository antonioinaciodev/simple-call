import { useCallback, useState } from 'react';

// Volume da voz de cada pessoa (1 = 100%), salvo pelo nome: o id muda a cada call,
// o nome não. Assim o amigo que fala baixo já entra no volume que você deixou.

const KEY = 'simplecall:volumes';
export const MAX_VOICE_VOLUME = 2;

const keyOf = (name: string) => name.trim().toLowerCase();

function load(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function useVoiceVolumes() {
  const [volumes, setVolumes] = useState(load);

  const get = useCallback((name: string) => volumes[keyOf(name)] ?? 1, [volumes]);

  const set = useCallback((name: string, value: number) => {
    setVolumes((prev) => {
      const next = { ...prev, [keyOf(name)]: value };
      // 100% é o padrão: não precisa guardar.
      if (value === 1) delete next[keyOf(name)];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* sem persistência, tudo bem */
      }
      return next;
    });
  }, []);

  return { get, set };
}
