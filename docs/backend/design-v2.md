# Servis ve Analiz: İş Tasarım Dokümanı (v2)

Original by Yusuf (2026-11-14), v2 additions by Emirhan + Claude (marked **[v2]**). This is the agreed design for the backend ("Servis ve Analiz") role. Online version: https://claude.ai/artifact/VWRP7G9qrPjBYt6WywEzQv

## Bu sürümde neler değişti

| # | Ekleme | Bölüm | Neden |
| --- | --- | --- | --- |
| 1 | Bir işteki tüm kareler aynı parlaklık ölçeğiyle (min/max) PNG'ye çevrilir | API sözleşmesi | Kare başına ölçekleme RW Aur ve R Dra'nın parlaklık değişimini siler |
| 2 | İş kimliğine ve önbellek anahtarına veri sürümü eklenir; yanıtta `data_release` alanı | API sözleşmesi, Uzun işlemler | Challenge "yeni veri yayınlarıyla kolay güncellenme" istiyor; IRSA'ya haftalık veri ekleniyor |
| 3 | Spektrumda piksel alanı için resmi solid-angle haritası; demo için sabit değer kalır ama README'de not edilir | Analiz uç noktaları | Piksel alanı detektör üzerinde değişiyor |
| 4 | Arşiv yavaşlarsa AWS S3 yedeği (`nasa-irsa-spherex`, anonim, dosyanın yalnız gereken kısmı okunur) | Riskler | IRSA kesit başına ~8 sn ve sık 503 |
| 5 | Hareket kareler arasında 1–2 piksel; fark görüntüsü ve büyütme demoda kritik | API sözleşmesi, Riskler | SPHEREx pikseli 6,15″; Barnard's Star 6 ayda ~0,85 piksel kayıyor |

## Amaç ve kapsam

Servis ve analiz sorumlusu, veri hattı ile görüntü işlemenin ürettiğini internetten erişilen bir API'ye çevirir ve projeyi yayında tutar. Arayüz yalnızca bu API ile konuşur.

Bu rolün işleri:

- API sözleşmesini yazmak ve korumak.
- Koordinat girişini çözmek, isimden koordinat bulmak, konumu öz hareketle bugüne taşımak.
- Uzun süren indirme ve işleme işlerini yönetmek, ilerlemeyi bildirmek.
- Spektrum, parlaklık-zaman eğrisi ve Gaia kaynak listesi uç noktalarını yazmak.
- Yayın, depo düzeni, README ve LICENSE.

Bu rolün işi olmayanlar:

- Arşivden veri indirmek ve önbellek (veri hattı).
- Hizalama, toplama, fark görüntüsü, PNG üretimi (görüntü işleme).
- Ekrandaki her şey (arayüz).

Teslim 15 Kasım 2026 Pazar 23:59'da kapanıyor; plan buna göre yazıldı.

## Sistemdeki yeri

Veri soldan sağa akar: IRSA arşivi → Veri hattı (kesitler ve önbellek) → Görüntü işleme (kareler ve fark) → Servis ve analiz (API, konum, spektrum) → Arayüz (React, tarayıcıda). Servis ayrıca SIMBAD ve Gaia'dan konum ve öz hareket alır.

Servis veri hattını ve görüntü işlemeyi Python fonksiyonu olarak çağırır; aralarında ağ yoktur. İsim ve katalog sorguları için SIMBAD ve Gaia'ya yalnızca servis gider.

| Kimden | Ne alır | Biçim |
| --- | --- | --- |
| Veri hattı | Bir koordinatın kesit listesi | `get_cutouts(ra, dec, size_deg, detector)` ve her kesit için yol, zaman, detektör, dalga boyu. **[v2]** Ayrıca kullanılan veri sürümü (ör. DR1+QR3 ve en son gözlem tarihi) |
| Görüntü işleme | Kareler ve fark görüntüsü | `make_frames(cutouts, mode)` ve her kare için PNG, tarih aralığı, poz sayısı. **[v2]** Tüm karelerde ortak min/max |
| Arayüz | İstekler | HTTP, aşağıdaki sözleşmeye göre |

Fonksiyon adları öneridir; kesin halleri ilk saatte ilgili kişilerle birlikte belirlenir.

## API sözleşmesi

Sözleşme ilk yarım saatte yazılır, beş kişi onaylar ve sonradan habersiz değişmez. Tüm yanıtlar JSON'dur; alan adları İngilizcedir.

