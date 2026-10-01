## Ringkasan Perubahan (Summary)
<!-- Jelaskan secara singkat tujuan dan konteks dari PR ini -->

## Jenis Perubahan (Type of Change)
- [ ] `fix`: Perbaikan bug
- [ ] `feat`: Penambahan fitur baru
- [ ] `docs`: Pembaruan dokumentasi
- [ ] `refactor`: Restrukturisasi kode tanpa mengubah perilaku
- [ ] `chore` / `ci`: Pemeliharaan dependensi atau pipeline build

## Checklist Kualitas & Pengujian (Quality Checklist)
- [ ] Unit test berjalan sukses (`npm test`).
- [ ] Rust clippy bersih tanpa warning (`cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`).
- [ ] Format kode Rust rapi (`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`).
- [ ] Tidak ada data pribadi, token rahasia, ID mahasiswa asli, maupun path lokal (`C:\Users\...`) di dalam kode/artefak.
- [ ] Entri catatan perubahan telah ditambahkan ke `CHANGELOG.md` jika relevan.
- [ ] Perubahan dokumentasi telah disinkronkan ke `README.md` atau `docs/`.
