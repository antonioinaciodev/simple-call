import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Home } from './components/Home';
import { Landing } from './components/Landing';
import { parseRoomCode } from './lib/api';
import { inApp } from './lib/native';
import { loadPrefs, savePrefs, type Prefs } from './lib/prefs';

// A parte de chamada só é baixada quando alguém abre uma call, deixando a tela inicial leve.
const RoomPage = lazy(() => import('./components/RoomPage').then((m) => ({ default: m.RoomPage })));

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
    const [pathname, hash] = to.split('#');
    history.pushState(null, '', to);
    setPath(pathname);
    // Página nova começa do topo (ou na seção do link).
    if (hash) document.getElementById(hash)?.scrollIntoView();
    else scrollTo(0, 0);
  }, []);

  // Navegador: / é a apresentação e /app é o app. Nos apps instalados a raiz já é o app.
  if (path === '/' && !inApp) return <Landing navigate={navigate} />;
  const code = path === '/' || path === '/app' ? null : parseRoomCode(path);
  if (!code) return <Home navigate={navigate} />;
  return (
    <Suspense fallback={<div className="center-page muted">Carregando…</div>}>
      <RoomPage key={code} code={code} prefs={prefs} setPrefs={setPrefs} navigate={navigate} />
    </Suspense>
  );
}
