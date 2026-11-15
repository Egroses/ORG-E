# Görüntü İşleme: İş Tasarım Dokümanı

14 Kasım 2026 · NASA Space Apps 2026, "Planet X and SPHEREx" · Teslim: 15 Kasım 2026 Pazar 23:59

Görüntü işleme sorumlusu, veri hattının indirdiği ham SPHEREx kesitlerini insan gözünün hareketi ve parlaklık değişimini fark edebileceği hizalanmış, toplanmış karelere çevirir. Bu doküman tek başına yeterli olacak şekilde yazıldı: bir ekip üyesi ya da bir yapay zekâ aracı yalnızca bunu okuyarak modülü yazabilmelidir.

## 1. Sözlük

| Terim | Anlamı |
|---|---|
| Kesit (cutout) | Arşivden indirilen küçük FITS dosyası. Tek bir pozun, tek bir dedektörün, hedef çevresindeki parçası. |
| Poz | Teleskobun tek bir çekimi; yaklaşık 114 saniye. |
| Dedektör | SPHEREx'in 6 dedektöründen biri (D1–D6). Her biri ayrı bir dalga boyu aralığını görür. |
| Dönem (epoch) | Aynı bölgenin art arda gözlendiği zaman kümesi. Kümeler arasında günler ya da aylar vardır. |
| Kare (frame) | Bu modülün çıktısı: bir dönemdeki kesitlerin hizalanıp toplanmasıyla oluşan tek görüntü. |
| Ortak ızgara | Tüm kesitlerin yeniden örneklendiği, kuzeyi yukarıda olan hedef piksel düzeni. |
| WCS | Piksel ile gökyüzü koordinatı arasındaki dönüşümü tanımlayan başlık bilgisi. |
| Bayrak (flag) | Her piksel için sorun ya da durum bildiren bit maskesi. |
| Öz hareket | Bir cismin gökyüzündeki yıllık kayması; birimi mas/yıl (yay saniyesinin binde biri). |

## 2. Kapsam

**Bu modülün işleri**

- Kesitleri okumak, arka planı çıkarmak, bozuk pikselleri maskelemek.
- Tüm kesitleri kuzey yukarıda ortak ızgaraya yeniden örneklemek.
- Kesitleri dönemlere ayırıp toplamak (normal mod).
- Verilen öz harekete göre kaydırıp toplamak (kaydır-topla modu).
- İki dönemin fark görüntüsünü üretmek.
- Kareleri PNG olarak ve metadata ile birlikte teslim etmek.

**Bu modülün işi olmayanlar**

- Arşivden indirme ve önbellek (veri hattı).
- HTTP uç noktaları, koordinat çözme, spektrum ve parlaklık eğrisi (servis ve analiz).
- Ekrandaki oynatıcı ve kontroller (arayüz).

## 3. Zorunlu kurallar

Bu altı kural ihlal edilirse çıktı yanlış ya da yanıltıcı olur.

1. **Ham kesitler doğrudan art arda oynatılmaz.** Her pozun dalga boyu farklıdır; kareler mutlaka dedektör ve dönem bazında toplanır.
2. **Bir karede tek dedektör bulunur.** Farklı dedektörlerin kesitleri aynı karede toplanmaz.
3. **Bir işin tüm kareleri aynı ızgarayı kullanır.** Merkez, ölçek ve boyut kareden kareye değişmez; yoksa sabit yıldızlar oynar.
4. **Bir işin tüm kareleri aynı kontrast sınırlarını kullanır.** Her kare kendi içinde ölçeklenirse gerçek parlaklık değişimi kaybolur, sahte değişim ortaya çıkar.
5. **PNG'de kuzey yukarıda, doğu soldadır.** FITS dizisinin ilk satırı alttadır; PNG'ye yazmadan önce dizi dikey çevrilir.
6. **Doymuş yıldız çekirdeği maskelenmez.** Parlak yıldızın ortası bayraklıdır; silinirse yıldız delik gibi görünür.

## 4. Girdi

### 4.1 Veri hattından gelen kayıt

Veri hattı `get_cutouts(ra, dec, size_deg, detector)` ile bir liste döndürür. Fonksiyon adı ve alanlar öneridir; kesin hali veri hattı sorumlusuyla ilk saatte belirlenir.

