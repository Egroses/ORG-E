# Arayüz: İş Tasarım Dokümanı

14 Kasım 2026 · NASA Space Apps 2026, "Planet X and SPHEREx" · Teslim: 15 Kasım 2026 Pazar 23:59

Arayüz sorumlusu, astronomi bilmeyen birinin bir gökyüzü konumu girip SPHEREx görüntülerinin zaman içinde nasıl değiştiğini izleyebileceği web sayfasını yapar. Jüri projeyi bu ekrandan görecektir. Bu doküman tek başına yeterli olacak şekilde yazıldı: bir ekip üyesi ya da bir yapay zekâ aracı yalnızca bunu okuyarak arayüzü yazabilmelidir.

## 1. Sözlük

| Terim | Anlamı |
|---|---|
| RA, Dec | Gökyüzü koordinatları: sağ açıklık (boylam benzeri) ve dik açıklık (enlem benzeri), derece |
| FOV | Görüş alanı: karenin gökyüzünde kapladığı kenar uzunluğu, derece |
| Kare (frame) | Bir gözlem dönemindeki pozların toplanmasıyla oluşan tek görüntü |
| Dönem | Aynı bölgenin art arda gözlendiği zaman kümesi |
| Dedektör | SPHEREx'in 6 dedektöründen biri (D1–D6); her biri ayrı bir kızılötesi dalga boyu aralığı |
| İş (job) | Bir koordinat için kare üretim isteği; arka planda çalışır, durumu sorgulanır |
| Öz hareket | Bir cismin gökyüzündeki yıllık kayması; mas/yıl |
| Kaydır ve topla | Verilen öz harekete göre kareleri kaydırıp toplayan mod; sönük hızlı cisimleri biraz daha net gösterir (WISE 0855'te sabit toplama zaten yaklaşık 7,6σ, kaydır-topla yaklaşık 8,0σ verir) |
| Fark görüntüsü | İki dönemin birbirinden çıkarılmış hali; değişen şeyler kalır |

## 2. Kapsam

**Bu rolün işleri**

- Arama, oynatıcı, kontroller, ilerleme ve hata ekranları.
- Sayfa durumunun adreste tutulması ve gömme modu.
- Hedef artısı, ölçek çubuğu, yön göstergesi ve Gaia işaretçileri.
- Spektrum ve parlaklık grafikleri, bağlam haritası.
- Arayüzün yayını ve proje sayfası için ekran görüntüleri.

**Bu rolün işi olmayanlar**

- Görüntülerin üretilmesi (görüntü işleme) ve indirilmesi (veri hattı).
- API'nin kendisi (servis ve analiz).

## 3. Zorunlu kurallar

1. **Arayüzdeki tüm metinler İngilizcedir.** Hackathon kuralı: form ve bağlantı verilen her şey İngilizce olmalı.
2. **Sayfa durumunun tek kaynağı adrestir.** Aynı adres her zaman aynı görünümü açar.
3. **Arayüz yalnızca servis API'siyle konuşur.** Arşive, SIMBAD'a ya da Gaia'ya doğrudan istek atmaz. Tek istisna bağlam haritasındaki Aladin Lite'tır.
4. **Görüntü yumuşatılmaz.** Kareler küçüktür ve büyütülerek gösterilir; pikseller keskin kalmalıdır.
5. **Animasyon başa döndüğünde belli olmalıdır.** Yoksa son kareden ilk kareye sıçrama gerçek hareket sanılır.
6. **Uzun bekleme açıkça gösterilir.** Yeni bir koordinat yaklaşık 2 dakika sürebilir; kullanıcı ne olduğunu ve ne kadar kaldığını görmelidir.
7. **NASA logosu ve görev amblemleri kullanılmaz.** Veri kaynağı yazıyla belirtilir.

## 4. Teknoloji

| Konu | Seçim | Not |
|---|---|---|
| Çatı | React, Vite ile | TypeScript isteğe bağlı |
| Durum | React'in kendi durumu ve adres parametreleri | Ayrı durum kütüphanesi gerekmez |
| İstekler | `fetch` | API adresi `VITE_API_BASE` ortam değişkeninden |
| Grafikler | Plotly (`plotly.js-basic-dist-min`) | Hata çubukları ve yakınlaştırma hazır gelir |
| Bağlam haritası | Aladin Lite v3 | CDS'in gökyüzü haritası bileşeni; challenge'ın önerdiği araç |
| Stil | Sade CSS ya da Tailwind | Koyu tema |

Aladin Lite'ın çağrı adları bu dokümanda bellekten yazıldı; kullanmadan önce kendi belgelerinden doğrulayın.

## 5. Sayfa yapısı

```
+--------------------------------------------------------------------+
| Başlık        [ arama kutusu: koordinat ya da isim ]   [Search]    |
| [Barnard's Star] [Epsilon Indi B] [WISE 0855] [RW Aurigae] [R Dra] |
+-----------------------------------+--------------------------------+
|                                   | Mode:  (Epochs)(Shift & add)   |
|                                   |        (Difference)            |
|          OYNATICI                 | Detector: D1 D2 D3 D4 D5 D6    |
|      (kare görüntüsü,             | Field of view: [ 0.1 deg ]     |
|       artı, ölçek çubuğu,         | Speed, Brightness, Contrast    |
|       N/E göstergesi)             | [ ] Invert  [ ] Gaia overlay   |
|                                   +--------------------------------+
|                                   | Kare bilgisi:                  |
| [<] [Play] [>]  kare 3 / 7        | tarih, dedektör, dalga boyu,   |
| o--o--O--o--o--o--o  (dönemler)   | poz sayısı, bayraklı oran      |
+-----------------------------------+--------------------------------+
| Sekmeler: [Spectrum] [Light curve] [Sky context]                   |
+--------------------------------------------------------------------+
| [Copy link] [Embed code]     Veri kaynağı ve teşekkür metni        |
+--------------------------------------------------------------------+
```

Dar ekranda (telefon) sağ sütun oynatıcının altına iner; hazır hedef düğmeleri yatay kaydırılır.

## 6. Adres parametreleri

| Parametre | Örnek | Varsayılan | Açıklama |
|---|---|---|---|
| `q` | `Barnard's Star` | yok | İsim ya da koordinat metni; verilirse önce çözülür |
| `ra`, `dec` | `269.44638`, `4.76677` | yok | Derece; `q` yoksa doğrudan kullanılır |
| `fov` | `0.1` | `0.1` | Derece; 0,05 ile 0,5 arası |
| `det` | `6` | `6` | Dedektör, 1–6 |
| `mode` | `epoch` | `epoch` | `epoch`, `shift_add`, `diff` |
| `pmra`, `pmdec` | `-8124`, `673` | yok | mas/yıl; `shift_add` için gerekli |
| `a`, `b` | `0`, `6` | ilk, son | Fark modunda karşılaştırılan kareler |
| `speed` | `500` | `500` | Kare süresi, milisaniye |
| `invert` | `1` | `0` | Renkleri ters çevir |
| `gaia` | `1` | `0` | Gaia işaretçileri |
| `embed` | `1` | `0` | Gömme modu: yalnızca oynatıcı ve denetimleri |

Kurallar:

- Sayfa açılınca adres okunur. `q` varsa çözülür ve `ra`, `dec` adrese yazılır; sonra iş başlatılır.
- Kullanıcı bir kontrolü değiştirince adres `history.replaceState` ile güncellenir; yeni arama `pushState` ile geçmişe eklenir.
- `ra`, `dec`, `fov`, `det`, `mode`, `pmra`, `pmdec` değişirse yeni iş başlatılır. `speed`, `invert`, `gaia`, `a`, `b` yalnızca görünümü değiştirir.
- Hiç parametre yoksa karşılama ekranı ve beş hazır hedef gösterilir.

## 7. API kullanımı

Tüm yanıtlar JSON'dur. Aşağıdaki biçimler servis ve analiz dokümanındaki sözleşmeye dayanır; "öneri" yazan alanlar sözleşmede ayrıntılandırılmamıştır, ilk saatte servis sorumlusuyla kesinleştirin.

### 7.1 Uç noktalar

| Uç nokta | Ne zaman çağrılır |
|---|---|
| `GET /api/targets` | Sayfa açılışında, hazır hedef düğmeleri için |
| `GET /api/resolve?q=` | Arama kutusu gönderildiğinde |
| `POST /api/jobs` | Koordinat ve ayarlar belli olduğunda |
| `GET /api/jobs/{id}` | İş bitene kadar 2 saniyede bir |
| `GET /api/frames/{id}/{n}.png` | Her kare için, `<img>` kaynağı olarak |
| `GET /api/diff?job=&a=&b=` | Fark modunda |
| `GET /api/spectrum?ra=&dec=` | Spectrum sekmesi açıldığında |
| `GET /api/lightcurve?ra=&dec=&detector=` | Light curve sekmesi açıldığında |
| `GET /api/gaia?ra=&dec=&radius=` | Gaia işaretçileri açıldığında |

### 7.2 Yanıt biçimleri

**Hazır hedefler (öneri):**

```json
[{"key": "barnard", "name": "Barnard's Star", "ra": 269.44638, "dec": 4.76677,
  "pmra": -801.6, "pmdec": 10362, "detector": 6, "mode": "epoch",
  "hint": "A nearby star that visibly shifts north between visits."}]
```

**İsim çözme (öneri):**

```json
{"name": "Barnard's Star",
 "catalog": {"ra": 269.45208, "dec": 4.69336, "epoch": 2000.0},
 "current": {"ra": 269.44638, "dec": 4.76677, "epoch": 2026.0},
 "pmra": -801.6, "pmdec": 10362, "source": "simbad"}
```

Arayüz her zaman `current` konumunu kullanır. Katalog konumu ile bugünkü konum arasındaki fark 10 yay saniyesinden büyükse bir bilgi satırı gösterilir (metin için bölüm 10).

**İş başlatma isteği:**

```json
{"ra": 269.44638, "dec": 4.76677, "fov": 0.1, "detector": 6, "mode": "epoch"}
```

`shift_add` modunda `pmra` ve `pmdec` de gönderilir. Yanıt iş durumu biçimindedir.

**İş durumu:**

```json
{"id": "b7f3", "status": "running",
 "progress": {"total": 58, "done": 31, "failed": 0},
 "center": {"ra": 269.44638, "dec": 4.76677},
 "grid": {"ra": 269.44638, "dec": 4.76677, "scale_arcsec": 3.075, "width": 117, "height": 117},
 "frames": [{"n": 0, "url": "/api/frames/b7f3/0.png",
             "t_start": "2025-08-15", "t_end": "2025-10-01",
             "detector": 6, "wavelength_um": [4.41, 5.00],
             "n_images": 20, "flagged_fraction": 0.03}]}
```

- `status`: `queued`, `running`, `done`, `failed`.
- `grid` görüntü işleme dokümanının önerdiği ektir; işaretçileri yerleştirmek için gerekir.

**Spektrum:** `[{wavelength_um, flux_mjy, err_mjy, mjd, detector, flagged}]`

**Parlaklık eğrisi (öneri):** aynı alanlar, zamana göre sıralı.

**Gaia (öneri):** `[{ra, dec, gmag, pmra, pmdec}]`; konumlar gözlem dönemine taşınmış.

**Hata:** uygun HTTP kodu ve `{"error": {"code": "...", "message": "..."}}`. Kodlar: `bad_input`, `not_found`, `no_coverage`, `archive_unavailable`.

### 7.3 Sahte veriyle başlamak

Gerçek servis hazır olmadan geliştirme sahte uç noktalarla yapılır:

| Adres | Döndürdüğü |
|---|---|
| `/api/jobs/mock` | Tamamlanmış iş, 3 kare |
| `/api/jobs/mock-running` | Devam eden iş, 1 kare; ilerleme ekranı için |
| `/api/jobs/mock-error` | `no_coverage` hatası; hata ekranı için |

Servis hazır olana kadar bu yanıtlar `public/mock/` altında dosya olarak da tutulabilir.

### 7.4 Sorgulama döngüsü

```
POST /api/jobs  ->  job
while job.status is "queued" or "running":
    job.frames içindeki yeni kareleri önden yükle ve oynatıcıya ekle
    ilerlemeyi güncelle
    2 saniye bekle
    job = GET /api/jobs/{id}
status "done"   -> son kareleri ekle, döngüyü bitir
status "failed" -> hata ekranı
```

- Ağ hatasında üç kez denenir; üçü de başarısızsa hata ekranı ve "Try again" düğmesi gösterilir.
- Kullanıcı yeni arama yaparsa eski döngü iptal edilir (`AbortController`).
- Sekme arka plandayken sorgulama durmaz; iş sunucuda sürmektedir.

## 8. Bileşenler

### 8.1 Arama kutusu

- Tek metin alanı. Kabul edilen girişler: `269.452 4.693`, `17h57m48.5s +04d41m36s`, `17:57:48.5 +04:41:36`, bir cisim adı.
- Ayrıştırmayı servis yapar; arayüz metni olduğu gibi `resolve` uç noktasına gönderir.
- Yer tutucu metin: `Enter a name or coordinates, e.g. Barnard's Star or 269.45 +4.69`
- Enter tuşu ve Search düğmesi aynı işi yapar.

### 8.2 Hazır hedef düğmeleri

Beş test hedefi. Tıklanınca hedefin önerilen dedektörü ve moduyla açılır; WISE 0855 doğrudan kaydır-topla modunda ve öz hareketi dolu gelir.

| Düğme | Mod | Altında gösterilecek ipucu |
|---|---|---|
| Barnard's Star | epoch | `A nearby star that visibly shifts north between visits.` |
| Epsilon Indi B | epoch | `A pair of brown dwarfs moving together across the sky.` |
| WISE 0855 | shift_add | `Too faint for a single image. Stacking reveals it; shift & add sharpens it slightly.` |
| RW Aurigae | epoch | `A young star whose brightness changes.` |
| R Draconis | epoch | `A pulsating giant star, observed hundreds of times.` |

### 8.3 Oynatıcı

- Kareler `<img>` ya da `<canvas>` üzerinde gösterilir. Kareler küçüktür (0,1 derecede yaklaşık 117×117 piksel); kapsayıcıya sığan en büyük tam sayı katla büyütülür.
- CSS: `image-rendering: pixelated`.
- Tüm kareler oynatmadan önce önden yüklenir (`new Image()`), yoksa ilk turda titreme olur.
- Kare süresi varsayılan 500 ms; 200–2000 ms arası ayarlanır.
- Döngü: son kareden sonra bir kare süresi boyunca oynatıcının çevresinde kesikli çerçeve gösterilir, sonra ilk kareye dönülür.
- Denetimler: önceki kare, oynat/durdur, sonraki kare, kare sayacı (`Frame 3 / 7`).
- Klavye: boşluk oynat/durdur, sol ve sağ ok tek kare, `i` renk tersleme.
- İşletim sisteminde hareket azaltma tercihi açıksa (`prefers-reduced-motion`) animasyon kendiliğinden başlamaz.
- Kullanıcı görüntüye tıklarsa tıklanan noktanın koordinatı hesaplanıp gösterilir ve `Center here` seçeneği sunulur.

### 8.4 Dönem şeridi

Oynatıcının altında her kare için bir nokta. Geçerli kare vurgulanır; noktaya tıklanınca o kareye gidilir. Noktanın altında tarih aralığı yazar (`Aug 15 – Oct 1, 2025`). Noktalar zamana orantılı yerleştirilirse dönemler arasındaki aylık boşluklar da görülür.

### 8.5 Katmanlar

Görüntünün üzerine çizilen işaretler. Konumlar `grid` bilgisinden hesaplanır; kuzey yukarıda, doğu soldadır:

```
dx_arcsec = (ra - grid.ra) * cos(grid.dec) * 3600
dy_arcsec = (dec - grid.dec) * 3600
x_px = grid.width  / 2 - dx_arcsec / grid.scale_arcsec
y_px = grid.height / 2 - dy_arcsec / grid.scale_arcsec
```

`x_px` soldan, `y_px` üstten ölçülür; ekrandaki konum büyütme katıyla çarpılır. Tıklamadan koordinata dönüş aynı formüllerin tersidir.

| Katman | İçerik |
|---|---|
| Hedef artısı | İş merkezinde ince, ortası boş bir artı; cismi kapatmamalı |
| Ölçek çubuğu | Sol altta, örneğin `1 arcmin` |
| Yön göstergesi | Sağ üstte `N` yukarı, `E` sola ok |
| Gaia işaretçileri | Her kaynak için küçük halka; üzerine gelince parlaklık ve öz hareket |

### 8.6 Kontroller

| Kontrol | Tür | Etkisi |
|---|---|---|
| Mode | Üç seçenekli düğme grubu | `Epochs`, `Shift & add`, `Difference` |
| Detector | Altı düğme | Yeni iş; düğme altında dalga boyu aralığı |
| Field of view | Sayı ya da kaydırıcı | Yeni iş; büyük alan daha uzun sürer uyarısı |
| Speed | Kaydırıcı | Kare süresi |
| Brightness, Contrast | Kaydırıcılar | CSS `filter`; sunucuya istek gitmez |
| Invert | Onay kutusu | CSS `filter: invert(1)` |
| Gaia overlay | Onay kutusu | İşaretçileri açar |

Dedektör düğmelerinin altındaki aralıklar:

| D1 | D2 | D3 | D4 | D5 | D6 |
|---|---|---|---|---|---|
| 0.75–1.1 µm | 1.1–1.6 µm | 1.6–2.4 µm | 2.4–3.8 µm | 3.8–4.4 µm | 4.4–5.0 µm |

### 8.7 Modlar

**Epochs.** Her dönem bir kare; oynatıcı kareleri sırayla gösterir.

**Shift & add.** İki öz hareket alanı açılır (`pmra`, `pmdec`, mas/yıl). İsim çözmeden öz hareket geldiyse alanlar dolu gelir. Sonuç iki karedir: 0 sabit toplama, 1 hareketi izleyen toplama. Oynatıcı ikisi arasında göz kırpar; karelerin altında `Fixed stack` ve `Moving with the object` yazar.

**Difference.** İki açılır listeden `a` ve `b` kareleri seçilir; görüntü `diff` uç noktasından gelir, animasyon yoktur. Altında açıklama: `Later minus earlier. White: where something appeared or brightened. Black: where it was.`

### 8.8 Kare bilgisi paneli

Geçerli karenin metadata'sı:

| Etiket | Kaynak | Örnek |
|---|---|---|
| Dates | `t_start`, `t_end` | `Aug 15 – Oct 1, 2025` |
| Detector | `detector` | `D6` |
| Wavelength | `wavelength_um` | `4.41–5.00 µm` |
| Images stacked | `n_images` | `20` |
| Flagged pixels | `flagged_fraction` | `3%` |

Bayraklı oran %20'yi geçerse satır uyarı rengiyle gösterilir.

### 8.9 İlerleme paneli

İş `queued` ya da `running` iken oynatıcının üzerinde gösterilir; hazır kareler arkada görünmeye başlar.

- İlerleme çubuğu: `progress.done / progress.total`.
- Kalan süre tahmini: kalan görüntü sayısı çarpı 2 saniye (kesit başına 8 saniye, 4 paralel bağlantı varsayımıyla kaba bir tahmin).
- `failed` sıfırdan büyükse küçük bir not.

### 8.10 Grafik sekmeleri

**Spectrum.** Yatay eksen dalga boyu (µm), dikey eksen akı (mJy), hata çubuklu noktalar. Dönemler ayrı renkle çizilir; böylece iki tarihin spektrumu üst üste karşılaştırılır. `flagged` noktalar içi boş gösterilir. Renkler renk körlüğüne uygun bir paletten seçilir ve gösterge eklenir.

**Light curve.** Yatay eksen tarih, dikey eksen akı. R Draconis için en anlamlı grafik budur; diğer hedeflerde yalnızca birkaç nokta olur.

**Sky context.** Aladin Lite ile aynı bölgenin başka bir taramadaki görüntüsü; kullanıcı baktığı yeri tanır. Sekme açılınca yüklenir, sayfa açılışını yavaşlatmaz.

### 8.11 Paylaşım

- `Copy link`: geçerli adresi panoya kopyalar.
- `Embed code`: `embed=1` eklenmiş adresle bir `<iframe>` satırı verir.
- Gömme modunda başlık, hazır hedefler, sekmeler ve alt bilgi gizlenir; oynatıcı, denetimleri ve küçük bir "Open full view" bağlantısı kalır.

## 9. Durum makinesi

| Durum | Ekranda | Sonraki |
|---|---|---|
| `idle` | Karşılama metni ve hazır hedefler | arama → `resolving` |
| `resolving` | Arama kutusunda bekleme göstergesi | başarı → `starting`; hata → `error` |
| `starting` | Oynatıcı alanında iskelet | yanıt → `running` ya da `done` |
| `running` | İlerleme paneli, gelen kareler | `done` ya da `error` |
| `done` | Oynatıcı çalışır | yeni arama → `resolving` |
| `error` | Hata mesajı ve yeniden dene düğmesi | yeniden dene → önceki adım |

## 10. Arayüz metinleri

| Durum | Metin |
|---|---|
| Karşılama | `Watch the infrared sky change. Enter a position or pick a target to see SPHEREx images over time.` |
| Bekleme (ilk) | `Fetching images from NASA's SPHEREx archive…` |
| Bekleme (uzun) | `New sky positions take about two minutes. Frames appear as they are ready.` |
| Sırada | `Waiting for a free slot…` |
| Konum taşındı | `This object moves fast. Showing its position in 2026, not its catalog position.` |
| `bad_input` | `We couldn't read that. Try a name like "Barnard's Star" or coordinates like "269.45 +4.69".` |
| `not_found` | `No object found with that name. Check the spelling or enter coordinates.` |
| `no_coverage` | `SPHEREx has no images of this position in this detector yet. Try another detector.` |
| `archive_unavailable` | `NASA's archive isn't responding right now. The five sample targets still work.` |
| Ağ hatası | `Connection lost. Try again.` |
| Bazı görüntüler eksik | `{n} images could not be loaded.` |
| Alt bilgi | `Data: NASA SPHEREx, via NASA/IPAC Infrared Science Archive.` |

SPHEREx verisi için IRSA'nın istediği teşekkür metni "About" bölümüne tam haliyle eklenir; metni test ve teslim sorumlusundan alın.

## 11. Görsel tasarım ve erişilebilirlik

- Koyu tema: gökyüzü görüntüleri koyu zeminde daha rahat okunur.
- Kareler gri tonludur; arayüzde tek bir vurgu rengi yeter.
- Metin ile zemin arasında en az 4,5:1 karşıtlık.
- Tüm kontroller klavyeyle ulaşılabilir; odak halkası görünür.
- Oynatıcı görüntüsünün `alt` metni kare bilgisinden üretilir: `SPHEREx image, detector 6, Aug 15 – Oct 1, 2025`.
- Kare süresi 200 ms'nin altına inmez; hızlı yanıp sönme rahatsız edicidir.
- Telefon genişliğinde yatay kaydırma olmaz; oynatıcı tam genişliktedir.

## 12. Dosya yapısı

```
frontend/
  index.html
  public/mock/              sahte yanıtlar ve örnek PNG'ler
  src/
    main.jsx
    App.jsx                 durum makinesi, adres eşlemesi
    api.js                  tüm fetch çağrıları, sorgulama döngüsü
    url.js                  adres parametrelerini okuma ve yazma
    sky.js                  koordinat-piksel dönüşümleri, tarih biçimleme
    components/
      SearchBar.jsx
      TargetButtons.jsx
      Player.jsx
      EpochStrip.jsx
      Overlays.jsx
      Controls.jsx
      FrameInfo.jsx
      ProgressPanel.jsx
      SpectrumTab.jsx
      LightCurveTab.jsx
      SkyContextTab.jsx
      ShareBar.jsx
      ErrorBanner.jsx
```

## 13. İş sırası

**Cumartesi, ilk saat**

- [ ] Vite ile proje iskeleti, koyu tema, sayfa düzeni
- [ ] `public/mock/` altına sahte yanıtlar; `api.js` sahte adreslere bağlı

**Cumartesi akşam**

- [ ] Oynatıcı: önden yükleme, oynat/durdur, hız, kare sayacı, başa dönüş işareti
- [ ] Dönem şeridi ve kare bilgisi paneli
- [ ] Arama kutusu ve hazır hedef düğmeleri
- [ ] Adres parametreleri: okuma, yazma, geri-ileri

**Cumartesi gece**

- [ ] Sorgulama döngüsü, ilerleme paneli, hata ekranları
- [ ] Gerçek servise bağlanma; Barnard's Star uçtan uca

**Pazar sabah**

- [ ] Dedektör, görüş alanı, parlaklık, kontrast, tersleme kontrolleri
- [ ] Katmanlar: artı, ölçek çubuğu, yön göstergesi
- [ ] Kaydır-topla ve fark modları
- [ ] Gömme modu, bağlantı kopyalama

**Pazar öğleden sonra**

- [ ] Gaia işaretçileri
- [ ] Spektrum ve parlaklık sekmeleri
- [ ] Bağlam haritası
- [ ] Telefon görünümü ve klavye denetimi

**Pazar 17:00**

- [ ] Proje sayfası için 3–4 ekran görüntüsü (PNG, 10 MB altı)

**Pazar 18:00: kod dondurma.** Sonrası yalnızca hata düzeltme. Pazar öğleden sonraki dört iş yetişmezse bırakılır.

## 14. Teslim ve kabul ölçütleri

| Teslim | Kabul ölçütü |
|---|---|
| Yayındaki arayüz | Gizli pencerede şifresiz açılıyor; tüm metinler İngilizce |
| Arama | Koordinat ve isim girişi çalışıyor; geçersiz girişte anlaşılır mesaj |
| Oynatıcı | Beş hedefin her biri tek tıkla açılıp oynuyor; başa dönüş belli oluyor |
| Paylaşılabilir adres | Kopyalanan bağlantı başka tarayıcıda aynı görünümü açıyor |
| Gömme | `embed=1` ile yalnızca oynatıcı görünüyor; bir `<iframe>` içinde çalışıyor |
| İlerleme | Önbellekte olmayan bir koordinatta çubuk ilerliyor, kareler geldikçe görünüyor |
| Hata | Dört hata kodunun her biri kendi metnini gösteriyor |
| Modlar | WISE 0855 kaydır-topla modunda kaynak iki kare arasında beliriyor (sabit toplamada da yaklaşık 7,6σ ile görünür, bu "yalnızca kaydır-topla ile görünür" anlamına gelmez); Barnard's Star fark modunda ak-kara çift görünüyor |
| Telefon | 375 piksel genişlikte yatay kaydırma yok |
| Ekran görüntüleri | 3–4 adet, test ve teslim sorumlusuna verildi |

## 15. Riskler ve açık kararlar

| Konu | Durum |
|---|---|
| `resolve`, `targets`, `gaia` ve `lightcurve` yanıt biçimleri | Bu dokümandaki haller öneridir; servis sorumlusuyla ilk saatte kesinleşmeli |
| `grid` alanı | Sözleşmeye ek olarak önerildi; yoksa işaretçiler çizilemez |
| Gaia: servis uç noktası mı, Aladin Lite katmanı mı | Karar verilmedi. İşaretçilerin oynatıcının üzerinde durması için servis uç noktası gerekir |
| Kontrast: CSS mi, sunucu mu | Şimdilik CSS. Sönük kaynaklarda yetersiz kalırsa sunucudan yeniden üretim istenir |
| Kaydır-topla bekleme süresi | Önbellekte olmayan hedefte tüm dönemler indirilmeden sonuç çıkmaz; ilerleme paneli bunu söylemeli |
| Aladin Lite çağrıları | Bellekten yazıldı; belgelerden doğrulanacak |

**Zaman kalırsa**

- İki dedektörü yan yana oynatma.
- Karelerden GIF indirme.
- Kullanıcının bulduğu bir aday için koordinatı ve ekran görüntüsünü dışa aktarma.
- Türkçe dil seçeneği (İngilizce varsayılan kalmak koşuluyla).

## Güncelleme (15 Kasım)

Bu doküman tasarım aşamasında yazıldı; aşağıdaki liste 15 Kasım'da `main`'de (396df1a) gerçekten bulunanı ve bulunmayanı
özetler. Kaynak: `frontend/README.md`, `backend/docs/spectrum-api.md`, depodaki kod. Yukarıdaki bölümlerle çelişirse bu bölüm
geçerlidir (örneğin arayüz artık Türkçe de var, `embed=1` yapıldı, gerçek veri geliyor).

**Var olanlar**

- **Gerçekçi (Realistic) mod:** Oyun | Gerçekçi anahtarı. Gerçekçi mod 6 dedektörün hepsini ister (`dets=1,...,6`), birimler MJy/sr,
  ziyaret gruplaması (İnce 10/30, Normal 30/60, Kaba 60/150 gün) ziyaretçinin seçimidir. Oyun modu `dets=2,4,6` ister.
- **102 kanallı tayf paneli:** `/api/spectrum?mode=102` (6 dedektör × 17 kanal), açıklık 1, 2 ya da 3 piksel, doymuş ya da
  boş pikselli kanallarda alt sınır (lower limit) gösterimi.
- **CatWISE bindirmesi ve öz hareket anlamlılığı:** `/api/catwise` bindirmesi (W1/W2) ve Gaia/CatWISE kaynakları için `pm_snr`;
  katalog tablosunda hızlı hareket eden WISE kaynakları önce listelenir.
- **İsim arama:** bilinmeyen metinler `/api/resolve` ile çözülür; beş hedefin 10″ içindeki sonuçlar hedefin tam sayılarını kullanır.
- **Canlı sorgu bekleme ekranı:** gerçek ilerleme çubuğu, geçen süre, "dedektör N / M"; önbellekte/kayıtlı olmayan konum için
  25 dakika, kayıtlı hedef için 3 dakika zaman aşımı; ekrandan çıkınca yoklama durur. Ölçülen örnek: RA 10, Dec 10, `dets=2,4,6`
  yaklaşık 15,5 dakika.
- **Kayıtlı kopyalar (statik):** `frontend/public/static` altında beş hedefin `/api/patch` ve `/api/gaia` yanıtları; "kayıtlı kopya"
  notu gösterilir. Veri sırası: **canlı servis -> kayıtlı kopya -> dürüst hata**. Sahte (demo) veri yok; yalnızca geliştirici
  anahtarı `?data=mock` demo veriyi açar ve her ekranda kırmızı şerit gösterir.
- **Aladin Lite bağlantısı** (Paylaş menüsünün yanında), **`embed=1`** gömme modu ve "Gömme kodunu kopyala".
- **Özel alan boyutu:** 3-15 yay dakikası (adreste `fov` 0,05-0,25 derece).
- **Gökyüzü resminde** fare tekerleği, sürükleme ve +/- ile yakınlaştırma; klavye (Tab, +/-, 0, oklar, Boşluk, Enter).
- **TR / EN** dil anahtarı (`?lang=tr|en`).

**Yapılmayanlar ve sınırlar (açıkça)**

- S3'ten doğrudan okuma **yapılmadı**.
- 102 kanalın sınırları **nominal** (kendi hesabımız: logaritmik aralıklı, ölçülen kapsama göre); resmî SPHEREx kanal sınırlarıyla
  tam örtüşmez.
- 0,25 dereceden geniş alanlar yok (sunucu `fov > 0,25` için `400 bad_input` döner).
- Zodyak ışığı katmanı için uç nokta yok.
- Aladin bağlantısı `ra`, `dec`, `fov` ve `hips` ile veriliyor (`target=` yok sayılıyor, sayfa rastgele konumda açılıyordu); harita IRSA aynasındaki DSS2 renkli (CDS sunucusu 404, ESA aynası zaman aşımı veriyordu). Aladin'in kendi menüsündeki diğer haritalar CDS sunucusu kapalıyken yine yüklenmeyebilir.
- WiseView bağlantısı eklenmedi.
- Tam erişilebilirlik denetimi yapılmadı (elle ve testlerle bakılanlar `frontend/README.md`'de; WCAG uyumu iddia edilmez).
- Gerçek ekran okuyucu, Safari ve Firefox, dokunmatik iki parmakla yakınlaştırma ve gerçekten 15 dakika süren bir canlı indirme
  denenmedi.
