# Prompt Audit UI/UX — BRONE Reminder Widget v2

> Cara pakai: copy seluruh isi file ini ke Claude, lalu lampirkan (attach)
> 5 file PNG di folder ini + file `docs/wireframe.html` + `docs/TOKENS.md`
> + `AGENTS.md` dari repo sebagai referensi.

---

Audit UI/UX aplikasi **BRONE Reminder Widget v2** (widget + app pengingat
deadline kuliah: feed BRONE/Moodle, Google Calendar, event manual lokal).

## Sumber kebenaran (urutan prioritas)

1. `AGENTS.md` — aturan desain mengikat (satu library ikon, urgensi =
   warna + label kata/angka, tanpa pill, maksimal 1 elevation, maksimal
   2 warna semantik per layar, satu momen fokus hero, data asli, tanpa
   ungu/indigo, radius konsisten, sentuh ≥44px, judul maks 2 baris,
   tabular figures).
2. `docs/TOKENS.md` — token warna + tipografi + radius final (sudah
   direvisi kontras WCAG AA 4.5:1, nilai eksak di file).
3. `docs/wireframe.html` — wireframe lo-fi 15 board: struktur tiap
   view + state (normal/loading/empty/error/collapsed) yang disetujui.
4. Screenshot di folder ini (kondisi nyata di emulator, feed berisi
   7 tugas asli):
   - `1-widget-home.png` — widget home Android (native, selalu dark,
     hero + strip left-border)
   - `2-app-home-light.png` — app home tema terang
   - `3-app-home-dark.png` — app home tema gelap
   - `4-settings-feed.png` — settings kartu Sumber feed + chips
   - `5-sheet-manual.png` — bottom sheet tambah event manual

## Yang diminta

1. **Kepatuhan token**: cek tiap screenshot — warna, radius, font,
   spacing — lawan `TOKENS.md`. Sebutkan kode warna yang menyimpang.
2. **Kontras WCAG AA**: cek pasangan teks-vs-background yang terlihat
   (countdown, meta, label). Tandai yang di bawah 4.5:1.
3. **Aturan AGENTS.md**: cek satu per satu (jumlah warna semantik per
   layar, hero tunggal, tanpa pill, tanpa shadow per-row, target sentuh,
   judul 2 baris, tanpa emoji, ikon satu library).
4. **Konsistensi lintas permukaan**: app gelap vs terang, app vs widget
   native — sebutkan yang tidak konsisten.
5. **Bug visual konkret** dari screenshot (mis. teks terpotong,
   alignment, gap, warna tidak teraplikasi).

## Format output

1. **Vonis 1 baris**: LULUS / LULUS BERSYARAT / GAGAL + alasan utama.
2. **Tabel temuan**: | # | Lokasi (file+baris bila tahu) | Aturan
   dilanggar | Bukti (screenshot mana) | Rekomendasi konkret |
3. **Prioritas P0/P1/P2** untuk tiap temuan.
4. Maksimal 3 rekomendasi struktural (bukan preferensi selera).

## Batasan

- Jangan menulis ulang kode, jangan redesign total dari nol.
- Jangan mengusulkan kategori generik — data memakai kode matkul
  dan nama tugas asli.
- Jangan mengusulkan ungu/indigo, krem+terracotta, pill/badge,
  maskot, atau emoji.
- Kalau ragu antara dua aturan, pilih yang lebih restrained
  (rujuk gaya Linear issue list / Things 3 / Reminders iOS).