| Alan | Tür | Açıklama |
|---|---|---|
| `path` | metin | Önbellekteki FITS dosyasının yolu |
| `mjd` | sayı | Pozun orta zamanı (Modified Julian Date) |
| `detector` | tam sayı | 1–6 |
| `wavelength_um` | sayı | Kesit merkezindeki dalga boyu, mikron |
| `collection` | metin | `dr1` ya da `qr3` |
| `version` | metin | İşleme sürümü |
| `obs_id` | metin | Pozun benzersiz kimliği |

### 4.2 Kesit dosyasının içeriği

14 Kasım'daki ölçümde görülen yapı:

| Katman | Tür | Birim | Kullanım |
|---|---|---|---|
| `PRIMARY` | veri yok | | `VERSION` anahtarı |
| `IMAGE` | float32 | MJy/sr | Asıl görüntü; gök koordinatı WCS'i bu başlıkta |
| `FLAGS` | int32 | bit maskesi | Maskeleme |
| `VARIANCE` | float32 | (MJy/sr)² | Belirsizlik |
| `ZODI` | float32 | MJy/sr | Modellenmiş zodyak ışığı arka planı |
| `WCS-WAVE` | tablo | | Piksel başına dalga boyu |
| `EPSF` | tablo | | PSF; veri hattı önbelleğe yazarken atar, burada kullanılmaz |

Ölçülen sayılar:

- Piksel ölçeği 6,15 yay saniyesi. PSF genişliği yaklaşık 9 yay saniyesi, yani 1,5 piksel.
- 0,1 derecelik kesit 58×58 ya da 59×59 pikseldir.
- Zaman anahtarları `IMAGE` başlığında: `MJD-AVG`, `DATE-AVG`, `DATE-BEG`, `DATE-END`. Poz süresi `XPOSURE`, yaklaşık 113,6 saniye.
- Her kesit farklı bir açıyla çekilmiştir; diziler birbirine göre dönüktür.
- Aynı dedektör içinde bile hedefteki dalga boyu pozdan poza değişir. D6'da 4,41–5,00 mikron aralığı görüldü.
- Gök koordinatı WCS'i `WCS(hdul['IMAGE'].header)` ile okunur. `astropy` bir SIP uyarısı basabilir; zararsızdır. Barnard's Star'ın ölçülen merkezi WCS'in öngördüğü konumdan 0,3 pikselden az sapıyor.

## 5. Çıktı

### 5.1 Kare kümesi

`make_frames(...)` bir kare kümesi döndürür ve diske şunları yazar:

| Dosya | İçerik |
|---|---|
| `0.png`, `1.png`, … | Kareler; 8 bit gri tonlu, kuzey yukarıda |
| `frames.json` | Kare başına metadata ve ızgara bilgisi |
| `stacks.npz` | Toplanmış ham diziler (float32); fark görüntüsü ve yeniden kontrast için |

### 5.2 Kare başına metadata

Alan adları servis sözleşmesiyle aynıdır.

| Alan | Açıklama |
|---|---|
| `n` | Kare sırası, 0'dan başlar, zamana göre artar |
| `t_start`, `t_end` | Karedeki ilk ve son pozun tarihi, `YYYY-MM-DD` |
| `mjd_mean` | Pozların ortalama zamanı |
| `detector` | 1–6 |
| `wavelength_um` | `[en küçük, en büyük]`: karedeki pozların dalga boyu aralığı |
| `n_images` | Karede toplanan poz sayısı |
| `flagged_fraction` | Girdi piksellerinin maskelenen oranı, 0–1 |

### 5.3 Izgara bilgisi

Arayüz işaretçileri (hedef artısı, Gaia kaynakları) doğru yere koyabilmek için ızgarayı bilmelidir. `frames.json` içinde iş başına bir kez verilir:

```json
{"grid": {"ra": 269.44638, "dec": 4.76677, "scale_arcsec": 3.075, "width": 117, "height": 117}}
```

Bu alan servis sözleşmesine eklenmesi önerilen bir ektir; servis sorumlusuna bildirin.

## 6. İşlem adımları

### Adım 1: Okuma

Her kayıt için FITS açılır; `IMAGE`, `FLAGS`, `ZODI` dizileri ve gök koordinatı WCS'i alınır. Sonlu olmayan (NaN, sonsuz) pikseller baştan maskelenir.

### Adım 2: Arka plan çıkarma

1. `IMAGE − ZODI` hesaplanır. Zodyak ışığı tarihe, bakış yönüne ve dalga boyuna göre değişir; çıkarılmazsa her karenin taban seviyesi farklı olur.
2. Kalan taban için maskelenmemiş piksellerin sigma kırpmalı medyanı (`astropy.stats.sigma_clipped_stats`, 3σ) hesaplanıp çıkarılır.