| Uç nokta | Ne yapar | Öncelik |
| --- | --- | --- |
| `GET /api/resolve?q=` | İsim ya da koordinat metnini çözer; bugünkü konumu ve öz hareketi döndürür | 1 |
| `POST /api/jobs` | Bir koordinat için kare üretim işini başlatır; iş kimliği döndürür | 1 |
| `GET /api/jobs/{id}` | İşin durumunu ve o ana kadar hazır olan kareleri döndürür | 1 |
| `GET /api/frames/{id}/{n}.png` | Tek bir kare görüntüsü | 1 |
| `GET /api/targets` | Önceden hazırlanmış beş test hedefinin listesi | 1 |
| `GET /api/diff?job=&a=&b=` | İki gözlem döneminin fark görüntüsü | 2 |
| `GET /api/spectrum?ra=&dec=` | Konumdaki spektrum: dalga boyu, akı, belirsizlik | 3 |
| `GET /api/lightcurve?ra=&dec=&detector=` | Parlaklık-zaman eğrisi | 3 |
| `GET /api/gaia?ra=&dec=&radius=` | Alandaki Gaia DR3 kaynakları | 3 |

**[v2]** `diff` 2. öncelikte kalır ama demo için değeri yüksek: test hedeflerinin hareketi kareler arasında yalnızca 1–2 piksel. Fark görüntüsü olmadan hareket gözle zor fark edilir. Arayüz tarafında da büyütme (zoom) seçeneği önerilir.

**İş başlatma parametreleri:** `ra`, `dec` (derece), `fov` (derece, varsayılan 0.1), `detector` (1–6, varsayılan 6), `mode` (`epoch`, `shift_add`), `pmra`, `pmdec` (mas/yıl; yalnızca `shift_add` için).

**İş durumu yanıtı örneği:**

```json
{
  "id": "b7f3",
  "status": "running",
  "data_release": "dr1+qr3@2026-11-10",
  "progress": {"total": 58, "done": 31, "failed": 0},
  "center": {"ra": 269.44638, "dec": 4.76677},
  "display_range": {"min": 0.12, "max": 48.0, "stretch": "asinh"},
  "frames": [
    {
      "n": 0,
      "url": "/api/frames/b7f3/0.png",
      "t_start": "2025-08-15",
      "t_end": "2025-10-01",
      "detector": 6,
      "wavelength_um": [4.41, 5.00],
      "n_images": 20,
      "flagged_fraction": 0.03
    }
  ]
}
```

`status` değerleri: `queued`, `running`, `done`, `failed`. Örnekteki sayılar biçimi göstermek içindir.

**[v2] Yeni alanlar:**

- `data_release`: kesitlerin hangi veri yayınından ve hangi tarihe kadarki gözlemlerden geldiği. Veri hattı sağlar.
- `display_range`: işteki **tüm kareler aynı min/max ve aynı stretch ile** PNG'ye çevrilir; değerler MJy/sr cinsinden yanıtta döner. Uygulaması görüntü işlemenin işidir; sözleşmede bu yüzden yazılır.

**Hata biçimi:** uygun HTTP kodu ve `{"error": {"code": "no_coverage", "message": "..."}}`. Kodlar: `bad_input`, `not_found`, `no_coverage`, `archive_unavailable`.

### Sahte sürüm

İlk saatte uç noktalar sabit örnek yanıtlarla ve birkaç hazır PNG ile çalışır. Arayüz geliştirmesi buna karşı başlar; gerçek kod sonradan arkasına bağlanır. Biçimi gerçek yanıtla birebir aynı, içeriği sabittir; arayüz hangi koordinatı isterse istesin aynı yanıtı alır.

1. Her uç nokta için bir sabit JSON dosyası (iş durumu, isim çözme, hedef listesi).
2. Arayüzde oynatılacak 3–4 PNG kare.
3. Parametrelere bakmadan bu dosyaları döndüren 20–30 satırlık bir servis.

Tamamlanmış iş yanıtı: `"id": "mock"`, `"status": "done"`, Barnard's Star'ın ölçülen üç gözlem dönemi: 2025-08-15 – 2025-10-01 (n_images 20, flagged 0.03), 2026-03-11 – 2026-05-05 (21, 0.02), 2026-08-16 – 2026-09-22 (17, 0.04); detektör 6, 4,41–5,00 µm. Poz sayıları ve bayrak oranları uydurmadır. **[v2]** Sahte yanıtta `data_release` ve `display_range` de bulunur.

**PNG kareler.** Gerçek Barnard's Star kesitleri Yusuf'un veri testinden kalma, onun bilgisayarında (orijinal dokümanda geçen yol: `E:\nasa\feasibility\data\cutouts\barnard`); Yusuf'tan istenir. Yoksa `docs/spherex-data.md`'deki TAP sorgusuyla her dönemden bir kesit indirilir; üç dönemden birer tanesi PNG'ye çevrilir. **[v2]** Üç PNG de ortak min/max ile üretilir.

**Zor durumlar:**

