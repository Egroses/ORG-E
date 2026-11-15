# Backend: spektrum, katalog ve sağlamlık görevleri (15 Kasım)

Bu liste backend sorumlusu içindir. Arayüz tarafı ayrı yürüyor; bu belge yalnızca **backend'in yapması gerekenleri** ve arayüzün
bunlardan beklediği yanıt biçimlerini anlatır. Mevcut uç noktalar (`/api/patch`, `/api/spectrum`, `/api/lightcurve`, `/api/gaia`,
`/api/targets`, `/api/resolve`) **bozulmamalı**: aşağıdaki her değişiklik yalnızca *ekleme* olmalı (yeni alan, yeni uç ya da
isteğe bağlı parametre). Sözleşme: `docs/patch-api.md`.

Kapsam dışı (karar verildi): S3'ten bayt aralığı okuma, `/api/quality`, zodyak katmanı, `/api/epochs`, yayın (Render) ve teslim
hazırlığı. Süre: kod dondurma Pazar 15 Kasım 18:00.

## Neden bu işler
Challenge (`backend/docs/challenge.md`) isteğe bağlı olarak şunları öneriyor:
- *"Extra kudos if the tool can generate spectra on the fly"* → 102 kanallı spektrum.
- *"Overlay data from other telescopes, e.g. Gaia or WISE"* → Gaia var, WISE yok → CatWISE2020.
- *"Display metadata, like contamination flags"* → bayraklar `/api/patch`'te var; spektrumda bayrak politikası bozuk (aşağıda).

## Sıra (öncelik sırasıyla)