Sonuçta boş gökyüzü sıfır civarındadır.

### Adım 3: Maskeleme

`FLAGS` katmanındaki bit adları başlıktaki `MSKN…` anahtarlarından okunur; bit numaraları koda sabit yazılmaz. Ölçümde görülen bitler:

| Bit | Ad | Bit | Ad |
|---|---|---|---|
| 0 | TRANSIENT | 17 | PERSIST |
| 1 | OVERFLOW | 19 | OUTLIER |
| 2 | SUR_ERROR | 20 | CROSSTALK |
| 6 | NONFUNC | 21 | SOURCE |
| 7 | DICHROIC | 22 | GHOST |
| 9 | MISSING_DATA | 23 | GHOST_FPA |
| 10 | HOT | 24 | GHOST_EXT |
| 11 | COLD | 25 | STREAK |
| 12 | FULLSAMPLE | 26 | BLOOM |
| 14 | PHANMISS | 27 | SNOWBALL |
| 15 | NONLINEAR | 28 | HALO |

**Maske politikası, sürüm 1:**

- **Bozuk sayılan bitler:** TRANSIENT, NONFUNC, MISSING_DATA, HOT, COLD, PHANMISS, PERSIST, OUTLIER, STREAK, SNOWBALL.
- **Doyma koruması:** OVERFLOW, SUR_ERROR ya da BLOOM bitlerinden biri açıksa piksel maskelenmez, diğer bitler ne olursa olsun.
- **Yalnızca bilgi:** SOURCE, FULLSAMPLE, DICHROIC, NONLINEAR, CROSSTALK, GHOST, GHOST_FPA, GHOST_EXT, HALO. Maskelenmez; karedeki oranları metadata olarak raporlanabilir.

Maskelenen pikseller NaN yapılır.

Bu ayrım bit adlarından çıkarılmış bir ilk tahmindir; bitlerin kesin anlamı SPHEREx Explanatory Supplement'tan doğrulanmalı ve beş test hedefinde gözle ayarlanmalıdır. Dayanağı şu ölçüm: Barnard's Star'ın çekirdeğinde TRANSIENT, OVERFLOW, SUR_ERROR, bazen NONFUNC, SOURCE ve BLOOM bitleri birlikte açık; D6'daki 58 kesitin 11'inde yıldızın 2 piksel çevresindeki her piksel bayraklı. Doyma koruması olmadan yıldız kaybolur.

### Adım 4: Ortak ızgaraya yeniden örnekleme

Hedef ızgara iş başına bir kez kurulur:

```python
from astropy.wcs import WCS

def make_target_wcs(ra, dec, fov_deg, scale_arcsec=3.075):
    n = int(round(fov_deg * 3600 / scale_arcsec))
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    w.wcs.cdelt = [-scale_arcsec / 3600, scale_arcsec / 3600]
    w.wcs.cunit = ["deg", "deg"]
    return w, (n, n)
```

- Merkez, servisin verdiği iş merkezidir (cismin bugünkü konumu).
- İlk eksendeki eksi işaret doğuyu sola koyar.
- Önerilen ölçek 3,075 yay saniyesi, yani yerel pikselin yarısı. İki piksel civarındaki kaymalar böylece daha akıcı görünür. Yerel ölçek (6,15) de çalışır; bu bir tasarım tercihidir, ölçülmüş bir kazanç değildir.

Her kesit bu ızgaraya aktarılır:

```python
from reproject import reproject_interp

arr, footprint = reproject_interp((image, wcs_in), wcs_out, shape_out=shape)
```

- Birim MJy/sr, yani yüzey parlaklığıdır; yeniden örneklemede ayrıca ölçekleme gerekmez.
- NaN pikseller komşularına yayılır; kabul edilir.
- Kesitin kapsamadığı ızgara pikselleri NaN kalır.

### Adım 5: Dönemlere ayırma

Kesitler `mjd` değerine göre sıralanır; ardışık iki kesit arasındaki boşluk `gap_days` değerini aşıyorsa yeni dönem başlar.

Barnard's Star için ölçülen (altı dedektörün toplamı, 358 kesit):

| `gap_days` | Dönem sayısı | Kullanım |
|---|---|---|
| 60 | 3 | Az kare, kare başına çok poz; sönük hedefler |
| 10 | 7 | Varsayılan |
| 2 | 17 | Çok kare, kare başına az poz; parlak hedefler |