- `GET /api/jobs/mock-running`: `"status": "running"`, `"done": 1` ve tek kare.
- `GET /api/jobs/mock-error`: `{"error": {"code": "no_coverage", "message": "..."}}`.

**Gerçeğe geçiş.** Gerçek kod hazır oldukça uç noktalar tek tek sahte dosyadan gerçek fonksiyona çevrilir. Biçim aynı kaldığı için arayüzde değişiklik gerekmez.

## Koordinat girişi ve isim çözme

Katalog koordinatları eski bir tarihe aittir; hızlı hareket eden cisimler bugün orada değildir.

**Kabul edilen girişler**

- Derece: `269.452 4.693`
- Saat ve derece: `17h57m48.5s +04d41m36s`, `17:57:48.5 +04:41:36`, `17 57 48.5 +04 41 36`
- İsim: `Barnard's Star`, `WISE 0855-0714`

Önce koordinat olarak ayrıştırmayı deneyin (`astropy.coordinates.SkyCoord`); olmazsa isim olarak çözün.

**İsim çözme**

- Kaynak SIMBAD. Koordinatla birlikte öz hareket ve varsa paralaks da alınır.
- Ana SIMBAD sunucusu 14 Kasım'daki testte yanıt vermedi; Harvard yansısı TAP üzerinden çalıştı. İkisini sırayla deneyin.
- Beş test hedefinin değerleri kodda sabit bir tabloda dursun.

**Bugüne taşıma**

Öz hareket biliniyorsa konum gözlem döneminin ortasına (2026.0) taşınır: `SkyCoord.apply_space_motion`.

| Hedef | Katalog konumundan uzaklık | Sonuç |
| --- | --- | --- |
| Barnard's Star | 4,4 yay dakikası (J2000'den) | 0,1 derecelik kesitin dışında kalır |
| Epsilon Indi B | yaklaşık 2 yay dakikası | Karenin kenarına düşer |
| WISE 0855 | yaklaşık 2 yay dakikası (2010 konumundan) | Karenin kenarına düşer |

