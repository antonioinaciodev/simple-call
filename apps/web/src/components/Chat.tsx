import { SendHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatState } from '../hooks/useChat';

const time = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function Chat({ chat, onClose }: { chat: ChatState; onClose: () => void }) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const [sending, setSending] = useState(false);
  const { messages, send } = chat;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) return;
    setText('');
    setSending(true);
    await send(msg).catch(() => setText(msg));
    setSending(false);
  }

  return (
    <div className="panel-inner">
      <div className="panel-head">
        <h2>Chat</h2>
        <button className="icon-btn small ghost" onClick={onClose} aria-label="Fechar chat">
          <X size={16} />
        </button>
      </div>
      <div className="messages" ref={listRef}>
        {messages.length === 0 && <p className="muted small">As mensagens somem quando a call acaba.</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          // Agrupa mensagens seguidas da mesma pessoa, como no Meet.
          const grouped = prev && prev.identity === m.identity && m.timestamp - prev.timestamp < 120_000;
          return (
            <div key={m.id} className={`message ${grouped ? 'grouped' : ''}`}>
              {!grouped && (
                <div className="message-meta">
                  <strong>{m.isLocal ? 'Você' : m.name}</strong>
                  <span className="muted">{time(m.timestamp)}</span>
                </div>
              )}
              <p>{m.text}</p>
            </div>
          );
        })}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          className="input"
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mensagem"
          aria-label="Mensagem"
          autoFocus
        />
        <button className="icon-btn small" type="submit" disabled={sending || !text.trim()} aria-label="Enviar">
          <SendHorizontal size={16} />
        </button>
      </form>
    </div>
  );
}
