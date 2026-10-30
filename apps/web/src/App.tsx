import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Home } from './components/Home';
import { parseRoomCode } from './lib/api';
import { loadPrefs, savePrefs, type Prefs } from './lib/prefs';

// A parte de chamada (LiveKit) só é baixada quando alguém abre uma call, deixando a tela inicial leve.
const RoomPage = lazy(() => import('./components/RoomPage').then((m) => ({ default: m.RoomPage })));
const P2PPage = lazy(() => import('./p2p/P2PPage').then((m) => ({ default: m.P2PPage })));

export type SetPrefs = (patch: Partial<Prefs>) => void;

export function App() {
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [path, setPath] = useState(() => location.pathname);

  const setPrefs = useCallback<SetPrefs>((patch) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    history.pushState(null, '', to);
    setPath(to);
  }, []);

  // Calls do protótipo P2P ficam em /p2p/abc-defg-hij; as do LiveKit, direto em /abc-defg-hij.
  const p2p = path.startsWith('/p2p/');
  const code = path === '/' ? null : parseRoomCode(path);
  if (!code) return <Home navigate={navigate} />;
  return (
    <Suspense fallback={<div className="center-page muted">Carregando…</div>}>
      {p2p ? (
        <P2PPage key={code} code={code} prefs={prefs} setPrefs={setPrefs} navigate={navigate} />
      ) : (
        <RoomPage key={code} code={code} prefs={prefs} setPrefs={setPrefs} navigate={navigate} />
      )}
    </Suspense>
  );
}