Tek dedektörde kesit sayısı bunun yaklaşık altıda biridir (Barnard's Star D6: 58). Tek kesitli dönem de kare olur; `n_images` 1 yazılır.

### Adım 6: Toplama

Her dönemin dizileri piksel piksel birleştirilir:

- 3 ya da daha fazla kesit varsa `np.nanmedian`.
- 1 ya da 2 kesit varsa `np.nanmean`.
- Hiç geçerli değeri olmayan piksel NaN kalır.

Medyan seçilmesinin nedeni: aynı dönemdeki pozların dalga boyu birbirinden farklıdır, kaynağın parlaklığı pozdan poza değişir; medyan bu saçılmaya ve maskeden kaçan bozuk piksellere dayanıklıdır.

Sınırlama: kare, dedektörün dalga boyu aralığındaki bir ortalamayı gösterir. İki dönemin pozları aralığın farklı yerlerine düşerse kareler arasında küçük bir parlaklık farkı kalabilir. Bu yüzden `wavelength_um` aralığı her karede raporlanır.

### Adım 7: Kaydır ve topla modu

Amaç, tek karede görünmeyen hızlı ve sönük bir cismi ortaya çıkarmaktır. Tüm dönemlerin kesitleri cismin hareketi geri alınarak tek karede toplanır; cisim tek noktada birikir, sabit yıldızlar dağılır.

Girdiler: `pmra` ve `pmdec` (mas/yıl; `pmra` cos δ çarpanını içerir), `center_epoch` (iş merkezinin ait olduğu tarih, ondalık yıl; servis 2026.0 kullanır).

Her kesit için:

```python
year = 2000.0 + (mjd - 51544.5) / 365.25
dt = year - center_epoch
d_ra_deg = (pmra / 3.6e6) * dt / cos(radians(dec0))
d_dec_deg = (pmdec / 3.6e6) * dt
# Bu kesit, merkezi (ra0 + d_ra_deg, dec0 + d_dec_deg) olan ızgaraya aktarılır.
```

Sonra tüm kesitler medyanla toplanır.

Çıktı iki karedir; arayüz ikisi arasında göz kırpar:

| `n` | İçerik |
|---|---|
| 0 | Sabit toplama: aynı kesitler kaydırılmadan toplanır |
| 1 | Hareketi izleyen toplama |

Ölçülen sonuç (WISE 0855, D6, 45 kesit, öz hareket −8124 ve +673 mas/yıl):

- Tek karede güvenilir tespit yok.
- Hareketi izleyen medyan toplamada tam beklenen konumda nokta kaynak görünür. **Düzeltme (15 Kasım):** burada daha önce "yaklaşık 20σ" yazıyordu; bu abartılıydı. Ampirik açıklık sinyal/gürültü oranı yaklaşık 8σ'dır (WISE 0855: görüntü işleme 8,6σ, backend 8,0σ). Sabit toplama da kaynağı zaten gösterir (yaklaşık 7,6σ); kaydır-topla bunu yalnızca biraz iyileştirir (yaklaşık 8,0σ). Yani WISE 0855 "yalnızca kaydır-topla ile görünür" değildir.
- 43–65 yay saniyesi ötedeki 12 kontrol toplaması −2,1σ ile +2,5σ arasında.
- Paralaks hesaba katılmadı; pikselin çok altında olduğu için gerekmez.

Dönem başına ayrı kaydır-topla kareleri denenmedi; sinyal karede toplanan poz sayısının kareköküyle düşer.

### Adım 8: Fark görüntüsü

`make_diff(frameset, a, b)` aynı ızgaradaki iki toplamı çıkarır: **sonraki eksi önceki**, yani `stack[b] − stack[a]`.

- Sabit yıldızlar büyük ölçüde silinir.
- Yer değiştiren cisim ak-kara çift olarak kalır: yeni konum beyaz, eski konum siyah.
- Parlaklığı değişen yıldız tek renkli leke olarak kalır.
- Görselleştirme sıfır merkezli ve doğrusaldır: sınırlar ±5σ (σ farkın sigma kırpmalı standart sapması), sıfır orta gridir.

Beklenen: Barnard's Star bir yılda 11,4 yay saniyesi kaydı (ölçülen; beklenen 10,3). Yerel ölçekte 1,9 piksel, önerilen ızgarada yaklaşık 3,7 piksel. Hareket neredeyse tam kuzeye doğrudur; çiftin beyaz yarısı üstte olmalıdır.

Parlak yıldızların çevresinde artık kalması normaldir; PSF dalga boyuyla değişir.

### Adım 9: PNG üretimi

Kontrast sınırları iş başına bir kez hesaplanır:

| Değer | Normal mod | Kaydır-topla modu |
|---|---|---|
| `vmin` | medyan − 2σ | medyan − 2σ |
| `vmax` | tüm karelerin 99,9. yüzdeliği | medyan + 40σ |
| Eğri | `AsinhStretch(a=0.1)` | `AsinhStretch(a=0.1)` |

- Medyan ve σ, tüm karelerin piksellerinden sigma kırpmayla hesaplanır.
- Önbellekten çalışırken sınırlar tüm karelerden; canlı işte ilk tamamlanan kareden hesaplanıp dondurulur.
- Bu sayılar başlangıç değeridir; beş hedefte gözle ayarlanır.

```python
import numpy as np
from astropy.visualization import ImageNormalize, AsinhStretch
from PIL import Image

norm = ImageNormalize(vmin=vmin, vmax=vmax, stretch=AsinhStretch(a=0.1), clip=True)
img = np.nan_to_num(norm(stack).filled(0.0), nan=0.0)
img8 = (255 * img).astype(np.uint8)
Image.fromarray(np.flipud(img8), mode="L").save(path)
```

- `np.flipud` zorunludur (kural 5).
- Kapsanmayan pikseller siyah olur.
- PNG ızgara çözünürlüğünde yazılır; büyütmeyi arayüz yapar.
- Renk tersleme ve ek parlaklık ayarı arayüzde yapılır; sunucu yeniden üretmez.

## 7. Fonksiyon arayüzü

```python
load_cutout(path) -> Cutout            # image, mask, wcs, mjd, wavelength_um, detector, obs_id
make_target_wcs(ra, dec, fov_deg, scale_arcsec=3.075) -> (WCS, shape)
reproject_cutout(cutout, wcs, shape) -> ndarray
group_by_epoch(records, gap_days=10) -> list[list[record]]
stack(arrays) -> (stacked, coverage)
make_frames(records, ra, dec, fov_deg, mode="epoch", pmra=None, pmdec=None,
            center_epoch=2026.0, gap_days=10, scale_arcsec=3.075, out_dir=...) -> FrameSet
make_diff(frameset, a, b, out_path) -> None
```

- `mode` değerleri: `epoch`, `shift_add`. `shift_add` için `pmra` ve `pmdec` zorunludur.
- Canlı işler için `make_frames` her kare tamamlandığında haber verebilmelidir (geri çağırma ya da üreteç); servis kareleri geldikçe arayüze sunar.
- Tüm fonksiyonlar ağdan bağımsızdır; yalnızca diskteki dosyaları okur.

| Parametre | Varsayılan | Açıklama |
|---|---|---|
| `fov_deg` | 0.1 | Karenin kenar uzunluğu, derece |
| `scale_arcsec` | 3.075 | Izgara piksel ölçeği |
| `gap_days` | 10 | Dönem ayırma eşiği |
| `center_epoch` | 2026.0 | İş merkezinin tarihi |
| `mode` | `epoch` | Toplama modu |

## 8. Kenar durumları

| Durum | Davranış |
|---|---|
| Kayıt listesi boş | Boş kare kümesi; hata fırlatılmaz, servis `no_coverage` döndürür |
| Bir kesit açılamıyor | Atlanır, sayısı raporlanır; diğerleriyle devam edilir |
| Bir dönemin tüm pikselleri maskeli | Kare üretilir, tamamı siyah; `flagged_fraction` 1.0 |
| Kesit ızgaranın yalnızca bir kısmını kapsıyor | Kapsanmayan pikseller NaN; toplamada diğer kesitler doldurur |
| Kesitlerin işleme sürümü farklı | Birlikte toplanır; DR1 ve QR3 tek tip işlenmiş bir settir |
| `shift_add` istenmiş, öz hareket verilmemiş | `ValueError`; servis `bad_input` döndürür |
| Çok sayıda kesit (R Draconis: 2493) | Dedektör başına işlenir; diziler küçük olduğu için bellek sorunu beklenmez, süre ölçülmedi |

## 9. Doğrulama

| Test | Yöntem | Beklenen |
|---|---|---|
| Yön | Barnard's Star karelerinde yıldızın hareket yönü | Zamanla yukarı (kuzeye) kayar |
| Hizalama | Alan yıldızlarının merkezleri kareler arasında | 0,3 yerel pikselden az oynar |
| Barnard's Star kayması | İlk ve son dönem merkezleri | Yılda yaklaşık 10–11 yay saniyesi |
| Barnard's Star farkı | `make_diff(ilk, son)` | Üstte beyaz, altta siyah çift |
| WISE 0855 | D6, `shift_add`, −8124 ve +673 mas/yıl | Kare 1'de merkezde nokta kaynak; kare 0'da yok |
| WISE 0855 kontrolü | Aynı işlem, öz hareket işareti ters | Merkezde kaynak yok |
| Doyma koruması | Barnard's Star çekirdeği | Parlak, delik yok |
| Kontrast tutarlılığı | Aynı işin iki karesinde aynı alan yıldızı | Benzer gri düzeyi |
| Değişen yıldız | R Draconis kareleri | Dönemler arasında belirgin parlaklık farkı |
| Sentetik | Bilinen kaymayla yapay nokta kaynak eklenmiş diziler | Kayma 0,2 piksel içinde geri bulunur |

Hazır veri: Barnard's Star için 64, WISE 0855 için 48 kesit `E:\nasa\feasibility\data\cutouts` altında. Bu dosyalarda PSF tablosu duruyor; okurken yok sayın.

Başvuru betikleri `E:\nasa\feasibility\scripts` içinde: `cutlib.py` (okuma ve indirme), `an_wise.py` (hareketi izleyen toplama), `wise_control.py` (kontrol toplamaları), `an_barnard.py` (merkez ölçümü), `flaglist.py` (bayrak adları). Karşılaştırma görüntüleri `E:\nasa\feasibility\out` içinde.

## 10. İş sırası

**Cumartesi akşam**

- [ ] Veri hattı sorumlusuyla kayıt biçimini kararlaştırmak
- [ ] `load_cutout`: okuma, arka plan, maske
- [ ] `make_target_wcs` ve `reproject_cutout`; tek kesitte yön kontrolü

**Cumartesi gece**

- [ ] `group_by_epoch`, `stack`, PNG üretimi
- [ ] Barnard's Star D6 için uçtan uca kareler; servis sorumlusuna teslim

**Pazar sabah**

- [ ] Kaydır ve topla; WISE 0855 doğrulaması
- [ ] Fark görüntüsü; Barnard's Star doğrulaması
- [ ] Maske politikasını ve kontrastı beş hedefte ayarlamak

**Pazar öğleden sonra**

- [ ] Beş hedefin her dedektörü için kareleri önceden üretmek
- [ ] Doğrulama görüntülerini test ve teslim sorumlusuna vermek

**Pazar 18:00: kod dondurma**

## 11. Teslim ve kabul ölçütleri

| Teslim | Kabul ölçütü |
|---|---|
| `make_frames` (normal mod) | Barnard's Star D6'da en az 3 kare; sabit yıldızlar yerinde, hedef kuzeye kayıyor |
| `make_frames` (kaydır-topla) | WISE 0855 D6'da kaynak merkezde görünüyor |
| `make_diff` | Barnard's Star'da ak-kara çift görünüyor |
| Metadata | Her karede bölüm 5.2'deki tüm alanlar dolu |
| Önceden üretilmiş kareler | Beş hedef için sunucuda hazır |
| Kısa İngilizce yöntem notu | Proje sayfası için beş altı cümle: hizalama, toplama, kaydır-topla, fark |

## 12. Riskler ve açık kararlar

| Konu | Durum |
|---|---|
| Bayrak bitlerinin kesin anlamı | Adlardan tahmin edildi; Explanatory Supplement'tan doğrulanmalı |
| Izgara ölçeği (3,075 ya da 6,15) | Öneri 3,075; ilk karelerde gözle karar verilir |
| Kontrast sayıları | Başlangıç değeri; beş hedefte ayarlanacak |
| Sunucu tarafında kontrast parametresi | Şimdilik yok; arayüz CSS ile ayarlıyor. İstenirse `stacks.npz` üzerinden eklenir |
| Dönem başına kaydır-topla | Denenmedi; zaman kalırsa |
| Epsilon Indi B | Yakınında parlak bir yıldız var; saçılan ışık ve hayalet görüntü beklenebilir, ölçülmedi |

**Zaman kalırsa**

- Dedektörleri renk kanalı yaparak renkli kare (örneğin D2 mavi, D4 yeşil, D6 kırmızı).
- Bir dedektörün dalga boyu aralığını alt dilimlere bölüp dilim başına kare.
- Kare başına kapsama haritasını metadata olarak sunmak.
