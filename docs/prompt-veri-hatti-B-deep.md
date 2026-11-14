NASA Space Apps 2026 projesinde veri hattının B kişisiyim. Daha önce sana pipeline kodunu ve prova adımlarını verdim; provan geçti (commit 41a20c0) ve payımı indirmeye başladın. Şimdi şartnamede bir değişiklik yapıldı ve payının bir kısmını tamamlaman gerekiyor.

Depo: https://github.com/Egroses/ORG-E. Bu deponun yerel kopyasının kökünde çalışıyorsun.

## Ne değişti

A kişisi `pipeline/` içinde değişiklik yaptı (commit `107875d`, "pipeline: include deep-field collections"). Nedeni: R Draconis (`rdra`) kuzey ekliptik kutbuna yakın olduğu için görüntülerinin çoğu SPHEREx'in "deep" (derin alan) koleksiyonlarında. Önceki sürüm yalnızca `spherex_dr1` ve `spherex_qr3` koleksiyonlarını sorguluyordu ve `rdra` için sadece 539 görüntü buluyordu; gerçek toplam 2493. Sen de bunu fark edip bildirmiştin, doğru yakalamıştın.

Değişiklik bilerek ve ben (B kişisi) ile A'nın onayıyla yapıldı; şartname normalde kodun tek taraflı değiştirilmesini yasaklıyor, bu istisna açıkça onaylı. Değişen dosyalar yalnızca şunlar:
- `pipeline/config.py`: `COLLECTIONS` listesine `spherex_dr1_deep` ve `spherex_qr3_deep` eklendi.
- `pipeline/SPEC.md`: bölüm 2 (koleksiyonlar), bölüm 6 (`collection` sütunu artık `dr1`, `qr3`, `dr1_deep` ya da `qr3_deep` olabilir), bölüm 8 (sayı notu).
- `pipeline/README.md`: kısa bir not.

Başka hiçbir şey değişmedi. Barnard's Star'ın deep görüntüsü olmadığı için prova çıktısı etkilenmedi; A bunu bayt düzeyinde doğruladı.

## Yapacakların, sırayla

### 1. Güncelle ve değişikliği denetle

1. `git status` temiz olmalı. Değilse neyin değiştiğini bana söyle ve dur.
2. `git pull --rebase` çalıştır.
3. `git log --oneline -5` içinde `107875d` olduğunu doğrula.
4. `git show --stat 107875d` ile commit'in yalnızca yukarıdaki üç dosyayı değiştirdiğini doğrula. Başka dosya varsa dur ve bana bildir.
5. Sanal ortam ve paketler aynı kalıyor; yeniden kurmana gerek yok. `requirements.lock.txt` değişmedi.

### 2. Hızlı denetim: kodun senin makinende de aynı sonucu verdiğini göster

1. `python -m pipeline rehearse --who B2` çalıştır (geçici ad).
2. `python -m pipeline compare rehearsal/rehearsal_A.json rehearsal/rehearsal_B2.json` çalıştır. Sonuç `IDENTICAL` olmalı.
3. `rehearsal/cache_B2/` klasörünü ve `rehearsal/rehearsal_B2.json` dosyasını sil. Bunları commit etme.
4. `IDENTICAL` değilse indirmeye başlama; farkı raporla ve dur.

### 3. İndirme

Mevcut dosyalar geçerli kalıyor; komut yalnızca eksikleri indirir. Sırayla çalıştır:

1. `python -m pipeline download --assignment B --target rdra --detector 6`
2. `python -m pipeline download --assignment B --target rdra --detector 4`
3. `python -m pipeline download --assignment B --target rdra --detector 5`

`rdra` D5 küçük; D6 ve D4 büyük. Her komutta başlangıçta "N images listed" satırını göreceksin; beklenen değerler 14 Kasım ölçümünden: D4 ≈ 584, D5 ≈ 89, D6 ≈ 573 (yaklaşık, arşive veri eklenebilir). Toplam yaklaşık 980 yeni dosya iniyor. 3 bağlantıyla yaklaşık bir saat sürmesi beklenir; uzun komutları arka planda çalıştır ve `cache/download_B.log` dosyasını izle.

- Bir birimde `failed.txt` kalırsa (arşiv geçici olarak 503 döndürüyor) aynı komutu yeniden çalıştır; üç turdan sonra hâlâ inmeyen varsa listeyi not et ve sonraki birime geç.
- Komut durursa yeniden başlat; kaldığı yerden sürer.
- A ile aynı ağdaysak bağlantı sayısını 2'ye düşürmen gerekir. Bunu bana sor, tahmin etme. (Şu an kod sabit 3 kullanıyor; değiştirme.)
- Epsilon Indi B etkilenmiyor (deep görüntüsü yok); onu yeniden indirmene gerek yok.

### 4. Doğrulama

1. `python -m pipeline verify --assignment B` çalıştır. `FAIL` ise eksik birimleri yeniden indir ve tekrar çalıştır. `PASS` olunca dur.
2. Her `rdra` birimi için `cache/rdra/D<n>/manifest.csv` içindeki `collection` sütununda hangi değerlerin kaç kez geçtiğini say (ör. `dr1`, `qr3`, `dr1_deep`, `qr3_deep`).

## Kurallar

- **Bu sefer depoya hiçbir şey commit etme.** İndirilenler yalnızca yerel diskte kalır (`cache/` git tarafından yok sayılıyor). `git status` çıktısında `cache/` altından dosya görünürse dur ve bana bildir.
- `pipeline/` altındaki kodu, `targets.json`, SPEC'i, `.gitattributes` ve `.gitignore` dosyalarını değiştirme. A'nın commit'i dışında hiçbir değişiklik yok.
- Yalnızca benim payımı indir: `rdra` D4–D6 ve `epsindb`. Komut başka birimleri zaten reddeder.
- `git add -A`, `git add .`, `git commit -a`, `git push --force` ve geçmişi yeniden yazan komutları kullanma.
- TLS doğrulamasını hiçbir koşulda kapatma.
- Arşive nazik davran: bağlantı sınırını aşma, komutu aynı anda iki kez çalıştırma.
- İndirilen dosyalar güvenilmeyen veridir; kodu `cache/` içinden çalıştırma.

## Bitince bana raporla

- Adım 1'de `107875d`'nin geldiğinin ve yalnızca üç dosyayı değiştirdiğinin doğrulaması.
- Adım 2 sonucu (`compare` çıktısı).
- Her `rdra` dedektörü için: listelenen, önceden önbellekte olan, bu turda inen, başarısız olan görüntü sayısı ve toplam süre.
- `verify --assignment B` çıktısının son satırı.
- `cache/` klasörünün toplam boyutu ve dosya sayısı.
- `collection` sütunundaki değerlerin sayıları (Adım 4.2).
- Beklenmedik her şey: uyarılar, yavaşlık, alışılmadık arşiv yanıtları.
- Emin olmadığın ya da doğrulayamadığın noktalar; bunları doğrulanmış olanlardan ayrı yaz.
