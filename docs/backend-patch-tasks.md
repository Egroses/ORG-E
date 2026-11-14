# Backend: yapılacaklar (`/api/patch`, imaging, sunucu önbelleği)

Bu liste backend sorumlusu içindir. Üç yeni parça var: `imaging/` (Yusuf'un çekirdeği + bizim kurallarımız), yeni bir
uç nokta (`GET /api/patch`) ve deep koleksiyonlar. Sözleşme: `docs/patch-api.md`.

## Neden değişiyor
Oyun (Sky Quest) cevap anahtarını **gerçek piksel değerlerinden** hesaplıyor: açıklık fotometrisi, gürültü, bayraklar.
`/api/jobs` PNG kareleri 8 bit ve gerilmiş (stretch) olduğu için bunun için kullanılamaz. Bu yüzden float32 yığınlar
ayrı bir uçtan sunulacak. Mevcut uçlar (`/api/jobs`, `/api/frames`, `/api/diff`, `/api/spectrum`, `/api/lightcurve`,
`/api/gaia`, `/api/resolve`, `/api/targets`) **olduğu gibi kalıyor**.

## Sıra (öncelik sırasıyla)

### 0. Bu gece: sözleşmeyi onayla ya da düzelt
- [ ] `docs/patch-api.md` dosyasını oku. Parametreler (`ra`, `dec`, `fov`, `dets`, `gap_days`, `max_span_days`), yanıt biçimi
      (202 çalışırken, 200 bitince), yönelim (satır 0 = kuzey, sütun 0 = doğu), `flag_share`, `noise`, `data_release` senin
      işine uyuyor mu? Değiştirmek istediğin her şeyi **kodlamadan önce** yaz; sözleşme arayüz ve imaging ile ortak,
      sessizce değiştirilmemeli.
- [ ] Yanıt boyutu: 3 bant × 5 dönem yaklaşık 1,1 MB (base64). `GZipMiddleware` ekle. Gerçek Barnard kareleriyle ölçüldü: yaklaşık **2 kat** küçülür, yani 1,1 MB yanıt ağda yaklaşık 0,55 MB olur (piksel verisi 1,6 kat, bayrak haritası çok daha fazla sıkışır).

### 0b. Karar gerektirenler (proje sahibiyle)
- [ ] **Canlı sorgu politikası.** Yeni bir koordinat için tek dedektör yaklaşık 4–5 dk sürüyor (senin tahminin; bizde ölçülmedi),
      `dets=2,4,6` yaklaşık 13 dk, keşif modunda `1..6` yaklaşık 25 dk. Öneri: **demo için `LIVE_QUERIES=0`**. Açıksa canlı
      sorguda en fazla **tek dedektör** kabul et, fazlasında `400 bad_input` ve anlaşılır mesaj dön (sözleşmede yazıyor).
- [ ] **Hedefe yakalama (snap).** İstek, önbellekteki beş hedeften birine 10 yay saniyesi içindeyse o hedefin önbelleğiyle
      sunulmalı. `pipeline.cutouts._directory` yalnızca 0,002 yay saniyesi içini tanıyor; 1 yay saniyelik fark önbelleği kaçırır.
      (Arayüz artık `targets.json`'daki tam sayıları gönderiyor, ama yakalama yine de gerekli.)
- [ ] **`noise`:** ölçülemezse `null` dön, hiçbir yerde NaN/Infinity yazma (`JSON.parse` tüm yanıtı reddeder). `imaging.encode_patch`
      bunu zaten yapıyor; kendi `json` çıktında `allow_nan=False` kullan ki bir şey kaçarsa hemen anlaşılsın.
- [ ] **`data_release`:** `/api/patch`'te nesne (`collections`, `latest_mjd`), `/api/jobs`'ta metin. Ayrı uçlar, sorun değil; bilinçli bir karar olarak kalsın.

### 1. imaging'i bağla (onaydan sonra)
- [ ] `backend/app/jobs.py`: `frames.make_frames` yerine `imaging.make_frames` (imza ve çıktılar aynı: `n.png`,
      `stacks.npz`, `frames.json`). İçe aktarma ya da çalışma hatasında **otomatik olarak** `app/frames.py`'ye dön ve günlüğe yaz.
      `app/frames.py` silinmesin; yedek olarak kalır.
- [ ] `backend/requirements.txt`: `imaging` yalnızca numpy, astropy ve pillow ister; yeni bağımlılık eklenmemeli.

### 2. `GET /api/patch`
- [ ] Mevcut iş mekanizmasını kullan: iş kimliği `ra, dec, fov, dets, gap_days, max_span_days` parametrelerinden türesin.
- [ ] Her dedektör için kesitleri önbellekten oku (şimdiki `find_cutouts` mantığı: `manifest.csv` varsa arşive gitme),
      `imaging.make_patch(records_by_detector, ...)` çağır, `imaging.encode_patch(patch, job_id)` ile kodla.
      Referans uygulama: `imaging/dev_server.py` (aynı sözleşme, yalnızca standart kütüphane); oradan kopyalayabilirsin.
      **Not: `imaging/` henüz `main`'de yok**, ayrı bir dalda yazılıyor; onaylanıp birleştirilince haber verilecek.
- [ ] Sonucu diske yaz (`cache/_backend/patch/<id>.json.gz` gibi): ikinci istek anında dönsün, sunucu yeniden başlayınca
      kaybolmasın.
- [ ] Çalışırken **202** ve `progress` (`total`, `done`, `failed`); bitince 200. Hatalar mevcut kodlarla:
      `no_coverage`, `archive_unavailable`, `internal_error` (200 + `status: "failed"`).
- [ ] **R Draconis dönemleri:** sürekli gözlendiği için 10 günlük boşluk kuralı tek dev dönem üretiyor. `/api/jobs` (frames.py)
      bu kuralı bilmiyor; imaging bağlanınca `max_span_days=30` ile düzelir. Bağlanmazsa frames.py'ye bir üst süre sınırı ekle.
      Arayüz oyun için ayrıca `gap_days=60 & max_span_days=150` istiyor (R Draconis için dört dönem, üçünde üç bant).
- [ ] Açılışta (`PREBUILD_ON_START`) beş hedef için `dets=2,4,6` (oyun) ve `dets=1,2,3,4,5,6` (keşif) yamalarını önceden üret.

### 3. Deep koleksiyonlar
- [ ] `collection` değerleri artık `dr1`, `qr3`, **`dr1_deep`, `qr3_deep`** olabilir (yalnızca R Draconis'te deep var:
      2493 görüntünün 1954'ü). `data_release` türetmen yalnızca `dr1`/`qr3` bekliyorsa düzelt.
- [ ] `team-notes.md` içindeki "pipeline kodu prova sonrası değişmeyecek" maddesi eskidi: kod 107875d'de değişti. Güncelle.

### 4. Sunucuya önbellek (Render)
- [ ] Doğrulanmış birleşik arşiv: **`cache_all.zip`**, 180,1 MB, 3902 FITS + 30 `manifest.csv`, arşive karşı `verify
      --assignment all` ile **PASS**. SHA-256: `688c9330cc9f5962d8d2db06dfb18e9987a34c1bf5ca91a2eedab8b2aa8957e3`.
      Zip içindeki yollar `cache/<hedef>/D<n>/...` ile başlar; depo köküne açılır.
- [ ] Bildiğim kadarıyla Render diski yalnızca çalışma anında erişilebilir (derleme sırasında değil): açma işini başlatma
      komutunda (`cache/barnard` yoksa indir ve aç) ya da SSH ile yap. Doğrula.
- [ ] Disk 1 GB: ham veri 507 MB + üretilmiş kareler. Canlı sorgular (`cache/custom/`) alanı doldurabilir; **demo için
      `LIVE_QUERIES=0`** öneriyorum (karar proje sahibinde).
- [ ] `/api/health`: önbellekte kaç birim olduğunu da döndür (30 olmalı). Sunucuda önbellek eksikse hemen anlaşılır.
- [ ] Açtıktan sonra duman testi: Barnard's Star için `GET /api/patch?ra=269.446271&dec=4.768197&dets=2,4,6` 200 dönmeli.

- [x] **Zip'in adresi (Google Drive).** Dosya: https://drive.google.com/file/d/1RvhWuJ-oytig0Gnu6GaJfnGroLP0Fmb_/view?usp=sharing
      İndirme (180 MB, onay sayfası olmadan, ~4 sn denendi, SHA-256 eşleşti):
      `curl -L "https://drive.usercontent.google.com/download?id=1RvhWuJ-oytig0Gnu6GaJfnGroLP0Fmb_&export=download&confirm=t" -o cache_all.zip`,
      ardından `sha256sum cache_all.zip` çıktısı yukarıdaki SHA-256 ile **aynı olmalı**; değilse açma. İçeriği güvenilmez veri say:
      boş bir dizine aç, yolları kontrol et (`cache/<hedef>/D<n>/...`).

### 5. Testler
- [ ] Sözleşme testi: base64 çöz, boyutlar `size*size`, `noise > 0`, bayrak haritası uint8; **yönelim**: Barnard D6'da
      yıldız dönemler ilerledikçe **daha küçük satır numarasına** gider (kuzeye doğru); 202 → 200 akışı; `no_coverage`.
- [ ] Mevcut testler geçmeye devam etmeli.

## Yapma
- `pipeline/` içine dokunma: A ve B'nin çıktısı bayt düzeyinde aynı kalmalı.
- Sözleşmeyi arayüz sahibiyle konuşmadan değiştirme.
- `imaging/` ve arayüz dalı onaylanıp birleştirilmeden bunları `main`'e bağlama.

## Zaman
Kod dondurma Pazar 18:00. Sıra: 0 (bu gece, kısa) → 1 ve 2 → 4 (sunucu) → 5 → 3 ve diğerleri. Ben kendi tahminim olarak
1–2'yi 3–4 saat, 4'ü 1 saat görüyorum (ölçülmüş değil).
