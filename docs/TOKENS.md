# BRONE Reminder Widget v1.1.0 — Token System Brief
### Arah terpilih: Opt5 Ledger (grup matkul + time-bar)

> Diarsipkan dari `C:\Users\riski\Downloads\brone-token-brief.md`, 17 Sep 2026.
> Catatan: kalau BRONE (kampus) sudah punya warna logo/brand resmi, ganti token
> aksen brand di bawah dengan warna itu — jangan pakai nilai di bawah kalau
> ada identitas asli yang bisa dipakai. Nilai di sini adalah titik awal yang
> sengaja dijauhkan dari default AI (ungu-indigo, krem+terracotta).

---

## 1. Warna

### Surface (base)
| Token | Light | Dark | Catatan |
|---|---|---|---|
| `surface-base` | `#F5F4F1` (putih tulang, bukan krem hangat) | `#14151A` (near-black, bukan hitam pekat) | hindari krem+terracotta dan hitam pekat+neon — dua kombinasi paling sering muncul dari agent AI |
| `surface-raised` | `#FFFFFF` | `#1C1D24` | dipakai HANYA untuk kontainer widget/hero, bukan tiap row |
| `surface-raised-2` | `#ECEAE5` | `#22232B` | tombol sekunder / kontrol netral — pengganti teal untuk state aktif (audit F1) |
| `divider` | `#E4E2DD` | `#2A2B33` | hairline 1px antar-row dalam satu grup matkul — pengganti shadow per-card |

### Aksen brand (identitas, dipakai hemat)
| Token | Nilai | Pemakaian |
|---|---|---|
| `brand-ink` | `#1F6F63` light / `#5BB5A6` dark (tint diangkat untuk kontras di gelap) | logo, judul app, CTA primer — TIDAK dipakai untuk status/urgensi |

### Skala urgensi (fungsional — selalu warna + label, never warna saja)
| Token | Light | Dark (diangkat untuk kontras AA 4,5:1) | Label wajib menyertai |
|---|---|---|---|
| `urgency-safe` | `#37785A` (4,78:1) | `#5CAE7E` (6,78:1) | "X hari lagi" |
| `urgency-soon` | `#8A6217` (4,97:1) | `#E8B85E` (9,94:1) | "X jam lagi" |
| `urgency-critical` | `#B34A29` (4,86:1) | `#E06A3B` (5,46:1) | "<24 jam" |
| `urgency-overdue` | `#8B2E2E` (7,55:1) | `#D66161` (4,98:1) | "Terlewat X + satuan" (lihat konvensi countdown) |

### Konvensi countdown (audit N1)
Satu singkatan di app dan widget: `mnt` (menit), `j` (jam), `hr` (hari).
Jangan pernah `h` saja — terbaca sebagai jam maupun hari. Contoh:
"Terlewat 7mnt", "Terlewat 1j", "Terlewat 1hr", "30 hari lagi".

Semua rasio dihitung eksak (relative luminance WCAG) terhadap
`surface-base` masing-masing tema. `ink-400`: light `#6F6D68` (4,70:1)
/ dark `#8E8D88` (5,48:1).

Diterapkan sebagai **left-border accent 3px pada row + teks angka berwarna sama** — bukan pill/badge bulat (pill = pola yang sudah ditolak eksplisit di D-Design-4).

### Teks/ink
| Token | Light | Dark |
|---|---|---|
| `ink-900` (judul tugas) | `#1A1A1A` | `#F2F1EE` |
| `ink-600` (kode matkul, body) | `#4A4A48` | `#B8B6B0` |
| `ink-400` (meta/sync status) | `#6F6D68` | `#8E8D88` |

---

## 2. Tipografi

**Pairing:** satu mono + satu humanist sans — bukan satu font generik dipakai untuk semua.

- **Mono** (kode matkul, countdown, angka tabular): `JetBrains Mono` atau `IBM Plex Mono` — WAJIB pakai tabular/lining figures supaya digit countdown tidak bergeser lebar saat berubah (syarat D-Design-2).
- **Sans** (judul tugas, body, label): `Manrope` atau `Inter` — dipakai untuk apa pun yang bersifat teks-baca, bukan data.

> Batasan Figma: plugin bridge hanya memuat Inter/Roboto/Arial — mockup memakai
> Inter, font asli diterapkan saat implementasi kode.

| Role | Font | Size/weight |
|---|---|---|
| Nama matkul (header grup) | Sans, semibold | 13px, tracking normal |
| Kode matkul (IF2040, dst) | Mono, medium | 11px, uppercase, tracking wide |
| Judul tugas | Sans, medium | 14–15px, max 2 baris, line-height 1.3 |
| Countdown/waktu | Mono, semibold, tabular-nums | 13px |
| Meta sync status | Sans, regular | 11px, `ink-400` |

---

## 3. Radius & Elevation

- **Satu radius kecil** (`6px`) untuk row individual dalam grup — kesan "baris di atas ledger", bukan kartu.
- **Satu radius sedang** (`12px`) HANYA untuk kontainer widget/hero terluar — ini satu-satunya elemen yang boleh punya elevation/shadow tipis.
- Tidak ada shadow di tingkat row. Pemisah antar-row pakai `divider` (hairline), bukan gap+shadow.

---

## 4. Layout Ledger (spesifik Opt5)

- **Header grup** = nama matkul (sans) + kode matkul (mono, kecil) + time-bar ringkas proporsi total progres matkul itu.
- **Row per tugas**: judul (maks 2 baris) — countdown (mono, tabular) — left-border accent warna urgensi.
- **Time-bar per item**: proporsi waktu tersisa, warna sama dengan `urgency-*`, tapi SELALU didampingi angka/label — bar sendirian tidak cukup (aksesibilitas + D-Design-2).
- **Status sync**: satu baris persisten ("Sync 5 mnt lalu"), selalu terlihat — bukan disembunyikan di menu.
- **Empty/offline state**: skeleton row + data terakhir + tombol coba-lagi (sesuai user story #15 di PRD).

---

## 5. Checklist Anti-Slop — cek sebelum approve dari agent

- [ ] Tidak ada pill/badge bulat untuk status urgensi (pakai left-border + teks)
- [ ] Tidak ada shadow lembut di tiap row
- [ ] Tidak ada label ALL-CAPS dekoratif yang tidak perlu (kode matkul uppercase itu OK karena memang data, bukan dekorasi)
- [ ] Tidak ada ikon panah "→" di row yang tidak benar-benar navigasi
- [ ] Tidak ada numbered marker 01/02/03 dekoratif
- [ ] Countdown pakai tabular figures (digit tidak bergeser)
- [ ] Warna aksen brand TIDAK indigo/ungu, TIDAK kombinasi krem+terracotta
- [ ] Urgensi selalu warna + kata/angka, tidak pernah warna saja
- [ ] Semua kontrol sentuh ≥44px
- [ ] Widget diuji kontras di wallpaper terang dan gelap
