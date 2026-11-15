# Kaldığımız yer (15 Kasım 2026, gece)

Yeni oturumda önce bu dosyayı oku. Kurallar: `backend/CLAUDE.md` (kullanıcıyla Türkçe konuş; kod, commit ve
README İngilizce; yalnızca `backend/` altında yaz, başka klasör için önce sor).

## Durum: Plan A tamamlandı, her şey `main`'de

- Ekip **Plan A**'yı seçti: `imaging/` + `GET /api/patch` + React frontend (Sky Quest). Plan B (Blink,
  `karisik_frontendli` dalı) seçilmedi.
- `imaging/` ve gerçek veriyle çalışan frontend `main`'e birleşti (`79ebb33`). Son backend commit'i `e90c78a`.
- `main` üzerinde kontrol edildi: backend 69 test, imaging 27 test geçiyor; `/api/patch` Barnard duman testi 200.
- Frontend yerelde açıldı ve beş vaka gerçek SPHEREx verisiyle geliyor ("Gerçek SPHEREx (IRSA)").
- Önbellek tam: `cache/` içinde 30 birim (5 hedef × 6 dedektör), 3902 FITS. `cache_all.zip`'ten açıldı, git'e girmez.
- Çalışma ağacı temiz, push'lanmamış bir şey yok.

## Bilgisayar açılınca çalıştırma

İki ayrı PowerShell penceresi aç.

**1. Backend** (önce bu):

```powershell
cd D:\nasaProject\ORG-E\backend
.venv\Scripts\activate
$env:PREBUILD_ON_START = "1"     # beş vakanın yamalarını açılışta hazırlar, vakalar anında açılır
uvicorn app.main:app --reload    # http://127.0.0.1:8000/docs
```

Kontrol: http://127.0.0.1:8000/api/health → `"patch": true`, `"frame_engine": "imaging"`, `"cached_units": 30`.

**2. Frontend:**

```powershell
cd D:\nasaProject\ORG-E\frontend
npm run dev                      # http://localhost:5173
```

Frontend `/api` isteklerini 8000'deki backend'e yönlendirir; backend kapalıysa demo veriye düşer.

**Testler** (`backend` klasöründe): `python -m pytest -q` → 83 passed, 3 skipped (ağ testleri: `NETWORK_TESTS=1`).

**Yeni veriyle yenileme:** `python -m scripts.refresh --check` (rapor), `python -m scripts.refresh` (indir + yeniden üret).

## Bu makinede kurulu olanlar

- Python 3.12.10, `backend\.venv` (pipeline + backend bağımlılıkları).
- **Node 26.13.1** (winget, `OpenJS.NodeJS.LTS`). Eski Node 21.4 Vite 8'i çalıştıramıyordu, onun yerine geçti.
- `frontend\node_modules` kurulu (git dışı).

## Backend'de ne var

| Uç nokta | Not |
| --- | --- |
| `GET /api/patch` | Oyunun ham pikselleri. Sözleşme `docs/patch-api.md`. 202 → 200; hedefe 10″ içinde yakalama; gzip'li disk önbelleği (`backend/data/patch/`); başarısız yama 60 sn aynı hatayı döner |
| `/api/jobs`, `/api/frames`, `/api/diff` | PNG kareler; `imaging.make_frames`, yoksa `app/frames.py` (dönem en fazla 30 gün) |
| `/api/targets`, `/api/resolve` | Beş hedef, SIMBAD (Harvard yansısı önce) |
| `/api/spectrum`, `/api/lightcurve` | Önbellekteki kesitlerden açıklık fotometrisi |
| `/api/gaia` | Gaia DR3, 2026.0'a taşınmış |
| `/api/health` | `live_queries`, `cached_units`, `frame_engine`, `patch` |

Ayrıntı: `backend/README.md`. Ekip notları: `backend/docs/team-notes.md`. Görevler: `backend/docs/tasks.md`.

Claude dokümanları:
- Frontend entegrasyon rehberi: https://claude.ai/artifact/R5H7kYirH6xdJ4ADwdxpAA
- Ekibe özet: https://claude.ai/artifact/Kisqc232fpfzyH9zkprfVk

## Alınmış kararlar (tekrar tartışma)

- Plan A (yukarıda).
- **Canlı sorgu açık (15 Kasım kararı, 14 Kasım'daki `LIVE_QUERIES=0` kararının yerine).** `/api/patch` önbellekte
  olmayan konumda istenen tüm dedektörleri sırayla indirir (dedektör başına 2–5 dk). Tek dedektör sınırı kaldırıldı.
  Frontend'in 180 sn zaman aşımı uzatılmalı (frontend sahibi, `team-notes.md`).
- JSON'da NaN/Infinity yok; ölçülemeyen değer `null`. 1000 bayttan büyük yanıtlar gzip'li.
- Sunucu/yayın konusu kullanıcı açmadıkça konuşulmaz.

## Açık işler (öncelik sırasıyla öneri)

1. ~~Yeni veriyle yenileme komutu~~ **yapıldı (15 Kasım):** `python -m scripts.refresh` (`--check` yalnızca rapor).
   Sonuçlar manifest damgası saklıyor, önbellek değişince aynı kimlikle yeniden üretiliyor. Testler 71 passed.
2. ~~`mock-error` farkı~~ **kapandı:** yeni frontend `/api/jobs` kullanmıyor; `/api/patch` hata yönetimi iki biçimi de karşılıyor.
   **Tayf/katalog görevleri yapıldı (15 Kasım, `docs/backend-spectrum-catalog-tasks.md`):** `mode=102`, bayrak alanları,
   `/api/catwise`, Gaia `pm_snr`, indirme ilerlemesi. Belge: `backend/docs/spectrum-api.md`. Testler 83 passed + 3 ağ testi.
   **Frontend uç noktaları incelendi (15 Kasım):** Gaia alanları repoda (`app/gaia_fields/`, ESA kapalıyken GAVO'dan),
   tayf bellekte (0,2–1,3 sn). Frontend'e kalanlar `team-notes.md`'de (tayf mesajı, 0,25° uyarısı). Testler 73 passed.
3. **Epsilon Indi B kısa dönemler.** Varsayılan 10/30 ayarında 1 ve 3 görüntülük dönemler çıkıyor. Arayüz 30/60
   kullandığı için oyunda sorun yok; `/api/jobs` için karar imaging sahibiyle.
4. **Parlak yıldız fotometrisi.** Barnard D6 ve R Dra D4-D6 noktaları doymuş (`flagged`). Kanatlardan ölçüm yöntemi yok.
5. **Siteye gömülü dosyalar.** Eski PNG dışa aktarımı (`scripts/export_static.py`) yeni frontend'in işine yaramaz.
   İstenirse beş vakanın `/api/patch` yanıtları dosya olarak dışa aktarılabilir (~5 MB). Frontend sahibine sorulmalı.
6. **Frontend README'sine "Node 22+ gerekli" notu** (frontend sahibinin işi; ekip notlarında yazıyor).
7. `docs/backend/` ile `backend/docs/` iki kopya (kök klasör, bizim değil; kopyalayan kişi temizlemeli).

## Kod dondurma

Pazar 15 Kasım 18:00 (sonrasında yalnızca hata düzeltme), teslim 23:59.