### 1. `astroquery` bağımlılığı (5 dakika)
- [ ] `backend/requirements.txt` dosyasına `astroquery==0.4.11` ekle (sürüm `pipeline/requirements.lock.txt`'ten).
- Neden: `pipeline/archive.py` modül başında `from astroquery.ipac.irsa import Irsa` yapıyor. Listede yoksa temiz bir kurulumda
  `/api/patch` `internal_error` ("ModuleNotFoundError: astroquery") döner. Yerelde bir venv'de bire bir yeniden üretildi.
- Doğrulama: yeni bir sanal ortamda `pip install -r backend/requirements.txt`, sonra `GET /api/patch?ra=269.446271&dec=4.768197&dets=2,4,6` 200 dönmeli.

### 2. Spektrumda bayrak politikası (ölçüm yapıldı, nedeni belli)
**Gözlem.** `/api/spectrum` Barnard's Star için 358 nokta döndürüyor ve **358'inin tamamı `flagged: true`**.

**Neden (15 Kasım'da yerel önbellekte ölçüldü; `backend/app/photometry.py`).** `_load()` satır 94 doyma bitlerini de kötü maskeye
katıyor (`mask = BAD_BITS | SATURATION_BITS`) ve `measure()` satır 130'da `flagged = bad[aperture].any() or not finite.all()`
diyor. Barnard'ın 2 piksellik açıklığındaki (13 piksel) 358 kesit için sayımlar:

| Açıklıkta ne var | Kesit sayısı (358 içinde) |
| --- | --- |
| `OVERFLOW` biti | 357 |
| `BLOOM` biti | 353 |
| `TRANSIENT` biti | 352 |
| `SUR_ERROR` biti | 349 |
| IMAGE'da NaN piksel (medyan 3 piksel / 13) | 237 |
| `NONFUNC` | 21 |
| `PERSIST` | 16 |
| `HOT` | 5 |
| `COLD` | 2 |

Yalnızca doyma bitleri yüzünden bayraklanan kesit sayısı **5**. Yani sorun yalnızca "doyma bitleri kötü sayılıyor" değil:
- Doyma bitleri (OVERFLOW, BLOOM, SUR_ERROR) neredeyse her kesitte yanıyor (yıldız parlak ve doyuyor).
- `TRANSIENT` biti (`BAD_BITS` içinde) 352 kesitte yanıyor. **Bu bitin SPHEREx'te tam olarak ne anlama geldiğini doğrulamadık**
  (öz hareketi yüksek, parlak bir yıldızın kendi pozlarından "geçici" sayılması olabilir; bu bir tahmin). SPHEREx FLAGS
  tanımını (IRSA / SPHEREx Explanatory Supplement) okuyup yazın.
- IMAGE'da NaN pikseller var (237 kesit). `measure()` toplamı yalnızca sonlu piksellerle alıyor
  (`np.sum(values[finite] - background)`), yani **NaN pikseller atlanınca akı olduğundan düşük çıkar** (bilimsel olarak önemli).

**Yapılacak (öneri; bit bazında karar sizde):**
- [ ] SPHEREx FLAGS bit tanımlarını belgeden doğrulayıp `docs/` ya da `backend/docs/spherex-data.md` içine yaz (özellikle
      `TRANSIENT`).
- [ ] Mevcut `/api/spectrum` ve `/api/lightcurve` yanıtına **yeni alanlar ekle** (eski alanlar kalır, `flagged` bugünkü anlamıyla
      uyumluluk için durur):
      `saturated` (bool, açıklıkta OVERFLOW/SUR_ERROR/BLOOM var), `masked_px` (int, açıklıktaki NaN piksel sayısı),
      `flag_names` (liste, açıklıkta yanan bit adları, örn. `["TRANSIENT","OVERFLOW"]`), `lower_limit` (bool, doymuş ya da
      NaN pikselli açıklıklarda akı gerçekte daha yüksek olabilir).
- [ ] Politika önerisi (aynı fikir `docs/patch-api.md` kural 9 ve `docs/wdd-goruntu-isleme.md` bölüm 3 kural 6'da var: doymuş
      yıldız çekirdeği değerleriyle tutulur, yalnızca işaretlenir):
      - doyma bitleri → değer tutulur, `saturated: true`, `lower_limit: true`;
      - NaN pikselli açıklık → değer tutulur ama `lower_limit: true` (ya da NaN pikselleri komşu medyanla doldurmayı değerlendir);
      - sert bozuk bitler (`NONFUNC`, `HOT`, `COLD`, `PERSIST`, `OUTLIER`, `STREAK`, `SNOWBALL`, `MISSING_DATA`, `PHANMISS`) →
        `flagged: true`; 102 kanallı spektrumda bu pozlar medyana **katılmaz** ve `n_skipped`'e sayılır;
      - `TRANSIENT`: tanımı doğrulanana kadar `flag_names`'te göster ama pozu **sessizce atma**.
- [ ] Barnard dışındaki dört hedefte de aynı sayımı çalıştır ve sonuçları bu belgeye ya da `backend/docs/`'a yaz.
- Doğrulama: Barnard'da `flagged:false` ve `lower_limit:true` oranları anlamlı bir dağılım göstermeli; hepsi aynı değer olmamalı.

### 3. 102 kanallı spektrum: `GET /api/spectrum?...&mode=102`
Mevcut uca `mode` ve `aperture` parametreleri eklenir. **`mode` yoksa bugünkü yanıt aynen döner** (poz başına bir nokta),
arayüz hiçbir değişiklik olmadan çalışmaya devam eder. Yalnızca `mode=102` verilince yeni biçim döner.

İstek: `GET /api/spectrum?ra=&dec=&aperture=2&mode=102`
- `aperture`: açıklık yarıçapı, yerel piksel (6,15″) cinsinden, `1`–`3`, varsayılan `2`. Aralık dışı: `400 bad_input`.
- `mode=102` için `ra`/`dec` önbellekteki beş hedeften birinin 10″ içinde olmalı (ya da bugünkü kapsam kuralı geçerli;
  kapsamayan konumda `400 bad_input` ve açık mesaj).

Yanıt (öneri):
```jsonc
{
  "center": {"ra": 269.446271, "dec": 4.768197},
  "aperture_px": 2,
  "unit": "mJy",
  "channels": [
    {"detector": 1, "index": 0, "wavelength_um": 0.75,
     "flux_mjy": 1766.4, "err_mjy": 7.5,          // null olabilir, NaN/Infinity ASLA yazma
     "n_exposures": 4, "n_skipped": 1,
     "saturated": true, "lower_limit": true}
    // ... toplam 102 giriş: 6 dedektör x 17 kanal
  ],
  "warnings": []                                    // düz dilli metinler
}
```
Yöntem (fikir: dedektör başına sabit dalga boyu ızgarası; kanal sınırlarını nominal aralıktan kendin üret):
- [ ] Dedektör başına 17 sabit dalga boyu kanalı (6 x 17 = 102). Kanal sınırları dedektörün nominal dalga boyu aralığından
      eşit bölünür (nominal ve yaklaşık, belgede söyle).
- [ ] Her poz için hedef konumunda açıklık fotometrisi: mevcut `measure()` mantığı, yarıçap `aperture`, 4–7 piksel halkasından
      arka plan çıkar. Hedef konumu öz hareketle pozun tarihine taşınır (`position_at` zaten var).
- [ ] Her ölçüm kendi dalga boyuna göre bir kanala konur, **kanal başına medyan** alınır (hata için kanaldaki hataların
      kareler toplamının karekökü / N ya da medyanın hatası; hangisini seçtiğini belgede yaz).
- [ ] Madde 2'deki sert bozuk bit kuralı: bozuk açıklıklı pozlar medyana girmez, `n_skipped` artar.
- [ ] Hiçbir kanalda kullanılabilir poz yoksa `flux_mjy: null, err_mjy: null` döndür.
- [ ] Kaya'nın yeni bellek içi kesit önbelleği (`_load` ve `lru_cache`) kullanılır, yanıt 1 sn civarında olmalı. Açıklık
      değiştiğinde `measure()`'ın `lru_cache` anahtarına `aperture` girmeli (yoksa farklı açıklıklar aynı sonucu döndürür).
- Doğrulama: WISE 0855 (soğuk, sönük) ve R Draconis (parlak, değişen) için spektrum şekli makul mü (WISE 0855 için kısa
  dalga boylarında akı çok düşük, 4,5 µm civarında belirgin)? Üç açıklık değeri üç farklı akı vermeli ve açıklık büyüdükçe
  akı yaklaşık artmalı. Sonuçları belgeye yaz.

### 4. CatWISE2020 uç noktası (yeni): `GET /api/catwise?ra=&dec=&radius=`
Neden ayrı uç: Gaia ve CatWISE farklı arşivlerden farklı sütunlarla geliyor; `/api/gaia`'ya dokunmamak için.
- `radius`: derece, varsayılan `0.075`, en fazla `0.25`.
- Kaynak: IRSA TAP, tablo `catwise_2020`. Sütunlar: ad, `ra`, `dec`, `w1mpro`, `w2mpro`, `pmra`, `pmdec`,
  `sigpmra`, `sigpmdec` (gerçek sütun adlarını TAP şemasından doğrula).
- [ ] Konumları öz hareketle epoch 2026.0'a taşı (`gaia.propagate` mantığı; CatWISE konum epoch'u 2015.4 civarı, belgeden doğrula).
- [ ] `lru_cache`, zaman aşımı, hata olursa `ApiError("archive_unavailable")`. Beş hedef için Gaia'daki gibi depoya bir
      yedek CSV koymayı değerlendir (IRSA çoğu zaman yavaş ya da 502 veriyor; ESA bugün kapalıydı).
- Yanıt: `[{"name","ra","dec","w1","w2","pmra","pmdec","pm_snr"}]`, bilinmeyen alanlar `null`, NaN yok.
  `pm_snr = hypot(pmra/sigpmra, pmdec/sigpmdec)`.
- Doğrulama: WISE 0855'in konumunda (RA 133.759871, Dec −7.242252) CatWISE'te bir kaynak ve yüksek `pm_snr` beklenir
  (soğuk bir kahverengi cüce, optikte sönük olduğundan Gaia'da bulunmaması beklenir; bu bir beklenti, ölçülmedi; değer
  buysa arayüzde WISE bindirmesinin anlamı budur).

### 5. Gaia'ya `pm_snr`
- [ ] `/api/gaia` sorgusuna `pmra_error` ve `pmdec_error` ekle, her kaynağa `pm_snr` alanı ekle. **Mevcut alanları silme**
      (`source_id`, `ra`, `dec`, `gmag`, `pmra`, `pmdec`).
- [ ] Kaya'nın depodaki `backend/app/gaia_fields/*.csv` dosyaları bu sütunları içermiyor; `backend/scripts/gaia_fields.py` ile
      yeniden üret (ESA kapalıysa GAVO yansısıyla) ve yeniden üretilemezse `pm_snr: null` döndür (boşluk, NaN değil).

### 6. Canlı sorgu için arayüzün ihtiyacı (küçük)
Kaya'nın son commit'i canlı sorguyu açtı (RA 10, Dec 10, `dets=2,4,6`: 167 dosya, 15,5 dk). Arayüz bu beklemeyi göstermeli.
- [ ] 202 yanıtında `progress` (`total`, `done`, `failed`) sürekli artmalı. Bunu doğrula.
- [ ] Yalnızca alan ekleyerek `progress`'e isteğe bağlı `detector_done` ve `detector_total` (örn. 1/3) ya da `eta_s` ekle.
- [ ] Çok uzun işler için sunucu yeniden başlarsa iş yarım kalıyor mu? Yarım kalan indirmenin devam ettiğini doğrula.

### 7. Sağlamlık
- [ ] `python -m pytest -q -rs` ile atlanan testlerin **nedenini** oku (şu an 7 atlanıyor); nedenlerini bu belgeye yaz.
- [ ] `backend/scripts/refresh.py` betiğini (yeni veriyi çekme) geçici bir veri dizininde ve küçük bir hedefle dene;
      ne yaptığını ve nasıl çalıştığını `backend/README.md`'ye 3 satırla yaz.
- [ ] Yukarıdaki yeni yanıt biçimleri için `docs/spectrum-api.md` yaz (gerçek önbellek verisinden örnek yanıtlarla):
      arayüz bu belgeye göre geliştirilecek. **Bu belgeyi madde 2'nin ardından hemen yaz**, kodun bitmesini bekleme.
- [ ] Her yeni uç için ağ çağrıları taklit edilmiş (mock) testler; gerçek ağ testleri `NETWORK_TESTS=1` altında.

## Arayüzün backend'den beklentileri (değişiklik gerektirmeyenler)
- **Statik yedek:** arayüz `/api/patch` ve `/api/gaia` yanıtlarını olduğu gibi dışa aktaracak. Biçim değişirse yedek bozulur,
  o yüzden bu iki uçta yalnızca alan ekle.
- **Aladin, gömme (`embed=1`), WiseView tarzı ayarlar, FOV kontrolü:** yalnızca arayüz.

## Yapma
- `pipeline/` içine dokunma.
- Mevcut yanıt alanlarının adını, türünü ya da anlamını sessizce değiştirme.
- JSON'da NaN/Infinity yazma (`JSON.parse` yanıtın tamamını reddeder).
- Sözleşme değişikliğini arayüzle konuşmadan yapma.

## Önerilen sıra
1 → 2 → 3 → 5 → 4 → 6 → 7. Tahmin (ölçülmüş değil): 1 beş dakika, 2 bir saat, 3 bir buçuk saat, 4 ve 5 birer saat, 6 ve 7 yarım saat.
