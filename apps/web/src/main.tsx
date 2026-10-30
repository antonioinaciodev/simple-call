import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Sem StrictMode de propósito: ele monta os efeitos duas vezes em dev,
// o que conectaria e desconectaria a sinalização da call à toa.
createRoot(document.getElementById('root')!).render(<App />);
