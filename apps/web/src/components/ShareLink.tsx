import { useState } from 'react';
import { btn } from '../lib/ui';

export default function ShareLink() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copie o link da mesa:', url);
    }
  };

  return (
    <button type="button" onClick={copy} className={btn}>
      {copied ? 'Copiado!' : 'Copiar link'}
    </button>
  );
}
