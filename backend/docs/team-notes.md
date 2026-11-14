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
- [ ] **Yayın önerisi: arayüz ve backend tek adreste.** `frontend/dist` varsa backend onu `/` adresinde sunuyor, API `/api` altında. Bu durumda `VITE_API_BASE` boş kalabilir (aynı adres). Render derleme betiği `frontend/package.json` bulursa `npm ci && npm run build` çalıştırıyor; derleme çıktısının `frontend/dist` olması yeterli (Vite varsayılanı). Onaylıyor musun?
- [ ] **`/api/resolve` ve `/api/targets` artık gerçek.** Koordinat (derece ya da saat-derece) ve isim kabul ediyor. Beş hedef sabit tablodan anında dönüyor, diğer isimler SIMBAD'a gidiyor (yaklaşık 0,5–1 sn). Öz hareket değerleri SIMBAD'dan alındı; beş hedefin hepsinde `pmra`/`pmdec` dolu, artık `null` yok.
- [ ] **Bilinmeyen isim** `not_found` (404), **SIMBAD'a ulaşılamazsa** `archive_unavailable` (503) döner. Çıplak koordinat girilince `source: "coordinates"` gelir ve `pmra`/`pmdec` `null` olur.
- [ ] **"WISE 0855"** gibi kısa adlar yalnızca beş hedef için çalışıyor (takma ad tablosu). SIMBAD bu cismi `WISEA J085510.74-071442.5` olarak tanıyor.
- [ ] **Fark modu iş başlatmaz.** URL'deki `mode=diff` için yeni iş açılmamalı; mevcut işin kareleriyle `GET /api/diff?job=&a=&b=` çağrılmalı. Backend'de iş modları yalnızca `epoch` ve `shift_add`.
- [ ] **Hata durum kodları:** `bad_input` 400, `not_found` 404, `no_coverage` 404, `archive_unavailable` 503. Geçersiz istek parametreleri de `bad_input` biçiminde döner.
- [ ] **Yeni hata kodu `internal_error` (500)**, kareler üretilirken beklenmeyen bir hata olursa. Arayüzde genel bir mesaj yeterli (ör. `Something went wrong while building the frames. Try again.`).
- [ ] **`POST /api/jobs` artık gerçek.** Mock iş kimlikleri (`mock`, `mock-running`, `mock-error`) aynen çalışmaya devam ediyor.
  - Gerçek iş kimlikleri 12 karakterlik onaltılık dizgi (ör. `3f9a1c0b7d2e`).
  - Önbellekteki iş anında `done` döner. Yeni koordinatta önce `queued`/`running` döner; arşiv araması sürerken (yaklaşık 20 sn) `progress.total` 0 kalır, sonra indirme ilerledikçe `done` artar.
  - Bu sürümde kareler **iş bitince hepsi birden** geliyor, tek tek değil. Arayüzün sorgulama döngüsü bunu zaten karşılıyor.
  - `status: "failed"` olunca nedeni `error` alanında (`no_coverage`, `archive_unavailable`, `internal_error`). `GET` isteği yine 200 döner; hata iş durumunun parçası.
- [ ] **`GET /api/diff?job=&a=&b=`** gerçek işte yalnızca iş `done` olunca çalışır, `a` ve `b` zorunlu (kare sırası). Yanıt PNG; gri sıfır, beyaz sonraki karede beliren, siyah kaybolan.
- [ ] **`resolve` ve `targets` yanıtları** senin önerdiğin biçimde. `resolve` yanıtına `query`, `parallax` alanları eklendi; `source` alanı `coordinates`, `targets` ya da `simbad` değerini alır.

## Görüntü işleme (imaging)

- [ ] **`display_range` dönmeli.** `make_frames` çıktısında (ör. `frames.json`) işin ortak `vmin`, `vmax` ve stretch değerleri (MJy/sr) olmalı; API yanıtında `display_range` olarak gidiyor.
- [ ] **İmza:** backend senin dokümanındaki `make_frames(records, ra, dec, fov_deg, mode, pmra, pmdec, center_epoch, gap_days, scale_arcsec, out_dir)` imzasına göre bağlanacak. Kareler geldikçe haber veren geri çağırma ya da üreteç gerekiyor; hangisi olacağını netleştirelim.
- [ ] **`grid` bilgisi** `frames.json`'da iş başına bir kez olsun; API'de aynen kullanılıyor.
- [ ] **`shift_add`** iki kare döndürüyor (0 sabit toplama, 1 hareketi izleyen toplama); API de böyle sunacak.
- [ ] **Backend'de geçici bir kare üretici var** (`backend/app/frames.py`). Senin dokümanını basitleştirerek izliyor: IMAGE − ZODI, sigma kırpmalı arka plan, maske politikası v1 (doyma koruması dahil), en yakın komşu ile ortak ızgaraya örnekleme, 10 günlük dönemler, medyan toplama, ortak `display_range`, asinh PNG, `np.flipud`. Senin modülün gelince onunla değiştirilecek; demo için yedek olarak kalır. Farklı yaptığım tek şey `reproject` yerine en yakın komşu örnekleme (ek paket gerekmesin diye).
  - Backend'in beklediği çıktı: `frames.json` içinde `grid`, `display_range` (`min`, `max`, `stretch`) ve `frames` (bölüm 5.2'deki alanlar), ayrıca `n.png` ve `stacks.npz`. Senin biçiminle aynı tutarsan değişim tek satır olur.
