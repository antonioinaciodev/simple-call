import { ArrowLeft, Clock, Hash, Pin, PinOff, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useRoomsStatus } from '../hooks/useRoomsStatus';
import {
  createNamedRoom,
  createRoom,
  getRoomsStatus,
  isNamedRoom,
  isSlug,
  parseRoomInput,
  RoomTakenError,
  roomSlug,
  slugify,
  type RoomStatus,
} from '../lib/api';
import { inApp } from '../lib/native';
import { forgetRoom, loadRecent, rememberRoom, setPinned, type RecentRoom } from '../lib/recent';
import { UpdateNotice } from './UpdateNotice';

// Início do app: criar uma call rápida ou uma sala fixa, entrar numa, ou voltar pra uma das
// recentes. No navegador fica em /app; a apresentação e os downloads ficam na raiz (Landing).
export function Home({ navigate }: { navigate: (to: string) => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState(loadRecent);
  const [fixedOpen, setFixedOpen] = useState(false);
  const { status, loaded } = useRoomsStatus(recent.map((r) => r.room));

  async function newCall() {
    setBusy(true);
    setError('');
    try {
      navigate(`/${await createRoom()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a call.');
      setBusy(false);
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    const room = parseRoomInput(input);
    if (!room) return setError('Não reconheci. Cole o link, o código (abc-defg-hij) ou o nome de uma sala fixa.');
    // "campeonato" tem 10 letras e também parece um código sem hífens: se existir uma sala
    // fixa com esse nome, é ela.
    const word = input.trim().toLowerCase();
    if (!isNamedRoom(room) && /^[a-z]{10}$/.test(word)) {
      const named = `sala/${word}`;
      const found = await getRoomsStatus([named]).catch(() => ({}) as Record<string, RoomStatus>);
      if (found[named]?.exists) return navigate(`/${named}`);
    }
    navigate(`/${room}`);
  }

  function remove(room: string) {
    forgetRoom(room);
    setRecent(loadRecent());
  }

  function pin(room: string, pinned: boolean) {
    setPinned(room, pinned);
    setRecent(loadRecent());
  }

  const pinned = recent.filter((r) => r.pinned);
  const others = recent.filter((r) => !r.pinned);
  const section = (title: string, list: RecentRoom[]) => (
    <section className="recent" aria-label={title}>
      <h2 className="recent-title muted small">{title}</h2>
      <ul>
        {list.map((r) => (
          <RecentItem
            key={r.room}
            recent={r}
            status={status[r.room]}
            loaded={loaded}
            open={() => navigate(`/${r.room}`)}
            remove={() => remove(r.room)}
            pin={(on) => pin(r.room, on)}
          />
        ))}
      </ul>
    </section>
  );

  return (
    <div className="center-page">
      <div className="home">
        <div className="wordmark">
          <span className="dot" /> simplecall
        </div>
        <h1>Chamadas leves pra jogar e transmitir com os amigos.</h1>
        <p className="muted">Sem conta. Cria uma call rápida ou uma sala fixa pro grupo e manda o link.</p>

        <div className="home-actions">
          <div className="home-create">
            <button className="btn primary" onClick={newCall} disabled={busy}>
              {busy ? 'Criando…' : 'Nova call'}
            </button>
            <button className={`btn ${fixedOpen ? 'active' : ''}`} type="button" onClick={() => setFixedOpen((o) => !o)} aria-expanded={fixedOpen}>
              Nova sala fixa
            </button>
          </div>
          {fixedOpen && <NewFixedRoom navigate={navigate} onClose={() => setFixedOpen(false)} />}
          <form className="join" onSubmit={join}>
            <input
              className="input"
              placeholder="Código, link ou nome da sala"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
              aria-label="Código, link ou nome da sala"
            />
            <button className="btn" type="submit" disabled={!input.trim()}>
              Entrar
            </button>
          </form>
        </div>
        {error && <p className="error">{error}</p>}

        {/* "Fixos" só aparece depois do primeiro alfinete. */}
        {pinned.length > 0 && section('Fixos', pinned)}
        {others.length > 0 && section('Recentes', others)}

        {!inApp && (
          <p className="home-back muted small">
            <a
              href="/"
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                navigate('/');
              }}
            >
              <ArrowLeft size={14} /> Sobre o Simple Call e downloads
            </a>
          </p>
        )}
      </div>
      <UpdateNotice />
    </div>
  );
}

// Sala fixa: link com nome que vale pra sempre (/sala/galera), pro grupo saber onde entrar.
function NewFixedRoom({ navigate, onClose }: { navigate: (to: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [taken, setTaken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slug = slugify(name);
  const valid = isSlug(slug);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError('');
    setTaken(null);
    try {
      const created = await createNamedRoom(name.trim());
      rememberRoom(created.room, created.name);
      navigate(`/${created.room}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a sala.');
      if (err instanceof RoomTakenError) setTaken(`sala/${slug}`);
      setBusy(false);
    }
  }

  return (
    <form className="fixed-form" onSubmit={create}>
      <label className="field">
        <span>Nome da sala fixa</span>
        <input
          className="input"
          autoFocus
          maxLength={32}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
            setTaken(null);
          }}
          placeholder="Ex.: Galera do LoL"
        />
      </label>
      <p className="muted small fixed-link">
        {valid ? (
          <>
            O link vai ser <span className="code">{location.host}/sala/{slug}</span> e fica valendo pra sempre.
          </>
        ) : (
          'Pelo menos 3 letras ou números. Quem tiver o link entra, então evite nomes óbvios demais.'
        )}
      </p>
      {error && (
        <p className="error">
          {error}{' '}
          {taken && (
            <a href={`/${taken}`} onClick={(e) => (e.preventDefault(), navigate(`/${taken}`))}>
              Entrar nela
            </a>
          )}
        </p>
      )}
      <div className="row-actions">
        <button className="btn primary" type="submit" disabled={busy || !valid}>
          {busy ? 'Criando…' : 'Criar sala'}
        </button>
        <button className="btn ghost" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ago(at: number) {
  const min = Math.round((Date.now() - at) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

// "Ana", "Ana e Beto", "Ana, Beto e Caio".
function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

interface ItemProps {
  recent: RecentRoom;
  status?: RoomStatus;
  loaded: boolean;
  open: () => void;
  remove: () => void;
  pin: (pinned: boolean) => void;
}

function RecentItem({ recent, status, loaded, open, remove, pin }: ItemProps) {
  const named = isNamedRoom(recent.room);
  const label = named ? (status?.name ?? recent.name ?? roomSlug(recent.room)) : recent.room;
  const count = status?.count ?? 0;
  const sub = count > 0 ? joinNames(status!.names) : named ? `/${recent.room}` : `Call rápida · ${ago(recent.at)}`;
  const presence = !status ? (loaded ? '' : '…') : count === 0 ? 'vazia' : count >= status.max ? 'cheia' : `${count} na call`;

  return (
    <li className="recent-item">
      <button type="button" className="recent-open" onClick={open}>
        <span className="recent-icon" aria-hidden>
          {named ? <Hash size={16} /> : <Clock size={16} />}
        </span>
        <span className="recent-text">
          <span className={`recent-name ${named ? '' : 'code'}`}>{label}</span>
          <span className="recent-sub muted small">{sub}</span>
        </span>
        <span className={`presence small ${count > 0 ? 'on' : ''}`} title={count > 0 ? joinNames(status!.names) : undefined}>
          {count > 0 && <span className="presence-dot" />}
          {presence}
        </span>
      </button>
      <button
        type="button"
        className={`icon-btn small ghost recent-action ${recent.pinned ? 'pinned' : ''}`}
        onClick={() => pin(!recent.pinned)}
        title={recent.pinned ? 'Tirar dos fixos' : 'Fixar no topo'}
        aria-label={recent.pinned ? `Tirar ${label} dos fixos` : `Fixar ${label} no topo`}
      >
        {recent.pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
      <button type="button" className="icon-btn small ghost recent-action recent-remove" onClick={remove} title="Tirar da lista" aria-label={`Tirar ${label} da lista`}>
        <X size={14} />
      </button>
    </li>
  );
}
