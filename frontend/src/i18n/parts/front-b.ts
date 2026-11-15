// Static fallback notice (saved copies of the five practice targets, see data/staticProvider.ts).
// English is the source; Turkish must have the same keys.

export const en = {
  'saved.copy': 'Showing a saved copy from {date} (live service unavailable)',
  'demo.banner': 'DEMO DATA (developer switch ?data=mock): not real SPHEREx images',
} as const;

export const tr: Record<keyof typeof en, string> = {
  'saved.copy': '{date} tarihli kayıtlı kopya gösteriliyor (canlı hizmet kullanılamıyor)',
  'demo.banner': 'DEMO VERİ (geliştirici anahtarı ?data=mock): gerçek SPHEREx görüntüleri değil',
};
