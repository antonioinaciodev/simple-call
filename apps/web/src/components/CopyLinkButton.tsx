import { Check, Link } from 'lucide-react';
import { useState } from 'react';

// compact: só o ícone (usado no celular, onde não cabe o texto).
export function CopyLinkButton({ label = 'Copiar link', onCopy, compact }: { label?: string; onCopy?: () => void; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Copie o link da call:', location.href);
    }
  }

  if (compact) {
    return (
      <button type="button" className="icon-btn small copy-compact" onClick={copy} title={copied ? 'Link copiado' : label} aria-label={label}>
        {copied ? <Check size={18} /> : <Link size={18} />}
      </button>
    );
  }
  return (
    <button type="button" className="btn ghost small" onClick={copy}>
      {copied ? <Check size={14} /> : <Link size={14} />}
      {copied ? 'Copiado' : label}
    </button>
  );
}
