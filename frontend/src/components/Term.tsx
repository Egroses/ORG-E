import type { ReactNode } from 'react';
import { termPlain } from '../data/glossary';
import { useI18n } from '../i18n/react';

/** A technical word with its plain-language meaning on hover, focus or long-press (title). */
export function Term({ k, children }: { k: string; children?: ReactNode }) {
  useI18n();
  const plain = termPlain(k);
  return (
    <abbr className="term" title={plain} tabIndex={0}>
      {children ?? k}
    </abbr>
  );
}

/** Text with glossary words marked as `<t:Band>bands</t>`: each marked word becomes a <Term>. */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /<t:([\w ]+)>(.*?)<\/t>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<Term key={m.index} k={m[1]}>{m[2]}</Term>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
