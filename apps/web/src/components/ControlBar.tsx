import {
  Activity,
  MessageSquare,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  PhoneOff,
  Settings as SettingsIcon,
  Video,
  VideoOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SetPrefs } from '../App';
import type { Mesh } from '../lib/mesh';
import type { Prefs } from '../lib/prefs';
import type { MediaActions, Panel } from './Call';
import { CopyLinkButton } from './CopyLinkButton';
import { ShareMenu } from './ShareMenu';

interface Props {
  mesh: Mesh;
  actions: MediaActions;
  prefs: Prefs;
  setPrefs: SetPrefs;
  panel: Panel;
  setPanel: (p: Panel) => void;
  unread: boolean;
  showStats: boolean;
  toggleStats: () => void;
  onLeave: () => void;
  toast: string;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

export function ControlBar({ mesh, actions, prefs, setPrefs, panel, setPanel, unread, showStats, toggleStats, onLeave, toast }: Props) {
  const [shareOpen, setShareOpen] = useState(false);
  const { toggleMic, toggleCam, share, stopShare } = actions;
  const isMicrophoneEnabled = !!mesh.mic;
  const isCameraEnabled = !!mesh.camera;
  const isScreenShareEnabled = !!mesh.screen;

  const togglePanel = (p: Exclude<Panel, null>) => setPanel(panel === p ? null : p);

  // Atalhos: M mic, V câmera, S tela, C chat. Ignorados enquanto digita.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'm') toggleMic();
      else if (k === 'v') toggleCam();
      else if (k === 's') isScreenShareEnabled ? stopShare() : setShareOpen((o) => !o);
      else if (k === 'c') togglePanel('chat');
      else if (k === 'escape') setShareOpen(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  return (
    <footer className="controls">
      <div className="controls-side">
        <CopyLinkButton label="Convidar" />
      </div>

      <div className="controls-main">
        <button
          className={`icon-btn ${isMicrophoneEnabled ? 'on' : 'off'}`}
          onClick={toggleMic}
          title={`${isMicrophoneEnabled ? 'Desligar' : 'Ligar'} microfone (M)`}
          aria-pressed={isMicrophoneEnabled}
        >
          {isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button
          className={`icon-btn ${isCameraEnabled ? 'on' : 'off'}`}
          onClick={toggleCam}
          title={`${isCameraEnabled ? 'Desligar' : 'Ligar'} câmera (V)`}
          aria-pressed={isCameraEnabled}
        >
          {isCameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
        <div className="popover-anchor">
          <button
            className={`icon-btn ${isScreenShareEnabled ? 'active' : ''}`}
            onClick={() => (isScreenShareEnabled ? stopShare() : setShareOpen((o) => !o))}
            title={isScreenShareEnabled ? 'Parar transmissão (S)' : 'Transmitir tela (S)'}
            aria-pressed={isScreenShareEnabled}
          >
            {isScreenShareEnabled ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
          </button>
          {shareOpen && !isScreenShareEnabled && (
            <ShareMenu
              prefs={prefs}
              setPrefs={setPrefs}
              onClose={() => setShareOpen(false)}
              onStart={() => {
                setShareOpen(false);
                void share();
              }}
            />
          )}
        </div>
        <button className="icon-btn leave" onClick={onLeave} title="Sair da call">
          <PhoneOff size={20} />
        </button>
      </div>

      <div className="controls-side right">
        {mesh.screenPreset && <span className="muted small live-tag">AO VIVO · {mesh.screenPreset.label}</span>}
        <button
          className={`icon-btn small ${showStats ? 'active' : ''}`}
          onClick={toggleStats}
          title="Estatísticas da conexão"
          aria-pressed={showStats}
        >
          <Activity size={18} />
        </button>
        <button
          className={`icon-btn small ${panel === 'chat' ? 'active' : ''}`}
          onClick={() => togglePanel('chat')}
          title="Chat (C)"
          aria-pressed={panel === 'chat'}
        >
          <MessageSquare size={18} />
          {unread && <span className="badge" aria-label="Mensagens novas" />}
        </button>
        <button
          className={`icon-btn small ${panel === 'settings' ? 'active' : ''}`}
          onClick={() => togglePanel('settings')}
          title="Ajustes"
          aria-pressed={panel === 'settings'}
        >
          <SettingsIcon size={18} />
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </footer>
  );
}
