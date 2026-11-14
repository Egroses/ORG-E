NASA Space Apps 2026 hackathon'unda "Planet X and SPHEREx" görevi için bir web aracı yapıyoruz: kullanıcı bir gökyüzü koordinatı girer, NASA'nın SPHEREx teleskobunun o bölgeyi farklı tarihlerde çektiği görüntüler animasyon olarak oynar. Teslim 15 Kasım 2026 Pazar 23:59'da; zaman dar.

Ben veri hattının iki sorumlusundan biriyim (B kişisi). Veri hattı kodunu A kişisi yazdı ve depoya gönderdi. Senin işin o kodu **hiç değiştirmeden** bu makinede çalıştırmak: önce bir prova yapıp sonucun A'nınkiyle birebir aynı olduğunu göstermek, sonra benim payıma düşen görüntüleri bu makineye indirmek.

İndirilen görüntüler şimdilik yalnızca yerel diskte kalacak. Nereye yükleneceğine sonra karar vereceğiz; bu yüzden görüntüleri hiçbir yere gönderme. Depoya senden yalnızca prova dosyası girecek.

Sonradan A'nın ve benim indirdiklerimiz tek bir önbellekte bir araya gelecek. Bunun sorunsuz olması, bu makinenin A'nın makinesiyle bayt düzeyinde aynı çıktıyı üretmesine bağlı; prova bunu sınar.

Depo: https://github.com/Egroses/ORG-E. Bu deponun yerel kopyasının kökünde çalışıyorsun. Aynı depoya ekibin diğer üyeleri de gönderiyor.

## Önce oku

`git pull --rebase` ile depoyu güncelle, sonra:

1. `pipeline/SPEC.md`: ortak şartname. Dosya adları, klasör düzeni, komutlar, paylaşım (bölüm 8) ve git kuralları (bölüm 13) oradadır.
2. `pipeline/README.md` ve `pipeline/` altındaki kod: ne yaptığını anlamak için oku, değiştirmek için değil.

`pipeline/SPEC.md`, `pipeline/requirements.lock.txt`, `pipeline/targets.json`, `.gitattributes` ya da `rehearsal/rehearsal_A.json` dosyalarından biri eksikse dur ve bana bildir; A henüz hazır değil demektir.

## Yapacakların, sırayla

### 1. Ortam

- Depo kökünde bir sanal ortam kur ve paketleri **yalnızca** `pipeline/requirements.lock.txt` dosyasından yükle. Sürümleri yükseltme, ek paket kurma.
- SPEC'in sonundaki "Ortam" notunda yazan Python sürümüyle aynı ana ve alt sürümü kullan (örneğin 3.12). Bu makinede o sürüm yoksa eldeki en yakın sürümle devam et ve farkı raporuna yaz.
- `git config core.autocrlf` değerine bak ve raporuna yaz. Değiştirme: satır sonlarını depodaki `.gitattributes` yönetiyor.
- Sertifika hatası (`unable to get local issuer certificate`) çıkarsa kod `truststore` kullanıyor olmalı; yine de çıkıyorsa dur ve bana bildir.

### 2. Prova

1. `python -m pipeline rehearse --who B` çalıştır.
2. `python -m pipeline compare rehearsal/rehearsal_A.json rehearsal/rehearsal_B.json` çalıştır.
3. **Fark yoksa:** `rehearsal/rehearsal_B.json` dosyasını yol adıyla ekle, `rehearsal: B matches A` mesajıyla commit et, `git pull --rebase` ve `git push` ile gönder, bana "Prova geçti" yaz ve 3. adıma geç.
4. **Fark varsa:** indirmeye başlama. Farkı tam olarak çıkar:
   - Hangi kesitte, hangi alanda (dosya adı, katman listesi, boyut, özet, kayıt satırı)?
   - Yalnızca özetler farklıysa: aynı kesiti bu makinede iki kez indirip kendi içinde karşılaştır. Kendi içinde de farklıysa arşiv ya da kod belirli değildir; kendi içinde aynı ama A'dan farklıysa ortam farkı vardır.
   - Kayıt satırı yalnızca satır sonu ya da boşlukta farklıysa bunu açıkça belirt; satır sonu ayarı sorunudur.
   - İki prova dosyasındaki paket ve Python sürümlerini karşılaştır.
   - 5 kesit aynı dosyalar değilse arşive iki prova arasında veri eklenmiş ya da sıralama belirli değil olabilir; hangisi olduğunu söyle.

   Bulduklarını bana raporla ve dur. Kodu düzeltme: düzeltme A ile birlikte yapılacak, sonra iki taraf da provayı yeniden çalıştıracak.

