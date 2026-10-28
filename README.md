# SIMAK PK IMM FAI UM Bengkulu

Kode aplikasi SIMAK (Google Apps Script).

- `src/Code.gs`   → isi file Kode di Apps Script
- `src/Index.html` → isi file Index di Apps Script

Setiap kali file di `src/` diganti, GitHub Actions otomatis memasang ke Apps Script
dan membuat Versi baru (lihat tab **Actions**). Data tetap di Google Sheets/Drive akun PK.

Jika ada kolom sheet baru, jalankan **setup** sekali di Apps Script.