- WISE 0855 bugünkü konum yaklaşık RA 133.760, Dec -7.242 (challenge'daki koordinat 2010 tarihli).
- Çıplak koordinatta öz hareket bilinmez; konum olduğu gibi kullanılır, varsayılan alan geniş tutulur.
- `resolve` yanıtı katalog konumunu, bugünkü konumu ve öz hareketi döndürür. Arayüz öz hareketi `shift_add` moduna hazır değer olarak koyar.

## Uzun işlemler

Önbellekte olmayan bir koordinat için tek dedektörün kareleri yaklaşık 2 dakikada hazır olur. İş arka planda çalışır, arayüz durumu sorar.

1. Arayüz `POST /api/jobs` ile işi başlatır ve kimlik alır.
2. Servis veri hattından kesitleri ister, geldikçe görüntü işlemeye verir.
3. Arayüz `GET /api/jobs/{id}` uç noktasını 2 saniyede bir sorar; hazır kareleri hemen gösterir.
4. `status` `done` olunca sorgu durur.

Kurallar:

- **Önbellekte varsa anında.** Beş test hedefi ve önceki koordinatlar doğrudan `done` döner.
- **Aynı istek tek iş.** İş kimliği parametrelerden türetilir (koordinat yuvarlanır). **[v2]** Kimliğe veri sürümü de girer; yeni haftalık veri gelince aynı koordinat yeni iş olur. Sürüm bilgisi veri hattından gelir; pahalıysa günde bir kez yenilenir.
- **Aynı anda en çok bir iki canlı iş.** Fazlası `queued`.
- **Kısmi başarı geçerli.** İnmeyen kesitler `failed` sayısında bildirilir.
- **Durum bellekte tutulabilir** (sözlük); önbellek diskte.

FastAPI arka plan görevleri ya da iş parçacığı havuzu yeterli. Ayrı kuyruk sistemi kurmayın.

## Analiz uç noktaları

Üçü de önbellekteki kesitlerden hesaplanır; arşive yeni istek gitmez. Temel akış çalıştıktan sonra yazılır.

**Spektrum**

- Açıklık fotometrisi (`photutils`): daire + arka plan halkası, yarıçap ~2 piksel (piksel 6,15″, PSF ~9″).
- Her kesit tek dalga boyunda tek nokta verir. Dalga boyu `WCS-WAVE`'den, belirsizlik `VARIANCE`'tan.
- MJy/sr × piksel alanı (37,9 arcsec²) → Jy. **[v2]** Piksel alanı aslında değişiyor; resmi "solid angle pixel map" (`nasa-irsa-spherex/dr1/solid_angle_pixel_map/`, ~16 MB/detektör). Demo için sabit değer, README'de "yaklaşık" notu.
- Bayraklı piksel varsa `flagged: true`. Parlak yıldızlar (Barnard) dedektörü doyurur.
- Yanıt: `[{wavelength_um, flux_mjy, err_mjy, mjd, detector, flagged}]`.

**Parlaklık-zaman eğrisi**

- Aynı ölçüm, zamana karşı. Yalnızca tek detektör içinde dar bir dalga boyu aralığı karşılaştırılır.
- En iyi gösteri R Draconis: 2493 görüntü, 55 gözlem kümesi. Diğerlerinde 3–4 dönem.

**Gaia kaynak listesi**

- `astroquery` ile Gaia DR3: konum, öz hareket, parlaklık; 2016.0'dan gözlem dönemine taşınır.
- Arayüz Aladin Lite'ın Gaia katmanını kullanırsa gerekmeyebilir.

## Yayın ve depo

Jüri projeye şifresiz, kayıtsız bir bağlantıdan ulaşabilmeli. İlk yayın ilk gece.

- Python servisi için sunucu + React için yayın yeri (karar açık).
- **Kalıcı disk** (beş hedef birkaç yüz MB, tahmin). CORS. Sunucu ABD'de. **[v2]** S3 yedeği için en yakın AWS us-east-1.
- Herkese açık depo, `LICENSE` (Apache 2.0 varsayılan), İngilizce `README.md`, yapay zekâ notu, IRSA teşekkür metni, `.gitignore` ile önbellek/veri hariç.
- Klasörler: `backend/`, `pipeline/`, `imaging/`, `frontend/`.
- Yedek plan: beş hedefin kareleri önceden üretilip dosya olarak durur; sunucu çökerse arayüz gömülü karelerle açılır.

## Kabul ölçütleri (özet)

| Teslim | Kabul ölçütü | Ne zaman |
| --- | --- | --- |
| API sözleşmesi ve sahte sürüm | Arayüz gerçek veri olmadan geliştirilebiliyor | Cumartesi, ilk saat |
| Çalışan servis | Beş test hedefi isimle doğru konumda açılıyor; önbellekteki hedef < 2 sn | Cumartesi gece ilk, Pazar 18:00 son |
| Herkese açık adres | Gizli pencerede şifresiz; `?ra=&dec=&fov=` ile aynı görünüm | Pazar 18:00 |
| Açık kod deposu | README, LICENSE, AI notu; README'yi izleyerek kurulabiliyor | Pazar 18:00 |

Doğrulama listesi:

- [ ] `Barnard's Star` 2026 konumunu döndürüyor (RA 269.446, Dec +4.767 civarı)
- [ ] `WISE 0855` için `shift_add` kaynağı karenin ortasında gösteriyor
- [ ] Sexagesimal giriş derece girişiyle aynı sonucu veriyor
- [ ] Geçersiz girişte `bad_input`
- [ ] Veri olmayan koordinatta `no_coverage`
- [ ] Aynı koordinat ikinci kez arşive gitmiyor
- [ ] Arşiv erişilemezken beş hedef açılıyor
- [ ] **[v2]** Tüm kareler aynı `display_range`; R Draconis'te parlaklık değişimi görülüyor
- [ ] **[v2]** `data_release` dolu; sürüm değişince yeni iş üretiliyor

Teslim sorumlusuna: yayındaki adres, depo bağlantısı, 5–6 cümlelik İngilizce açıklama.

## Riskler ve açık kararlar

| Risk | Etkisi | Önlem |
| --- | --- | --- |
| Arşiv yavaş (~8 sn/kesit, sık 503) | Canlı sorgu dakikalar sürer | İş modeli, ilerleme, önceden hazır hedefler. **[v2]** S3 yedeği (`s3://nasa-irsa-spherex/dr1/`, `qr3/`), veri hattının alanı |
| İsim çözme yanıt vermiyor | İsimle arama çalışmaz | Yedek sunucu + sabit tablo |
| Yayın son saate kalıyor | Jüri açamaz | İlk yayın Cumartesi gece |
| Disk kalıcı değil | Önbellek silinir | Kalıcı disk şartı |
| Sözleşme değişiyor | Arayüz bozulur | Değişiklik arayüz sorumlusuyla |
| **[v2]** Hareket piksel altında | Hareket zor seçilir | Tüm dönemler, fark görüntüsü, zoom |
| **[v2]** Kareler farklı ölçekte | Değişen yıldızda parlaklık değişimi kaybolur | `display_range` |

Açık kararlar: barındırma servisi; ilerleme bildirimi (polling vs SSE); Gaia (servis mi Aladin mi); canlı sorgu açık mı kalacak; **[v2]** veri sürümü ne sıklıkla yenilenir.
