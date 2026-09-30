# Audit UI/UX BRONE Reminder Widget v2 — versi tempel-teks

> Untuk Claude free tier: copy SELURUH isi file ini dalam satu paste.
> Screenshot tidak ikut — deskripsinya sudah ditulis di bawah sebagai
> pengganti bila attach gambar tidak tersedia.

---

Audit UI/UX aplikasi **BRONE Reminder Widget v2** (widget + app pengingat
deadline kuliah: feed BRONE/Moodle, Google Calendar, event manual lokal).
Stack: Tauri v2 (Rust) + JS vanilla, Android native Kotlin untuk home widget.

## 1. Aturan desain mengikat

- Ikon: SATU library asli (Phosphor Icons). Dilarang menggambar path SVG
  sendiri. Dilarang maskot kartun.
- Urgensi: warna + label kata/angka, TIDAK PERNAH warna saja. Tanpa
  pill/badge bulat. Left-border accent 3px + teks berwarna.
- Shadow: maksimal SATU elevation per layar (kontainer terluar). Tanpa
  shadow per-row.
- Maksimal 2 warna semantik aktif per layar. Item aman/jauh tenggat =
  teks netral.
- Satu momen fokus: item paling mendesak jadi satu blok hero,
  sisanya tenang.
- Data asli (kode matkul, nama tugas). Tanpa kategori generik.
- Tanpa ungu/indigo, tanpa krem+terracotta.
- Satu skala radius di semua permukaan. Kontrol sentuh ≥44px, judul
  maks 2 baris, countdown tabular figures.
- Arah terpilih: Opt5 Ledger — row per tugas dengan left-border
  accent urgensi.

## 2. Token final (sudah direvisi kontras WCAG AA 4.5:1, nilai eksak)

Surface dark: canvas `#14151A`, raised `#1C1D24`, divider `#2A2B33`.
Surface light: canvas `#F5F4F1`, raised `#FFFFFF`, divider `#E4E2DD`.
Brand teal: `#1F6F63` light / `#5BB5A6` dark — HANYA logo/CTA primer.
Urgensi dark: safe `#5CAE7E`, soon `#E8B85E`, critical `#E06A3B`,
overdue `#D66161`. Urgensi light: safe `#37785A`, soon `#8A6217`,
critical `#B34A29`, overdue `#8B2E2E`.
Ink dark: `#F2F1EE` / `#B8B6B0` / `#8E8D88`. Ink light: `#1A1A1A` /
`#4A4A48` / `#6F6D68`.
Font: mono (JetBrains Mono/IBM Plex Mono, tabular) untuk kode matkul
dan countdown; sans (Manrope/Inter) untuk judul dan body. Judul tugas
14–15px maks 2 baris. Radius 6px row, 12px kontainer terluar.

## 3. Wireframe acuan (15 board, lo-fi, grayscale)

- Board 1–2: Desktop widget normal + collapsed (hero + daftar tugas).
- Board 3–5: loading (skeleton), empty, error + tombol coba-lagi.
- Board 7–8: partial-data + undo toast.
- Board 9–11: Mobile app normal + loading + error.
- Board 13: Settings (daftar feed + ambang + interval + tema + desktop).
- Board 14–15: Android widget normal + empty (read-only, selalu dark).
- Setiap view wajib mencakup state-nya sesuai tabel states di wireframe.

## 4. Kondisi nyata (pengganti screenshot)

Feed berisi 7 tugas asli (kode COM60051, CCE61305, CCE61315, CCE61317).
 Yang teramati di implementasi saat ini:

- **App home gelap**: hero overdue border merah + "Terlewat 12 jam",
  6 row left-border (merah untuk overdue, netral untuk sisanya),
  wordmark "BRONE Reminder" teal, ikon Phosphor, sync tampil.
- **App home terang**: kanvas putih, hero amber "4 jam lagi",
  row amber + netral, teks gelap terbaca.
- **Settings terang**: kartu feed (1 feed BRONE terhubung + tombol
  uji/hapus + tambah URL), chips ambang 1j/6j/12j/24j, interval
  15/20/30, tema Gelap/Terang/Otomatis, slider, toggle notifikasi,
  section desktop redup.
- **Sheet manual**: scrim + handle + judul/tanggal/jam + Batal/
  Simpan event teal.
- **Widget home native**: hero merah + 5–6 row left-border + kaki
  "Ketuk untuk buka aplikasi", selalu dark.
- **Dicurigai**: timestamp sync sempat kosong di multi-feed; tombol
  X sempat tampil di HP; strip widget sempat abu semua.

## 5. Yang diminta

1. **Vonis 1 baris**: LULUS / LULUS BERSYARAT / GAGAL + alasan utama.
2. **Tabel temuan**: | # | Lokasi | Aturan dilanggar | Bukti (dari
   deskripsi §4) | Rekomendasi konkret, sebutkan file/komponen
   bila bisa ditebak (style.css, settings, layout XML native,
   WidgetTaskService) |
3. **Prioritas P0/P1/P2** tiap temuan. Maksimal 3 rekomendasi
   struktural, bukan selera.
4. Cek khusus: (a) sisa ungu/indigo di UI, (b) kontras pasangan
   teks-background di tiap screenshot, (c) konsistensi gelap vs
   terang vs widget native, (d) apakah batas 2-warna dipatuhi.

## 6. Batasan

- Tanpa menulis ulang kode, tanpa redesign total dari nol.
- Tanpa kategori generik, tanpa ungu/indigo, tanpa krem+terracotta,
  tanpa pill/badge, tanpa maskot, tanpa emoji.
- Kalau ragu antara dua aturan, pilih yang lebih restrained
  (rujuk gaya Linear issue list / Things 3 / Reminders iOS).
