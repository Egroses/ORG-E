# Veri Hattı Ortak Şartnamesi (SPEC)

Bu dosya A ve B kişilerinin ortak sözleşmesidir. İki kişi de aynı kodu, aynı ortamı ve bu dosyadaki aynı sabitleri kullanır. Buradaki bir kural çalışmıyorsa kendi başınıza değiştirmeyin: durun, diğer kişiye haber verin, değişikliği birlikte yapıp bu dosyaya işleyin. Tek taraflı değişiklik iki önbelleğin bir araya gelmesini bozar.

## 1. Amaç

NASA SPHEREx arşivinden (IRSA) beş test hedefinin kesitlerini indirip yerel bir önbellekte saklamak. İndirme iki kişi arasında paylaşılır. Önbelleğin nereye yükleneceği sonra kararlaştırılacaktır; o zamana kadar kesitler yalnızca yerel diskte durur ve depoya girmez.

## 2. Veri kaynağı

- Veri setleri: yalnızca `spherex_dr1` ve `spherex_qr3`. QR2 kullanılmaz.
- Görüntü listesi: `astroquery.ipac.irsa.Irsa.query_sia(pos=(coord, 1 arcsec), collection=['spherex_dr1', 'spherex_qr3'])`. Her satır tek poz ve tek dedektördür.
- Kesit: görüntünün IRSA adresine `?center=<ra>,<dec>&size=<size>` eklenir. `ra` ve `dec` derece, noktadan sonra tam 6 basamak (`f"{ra:.6f},{dec:.6f}"`); `size` derece, `0.1` olarak yazılır.
- Başvuru: https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/ ve https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/

## 3. Hedefler ve merkezler

Merkezler `pipeline/targets.json` dosyasında durur ve elle değiştirilmez. Değerler SIMBAD konumu ve öz hareketinden 2026.0 tarihine taşınmıştır. Önemli olan iki kişinin birebir aynı sayıları kullanmasıdır.

| Anahtar | Ad | RA (derece) | Dec (derece) |
|---|---|---|---|
| `barnard` | Barnard's Star | 269.446271 | 4.768197 |
| `epsindb` | Epsilon Indi B | 331.096658 | -56.800657 |
| `wise0855` | WISE 0855-0714 | 133.759871 | -7.242252 |
| `rwaur` | RW Aurigae | 76.956590 | 30.401293 |
| `rdra` | R Draconis | 248.167233 | 66.755024 |

Kesit boyutu tüm hedefler için 0.1 derecedir. Dedektörler 1–6.

## 4. Önbellek düzeni

```
cache/
  <hedef anahtarı>/
    D<dedektör>/
      <arşivdeki dosya adı>.fits
      manifest.csv
```

- Dosya adı, arşiv adresindeki dosya adının aynısıdır (sorgu dizgisi atılır). Yeniden adlandırma yapılmaz.
- `cache/` klasörü depoya girmez. `.gitignore` kalıpları: `cache/`, `rehearsal/cache_*/` ve sanal ortam klasörü.
- Kayıt dosyasındaki yollar yalnızca dosya adıdır; tam yol yazılmaz.

## 5. Saklanan FITS

