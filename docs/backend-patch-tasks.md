# Backend: yapılacaklar (`/api/patch`, imaging, sunucu önbelleği)

Bu liste backend sorumlusu içindir. Üç yeni parça var: `imaging/` (hibrit çekirdek + bizim kurallarımız), yeni bir
uç nokta (`GET /api/patch`) ve deep koleksiyonlar. Sözleşme: `docs/patch-api.md`.

**Durum (15 Kasım, `main` 396df1a'ya göre depodan kontrol edildi):** `imaging/` ve `GET /api/patch` `main`'de; arayüz de
bunları kullanıyor. Aşağıdaki her madde depodaki koda/teste bakılarak işaretlendi. `[x]` = depoda doğrulandı,
`[ ]` = yapılmadı ya da doğrulanamadı (maddede "yapılmadı" ya da "doğrulanmadı" yazar). Ayrıntı ve günlük durum:
`backend/docs/devam.md`, `backend/docs/tasks.md`.

## Neden değişiyor
Oyun (Sky Quest) cevap anahtarını **gerçek piksel değerlerinden** hesaplıyor: açıklık fotometrisi, gürültü, bayraklar.
`/api/jobs` PNG kareleri 8 bit ve gerilmiş (stretch) olduğu için bunun için kullanılamaz. Bu yüzden float32 yığınlar
ayrı bir uçtan sunulacak. Mevcut uçlar (`/api/jobs`, `/api/frames`, `/api/diff`, `/api/spectrum`, `/api/lightcurve`,
`/api/gaia`, `/api/resolve`, `/api/targets`) **olduğu gibi kalıyor**.

## Sıra (öncelik sırasıyla)

### 0. Bu gece: sözleşmeyi onayla ya da düzelt
- [x] (sözleşme `main`'de, kod ona göre yazıldı; yazılı bir itiraz depoda yok, onayın kendisi doğrulanmadı) `docs/patch-api.md` dosyasını oku. Parametreler (`ra`, `dec`, `fov`, `dets`, `gap_days`, `max_span_days`), yanıt biçimi
      (202 çalışırken, 200 bitince), yönelim (satır 0 = kuzey, sütun 0 = doğu), `flag_share`, `noise`, `data_release` senin
      işine uyuyor mu? Değiştirmek istediğin her şeyi **kodlamadan önce** yaz; sözleşme arayüz ve imaging ile ortak,
      sessizce değiştirilmemeli.
- [x] (`backend/app/main.py`: `GZipMiddleware(minimum_size=1000)`; testi `test_answer_is_sent_gzipped_when_asked`) Yanıt boyutu: 3 bant × 5 dönem yaklaşık 1,1 MB (base64). `GZipMiddleware` ekle. Gerçek Barnard kareleriyle ölçüldü: yaklaşık **2 kat** küçülür, yani 1,1 MB yanıt ağda yaklaşık 0,55 MB olur (piksel verisi 1,6 kat, bayrak haritası çok daha fazla sıkışır).

### 0b. Karar gerektirenler (proje sahibiyle)
- [x] **Canlı sorgu politikası: karar verildi, öneriden farklı.** 15 Kasım'da canlı sorgu **açık** (`LIVE_QUERIES` varsayılanı `1`)
      ve **tek dedektör sınırı kaldırıldı** (commit `48d4e82`): önbellekte olmayan konumda istenen tüm dedektörler sırayla
      indirilir. Ölçülen canlı çalışma: RA 10, Dec 10, `dets=2,4,6` = 167 dosya, 15,5 dk (`backend/docs/spectrum-api.md`, bölüm 6).
      Eski tahminler (tek dedektör 4–5 dk, `dets=2,4,6` 13 dk, `1..6` 25 dk) ölçülmüş değildi; ölçüm bunları aştı. Proje sahibinin kararı (15 Kasım): yayında da `LIVE_QUERIES=1`; `backend/render.yaml` buna göre `"1"` yapıldı (barındırılan servisin kurulu olduğu doğrulanmadı).
- [x] (`backend/app/patch.py`: `SNAP_ARCSEC = 10.0`; testi `test_snaps_to_a_target_within_10_arcsec`) **Hedefe yakalama (snap).** İstek, önbellekteki beş hedeften birine 10 yay saniyesi içindeyse o hedefin önbelleğiyle
      sunulmalı. `pipeline.cutouts._directory` yalnızca 0,002 yay saniyesi içini tanıyor; 1 yay saniyelik fark önbelleği kaçırır.
      (Arayüz artık `targets.json`'daki tam sayıları gönderiyor, ama yakalama yine de gerekli.)
- [x] (`backend/app/patch.py`: `json.dumps(..., allow_nan=False)`; sözleşme testi `noise is None or > 0` kabul eder) **`noise`:** ölçülemezse `null` dön, hiçbir yerde NaN/Infinity yazma (`JSON.parse` tüm yanıtı reddeder). `imaging.encode_patch`
      bunu zaten yapıyor; kendi `json` çıktında `allow_nan=False` kullan ki bir şey kaçarsa hemen anlaşılsın.
- [x] **`data_release`:** `/api/patch`'te nesne (`collections`, `latest_mjd`), `/api/jobs`'ta metin. Ayrı uçlar, sorun değil; bilinçli bir karar olarak kalsın.

### 1. imaging'i bağla (onaydan sonra)
- [x] (`backend/app/jobs.py` `build_frames`: `imaging.make_frames`, hata ya da eksikte `app/frames.py`'ye dönüş ve günlük; `app/frames.py` duruyor; iş başına `engine.txt`) `backend/app/jobs.py`: `frames.make_frames` yerine `imaging.make_frames` (imza ve çıktılar aynı: `n.png`,
      `stacks.npz`, `frames.json`). İçe aktarma ya da çalışma hatasında **otomatik olarak** `app/frames.py`'ye dön ve günlüğe yaz.
      `app/frames.py` silinmesin; yedek olarak kalır.
- [x] `backend/requirements.txt`: `imaging` yalnızca numpy, astropy ve pillow ister; yeni bağımlılık eklenmemeli. (Bu üç paket listede.
      Sonradan `astroquery==0.4.11` eklendi, ama `imaging` için değil: `pipeline/archive.py` içe aktardığı için, `pipeline/requirements.lock.txt` ile aynı sürüm.)

### 2. `GET /api/patch`
- [x] (`patch_id` ve `PatchManager`, `backend/app/patch.py`) Mevcut iş mekanizmasını kullan: iş kimliği `ra, dec, fov, dets, gap_days, max_span_days` parametrelerinden türesin.
- [x] Her dedektör için kesitleri önbellekten oku (şimdiki `find_cutouts` mantığı: `manifest.csv` varsa arşive gitme),
      `imaging.make_patch(records_by_detector, ...)` çağır, `imaging.encode_patch(patch, job_id)` ile kodla.
      Referans uygulama: `imaging/dev_server.py` (aynı sözleşme, yalnızca standart kütüphane); oradan kopyalayabilirsin.
      (`imaging/` artık `main`'de; birleşme `79ebb33`.)
- [x] (`<BACKEND_DATA_DIR>/patch/<id>.json.gz`, varsayılan `backend/data/patch/`; veri değişince damga ile yeniden üretilir) Sonucu diske yaz (`cache/_backend/patch/<id>.json.gz` gibi): ikinci istek anında dönsün, sunucu yeniden başlayınca
      kaybolmasın.
- [x] Çalışırken **202** ve `progress` (`total`, `done`, `failed`); bitince 200. Hatalar mevcut kodlarla:
      `no_coverage`, `archive_unavailable`, `internal_error` (200 + `status: "failed"`). Canlı indirmede `progress` ayrıca
      `detector_done`, `detector_total`, `eta_s` taşır.
- [x] (imaging bağlı, varsayılan `max_span_days=30`; arayüzün 60/150 ayarı `FRONTEND_EPOCHS` ile önceden üretiliyor) **R Draconis dönemleri:** sürekli gözlendiği için 10 günlük boşluk kuralı tek dev dönem üretiyor. `/api/jobs` (frames.py)
      bu kuralı bilmiyor; imaging bağlanınca `max_span_days=30` ile düzelir. Bağlanmazsa frames.py'ye bir üst süre sınırı ekle.
      Arayüz oyun için ayrıca `gap_days=60 & max_span_days=150` istiyor (R Draconis için dört dönem, üçünde üç bant).
- [x] (`backend/app/patch.py` `PREBUILD_DETS`, `backend/app/prebuild.py`; testi `test_prebuild_uses_the_frontend_epoch_settings`) Açılışta (`PREBUILD_ON_START`) beş hedef için `dets=2,4,6` (oyun) ve `dets=1,2,3,4,5,6` (keşif) yamalarını önceden üret.

### 3. Deep koleksiyonlar
- [x] (`imaging/patch.py`: `COLLECTIONS = ("dr1", "qr3", "dr1_deep", "qr3_deep")`; `backend/docs/team-notes.md` `data_release`'in kayıtlardan türetildiğini söylüyor) `collection` değerleri artık `dr1`, `qr3`, **`dr1_deep`, `qr3_deep`** olabilir (yalnızca R Draconis'te deep var:
      2493 görüntünün 1954'ü). `data_release` türetmen yalnızca `dr1`/`qr3` bekliyorsa düzelt.
- [x] `team-notes.md` içindeki "pipeline kodu prova sonrası değişmeyecek" maddesi eskidi: kod 107875d'de değişti. Güncelle. (Güncellenmiş: `team-notes.md`, `data_release` maddesi.)

### 4. Sunucuya önbellek (Render)
- [x] (bu makinede `cache/` 30 birimle `cache_all.zip`'ten açıldı: `backend/docs/devam.md`) Doğrulanmış birleşik arşiv: **`cache_all.zip`**, 180,1 MB, 3902 FITS + 30 `manifest.csv`, arşive karşı `verify
      --assignment all` ile **PASS**. SHA-256: `688c9330cc9f5962d8d2db06dfb18e9987a34c1bf5ca91a2eedab8b2aa8957e3`.
      Zip içindeki yollar `cache/<hedef>/D<n>/...` ile başlar; depo köküne açılır.
- [ ] **Yapılmadı:** `backend/scripts/render_build.sh` ve `render.yaml` önbelleği indirip açmıyor; depoda açma komutu yok. Bildiğim kadarıyla Render diski yalnızca çalışma anında erişilebilir (derleme sırasında değil): açma işini başlatma
      komutunda (`cache/barnard` yoksa indir ve aç) ya da SSH ile yap. Doğrula.
- [ ] (karar verildi: `LIVE_QUERIES=1`; sunucuda doğrulanmadı) Disk 1 GB: ham veri 507 MB + üretilmiş kareler. Canlı sorgular (`cache/custom/`) alanı doldurur; **canlı sorgu açıkken disk en az 2 GB olmalı** ve eski `custom` klasörleri temizlenmeli (kendiliğinden temizlenmiyor, doğrulanmadı).
- [x] (`backend/app/main.py`: `cached_units`, `*/D[1-6]/manifest.csv` sayısı; yerelde 30) `/api/health`: önbellekte kaç birim olduğunu da döndür (30 olmalı). Sunucuda önbellek eksikse hemen anlaşılır.
- [ ] **Sunucuda doğrulanmadı.** Yerelde (`main`) yapıldı ve 200 döndü (`devam.md`). Açtıktan sonra duman testi: Barnard's Star için `GET /api/patch?ra=269.446271&dec=4.768197&dets=2,4,6` 200 dönmeli.

- [x] **Zip'in adresi (Google Drive).** (adres dosyada; indirme ve SHA-256 eşleşmesi yazıldığında denenmişti, bu güncellemede yeniden denenmedi) Dosya: https://drive.google.com/file/d/1RvhWuJ-oytig0Gnu6GaJfnGroLP0Fmb_/view?usp=sharing
      İndirme (180 MB, onay sayfası olmadan, ~4 sn denendi, SHA-256 eşleşti):
      `curl -L "https://drive.usercontent.google.com/download?id=1RvhWuJ-oytig0Gnu6GaJfnGroLP0Fmb_&export=download&confirm=t" -o cache_all.zip`,
      ardından `sha256sum cache_all.zip` çıktısı yukarıdaki SHA-256 ile **aynı olmalı**; değilse açma. İçeriği güvenilmez veri say:
      boş bir dizine aç, yolları kontrol et (`cache/<hedef>/D<n>/...`).

### 5. Testler
- [x] (`backend/tests/test_patch.py`: `test_barnard_contract_on_real_data` boyut, bayrak haritası ve yönelimi; `test_202_then_200_and_same_id`; `test_no_readable_images_is_no_coverage`. Gerçek veri testi `cache/` yoksa atlanır) Sözleşme testi: base64 çöz, boyutlar `size*size`, `noise > 0`, bayrak haritası uint8; **yönelim**: Barnard D6'da
      yıldız dönemler ilerledikçe **daha küçük satır numarasına** gider (kuzeye doğru); 202 → 200 akışı; `no_coverage`.
- [x] Mevcut testler geçmeye devam etmeli. (Backend sahibinin 15 Kasım kaydı: 83 passed, 3 skipped; ağ testleriyle 86 passed; `spectrum-api.md` bölüm 7. Bu güncellemede yeniden çalıştırılmadı.)

## Yapma
- `pipeline/` içine dokunma: A ve B'nin çıktısı bayt düzeyinde aynı kalmalı.
- Sözleşmeyi arayüz sahibiyle konuşmadan değiştirme.
- (Eski madde, geçerliliği bitti: `imaging/` ve arayüz `main`'de.)

## Zaman
Kod dondurma Pazar 18:00. Sıra: 0 (bu gece, kısa) → 1 ve 2 → 4 (sunucu) → 5 → 3 ve diğerleri. Ben kendi tahminim olarak
1–2'yi 3–4 saat, 4'ü 1 saat görüyorum (ölçülmüş değil).
