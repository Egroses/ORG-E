// The iframe snippet that the Share menu copies, and a clipboard helper that also works where
// navigator.clipboard is missing (plain http, some embedded browsers).

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** `url` is the full address of the embedded page (it carries embed=1). The & of the query is written as &amp; so the HTML is valid. */
export function iframeSnippet(url: string, title = 'Sky Quest'): string {
  return `<iframe src="${escapeAttr(url)}" width="480" height="540" style="border:0" loading="lazy" title="${escapeAttr(title)}"></iframe>`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through to the old way
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
