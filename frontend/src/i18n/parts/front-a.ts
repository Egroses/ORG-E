// Texts added by the "front-a" work: live-query waiting, name resolving, embed, field size. They are spread after
// the other parts, so a key that exists elsewhere is overridden here on purpose (the old wording was no longer true).

export const en = {
  // ---- live download (a position that is not in the saved set) ----
  'live.notice': 'This position is not in the saved set, so the images are downloaded from the SPHEREx archive. This can take 15 minutes or more. You can keep this page open.',
  'live.barLabel': 'Download progress',
  'live.bar': 'Downloaded {done} of {total} images',
  'live.counting': 'Counting the images to download…',
  'live.failed': '{n} images could not be read so far.',
  'live.elapsed': 'Time so far: {time}',
  'live.detector': 'Detector {n} of {m}',
  // ---- old wording that was no longer true ----
  'gate.wait': 'Saved positions open in a moment. Any other position is downloaded from the SPHEREx archive, which can take 15 minutes or more.',
  'gate.cached': 'Saved targets',
  'r.gateHelp': 'Saved positions (the five practice targets) open at once. Any other position is downloaded from the SPHEREx archive and can take 15 minutes or more. If the download fails you get an error, never demo data.',
  'r.gateLoading': 'Loading all six detectors. A saved position opens in a moment; any other position is downloaded and can take 15 minutes or more.',
  'err.timeout': 'This is taking much longer than expected. Please try again in a little while.',
} as const;

export const tr: Record<keyof typeof en, string> = {
  'live.notice': 'Bu konum kayıtlı konumlar arasında yok; görüntüler SPHEREx arşivinden indiriliyor. Bu 15 dakika ya da daha uzun sürebilir. Sayfayı açık bırakabilirsin.',
  'live.barLabel': 'İndirme ilerlemesi',
  'live.bar': '{total} görüntünün {done} tanesi indirildi',
  'live.counting': 'İndirilecek görüntüler sayılıyor…',
  'live.failed': '{n} görüntü şimdiye kadar okunamadı.',
  'live.elapsed': 'Geçen süre: {time}',
  'live.detector': 'Dedektör {n} / {m}',
  'gate.wait': 'Kayıtlı konumlar hemen açılır. Başka her konum SPHEREx arşivinden indirilir; bu 15 dakika ya da daha uzun sürebilir.',
  'gate.cached': 'Kayıtlı hedefler',
  'r.gateHelp': 'Kayıtlı konumlar (beş alıştırma hedefi) hemen açılır. Başka her konum SPHEREx arşivinden indirilir ve 15 dakika ya da daha uzun sürebilir. İndirme başarısız olursa hata görürsün, asla demo veri görmezsin.',
  'r.gateLoading': 'Altı dedektörün hepsi yükleniyor. Kayıtlı konum hemen açılır; başka konumlar indirilir ve 15 dakika ya da daha uzun sürebilir.',
  'err.timeout': 'Beklenenden çok daha uzun sürüyor. Lütfen biraz sonra yeniden dene.',
};
