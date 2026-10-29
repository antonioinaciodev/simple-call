import { Check, Link } from 'lucide-react';
import { useState } from 'react';

export function CopyLinkButton({ label = 'Copiar link' }: { label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt('Copie o link da call:', location.href);
    }
  }

  return (
    <button type="button" className="btn ghost small" onClick={copy}>
      {copied ? <Check size={14} /> : <Link size={14} />}
      {copied ? 'Copiado' : label}
    </button>
  );
}