- [ ] **FLAGS bit adları doğrulandı:** başlıkta `MSKN0000` = `TRANSIENT` … `MSKN0028` = `HALO`; dokümanındaki tabloyla birebir aynı.

## Veri hattı (pipeline)

- [ ] **`data_release` bilgisi:** `get_cutouts` kayıtlarında `collection` ve `version` var, ama v2 tasarımın istediği sürüm/tarih bilgisi yok. Pipeline kodu prova sonrası değişmeyeceği için backend bunu kayıtlardan kendisi türetecek (koleksiyonlar + en son `mjd`). Ek bir şey gerekmiyor, bilgi amaçlı.
- [ ] **Hedef konumları:** backend 5 hedefin konumunu doğrudan `pipeline/targets.json`'dan okuyor. Dosya değişirse haber verin.
- [ ] **Python sürümü:** backend pipeline'ı aynı süreçte çağıracağı için sunucuda Python 3.12 ve `pipeline/requirements.lock.txt` sürümleri kullanılacak.
- [ ] **`get_cutouts` önbellekte olsa da her seferinde arşive SIA sorgusu atıyor** (yaklaşık 18 sn, arşiv kapalıysa hata). Backend bu yüzden `manifest.csv` varsa pipeline'ı çağırmadan doğrudan önbellekten okuyor; dizini bulmak için `pipeline.cutouts._directory` kullanılıyor. Bu fonksiyonun adı ya da önbellek düzeni değişirse haber verin. Kodu değiştirmenizi istemiyorum, bilgi amaçlı.
- [ ] **Sunucudaki önbellek:** beş hedefin `cache/` klasörü sunucuya kopyalandığında backend onları arşive hiç gitmeden açar. Önerilen yol: iki pay birleştirilip `verify --assignment all` ile `PASS` alındıktan sonra `cache/` arşivlenip Render diskine `scp` ile kopyalanır. Kopyalanamazsa sunucu kendisi indirebilir (`python -m scripts.prebuild --download`, tek iş, 3 bağlantı), ama bu arşive ikinci kez yük bindirir.

## Herkes

- [ ] **Barnard's Star için iki farklı 2026 konumu var.** `pipeline/targets.json`: `269.446271, 4.768197`. Tasarım ve arayüz dokümanları: `269.44638, 4.76677`. Önbellek anahtarları eşleşsin diye `targets.json`'daki değerler kullanılmalı.
- [ ] **Kök dosyalar (`README.md`, `.gitignore`, `LICENSE`):** kimin sorumluluğunda olduğu netleşmeli. Backend yalnızca `backend/` klasörüne yazıyor.

- [ ] **Tasarımdan sapma: iş kimliğine veri sürümü girmiyor.** v2 tasarımı kimliğe `data_release` eklenmesini istiyordu. Ama sürüm ancak arşive sorulunca belli oluyor; kimliğe girerse önbellekteki hedefler her hafta yeniden üretilmek zorunda kalır, jüri haftalar sonra bakarsa yavaş açılır. Bunun yerine kimlik yalnızca istek parametrelerinden üretiliyor, kullanılan sürüm yanıtta `data_release` alanında gösteriliyor. Yeni veriyle yenileme ayrı bir komutla yapılacak (henüz yazılmadı).
- [ ] **Ana SIMBAD sunucusu** (`simbad.cds.unistra.fr`) 14 Kasım'da hâlâ 404 veriyor; Harvard yansısı çalışıyor. İsim çözme gerekiyorsa backend'in `/api/resolve` uç noktasını kullanın.

## Açık kararlar

- Barındırma servisi (kalıcı disk gerekli). **Öneri hazır:** https://claude.ai/artifact/3g7vx4vGPhYNmT1NMSCFgJ (Render Starter + 1 GB disk, ayda 7,25 $; hesap ve kart kararı gerekiyor)
- İlerleme bildirimi: 2 saniyelik sorgulama mı, SSE mi
- Gaia: backend uç noktası mı, Aladin Lite katmanı mı
- Demo sırasında rastgele koordinatlarla canlı sorgu açık kalacak mı