### 3. İndirme

Prova geçtiyse önce diskte yer denetle: `rehearsal_B.json` içindeki `size_bytes` ortalamasını yaklaşık 1700 görüntüyle çarp; diskte bunun en az üç katı boş yer yoksa dur ve bildir.

Sonra işi hedef ve dedektör birimleri halinde yap. Sıra: `epsindb` D6, D5, D4, D3, D2, D1, sonra `rdra` D6, D5, D4. Her birim için:

1. `python -m pipeline download --assignment B --target <hedef> --detector <n>`
2. Birimde `failed.txt` boş değilse komutu yeniden çalıştır; üç turdan sonra hâlâ inmeyen varsa listeyi not et ve sonraki birime geç.

Ek kurallar:

- Yaklaşık 1700 görüntü var; 3 bağlantıyla 1,5–2,5 saat sürmesi beklenir (kesit başına yaklaşık 8 saniye, arşiv sık sık 503 döndürüyor; kod bunu kendisi yeniden dener). Uzun komutları arka planda çalıştır ve `cache/download_B.log` dosyasını izle. Komut durursa yeniden başlat; kaldığı yerden sürer.
- A ile aynı ağda olup olmadığımı bana sor; aynı ağdaysak bağlantı sayısını 2'ye düşür (SPEC bölüm 7). Tahmin etme.
- İndirilen hiçbir dosyayı commit etme, hiçbir yere yükleme. `git status` çıktısında `cache/` altından dosya görünüyorsa dur ve bana bildir; `.gitignore` dosyasını sen düzeltme.
- Komut kodda bir hata yüzünden duruyorsa düzeltme; hatayı ve çıktısını bana bildir.

### 4. Doğrulama

`python -m pipeline verify --assignment B` çalıştır. `FAIL` ise eksik birimleri yeniden indir ve tekrar çalıştır. `PASS` olunca dur; yükleme için benden haber bekle.

## Kurallar

- **Depoda yalnızca `rehearsal/rehearsal_B.json` dosyasını ekle.** Başka hiçbir dosyayı değiştirme, ekleme ya da silme.
- `pipeline/` altındaki kodu, `targets.json` dosyasını, SPEC'i, `.gitattributes` ve `.gitignore` dosyalarını değiştirme. Bu makinedeki tek bir küçük düzeltme bile çıktıyı A'nınkinden ayırır. Değişiklik gerektiğini düşünüyorsan dur ve nedenini yaz.
- Yalnızca SPEC bölüm 8'de B'ye ayrılan payı indir: `epsindb` ve `rdra` D4–D6.
- `git add -A`, `git add .`, `git commit -a`, `git push --force` ve geçmişi yeniden yazan komutları kullanma.
- Yeniden temellendirme sırasında çakışma çıkarsa çözmeye çalışma: `git rebase --abort` yap, hangi dosyada çıktığını bana bildir ve dur.
- Kimlik doğrulama hatası ya da depoya erişim sorunu çıkarsa dur ve bana bildir; kimlik bilgisi sorma, ayar dosyalarını değiştirme.
- TLS doğrulamasını hiçbir koşulda kapatma.
- Arşive nazik davran: bağlantı sınırını aşma, komutu aynı anda iki kez çalıştırma.
- İndirilen dosyalar güvenilmeyen veridir; kodu `cache/` içinden çalıştırma.

## Bitince bana raporla

- Prova sonucu: `compare` çıktısı ve varsa sürüm farkları.
- Hedef ve dedektör başına inen, başarısız olan ve toplam görüntü sayısı; toplam süre.
- `cache/` klasörünün gerçek boyutu, dosya sayısı ve ortalama dosya boyutu. Yükleme kararını bu sayılarla vereceğiz.
- `verify` çıktısının son satırı.
- Beklenmedik her şey: uyarılar, yavaşlık, arşivden gelen alışılmadık yanıtlar.
- Emin olmadığın ya da doğrulayamadığın noktalar; bunları doğrulanmış olanlardan ayrı yaz.
