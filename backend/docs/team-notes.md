# Ekibe iletilecek notlar (backend)

Backend'den ekip arkadaşlarına gidecek notlar. İletilen maddeyi `[x]` yapın; yanıt gelirse altına yazın.
Son güncelleme: 14 Kasım 2026.

## Arayüz (frontend)

- [ ] **Mock sunucu hazır.** `backend/` içinde `uvicorn app.main:app --reload`, ardından http://localhost:8000/docs. Kurulum `backend/README.md`'de.
  - Hazır iş kimlikleri: `mock` (tamamlanmış, 3 kare), `mock-running` (1 kare), `mock-error` (`no_coverage`).
  - `diff`, `spectrum`, `lightcurve` ve `gaia` da sahte veri döndürüyor; grafikler buna karşı yazılabilir.
  - Mock PNG'ler **sentetik**: gerçek Barnard verisi değil, aynı boyut ve ölçekte simülasyon. Gerçek kareler gelince değişecek.
- [ ] **Sözleşmeye eklenen alanlar, onayın gerekiyor:**
  - `grid` (`ra`, `dec`, `scale_arcsec`, `width`, `height`): senin dokümanındaki öneriyle birebir aynı.
  - Her karede `mjd_mean`: dönem şeridini zamana orantılı çizmek için.
  - İş yanıtında `error`: yalnızca `status` `failed` olduğunda dolu, diğer durumlarda `null`.
- [ ] **Kare adresleri göreli** (`/api/frames/mock/0.png`). Başlarına `VITE_API_BASE` eklenmeli.
- [ ] **RW Aurigae ve R Draconis'te `pmra`/`pmdec` değerleri `null`.** Bu alanlar yalnızca `shift_add` modunda kullanılıyor.
- [ ] **Fark modu iş başlatmaz.** URL'deki `mode=diff` için yeni iş açılmamalı; mevcut işin kareleriyle `GET /api/diff?job=&a=&b=` çağrılmalı. Backend'de iş modları yalnızca `epoch` ve `shift_add`.
- [ ] **Hata durum kodları:** `bad_input` 400, `not_found` 404, `no_coverage` 404, `archive_unavailable` 503. Geçersiz istek parametreleri de `bad_input` biçiminde döner.
- [ ] **`resolve` ve `targets` yanıtları** senin önerdiğin biçimde. `resolve` yanıtına `query`, `parallax` alanları eklendi; `source` alanı `coordinates`, `targets` ya da `simbad` değerini alır.

## Görüntü işleme (imaging)

- [ ] **`display_range` dönmeli.** `make_frames` çıktısında (ör. `frames.json`) işin ortak `vmin`, `vmax` ve stretch değerleri (MJy/sr) olmalı; API yanıtında `display_range` olarak gidiyor.
- [ ] **İmza:** backend senin dokümanındaki `make_frames(records, ra, dec, fov_deg, mode, pmra, pmdec, center_epoch, gap_days, scale_arcsec, out_dir)` imzasına göre bağlanacak. Kareler geldikçe haber veren geri çağırma ya da üreteç gerekiyor; hangisi olacağını netleştirelim.
- [ ] **`grid` bilgisi** `frames.json`'da iş başına bir kez olsun; API'de aynen kullanılıyor.
- [ ] **`shift_add`** iki kare döndürüyor (0 sabit toplama, 1 hareketi izleyen toplama); API de böyle sunacak.

## Veri hattı (pipeline)

- [ ] **`data_release` bilgisi:** `get_cutouts` kayıtlarında `collection` ve `version` var, ama v2 tasarımın istediği sürüm/tarih bilgisi yok. Pipeline kodu prova sonrası değişmeyeceği için backend bunu kayıtlardan kendisi türetecek (koleksiyonlar + en son `mjd`). Ek bir şey gerekmiyor, bilgi amaçlı.
- [ ] **Hedef konumları:** backend 5 hedefin konumunu doğrudan `pipeline/targets.json`'dan okuyor. Dosya değişirse haber verin.
- [ ] **Python sürümü:** backend pipeline'ı aynı süreçte çağıracağı için sunucuda Python 3.12 ve `pipeline/requirements.lock.txt` sürümleri kullanılacak.

## Herkes

- [ ] **Barnard's Star için iki farklı 2026 konumu var.** `pipeline/targets.json`: `269.446271, 4.768197`. Tasarım ve arayüz dokümanları: `269.44638, 4.76677`. Önbellek anahtarları eşleşsin diye `targets.json`'daki değerler kullanılmalı.
- [ ] **Kök dosyalar (`README.md`, `.gitignore`, `LICENSE`):** kimin sorumluluğunda olduğu netleşmeli. Backend yalnızca `backend/` klasörüne yazıyor.

## Açık kararlar

- Barındırma servisi (kalıcı disk gerekli)
- İlerleme bildirimi: 2 saniyelik sorgulama mı, SSE mi
- Gaia: backend uç noktası mı, Aladin Lite katmanı mı
- Demo sırasında rastgele koordinatlarla canlı sorgu açık kalacak mı
