import { useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
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
import { audioCapture, audioPublish, type Prefs } from '../lib/prefs';
import { screenPreset } from '../lib/screen';
import type { Panel } from './Call';
import { CopyLinkButton } from './CopyLinkButton';
import { ShareMenu, startScreenShare } from './ShareMenu';

interface Props {
  prefs: Prefs;
  setPrefs: SetPrefs;
  panel: Panel;
  setPanel: (p: Panel) => void;
  unread: boolean;
  showStats: boolean;
  toggleStats: () => void;
  onLeave: () => void;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

export function ControlBar({ prefs, setPrefs, panel, setPanel, unread, showStats, toggleStats, onLeave }: Props) {
  const { localParticipant: lp, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState('');

  async function run(action: () => Promise<unknown>, fail: string) {
    try {
      setError('');
      await action();
    } catch (e) {
      // Cancelar o seletor de tela do navegador não é erro.
      if (e instanceof Error && e.name === 'NotAllowedError' && fail.includes('tela')) return;
      setError(fail);
      setTimeout(() => setError(''), 4000);
    }
  }

  const toggleMic = () =>
    run(() => {
      setPrefs({ micOn: !isMicrophoneEnabled });
      return lp.setMicrophoneEnabled(!isMicrophoneEnabled, audioCapture(prefs), audioPublish(prefs));
    }, 'Não deu pra acessar o microfone.');

  const toggleCam = () =>
    run(() => {
      setPrefs({ camOn: !isCameraEnabled });
      return lp.setCameraEnabled(!isCameraEnabled);
    }, 'Não deu pra acessar a câmera.');

  const stopShare = () => run(() => lp.setScreenShareEnabled(false), 'Não deu pra parar a transmissão da tela.');

  const share = () =>
    run(
      () => startScreenShare(lp, screenPreset(prefs.screenPreset), prefs.shareAudio, prefs.videoCodec),
      'Não deu pra transmitir a tela.',
    );

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

  const sharing = lp.getTrackPublication(Track.Source.ScreenShare);

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
                share();
              }}
            />
          )}
        </div>
        <button className="icon-btn leave" onClick={onLeave} title="Sair da call">
          <PhoneOff size={20} />
        </button>
      </div>

      <div className="controls-side right">
        {sharing && <span className="muted small live-tag">AO VIVO · {screenPreset(prefs.screenPreset).label}</span>}
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

      {error && <div className="toast">{error}</div>}
    </footer>
  );
}
