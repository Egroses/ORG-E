# Kullanılan kaynaklar

Sky Quest'te kullanılan veri, servis, yazılım ve araçların listesi (Space Apps kuralı: kullanılan her kaynak anılmalı).
Listeyi depodaki kodlara ve bağımlılık dosyalarına bakarak çıkardık; kütüphanelerin lisanslarını tek tek kontrol etmedik.
Teslim formu İngilizce olmalı, o yüzden bu listeden İngilizce bir "References" metni üretilecek.

## 1. Veri ve çevrimiçi servisler (çalışma anında)

| Kaynak | Ne için | Nerede |
| --- | --- | --- |
| **SPHEREx Level 2 görüntüleri** (DR1, QR3, deep), NASA/IPAC Infrared Science Archive (**IRSA**) | Tüm piksel verisi (IMAGE, ZODI, FLAGS, VARIANCE, dalga boyu tablosu) | `pipeline/archive.py` (`Irsa.query_sia`, kesit servisi), `cache/` önbelleği |
| **AWS Open Data: `nasa-irsa-spherex` kovası** (IRSA'nın SPHEREx dosyalarının herkese açık kopyası) | Önbellekte olmayan konumlar için kesitleri bayt aralığı (HTTP range) istekleriyle okumak | `pipeline/s3.py` |
| **Gaia DR3**, ESA arşivi (`gea.esac.esa.int`), yedek: GAVO yansısı (`dc.zah.uni-heidelberg.de`) | Katalog bindirmesi, öz hareket | `backend/app/gaia.py`, beş hedef için `backend/app/gaia_fields/*.csv` |
| **CatWISE2020**, IRSA TAP, yedek: NOIRLab Astro Data Lab (`datalab.noirlab.edu`) | WISE bindirmesi, öz hareket | `backend/app/catwise.py`, `backend/app/catwise_fields/*.csv` |
| **SIMBAD**, CDS Strasbourg ve Harvard yansısı | Ad çözümleme | `backend/app/resolve.py` |
| **Aladin Lite (CDS)** | Yalnızca "Aladin'de aç" bağlantısı | `frontend/src/lib/format.ts` |
| **Google Fonts: Inter, JetBrains Mono** | Yazı tipleri (ziyaretçinin tarayıcısı Google'a bağlanır) | `frontend/index.html` |

## 2. Yazılım kütüphaneleri

- **Backend:** FastAPI, Uvicorn, Pydantic, NumPy, Pillow, **Astropy**, Requests, truststore, **astroquery 0.4.11**.
  Testler: pytest, httpx. (`backend/requirements.txt`)
- **Pipeline bağımlılıkları** (`pipeline/requirements.lock.txt`): PyVO, astropy-iers-data, pyerfa, beautifulsoup4, html5lib, keyring,
  PyYAML, certifi, urllib3, idna, charset-normalizer, packaging, typing_extensions ve diğer geçişli bağımlılıklar.
- **Arayüz (çalışırken):** React 19, React DOM.
- **Arayüz (geliştirme):** Vite, TypeScript, Vitest, oxlint, `@vitejs/plugin-react`, `@types/*`. (`frontend/package.json`)

## 3. Geliştirme araçları (ürünle birlikte teslim edilmeyenler)

- Playwright (tarayıcı testi), GitHub CLI, Node.js, Git.
- **Claude / Claude Code (Anthropic):** kodun, belgelerin ve metinlerin önemli bir kısmı yapay zekâ desteğiyle, insan yönlendirmesi ve
  incelemesiyle yazıldı. Yarışma kuralı gereği yapay zekâ kullanımı beyan edilir.

## 4. Fikir ve belge kaynakları

- Challenge metni ve test hedefleri listesi (NASA Space Apps Challenge 2026, "Planet X and SPHEREx").
- **WiseView** ve **Backyard Worlds**: challenge'ın örnek gösterdiği araçlar. Yanıp sönme (blink) karşılaştırması fikri ve WiseView'ın
  parametre listesi bazı ayarlarımıza ilham verdi. Kodları kullanılmadı.
- IRSA SPHEREx belgeleri ve eğitim defterleri (challenge'ın kaynak listesinde). `backend/docs/spherex-data.md` bunlara dayanıyor
  olabilir, doğrulanmadı.

## 5. Notlar

- `frontend/public/icons.svg` büyük olasılıkla Vite başlangıç şablonundan kalmış ve `src/` içinde kullanılmıyor, silinebilir.
  `favicon.svg` ekip tarafından çizilmiş görünüyor.
- Depo lisansı: MIT (`LICENSE`).