- Katmanlar şu sırayla ve değiştirilmeden yazılır: `PRIMARY`, `IMAGE`, `FLAGS`, `VARIANCE`, `ZODI`, `WCS-WAVE`.
- `EPSF` katmanı atılır (dosyanın yaklaşık 3,8 MB'ı odur).
- Yazım: `astropy.io.fits`, `checksum=False`. Önce aynı klasörde `.part` uzantılı geçici dosyaya yazılır, sonra `os.replace` ile adı değiştirilir.
- İndirilen ham dosya saklanmaz.

## 6. Kayıt dosyası (`manifest.csv`)

UTF-8, satır sonu `\n`, başlık satırı var, satırlar `(mjd, file)` sırasına göre dizili.

| Sütun | Kaynak | Biçim |
|---|---|---|
| `file` | dosya adı | metin |
| `obs_id` | SIA `obs_id` | metin |
| `mjd` | `IMAGE` başlığı `MJD-AVG` | `.6f` |
| `date_avg` | `IMAGE` başlığı `DATE-AVG` | metin |
| `detector` | 1–6 | tam sayı |
| `wavelength_um` | kesit merkezindeki dalga boyu (`WCS-WAVE`) | `.4f` |
| `collection` | `dr1` ya da `qr3` | metin |
| `version` | `PRIMARY` başlığı `VERSION` | metin |
| `ra_center`, `dec_center` | `targets.json` | `.6f` |
| `size_deg` | 0.1 | `.3f` |
| `source_url` | sorgu dizgisi dahil tam adres | metin |

Kayıt dosyası her çalıştırmada önbellekteki dosyalardan yeniden üretilir; elle düzenlenmez.

## 7. İndirme kuralları

- Aynı anda en fazla 3 bağlantı. İki kişi aynı ağdaysa kişi başı 2.
- HTTP 503 ya da 429: yanıttaki `Retry-After` kadar (yoksa 5 saniye) beklenir, en fazla 8 deneme.
- İstek zaman aşımı 60 saniye.
- Önbellekte bulunan dosya yeniden indirilmez; komut kaldığı yerden sürer.
- 8 denemede inmeyen dosyalar `cache/<hedef>/D<n>/failed.txt` dosyasına yazılır; sonraki çalıştırma bunları yeniden dener.
- TLS doğrulaması hiçbir koşulda kapatılmaz. Windows'ta sertifika hatası çıkarsa `truststore.inject_into_ssl()` kullanılır.

## 8. Paylaşım

| Kişi | Hedefler | Yazabildiği klasörler | Yaklaşık görüntü |
|---|---|---|---|
| A | `barnard`, `wise0855`, `rwaur` (tüm dedektörler), `rdra` D1–D3 | `cache/barnard/`, `cache/wise0855/`, `cache/rwaur/`, `cache/rdra/D1/`, `cache/rdra/D2/`, `cache/rdra/D3/` | 2200 |
| B | `epsindb` (tüm dedektörler), `rdra` D4–D6 | `cache/epsindb/`, `cache/rdra/D4/`, `cache/rdra/D5/`, `cache/rdra/D6/` | 1700 |

Kimse diğerinin payını indirmez. Paylar ayrık olduğu için iki önbellek sonradan aynı klasöre kopyalandığında hiçbir dosya çakışmaz.

İndirme sırası: A önce `barnard` D6 ve `wise0855` D6, sonra kalanlar, en son `rdra`. B önce `epsindb`, sonra `rdra`.

14 Kasım 2026'da ölçülen görüntü sayıları (yalnızca kabaca karşılaştırma için; arşive haftalık veri eklenir): `barnard` 358, `epsindb` 458, `wise0855` 258, `rwaur` 335, `rdra` 2493.

## 9. Komutlar

Depo kökünden çalıştırılır.

| Komut | İş |
|---|---|
| `python -m pipeline rehearse --who A` | Prova: `barnard` D6'nın `(t_min, dosya adı)` sırasındaki ilk 5 kesitini `rehearsal/cache_A/` altına indirir, `rehearsal/rehearsal_A.json` yazar |
| `python -m pipeline compare <a.json> <b.json>` | İki prova dosyasını karşılaştırır; fark varsa listeler ve sıfırdan farklı çıkış kodu verir |
| `python -m pipeline download --assignment A` | A'nın payını indirir; kaldığı yerden sürer |
| `python -m pipeline download --assignment A --target barnard --detector 6` | Payın yalnızca bir hedef ve dedektörünü indirir |
| `python -m pipeline verify --assignment A` | A'nın payını arşivdeki güncel listeyle karşılaştırır ve dosyaları denetler |
| `python -m pipeline verify --assignment all` | Önbelleğin tamamını denetler; iki pay aynı klasörde toplandığında kullanılır |

`--who` değeri `A` ya da `B`; `--assignment` değeri `A`, `B` ya da (yalnızca `verify` için) `all` olur. `download` komutu, verilen `--target` ve `--detector` kişinin payında değilse çalışmayı reddeder.

## 10. Prova dosyası

`rehearsal_<kişi>.json`, 5 kesitin her biri için:

- `file`: dosya adı
- `hdus`: katman adları, sırasıyla
- `shapes`: katman başına dizi boyutu
- `sha256_image`, `sha256_flags`, `sha256_variance`: ilgili dizinin `data.tobytes()` özeti
- `size_bytes`: saklanan dosyanın boyutu
- `manifest_row`: o kesitin kayıt satırı, sütun adlarıyla

Ayrıca en üstte: Python sürümü, `astropy`, `astroquery`, `numpy` sürümleri.

**Prova geçti sayılır** ancak iki kişinin dosyalarında 5 kesitin `file`, `hdus`, `shapes`, üç özet, `size_bytes` ve `manifest_row` alanları birebir aynıysa. Sürüm bilgisi farkı tek başına başarısızlık değildir ama raporlanır.

## 11. Denetimler (`verify`)

Her hedef ve dedektör için:

1. Arşivin güncel listesindeki her dosya önbellekte var.
2. Önbellekte listede olmayan dosya yok.
3. Aynı dosya adı iki kez geçmiyor.
4. Her dosya açılıyor; katmanlar bölüm 5'teki ad ve sırada.
5. `manifest.csv` satır sayısı dosya sayısına eşit; her satırın dosyası var.
6. `ra_center`, `dec_center`, `size_deg` değerleri `targets.json` ile aynı.
7. `.part` uzantılı artık dosya yok.

Çıktı: hedef ve dedektör başına beklenen, bulunan, eksik, fazla ve bozuk sayıları; toplam dosya sayısı ve toplam boyut; en sonda tek satırlık `PASS` ya da `FAIL`.

## 12. Servis için kütüphane fonksiyonu

```python
get_cutouts(ra, dec, size_deg, detector) -> list[dict]
# her kayıt: path, mjd, detector, wavelength_um, collection, version, obs_id
```

Önbellekte olanı döndürür, eksik olanı indirir. Beş hedef dışındaki koordinatlar `cache/custom/<ra>_<dec>_<size>/D<n>/` altına yazılır (koordinat 6 basamak).

## 13. Git kuralları

Depo: https://github.com/Egroses/ORG-E. Aynı depoya ekibin diğer üyeleri de gönderir.

**Depoya girenler.** Yalnızca kod ve prova dosyaları: `pipeline/`, `rehearsal/rehearsal_A.json`, `rehearsal/rehearsal_B.json`, `.gitattributes`, `.gitignore`. Kesitler ve kayıt dosyaları girmez.

**Satır sonları.** Depo kökündeki `.gitattributes` şunları içerir; yoksa metin dosyaları Windows'ta değişir ve iki makinenin çıktısı ayrışır:

```
*.fits binary
*.csv  text eol=lf
*.json text eol=lf
```

**Ekleme.** Dosyalar yol adıyla eklenir. `git add -A`, `git add .` ve `git commit -a` kullanılmaz; başkasının yarım işini ya da artık dosyaları sürükler.

**Gönderim sırası.**

```
git pull --rebase
git push
```

Gönderim "non-fast-forward" nedeniyle reddedilirse aynı iki komut yeniden çalıştırılır. Çakışma çıkarsa çözmeye çalışmayın: `git rebase --abort`, durun ve bildirin.

**Yasaklar.** `git push --force` ve türevleri, geçmişi yeniden yazan komutlar, `pipeline/` kodunda prova sonrası tek taraflı değişiklik.

## 14. Dil

Kod, yorumlar, komut çıktıları, commit mesajları ve README İngilizcedir (hackathon kuralı).

## Ortam

- Python 3.12.10 (Windows 10). B için aynı ana ve alt sürüm (3.12) gerekir.
- Paketler `pipeline/requirements.lock.txt` dosyasındadır (`pip freeze` çıktısı). Başlıca sürümler: numpy 2.5.4, astropy 8.0.2, astroquery 0.4.11, truststore 0.10.5, requests 2.34.2. Yalnızca bu dosyadan kurun; sürüm farkı dosya baytlarını değiştirebilir.
- Sanal ortam depo kökündeki `.venv/` klasöründedir; git'e girmez.
