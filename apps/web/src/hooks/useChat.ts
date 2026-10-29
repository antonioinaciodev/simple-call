import type { Room } from 'livekit-client';
import { useCallback, useEffect, useState } from 'react';

export interface ChatMessage {
  id: string;
  identity: string;
  name: string;
  isLocal: boolean;
  text: string;
  timestamp: number;
}

// Mesmo tópico do chat oficial do LiveKit, pra ser compatível com outros clientes.
const TOPIC = 'lk.chat';
const MAX_MESSAGES = 500;

// Chat efêmero por text streams do LiveKit: nada é salvo, as mensagens somem quando a call acaba.
export function useChat(room: Room) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const push = useCallback((m: ChatMessage) => setMessages((prev) => [...prev, m].slice(-MAX_MESSAGES)), []);

  useEffect(() => {
    room.registerTextStreamHandler(TOPIC, async (reader, { identity }) => {
      const text = await reader.readAll();
      const p = room.getParticipantByIdentity(identity);
      push({
        id: reader.info.id,
        identity,
        name: p?.name || identity,
        isLocal: false,
        text,
        timestamp: reader.info.timestamp,
      });
    });
    return () => room.unregisterTextStreamHandler(TOPIC);
  }, [room, push]);

  const send = useCallback(
    async (text: string) => {
      const lp = room.localParticipant;
      const info = await lp.sendText(text, { topic: TOPIC });
      push({ id: info.id, identity: lp.identity, name: lp.name || lp.identity, isLocal: true, text, timestamp: info.timestamp });
    },
    [room, push],
  );

  return { messages, send };
}

export type ChatState = ReturnType<typeof useChat>;
