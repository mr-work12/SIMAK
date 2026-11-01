/**
 * ============================================================
 *  SISTEM LAPORAN KEGIATAN & ABSENSI PESERTA (GPS)
 *  Google Apps Script (Web App) + Google Sheets + Gmail
 * ============================================================
 *  OPERATOR (login password):
 *  - Kelola lokasi (nama + koordinat + radius)
 *  - Tambah / hapus kegiatan (dengan lokasi), buka / tutup absensi
 *  - Tambah / edit / hapus kader
 *  - Upload foto & video kegiatan (disimpan di Google Drive)
 *  - Pantau absensi & laporan rekap (bisa dicetak / PDF)
 *
 *  PESERTA (login email + NPM/NIA):
 *  - Daftar mandiri (jika diizinkan)
 *  - Absen sendiri: HADIR hanya bisa dalam radius lokasi (default 100 m)
 *    Izin / Sakit bisa dari mana saja
 *  - Lihat riwayat & rekap kehadiran sendiri
 *  - Lihat galeri foto (slideshow bergerak) & video kegiatan
 *
 *  RIWAYAT PERKADERAN:
 *  - Kader mencatat DAM/DAP/PID/PIM/PIP/KM3 yang pernah diikuti; admin memverifikasi
 *
 *  PENDAFTARAN DAD:
 *  - Calon kader (belum DAD) mengisi formulir; admin bisa "Jadikan Kader" setelah DAD
 *
 *  EMAIL OTOMATIS:
 *  - Kader baru (daftar sendiri / ditambah admin) dikirimi email selamat datang
 *
 *  NOTIFIKASI HP:
 *  - Kegiatan baru: email ke Gmail semua kader + push aplikasi ntfy (bilah notifikasi HP)
 *  - Kegiatan baru otomatis masuk Google Calendar kader (undangan + pengingat)
 *
 *  OTOMATIS:
 *  - Tiap malam 23.00 absensi kegiatan hari itu ditutup otomatis
 *  - Saat admin MENUTUP absensi, kader yang belum absen = Alpa
 *  - Kader yang tidak hadir 3x (lalu 6x, 9x, ...) dikirimi email
 * ============================================================
 */

// ===================== PENGATURAN =====================
const CONFIG = {
  NAMA_SISTEM: 'SIMAK',
  NAMA_PANJANG: 'Sistem Informasi Manajemen Kaderisasi',
  BIDANG: 'Bidang Kader',                  // tampil di header aplikasi & tanda tangan email
  PENYELENGGARA: 'PK IMM FAI UM Bengkulu',   // nama pengirim & penanda tangan email
  PASSWORD_ADMIN: 'admin123',          // WAJIB DIGANTI
  URL_PUBLIK: 'https://simak-pk-imm-fai-um-bengkulu.netlify.app',   // link yang dibagikan ke kader (dipakai di email & notifikasi). Kosongkan '' untuk memakai link /exec
  DAFTAR_MANDIRI: true,                // true = kader boleh mendaftar sendiri
  // Pemilah otomatis NPM vs NIA: NPM = hanya angka 8-12 digit (mis. 2370233016).
  // Selain itu (ada titik/strip/garis miring/huruf, atau angka lebih panjang) dianggap NIA IMM.
  POLA_NPM: /^\d{8,12}$/,
  RADIUS_DEFAULT: 100,                 // meter, dipakai jika radius lokasi dikosongkan
  BATAS_TIDAK_HADIR: 3,                // email dikirim saat 3x, 6x, 9x, ...
  IZIN_SAKIT_DIHITUNG: false,          // true = Izin & Sakit ikut dihitung tidak hadir
  // ----- Sertifikat -----
  SERTIFIKAT_KOTA: 'Bengkulu',
  // Nama, NIA, dan tanda tangan Ketua Umum & Sekretaris Umum diatur dari menu admin (tab Kegiatan).
  SERTIFIKAT_JABATAN_KETUA: 'Ketua Umum',
  SERTIFIKAT_JABATAN_SEKRETARIS: 'Sekretaris Umum',
  PERAN_PANITIA: ['Panitia', 'Anggota', 'Ketua Panitia', 'Sekretaris Panitia', 'Bendahara Panitia',
    'Steering Committee', 'Instruktur', 'Pemateri', 'Moderator', 'Master of Ceremony'],
  SERTIFIKAT_KODE: 'PK-IMM-FAI-UMB',                           // dipakai di nomor sertifikat
  // Satu nomor surat untuk SELURUH peserta & satu nomor untuk SELURUH panitia per kegiatan.
  // Otomatis: <urut kegiatan dalam tahun>/SERT-P/PK-IMM-FAI-UMB/<bulan romawi>/<tahun>, panitia memakai SERT-PN.
  SERTIFIKAT_KODE_PESERTA: 'SERT-P',
  SERTIFIKAT_KODE_PANITIA: 'SERT-PN',
  // ----- Jenjang perkaderan IMM (urut dari dasar). Nama boleh diubah. -----
  JENJANG_PERKADERAN: [
    ['DAD', 'Darul Arqam Dasar'],
    ['DAM', 'Darul Arqam Madya'],
    ['DAP', 'Darul Arqam Paripurna'],
    ['PID', 'Pelatihan Instruktur Dasar'],
    ['PIM', 'Pelatihan Instruktur Madya'],
    ['PIP', 'Pelatihan Instruktur Paripurna'],
    ['KM3', 'Korps Mubaligh Mahasiswa Muhammadiyah']
  ],
  JUMLAH_CADANGAN: 8,                  // cadangan mingguan yang disimpan (8 = ±2 bulan)
  SURAT_KODE: 'PK-IMM-FAI-UMB',                // dipakai di usulan nomor surat keluar
  SALAM_PENUTUP: 'Billahi fiisabilil haq, Fastabiqul Khairat.\nWassalamu’alaikum Warahmatullahi Wabarakatuh.',   // penutup setiap pengumuman
  // ----- Formulir pendaftaran DAD (PDF otomatis) -----
  KOP_KOMISARIAT: 'FAKULTAS AGAMA ISLAM',
  KOP_UNIVERSITAS: 'UNIVERSITAS MUHAMMADIYAH BENGKULU',
  KOP_SEKRETARIAT: 'Sekretariat : Kampus II Universitas Muhammadiyah Bengkulu, Jl. Salak Raya, Panorama, Kota Bengkulu, No. 17 Kode Pos: 38225',
  KOP_KONTAK: 'Phone : 085714716261 / 082175352158 · www.pkimmfaiumb.com · pkimmfaiumbengkulu@gmail.com',
  JADWAL_DAD_AWAL: '',   // contoh: '27 November 2026 sampai dengan 30 November 2026' (bisa diatur admin di tab DAD)
  LINK_GRUP_WA_DAD: 'https://chat.whatsapp.com/IEKEgEpID2x7uXOtRialwv',  // grup WA calon peserta DAD
  EMAIL_SAMBUTAN: true,                // kader baru otomatis dikirimi email selamat datang
  // ----- Notifikasi HP (muncul di bilah notifikasi) -----
  EMAIL_KEGIATAN_BARU: true,           // kegiatan baru dikirim ke Gmail semua kader -> notifikasi Gmail di HP
  NTFY_TOPIK: 'simak-imm-fai-umb-4257f1',   // notifikasi push lewat aplikasi ntfy (kosongkan '' jika tidak dipakai)
  UNDANGAN_KALENDER: true,             // kegiatan baru otomatis masuk Google Calendar kader (notifikasi HP)
  DURASI_KEGIATAN_JAM: 2,              // lama acara di kalender jika jam kegiatan diisi
  TUTUP_OTOMATIS: true,                // tiap malam 23.00: absensi kegiatan hari ini/terlewat ditutup otomatis
  MAKS_UPLOAD_MB: 20,                  // batas ukuran 1 file foto/video yang diupload
  EMAIL_MASUK_ADMIN: ['pkimmfaiumbengkulu@gmail.com'],   // email ini di form Masuk = masuk sebagai admin (pakai password admin)
  EMAIL_ADMIN: '',                     // isi email jika admin ingin dapat salinan (CC)
  ZONA_WAKTU: 'Asia/Jakarta'
};
// ======================================================

const SHEET = {
  PESERTA:  { nama: 'Peserta',   header: ['ID', 'Nama', 'NPM/NIA', 'Email', 'No. HP', 'Tanggal Daftar', 'Tahun DAD', 'Foto Profil', 'PIN (terenkripsi)', 'Sesi (sistem)', 'NIA', 'KTA (berkas)',
    'Tempat Lahir', 'Tanggal Lahir', 'Syahadah DAD', 'Nomor Syahadah', 'Predikat Syahadah', 'Syahadah (berkas)'] },
  LOKASI:   { nama: 'Lokasi',    header: ['ID', 'Nama Lokasi', 'Latitude', 'Longitude', 'Radius (m)', 'Dibuat'] },
  KEGIATAN: { nama: 'Kegiatan',  header: ['ID', 'Nama Kegiatan', 'Tanggal', 'Waktu', 'Tempat', 'Keterangan', 'Dibuat', 'Status', 'ID Lokasi', 'ID Kalender', 'Sertifikat', 'Nomor Surat Peserta', 'Latar Sertifikat', 'Nomor Surat Panitia', 'Sertifikat Dibuka', 'Penanda Tangan', 'Desain Sertifikat', 'Status Siaran', 'Jumlah Hari', 'Minimal Hadir Sertifikat'] },
  ABSENSI:  { nama: 'Absensi',   header: ['ID Kegiatan', 'Nama Kegiatan', 'Tanggal Kegiatan', 'ID Kader', 'Nama Kader', 'Status', 'Dicatat', 'Sumber', 'Jarak (m)', 'Koordinat', 'Hari Ke'] },
  GALERI:   { nama: 'Galeri',    header: ['ID', 'ID Kegiatan', 'Judul', 'Tipe', 'File ID', 'Link', 'Dibuat', 'Acara (luar kegiatan)', 'Tanggal'] },
  DAD:      { nama: 'Pendaftar DAD', header: ['ID', 'Nama', 'NPM', 'Prodi', 'Semester', 'Email', 'No. HP', 'Alamat Sekarang', 'Motivasi', 'Tanggal Daftar', 'Status', 'Diperbarui', 'Catatan Admin',
    'Jenis Kelamin', 'Tempat Lahir', 'Tanggal Lahir', 'Alamat Asal', 'Sosial Media', 'Motto', 'Perguruan Tinggi',
    'Riwayat Pendidikan', 'Riwayat Organisasi', 'Buku Dibaca', 'Karya', 'Target', 'Foto', 'Formulir PDF', 'Tahun Daftar', 'Data Formulir (sistem)'] },
  SERTIFIKAT: { nama: 'Sertifikat', header: ['ID Kegiatan', 'Nama Kegiatan', 'ID Kader', 'Nama Kader', 'Nomor', 'File ID', 'Link', 'Dibuat', 'Peran'] },
  TAMU:     { nama: 'Peserta Umum', header: ['ID', 'ID Kegiatan', 'Nama', 'NPM / No. Identitas', 'Asal (Prodi/Fakultas/Instansi)', 'Email', 'No. HP', 'Status', 'Waktu', 'Jarak (m)', 'Koordinat', 'Hari Hadir'] },
  PANITIA:  { nama: 'Panitia Kegiatan', header: ['ID', 'ID Kegiatan', 'ID Kader', 'Nama', 'Peran', 'Aktif', 'Dibuat'] },
  PERKADERAN: { nama: 'Perkaderan', header: ['ID', 'ID Kader', 'Nama Kader', 'Jenjang', 'Tahun', 'Penyelenggara', 'Status', 'Diperbarui', 'Diinput Oleh'] },
  SURAT:    { nama: 'Agenda Surat', header: ['ID', 'Jenis', 'Nomor Surat', 'Tanggal Surat', 'Perihal', 'Dari / Kepada', 'Keterangan', 'Berkas', 'Dicatat', 'ID Email'] },
  NOTULEN:  { nama: 'Notulen', header: ['ID', 'Tanggal', 'Rapat / Agenda', 'Tempat', 'Pimpinan Rapat', 'Notulis', 'Peserta', 'Pembahasan', 'Keputusan', 'Dicatat'] },
  INFO:     { nama: 'Pengumuman', header: ['ID', 'Judul', 'Isi', 'Dibuat'] },
  LOGWA:    { nama: 'Log WhatsApp', header: ['Waktu', 'Jenis', 'Tujuan', 'Jumlah', 'Status', 'Keterangan'] },
  LOG:      { nama: 'Log Email', header: ['Waktu', 'ID Kader', 'Nama', 'Email', 'Jumlah Tidak Hadir', 'Peringatan Ke-', 'Hasil'] }
};

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
               'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// ---------------------- WEB APP ----------------------
/** Nama pengirim / penanda tangan email, mis. "Bidang Kader PK IMM FAI UM Bengkulu". */
function pengirim_() { return (CONFIG.BIDANG ? CONFIG.BIDANG + ' ' : '') + CONFIG.PENYELENGGARA; }

/** Penjaga: fungsi pemeliharaan hanya boleh dijalankan pemilik dari editor Apps Script,
 *  bukan dari browser lewat google.script.run (semua fungsi tanpa "_" bisa dipanggil dari browser). */
function hanyaEditor_() {
  let a = '', o = '';
  try { a = Session.getActiveUser().getEmail(); o = Session.getEffectiveUser().getEmail(); } catch (e) {}
  if (!a || a !== o) throw new Error('Fungsi ini hanya bisa dijalankan dari editor Apps Script.');
}
/** Penjaga untuk fungsi jadwal otomatis: lolos bila dipanggil pemicu asli (triggerUid terdaftar) atau dari editor. */
function pemicu_(e) {
  if (e && e.authMode === ScriptApp.AuthMode.FULL) return;          // objek enum asli dari pemicu, tak bisa dikirim dari browser
  if (e && e.triggerUid && ScriptApp.getProjectTriggers().some(t => t.getUniqueId() === String(e.triggerUid))) return;
  hanyaEditor_();
}
/** siapkanSheet_ hanya dijalankan bila susunan kolom berubah (tidak di setiap kunjungan halaman). */
function siapkanSheetBilaPerlu_() {
  const props = PropertiesService.getScriptProperties();
  const sidik = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
    JSON.stringify(Object.keys(SHEET).map(k => [SHEET[k].nama, SHEET[k].header]))));
  if (props.getProperty('SKEMA_SHEET') === sidik) return;
  siapkanSheet_();
  props.setProperty('SKEMA_SHEET', sidik);
}

function doGet() {
  try { siapkanSheetBilaPerlu_(); } catch (e) { siapkanSheet_(); }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(CONFIG.NAMA_SISTEM + ' · ' + CONFIG.PENYELENGGARA)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Jalankan sekali dari editor (dan setiap kali kode diganti) untuk:
 * membuat sheet, memberi izin akses (Sheets, Gmail, Drive, Calendar),
 * dan memasang tugas otomatis harian.
 */
function setup() {
  hanyaEditor_();
  siapkanSheet_();
  const pindah = rapikanNomor_();
  if (pindah) Logger.log(pindah + ' kader dirapikan: NIA dipindahkan dari kolom NPM ke kolom NIA.');
  pasangTugasHarian_();
  CalendarApp.getDefaultCalendar();               // memicu permintaan izin Calendar
  GmailApp.getUserLabelByName('SIMAK');           // memicu permintaan izin Gmail (surat dari email PK)
  folderGaleri_();                                // memicu permintaan izin Drive
  try { templateSertifikat_(); } catch (e) { Logger.log('Template sertifikat: ' + e.message); }   // template sertifikat (Google Slides)
  if (CONFIG.NTFY_TOPIK) UrlFetchApp.getRequest('https://ntfy.sh/');   // memicu izin akses internet (ntfy)
  Logger.log('Setup selesai. Sisa kuota email hari ini: ' + MailApp.getRemainingDailyQuota());
}

function pasangTugasHarian_() {
  const ada = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (ada.indexOf('tugasHarian') < 0) {
    ScriptApp.newTrigger('tugasHarian').timeBased().everyDays(1).atHour(23)
      .inTimezone(CONFIG.ZONA_WAKTU).create();
  }
  if (ada.indexOf('tarikSuratEmail') < 0) {           // surat dari Gmail PK masuk ke Agenda Surat tiap 15 menit
    ScriptApp.newTrigger('tarikSuratEmail').timeBased().everyMinutes(15).create();
  }
  if (ada.indexOf('pengingatWA') < 0) {                // pengingat WhatsApp: pukul 06.00 (hari ini) & 19.00 (besok)
    ScriptApp.newTrigger('pengingatWA').timeBased().everyDays(1).atHour(6).inTimezone(CONFIG.ZONA_WAKTU).create();
    ScriptApp.newTrigger('pengingatWA').timeBased().everyDays(1).atHour(19).inTimezone(CONFIG.ZONA_WAKTU).create();
  }
  if (ada.indexOf('cadanganMingguan') < 0) {          // cadangan otomatis tiap Ahad pukul 02.00
    ScriptApp.newTrigger('cadanganMingguan').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2)
      .inTimezone(CONFIG.ZONA_WAKTU).create();
  }
}

// =========================================================
//        PINDAH KE AKUN GMAIL BARU (jalankan dari editor)
// =========================================================
// 1) Isi EMAIL_AKUN_BARU, lalu di AKUN LAMA jalankan: bagikanKeAkunBaru
// 2) Setelah akun baru menerima kepemilikan & menjalankan setup, di AKUN LAMA jalankan: hentikanJadwalAkunIni
const EMAIL_AKUN_BARU = '';   // contoh: 'pkimmfaiumb@gmail.com'

/** Menjadikan akun baru Editor di spreadsheet, semua folder data aplikasi, dan template sertifikat. */
function bagikanKeAkunBaru() {
  hanyaEditor_();
  const email = String(EMAIL_AKUN_BARU || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Isi dulu EMAIL_AKUN_BARU di Code.gs dengan Gmail baru.');
  const props = PropertiesService.getScriptProperties();
  const log = [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.addEditor(email); log.push('✔ Spreadsheet: ' + ss.getUrl());
  Object.keys(props.getProperties()).filter(k => /^FOLDER_/.test(k)).forEach(k => {
    try { const f = DriveApp.getFolderById(props.getProperty(k)); f.addEditor(email); log.push('✔ Folder ' + f.getName() + ': ' + f.getUrl()); }
    catch (e) { log.push('✖ ' + k + ': ' + e.message); }
  });
  ['TEMPLATE_SERTIFIKAT', 'TEMPLATE_SERTIFIKAT4', 'FILE_BUKU_INDUK', 'FILE_BIODATA_DAD'].forEach(k => {
    const id = props.getProperty(k);
    if (!id) return;
    try { const f = DriveApp.getFileById(id); f.addEditor(email); log.push('✔ ' + f.getName() + ': ' + f.getUrl()); }
    catch (e) { log.push('✖ ' + k + ': ' + e.message); }
  });
  Logger.log('Dibagikan ke ' + email + ' sebagai Editor:\n' + log.join('\n') +
    '\n\nLangkah berikutnya: buka tiap tautan di atas → Bagikan → ubah peran ' + email + ' menjadi "Transfer kepemilikan".');
}

/** Menghapus jadwal otomatis milik akun yang sedang menjalankan (dipakai di akun lama setelah pindah). */
function hentikanJadwalAkunIni() {
  hanyaEditor_();
  const t = ScriptApp.getProjectTriggers();
  t.forEach(x => ScriptApp.deleteTrigger(x));
  Logger.log(t.length + ' jadwal otomatis milik ' + Session.getEffectiveUser().getEmail() + ' dihapus.');
}

// =========================================================
//                 DASHBOARD & PENGUMUMAN
// =========================================================
/** Ringkasan untuk Beranda admin. */
function dasbor_(absen) {
  absen = absen || rows_('ABSENSI');
  const kini = new Date();
  const ym = d => Utilities.formatDate(d, CONFIG.ZONA_WAKTU, 'yyyy-MM');
  // 6 bulan terakhir
  const bulan = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(kini.getFullYear(), kini.getMonth() - i, 15); bulan.push(ym(d)); }
  const kegiatan = rows_('KEGIATAN');
  const bulanan = bulan.map(b => {
    const a = absen.filter(r => fmt_(r[2]).slice(0, 7) === b);
    const h = a.filter(r => r[5] === 'Hadir').length;
    return { bulan: b, kegiatan: kegiatan.filter(r => fmt_(r[2]).slice(0, 7) === b).length, total: a.length, hadir: h,
      persen: a.length ? Math.round(h / a.length * 100) : null };
  });
  const kader = rows_('PESERTA');
  const perKader = kader.map(p => {
    const a = absen.filter(r => r[3] === p[0]).sort((x, y) => fmt_(x[2]).localeCompare(fmt_(y[2])));
    const h = a.filter(r => r[5] === 'Hadir').length;
    const tiga = a.slice(-3);
    return { id: p[0], nama: p[1], hadir: h, total: a.length, persen: a.length ? Math.round(h / a.length * 100) : 0,
      alpaTerakhir: tiga.filter(r => r[5] === 'Alpa').length, terakhir: tiga.map(r => r[5]) };
  });
  return {
    bulanIni: bulanan[bulanan.length - 1],
    bulanan: bulanan,
    teraktif: perKader.filter(x => x.hadir > 0).sort((a, b) => b.hadir - a.hadir || b.persen - a.persen).slice(0, 5),
    perhatian: perKader.filter(x => x.alpaTerakhir >= 2).sort((a, b) => b.alpaTerakhir - a.alpaTerakhir).slice(0, 10)
  };
}

function daftarPengumuman_() {
  const kini = Date.now();
  return rows_('INFO').map(r => ({ id: r[0], judul: r[1], isi: r[2], dibuat: fmt_(r[3], 'yyyy-MM-dd HH:mm'),
    umurHari: r[3] instanceof Date ? Math.floor((kini - r[3].getTime()) / 86400000) : 999 }))
    .sort((a, b) => b.dibuat.localeCompare(a.dibuat));
}

/** Admin menulis pengumuman: tampil di layar kader (kartu + lonceng), opsional push ntfy. */
function tambahPengumuman(pw, x) {
  cek_(pw);
  const judul = String(x.judul || '').trim(), isi = String(x.isi || '').trim();
  if (!judul || !isi) throw new Error('Judul dan isi pengumuman wajib diisi.');
  kunci_(() => sh_('INFO').appendRow([idBaru_('INFO', 'I'), judul, isi, new Date()]));
  let info = 'Pengumuman tampil di aplikasi kader.';
  if (x.push && CONFIG.NTFY_TOPIK) {
    try {
      UrlFetchApp.fetch('https://ntfy.sh/', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ topic: CONFIG.NTFY_TOPIK, title: '📢 ' + judul, message: isi.slice(0, 300) + '\n\n' + CONFIG.SALAM_PENUTUP,
          click: urlAplikasi_(), priority: 4, tags: ['loudspeaker'] }) });
      info += ' Notifikasi HP (ntfy) terkirim.';
    } catch (e) { info += ' Notifikasi ntfy gagal: ' + e.message; }
  }
  const d = getData(pw);
  d.infoPengumuman = info;
  return d;
}
function hapusPengumuman(pw, id) { cek_(pw); kunci_(() => hapusBaris_('INFO', id)); return getData(pw); }

// =========================================================
//         ADMINISTRASI: AGENDA SURAT & NOTULEN RAPAT
// =========================================================
function folderArsip_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ARSIP');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(CONFIG.NAMA_SISTEM + ' - Arsip Surat');
  props.setProperty('FOLDER_ARSIP', f.getId());
  return f;
}
function daftarSurat_() {
  return rows_('SURAT').map(r => ({ id: r[0], jenis: r[1], nomor: String(r[2]), tanggal: fmt_(r[3]), perihal: r[4],
    pihak: r[5], ket: r[6], berkas: r[7], dariEmail: !!String(r[9] || '').trim() })).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));
}
function daftarNotulen_() {
  return rows_('NOTULEN').map(r => ({ id: r[0], tanggal: fmt_(r[1]), rapat: r[2], tempat: r[3], pimpinan: r[4],
    notulis: r[5], peserta: r[6], pembahasan: r[7], keputusan: r[8] })).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

/** Usulan nomor surat keluar berikutnya: urut/kode/PK/bulan-romawi/tahun. */
function usulanNomorSurat_() {
  const kini = new Date();
  const thn = Utilities.formatDate(kini, CONFIG.ZONA_WAKTU, 'yyyy');
  const bln = BULAN_ROMAWI[Number(Utilities.formatDate(kini, CONFIG.ZONA_WAKTU, 'M')) - 1];
  const n = rows_('SURAT').filter(r => r[1] === 'Keluar' && fmt_(r[3]).slice(0, 4) === thn).length + 1;
  return String(n).padStart(3, '0') + '/' + CONFIG.SURAT_KODE + '/' + bln + '/' + thn;
}

function simpanSurat(pw, x, berkas) {
  cek_(pw);
  if (['Masuk', 'Keluar'].indexOf(x.jenis) < 0) throw new Error('Pilih jenis surat.');
  if (!x.nomor || !x.tanggal || !x.perihal) throw new Error('Nomor, tanggal, dan perihal wajib diisi.');
  let url = '';
  if (berkas && berkas.data) {
    url = folderArsip_().createFile(Utilities.newBlob(Utilities.base64Decode(berkas.data), berkas.mime || 'application/pdf',
      'Surat ' + x.jenis + ' ' + String(x.nomor).replace(/[\/\\]/g, '-') + (berkas.mime === 'application/pdf' ? '.pdf' : '.jpg'))).getUrl();
  }
  kunci_(() => sh_('SURAT').appendRow([idBaru_('SURAT', 'S'), x.jenis, "'" + String(x.nomor).trim(), "'" + x.tanggal,
    String(x.perihal).trim(), String(x.pihak || '').trim(), String(x.ket || '').trim(), url, new Date()]));
  return getData(pw);
}
function hapusSurat(pw, id) { cek_(pw); kunci_(() => hapusBaris_('SURAT', id)); return getData(pw); }

/** Mengubah catatan surat (mis. melengkapi nomor surat hasil tarikan email). */
function ubahSurat(pw, id, x) {
  cek_(pw);
  if (['Masuk', 'Keluar'].indexOf(x.jenis) < 0) throw new Error('Pilih jenis surat.');
  if (!x.nomor || !x.tanggal || !x.perihal) throw new Error('Nomor, tanggal, dan perihal wajib diisi.');
  kunci_(() => {
    const sh = sh_('SURAT'), v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    const i = v.findIndex(r => r[0] === id);
    if (i < 0) throw new Error('Surat tidak ditemukan.');
    sh.getRange(i + 2, 2, 1, 6).setValues([[x.jenis, "'" + String(x.nomor).trim(), "'" + x.tanggal,
      String(x.perihal).trim(), String(x.pihak || '').trim(), String(x.ket || '').trim()]]);
  });
  return getData(pw);
}

// ----------------- SURAT DARI EMAIL (Gmail akun PK) -----------------
// Otomatis tiap 15 menit:
//  • Surat MASUK  = email masuk berlampiran PDF/Word (bukan dari akun sendiri)
//  • Surat KELUAR = email terkirim berlampiran PDF/Word (bukan email otomatis aplikasi)
//  • Label Gmail "SIMAK/Surat Masuk" atau "SIMAK/Surat Keluar" = selalu dicatat (lampiran apa pun, bahkan tanpa lampiran)
// Setiap email hanya dicatat sekali; thread diberi label "SIMAK/Tercatat".
const LABEL_SURAT = { masuk: 'SIMAK/Surat Masuk', keluar: 'SIMAK/Surat Keluar', tercatat: 'SIMAK/Tercatat' };

function aturanSuratEmail_() {
  let a = {};
  try { a = JSON.parse(PropertiesService.getScriptProperties().getProperty('SURAT_EMAIL') || '{}') || {}; } catch (e) {}
  return { aktif: a.aktif !== false, otomatisMasuk: a.otomatisMasuk !== false, otomatisKeluar: a.otomatisKeluar !== false,
    terakhir: a.terakhir || '', hasil: a.hasil || '', galat: a.galat || '' };
}
function simpanAturanSuratEmail(pw, x) {
  cek_(pw);
  const a = aturanSuratEmail_();
  ['aktif', 'otomatisMasuk', 'otomatisKeluar'].forEach(k => { if (k in (x || {})) a[k] = !!x[k]; });
  PropertiesService.getScriptProperties().setProperty('SURAT_EMAIL', JSON.stringify(a));
  return getData(pw);
}
function infoSuratEmail_() {
  const a = aturanSuratEmail_();
  let akun = '';
  try { akun = Session.getEffectiveUser().getEmail(); } catch (e) {}
  return Object.assign(a, { akun: akun, label: LABEL_SURAT });
}
/** Tombol "Tarik sekarang" di admin. */
function tarikSuratEmailSekarang(pw) {
  cek_(pw);
  const r = tarikSuratEmail_(true);
  const d = getData(pw);
  d.hasilTarik = r;
  return d;
}

/** Dijalankan pemicu waktu (tiap 15 menit) atau tombol admin. */
function tarikSuratEmail(e) { pemicu_(e); return tarikSuratEmail_(false); }
function tarikSuratEmail_(paksa) {
  const a = aturanSuratEmail_();
  if (!a.aktif && paksa !== true) return { masuk: 0, keluar: 0 };
  const mulai = Date.now(), hasil = { masuk: 0, keluar: 0 };
  const props = PropertiesService.getScriptProperties();
  try {
    const saya = Session.getEffectiveUser().getEmail().toLowerCase();
    const sudah = {};
    rows_('SURAT').forEach(r => { String(r[9] || '').split(',').forEach(id => { if (id) sudah[id.trim()] = true; }); });
    const lbl = {};
    Object.keys(LABEL_SURAT).forEach(k => { lbl[k] = GmailApp.getUserLabelByName(LABEL_SURAT[k]) || GmailApp.createLabel(LABEL_SURAT[k]); });
    const sumber = [
      { jenis: 'Masuk', q: 'label:' + labelQ_(LABEL_SURAT.masuk) + ' newer_than:60d', paksa: true },
      { jenis: 'Keluar', q: 'label:' + labelQ_(LABEL_SURAT.keluar) + ' newer_than:60d', paksa: true }
    ];
    if (a.otomatisMasuk) sumber.push({ jenis: 'Masuk', q: 'in:inbox has:attachment -from:me newer_than:30d -label:' + labelQ_(LABEL_SURAT.tercatat) });
    if (a.otomatisKeluar) sumber.push({ jenis: 'Keluar', q: 'in:sent has:attachment newer_than:30d -label:' + labelQ_(LABEL_SURAT.tercatat) });

    sumber.forEach(sb => {
      GmailApp.search(sb.q, 0, 40).forEach(th => {
        if (Date.now() - mulai > 4 * 60 * 1000) return;
        let dicatat = false;
        th.getMessages().forEach(m => {
          const id = m.getId();
          if (sudah[id]) return;
          const dari = String(m.getFrom() || ''), dariSaya = dari.toLowerCase().indexOf(saya) >= 0;
          if (sb.jenis === 'Masuk' && dariSaya) return;                 // balasan kita sendiri di thread surat masuk
          if (sb.jenis === 'Keluar' && !dariSaya) return;                // pesan orang lain di thread surat keluar
          const subjek = String(m.getSubject() || '');
          if (!sb.paksa && emailAplikasi_(subjek)) return;              // email otomatis SIMAK (sertifikat, PIN, DAD, dll.)
          const lamp = m.getAttachments({ includeInlineImages: false, includeAttachments: true })
            .filter(b => sb.paksa || /\.(pdf|docx?|odt)$/i.test(b.getName() || '') || /pdf|word|opendocument/i.test(b.getContentType() || ''));
          if (!sb.paksa && !lamp.length) return;
          catatSuratEmail_(sb.jenis, m, lamp);
          sudah[id] = true; dicatat = true;
          hasil[sb.jenis === 'Masuk' ? 'masuk' : 'keluar']++;
        });
        if (dicatat || sb.paksa) { try { th.addLabel(lbl.tercatat); } catch (e) {} }
      });
    });
    const t = aturanSuratEmail_();
    t.terakhir = Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm');
    t.hasil = hasil.masuk + ' masuk, ' + hasil.keluar + ' keluar'; t.galat = '';
    props.setProperty('SURAT_EMAIL', JSON.stringify(t));
  } catch (e) {
    const t = aturanSuratEmail_();
    t.galat = e.message; t.terakhir = Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm');
    props.setProperty('SURAT_EMAIL', JSON.stringify(t));
    if (paksa === true) throw e;
  }
  return hasil;
}
function labelQ_(nama) { return String(nama).replace(/[\/ ]/g, '-'); }      // "SIMAK/Surat Masuk" → label:SIMAK-Surat-Masuk
function emailAplikasi_(subjek) {
  const s = String(subjek || '');
  return s.indexOf(CONFIG.NAMA_SISTEM) >= 0 || s.indexOf('| ' + CONFIG.PENYELENGGARA) >= 0 || s.indexOf('[' + CONFIG.PENYELENGGARA + ']') >= 0;
}
/** Nomor surat: dicari di subjek, nama lampiran, lalu isi email. */
function cariNomorSurat_(teksList) {
  const pola = /(?:No(?:mor)?\.?\s*[:.]?\s*)?(\d{1,4}\s*\/\s*[A-Za-z0-9.\-]+(?:\s*\/\s*[A-Za-z0-9.\-]+){1,7})/;
  for (const t of teksList) {
    const m = String(t || '').match(pola);
    if (m && /[A-Za-z]/.test(m[1])) return m[1].replace(/\s+/g, '');
  }
  return '';
}
function namaPihak_(alamat) {
  const s = String(alamat || '').split(',')[0].trim();
  const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  return m ? (m[1].trim() ? m[1].trim() + ' <' + m[2] + '>' : m[2]) : s;
}
function catatSuratEmail_(jenis, m, lamp) {
  const subjek = String(m.getSubject() || '').replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').trim() || '(tanpa subjek)';
  const tgl = Utilities.formatDate(m.getDate(), CONFIG.ZONA_WAKTU, 'yyyy-MM-dd');
  let isi = '';
  try { isi = String(m.getPlainBody() || '').slice(0, 3000); } catch (e) {}
  const nomor = cariNomorSurat_([subjek].concat(lamp.map(b => b.getName())).concat([isi])) || '(belum ada nomor)';
  const pihak = jenis === 'Masuk' ? namaPihak_(m.getFrom()) : namaPihak_(m.getTo());
  // simpan lampiran ke folder Arsip Surat (lebih dari satu lampiran → satu subfolder)
  let url = '';
  if (lamp.length) {
    const arsip = folderArsip_();
    const dasar = 'Surat ' + jenis + ' ' + tgl + ' - ' + subjek.slice(0, 60).replace(/[\/\\:*?"<>|]/g, '-');
    if (lamp.length === 1) {
      const f = arsip.createFile(lamp[0].copyBlob().setName(dasar + ' - ' + lamp[0].getName()));
      url = f.getUrl();
    } else {
      const fol = arsip.createFolder(dasar);
      lamp.forEach(b => fol.createFile(b.copyBlob()));
      url = fol.getUrl();
    }
  }
  const ket = '📧 Dari email' + (lamp.length > 1 ? ' · ' + lamp.length + ' lampiran' : '') +
    (nomor === '(belum ada nomor)' ? ' · lengkapi nomor surat' : '');
  kunci_(() => sh_('SURAT').appendRow([idBaru_('SURAT', 'S'), jenis, "'" + nomor, "'" + tgl, subjek.slice(0, 200),
    pihak.slice(0, 150), ket, url, new Date(), m.getId()]));
}

function simpanNotulen(pw, n) {
  cek_(pw);
  if (!n.tanggal || !n.rapat || !n.pembahasan) throw new Error('Tanggal, nama rapat, dan pembahasan wajib diisi.');
  const baris = ["'" + n.tanggal, n.rapat, n.tempat || '', n.pimpinan || '', n.notulis || '', n.peserta || '', n.pembahasan, n.keputusan || ''];
  kunci_(() => {
    if (n.id) {
      const sh = sh_('NOTULEN');
      const v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
      const i = v.findIndex(r => r[0] === n.id);
      if (i < 0) throw new Error('Notulen tidak ditemukan.');
      sh.getRange(i + 2, 2, 1, baris.length).setValues([baris]);
    } else {
      sh_('NOTULEN').appendRow([idBaru_('NOTULEN', 'N')].concat(baris, [new Date()]));
    }
  });
  return getData(pw);
}
function hapusNotulen(pw, id) { cek_(pw); kunci_(() => hapusBaris_('NOTULEN', id)); return getData(pw); }

// =========================================================
//                   BUKU INDUK ANGGOTA
// =========================================================
/**
 * Menyusun Buku Induk Anggota di FILE TERPISAH (agar data sistem seperti PIN/NIK tidak ikut terunduh),
 * lalu memberi tautan unduh Excel / PDF. File lama otomatis diganti.
 */
function bukuInduk(pw) {
  cek_(pw);
  const props = PropertiesService.getScriptProperties();
  const lamaId = props.getProperty('FILE_BUKU_INDUK');
  if (lamaId) { try { DriveApp.getFileById(lamaId).setTrashed(true); } catch (e) {} }
  const ss = SpreadsheetApp.create('Buku Induk Anggota ' + CONFIG.PENYELENGGARA + ' ' +
    Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy-MM-dd'));
  try { DriveApp.getFileById(ss.getId()).moveTo(folderCadangan_()); } catch (e) {}
  props.setProperty('FILE_BUKU_INDUK', ss.getId());
  const sh = ss.getSheets()[0].setName('Buku Induk Anggota');
  const absen = rows_('ABSENSI');
  const urut = kodeJenjang_();
  const kepala = ['No', 'NIA', 'Nama Lengkap', 'NPM', 'Email', 'No. HP', 'Tahun DAD', 'Jenjang Perkaderan',
    'Hadir', 'Izin', 'Sakit', 'Alpa', '% Hadir', 'KTA', 'Tempat, Tanggal Lahir', 'Syahadah DAD', 'Tanggal Terdaftar'];
  const isi = rows_('PESERTA').sort((a, b) => String(a[1]).localeCompare(String(b[1]))).map((p, i) => {
    const a = absen.filter(x => x[3] === p[0]);
    const c = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 };
    a.forEach(x => { c[x[5]] = (c[x[5]] || 0) + 1; });
    const jenjang = perkaderanKader_(p).filter(x => x.status === 'Terverifikasi')
      .sort((x, y) => urut.indexOf(x.jenjang) - urut.indexOf(y.jenjang)).map(x => x.jenjang + (x.tahun ? ' (' + x.tahun + ')' : ''));
    return [i + 1, String(p[10] || ''), p[1], String(p[2] || ''), p[3], String(p[4] || ''), p[6] || '', jenjang.join(', '),
      c.Hadir, c.Izin, c.Sakit, c.Alpa, a.length ? Math.round(c.Hadir / a.length * 100) + '%' : '-',
      p[11] ? 'Ada' : '-', [p[12], p[13] ? tglIndo_(tglLahir_(p[13])) : ''].filter(Boolean).join(', '),
      (s => s.status + (s.nomor ? ' (' + s.nomor + ')' : ''))(syahadah_(p)), p[5] instanceof Date ? fmt_(p[5]) : ''];
  });
  sh.getRange(1, 1).setValue('BUKU INDUK ANGGOTA — ' + CONFIG.PENYELENGGARA.toUpperCase()).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1).setValue('Diperbarui: ' + Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'dd/MM/yyyy HH:mm'));
  sh.getRange(4, 1, 1, kepala.length).setValues([kepala]).setFontWeight('bold').setBackground('#8b1a1a').setFontColor('#ffffff');
  if (isi.length) sh.getRange(5, 1, isi.length, kepala.length).setNumberFormat('@').setValues(isi.map(r => r.map(String)))
    .setBorder(true, true, true, true, true, true);
  sh.setFrozenRows(4);
  try { sh.autoResizeColumns(1, kepala.length); } catch (e) {}
  SpreadsheetApp.flush();
  const base = 'https://docs.google.com/spreadsheets/d/' + ss.getId();
  return {
    jumlah: isi.length,
    lihat: base + '/edit',
    excel: base + '/export?format=xlsx',
    pdf: base + '/export?format=pdf&portrait=false&size=A4&fitw=true&gridlines=false&sheetnames=false&printtitle=false'
  };
}

/** Biodata lengkap seluruh pendaftar DAD -> file Spreadsheet terpisah (bisa diunduh Excel / PDF). */
function kelompokProdi_(v) {
  v = String(v || '').toLowerCase().trim();
  if (/pendidikan agama islam|^pai$/.test(v)) return 'PAI';
  if (/komunikasi dan penyiaran islam|^kpi$/.test(v)) return 'KPI';
  return v ? 'Luar FAI' : '-';
}
function biodataDAD(pw, f) {
  cek_(pw);
  f = f || {};
  const props = PropertiesService.getScriptProperties();
  const lamaId = props.getProperty('FILE_BIODATA_DAD');
  if (lamaId) { try { DriveApp.getFileById(lamaId).setTrashed(true); } catch (e) {} }
  const data = rows_('DAD').filter(r => {
    const th = String(r[27] || fmt_(r[9]).slice(0, 4));
    return (!f.tahun || th === String(f.tahun)) && (!f.prodi || kelompokProdi_(r[3]) === f.prodi);
  }).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  const judul = 'Biodata Pendaftar DAD ' + CONFIG.PENYELENGGARA + (f.tahun ? ' ' + f.tahun : '') + (f.prodi ? ' (' + f.prodi + ')' : '');
  const ss = SpreadsheetApp.create(judul + ' - ' + Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy-MM-dd'));
  try { DriveApp.getFileById(ss.getId()).moveTo(folderFormulirDAD_()); } catch (e) {}   // folder privat formulir DAD
  props.setProperty('FILE_BIODATA_DAD', ss.getId());
  const sh = ss.getSheets()[0].setName('Biodata Pendaftar DAD');
  const kepala = ['No', 'Nama Lengkap', 'Jenis Kelamin', 'NPM', 'Program Studi', 'Kelompok', 'Semester', 'Perguruan Tinggi',
    'Tempat Lahir', 'Tanggal Lahir', 'Alamat Asal', 'Alamat Sekarang', 'No. HP / WA', 'Email', 'Sosial Media', 'Motto',
    'Riwayat Pendidikan', 'Riwayat Organisasi', 'Buku Dibaca', 'Karya', 'Target', 'Motivasi',
    'Status', 'Catatan Admin', 'Tahun Daftar', 'Tanggal Daftar', 'Foto', 'Formulir PDF'];
  const isi = data.map((r, i) => [i + 1, r[1], r[13], String(r[2] || ''), r[3], kelompokProdi_(r[3]), String(r[4] || ''), r[19],
    r[14], r[15] instanceof Date ? tglIndo_(r[15]) : String(r[15] || ''), r[16], r[7], String(r[6] || ''), r[5], r[17], r[18],
    r[20], r[21], r[22], r[23], r[24], r[8],
    normalTahap_(r[10]), r[12], String(r[27] || fmt_(r[9]).slice(0, 4)), fmt_(r[9], 'dd/MM/yyyy HH:mm'), r[25], r[26]]
    .map(v => String(v === undefined || v === null ? '' : v)));
  sh.getRange(1, 1).setValue(judul.toUpperCase()).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1).setValue('Diperbarui: ' + Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'dd/MM/yyyy HH:mm') +
    ' · PAI: ' + data.filter(r => kelompokProdi_(r[3]) === 'PAI').length +
    ' · KPI: ' + data.filter(r => kelompokProdi_(r[3]) === 'KPI').length +
    ' · Luar FAI: ' + data.filter(r => kelompokProdi_(r[3]) === 'Luar FAI').length);
  sh.getRange(4, 1, 1, kepala.length).setValues([kepala]).setFontWeight('bold').setBackground('#8b1a1a').setFontColor('#ffffff');
  if (isi.length) sh.getRange(5, 1, isi.length, kepala.length).setNumberFormat('@').setValues(isi)
    .setBorder(true, true, true, true, true, true).setVerticalAlignment('top').setWrap(true);
  sh.setFrozenRows(4);
  try { sh.setColumnWidths(1, kepala.length, 150); sh.setColumnWidth(1, 40); } catch (e) {}
  SpreadsheetApp.flush();
  const base = 'https://docs.google.com/spreadsheets/d/' + ss.getId();
  return {
    jumlah: isi.length,
    lihat: base + '/edit',
    excel: base + '/export?format=xlsx',
    pdf: base + '/export?format=pdf&portrait=false&size=A4&fitw=true&gridlines=false&sheetnames=false&printtitle=false'
  };
}

// =========================================================
//                 CADANGAN DATA OTOMATIS
// =========================================================
function folderCadangan_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_CADANGAN');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(CONFIG.NAMA_SISTEM + ' - Cadangan Data');
  props.setProperty('FOLDER_CADANGAN', f.getId());
  return f;
}

/** Salin seluruh spreadsheet ke folder Cadangan; simpan CONFIG.JUMLAH_CADANGAN salinan terbaru. */
function buatCadangan_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nama = 'Cadangan ' + CONFIG.NAMA_SISTEM + ' ' + Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH.mm');
  const folder = folderCadangan_();
  const salinan = DriveApp.getFileById(ss.getId()).makeCopy(nama, folder);
  const semua = [];
  const it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf('Cadangan ') === 0) semua.push(f); }
  semua.sort((a, b) => b.getDateCreated() - a.getDateCreated());
  semua.slice(CONFIG.JUMLAH_CADANGAN).forEach(f => { try { f.setTrashed(true); } catch (e) {} });
  PropertiesService.getScriptProperties().setProperty('CADANGAN_TERAKHIR', new Date().toISOString());
  return { nama: nama, url: salinan.getUrl() };
}
function cadanganMingguan(e) { pemicu_(e); buatCadangan_(); }

/** Tombol admin: cadangkan sekarang. */
function cadangkanSekarang(pw) {
  cek_(pw);
  const r = buatCadangan_();
  const d = getData(pw);
  d.hasilCadangan = r;
  return d;
}
function infoCadangan_() {
  const t = PropertiesService.getScriptProperties().getProperty('CADANGAN_TERAKHIR');
  let folder = '';
  try { folder = folderCadangan_().getUrl(); } catch (e) {}
  return { terakhir: t ? Utilities.formatDate(new Date(t), CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm') : '', folder: folder };
}

function siapkanSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.values(SHEET).forEach(s => {
    let sh = ss.getSheetByName(s.nama);
    if (!sh) sh = ss.insertSheet(s.nama);
    if (sh.getMaxColumns() < s.header.length) sh.insertColumnsAfter(sh.getMaxColumns(), s.header.length - sh.getMaxColumns());
    const sekarang = sh.getRange(1, 1, 1, s.header.length).getValues()[0];
    if (sekarang.join('|') !== s.header.join('|')) {
      sh.getRange(1, 1, 1, s.header.length).setValues([s.header])
        .setFontWeight('bold').setBackground('#8b1a1a').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
}

/** Info untuk halaman awal (tanpa login). */
function infoAwal() {
  return { nama: CONFIG.NAMA_SISTEM, namaPanjang: CONFIG.NAMA_PANJANG, bidang: CONFIG.BIDANG, penyelenggara: CONFIG.PENYELENGGARA, daftarMandiri: CONFIG.DAFTAR_MANDIRI,
    jadwalDAD: jadwalDAD_(), emailMasukAdmin: CONFIG.EMAIL_MASUK_ADMIN || [], tahun: Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy') };
}

// ---------------------- HELPER ----------------------
function sh_(key) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET[key].nama);
}

function rows_(key) {
  const v = sh_(key).getDataRange().getValues();
  v.shift();
  return v.filter(r => r[0] !== '');
}

function fmt_(d, pola) {
  if (d instanceof Date) return Utilities.formatDate(d, CONFIG.ZONA_WAKTU, pola || 'yyyy-MM-dd');
  return String(d || '');
}

function tglIndo_(s) {
  s = fmt_(s);
  const p = s.split('-');
  if (p.length !== 3) return s;
  return parseInt(p[2], 10) + ' ' + BULAN[parseInt(p[1], 10) - 1] + ' ' + p[0];
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ----- sesi admin: tetap masuk sampai menekan Keluar -----
/** Password admin disimpan di Script Properties (tidak ikut tertimpa saat kode diganti).
 *  CONFIG.PASSWORD_ADMIN hanya dipakai sampai admin menggantinya dari menu Administrasi. */
function passwordAdmin_() {
  return PropertiesService.getScriptProperties().getProperty('PASSWORD_ADMIN') || CONFIG.PASSWORD_ADMIN;
}
function passwordBawaan_() { return !PropertiesService.getScriptProperties().getProperty('PASSWORD_ADMIN') || passwordAdmin_() === 'admin123'; }
function awalanToken_() {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'simak:' + passwordAdmin_())).slice(0, 12) + '.';
}
/** Ganti password admin. Semua perangkat admin lain otomatis keluar. */
function gantiPasswordAdmin(pw, lama, baru) {
  cek_(pw);
  if (String(lama || '') !== passwordAdmin_()) { catatGagal_('__admin__'); throw new Error('Password lama salah.'); }
  baru = String(baru || '');
  if (baru.length < 8) throw new Error('Password baru minimal 8 karakter.');
  if (!/[a-zA-Z]/.test(baru) || !/\d/.test(baru)) throw new Error('Password baru harus berisi huruf dan angka.');
  if (baru === 'admin123' || baru === lama) throw new Error('Pilih password lain.');
  PropertiesService.getScriptProperties().setProperty('PASSWORD_ADMIN', baru);
  return JSON.parse(loginAdmin(baru));
}
function daftarToken_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('TOKEN_ADMIN') || '[]'); }
  catch (e) { return []; }
}
/** pw boleh berupa password admin ATAU token sesi dari loginAdmin. Ganti password = semua sesi lama berakhir. */
function cek_(pw) {
  if (pw && pw === passwordAdmin_()) return;
  if (typeof pw === 'string' && pw.indexOf(awalanToken_()) === 0 && daftarToken_().indexOf(pw) >= 0) return;
  throw new Error('Sesi admin berakhir atau password salah. Silakan masuk lagi.');
}
function loginAdmin(pw) {
  cekBatas_('__admin__');
  if (!pw || pw !== passwordAdmin_()) { catatGagal_('__admin__'); throw new Error('Password admin salah.'); }
  const token = awalanToken_() + Utilities.getUuid();
  const list = daftarToken_().filter(t => t.indexOf(awalanToken_()) === 0);
  list.push(token);
  PropertiesService.getScriptProperties().setProperty('TOKEN_ADMIN', JSON.stringify(list.slice(-20)));
  const data = getData(token);
  data.token = token;
  return JSON.stringify(data);   // dikirim sebagai teks agar tidak pernah diterima browser sebagai null
}
function keluarAdmin(token) {
  const list = daftarToken_().filter(t => t !== token);
  PropertiesService.getScriptProperties().setProperty('TOKEN_ADMIN', JSON.stringify(list));
  return true;
}

function idBaru_(key, awalan) {
  const angka = rows_(key).map(r => parseInt(String(r[0]).replace(awalan, ''), 10) || 0);
  const n = (angka.length ? Math.max.apply(null, angka) : 0) + 1;
  return awalan + String(n).padStart(3, '0');
}

function hapusBaris_(key, id) {
  const sh = sh_(key);
  const last = sh.getLastRow();
  if (last < 2) return;
  const v = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    if (v[i][0] === id) sh.deleteRow(i + 2);
  }
}

function tulisUlangAbsensi_(data) {
  const sh = sh_('ABSENSI');
  const n = SHEET.ABSENSI.header.length;
  data = data.map(r => { r = r.slice(0, n); while (r.length < n) r.push(''); return r; });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, n).clearContent();
  if (data.length) sh.getRange(2, 1, data.length, n).setValues(data);
}

function statusTidakHadir_(s) {
  return s === 'Alpa' || (CONFIG.IZIN_SAKIT_DIHITUNG && (s === 'Izin' || s === 'Sakit'));
}

// ----- Kegiatan beberapa hari (mis. DAD 4 hari 3 malam): absensi per hari -----
function jumlahHari_(keg) { const n = parseInt(keg[18], 10); return n > 1 ? Math.min(n, 30) : 1; }
function minHadir_(keg) {
  const n = jumlahHari_(keg), m = parseInt(keg[19], 10);
  if (m >= 1) return Math.min(m, n);
  return n === 1 ? 1 : Math.min(n, Math.max(2, Math.ceil(n / 2)));     // bawaan: 2 hari = 2x, 4 hari = 2x
}
function tambahTgl_(ymd, n) {
  const a = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(a[0], a[1] - 1, a[2] + n)).toISOString().slice(0, 10);
}
function selisihHari_(dari, ke) {
  const a = String(dari).split('-').map(Number), b = String(ke).split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 864e5);
}
function hariIni_() { return Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy-MM-dd'); }
/** Hari ke berapa kegiatan pada hari ini (1..N), atau 0 bila di luar rentang. Kegiatan 1 hari selalu 1. */
function hariKe_(keg) {
  const n = jumlahHari_(keg);
  if (n === 1) return 1;
  const d = selisihHari_(fmt_(keg[2]), hariIni_()) + 1;
  return d >= 1 && d <= n ? d : 0;
}
function hariBaris_(r) { const h = parseInt(r[10], 10); return h >= 1 ? h : 1; }
/** Peta jumlah hari HADIR per orang pada satu kegiatan (kader dari Absensi, tamu dari Peserta Umum). */
function hitungHadir_(idKeg, absen, tamu) {
  const kader = {}, hariK = {};
  (absen || rows_('ABSENSI')).forEach(r => {
    if (r[0] !== idKeg || r[5] !== 'Hadir') return;
    const k = r[3] + '|' + hariBaris_(r);
    if (!hariK[k]) { hariK[k] = 1; kader[r[3]] = (kader[r[3]] || 0) + 1; }
  });
  const tm = {};
  (tamu || rows_('TAMU')).forEach(r => {
    if (r[1] !== idKeg || r[7] !== 'Hadir') return;
    const list = String(r[11] || '').split(',').map(x => x.trim()).filter(Boolean);
    tm[r[0]] = Math.max(1, new Set(list).size);
  });
  return { kader: kader, tamu: tm };
}
/** Admin mengatur lama kegiatan & syarat minimal hadir untuk sertifikat. */
function aturHariKegiatan(pw, id, jumlahHari, minHadir) {
  cek_(pw);
  const n = Math.max(1, Math.min(30, parseInt(jumlahHari, 10) || 1));
  const m = Math.max(1, Math.min(n, parseInt(minHadir, 10) || 1));
  kunci_(() => {
    const sh = sh_('KEGIATAN');
    if (sh.getMaxColumns() < 20) sh.insertColumnsAfter(sh.getMaxColumns(), 20 - sh.getMaxColumns());
    sh.getRange(barisKeg_(id), 19, 1, 2).setValues([[n, m]]);
  });
  return getData(pw);
}

function statusKeg_(r) {
  return r[7] === 'Tutup' ? 'Tutup' : 'Buka';
}

function kunci_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Tahun DAD: angka 4 digit (1964 = berdirinya IMM) sampai tahun ini, atau kosong. */
function tahunDad_(t) {
  const n = parseInt(t, 10);
  const kini = Number(Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy'));
  if (!t) return '';
  if (!(n >= 1964 && n <= kini)) throw new Error('Tahun tidak valid.');
  return n;
}

function cekEmail_(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) throw new Error('Format email tidak valid.');
}

// ----- Pemilah NPM / NIA -----
/** Ubah huruf/angka "gaya" dari keyboard font (mis. 𝟤𝟥𝟩 atau 𝖭𝗉𝗆) jadi huruf biasa + buang karakter tak terlihat. */
function rapiTeks_(s) { s = String(s == null ? '' : s); try { s = s.normalize('NFKC'); } catch (e) {} return s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, ''); }
function normalNomor_(s) { return rapiTeks_(s).toUpperCase().replace(/[\s.\-\/_]/g, ''); }
/** 'NPM' | 'NIA' | '' — ditebak dari bentuk nomornya. */
function jenisNomor_(s) {
  const t = rapiTeks_(s).trim().replace(/^'/, '');
  if (!t) return '';
  return CONFIG.POLA_NPM.test(t.replace(/\s/g, '')) ? 'NPM' : 'NIA';
}
/** Mengurai satu isian yang bisa berisi NPM saja, NIA saja, atau NPM + NIA sekaligus
 *  (mis. "2370233016 / 17.07.0042", "2370233016+17.07.0042", "17.07.0042, 2370233016"). */
function uraiNomor_(teks) {
  const t = rapiTeks_(teks).trim().replace(/^'/, '');
  if (!t) return { npm: '', nia: '' };
  if (jenisNomor_(t) === 'NPM') return { npm: t.replace(/\s/g, ''), nia: '' };
  const m = t.match(/(^|[^\d.\-\/])(\d{8,12})(?=$|[^\d.\-\/])/);
  if (m) {
    const sisa = (t.slice(0, m.index + m[1].length) + ' ' + t.slice(m.index + m[0].length))
      .replace(/\b(dan|and|nia|npm)\b/gi, ' ').replace(/^[\s+,;&|:\/]+|[\s+,;&|:\/]+$/g, '').replace(/\s{2,}/g, ' ').trim();
    if (sisa && /\d/.test(sisa)) return { npm: m[2], nia: sisa };
    if (!sisa) return { npm: m[2], nia: '' };
  }
  return { npm: '', nia: t };
}
/** Memisahkan isian "NPM atau NIA" ke kolom yang benar. */
function pisahNomor_(nim, nia) {
  const u = uraiNomor_(nim);
  return { npm: u.npm, nia: String(nia || '').trim() || u.nia };
}
/** Cek NPM / NIA tidak dipakai kader lain. */
function cekNomorUnik_(npm, nia, kecualiId) {
  const semua = rows_('PESERTA').filter(r => r[0] !== kecualiId);
  const dipakai = x => semua.some(r => normalNomor_(r[2]) === normalNomor_(x) || normalNomor_(r[10]) === normalNomor_(x));
  if (npm && dipakai(npm)) throw new Error('NPM ' + npm + ' sudah dipakai kader lain.');
  if (nia && dipakai(nia)) throw new Error('NIA ' + nia + ' sudah dipakai kader lain.');
}
/** Sekali jalan (dipanggil setup): pindahkan NIA yang terlanjur tertulis di kolom NPM. */
function rapikanNomor_() {
  const sh = sh_('PESERTA');
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const v = sh.getRange(2, 1, last - 1, 11).getValues();
  let n = 0;
  // 1) Angka/huruf "gaya" keyboard (𝟤𝟥𝟩…) → biasa: Nama, NPM, Email, HP, NIA
  [1, 2, 3, 4, 10].forEach(c => v.forEach((r, i) => {
    if (typeof r[c] !== 'string') return;
    let b = rapiTeks_(r[c]); if (c === 3) b = b.trim().toLowerCase();
    if (b !== r[c]) { r[c] = b; sh.getRange(i + 2, c + 1).setValue(c === 2 || c === 4 || c === 10 ? "'" + b : b); n++; }
  }));
  // 2) NPM yang terlanjur tersimpan di kolom NIA (karena dulu terbaca NIA) → kembalikan ke kolom NPM
  v.forEach((r, i) => {
    const nia = String(r[10] || '').trim().replace(/^'/, '');
    if (r[0] && !String(r[2] || '').trim() && jenisNomor_(nia) === 'NPM') {
      sh.getRange(i + 2, 3).setValue("'" + nia.replace(/\s/g, '')); sh.getRange(i + 2, 11).setValue('');
      r[2] = nia; r[10] = ''; n++;
    }
  });
  v.forEach((r, i) => {
    if (r[0] && r[2] && jenisNomor_(r[2]) === 'NIA') {        // berisi NIA, atau NPM + NIA sekaligus
      const u = uraiNomor_(r[2]);
      if (u.nia && !String(r[10] || '').trim()) sh.getRange(i + 2, 11).setValue("'" + u.nia);
      sh.getRange(i + 2, 3).setValue(u.npm ? "'" + u.npm : '');
      n++;
    }
  });
  return n;
}

function emailSudahAda_(email) {
  email = String(email).trim().toLowerCase();
  return rows_('PESERTA').some(r => String(r[3]).trim().toLowerCase() === email);
}

/** Jarak dua titik GPS dalam meter (rumus Haversine). */
function jarak_(lat1, lng1, lat2, lng2) {
  const R = 6371000, t = Math.PI / 180;
  const dLat = (lat2 - lat1) * t, dLng = (lng2 - lng1) * t;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Ambil dua angka koordinat dari teks, mis. "-3.7590, 102.2655" (salinan Google Maps). */
function parseKoordinat_(teks) {
  const m = String(teks || '').match(/-?\d+(?:\.\d+)?/g);
  if (!m || m.length < 2) throw new Error('Koordinat tidak valid. Contoh: -3.7590, 102.2655');
  const lat = parseFloat(m[0]), lng = parseFloat(m[1]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Koordinat di luar jangkauan.');
  return { lat: lat, lng: lng };
}

function petaLokasi_() {
  const m = {};
  rows_('LOKASI').forEach(r => {
    m[r[0]] = { id: r[0], nama: r[1], lat: Number(r[2]), lng: Number(r[3]),
                radius: Number(r[4]) || CONFIG.RADIUS_DEFAULT };
  });
  return m;
}

// =========================================================
//                       OPERATOR
// =========================================================
/** Diagnosa dari editor: jalankan cekAdmin lalu lihat Log eksekusi. */
function cekAdmin() {
  hanyaEditor_();
  const temuan = [];
  const telusuri = (o, jalur) => {
    if (o instanceof Date) { temuan.push(jalur); return; }
    if (o && typeof o === 'object') Object.keys(o).forEach(k => telusuri(o[k], jalur + '.' + k));
  };
  const d = getData(passwordAdmin_());
  telusuri(d, 'data');
  Logger.log('Data admin OK. Kader: ' + d.peserta.length + ', kegiatan: ' + d.kegiatan.length +
    ', ukuran: ' + Math.round(JSON.stringify(d).length / 1024) + ' KB' + (temuan.length ? '\nNilai tanggal mentah: ' + temuan.join(', ') : ''));
}

/** Mengubah nilai yang tidak bisa dikirim ke browser (mis. Date mentah dari sel) menjadi teks,
 *  karena satu nilai Date saja membuat seluruh data diterima browser sebagai null. */
function bersih_(o) {
  return JSON.parse(JSON.stringify(o, function (k, v) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)) {
      return Utilities.formatDate(new Date(v), CONFIG.ZONA_WAKTU, 'yyyy-MM-dd');
    }
    return (typeof v === 'number' && !isFinite(v)) ? null : v;
  }));
}


/** Pastikan gambar latar yang dipakai untuk pratinjau dapat dimuat oleh browser. */
function pastikanLatarPratinjau_(id) {
  id = String(id || '').trim();
  if (!id) return;
  const props = PropertiesService.getScriptProperties(), k = 'LATAR_PREVIEW_PUBLIK_' + id;
  if (props.getProperty(k) === '1') return;
  try {
    DriveApp.getFileById(id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    props.setProperty(k, '1');
  } catch (e) { Logger.log('Akses pratinjau latar: ' + e.message); }
}

function getData(pw) {
  cek_(pw);
  const absen = rows_('ABSENSI');
  const lokasi = petaLokasi_();

  const kader = rows_('PESERTA').map(r => ({
    id: r[0], nama: r[1], nim: String(r[2]), email: r[3], hp: String(r[4]), tahunDad: String(r[6] || ''), nia: String(r[10] || ''), kta: String(r[11] || ''),
    tempatLahir: String(r[12] || ''), tanggalLahir: tglLahir_(r[13]), syahadah: syahadah_(r)
  }));

  const jmlSertif = {};
  rows_('SERTIFIKAT').forEach(r => { jmlSertif[r[0]] = (jmlSertif[r[0]] || 0) + 1; });

  const kegRows = rows_('KEGIATAN'), tamuRows = rows_('TAMU');
  const kegiatan = kegRows.map(r => {
    if (r[12]) pastikanLatarPratinjau_(r[12]);
    const a = absen.filter(x => x[0] === r[0]);
    const rekap = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 };
    a.forEach(x => { rekap[x[5]] = (rekap[x[5]] || 0) + 1; });
    const lok = lokasi[r[8]];
    const nHari = jumlahHari_(r), minH = minHadir_(r), hdr = hitungHadir_(r[0], a, tamuRows);
    const rekapHari = [];
    for (let h = 1; h <= nHari; h++) {
      const x = { hari: h, tanggal: tambahTgl_(fmt_(r[2]), h - 1), Hadir: 0, Izin: 0, Sakit: 0 };
      a.forEach(y => { if (hariBaris_(y) === h && x[y[5]] != null && y[7] !== 'Otomatis') x[y[5]]++; });
      rekapHari.push(x);
    }
    const orang = {}; a.forEach(y => { orang[y[3]] = 1; });
    return {
      jumlahHari: nHari, minHadir: minH, tanggalSelesai: tambahTgl_(fmt_(r[2]), nHari - 1), hariKe: hariKe_(r), rekapHari: rekapHari,
      jumlahOrang: Object.keys(orang).length,
      layakSertifikat: Object.keys(hdr.kader).filter(k => hdr.kader[k] >= minH).length + Object.keys(hdr.tamu).filter(k => hdr.tamu[k] >= minH).length,
      id: r[0], nama: r[1], tanggal: fmt_(r[2]), waktu: fmt_(r[3], 'HH:mm'),
      tempat: r[4], ket: r[5], status: statusKeg_(r), rekap: rekap, jumlahAbsen: a.length,
      idLokasi: r[8] || '', namaLokasi: lok ? lok.nama : '(lokasi belum diatur)',
      sertifikat: r[10] === 'Ya', sertifikatDibuka: r[14] === 'Ya', ttd: String(r[15] || '').split(',').filter(Boolean), jumlahSertifikat: jmlSertif[r[0]] || 0,
      statusSiaran: String(r[17] || 'Status lama—belum diverifikasi'),
      nomorPeserta: dasarNomor_(r, kegRows).peserta, nomorPanitia: dasarNomor_(r, kegRows).panitia,
      jumlahTamu: tamuRows.filter(t => t[1] === r[0]).length,
      nomorPesertaOto: !String(r[11] || '').trim(), nomorPanitiaOto: !String(r[13] || '').trim(),
      latar: r[12] ? 'https://drive.google.com/file/d/' + r[12] + '/view' : '',
      desain: desainKhusus_(r)
    };
  }).sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  const rekapPeserta = kader.map(p => {
    const a = absen.filter(x => x[3] === p.id);
    const c = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 };
    a.forEach(x => { c[x[5]] = (c[x[5]] || 0) + 1; });
    return Object.assign({}, p, c, {
      total: a.length,
      persen: a.length ? Math.round(c.Hadir / a.length * 100) : 0,
      tidakHadir: a.filter(x => statusTidakHadir_(x[5])).length
    });
  });

  return bersih_({
    peserta: kader,
    kegiatan: kegiatan,
    lokasi: Object.values(lokasi),
    galeri: galeri_(),
    dad: dataDAD_(),
    jadwalDAD: jadwalDAD_(),
    cadangan: infoCadangan_(),
    perkaderan: perkaderan_(),
    surat: daftarSurat_(),
    suratEmail: infoSuratEmail_(),
    wa: (() => { try { return infoWA_(); } catch (e) { return null; } })(),
    passwordBawaan: passwordBawaan_(),
    panitia: daftarPanitia_(),
    tamu: daftarTamu_(),
    peranPanitia: CONFIG.PERAN_PANITIA,
    penandaTangan: infoPenandaTangan_(),
    pengumuman: daftarPengumuman_(),
    dasbor: dasbor_(absen),
    usulanNomor: usulanNomorSurat_(),
    notulen: daftarNotulen_(),
    jenjang: CONFIG.JENJANG_PERKADERAN,
    rekapPeserta: rekapPeserta,
    config: {
      nama: CONFIG.NAMA_SISTEM,
      penyelenggara: CONFIG.PENYELENGGARA,
      batas: CONFIG.BATAS_TIDAK_HADIR,
      izinDihitung: CONFIG.IZIN_SAKIT_DIHITUNG,
      radiusDefault: CONFIG.RADIUS_DEFAULT,
      maksUploadMb: CONFIG.MAKS_UPLOAD_MB,
      urlTemplateSertifikat: urlTemplateSertifikat_(),
      urlPublik: CONFIG.URL_PUBLIK || urlAplikasi_()
    }
  });
}

// ----- Lokasi -----
function tambahLokasi(pw, l) {
  cek_(pw);
  if (!l.nama) throw new Error('Nama lokasi wajib diisi.');
  const k = parseKoordinat_(l.koordinat);
  const radius = Number(l.radius) || CONFIG.RADIUS_DEFAULT;
  if (radius < 10) throw new Error('Radius minimal 10 meter.');
  kunci_(() => {
    const id = idBaru_('LOKASI', 'L');
    sh_('LOKASI').appendRow([id, l.nama.trim(), k.lat, k.lng, radius, new Date()]);
  });
  return getData(pw);
}

function hapusLokasi(pw, id) {
  cek_(pw);
  if (rows_('KEGIATAN').some(r => r[8] === id)) {
    throw new Error('Lokasi ini masih dipakai kegiatan. Hapus atau ganti kegiatannya dulu.');
  }
  kunci_(() => hapusBaris_('LOKASI', id));
  return getData(pw);
}

// ----- Kader -----
function tambahPeserta(pw, p) {
  cek_(pw);
  if (!p.nama || !p.email) throw new Error('Nama dan email wajib diisi.');
  cekEmail_(p.email);
  const tglL = cekTglLahir_(p.tanggalLahir);
  kunci_(() => {
    if (emailSudahAda_(p.email)) throw new Error('Email ini sudah terdaftar.');
    const no = pisahNomor_(p.nim, p.nia);
    cekNomorUnik_(no.npm, no.nia, null);
    const id = idBaru_('PESERTA', 'P');
    sh_('PESERTA').appendRow([id, p.nama.trim(), no.npm ? "'" + no.npm : '', p.email.trim(),
      "'" + (p.hp || ''), new Date(), tahunDad_(p.tahunDad), '', '', '[]', no.nia ? "'" + no.nia : '', '',
      String(p.tempatLahir || '').trim(), tglL ? "'" + tglL : '', 'Belum', '', '', '']);
  });
  sambutKaderBaru_(p);
  return getData(pw);
}

function hapusPeserta(pw, id) {
  cek_(pw);
  kunci_(() => {
    hapusBaris_('PESERTA', id);
    tulisUlangAbsensi_(rows_('ABSENSI').filter(r => r[3] !== id));
  });
  return getData(pw);
}

function editPeserta(pw, id, p) {
  cek_(pw);
  if (!p.nama || !p.email) throw new Error('Nama dan email wajib diisi.');
  cekEmail_(p.email);
  kunci_(() => {
    const email = p.email.trim().toLowerCase();
    if (rows_('PESERTA').some(r => r[0] !== id && String(r[3]).trim().toLowerCase() === email)) {
      throw new Error('Email ini sudah dipakai kader lain.');
    }
    const sh = sh_('PESERTA');
    const last = sh.getLastRow();
    const v = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
    const i = v.findIndex(r => r[0] === id);
    if (i < 0) throw new Error('Kader tidak ditemukan.');
    const no = pisahNomor_(p.nim, p.nia);
    cekNomorUnik_(no.npm, no.nia, id);
    sh.getRange(i + 2, 2, 1, 4).setValues([[p.nama.trim(), no.npm ? "'" + no.npm : '',
      p.email.trim(), "'" + (p.hp || '')]]);
    sh.getRange(i + 2, 7).setValue(tahunDad_(p.tahunDad));
    sh.getRange(i + 2, 11).setValue(no.nia ? "'" + no.nia : '');
    if (p.tempatLahir !== undefined || p.tanggalLahir !== undefined) {
      const tglL = cekTglLahir_(p.tanggalLahir);
      if (sh.getMaxColumns() < 18) sh.insertColumnsAfter(sh.getMaxColumns(), 18 - sh.getMaxColumns());
      sh.getRange(i + 2, 13, 1, 2).setValues([[String(p.tempatLahir || '').trim(), tglL ? "'" + tglL : '']]);
    }

    // perbarui nama di riwayat absensi
    const sa = sh_('ABSENSI');
    const la = sa.getLastRow();
    if (la >= 2) {
      const a = sa.getRange(2, 4, la - 1, 2).getValues();
      let ubah = false;
      a.forEach(r => { if (r[0] === id) { r[1] = p.nama.trim(); ubah = true; } });
      if (ubah) sa.getRange(2, 4, la - 1, 2).setValues(a);
    }
  });
  return getData(pw);
}

// ----- Kegiatan -----
function tambahKegiatan(pw, k) {
  cek_(pw);
  if (!k.nama || !k.tanggal) throw new Error('Nama kegiatan dan tanggal wajib diisi.');
  const lok = petaLokasi_()[k.idLokasi];
  if (!k.idLokasi || !lok) throw new Error('Pilih lokasi kegiatan (tambahkan dulu di tab Lokasi).');
  // Kegiatan hanya disimpan terlebih dahulu. Tidak mengirim Gmail, notifikasi,
  // atau undangan Google Calendar sampai admin menekan tombol Bagikan.
  const jmlHari = Math.max(1, Math.min(30, parseInt(k.jumlahHari, 10) || 1));
  const minHdr = Math.max(1, Math.min(jmlHari, parseInt(k.minHadir, 10) || (jmlHari === 1 ? 1 : Math.max(2, Math.ceil(jmlHari / 2)))));
  let idKegiatan = '';
  kunci_(() => {
    idKegiatan = idBaru_('KEGIATAN', 'K');
    sh_('KEGIATAN').appendRow([idKegiatan, k.nama.trim(), "'" + k.tanggal, "'" + (k.waktu || ''),
      k.tempat || '', k.ket || '', new Date(), 'Buka', k.idLokasi, '', k.sertifikat ? 'Ya' : '', '', '', '', '', '', '', 'Belum dibagikan',
      jmlHari, minHdr]);
  });
  const data = getData(pw);
  data.infoKalender = 'Kegiatan tersimpan dan absensi dibuka. Belum ada email, notifikasi, atau undangan kalender yang dikirim. Tekan “Bagikan” jika sudah siap.';
  return data;
}

/** Admin mengubah kegiatan yang sudah dibuat (nama, tanggal, waktu, lokasi, lama hari, dll.).
 *  Tanggal di data absensi ikut disesuaikan; undangan Google Calendar (jika ada) ikut diperbarui. */
function ubahKegiatan(pw, id, k) {
  cek_(pw);
  k = k || {};
  const nama = rapiTeks_(k.nama || '').trim(), tanggal = String(k.tanggal || '').trim(), waktu = String(k.waktu || '').trim();
  if (!nama || !tanggal) throw new Error('Nama kegiatan dan tanggal wajib diisi.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new Error('Format tanggal tidak valid.');
  if (waktu && !/^\d{2}:\d{2}$/.test(waktu)) throw new Error('Format waktu tidak valid.');
  const lok = petaLokasi_()[k.idLokasi];
  if (!k.idLokasi || !lok) throw new Error('Pilih lokasi kegiatan.');
  const n = Math.max(1, Math.min(30, parseInt(k.jumlahHari, 10) || 1));
  const m = Math.max(1, Math.min(n, parseInt(k.minHadir, 10) || 1));
  let lama;
  kunci_(() => {
    lama = rows_('KEGIATAN').find(r => r[0] === id);
    if (!lama) throw new Error('Kegiatan tidak ditemukan.');
    const absen = rows_('ABSENSI').filter(r => r[0] === id && r[7] !== 'Otomatis');
    const hariMaks = absen.reduce((a, r) => Math.max(a, hariBaris_(r)), 0);
    if (hariMaks > n) throw new Error('Sudah ada absensi pada hari ke-' + hariMaks + '. Lama kegiatan tidak bisa dikurangi di bawah ' + hariMaks + ' hari.');
    const sh = sh_('KEGIATAN'), b = barisKeg_(id);
    if (sh.getMaxColumns() < 20) sh.insertColumnsAfter(sh.getMaxColumns(), 20 - sh.getMaxColumns());
    sh.getRange(b, 2, 1, 5).setValues([[nama, "'" + tanggal, "'" + waktu, String(k.tempat || '').trim(), String(k.ket || '').trim()]]);
    sh.getRange(b, 9).setValue(k.idLokasi);
    sh.getRange(b, 11).setValue(k.sertifikat ? 'Ya' : '');
    sh.getRange(b, 19, 1, 2).setValues([[n, m]]);
    // data absensi: nama & tanggal kegiatan ikut diperbarui (tanggal = tanggal mulai + (hari ke - 1))
    const sa = sh_('ABSENSI'), la = sa.getLastRow();
    if (la > 1) {
      const v = sa.getRange(2, 1, la - 1, 11).getValues();
      let ubah = false;
      const nilai = v.map(r => {
        if (r[0] !== id) return [r[1], r[2] instanceof Date || r[2] === '' ? r[2] : "'" + r[2]];   // baris lain ditulis apa adanya
        ubah = true;
        return [nama, "'" + (n > 1 ? tambahTgl_(tanggal, hariBaris_(r) - 1) : tanggal)];
      });
      if (ubah) sa.getRange(2, 2, la - 1, 2).setValues(nilai);
    }
  });
  const info = ['Perubahan kegiatan disimpan.'];
  const berubahJadwal = fmt_(lama[2]) !== tanggal || fmt_(lama[3], 'HH:mm') !== waktu || lama[1] !== nama;
  if (lama[9] && berubahJadwal) {
    try {
      const ev = CalendarApp.getDefaultCalendar().getEventById(lama[9]);
      if (ev) {
        ev.setTitle(nama + ' | ' + CONFIG.PENYELENGGARA);
        ev.setLocation([lok.nama, String(k.tempat || '').trim()].filter(Boolean).join(' · '));
        if (waktu) {
          const mulai = Utilities.parseDate(tanggal + ' ' + waktu, CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm');
          ev.setTime(mulai, new Date(mulai.getTime() + CONFIG.DURASI_KEGIATAN_JAM * 3600000));
        } else ev.setAllDayDate(Utilities.parseDate(tanggal + ' 12:00', CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm'));
        info.push('Jadwal di Google Calendar ikut diperbarui.');
      }
    } catch (e) { info.push('Google Calendar gagal diperbarui: ' + e.message); }
  }
  if (berubahJadwal && String(lama[17] || '') === 'Sudah dibagikan') info.push('Kegiatan ini sudah pernah dibagikan — kabari kader tentang perubahan jadwal (email/WA lama tidak dikirim ulang).');
  const data = getData(pw);
  data.infoKalender = info.join(' ');
  return data;
}

function barisKeg_(id) {
  const sh = sh_('KEGIATAN'), v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  const i = v.findIndex(r => r[0] === id);
  if (i < 0) throw new Error('Kegiatan tidak ditemukan.');
  return i + 2;
}
/** Bagikan kegiatan secara manual setelah admin siap. Mencegah pengiriman ganda. */
function bagikanKegiatanBaru(pw, id, paksa) {
  cek_(pw);
  const sh = sh_('KEGIATAN');
  const rows = rows_('KEGIATAN');
  const keg = rows.find(r => r[0] === id);
  if (!keg) throw new Error('Kegiatan tidak ditemukan.');
  if (String(keg[17] || '').toLowerCase() === 'sudah dibagikan') throw new Error('Kegiatan ini sudah dibagikan. Email/notifikasi tidak dikirim ulang.');
  // kegiatan lama (sebelum ada kolom Status Siaran) boleh dibagikan setelah admin mengonfirmasi
  if (String(keg[17] || '') !== 'Belum dibagikan' && paksa !== true) throw new Error('Status berbagi kegiatan lama belum diketahui. Konfirmasi dulu agar tidak terkirim ganda.');
  if (sh.getMaxColumns() < 18) sh.insertColumnsAfter(sh.getMaxColumns(), 18 - sh.getMaxColumns());
  if (!sh.getRange(1, 18).getValue()) sh.getRange(1, 18).setValue('Status Siaran');
  const lok = petaLokasi_()[keg[8]];
  const obj = { nama: keg[1], tanggal: fmt_(keg[2]), waktu: fmt_(keg[3], 'HH:mm'), tempat: keg[4] || '', ket: keg[5] || '' };
  const info = [];
  try {
    const calId = buatAcaraKalender_(obj, lok);
    if (calId) { sh.getRange(barisKeg_(id), 10).setValue(calId); info.push('Undangan Google Calendar diproses.'); }
    else info.push('Undangan Google Calendar tidak aktif pada konfigurasi.');
  } catch (e) { info.push('Undangan kalender gagal: ' + e.message); }
  const hasil = siarkanKegiatanBaru_(obj, lok);
  if (hasil) info.push(hasil);
  sh.getRange(barisKeg_(id), 18).setValue('Sudah dibagikan');
  const data = getData(pw);
  data.infoKalender = info.join(' ');
  return data;
}

function hapusKegiatan(pw, id) {
  cek_(pw);
  const keg = rows_('KEGIATAN').find(r => r[0] === id);
  if (keg) hapusAcaraKalender_(keg[9]);
  kunci_(() => {
    hapusBaris_('KEGIATAN', id);
    tulisUlangAbsensi_(rows_('ABSENSI').filter(r => r[0] !== id));
    rows_('PANITIA').filter(r => r[1] === id).forEach(r => hapusBaris_('PANITIA', r[0]));
  });
  return getData(pw);
}

/**
 * Buka / tutup absensi kegiatan.
 * Saat DITUTUP: kader yang belum absen otomatis dicatat Alpa,
 * lalu sistem mengecek siapa yang perlu dikirimi email.
 */
function ubahStatusKegiatan(pw, id, status) {
  cek_(pw);
  if (status !== 'Buka' && status !== 'Tutup') throw new Error('Status tidak dikenal.');
  kunci_(() => {
    const sh = sh_('KEGIATAN');
    const last = sh.getLastRow();
    if (last < 2) throw new Error('Kegiatan tidak ditemukan.');
    const v = sh.getRange(2, 1, last - 1, 9).getValues();
    const i = v.findIndex(r => r[0] === id);
    if (i < 0) throw new Error('Kegiatan tidak ditemukan.');
    sh.getRange(i + 2, 8).setValue(status);
    if (status === 'Tutup') catatAlpa_(v[i]);
  });
  const terkirim = status === 'Tutup' ? cekPeringatan_() : [];
  const data = getData(pw);
  data.emailTerkirim = terkirim;
  return data;
}

/** Daftar seluruh kader + status absen mereka pada satu kegiatan (untuk dipantau admin). */
function detailAbsensi(pw, idKeg) {
  cek_(pw);
  const keg = rows_('KEGIATAN').find(r => r[0] === idKeg);
  const nHari = keg ? jumlahHari_(keg) : 1, minH = keg ? minHadir_(keg) : 1;
  const catat = {}, perHari = {};
  rows_('ABSENSI').forEach(r => {
    if (r[0] !== idKeg) return;
    catat[r[3]] = {
      status: r[5], waktu: fmt_(r[6], 'dd/MM/yyyy HH:mm'), sumber: r[7] || '',
      jarak: r[8] === '' ? '' : Math.round(Number(r[8]))
    };
    const ph = perHari[r[3]] = perHari[r[3]] || {};
    if (r[7] === 'Otomatis' && nHari > 1) ph.alpa = true; else ph[hariBaris_(r)] = r[5];
  });
  return rows_('PESERTA').map(p => {
    const ph = perHari[p[0]] || {}, hari = [];
    let hadir = 0;
    for (let h = 1; h <= nHari; h++) { hari.push(ph[h] || (ph.alpa ? 'Alpa' : '')); if (ph[h] === 'Hadir') hadir++; }
    return Object.assign({ id: p[0], nama: p[1], nim: String(p[2]), hari: hari, hadirKali: hadir, layak: hadir >= minH },
      catat[p[0]] || { status: '', waktu: '', sumber: '', jarak: '' });
  });
}

/** Kader yang belum absen pada kegiatan ini dicatat Alpa. */
function catatAlpa_(keg) {
  const id = keg[0];
  const sudah = {};
  rows_('ABSENSI').forEach(r => { if (r[0] === id) sudah[r[3]] = true; });
  const now = new Date();
  const tglKeg = fmt_(keg[2]);
  // hanya kader yang sudah terdaftar pada atau sebelum tanggal kegiatan
  const baru = rows_('PESERTA').filter(p => !sudah[p[0]] && (!p[5] || fmt_(p[5]) <= tglKeg))
    .map(p => [id, keg[1], tglKeg, p[0], p[1], 'Alpa', now, 'Otomatis', '', '']);
  if (baru.length) {
    const sa = sh_('ABSENSI');
    sa.getRange(sa.getLastRow() + 1, 1, baru.length, baru[0].length).setValues(baru);
  }
}

/**
 * Dijalankan otomatis tiap malam pukul 23.00 (dipasang oleh setup).
 * Absensi kegiatan hari ini / yang sudah lewat dan masih "Buka" ditutup,
 * kader yang tidak absen dicatat Alpa, lalu email peringatan dikirim bila perlu.
 */
function tugasHarian(e) {
  pemicu_(e);
  if (!CONFIG.TUTUP_OTOMATIS) return;
  const hariIni = hariIni_();
  let ada = false;
  kunci_(() => {
    const sh = sh_('KEGIATAN');
    const last = sh.getLastRow();
    if (last < 2) return;
    const v = sh.getRange(2, 1, last - 1, Math.min(sh.getMaxColumns(), 20)).getValues();
    v.forEach((r, i) => {
      if (r[0] !== '' && statusKeg_(r) === 'Buka' && tambahTgl_(fmt_(r[2]), jumlahHari_(r) - 1) <= hariIni) {
        sh.getRange(i + 2, 8).setValue('Tutup');
        catatAlpa_(r);
        ada = true;
      }
    });
  });
  if (ada) cekPeringatan_();

  // sertifikat untuk kegiatan yang sudah ditutup & memakai sertifikat
  const mulai = Date.now();
  rows_('KEGIATAN').forEach(r => {
    if (r[14] === 'Ya' && Date.now() - mulai < 4 * 60 * 1000) {     // hanya kegiatan yang sertifikatnya sudah DIBUKA admin
      try { buatSertifikatKegiatan_(r, mulai); } catch (e) { Logger.log('Sertifikat ' + r[0] + ': ' + e.message); }
    }
  });
}

// =========================================================
//        NOTIFIKASI HP: GMAIL & NTFY (bilah notifikasi)
// =========================================================
/** Kirim pemberitahuan kegiatan baru ke HP kader. Mengembalikan ringkasan untuk admin. */
function siarkanKegiatanBaru_(k, lok) {
  const info = [];
  const tgl = tglIndo_(k.tanggal) + (k.waktu ? ', pukul ' + k.waktu : '');
  const tempat = [lok ? lok.nama : '', k.tempat].filter(Boolean).join(' · ');
  const url = urlAplikasi_();

  // 1) Gmail ke semua kader (BCC, per 50 alamat)
  if (CONFIG.EMAIL_KEGIATAN_BARU) {
    const tujuan = rows_('PESERTA').map(r => String(r[3]).trim()).filter(Boolean);
    const sisa = MailApp.getRemainingDailyQuota();
    if (tujuan.length && sisa >= tujuan.length + Math.ceil(tujuan.length / 50)) {
      try {
        const html =
          '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;line-height:1.6">' +
          '<p>Assalamu\'alaikum warahmatullahi wabarakatuh,</p>' +
          '<p>Ada <b>kegiatan baru</b> dari ' + esc_(CONFIG.PENYELENGGARA) + ':</p>' +
          '<table style="border-collapse:collapse;font-size:14px">' +
          '<tr><td style="padding:4px 12px 4px 0;color:#555">Kegiatan</td><td><b>' + esc_(k.nama) + '</b></td></tr>' +
          '<tr><td style="padding:4px 12px 4px 0;color:#555">Waktu</td><td>' + esc_(tgl) + '</td></tr>' +
          '<tr><td style="padding:4px 12px 4px 0;color:#555">Tempat</td><td>' + esc_(tempat || '-') + '</td></tr>' +
          (k.ket ? '<tr><td style="padding:4px 12px 4px 0;color:#555">Keterangan</td><td>' + esc_(k.ket) + '</td></tr>' : '') +
          '</table>' +
          (url ? '<p style="margin:18px 0"><a href="' + url + '" style="background:#8b1a1a;color:#fff;padding:10px 18px;' +
            'border-radius:6px;text-decoration:none;display:inline-block">Buka ' + esc_(CONFIG.NAMA_SISTEM) + ' untuk absen</a></p>' : '') +
          '<p>Jangan lupa hadir dan absen di lokasi kegiatan.</p>' +
          '<p style="font-weight:bold;font-style:italic;color:#8b1a1a">' + esc_(CONFIG.SALAM_PENUTUP).replace(/\n/g, '<br>') + '</p>' +
    '<p><b>' + esc_(pengirim_()) + '</b></p></div>';
        const subjek = '📅 Kegiatan Baru: ' + k.nama.trim() + ' — ' + tgl;
        for (let i = 0; i < tujuan.length; i += 50) {
          MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), bcc: tujuan.slice(i, i + 50).join(','),
            subject: subjek, htmlBody: html, name: pengirim_(),
            body: 'Kegiatan baru: ' + k.nama + ' — ' + tgl + (tempat ? ' di ' + tempat : '') + '. ' + url + '\n\n' + CONFIG.SALAM_PENUTUP });
        }
        info.push('Email pemberitahuan terkirim ke ' + tujuan.length + ' kader.');
      } catch (e) { info.push('Email pemberitahuan gagal: ' + e.message); }
    } else if (tujuan.length) {
      info.push('Email pemberitahuan tidak dikirim: kuota email hari ini tinggal ' + sisa + '.');
    }
  }

  // 2) Push lewat aplikasi ntfy
  if (CONFIG.NTFY_TOPIK) {
    try {
      UrlFetchApp.fetch('https://ntfy.sh/', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({
          topic: CONFIG.NTFY_TOPIK,
          title: '📅 Kegiatan baru: ' + k.nama.trim(),
          message: tgl + (tempat ? '\n📍 ' + tempat : '') + '\nKetuk untuk membuka ' + CONFIG.NAMA_SISTEM + '\n\n' + CONFIG.SALAM_PENUTUP,
          click: url, priority: 4, tags: ['calendar']
        })
      });
      info.push('Notifikasi push (ntfy) terkirim.');
    } catch (e) { info.push('Notifikasi ntfy gagal: ' + e.message); }
  }
  return info.join(' ');
}

// =========================================================
//              GOOGLE CALENDAR (NOTIFIKASI HP)
// =========================================================
function urlAplikasi_() {
  if (CONFIG.URL_PUBLIK) return CONFIG.URL_PUBLIK;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

/** Buat acara di Google Calendar admin dan undang semua kader (masuk ke kalender HP mereka). */
function buatAcaraKalender_(k, lok) {
  if (!CONFIG.UNDANGAN_KALENDER) return '';
  const tamu = rows_('PESERTA').map(r => String(r[3]).trim()).filter(Boolean);
  const judul = k.nama.trim() + ' | ' + CONFIG.PENYELENGGARA;
  const opsi = {
    location: [lok ? lok.nama : '', k.tempat].filter(Boolean).join(' · '),
    description: (k.ket ? k.ket + '\n\n' : '') +
      'Jangan lupa absen lewat ' + CONFIG.NAMA_SISTEM + ': ' + urlAplikasi_() + '\n\n' + CONFIG.SALAM_PENUTUP,
    guests: tamu.join(','),
    sendInvites: true
  };
  const kal = CalendarApp.getDefaultCalendar();
  let ev;
  if (k.waktu) {
    const mulai = Utilities.parseDate(k.tanggal + ' ' + k.waktu, CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm');
    const selesai = new Date(mulai.getTime() + CONFIG.DURASI_KEGIATAN_JAM * 3600000);
    ev = kal.createEvent(judul, mulai, selesai, opsi);
  } else {
    ev = kal.createAllDayEvent(judul, Utilities.parseDate(k.tanggal + ' 12:00', CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm'), opsi);
  }
  try { ev.setGuestsCanSeeGuests(false); ev.addPopupReminder(60); } catch (e) {}
  return ev.getId();
}

/** Kader baru otomatis diundang ke kegiatan yang masih akan datang. */
function undangKegiatanMendatang_(email) {
  if (!CONFIG.UNDANGAN_KALENDER || !email) return;
  const hariIni = Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy-MM-dd');
  const kal = CalendarApp.getDefaultCalendar();
  rows_('KEGIATAN').forEach(r => {
    if (r[9] && statusKeg_(r) === 'Buka' && fmt_(r[2]) >= hariIni) {
      try { const ev = kal.getEventById(r[9]); if (ev) ev.addGuest(String(email).trim()); } catch (e) {}
    }
  });
}

function hapusAcaraKalender_(calId) {
  if (!calId) return;
  try { const ev = CalendarApp.getDefaultCalendar().getEventById(calId); if (ev) ev.deleteEvent(); } catch (e) {}
}

// =========================================================
//                     SERTIFIKAT OTOMATIS
// =========================================================
const LOGO_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAG4AAACQCAMAAADeHa6gAAAAwFBMVEUBAQEjIyT48BXeJCjx9e0dHh0iISJNVmZWWFvi4k6nKzE2VlsuNUerrF5anmqmppkplFpQIB7KzKL9/f3j5VHjmCCpzVwnjCpjrYejpi+cz6Xe31haWyjLQxCfVlaz4stRVFs3OUecUCnJraEqK03HsWVimiuUlJJJSlxnx5SjyjEyS09TWSjl5mFqO04rUyksZTUA+gDt7x1gJSugm0qoNkYzMkNZMiuJGR6dlyoAuwCh71NDSjJ6ca+LJyzd4TbVmFN2AAAAQHRSTlMA+P7//p9c/hn0/v39/v/+//3/Aqn//v////9i/////2ti//8e/f8Llv//HxYk/xj/Aw9WIf+OGkccBBlUBp2apa0fCAAAColJREFUeNrtm/t/mjoUwIMlIYgBRIeirFbxMbWuXbt2d7e72///X92ThEBAfLXCD/dz003e+XJOzsnJC4QuTZQQihpL2MCINgczSHOiGYaBGqU1KxtuDNbDSpW016hwBDdjlGnJEdihwiPqFc7Qdms2G8IB0r9piqM169LQyDVbaY5LafV6vMCtQJPYyBJtQDqc83DNOGGLPSrUiTGuMRJJBG0sMBSso/bIIE0kFW+Fa48MpPaapEKbBimFg17NPFwyR1qvOkU4yE7V6Hq9rPpKAxGpOboTo5hqj7NYh5EGWhFEEjFG/zTjEffZz//pA+nvb9++/f3AfyDBpkbUrr+f/vTHVwoAX2S6U+kXslsVyUbZHXfqkcth0y9Wnhz+L45alSnOb1FpOr24Nu5oOOsrpO6natyMXxQ4xXMMfKH7T4u4l5f2S/sQ7gXdvHzVBfw47gbSAdxnuNQWOEcI6HwI1+EVVvsUrmvAfR3AOR+UzjgTZ6Q4x2kM5zSLE9L9Z5UpcU5juPe6OSriusA76OZtSMbHcAXp8DP6fdNOksBmkH20CGyb2ZEdyONZkiSoLN2Fwm2nHZlUc6t9a0IKoJpmYseWG8AtYJs2mNJnOnh+cUyYY0PDPUucyWT2CmdGrU8B0Ao4g7ynyQR9xhz3V4oLW61Ax7FWZBZx7296zo096RRGbRd869Ec9z7R0hLERglnsiIuYIEunfGOUtvvIac4njMb5TiPH/Oi6ykcfrhCp0CVnefJ7D0dB/tZU/4KPQYNl0gFehnOk8d318Pda7ggtcYMJ4+tDEeujAsKuEQeW1Thnj+MmxdwiwKOCVzSzcpuftWyk9Yf5DhxnHR/XB0n6sygtQg4ZJHihI+bt+1Muoer4Azy/LvdRguonyPGIogJsCv2WmyxmLV/Pz/L3uz2SoMbR+LdAsJrW4ZX3LsS7rxofo1xgZO4mwxH/tO457pwYVhVdnVJx4LRpjkcCyZmuKkFR/dx4ciEv3Afd4WyW1XgJhPeSNrUIV0FjpkTc9IYbuNymulGzeCg6Ez+L7SbwZmyURQ0gwvMNNmNOEKGCxtx85Fs7plevTgVXlmKc6Un2LNacO3ZMtooy+SWIoTbRMt4dn1ce2a5rjsYbEQ4GAWjEQNL2SwHA9e1Zu2rSwe40WjtD5YAYVHIuJdvBv5wNKoFdzOLHX8yGQ6WdshYGLqhvRm4o8nQt2a1mMos9qH6Wg+WYSiKLhzA4dB/jD9qKnMynSJ6X7bMeOCDOOtBGAa8Dlu6IKw/iPcss0cpIeTHhRKlE7m53zHADScTdxCC1YSuD0HP9QduGZdOolyAyyeyqIZbLIV4IzBG10UD1wTh/AErurmaIrpkNPqHNqmk1SrRwAee6foucn1uN77vL21+6UbiaD4BdlF34bU0b5ZWYoAbDs2R4wPONUdcuE1Lw5H3TrRV4mzEeaMJyAglNwEv5G6YtzO1dD7paff2VJily3H2kqtzMnKH7tDksg1C2/5cgcP3aIfO0mfftu0x+lWBm0WbEGotzgMRPUmLZlXSgdFANv1Tszy2DCr9b7TwNPS34K8bu8wGoL+GtsoIYCiMYiu9VsRtUV+Gi6PEsS0jtL0tTbJ2b2/b3UfnMQWOTPC+DexZzuNjt80vlmZkqa1miI4l1VTto4ciLvFuAec7Thwx8PLREKqyaAkW4zx2b73EKgr3kAoHGT0dw/3Jpq2KvmBB8DYccDPHeYRIZDnO0rUs11/7PuASuFgQ7mF3lnDou5ozG4sRjix5ntc1HO7Waxf0x2dfOBwcYg3iWZ5nFQ1l3DoL96CUYH/vab6APMsyHMddr11fJCfdDtdDxzEs1yqIR5WW7FNuoF6rpfvCVzXGDGXlrv0hbKCyhv9Ah3NxPkSeGspP9dKnZp+f7KyMc1/gyvoKGyit4RA8fA2o9WjIYY5ldeECKFsXbmwrizspnirk77kvWB78iQRWArWmC7XK2uVmaVkx/IGuh7l0HYTOMxREp71MvHytG/AQvD7k67nSLB1AOlBilsVYbA09D2m6nOaG8kR/HXGEe5yXcst+0yrOr7e3t1bMvASwPNq5XEQXDgIGTLimufl23s/Kf3qkQcEXE+Hc1cdazdLlMyG3SZJ4cvw0HThFKEjYC7/W1Qxll5fHsQaMUN7Dk3o3poUh0Va5DYIg5aTJ42faxSp6m9co6O5Y5KO40zFyX7A18XiWCFiMMY0HRwsvSF50HN6qqgKex0ebZ3KY+/siezuq4VCygHzsXD7QqN2yW2yBdBzJ7ZKKx++Px/B7iHiZHRNdmZ/kIEfiMU+kwNsUuyR8IoGifqHsyclR/J+5L2yLbRUuXRDwMeHAY0kg+6+FaI7Rj/xlT65xlDf0c9PCZRyYPvyY3sIGHtvDoUw4JEL08SFOWbZZzdJH99PXdPRU4pjo+QR8pqvFkhKOL8Tb5Ybyerodzx+aZ2HI/skNluIcJ1sXtpSLFZSJt//olaAM0MeXrNGieK3++Dsn/vid4cTpiDGZZ47jYuzQeJy3B8gZnZTUFzLxeHtqvEOoXRxgtO3SACN/1TFvxOVxFZ+xGFa6yu5PYQEMb0+VcMWx6PZvlNlXKtz9eQvgS76QjZfODo3WfvoMqizBlHBnNtfRT6RpEzRk23H78ER212BCi+nNIvTMK5Y6HvYFqImg0Mbj3e7tDWL8GFkHV+PEYJVovIPA9va2g0dQizfDp+f2ZuVrqQVS0A/lK4SJY3UPrDWSfR95F+KzQLsx+jk/U5fKF7R+KC/MKXKMg7iOcUfUYmn8Kpt0Z3e6pLFQxcLijdGd40SVC7cYn3JFYs2rtlqUP/zr/L6dYhH1YQW1HGNZQYv49PWr0oyqY/GZhlLomevaoLwlGVfRQJekMLl/6ccKSrJVAed09nj2TMzNl3LGly2v7+GKl1tBcw8yLiyFs2OjCpdOtp89u0YqrYr3QzrGo2YwcRrCO/MK6767YIS2opi/WHJpT6x4USwk4wsdthXedMlq6Yp778SyOt5MjxRNLheB/6tzMjgjPZAsvaq1Lx1hMFGhQ5cl9JHJ5fIq6LS1ZcQsNg4k/P71I3PjWOpUn56+XzrjHUl3+QMleKgypSJBcWzpXtpuK8/MqW6fPZ1IVb3zhaCTVU42PnmwFU56pYXEFLLN88UZDs7lH2uQA32/8mN7NEL2vE//fqDw3KlvQ6im4EO4srfBnVU4PggMoWYvm94+sEcP3qKEW9HsNMetyjhiYLzCRNkU5mEcExBXbFRmQnz+m70l32KeaJaNOEPFadSDx3kWPD9KegjqbMpLCkAYokD2RVG6LgojPTKIHf6ZH1K1IeZlrn96AUGV8F8qqgcoOWwg8TkGwVCKIAYhsF2JF8dpxIB3AhycEvfgrPyFcEJmIy09Qx5gVexY7HFhKH99Ecc4GK24kijPD1QoXwDzL7KEmg28gvc1eNNKbEhWm4nWC/xQkrWg+C0pLr8FzgEO3olirmDRaOJ76Rowkpq/1KYe7GjJcAVcfjJJU0ukuiOAsoTKCNgKdzosshVVtyg1UmH+pGALFfXOsQYdL4VV6nTnf0ZDSMG2oRzImb6Ns0YKuWC8XTpO9jntQVzv5IlS+hf6tt3pHqZLrQAAAABJRU5ErkJggg==';
// Latar sertifikat (JPEG 1440x810)
const LATAR_SERTIFIKAT_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAMqBaADASIAAhEBAxEB/8QAGwABAQEBAQEBAQAAAAAAAAAAAAECBAMFBgf/xAAZAQEBAAMBAAAAAAAAAAAAAAAAAQIDBAX/2gAMAwEAAhADEAAAAfwg5/XFABVAAUUWABVAAUUUlAWWUAFFAUBZZ0dH6Xlw5/1ft99wD53oc3b/ACvg/o+U+Z+0MU5vJqz8/pmUDOAAQFAAKRREFUSgABEGgAAARBoAAEURBVEWAAEBQAAARBqURRAAQRQRRAAQhoARFgBCLqUSUfi/xH9r+Hy9P8lv2vjbemU2VSVQUVRVJVUlVfjqy1ACqAKSilQAKoAoCigAsoApKKKSgPSXH2+39DwaeT9Z1+/T5+a/nnZq+9+A+n/UMpydzzwuvmZ+pqz8ffTbhmpWgCmY0Zapi3JsAGY0ZbGLcmwgGY0uWxi3Js+fi+g+f9AzGsmWxi3JsIBmNLlsYtybABmNGW4ZtyaABIpJsYthoAGY1GWlZqRoUEZjRloZWGgAZjUuWiZWLoJFLw/iP6Fnn2/xPH9H/DY9vDV6MxQWUVZVBVKl+OM9Ki/rOB8fkx+xfls79R8un03zB9N8yn03zEv03zKfSfNH03zB9N80v0nzR9K/NH0nzR9J80v0nzh9J80fSfOR9G/N+hi7PtPv8Ojx+h230eTh8PX+a7MfX9r6/aOG93JjePXV14XhvZrbjwO5HFO/NcTupwzvhw3t0fPdw4p9DJw3tpwzvhw3t0cE7hxT6GThvbThnfDhvbo4HaOKfQycPzP0M15fn/p9tOG9utmPA7RxT6GThvbThnfDhvbo4HaOKfQycN7acM74cN7dHz3cOKfQycN7acM74cN7NHA7hxTvycTuHDO9HDezRwO0vFPoZThvbV4Z3w4b2aTgdpeOd+ThvbThncOG9mjgdqOOd+TidtOF3Q4nZo4ef6jG/iPif0r8jydXw7yY6t3c4Vve4R3dfw/pYPlU6diqvxaZ6QPu/M+p8vnnMXflKAKoAKKAoBKoAFKAUBKvr+r0Y8P6Xq/T8nHz9qetxZ/K/B8858v+se+i58+PVne300kVsmNSGrgaypoIBjUi7ZFgaCAZqLpklirQgGai6ZJYpRQGakumSWKUUEZqLpklirQgGNQumRcqaCAY1Iu5kaypVEWGahpkXNGgAYqRpkXNpQRYZqGmRcqugkWRmoupkXz3Y/OfhP6/87g6/wCRv0P5/o7JV2Ze3fw92jD5Zd+xQ+KM9Ki/d+Z9P5nPjzDfkKoApKKKACygAKKAoCyu3s/W8Ovk/R9v0rwSvi+nz/R/k3h/Ucsfj/sCWc3n66M/LvNkDKAgGVLQgAAEBQBQAEUAAACmVBRFEURRlQWAAAEUAAABEBQAAAZUtCAAqUZUAAAAZUFEAAlRlYUAACVGVhQRS8/479xnk2/xrH9F/Dz0fHt4u635dXfmKvxBnpKj7nzPp/M0Y8xd+YAoCigAsoApKKKADoxvj+o7/wBD5mjl/S+uu7g0z/MO3T978l9n+j1z9Dywvp8+/Q05efpG7HQsAAAgKAAKAgKAAoiiINAAAAiDQAAAIg0AAACIKoiiAAgKAAIAgKAAACIXUoiwAAiDQEoiwAhIqwAAAiIoAEpZ8r6rVl/MvD+hfneHt/GXee/rlVfhUy0gfd+Z9P5nPOYdGRSgKASqAAqgCgSq/Ra58/8AZ9X6Dy+bk+tb7HBOL5/8134en7r6/wBI1XDry9M+nRhcxrdjlsYtybCAZKsaJmoaFASNLlsmLcmwAZjRlsYthoAGSkaGVhoAGSkaGVhoAGZaZbGLcmwAZjRlsYtyaABIqxpJmouggGZauWxi3JsCUZikaGLYaABmLEaGLcmlEBmWmWxi3MuliAZjS8/F38PPn8b8h/W/ia+j+bvpfO29/wAIu3XKH3PmfT+bz48tOjMBQCVQAKUBQCV6dH7fkx4P0nT9vk4vL2eftcm/w/wfr7Mfif1X1RrGeXTnO3VsSzZJvGzINZ1lKACazqshdZ1lLZRLCbxsyDWN5FACazoyDWdZKACazoyDWdZKACazoyDWdZKACazoyDWdZKADO86Mg1jeC2USwms6MhdZ1lKIAms6MhdY3kWUSwms7MA1nWSgSwms7MLDWdZKISwms6Mg1jeC2WIsJrOl5uPs4+fP6mdZ6MOP8T/Q86Nv8DG30RT7fzfp/M58eYvRmALKAAooCgLK+v8AS/XeXr5vt9PTt4NH5z1eb6n8pv8AVsnx/wBKmN1zeftozx0Ltx0MsQMahdMksUooDNQ0yNZU0ADGoNMixSgAzUNMixShBTFRdMiyQ9CpFGKi6ZFilCAZqLpkWKUAGahpkXNGgAY1IaZFilABmpLpklguggGNSLuZGsqUAGNSGmRYsUUBipGmRc0aAlRiovlxdfHz5/UyvRhQfwAuPrAv3Pm/S+bz48w6MxYAFAUUBR3Yub9v2/e8bRz/AGt31PPry/lXbq+18z7n7isbeOF9OPXZozxa6MKEAAAgqgFJQAyooAAAIoBABSKMqWhAAAM+dwuvVUAAAypaEAAAypSkiwAAilAAAAyooEoiwAgKIAAAypaBKIsAMqKBKIADKoAAASo5uLu4efZ9UdGtLF/gIx9dQ+3836XzefHmpvzAFUAUCVb+q0z5/wC29vveXy+Hee3wT5nyfw27HH9K+j2BOTVlu+nphQ34QLQgAUBLBaAAAEBQAAgBC1SAAARC6CAAM68TO/P2XYTNxk9pjJ62UiF0EAAAiF0EAAiiIWhAAUCAoAAEokCgACAIRdBAAWLCAoAEogIIsogAAOfi7OLm2fVHRrA/gFMfYFl+3836XzdGHMN+aigKASvfp/a8ePL+i6Psc/Dnbn9nk9v5z8j9fnPgf0v0RmY8tGbrrKBsxzGljRM1F0LAJGly2TFuTYAJFI0M1DQQUzGly1TFuTYQDMaXLYxbDQsAz4e3kuffz9iL5GsCLB6seixoZWGggGZbLlsYtybCAZjS5bhm3JpYgEirGhmoaABmNGWxi3JoAEiyxomLcrsIBmNLloZqGgAZixGhi3JuWAGY0c/F38PNs+lbnow0E/gJcPZA+3836XzdGPNTfmKSgNSz7nf+n8zV4/oOn138Fs/Ielo+z/L+j+r5T532s6xuebHTz559d43Y2y5RKJrOkyF1nWUpaSwms7Mg1nWSgAms6Mg1nWS2USwms7Mg1jeC2USiazqsg1nWSgLDPn6+Zj18tHvjeTOPbzM3Wzy9s6Mg1nWSlICazoyDWdZFISwm8bMgud4LZRLCazoyDWdZKADO86Mgud4LZSLCazqMhdZ1lFFSwm8bMyw1nWSgSwms6Mg1nWRSIsJrOjm4u3j59n1M7xv10H8DGHsir9r530vm6MOYu/MJS/QxnN+x6P0Xl6Ob9Cen5+scv8q6tf1vX736qpXhrt59dWnPVw6MNZU0EAzUXTJLFtpUAxqQ2yLFKAEzUXTIsU0EAxqRdsUubSiwDNRdMixTQQDGdxfJIntfD1X1lJKGNSLpimsqaCAYqLpkWKUIBjSLplFypoIBioumRYpQAZqGmRcqaBFhmoumUlirQgGNSLuZGsqUAGNSGmRYsUUlRioeXD2cfPs+plejDUsk/gRcPaA+3836XzdGHON2xdfqNOPF+r9v0/Dyc/0D1uLPw/jfmtuPH/VO72CcOrLfr6emNDdjlRQgAAVCgoAABAUAIAoZUtCAABUC0IKSgBlS0IAABjy9y+LeUawPWedNLsypaEAAAypaESiLACBaECAAMqWykgAAWAoAAIsIsKAIAAypaCLAADKiyiAAiyOfh7+Hn2fVHRrCP4EMPaUPtfO+j87nx5unp/V63h+i7Ps4cGdOH0+bs/l3zv6BnPg/0KMbry886cvPvM5RnAIg0EAACpYNAAAAgKEAUAIhdBAoACWFtEAAAiF0EAAAgWhIolACBaEAAAiF0EAASiQWhAAgCIXQRKIACBaAAACIKAIAAiF0ACAAiDQIsAEqOfh7eHn2fWHRrA/gVNftD0l+v7fX+j5fP5fqej27eLR+C7dH3P519D+p5OHvMK4p3ac/DpTbjqy5QDMaMtjFsNBAqRVjRM25NgAkUjQzUNUQDMaXLYxbDQsAkaXLQzbk2EAzFWSQ1fOHu8yejzpqY2psmLYaABmWmUFuML7vMno8xp5aX0l0YtybCAZjS5aGbcmggGZbLlsYtybCJYSKsaGahoAGY0ZaGahoARmWrJsYtybAlhIpJsYtyblgBmWxz8Xdxc+f0lnRhoH8Dr6Oj2uf9P7/AKvg5uH73H29fH0+HJ/Ke3T3/e+3+gEvHry9PDXdryyN+Gs6yWyiWE3jZkGs6ylAFTWdGaLrG8JoAE1nRkGs6yWyiWE3jZkGs6zVAWE1nZkGsbwWyiUQpz2aLneEtyNQHr4+wBrOslABNZ0eMuTebg1c0ssJZou8bXWdZFBLCbxsyC51kpSAms6MiNY3gtlEsJrOjINZ1koAM7xszKLnWSgCJrOjIXWN4LZRLCazoyDWN4LZRLCazqObi7eLn2fVzrPRrWU/kP6Lv/UeZ2cvez6PJ875v5vn1ZfN/q3V6dGFY4Nd11em5cak247ZFimgAmNSLtklirRYBnUhtgaypoAGahpkWKaCAY1Iu2VWKUqAY1Iu2BrKmggGVwuLiprKllgoZ9fPR6sixSgAzUM5ZLmi0KDFZPbflssVaEAxqRdsDWVNBIsM1F0yLlY0EAxUXTIsUoAMakNzI1lSgAzUl0yS5VdBAXFQ0yLmjQIsM1I8uHs4ufP6kXowoB8k7/5Ty/03KfP/AEfD3cuzo5/LWc8vomcDOAQosoACAQFAFAUGVFAAACRS0IAAFQLQigABlS0IAAmoc91CoAF9Yee5us0KAQoAPLPro8p7eIBRCKXahRAAAZUtCAJRAQLQgQABlSggKABlRQQAARAUAAKlhFhQAJYAc3F3cPNs+qOjWB+R/Gfc/omU5uueeN+dnl+xxbvT2O3TRQAEsFoAAgEBQBQFBEpQAAgBC6CAABUC0qAAARKtCACgExoeT18yCvaWRn08/SmbC2UTWRZRLkWDXh7+ACF9Fx6VEQaBFgABCLoIABFhAtCBAAEQtCAAoEIaBAABEBQAAqWCBQAJRAc/D3cPNs+tLOjWAPn4318PXtwy+V28fdg9anRhsUBkpGhmobCAZTSxomai6FiymY0ZbGNIaACSKsaGbcmwgVkssaVmobCAZjS5uhmoaCUGY0ZbGLcmJrNe0sPP08/Uxbow35HtnWUssGLtc59Mk8vfnNFT1pLmNGWxi3JsEBIqybGLcmwgGYqxoZWGhIBmNLloZqGggLM2mWxi3JuWAEiyxomLcrsIC5ikaGVhoAGYsc/F38PPn9K3PRhoHyu72YZTWdZ4/K7eLt59nTnWenXbKJYNZ0ZBrOslsolg1jaZC6zrKUVZYTeNmQazrJQATWdGQazrJbKCDWdVkGs6yWyiWE3jZkGs6yWyolhN42ZBrOsnlNZr2lhj28PYxqDfnvBuWFgZ9fL0MSU9Obp5hvOj1EZ3nRkGsbwWyiWE1nS5BrG8FsolhNZ0ZBrOslEJYTWdmFhrOslABNZ0ZBrG8FsolhNZ1GQusbyiyqlhNZ0ZBrOsiyiWE1nUc3F28XPs+rnWejXQUGdSHze7g7efPoi9GGhQGbBpkWKaCAY1C6ZJYpRSymNSG2KWTRQAmai6ZGsqaCBWbC6ZFimggGNSLtililCUGNSG2BrKmcbxYsq59PPZ6sUsUoQDNRczOTeA1vHobEY1IbYGsqaBAZqLpkXKmggGKi6ZFgaEgGNSLpkWKUIC5rJtmGsqalgBmpLpklyq6CAYqLpkWBoAGKkeXD2cXPn9XK9GFAAsp8nu4e7n2dA6ddAABClAACAQFFALBQZoUAAIBFLQgAAVAtsqAAAZotCAVKAZUUHnjeLFlVvGyqKRKgoAXxzvJZYj08/RdiAMqKAQAAgWhAAEsIsWhAgADKlBAAUCSigQAAIIoAAUDKwoAAIDn4e7i5tn1ZZ0awAHh8z4/Ft+73fP+htnQOnXQAASwWygAIBAUAUBQRBoAAIAQuggAAVAtsJQAARC6CALBQRBoHnjeKWC78/Q0iNRK1KJc6APLNyalg9PP0NiAIg0BAAAiF0EAAgIFoQIAAiFoQAFAiDQIAAIgKAAFSwQKAAQA5+Hu4ObZ3+/437Gq/aHbqA8uH6Nwy+X28fdqvrU6MNWWgMpojQzUNgBMxpY0TNRdCwCRoy2MW5NgAkUjQzUNhAMppY0rNQ2lQDMaXLYxbk2EAkVY0TNuSY1goJvz9StDNQ1SosJFjyz6ZMrk36efobBmNGWhmouggGY0uWxi3JsIISKsaGLcxsIBmKsaGahoAGY0ZbGLcmgASLLGiYtyuwgLmKRoZXJsCWEixz8Xfw8+d7vSbZoZ4yWDWdHyu3i7efZ051no12y0lhN42ZBrOslsolhN42ZBrOspQBU1nRAaxvBoAE1nRkGs6yWyiWE3jZkGs6zVsFlhNZ2ZBrG8FsoBNZ0ZBrOspjG8FBPby2aY0azvBqwQDXnTONQuN4L6+XqblhNZ0ZC6zrJQJYTeNmQXO8FsogTWdGRGsbwWyiWE1nRkGs6yUAE1jZkFzrJQBE1nRkLrG8FsolhNZ0ZBrG8FsolhNZ1HNxdvFz7Pq51no11KUGbB83u4O3n2dEmujXRVBjUhtkWKaSgGNSG2KWBoIFZqLq4JrKmgAZqGmRYpoIBjUi7YGpKaFiwZ1IumRrKmggGbnK+rA1FMY3hFlM7xT1mNiZ2VqDNGNPM3MwuQ16+XqaBmzK+jzG5KaCAY1IumRrKlCAZsi7YRrKmgghmoumRYpQAY1IaZFilAEZsLpgaypoAhmoaZFypoEBmsx58PZxc+f1IdGGgAAfJ7uLu59nQOjWFLKAZUUCwUAJlS0IAFARRQAAAQFCLBQAZUtCBQAEUtCAAZ8vfxMUN+niN4BZRrOzFQ9c2FgNSETRjO8llg9fLZvGYWBn1x7FAAABlSggAARlS0IBAARYtAAABlQAAEAZUtCAqABJRQJYABHNw9/Dz7Pqjo1gAAfK7uDu59nRZejWFAUEQaABUoBEGggAAVLBpKAAAQFCALBQRC6CABQBC2wlQVBcaHgQ0lAFlJ6YG8NDWQuhMyjecjMpZYAAEpr0kXaEqUELAIWhAAgCIXREsAAFgKAAAQIKAIAAiF0AQAAiDQIABLI8OHt4efZ9YdGscON7hZmNW/L7OTt58/Wp0a9gCpFiNWsW5NgAkaMtjFuTYQCRVjSzNQ2lAMxojQzUNBAJFWNDNuTYQDMaWNKzUNBAMppfLHT4GahoI9M7PPNqy6pmzJ6zNTUgmbpfPamc+nkaCAS59ls2Mrk2EAkVY0MW5jYQDMaXLQzUNBAWRSNDFuTYBCRVjRM1JdBAMxpctjFuTQAMxoy3DNSNCgjMU5+Pu4ufZ9Gz5e3H06vX0iQzxm8br5XZx9nPs6c6z0a7ZQCazoyK3jWS2UAms6IDWN4LZQEms6MhdZ1my2USwm8bMg1nWSgAms6Mg1nWS2USwm8bMg1nWDSWksJvGzPl65MZ1hNA3KXG4ANZ1ktlECaxswUufTzIEAdHl6rkGsbwaSgg1jcZBrG8FsolhNZ0ZBrOslABNZ0ZBrG8FsolhNZ0ZEus6ylAlizeNmSGs6yUCWE3jRIGs6yUQlhNZ0c/B6cPHt7vobx04Xn+N/O9mP9mGLOpF+b3cHbz59El6degVKZsGmRrK1oAGahpkaypoIBmwumSWKUUBnUhtgaypoAGahpkWKUJUpjUi7YGsqTMie6KzqRdXA88emDQRrNJrOl2yLnWjL0JhvJiosTJrzo0EGjWpF2wNZDO/LSeojGpF2wNZU0RLAzUXTIsUoAMakNsDWVKADNSXTJLBdBAMakXTIsUoAMakjTKrCNEBCcPn26c/Dw7OHXfrfhPjfU7NXx/6p6MaELB8rt4+3n2dA6dYCwUEFWwUAAEKVKAAgEBQABQEUUAAAEBQgACwRS0Jjy9/E3vx9gKgXXj64kwBZa1rz2WairCUgBSnnm5WyxAHr5+xLBAuvL08ZHr5+pQAZUoIAACwFAAABlQAAEAQFAACiEBQAAIEBRCObF6cXp3as5Xw9+HR+G+X+50Z39Mxuw38X5v5vg6f6gl7+cE+V3cPbz7OkdOsABYCDQpZQACJSgqUABIhdBAAAqWC2CpQACAoAAAQhaEY3Dx9fLR6iolW2JJndPB7eVT08/Q1mxbRECyiUPPOsLWtpjWkBQESrPLUk36QWAAQtCAoAEBQACFgIFAEAARC6CAogBCGgAIAERGo+fhd79fXGk/me7H7f5P639Hs4+fs+bybfpfkvH8zxdXT+fjs7P7wOnxpGj5fbx9vPn61OjDYsAkmiNDOmTYqpTMaM3QzUNAWCRoy2MW5NhAJFWNEzUNCqgkaMtjFuTYAJFI0M1DQTyz6+R6PP2XLYxbk2LGdSPHWdrppWVybCAZKvln0xGt50aFgGY1LlvzPLefQ9AgEirGhmoaABmNGWxi3JtABIqxpJmouggGY0uWxi3JuABIpJsYtybgATLUZxOfVl59+pWubh/l23D3/AGn1fsGZPz3Ps9ficfzfL7fm8B6nWGV/u42eJNZ0fL7eLs58+nOs9Gu2USypvGzINZ1ktlAqazoiU1nWC2UAms6IlNY3gtlBBrG0yF1nWUoAqazoyF1nWUtlBBrGzINZ1koHj7eZ59HN6m555PbzBd6PPWh4evno2lNY3gtlEsJvFPLNh7Z9Ieb1h56eZ675fU343JvalABNZ0ZBrOsGkolhNZ0SC6zrKUARNZ0ZC6zrCaSqlhN42ZIazrJQJYTeNmZYazrJQJZE5/Lp58/PoN2OvyXxuXZj83+r9GpXj5fmOHd6/neT4HN39Xf876PVn8Yb9ii/3cbPDzYPm93B28+fRJejDQSpTGpLdsE1JotgoM2DTI1lTQoDNg0yNZU0AExqRdsDUlNBAM1F0yssUtgqUxqQ2wNZU0ADmusl20AaAB4T08zXp4U98zRoAwZwybZp7xSgA8se+DCD2SmgAY1IbYGsqaIWBmoumSWLFABmyLtgaypoIC41IaZFgaABjUkaZVYRo8o3w67dGfnt8vow7/5Ry/0jKfJ/ZGN38zm/O+X0+35Hm5Mu8O3Z0fS+d9HRh8Wm/Yof3YbPDA+V28fbz5+9jowoQCpTKqoAFgqUgLYqpQACAoFgqUAyooQAACAooAACFKgoAJQyorPmezxHs8RvEBBvXmPeYhcABNZHQ8R7PEezx2bBmaFAAAQRQAAABBFAAABlS0AhYAEBQACAEBTk13efT110fgejH7P4Dv8A6lZydl59eXt+e8vy3jdnZ+P83d2h0ZCnR9H5/wBDRh8cb9gp/dLGzw6D5fbw9vPn0DowWChACDQoAAAg0KAqCgiDQAAFgINABAAIQ0AAAKjFNs6AAKgIJj1Hm9KeT1Hk9KeL0GHpTyeo8nqPJ6jxegw9R5T0p5X1hUBBqMmkFAIGdFAEAAQhoAAALEGoAAAEQaAQAASY59OV6dB58n8p3Yd33Psfo6HyubP3/P8Aj+I8jv7PiHq9QbKUop0fR+d9HRr+MXfsFP7mNnhyKfM7OTt58/S3PRhsAEjRGhmobSoFZTRGhmobAFSLEaVmobABJNEaGahtKAZjRlsYtybCAZTS5Z0md5yewEuaszJds7sl84ezOgQjz9SGS6yNgIEmTbOhUJrMPRIWefqsY0lTzj2jFepmLhVmlSEXYQDMaXLYxbk2AQkUjQzUNAAzFI0M1I0KCM+Pn66M/Po02Y5/P/I/PbceP+q9vpDOPicO70/P8f4/z/Q9fA9feFKKUAdH0fn/AENGHxy79gp/cZZn4U3jdfL7OPs58+jOs9GFsoBNZ0RBvOsGrCWWE3jdZC6zrKWwWBN42ZBrOs1bKJYTeNmQazrJQWBNZ0RBvGslsolhNZ0eWrTGfXKaspMb8xqeh5tFmfXCNyjz9PMz652eL0LGvOz1Eec9IZt0ebVXWdZTzuhMevmN59Dzmy3y9fJNTdJ5+g89tHnPSKuslsolhN42ZQazrJbBYE1nRkGsbwWyiWE1nRkRrG8FszGuOdmjPHrnl34+/wDMPn/u88fj/vt4xt5+b43k9PR+M4flY94ensFJRVABQ6Po/P8AoaMPjl37AP6B+u/iP6vR5v8ARNcXX0cvzu3h7NWXRJejDaCgzZDbIsU0EAzqRdXBNZW3QQDNQ1cDUlNClgzqSNXA1la0ADNg0yLFNIKlMakNsDWVNBAMVF2wLFNBHn6DGpF2wTUlXQQDJF1cE1JV0EY2PL0kXbAk1TQQDGpF2wNZU0QqDNQ0yLA0ADGpDTI1lY1CgM2SNzIscuN9vLfRqyH47fh9T+a9P9UynL9PPnry9Pj+H57xezt/C+GOvtDsyFBVlAUAUXo+h8/6GjX8gu/YB50z5Pt/v/5N28uP9R7fz/3ceTrHZqClgqUzQoAKgoSA0gooACAoKgoAqA0gqUAAzQoAAAIUqCoKADKigBAAMqWhAAAMqWhAAAXKigAIKggKAAADKigAEKgiwoAggAknFry1071CeH8n3Y/U9PtfrrJZ87Rn7/C5/wAb43d3/mD1OsNtFBVAFBSUVQ6PofP+ho1/IG/YouC5cgq/b+t8Xg4sf6/1fy797ly/US9nOFAEGgAALAQaCAVBRUQaAABUBBoUABUBBoAAAEQaAAAAQWwVBUFQEGkFQVBUBBpBUFQWAQUAAAEQaAAABEGkAAAERGkAADx85py8+6M2vk/L/EbMPH+n93SGPz3Jt6fg8n4/zfQ9+M9XeGVUUoAKBVAUCjo7+D6GjX8em/aKYLlyir9fg7+HnnP38Lbl/Sv0P8Z/Z8fP+2c/R3cWY1lI0rNQ2lAMpojQzUNpUAkVY0TNS3YQDKaI0M1DaCpSSaI0M1DViqgkUjQzbk2ADKaI0M1k2ACSaI0M1DQAJFI0M1k2ACSaI0Mrk2ADMaMtDNSNoqwJFiNDNZNkKgkUjQyuTZk1wY79Gfj7PPbj6fzz5X6bZj8T+mazjd83P+b8/f0fmuH42n0A9HaAoqgAoFKKAKAp7/Q4O/Rr+QrftFMUy5lWX63B3/P0Y+N97tz5770+z+4/l3dx6/6nr8x97o4Oh4N2HTnyzXQ8Ke88R675tHq8B058snQ8Ke88Ye2+bR6vAdOfLKdF56e88Ye2+bVerwHTnyydDwHu8B7a5tHrfAdOPLJ0Xnp7vAe2ubR6vAdOfLJ0Xnp7zxh7a5tHs8B0Z8snReenvPGHtvl0ezwHTjyh73nte88Ye2+ax7PAdOPLJ0Xnp7zxh7a5tHtPEdGfLJ0Xnp7zxh7a5tHq8B058snQ8B7zxh7b5dHtPEdGfLJ0PAe7wHtrm0erwHTjz5Mb18k69eXs8fz27D6v8t6v6PlOX7nhnDLq+Hx/C83o6PyN8c+7ndF68+Z0jndFXmvQOd0U5r0DnvQXndFOd0DnvQOd0DwdBXf876WrD5Ct+wCFvOKv3PnS8+KmVVVlD0/UflGnH+n+v86/WOP7EXo00IFZ1Iu2CailABnUhpkakpoAGdSGmRrKmkoFZsGmBqKUAJnUi6ZGsqaQlQSyLtgagaCAZqLpgail+b9L5urJ9L5v0jNTbjpgailCAZsLpgakppCVBnUi6ZGsqUIC5qGmBqBoAkZ1IaY+dhep76Kx/MNmP678l+u/R15ek+fry7/znH+e4Or6v5zN6OoN1BVABQFWUBQBQAUUUn0vnTGcpd+0CFvOoqkqqSqsqig6+Vi/c/qP5F+h5+P9+4+zr4qjKUGaVQLBUoBAUACwVBKFCALBUEVVAAABAUAAAEBpBUFQVBFFQVBUFQRRUFQVBUEBQAAAQFAAABlRURYADy8vDXl5/S0q8Pzv5xtx1/QfpfQCfmNGfb+Y5vzPn9/vwnf0hlSlFABQVQFAoFJRRQUlAVQFCUaFFVQVVlFFVQUWU+j+0/nf0OXn/qDz9O3zAAKAKAAAqUAAAlgtgqUBAICgWCoKgCqAAACAoAAAICgAAAgKAAACAoAAAICoioLAAgKABwdnztefR1meL8T+1/j+c6P6p6oeXr5YX8h+f6vyPmenrJ6PQAoqygCgKopKCgKAooKALKoFAof/xAAuEAABAgUEAgICAgIDAQEAAAAAAQMCBCAhQRARFDAFExIjMUAiUBUyBkJgJDT/2gAIAQEAAQUC/rWmonYmGYWk8Yy4kWjkcLcHlfMuTkf/AB/xUcimjr0LUMDUTsX/AKFaVTdJ/wAdZ9iJpf76WlonRttIUlJH46z04zJMvzE552Z8V4tnx8Gjz+0TDPxi6FE6VE6VE6VE6VE6VE6VE6VE6VE6VEqm5FI0mpJYF/vJaTGmonIpaVRlL6eX8u1IQyknN+bmJOValGdInY3lZaRqEvXcuXL13Lly9dy5cvXcuXL13Lly9dy5cv1XruXLl67ly5eu5cuXqmGIXif8f/KOCKCL+4ghWOKWlUaJaWifVpqFmEU8x55IDxHg434oYUghI44YIdo5lYYUhTXNGaM0ZozRmjJNTCNJKzCOoZozRmjNGaM0ZozRmjNGaM0ZozRmKBIoZ6QRYZiXiZX9KZfSXT/IH+QP8gf5A/yB/kD/ACB/kD/IHPOec855zznnPOec855zznnPOec855zznnPOcc45xzjnHOOcMPxPRJshLykTicPY4g8zAw1H5WN6YlfHfw4hxB5qFpIJRYoeJfiHEOIcQ4l+IcQ4hxDiX4hwzhnEOJfiHEOIcQ4l+IcM4ZxDiX4hxDiHEOJfiHDOGcQ4l+ITLCtLLMK6vEOJfiHDOGcQ4l+IcQ4hxDiX4hwzhnEOJfiHEOIcQ4l+IcM4ZxDiX4hxDiHEOJfiHEOIcQ4hxDiHEOIcS/EOIcQ4hxL8U4hxDinEvxDiHEOIcS/FOKcU4pxL8Q4hxDiHEvxTinFOKcW/EOIOSX8ZiCJtOYcw5hzDmHMOYcsYd9ydHlBuBY19R6j1HqPUeo9R6j1HqPUeo9R6j1HqPUeo9R6j1HqPUeo9R6j1HqPUeo9R6j1EvJLGNt7EtLo2ey/sJufZlIJjmeamPGSLPj2/Zf5jkwMwpAfM9l/Yew9h7D2X+Z8z5nzPZf2HsPYew9l/mfM+Z8z2X9h7D2HsPZf5nzPmfM9l/Yew9h7D2X+YsSKiRIifM9l/Yew9h7D2X+Z8z5nzPZf2HsPYew9l/mfM+Z8z2X9h7D2HsPZf5nzPmfM9l/Yew9h7D2X+Z8z5nzPZf2HsPYew9l/mfM+Z8z2X9h7D2HsPZf5nzPmfM9l/mew9h8z2X+Z8z5nzPZf5nsPYPQwuJOyPyI2IoIvWes9Z6z1kUPxWR6fKDH9DKSQy1E7FLy8LKGfL+ZbkkkPHTPl35aXalWT8CxxPq03C3DpmjNGaM0ZozRmjNGaM0ZozRmjNGaM0ZozRmjNGaM0ZoWFIidkoY4ZmVjYWh0kenygx++3BE5FKysLJLS0Tw3BC3CLZPMeev4jwKxkNkI40bhSCOYVE2Si5cuXruXLl67ly5eu5cuXruXLl67ly5eu5cuXruXLl6763ruXLl67ly5eu5cuX1fl0jSckFgXVwkenygx+9LS8b8TDMLMMtJ76zD7cu15Dycx5V7w/hW5LRRx1GxtlVirUTpUTpUTpUTpUTpUTpUTpUTpUTpUTpUTpUSl1pHEn5D5LHBE3EOkj0+UGP3ZOSVwabJaVRvXyfkWfHtok756a8b49mQa0cdVVZaRv9ROpOpP01/UX+oWuKFIknZJIoZiXiZVwkunygx+2ibrJyPxGmonVYahah08z5uCUPG+KmPKOsMtsNCrsnyifIIIYIE6V606k6VE6VE6V606VE/dXqXpmZVI0m5VUWS6fJjH7TLUb0UpKQsJLyyuCIkMKESpDD5fzsTq+G8Dtq5HC3CkETyiidKidKidKidKidKidKidKidKidKidKidKidKidMTMLqPS/qjihWFa/JjH7MpKRzCstQtQy8rrNzDcqzOz815l/wAP4huR1dd+A21/IuXLl67ly5eu5cuXruXLl67ly5eu5cuXruXLl67ly5eu5cuXruXLl6763ruXLl67ly5eu40T1ydkrOtRNrV5MY/YkpBYhuDcYl0bMnlPKM+PgaZnfOzUhIsyTOSJxY1abRvTNGaM0ZozRmjNGaM0ZozRmjNGaM0ZozRmjNGaM0ZozRmjNGaMjZO6TUmkY/LLAtPkxj9aCFY4pKRRoaaVxWoIW0M+Z87DLni/DvT8bbUDLZFshvE+QpDChuZozRmjNGaM767maM767maM767maM767maM767maM0ZozRmjO9GaM0ZozvRmjNGRondMzDEDyTkosEVHkxj9WXYjfjlZWCXhYl1jEhREHIoW4PLebcmovDeBRrVyNG0+CuRba7GaM7UZoztrsZoztrsZoztrsZoztrsZoztrsZoztrsZoztrsZozrsZoztrsZozrsZoztrsZoztrsZGid0yRQwxU+TGf1JKSimBlqFuFiX2XScm2ZNmZmpzzkx4nxLUgmjjnxWBvZc0ZozRmjNGaM0ZozRmjNGaM0ZozRmjNGaM0ZozRmjNGaM0ZozRkbJ3TNXkxn9OR8cQQLErLPr18t5Vnx8MrKTfnJmTlWpNnRXInFgg9aXruXLl67ly5eu5cuXruXLl67ly+l96bly5eu5cuXruXLl67ly5eu5cuXruXLl67ly5eu5cuXruNE6X6PJjP6LcETkcjIwsDTSuDcCQQ6eZ88jJ4nwkczFBCkEJEqQp/J42RETpUTpUTpUTpUTpU3Ev0KJ0qJ0qJ0qJ0qJ0qJ0qJ0qJ0wE70+TGf0JWWjmI5WWgl4GWNz8IOuQNN+U8w9PueG8HBK6uRpAkMCxronUnSonUnUnTEIJ+4vUonUnUn6a9TZO9PkxnvkpGJ4abSFGGPjrPTrMiy47O+emvF+MZ8e3pG5dtvZdU/TUTqT9JRSH8ab1p0r1KJ0qJ1J1J+mvU2Tv46PJjPaibrJeP2G21jVppG008x5hqRSRkJrzD8rLtSrOixK4sECQJqonSonSonSonSonQopD+NItN9E0UTpUTpUTpUTpUTpUTpUTpUTpgJ3p8mM9jTcTscnJwsDDCuEEKQIKeY89seI8FE4qQ7JcWL4myuiJsmty5cvXcuXL13Lly9dy5cvXcuXL1KXLly+kWqaXLly9dy5cvXcuXL13Lly9dy5cvXcuXL13L9Ny5cvXcaJ0v0eSGeuVlY5iKXYgYgl5bV95thryPlJjyj3hvCtyerkaQkMCxRUZozRmjNGaM0ZozRmjNC6ppveje9GaM0ZozRmjNGaM0ZozRmjNGaM0ZoyNk9pmryQz1Scirg02MS6Qa+R8gxINf/b56a8b49mQb0jju238TO+u5mjNGaM767maM0ZozruZozWn4FS9CQ3ozRmjNGaM0ZozvruZozRmjO+u5mjNGaM70ZGie0zV5IZ6ERVWTkUgGWonVZahaTOx5jzLckeO8XMeVdYYbYayfJXCGFIUM7a7GaM67GaM7a7GaM7a7GaM7a7GaM7a7GV0RdM7ESEKGxmjO2uxmjO2uxmjO2uxmjO2uxmjO1GaM67GaM7a7GaM7a7GRontM7VeSGa2Wono5WVgYSXl1cIYUhQ/1PMedWNfD+B1jiSARInjbXNGaM0ZozRmjNGaM0ZozRlddzNGaM0ZozRmjNGaM0ZozRmjNGaM0ZozRkbJ7TNXkhmqVlYn1Zahahl5UQuTL7cq1PT815h/w/h2pFNHHEgIW1WK5cuXruXLl67ly5eu5cuXruXLl67ly5etdy5cuJWiqpcvXcuXL13Lly9dy5cvXcuXL13Lly9dy5cvXcuXL13GidL9HkhmmUkvkNNrEsvLo1op5LyTPj22253z014+RZkWtI3FVW20g1UTpUTpUTpUTpUTpUTpiQ2o3Nzc3PzonSonSonSonSonSonSonSonS2TvT5IZ1hhWJZSTRsYYieVpqFqHTzPnIJU8X4h7yDjTcDLYq7JvE+QQpBDQnUnSon6idSdWNqdjbsX9RepROpOpP02yd6fJDOjLMT0UtLwsJKyixkKJChFEkEPlvORzEXh/Ao0J+ByOFuFIInlqTqTpUTqTqTqTqSjbvXqX9RRP1E/TbJ3p8kMkrKxPDTaQpKyfx1nJpqTZmpub83M+J8S1IQqIOu/FW2v5VKJ0qJ0qJ0qJ0qJ0qJ0qJ0qJ0qJ0qJ0qJ0qJ0qJ0qJ0qJ0tk70+SJKVVBluJyKWl4WdfK+VZ8fBLy055yZkpRqSavpE5FHE03667ly5eu5cuXruXLl67ly5eu5cuXrvrub05uXLl6767m+u5ubm5cuXruXLl67ly5eu5cuXruXLl67ly5fqvXcaJ4vXBCscStpuwxE4rbULcOTzPnYWDxPhXJuNuCFuDKqkKbxTBBCkMJmjNGaM0ZozRmjNGaM0Zoyb6512F/MNGaMi6KhmjKWE1zRmjNGaM0ZozRmjNGaM0ZozRkbJ7TNDLMTsTDMLUMpLo8riJCg7HC3D5TzLs7H4bwcEvq45C0QtxOqmuddzNGaM0Z313M0ZozRnXczRnfXcyv4TXOu4glGaM6KIKl96MkGud6M0Z3ozRmjNGd9dzNGaM0Z3ozRnfXcyNE9pnWWllcGmyUk0gJEdJ6cZkWX35zzs14rxbMhBo678Vaa2ioztrsZozRmjO2uxmjO2uxmjO2uxmjO2uxlfwmuaMpRmjNGaMkGudtdjNGdtdjNGdtdjNGdtdjNGaM0Z212M0Z12MjRPaZ20lpQYZieil5aFjSRPK+SblUlJKa8zMScq1KN6ROROq03C2maM0ZozRmjNGaM0ZozRmjNGaM0ZhozRkXXNGSHXNGaM0ZozRmjNGaM0ZozRmjNGRsntM6NSLkTrTcLUOnk/JuSkHifDuKsEPwQiiSCH+UyQokKaX1vXcuXL13Lly9dy5cvXcuXL13Lly9a7ly5etN9b9F9L1ruQ7ly9dy5cvXcuXL13Lly9dy5cvXcuXL131vXcaJ4vU87Aw35Lyr/knZCSbWJzR52FpIGonIqVE6VE6VE6VE6VE6VE6F0ToQUTpiE6UE6VE6VE6VE6VE6VE6VE6Wydq8jPsyDUUU756a8Z45mQbkhwde/kyz8F/RTpUTqTqTqTpVKkFE0UT9PHSvUv6iidSfptk7T5jzLcknj/ABsz5Z6WYblmiS/DjivDTcLUP6SdKidSdSdSdK/jalBRP1ETRepf1U6VE6k/TbJ2nxv/AB/4vImyDkcLcMu37iLZE6FE6VE6VE6VE6VE6VE6VENqEF/CaL+iiaqJ0qJ0qJ0qJ0qJ0qJ0qJ0tk7W+8jRA1FFHIjpeu+ly9dy5cvXcuXL13Lly9dy5cvXcuXL13Lly+i6IL+E/NxNxdxNzOq6Lvvpczomty5cvXcuXL13Lly9dy5cvXcuXL13Lly9dy+l67jRPF6XXlWJllG1JEd0zRmjNGaM0ZozRmjNGaM0ZozRmjMWiCn/aj/tqpnRBT/tRmjNGaM0ZozRmjNGaM0ZozRmjNGRontM6K5FMK3BC1DkkR3TO9GaM767maM0ZozvruZozvruZozvruZozvruZoyq6IRLaH/ajOqifkwn4F/23E/JuZozvruZozvruZozvruZozvruZozvRmjO+u5mjOu5kaJ7TOmyaZJEd0zrsZoztrsZozRmjO2uxmjO2uxmjO2uxmjO2uxmjKpomxF+If8AYQ30zqpkVRPwL/tsJpsZoztrsZoztrsZoztRmjO2uxmjNGaM67GaM0ZGie0ztRkkR3TNGaM0ZozRmjNGaM0ZozRmjNGaMxUZhozRkXRVMkOuaM0ZozRmjNGaM0ZozRmjNGaM0ZGie0zTckR0vXfS5eu5cuXruXLl67ly5eu5cuXruXLl67ly5fSKlNy5cvXcXcuX1houXLl67ly5eu5cuXruXLl67ly5eu5cuXruXL9Fxoni/RJDnSonSonSonSonSonSonSomsVKCidMQlENKidKidKidKidKidKidKidLZO9MkOfqJ1J1J1J1J1JrFSnXFTDSvUvUv6iidSfptk70NuwOEkOfqJ1J1J1J1J1JrFSnXFTDSvUvUvWnSonUn6bZOjjsDdU/HGg3FFBFI/hzpUTpUTpUTpUTpUTpUTpUTWKlBROmISiGlROlROlROlROlROlROlROlsnvw5FFHFIRxrS5CkaMSyNRSI6Xrvreu5cuXruXLl67ly5eu5cuXruXLl67ly5fSKlNbiVXF0vrDRcuXL13Lly9dy5cvXcuXL13Lly9dy5cvXcvpeu40Tw/LI7E3CkCUZJEd0zRmjNGaM0ZozRmjNGaM0ZozRmjMVGYdVM0ZF1yQ65ozRmjNGaM0ZozRmjNGaM0ZozRkaJ7TOu5kkR3TO9GaM767maM0ZozvruZozvruZozvruZozvruZozEuu5lKM76b6ZozuQ6bmaM767maM767maM70ZozvruZozRmjO+u5mjO+u5kaJ7TOuxkkR3TO2uxmjO2uxmjNGaM7a7GaM7UZoztrsZoztrsZozEmuxk3N99M0b3ozsQ6bGaM7a7GaM7a7GaM67GaM7a7GaM0ZoztrsZozrsZGie0ztRkkRzTNGaM0ZozRmjNGaM0ZozRmjNGaMxUZRddzOqm16Mia5ozRmjNGaM0ZozRmjNGaM0ZozRkbJ7TNNyRHS9d9b13Lly9dy5cvXcuXL13Lly9dy5cvUpuIul9IqbiKumy1KXL6X1Sn5G5eu5cuXruXLl67ly5eu5cuXruXLl6763ruNE8X6JIc6VE6VE6VE6VE6VE6VErXRRDc3IqlE6YhKE031Uh6VE6VE6VE6VE6VE6VE6Wyd6ZIc/UTqTpUTqTqToXROhBRBBdFE1QipRak/HQvUvWnSvWn6bZO9MkOfqJ+monUnUnQuidCC9UXUnUvUvUonUnUn6bZO9MkOdKidKidKidKidKidKidKidO4nSonUnSonSonSonSonSonSonS2TtDz/AMYtbkkOl67l9L13Lly9dy5cvXcuXL13Lly9dy5cvXcVFLl6UFLly5uvRcuLvWm+99L13Lly9dy5cvXcuXL13Lly9dy5cvXfS5eu40TpfSN2J2JlqFqHTJIjmmaM0ZozRmjNGaM0ZozRmjNGaMoLrnRDcVf5Jqon5ozogtzNGYUozRmjNGaM0ZozRmjNGaM0ZozRkbJ4iVETeKaWCFIIdNzJIjumd9dzNGddzNGd9dzNGddzNGd9dzNGd9dzNGd9dzOkSbaZ3o/Cia5ozQv5313ET+VGddzNGd9dzNGd9dzNGd6M0Z313M0Z3ozRnfXcyNE/ZIW4n1zuPTDTGuSRHdM67GaM0ZoztRmjNGaM7a7GaM0ZozRnSK+mddj8rRvfajNCreiD80ZozRmjNGdtdjNGaM0Z12M0ZozRnajIr3rH4FRTPlfJsyEEtLTfm5nTJIjmmaM0ZozRmjNGaM0ZozRmjNGVUTXOq2M0ZSja+uxtfVVM0ZozlF1zRmjNGaM0ZozRmjNGaM0ZozG9FFFLNpAT2nmfNwyx4rw7k7G3BC3Brckh0vXcuXL13Lly9dy5cvXcuXL13Lly9dy5cvouia3LlxUWvZdUruXFL0ppcuXohouXLl67ly5czTcuXL13Lly9dy5cvXcuXL0quyLFFMLA2kELRPrsnlvNRzEXhfBI1XJEfSonSonSonSonSonSomsWkNCidK9S1pqomkWiUqJ0qJ0qJ0qJ0qJ0qJS5HC3CkET6/jR6YalWW/IueTf8R4lqQh0dn4IXaJIc6k/eTpUTqTsiqTriqToSpepROlf6N11GxtpVi08n5JmQbVia81NQyTMiyRRJDDNziukw/C0lEkOdSfqJ1J0qJ3RaJXsbUJ1xUbG1SEWkNS9SidSfurQ46vyaaSDXzPmoJQ8Z4p/yTss3C01O/h52FmGZmIn4pmaSAVVVaJIc6VE6VE6VE6VE6VE6VEoXRNVEqXRBROmIQQ2rUQXoUTpUTpUTpUTpUTpUTRY4nlbghbhFXZPMedWNfDeC0gJ6NB1xY1mpv5VXJIdL13Lly9d9b13Lly9dy5cvXcuXL13Lly9C636F0TfrXfSHczVcUuQ/mm5cuXruXLl67ly5eu5cuXrvreu5cji+KbRTBDbSYebl2vIeSmPLPeH8M3JIXHpr1m5MzMT1WSSHNM0ZozRmjNGaM0ZozRmjNGaM6Loi3ozqpmGjNGRdEQzRnRdIac0ZozRmjNGaM0ZozRmjI64jaQNrGpnyM+zINf/AGeem/G+PZkGiJdiZmvkTD8LMMo7E7FVkkh3TO+u5mjO+u5mjOu5mjO+u5mjNGaM767maM76qJZdFsfIVb/KjKUZoyLon4vubnyPkJ+dFEM767maM767maM0ZozvruZozvruZozvruZcd2VprbXzHl25IkPHzHln5dlqWaHXIW4Zh+J1ZqbRomFWKLx1eSSHdM7UZozrsZozRmjO2uxmjNGaM67GaM7axIZRT5a7XSHXY/7CLrmjKm+iGdjZD4mxnc+WkJnbXYzRmjNGaM0Z212M0ZozRnahY4nIm20gQVTzPnfieI8JE5FDCkKD70LSOuK4s3O6PHjq8kkOaZozRmjNGaM0ZozRmjNGaM0ZoX86ImmaIv8AbRNM0L+d6M0Kl9fwZozRmjNGaM0ZozRmjNGdFVIU/k+JCiaPOQMt+T8s95Fzw/hYJQyTMykA65sk3Nq9q8eO6LkkOl67ly5eu5cuXrvpcvXcuXL13Lly9dy5cvVF+dlELl6oi+l0EpVTNy5cvWqblxNy9dy5cvXcuXL13Lly9dy+l67ly5fVyNIESBXF0n5xqSZddnPOzXjPGtePbvpMzW5MPQMwzD8b8Wrx47pkyPpUTpUTpUTpUTpUTpUTpUStdFE0TVVoUh6VETpUTpUTpUTpUTpUTVxz4jbd9PL+WakIZSTmvNTMrKtSjKEUSQJMPq4Tc3CwORxORUPHjumSHOpOpP1E/UTpUQXsRRVqSpF1X9RetP011ijWJW4Eg18z51GTxHhY5mKCGGCFRx2FuF1yJxZye+It1pePHdMmOdSdSfqJ+mv4T8dKCmxsbGxsbGxsIhsbGxsbGxsbGwiGxsbGxsbaqJ+monSv6in4TdXSFEhQjjhbg8t5lycj8N4OGX1ffSAcjJ2eV3oePHdMmR9KidKidKidKidKidKkJmtROlROlRNVqUTTKiULonSonSonSonS5EkKIiuazk2zJszU1N+bmfE+KakINH5gfegZgm5qOYi6Hjx3Rckh0vXcuXL13Lly9dy+l6763ruXLl67633quXLl6s3Ll+i5cuX0Wm5cuXMqJ+NYtyHcuXruXLl67l9L13Lly9ccfxIW13LnlfKNePgl5ab85MyUmzJMiqiI++sZOTcEujzsb0fS8eOrySQ5pmjNGaM0ZozRmjNGaM0ZozohEJeLVBTc3E0SK6LRvdBVNyIT80ZNxF0zEbiCqf8AY3EUiN/5L+NM7/yX8J+E0zRmjNGaM0ZozRHGvybg+OvmvNwy54rw7k643BC3ARxpAjriuLPT6NkSrEvU8eOrySQ7pnfXczRnfXczRnfXczRnfXczRnfXczRnfXcyq7CXNtj8md9FURTOMfhEE/2TVYhPzvqum+iqKp+BPxCJplVN0EUVRFuq2hM/kVP5Kum5uJ/sqmPwQmd9dzNGd9dzNGd9dzNGd9NxY1dWCFINFVIYfL+aifi8N4JGzO466kA5HuT3kFj7XTx1eSSHdM0ZozRmjNGaM0ZozRmjOuxkSwpsL+dtNjYT86LpnbVUvnXYzpsh8T8qJbXPxPihsbIJtvsJbVV/l8TY+KHxE/O2ltM7UZozRmjNGaMkSwwp8VeNjM1MNSrM5PTXmH/E+JakYTLz2w87C1BOzkcyva6ePpkfI7kEcMcOSSHNM0ZozRmjNGaM0ZozRmjNGaM0L+dVE/Oq/nNGaM0Z12Nr6qImy0ZozRmjNGaM0Zoy44kBC2sS6eU8izIQNtznnpqQkWZFkiXZHnvkTUzBLQTD8cxH3Onj6YIlgikJ9UiYfheLkkOl67ly5eu5cuXruXLl67ly5eu+t67ly5eu5cuXruXLl67ly5eu5cuXruXLl6763ruXLl67ly5cjcX5Nt/HXzPmoJM8b4t/ybrLULLdxyP4I66rizs9CwRxxORd7p4+uUnFgWVnEjSTI+lROlROlROlROlROlROlROlROlROlROlROlROlROldFjidVuBG0FXZPMedWJfDeC1fdRsjjWNZ3yH6Tp4/ol5iJlZWY9YsSRQ9KdSf+GT+xiVIYf5PiIiIPvNy7XkfJTHlXvD+Gbkk0mJj4DjiQpOzsT36bp4/pnI4oIpGd+SsvQuJ0J1J+on/onHEbRG4nBNPIz7Mg0qznnpvxvj2ZBrSYmdyYfgYgmZiOYi/TdPH9PkBkk55YFl5lI0qUTpUTpUTpUTpUTpUTpUTpUTpUTpUTpUTpUTpUSt134q01sqiHmPMNyKSHj5ny78uw3LNEcSQQvzCuk3NwsI45E7H+o6eP6fIDWktMxsLJTsMcMKpEmt9b13Lly9dy5cvXcuXL13Lly9dy+l+q9d9b131vXfW9dy+l67ly5eu5cuXpidWOJttGy+nmfO/E8R4SJ2KFNtHnoWkddidinJ74i3X9V08f0z41q3HE3FIeQ+atuJHpmjNGaM0ZozRmjNGaM0ZozRmjNGaM0ZozRmjNGaM0ZozRmjIqoibxTBBCkEOXI4GW/KeWe8g54bwsEppmZmUbHHCcnVc/YdPH9M+NUyc+sAxMpEmaM767maM767maM767maM767maM767maM767maM767maM767maM767maM767maM767maM767maMuOQtwpBE8puTs2zJNPPTnnZrxfjGZBvSamrvOwtQzMzE+v7DpIdM+NxIi/WfWfWfWfWS8wjBKTvyhhiiiT+Z/M+w+zf7D+Z/M+w+zf7D7D7D7D7N/sP5n8z7D7N/sPsPsPsPs3+w/mfzPsPs3+w+w+w+w+zf7D7D7D7D7N/sPsPsPsPs3+w+w+w+w+zf7D7D7D7D7N9nD7D7D7D7N/sPsPsPsPs3+w+w+w+w+zf7D7D7D7D7N/sPsPsPsPs3+w+w+w+w+zf7D7D7D7D7N/sPsPsPsPs3+w+w+w2cPs3+w+w+w+w+zf7D7D7D7D7N/sPsPsPsPs3+w+w+w+w+zf7D7D7D7B12OCKBmP5/wAz+Z5TykEgS8o55p+UlklGfsI4ooYX5qJwmJmBkdcgdi+o+o+o+o+o+o+o+o+o+o+o+o+o+o+o+o+o+o+o+o+o+o+o+o+ocVIlkOmbajjOO6cd047px3TjunHdOO6QNPwRSkw4hBMtxJ72j3tnvb397R72j3tHvaPe3vyGj3tHvaOQ0e9vf3tHvaPe0e9o97e/IaPe0e9o5DR729+Q0cho5DRyGj3tb8ho97R72jkNHva35DRyGjkNHIaPe1vyGj3tHvaOQ0e9rfkNHIaOQ0cho97W/IaOQ0cho5DR72t+Q0cho5DRyGj3tb8ho5DRyGjkNHva35DRyGjkNHIaPe1vyGjkNHIaOQ0e9rfkNE1NbpKzWycho97W/IaOQ0cho5DR72t+Q0cho5DRyGj3tb8ho5DRyGjkNHva35DRyGjkNHIaPe1vyGjkNHIaOQ0e9rfkNHIaOQ0cho97W/IaPe0e9o5DR72t+Q0cho5DRyGj3tb8ho97R72h6aQZiZbOQ0cho8t5F6CHxni/e7C4zAnIaIplpIX3o3opmN2FFl31XivHFeOK8cV44rxxXjjPHGeOM8cZ44zxxnjjPHGeOM8cZ44zxxnjjPHGeOM8cZ44zxxnjjPHGeOM6SbUcHTyHTkOnIdOQ6ch05DpyHT3unvdPe6S82qEu41EnobPQ2eho9DR6Gj0NHobPQ2ehs9DZ6Gz0NnoaPQ0eho9DRx2zjtnobPQ2cds47Z6Gj0NHoaPQ0cds47Z6Gz0NnHbOO2cdo47Rx2jjtHHbOO2ehs9DZx2zjtnHaOO0cdo47Rx2zjtnobPQ2cds47Zx2jjtHHaOO0cds47Z6Gz0NnHbOO2cdo47Rx2jjtHHbOO2ehs9DZx2zjtnHaJqV2SVld047Rx2zjtnobPQ2cds47Zx2jjtHHaOO0cds47Z6Gz0NnHbOO2cdo47Rx2jjtHHbOO2ehs9DZx2zjtnHaOO0cdo47Rx2zjtnobPQ2cds47Zx2jjtHHaOO0cds47Z6Wj4I+qS7aJx2yNpiCDyXlPe74nxzrcHoaOO2TKsskUZMz0SrynjlPHKeOU8cp45TxyXjkvHJeOS8cl45LxyXjkvHJeOS8cl45LxyXjkvHJeOS8cl45LxyXjkvHIeOQ8ch05Dv6jL0TRJz1oIkjhqUTpUTpUTpUTpUTpUTpUTpUTpUTpUTpUTocjhbh+McwQpshNzTUozNTc35uZ8T4pqQg0m5z4jriQpMzMTy/wBnDEsKyc4sKy8xC8n6CfqJ/wCFXoeeRobZWKLTynk2ZBthic85NSUozJMiqiJNzixj70LMLzsTsX9sxMLCspPJHUn9Qn9iv6Lr6/JllG9fMebhlU8X4h2fcabhagHI0bgmZmJ9ZmZRsiiWJf7iWG/9KE/qE/H9gv6EX+vjv/zaxQQL/wAn1cu29Zr+n//EACcRAAEDAwQDAQADAQEAAAAAAAABAhEDEjIQICIxIUFgMEBQUQRx/9oACAEDAQE/Af4znwVas+E2R7UVZ/tKdb07+e+pA+qrutmJP8FEkVI/pGVVaNcjuvyREghCEIQhCEIQhCEIQtQtQtaWtLWlrS1pDUHvRBXuUvcXOEVyiuX0XOLnFzi5xc4ucXOLnFzi5xc4ucXOLnFzi5xc4ucI9yCvcpc4ucXOLnFzi5xc4ucXOLnFzi5xc4ucXOLnFzi5xc4ucXOLnFzi5xc4ucXOLnFzi5xc4ucXOLnFzi5wj3FN7XEIWoWoK1I2p1/AV0FWtAqz3pAiCr6T+8pV/ThPOjsdqdfu58FStPhNkR2Ks/31OsrBlRH9Dsdqdfs+qiFSor9mPwLXK3yg2sjkjanX6KsFWtA5yu8qToiSTHhPg25FL/ojw4RUXrVOvzV0FWvHRM6ontRV+EblpTqqzVOvyc+CpWnwmnekR2Ks/Cty2p1+NSqiIVKiv1RJMfh25bU63qsFWtaOcrvK6okir6T4huW1vW5XQVa/pNiJ7UVZ+JbltbjtfUgqVrvCad6Rb2Ks/FNy2tx16KlVEHvV+qJJNvXxjctrcdFWCrWgVVd5UnREkVfSfGty2txHPgqV/wDNiJ7UVZ+ObltV8NKlW7rZj2Ks/Hty1VYKtaB6qrtUSSY6+RblrUrirPY7LREkVfSfJNy2uyIjyoqz8m3La6EX5VuWqJJMdDsvlW5aqujsvlW5bXZfKty2uy+VblsbTlJHZfKtyHU4SdblRIHZfKtyLlXxsdl8q3La7L5VuW12XyrctrsvlW5aIk6uy+VbkIkir6TV2XyrU8yKs7HZfKRb2Jltdl8kiSTb1o3LSnQnvV2XyKJIq+k1bkUqMDWxq7L5BE9qKs6tYrhtOEESNjsvj4jsVZ1p0rhlOB2O12XxqJJj/wC6d6U6M+VGsjR2O12XxiJJMeE1RJ8IUqMDWxq7Ha7L4tG+1FXVrVd0UqMCJGx2O12XxUR5UVZ1p01eU6aJudjtdl8T4aKd6U6M+VGsje7HV9KehUjsdl8OiSTHWnYiFKj/AKNbH4Ox2Ppo4e1UX4ZEkVfSatarvCFKjAiR+LsdsShUo2+U+ERPairOrKavKdKPzdjtTrSrQnygqR4X4HHsVdadK7yoynH6Ox2t61qUkePpq3sgggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggRJOutIkgp0f9GtjWSSSSSSSSSR+O1EVDkcjkOarux9C04nE4nE4nE4nE4nE4nE4nE4nE4nE4nE4nE4nE4nE4nE4nE4nE4nE4nEZbI+2TicTicTicTicTicTicTicTicTicTicTiIjVJb0cTiIiL4Qp0Y6EaqHI5HI5HI5HI5nM5nM5nMVHL4/Lsrf8/toqR3/contRVnSBrFcUqUCJH8utSa5J/uETxIqyLohTYn8T//xAAyEQAABAMHAwMEAgIDAAAAAAAAAQIDERITBCEjMTNgYRAgUSIwQTJAkdFQsQVxQqHx/9oACAECAQE/AftnrSSPSnMMWdRnUc6ZdDWZnBASkk/yhoUze3l4DbqXCin73IOWhThyNCz2Um71ZiAyBn8mL3MsgREVxfYrWSCiYQsllEv4RxiJzouMNvxORdyvaaaQaJjFJoUmhSaFJoUmhSaFJoUmhTaFNoU2hTaFNsU2hTbFNsKSygomCI31ei4giztJIEy0KTPgKQynMJZQd6hSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmg5Z21FAg3Z20lAxSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmhSaFJoUmgphoxAmTg5eXn9iRo8hTaFNsONoJES7WtL7B+0JZK/MNsOWo53MglBIKCRDyIhS4XFmEoh6lZ/zZlG4wpldn9TN5eP0GnkulFPRzT7WtL37RbJfQ3eYs9ivqPZ9MuhrNdyPyEoJGX889ZpjqN3KDb8TkcKCg5p9rWl7pmRFEw5aVvqpsizWNLN55iAyBmRFExe7wX9gihcWwHWUulBQWa20yrvLz+wV/Y1pe468loplAqtuV4SGWEMplSICIWskZgkGo5nPxsN3SBtKZvby8BDhLKJdWtL27Ta0sXfIYsjlpOq/kEpJJQIQEQty+VN5hDct53nsR3S6OMxOZNx9WtL2rTbr6bN5iyf4+XEevPpl0nNy5vLz+ghBIKBbFd0u1rS9hSiQUyg7aHLYqkzkLLYkWcuRARClEkomIKe+q5Iy2M7pdrel3vPoZKKglD1vVE7khllDKZUCAiHHCR/sJbMzmc/8ANkO6Xa3p91ptiWbivMMWJb51XwRERQIZdFuXyIz/AKDbcl+Z7Jd0u1vT7X7Yajpsiy2Em/W5efTLpMbtyMvP6/YSgkFBOyndLtb0uq1kgoqCnHLWqRvIWezIYK7MEQj4ClEgomJTd+vLx+/1sx3S7W9Po8+lorwhpy2HMu5IbbS2UqRARC3CTd8hLZxmXns13S7W9MP2om/SnMMWM1nUe6ZdFOGZyozCGyR/vZzul2m+pRU0Cz2QmvUrPpl0ibv03EEpJJQLZ7ul1WskFEwZuWo4JyDDZJaiQIhHwFKJJRMSG5evLx+9ou6XVLC31TOZBKSSUCDJYIMwtcLizCUXzKz2k7pdmQa0gazUcqAlBJ2m7pdYwyBnC8w3MpvgEREUC2o7pdVKJOYJJqvWGtLarul1SiF559GtLarul2taW1XdLta0tqu6XY7a5FywDWkW1XtIw1a51yw6m2lRzGGtLarukCbSk5i7GtLarul2taW1XdLta0tqu6Xa1pbVd0uilEm8+rWltV3SCly3fISj/krPq1pbVdXFuUglBJBF1a0tqRNz6cg4REzAhCGYM49WtLaSlEkomJTc+rLx++jtzIM/IctRqVK11a0torcJP+wlBmcy8wRREYZB44NBTi7Ucqcg00lorurWltBTl8qMwhuW/wCQRAzDz6WSiYOo961ZBKSQUC7GtLZ85uXIy8/oIQSCgQh5BnEWm1k16SzDVmU4dR4OaXa1pbNUoklExA3s7k/2CL4IZAzFotpmdNnMWeySepefRzT7WtLZi3CRmEtmo5nPx0yC1kkplB20OWtVNrIMWZLJXZ9XNPta0tlrdgcqbzCG5fUd5giEfAefQymZQxbcqJ3JDbSWilT2Oafa1pbKNZrOVv8AIQgkFAhDyDMWq2ps5QzMM2ZdpVVfBESSgXa5p9rWlsgzheYve4T/AGCIiKBDIGcRa/8AIS4bN5iy2GB1Hrz73NPr62OUhKiUUUhrS2OtZIKJgkGu9z8dMgpREUTD9rXaVUmMhZbGlgo/PsOafYpo0HO1+Aw6lSJfnYy3JbizCG75lZgiiI+A66lpMygpTtuVArkhlhDKYJ9lzT7aJLbI/kItBoOR787EUszOVAQgkAi8gzFotSWCvzCGXLWqo7kEpJBQT7Tmn2t6QWgllKoRcsvKP+yCFpcKZOwYm79OQSkklAhCGYM4i02wm/SjMMWQ1HUe9xzT7WtMTCYKZU2c7H4+A1aUuXfImEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmEwmCnCSUTF6/qK4R4E0Aa/kw/a1OYbIs9mJq88xMJhMIiImERMJhMJhEO6falLiSgUBi8DF4GLwHGFuX/IruJVIv8jF4GLwMXgYvAxeBi8DF4GLwMXgYvAxeBi8DF4GLwMXgYvAxeBi8DF4GLwMXgYvAxeBi8DF4GLwMXgY3AxuBjcDG4GNwMbgY3AxuBjcB+tIGK0gxuBjcDG4GNwMbgY3AxuBjcDG4GNwMXgYvAxeBi8DF4GLwMXgYvAxeBi8DF4Clup8CR2MxwBE8fgRdLwFrcQUVQBuOWr0lkGmVNF6YDF4GLwMXgYvAxeBi8DF4GLwMXgYvAxeBi8DF4CkuKKBw9pSSWUFAjXZ+U/0EqJRRL+ZUu+VOYSiUEQMw68loomCSu1HMrIJSSCgX3bhUcRAL+XWZxJJfISkklAgkgZxCsgwiso1L+0//xAA8EAABAgIHBQUHBAMAAwEBAAABAAIDMhESITEzUXIQQUJxkQQiMHCxExQgQFJhgVBgodEFksEjYoLh8f/aAAgBAQAGPwL9NoarL817SVnrtL4jg1ovJXu3YA6obKRM9GLGefaPFFQXDaK1+4DehE7RulZl+5yFTMz+Qs25/r9JsYg2GFXjWn6dvtI7qMhvK9nCbRDHDuH3Ks78Y3vO32cIV4noq8Q1ouf7qJhgac0Swc2/rtaL/qqsMKm9+e2qO/H3My5r20dxEP6z6BCHAbVb67akC7e9UN/Jz/dmTs1k/PcVQ4UH9ZoaKSqzrX+iybmqGDaYPYjS+4xMuS94/wAhWqm2ob3c0GtADRcBsrONAXepbCy3uVA/RKBOqDP+yaHClXUtz3hW2tz+ThAQmGlqwIawIawIawIawIawIawIawIawIawIawIawIawIawIawYawYawYawYawYawYawYawYawYawYawYawWLBYsFiwWLBYsFiwWLBYsFiwWKhsBlGasaFS/uhYjliOTokWOWsF5K9l2SE6KDYK29NMcMbEvoYLliuWK5Yry43NC/8AI805LFcsV6xHLEcsV6xXLFcsVyxXLFcsVyxXrFcsVyxXrFcsVyxXLFcsVyxXLFesVyxXLFesVyxXLFcsVyxXLFcsV6xXLFcsV6xXLFcqaazc1TTVbmsVyxXLFesVyxXLFesVyxXLFcsVyxXLFcsV6xXLFcsV6xXLFcsVyxXLFcsVyxXrFcsVyxXrFcsVyxXLFcsVyxXLFesRyxHLFesVyxXLFcsVyxXLFcsV6xHLEcsV6xXLFcsVyxXLFcsRyxXrEcsRyxXLEcsVyxXLFcsVyxHLFcsRyxHLFcsRyxXLFcsVyxXLEcsRyxHLumn7FUshNdReKLVhMWExYTFhMWExYTFhMWExPpY0UDwYGhUCjO1YkPqsSH1WJD6rEh9ViQ+qxIfVYkPqsSH1WJD6qeH1WJD6qeH1U8Pqp4fVTw+qnh9VPD6qeH1U8Pqp4fVTs6qdnVTs6qdnVTs6qdnVTs6qdnVTs6qdnVTs6qdnVTs6qlxFT7IMhj8BVntcXclI/opH9FTGsO4Heu65vs28LTY1UMY90QzPItKkf0UjuiqQmEv9FWc17ohvdQpHdFI/opH9FK7opXdFI/opH9FI/opHdFI7opH9FI/opH9FK/opX9FI/opH9FI/opHdFI7opH9FI/opH9FK/opX9FI/opH9FI/opHdFI7opH9FI/opH9FK/opX9FI/opH9FI/oqDDdRyVAhuo5KR/RSP6KR/RSv6KV/RSP6KR/RSP6KR3RSO6KR/RSP6KR/RSv6KV3RSP6KR/RSP6KR3RSO6KR/RSP6KR/RSv6KV/RSP6KR/RSP6KR3RSO6KR/RSP6KR/RSu6KV3RSP6KR/RSO6KR3RSO6KR3RSP6KR/RSu6KV3RSP6KR/RSO6KR3RSO6KR3RSO6KR/RSu6KV3RSP6KV3RSO6KR3RSO6KR3RSu6KV/RSu6KV3RSv6KV3RSO6KR3RSO6KR3RSu6KV3RSu6KV3RSOpzoVIFV/qqHloKnZ1U7OqnZ1U7OqnZ12RdPgwNCiaD+g1o3+qoYFZa7PaYcOh/aMtzea947U5whHjO/khDgNDWDZaqsHus3v/pUMH72odarRS3PeFba3P4WaVF0+DA0KJoPz9VgpKpNr81SbGZqq0UDZajB7AfsYn9IR+38xDO/mqAAAN2ys8hUxO7D+nNUD98mgfhF0IWfT8DdKi6fBgaFE0n56yxu8qhgVaL02mJGcGsG9e79ka4Qzwi93NCJGoido/hvLb9TzcAq8a124bh+/PvmqR3X57iqrxQdjdKiafBgaFE0n52tEsZ6oMht/AVZ1r/TbTENLzKwXlZQx/qxVYQ7xmebztqQbXbzuCpveb3H9/UFWilue8K21uabpUTT4MDQomk/N0C9B8a130ru3Zru357TC7PQ+P/DV7z2xzhDO83u5IQ4LQ1g3DZSVQzuw/qzVDRQPIE1R+FSwXWUKJp8GBoUTSfmqrBSs35ql1jVVaNhLiABvK9h/j6aDZXF55IRu3ik3iH/e2lypi2M3M8hHfVTenWUEi/NUOFvgQNKfpPzNNzM1UhhUxOm0xY7w1oXsOztIh7mD1Krvoido+rLltqjvPO5V4prP9PIV2pQ6c1dS30X2z+OBpT9J+YD49jfpQawKk2u297vRTcwKu80QxxcLeSqQG83bztqQb97slmTefIZ2pQ9WwmGLfpRoH4+KBpT9J+WDWiklV4tr/RfbNUN2mD2Sh8be7c1e89uLhDNtsz0GQmhrW3AbKSaFZ3YfqqG2DyHdzUPnttsdmrbDnn8MDSn6T8rVYOZyXdtdvcqX2NVAGwvcQ1otJK937BWDTZSL3IRu2gOiboe4bbVWi3bm+RLuah8/g7wB+GDpT9J+UrO7sPPNBkNtAVL78tvtI7qB/JXsoDSIQ4dw+5VM8fe/+ttVgrPyVZ/ef5FO1KHq8GDpT9J+TD+0Dk1VWhZnPbRPGNzP7Xto7iIX1f8AAhDgNob67asL8uVl/kW7UofPwYOlP0n5ENYKSVWf3onovsrNpg9iIdE3v3Be8/5CtVNtU3u5oNYAGi4DZSbl9MP1VllHkY/UoXPwYOlP0n5Cht28qhl+85ql92W0viODWC8le7dgDgx1ll70I3aaHx9w3N2235KtF/DfI5/NQufgwdKfpPj1ondh+qDIbbMgqXX7a8d3Ju8qowUQhu4W813O9EMzztqsteqzrX5+R7+ahc/Bg6U/SfFoCD49/wBKoavvntLG/wDk7R9OXNe37U8iF9Wf2CEOAwNaNtEO7e5WeSD9Shc/Bg6U/SfEqsFJVJ70TNU3NVDdpgdhNLrjEH/F7x/kKbbfZm880AAABls7ytsZlmqB5Iu1KHz8GDpT9J8Oyxu8qqwf/qrROm0xIzg1g3le7dia4QzZQL3c0IsaiJ2j+G7f/bcFWiX5ZeSbtShavBg6U/SfCD4tjMs0GQ2/gKl1rttaKaXGVgvKyhj/AFYqsIUuMzzedtWHa70VJtcd/ko7mofPwYOlP0nwKBaVXjWuyyVDeqsvz2mHBoido/hvNe89sc4QjvN7uSEOC0MaNw20Msb9Sqt8lXalD5+DB0p+k/HVYFm/NUusaqGigbCXGxHs/wDj6bbDEG/khH7eKTeIf97aSaF37GfT5Lu1KFq8GDpT9J+LJmaqwwq0TptMWO8NaF7v2VjhD+kb+aD30RO0fVly20XuNwVeJa7LL9g2/td2pQ9XgwdKfpPw1o1gyQbDCpNr9tMTvRTcwKs80Qxv4WqpBbzcbztqQrXbzks3G8+TL9ShavBg6U/SdtDRSVWiWv8ARWXZqhu10Hs1D4+87mr3ntznCGbbb3oMhNDWC4DZSVQzuw881Q0WeTT+ahc/Bg6U/SdlDeqsmzVZ9jfVUAUDYXPIDReSvd/8fWqmysL3ckI3bQHP3Q9w57aXKmLY3c3ycfzULn4MHSn6SqTYzNBkMKtFvy2mJHdQ31XsYDSIX0/9KrTx97/621Wis87lXiGs/wBPJ1+pQtXgwdKrRd4lVVgWbs9tB78Y3MH/AFe1iuoh/VuH2C9n2dtA3nedtWD+XZL/ANt5Pk87UoerwKGikpjiO8BQhubTRSqGDaYPYyHRd79zV7z2+tUNtBvcgxjQ1ouA2UuKs7sLPeVQ0UDyffqULV8dDbs13b81S+UbkygUW7C+I4NaBaSvduwhwYbLL3psbtdD425u5u2l3/8AVWjXbmftKz9nu1KHq+Kl1jEGQ2/gKtEtdlkompN1L2kd3IbyvZwxRDHDubzVnfim9521YYrRMlWiGtE9PKJ2pQ9Xw1ovRVWBWWuz2RdSLGEOjtFarlzXt+0OIh/V/wACEOC2q3121IF2967v5OflG/UoWr4SH2NG/NVWCgbTD7PNEtr5L2/bbn8BvPNANAAG4bKXGgK2lkH+XKhooHlI/Uoer4zEiuDWDeV7t2NrhDNlAvcmxYraYsIVR9kzVsttJuA3qvH/AAzcPKZ+pQtXxVox73C0XlUCyGP9WKiGKXmZ5vKi80zmvZwhWieirONaId/lO/moXP4TDhURO0Zbm817x2pzhCPEbzyQhwWhrBsi80GwrG0zqho8qH81C5/CYnbiH0Gxo3/cqgXbKzzQE6kmpTdmmAWUHypfqULV8dF7jc1B8egu3N3BRNSZq8qX6lD1fF7OAKz953NVJ70Q3uOyLqTNXlS/UoWr4asI1Ye9+fJVYY2xNSbq8qXalD1eDE1JurypdqUPV4MXUmavKl+pQtXgxNSZq8qX6lD1eDF1JmrypfqULV4MXmmc/Kl/NQufgGqblF5pnPypfzULmhWN/wAVW5h35oFt6iZ0pmrypfqUPOlEuvVW9meXw1TcqTadyiakzV5Uv1KHqVIsO9VRd8cXUmavKl+pQtXgxNSbq8qXalD1eDE1Jur9s2/tB2pQ9XgxdSZq8qX6lC1eDE1JurypdqUPV4MXUmavKl+pQtXgxeaZz8qX81C5+DF5pnPypfzULn4MXUmavKl+pQtXwVIYrxMvhic03V5Uu1KHq21Oz/l+S7t+85/DF1JmrypdqULUqSaKFZSyD/LlVaKB8UTmm6vKl2pQz90Hx7G7mf3tb7WI1lY0Cn4YnNN1eVLmgVohNgTHRHUvJ/A229+MbmL2sV1EPe7cPsPhi6k3V5UezgTb3bgnb3U2lQtWwwuykPjb3bmr3ntxdUNtt70GQ2hrRcB8MTmm6vKakqiH3Yf1ZqhgATtShk5r3fsFNU2Vhe7khG7aAX7oeXP44vNM1eUtLjYqYvdh7m5qzZEixnVWhyjNAqww3utVZ3fj73Zctoa3vN3n4YvNM5+UlF7jcFXjWu3DcNtL+9EMrBvTXXQ6KSeFqhMgt32u3nZS40BVWWM9Vm7L4YvNM5+UdSFa/wBFSe883naYUCh8f+Gr3ntjnCGbaTe9FkMVWNNAChc1S9W2N3BVWWu9FSb/AIYvNM1eUVWFY3e9UN2UmwIwOwH7GIN/JCP28W3iH/ex+pMHELaEXRCqsK7P44nNN1eUFLiAu93YeWao3bDEjODWDevd+yNcIR4Re7mhEi0P7Rnuby2uayam9OJVFzMvAiak3V5P237gq8b8Ny21op7xlaLysoY/1YqsIUuMzzedlJVWHdnmrb9wUYu+nwYnNN5+T1Vnef6Ks/vPO/bUh0P7Rl9PNe8dqe4Qze47+SEOC0NYNlLism5Kq21/oml19VRtPgxOabz8nasL8uVA2mB2E0uuMT+kI/bwbbRDN55qgDZba7JVnKpB/wBtjNIUbT4MTUm6vJuk3L6YfqqG2bC+K4NYLyV7t2JrhDNlAvehF7RQ/tG4bm7arLXeiL4jvyVVbYz12s0qNp8GJzTdXk1SVWi3bm7faRnUZDeVUYKIY4eFvNdzvRTe87KSqsPqqX9FS67cPgZpUbT4MTmmc/Jmhtr8lWfa/bVHfjm5n9r28dxELe//AIEIcBtUD+dlLjYqBY1UC1+SrPNJ+FmlRtPgxeaZz8mKsP8AJyX3z2mD2Mh0Te/c1e8dvrVDbVN7uaDWABouA2W9FS5VIN/1Kk/EzSFG0+DF5pnPyX7tjM81QNhc8hrReSvduwh1Q2Ui96EbtYDou5u5u2gWuRfEP5KqQrGevgM0qNp8GJzTef63R+2rV37B9O32kd1A/koQYLSIe5u4fcqmeMb3/wBbasPqq0Q//qtsZuHgs0qNp8GJzTdXkpRe7JVn2u9NtDu/GNzAjFiuoh/VuH2C9nAbQN53nZSVQ2xqzfuCrRDSfCZpUbT4MTUm6vJOrDtd6LN2e0wey0Ojb3bmr3jtxdUNtt70GQ2hrRcBspKtuyRZBtfnkqXGk+GzSo2nwYnNN5/syzbSrP2FRDsb9SoGwueQAN5Xu/8Aj6apsrC93JCN20Bz90PcOe3MoueUWQLG73Z+KzSo2nwYnNN5/sKzbR8rZ4Vm234rf0Ol1ypd3WZZqzYYkd1VoQgdnaRC3N/6VWND+0G92XLbQ205oviGgKiWHl4zNKi6fh7xrN/kKs00jbE1JuryPzO4KvFv3DLbS80xDKwb1WcaIY38LVUgt5uN52Wqhtypda7c1Voh5DLx2aVF0/DS00FX0Oy3FWWOy2ROabz8jqrLX+ipNr89phQKH9o/hq957Y53szbSb3JrITQ1rbgNlLl9lVZ3onoi55pJ+QZpUXT8YDz/APSAeRqUTmm8/I2rCu3uVDdlJRgdgP2MQf8AEI/bxbeIZ/7t/wDZUuKLIB5u+SZpUXT4Flrcl9imFppFPkWSbl9ML1VAu2GJGcGsG8r3bsjXCGeEXu5oRItD+0Z7m8ttVlrkXxHfkqqzuw/X5NmlRdPgwXNNBqoC5+W4r75eRNvRVo34btrxjbwtF5WUNv8AqxVYQpcZnm87asO7NUv/AAFS67cPlGaVF0+DC0p+lART/wDSFY/nyHqsFZ+SrvNZ+0sZQ/tH05c17x2pzhC+o7+SEOC0NYNlLjYqBY1UC2JkqzzSflWaVF0+DC0p+nZZa3JWGkZbwqR5CVIP5dkqBfvJ2mD2I0u3xBu5L3jt9OdQ3nmqAAAMtlt+SpcqkG/6lb8szSounwYWlP07azDQVQe6/wDgr7+QNJuXd7sLPNUNFA2OfFcGtF5K927EHCGbLL3oRe0UPj7sm7aG2vRfEd+SqsOxnr8wzSounwYWlP0/CGxTZ9SFJ5H9/wBL1WjWN3M/vb7SO7kN5VSGKIY4dzea7veim9521YXVVnlW2Ny+ZZpUXT4MLSjTcRQuNca41xrjXdrFuRXdNIyO5UipQuFcK4VwrhXAuBcC4VwrhXCuFcK4FwLgXAuFcK4VwrgXCuBcC4FwLhXAuFcC4FwrgXAuBcC4VwLgXAuBcK4FwLgXAuFcC4FwLgXCuBcC4FwLhXAuBcC4FwrgXAuBcC4VwLgXAuBcK4FwLgXAuFcC4FwLgXCuBcC4FwLhXAuBcC4FwrgXAuBcC4VwLgXAuBcK4FwLgXAuFcC4FwLgXCuBcC4FwLhXAuBcC4EB3XPNwCrxKrnei4FwKh1V0U8LUY0R0Wr9Ru5BCFAaxrfVcKpJZQqosarbXZKs8vXGuNca41xrjXGuNca41xrjXGuNca41xrjXGuNca41xrjXGhRcBQounwYdRtPdUhUhUhUhUhUhUhVZrXArvNLXfwVaaCpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwqsI8yqsU8ipwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwpwqsIin6jcFT7QFxvcpwpwvZ9hhl7zx0WBGN/kX0CmUm13NBrHNa0CwBThU1qVbYMlRBYSc1SWOJWGVhlYZWGVhlYZWGVhlYZWGVhlYZWGVhlYZWGVhlYZWGVhlYZWGVhlYZWGVhlYZUSu0ju+DOVOVOVOVOVOVOVOVOVOVRF6oBzW81I1SBSBSBSBSBSBSNUjVI1SNUgUgUgUgUgUgUjVI1SNUjVIFIFIFIFIFIFI1SNUjVI1SBSBSBSBSBSBSNUjVI1SNUgUgUgUgUgUgUjVI1SNUjVIFIFIFIFIFIFI1SNUjVI1SBSBSBSBSBSBSNUjVI1SNUgUgVaEOYVaKOQUgUgUjVI1SNUjVIFIFIFIFIFIFI1SNUjVI1SBSBSBSBSBSBSNUjVI1SNUgUgUgUgUgUgUjVI1SNUjVIFIFIFIFIFIFI1WsaqITQ1n1ZqUKQIueGtaLyUIP8AjmUCmYC1y9p26IXvPBTYFIFIFRUaX5Ik2KrBNAzWIViFYhWIViFYhWIViFYhWIViFYhWIViFYhWIViFYhWIViFYhWIViFYhWIViFYhU5WIVOflM25LNvoqWmkfvSs80BVondh7m589piR3VW+q9jBaRD3N/6VTPGN7/621IVrs0XxCqLmZfqlLb1ZYcs1ZY7L95ZuNzRvXtI9rtzdw297vRTcwL2kQ0Qxxbm/YL2cBtA3nedlJsCqwrG55q2/JUu/VxSfyg2Lf8AV+8PZwRWifwFWca0Q3u2mD2ah8fedzV7z20u9mbbb3oMhtDWi4DYXOuCyZkqrbX+ipcaT+slN5fu4oHefgqlravtbqPgdTkn0ZfpH//EACoQAQACAQMFAQACAgIDAQAAAAEAEVEhMUEQIGFxgTCx8KHRkeFAUMHx/9oACAEBAAE/If8A1tQfbwTlZ7qW+2Gz1j4O1UErwvpP+DBNUIhNDzl6OzG6ytN0pp0WsdvbL+Dsw2PxdmGx+Lsw2PxdmGx+Lsw2PxdmGx+Lsw2PxdmGx+Lsw2Px2MNjsJzZKlTA5I6u8A/9+j9LPqeoKHMKgnDwPfVBQcO7gIZYqwunl/viXjSNN/gwdd4Dxx5MFrFu+PX44czDn8cOZhz+OHLMOfxw5Zhz+OHMw5/HDmYc/jhzFxz+K45mHP44czDn8cOYuOe4Mxd1tDQtNzc/97dR6cf7Qldf8E285MfUHwuC3TE1Tmg/8sIpvmkNKwwMobvKyvRaePsVrW3/AEynJbqm/tEXEHwhd09qt0RfCAMRFiD4QW6e1W6Ki+FwBiIsQfCC3TXardEXwgDERYg+EFuntVuiL4QBiIsQfCC3T2q3RUXwgDERYg+EFuntVuiL4QBiIsQfCC3T2t3RFfEBMRFxB8IXdPardEXwgDERYg+FwW6e1u6IvhAGIixB8ILdPardEXwgDERYg+EFunt3Q0NJSzRxCLJwf+5GOTghxT/iiyGju5pWHLy9Bzt5jJW0tT/6PmAqiVT7YfzCppQKA6MxDyxshw9vs8QmIBwdUv3DLHa4YgV76pfuGeO1eO9QK99Uv3B5712uOIFe+qX7hnjpvNWxibTRuZ6OOIFe+qX7hnjtccQK99Uv3B547XHeoFe+qX7hnjtcMQK99Uv3DLHavHECvfVL9wee9drjiBXvql+4fw7X+MCvfVL9wzx2uOI2MHMUXhw/PE/+HWwZtJ/QT+gn9BP6Cf0E/oJ/QT+gn9BP7Cf2E/sJ/YT+w6b+4n9xP6if1E/qPwSSTf8AWdP/AHk/vJ/eT+86/wCjBbo0JxS+CpvDtitWAGhhC5rM4G2iXL3StfniJ/acLDIWU/74AvyQMGOJGtdZhc1m1NOvJMhfcp/3yn/fHBX31mFjWLQ06skyFlP++U/744K9ZhY1i0NOrJMhZT/vlP8Avjgr1mFjWLQ06skyF9zfgf1c24H9VHBXrMLGsWhp1ZJkLKf98p/3xwV6zCxrFoadWSZCyn/fKf8AfHBXrMLGsWhp1ZJkL7lP++U/744K++swuazamnTm+JkL7lP++U/744K9Zhc1m1NOvJMxZT/vlP8Avjir1OFzWbU65MzFlf8Avlf++OKvUyWNZtDTrkzIWV/75X/tjgr1tljWetbeDeNuRD8TbAIQQ6o6H5BGgosqj/0UzMzMzOzu7u7u67u7u7u7u64d5N4Y9DCo4bNhD4HQFpFuMM6MlNEJ5dNWVxl/VKPEfgQZKwivKdmntFXcIfxjgLB8DoArozN9DpgfgQZIxWes7gDB8joAroyNyjpAfkQZIxWes7gDB8joAroyN9DpAfkQZIxWes7gDB8joAroyN9DpAfkQZow3VW5JYUbEuIMHyOgCujI30OkB+RBkjFZ6zuAMHyOgCujI3KOmB+RBkjFZ6zuAMHyOgCujI3KOkB+RBkjFZ6zuAMHyOgCujM30OmB+BBkrFZqzOAsHwOgCujM3KOmB+BBkrFZqzuAsHwegCpTM3KOmB+HBkrFIqROAsHw+jCujM30Omx+HBkrFIqROAsHw+jimjM2KJtRDxEG1uetI8KqXuiIAHIUbLs/9XAAKgFrKaPXj/afWR4JzcbvonDEPD+uf6RMkNdzxP8AScQ1Dny5Yte5uVcasXI7OSNBw/y9U44g376rXuBzx2px3qDfvqte4Z47U44g376rXuBzx2pxxBv31WvcDnjtccQb99Vr3A547U44g376rXuBzx2pxxBv31WvcDnjtTjiDfvqte4HPeu1OGIN++q17gcsdqcd6g376rXuBz3rtThiDfvqte4HPHanHeoN++q17lwFEisxQhc9Xse3+B/6qADaEgpX/jeop/snqCaR0QigDVWXW5dD/H+8aE6vIeX+sFOmAHEVMRkAQAbx8/aAAAGwdiN2RPCCsRRiB4XAbt7UbsieEFYijEDwgN29qN2RPCCsRRiB4QG7e1G7InhBWIoxA8IDdvajdkTwgrEUYgeEBu3tRuyJ4QViKMQPCA3b2o3ZE8IKxFGIHhAbt7UbsieFwViKMQPC4DdvajdkTwgriKmIHhAbt7UbsieFwViKMQPC4DdvajdkTwgrEUYgeEBu3tRuyJ4XBWIoxA8IDdvSmLXd7MfEjfkeuz+N/wCpALRWjd2J9bHlmkOjj/eABQUHTe/qoWadH/MeEI84f0X56DnmVBT5aYCc/DEc8wc8/iOeSDnn8RzzBzz+I55g55/Ec8wc8/iOeYOefxHPMHPP4jnkg55/Ec8wc8/iOeYOefxHPMHPP4jnmDnnt1JpwgUAgXKA6fwv/UIFR38RzH/DRCjp/wAXVo3b+o0PMsa2d+L/AOs1P/7B48dXZklO1PmB/F2YbH4uzNh+LszYfi7M2H4uzDY/HYw2PxdmGx+Oxhsfi7MNj8XZhsfi7MNj8djDY7kI2R94IQ+EBn8b/wBNgTEKrYINScHA9ysjRvwJTBq35PUPjN59uXxLAbt//LHmbS1egCIAbrFdrz8vSaCxNh+Oxhsfi7M2H4uzNh+Oxmw/HYzYfjsYbH4uzNh+Oxmw/F2YbH4uzDY/HYw2Px2MNj8Fgrd3sy/Cjbmf+l0LXLcvBLNv7/6yru/zsPCDgJhzByNalARixSxfH/eC+cXx5/1gAUaB0tHR/MHG72T3AAo0IuOWLjn8cOZhz+OHMw5/HDmYc/jhzMOT8cOZhyfjhyzDn8cOZhz+OHMw5/FcczDn8cOZhz+K45ZhyfjhzMOfxuHS2hFs6WptD+oP/RVuIPf/AFh+if5WUIZe5/vLTTSAmJt4EyuA5gV9fI8v9IOWg14eP+3UUDwj/wDYvpHHrFboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIixB8ILdPardEXwgDERYg+EFumu1W6Ki+EAYiLEHwgt012q3RUXwgDERYg+EFumu1W6Ki+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIixB8ILdPardEXwgDERYg+EFuntVuiL4QExEXEHwgt09qt0RfCAMRFiD4XC7p7Vboi+EAYiLEHwgt09qt0RfCBx3QUFNazVui55jXWvH/0CtSh3Dk+478OBxC/o49RwxAr3Na62u1fLgmsmKUaOBy/1g6o8275hnjo9pR6IGavdO70XjiBXvql+4Z47XHECvfVL9w/j2uOIFe+qX7hnjtccQK99Uv3B547V44gV76pfuDzx2rxxAr31S/cHnjtXjiBXvql+4Z47XHECvfVL9wzx2uOIFe+qX7h/HtccQK99Uv3B547XHECvfVL9wyx2uOIFe+qX7g8967V/wAIFe+qX7hnjtf4wK9z+d0yXKEDlwZcUVu9z/zaywtsEp6OM4jT+nJTR55eWLjVgV8S7mw3P9rLmZ3P/wACEbahUdFZQBvNqnnef+sNkBxLMxw1YFfPQL1YlanRL+YOdGWZlmYuNWBXz0C9WJWp0S/mDnRlmZZmLjVgV89AvViVqdEv5hloyzJLMkcNWBXz0C9WJWp0S/mGWjLMksyRw1YFfPQL1YlanRL+YZaMsySzJHDVgV89AvViVqdEv5hloyzJLMkcNWBXz0C9WJWp0S/mGWjLMksyRw1YFfPQL1YlanRL+YOdGWZJZmLjVgV89AvViVqdEv5g50ZZmWZi41YFfPQL1YlanRL+YZaMszLMxcasCvnoF6sStTol/EHOjLMyzMXGrAr46BerErU6JfzDLRlmSWZi41YFfHQL1YlanRL+YOdGWZJZmLjVgV8dBd3OENPSl/M4X9jF9TgG3/lq33yNoqwt3N2Ul2DlhYAEoxAFjZUBKGanL5mD/M5uhve3LBrRi3oS2v0G7AYf6d4ZSjBKMEcNGDfz0GtGLeh0WvmGWrKMSjETGjBv56DWjFvQ6LXzDLVlGJRiOGjBv56DWjFvQ6LXzDLVlGCUYI4aMG/noNaMW9DotfMMtWUYJRgjhowb+eg1oxb0Oi18wy1ZRglGCOGjBv56DWjFvQ6LXzDLVlGCUYI4aMG/noNaMW9DotfMMtWUYJRgjhowb+eg1oxb0Oi18wy1ZRiUYjhowb+eg1oxb0Oi18wM6soxKMRw0YN/PQa0Yt6HRa+YZasowSjBHDRg389BrRi3odFr4gZ1ZRiUYjhowb+Og1oxb0Oi18Qy1ZRglGCOGjBv46DWjFvQ6LXxDLVlGJRgjhowb+OiqrnGOnpWviBnVglCb6n/AJX5Ys/5XpMDIDmCR3uMOrI/GcmAljqWF0MsD6UNQ28YEG/fTdIcOPc1+t5x6gc967XHEG/fVa9wOeO1xxBv31WvcDnjtTjvUG/fVa9wOeO1OOIN++q17gc967U44g376rXuBzx2pxxBv31WvcDnjtTjiDfvqte4HPeu1OO9Qb99Vr3A547U44g376rXuGeO1xxBv31WvcM8dqcd6g376rXuByx2pwxBv31WvcDnjtTjvUG/fVa9wP8AHtTjiDfufzumWvcP4/8AlPjV0l+zb/7f9Qx/wtiAL0iBu3padC0nbzgRIdtLNAwwY5bvKysRuyI76RBRp6D1Co1rdd2B4XAbt7UbsieEFYijEDwgN29qN2RPCCsRRiB4QG7e1G7KieEFYijEDwgN212o3ZE8IKxFGIHhAbt7UbsieEFYijE1MXBUHYjdkTwgrEUYgeEBu3tRuyJ4QViKMQPC4DdvajdkTwgrEUYgeFwG7a7UbsieEFYijEDwgN29qN2RPCCsRRiB4QG7e1G7InhcFYijEDwgN29qN2RPCCsRRiB4QG7e1G7InhBWIoxA8IDdvajdkTwlsd0vvqQ8IDdv/kvnz8Yg5Xl49Jq2x5lUPXise76csOrZq/2wP8waKUCgOilQHMy3/lkLCDZUHPP4jnmDnn8RzyQc8/iOeSZc/iOeYOefxy5J/lBAV3jnkg55/Ec8wc8/iOeSDnl/Ec8kHPP4jnmDnn8RzyQc8/iOeYOefxHPMHPP4ndzabFy/wDlX1GaO7sSjWrd3h66X+SUUhQENiAuW1UEsVrY/wDyJUXdbv8AtevLi2G7Bv8A8Q6OzNh+LszYfjsZsPxdmbD8XZmw/F6MNhBX4OzDY/F2YbH47GGx+Oxmw/F2ZsPxdmbD8XZhsfjsYbH47PbNn/kr6tu/yekq9DQgNdfHHR2Zp2Xtbvgmslb16OVyyiGlotX1g61UvFwe5qRdvh66uzNh+Lsw2Px2M2H4uzNh+Lsw2PwdE2MOjq0g9L6uzNh+OxhsfjsZsPx2M2H4uzNh+LszYfi7MNj8djDY/HZ7f/IF8gAq7BDo73GPuVc+8E09rz6qG0NA6ef+kVs274Yf6ThGMc+XL1Waf9lSqH28vZhzFxz+OHMw5/FccsXHJ+OHMw5/HDmYc/g7Zhyzi5OwNdN3NnRcczDn8cOZhz+OHMw5/FccsXHP44czDn8VxzFxyfjhzFxz+OHLFxyfjxc2mwcn/jXx56/4h5VyYeolb2Zg0qOirFVesulZCrx/vBIalF+n+soyCg0VB8IQVAE3d/8AnQABQdVboi+EAYiLEHwuC3T2q3RF8IAxEWIPhBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIixB8ILdPaniLbiAMSkcQfCC3T2N01uiL4QBiIsQfCC3T2q3RF8IAxEWIPhBbp7Vboi+EAYiLEHwgt09qt0RfC4AxEWIPhBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIi4gviC3T2q3RF8IAxEWIPhcFuntVuiL4QOO6X31I+EFun/w/3ELuz6BPMWUNHH+8CijbpuLVgS/ptLQgvNA/w+fPUk3Vsbs3ijbj2nHECvfVL9wzx2v8YFe+qX7hnjtXjiBXvql+4Z47XHECvfVL9wzx2uOIFe+qX7hnjt36YgV76bIl+4v/AI9p9KgV76pfuGeO1xxAr31S/cM8drjiBXvql+4Z47XHECvfVL9weeO1xxAr31S/cP49rjiBXvql+4Z47V471Ar31S/cMsdq/wCMCvfVL9wee9dr/GBXufzugS/cHnj/AML9rY4uUaGkbEETI+oOdGWZn9xwHx5i09/8P/rNPRf0O3joF6s27lx7QtVzlEv5hloyzMszHDVgV89AvViVqdEv5g50ZZmWZi41YFfPQL1YlanRL+YZaMsySzJHDVgV89AvViVqdEv5g50ZZklmSLjVgV89AvViVqdEv5g50ZZklmSOGrAr56BerErU6JfzBzoyzJLMkXGrK1+dAvVmixv0F+ZRzoxQ5IJklY1ZRv46BerErU6JfzBzoyzJLMkXGrAr56BerErU6JfzBzoyzJLMkXGrAr56BerErU6JfzBzoyzJLMkXGrAr56BerErU6JfzDLRlmSWZI4asCvnoF6sStTol/MHOjLMyzMXGrAr56BerErU6JfzDLRlmZZmOGrAr56BerErU6JfxBzoyzMszFxqwK+OgXqxK1OiX8wy0ZZklmSLjVgV8dDd3OANPSl/MHOjLMn7fjYqbBKwDg4xQTTngSknyyi18Qy1YcbE/ovxLCRt/4jAmwrOA38RoG9pv/jcvUq70WvmGWrKMSjEcNGDfz0GtGLeh0WvmBnVlGJRiOGjBv56DWjFvQ6LXzDLVlGCUYI4aMG/noNaMW9DotfMMtWUYJRgjhowb+eg1oxb0Oi18wy1ZRglGCOGjBv56DWjFvQ6LXzDLVlGCUYI4aMNfiDWDWjNSjnotfMMtWBexB3ojhowb+eg1oxb0Oi18wy1ZRglGCOGjBv56DWjFvQ6LXzDLVlGCUYI4aMG/noNaMW9DotfMMtWUYJRiOGjBv56DWjFvQ6LXzDLVlGCUYI4aMG/noNaMW9DotfMMtWUYlGImNGDfz0GtGLeh0WvmBnVlGJRgjhowb+eg1oxb0Oi18Qy1ZRiUYjhowb+Og1oxb0Oi18wy1ZRglGI4aMG/jo6q5RDp6Vr5hlqyjH6/hlp5eCXI1t3/APJX3f5WFyBFr3FKIAtXYiwanMeH+8qbJ1P8/wCsAAAoOhWmBFLvxcn3AAAAHHRa9wOe9drjiDfvqte4H+PanHEG/fVa9wOeO1OOIN++q17gc8drjiDfvqte4HPHanHEG/fVa9wOeO1OOJq6nHmGeOiX1TjiDfvqte4HPHanHEG/fVa9wOeO1OOIN++q17hnjtTjiDfvqte4HPHanHEG/fVa9wOeO1xxBv31WvcM8dqccQb99Vr3A5Y7U4Yg376rXuBz3rtThiDfufzugWvcDnj9v102t/8AWHKp/lilAXx/vE7aFRRicpjnnwQWg7bwy/6S1sGtNPH/AG61gOMw4pwcITwgrEUYgeFwG7e1G7InhBWIoxA8IDdvajdlRPCCsRRiB4XAbtrtRuyJ4QViKMQPCA3b2o3ZE8IKxFGIHhAbt7UbsieEFYijEDwgN29qN2QLEdXEUYgBvS42+0jdkb30mAijEDwgN29qN2RPCCsRRiB4QG7e1G7InhBWIoxA8IDdvajdkTwgrEUYgeEBu3tRuyonhcFYijEDwgN29qN2RPCCsRRiB4QG7e1G7InhcFYijEDwgN29qN2RPCCsRRiB4QG7e1G7InhE47pffUB4QG7f1/PUnh5vuegKHEO+lj10HPMupR12r/omqZ6a6OA5ZufPmPnqrH/gIvW3eO71HPJBzz+I55g55/Ec8kHPP4jnmDnn8RzzBzz+I55Jlz+Nh5mjV36jXTWVjJe6JpZuQc8/iOeZlz+I55g55/Ec8wc8/iOeSDnn8RzzBzz+I55IOefxHPMHPP4jdzacnP6nxdibBKOriOI4qO6lUfby9bg7Ld/2stwnc/8AyP6Qzq0DQ6AiAHLFljyc/SDKnYdmbD8XZmw/HYzYfi7MNj8XZmw/F2ZsPxdmBYjjETsFDpdmGx+Oxhsfi7MNj8djDY/HYzYfi7M2H4uzNh+Lsw2Px2e2bP031V/fAnJa3cobeE5gSYNg6HRS0UBG1Rbl8sP5hW7He/8AqZsdLQVgzABcv+2BRRt2uzNh+LszYfjsZsPxdmbD8XZmw/F2ZsPxdmbDrRKSux2YbH47GGx+Oxhsfi7MNj8djNh+Lsw2PxdmbD8XZhsfjs9s2fnvkNf/ADPU9bEOYFCvjxOoxS2OVgIevqwugZYXVMaht4wi45mHMAuAj/8AYn+ifTvXHMXHP44czDn8VxzFxyfiuOZhz+OHMw5/HDmYc/iuOZhz+OHMw5/HDmYc/jhzMOfxXHMXHP4rjmLjk/HDmYc/iuOYuOT8VxzFxz+K2c2nByfkdoWlH/aCP9cmNp1/067QBrv84ERqFpZo4f75g0u8m7lYvhcBMRlUp6YINaryGC3T2q3RF8IAxEWIPhBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIixB8ILdPardEXwgDERYg+EFuntVuiL4QExFfEH4hrpqWS5cuLsKi7NLgDERYg+ELuntbuiL4QsxcbcS11pcNVMuXKSkddFS3iAMRFiD4QW6e1W6IvhAGIixB8ILdPardEXwgDERYg+EFuntVuiL4QBiIsQfCC3T2q3RF8IAxEWIPhBbp7Vboi+EAYiLEHwgt09qt0RXxATERcQfCC3T2q3RF8Lgcd0tvqB8ILdPcMcnBKamm8RkpWEvU88sHnvXTjKW56MssyF133cECUdAoIvDeojIBusyn9z6gYwYiX7g8sdq8cQK99Uv3DPHa/xgV76pfuDzx2rxxAr31S/cM8drjiBXvql+4Z47XHECvfVL9wz3rtccTY8x6Ev3DLHaseVT/Lql+4Zb12uGIFe+mp/yQeWO1/hP+SK9+iX7g8967XHECvfVL9wzx2uOIFe+qX7hnjtccQK99Uv3B547XHECvfVL9w/j2uOIFe+qX7g88dq8MQK99Uv3B5Y7V471Ar3P5nQJfuGeO2rHktiUYat1uy03D5QSIB0Ol3xyqCXYnrH/AORMwZu/7GWZi41YBZa7BuoA0zrwHuDS2JWp0S/iDnRlmSWZjhqwK+egXqxK1OiX8wc6MszLMxcasCvnoF6sStTol/MMtGWZJZkjhqwK+egXqxK1OiX8wc6MsySzJFxqwK+egXqxK1OiX8wc6MsySzJHDVgV89AvViVqdEv5hloyzJLMkcNWBXz0herErU6JfxBzoyzMvzHDVmh81NsC9WJWp0S/iDnRlmZZmLjVgV8dEvVmjXRFP8WGWjLMyzMXGrAr4jBZbErU6JfzDLRlmSWZIuNWBXz0C9WJWp0S/mGWjLMksyRcasCvnoF6sStTol/MHOjLMksyRcasCvnoF6sStTol/MMtGWZJZkjhqwK+egXqxK1OiX8wc6MszLMxcasCvnoF6sStTol/MMtGWZlmSLjVgV8dAvViVqdEv4hloyzMszHDVgV89Dd3KCtPQl/EHOjLM9Ke7/Myj1BClr4eEINcO6mE04Me7gIAWiwOllZ/pNH6Wm19GCUYlGIQ3Hhx7m8wN3+HQa0Yt6HRa+IZasoxKMEcNGDfz0GtGLeh0WvmBnVlGJRiJjRg389BrRi3odFr5hlqyjBKMEcNGDfz0GtGLeh0WvmGWrKMEowRw0YN/PQa0Yt6HRa+YZasowSjBHDRg389BrRi3odFr5hlqyjBKMEcNGDfz0lWjFvQ6LXxKzqyjEoxExowb+Jtg1oxb0Oi18QM6soxKMRMaMG/jotaMW9CcRf8YGdWAYlGImNGDfxGKimLeh0WvmGWrKMEowRw0YN/PQa0Yt6HRa+YZasowSjBHDRg389BrRi3odFr5hlqyjBKMEcNGDfz0GtGLeh0WvmGWrKMEowRw0YN/PQa0Yt6HRa+YGdWUYlGImNGDfz0GtGLeh0WvmGWrKMEoxHDRg38dBrRi3odFr4gZ1ZRiUYI4aMG/no6q5RDp6Fr4hlqyjEooNeP959KnghWLq4N++g8XBHSGya6s/wwG4GuVl6qdhpxHqVvc7m8JxxBv31WvcDnjtTjiDfvqte4Z47XHEG/fVa9wzx2uOIN++q17gc8drjiDfvqte4HPHa44g376rXuBzx2pxxFs89Vr3DLHanDEdnnqte4HLHanDEG/fWte4HPHQ6p/hLv31LXuBz3rtTjiDfvqte4Z47U44g376rXuGeO1OOIN++q17gc8dqcd6g376rXuH8e1xxBv31WvcDnjtTjiDfvqte4HLHanHeoN+5/M6Ba9wP8euqF9f8A5QLQP8xG7I3voVK8x3kp4gM22s/zhBFKoCgIDdseGDllf8Qf00gkgbB0RuyJ4QVxFTEDwgN29qN2RPCCsRRiB4QG7e1G7InhBWIoxA8IDdvajdkTwgrEUYgeEBu3tRuyJ4QViKMQPCA3b2o3ZE8IKxFGIHhAbt7UbshpxBWIoxA8IDdvajdkHhBXEVMQPCA3b2o3ZEfEVPEVMSvCA3b0OqN2QeEaxFGIHhcBu3tRuyJ4QViKMQPCA3b2o3ZE8IKxFGIHhAbt7UbsieEFYijEDwgN29qN2RPCCsRRiB4QG7e1G7InhBWIoxA8IDdvajdkTwgriKmIHhAbt7UbsieFxOG6W31AeEBu3t17asL8rp/k8H9YXEi3UWYN3NOgjV5SgRW1/Y5e4c8zLn8RzzBzz+I55IOefxHPJBzz+I55IOefxHPMHPP4bInPMy5/FlzNl89Ll9Lly+g55g557DsYNL5g55/Ec8wc8/iOeSDnn8RzzBzz+I55IOeX8RzzBzz+I55mXP4jdyKbFy9zVtX9T/MoLZ24POWaPG0X/wCB4m2ez1xT/wCFe8FOdH/873Zhsfi7M2H47GbD8XZmw/F2ZsPxdmbD8GVDDY7dk2wUyoNGbCMqVOYEqJ0TeBoRNO+rlUobH47GGx+Oxhsfi7MNj8djNh+LszYfi7MNj8dnvm3t/wCsYH/SI3hr/wAScf4nDfQ/l6KldpXvCB8/E05svL+Dsw2PxdmbD8djNh+LszYfi7M2H4uzNh+O5Np27Jtm7o7MOJz15h1Jww2I7R37bd+mxhsfjsYbH4uzDY/F2ZsPx2M2H4uzNh+Lsw2Px2e+be3rqFvWf2bQAABoBx0UgCMiLWTp9QjwBKPxXHMXHP44czDn8VxzFxyfiuOZhz+OHMw5/HDmYc/iuOWLjmNolddnS39FxzP5h15h2O1csMO5HaO/eLjmLjn8cOYuOfxw5mHP4rjmYc/iuOWYcn4rjmLjn8VxzFxz+K2cqnByd6kpxjdixRzbbUBw2QfC4LdPa3dEXwgJiIsQfC4LdPardEXwgDERYg+EFuntVuiL4QBiIsQfCC3T2q3RF8IAxEWIPhBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhcAYiLEHwm7TUFPTZ0k6SKMXPVCjieq5boenMOi26JoNoCYlK8XL1bXLdD1FHRW6IvhcAYiLEHwuC3T2q3RF8IAxEWIPhBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4XBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIi4g+EFuntVuiL4XA4bpbfUD4QW6exST/APUIjZ/tHiBXvoP4ES/cHnvXa4YgV76pfuGeO1eOIFe+qX7hnjtccQK99Uv3B547XHECvfVL9wzx2uOIFe+qX7g88drjiBXvql+4PPHavHeoFe+qX7g88Td02TbDDECvcNHokG/npzDov/CBXuO02wX7nl0N+q8d6gV76pfuDz3rtXjvUCvfVL9wz3rtXjiBXvql+4Z47XHECvfVL9weeO1eOIFe+qX7g88drjiBXvql+4PPHa44gV76pfuGWO1eOIFe5/I6BL9weWOqZW3yQOgD+fcCvjoR1wauYdEv4hloyzMszFxqwK+OgXqxK1OiX8wy0ZZmWZjhqwK+egXqxK1OiX8wc6MszLMxcasCvnoF6sStTol/MMtGWZJZkjhqwK+egXqxK1OiX8wy0ZZklmSOGrAr56BerErU6JfzDLRlmSWZI4asCvnoF6sStTol/MMtGWZJZkjhqwK+egXqxK1OiX8zU10ZZkiK3JwNWCviO0C9WJRZOIlyOdGWXuQTJHjVgr56OtmCrE4huDLRjOUsyRw1YFfPQL1YlanRL+YZaMsySzJHDVgV89AvViVqdEv5hloyzJLMkcNWBXz0C9WJWp0S/mGWjLMksyRw1YFfPQL1YlanRL+YZaMsySzJHDVgV89AvViVqdEv5hloyzMszFxqwK+egXqxK1OiX8wy0ZZmWZjhqwK+egXqxK1OiX8Qc6MszLMxw1YFfHQ3dygDT0JfxBzoyzMAKACJjRg38dGGuHdTDotfEDOrKMSjEcNGDfx0GtGLeh0WvmGWrKMEowRw0YN/PQa0Yt6HRa+YGdWUYlGImNGDfz0GtGLeh0WvmGWrKMEowRw0YN/PQa0Yt6HRa+YZasowSjBHDRg389BrRi3odFr5hlqyjBKMEcNGDfz0GtGLeh0WvmGWrKMEowRw0YN/PQa0Yt6HRa+Zra6sowTQ2IOGjF/hFiopmoo6OkAc6sovaAYIMbwf8OlGjFdDoqgy1YS9pRgjhowb+eg1oxb0Oi18wy1ZRglGCOGjBv56DWjFvQ6LXzDLVlGCUYI4aMG/noNaMW9DotfMMtWUYJRgiY0YN/PQa0Yt6HRa+YZasowSjBHDRg389BrRi3odFr5gZ1ZRiUYiY0YN/PQa0Yt6HRa+YGdWUYJRgjhowb+eg1oxb0Oi18QM6soxKMRMaMG/jo6q5RDp6Fr4hlqyjHVOOIN++g/gRa9wOe9dqcMQb99Vr3A547XHEG/fVa9wOeO1xxBv31WvcDnjtTjiDfvqte4Z47XHEG/fVa9wzx2pxxBv31WvcDnvXanHeoN++q17gc8TcdjjvUV++lRa9wOWJXYn+ENffSSg8wz3rtJxxBv31WvcDnvXanHeoN++q17gc8dqccQb99Vr3A547XHEG/fVa9wOeO1OOIN++q17hnjtccQb99Vr3DPHanHEG/fVa9wOWO1OO9Qb9z+R0C17gcsdqN2RPCW21CcNkDwuA3b2o3ZE8IK4ijEDwgN29qN2RPCCsRRiB4QG7e1G7InhBWIoxA8IDdtdqN2RPCCsRRiB4QG7e1G7InhBWIoxA8IDdvajdkTwgrEUYgeEBu3tRuyJ4XBWIoxA8LgN2zcdiN2QeEFYijEDwgN29qN2RPCJPEUYleEBu3tI3ZE8LgrEUYgeFwG7e1G7InhcFYijEDwuA3bXajdkTwgrEUYgeEBu3tRuyJ4QViKMQPCA3b2o3ZUTwuCsRRiB4QG7e1G7InhBWIoxA8IDdvajdkTwgrEUYgPiA3b2o3ZE8LicN0tvqA8IDdvfzckDdzT8RzzMufxHPMHPP4jnkg55/Ec8kHPP4jnmZc/iOeZlz+I55mXPXed3LmZc/jnzMufxDnkmXP4jnmZc/iOeYOefxHPMHPP4jnkg55fxHPMHPP45czLn8Ru5FNi5fxbZ7PX+Lsw2PxdmbD8XZmw/F2ZsPxdmbD8XZmw/F2ZsOu47rsw2OpNu3lDY/FsYbH47GGx+Oxhsfi7MNj8djNh+LszYfi7MNj8dnvm3v1otjouVrNs9nr/F2YbH4uzNh+LszYfi7M2H4uzNh+LszYfi7M2HXd3XZhsdN3v5Q2PxbGGx+OxhsfjsYbH4uzNh+Oxmw/F2ZsPxdmGx+Oz3zbN0VW0g2WbdtYSAUujGtxq2xbOafiuOYuOfxw5i45/HDmLjk/Fccxcc/iuOZhz+K45i45/FccsXHPXd27YuOYuOehv157HxzFxz+Jccxcc/iuOYuOfxw5mHJ+OHMw5/Fccxcc/jhzFxz+K45i45/FbObRpUaNsUu3LxlHaKxFRCx/jS22oDhsg+FwW6e1W6IvhATERcQfCC3T2q3RF8IAxEWIPhBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIixB8ILdPardEXwgDERYg+EFuntVuiL4XAGIixB8Lgt0zd2K3RE+ICYiLiXs0uWvWPROit0RfCBHiIuJfhBbp7St0RfC4AxEWIPhBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIixB8ILdPardEXwgDERYg+EFuntVuiL4QBiIsQfCC3T2q3RF8IAxEXEHwgt09qt0RfCBw3S2+oEsf50FiA7V44gV76D+BEv3B5712rwxAr31S/cHnjtXjiBXvql+4Z47V44gV76pfuDzx2rxxAr31S/cM8dq8cQK99Uv3B547V44gV76pfuDz3rtXjiBXvql+4PPepu7F/who89RcH/DtXhiBXvrS/cHnjps6rxxAr31S/cHnjtXjiBXvql+4PPHavHECvfVL9weeO1xxAr31S/cHnjtXjiBXvql+4PPHa44gV76pfuDzx2uOIFe+qX7g/4dq8d6gV7n8joEv3D+HWzJHDVgV8dBeuDVzDol/EMtGWZlmYuNWBXx0C9WJWp0S/iGWjLMyzMcNWBXz0C9WJWp0S/mDnRlmZZmLjVgV89AvViVqdEv5hloyzJLMkcNWBXz0C9WJWp0S/mGWjLMksyRw1YFfPQL1YlanRL+YZaMsySzJHDVgV89AvViVqdEv5hloyzJLMkcNWBXz0C9WJWp0S/mamujLMksyRw1YFfE2wL1YlanTeDLRlmYjMvG8Cvjol6sStScRL+YZaMRW5LMkcNWBXz0C9WJWp0S/mGWjLMksyRw1YFfPQL1YlanRL+YZaMsySzJHDVgV89AvViVqdEv5hloyzJLMkXGrAr56BerErU6JfzDLRlmSWZI4asCvnoF6sStTol/MHOjLMyzMXGrAr56BerErU6JfzDLRlmZZkjhqwK+OgXqxK1OiX8Qy0ZZmWZjhqwK+ehu7lAGnoS/iDnRlmSUYjhowb+OiDXDuph0WvmGWrKMSjEcNGDfx0GtGLeh0WviGWrKMSjBHDRg389BrRi3odFr5gZ1ZRiUYiY0YN/PQa0Yt6HRa+YZasowSjBHDRg389BrRi3odFr5hlqyjBKMETGjBv56DWjFvQ6LXzDLVlGCUYI4aMG/noNaMW9DotfMMtWUYJRgjhowb+eg1oxb0Oi18zU11ZRglGCeGjDX56FdGV0HRa+YedWaYlDwRMaM/gm8GtIW9DotfMMtWArYlGCOGjBv56DWjFvQ6LXzDLVlGCUYI4aMG/noNaMW9DotfMMtWUYJRgjhowb+eg1oxb0Oi18wM6sowSjBHDRg389BrRi3odFr5hlqyjBKMEcNGDfz0GtGLeh0WvmBnVlGJRiJjRg389BrRi3odFr5hlqyjBKMRw0YN/HQa0Yt6HRa+IGdWUYlGI4aMG/no6q5RDp6Fr4hlqyjB1TjiDfvoP4kWvcDnvXanDEG/fVa9wyx2pxxBv31WvcDnjtccQb99Vr3DPHa44g376rXuGeO1xxBv31WvcM8drjiDfvqte4Z47U44g376rXuBz3qbzscd6lnuaO8qp/lA5711Ipq+Jf/ADFvote4Z46berjvUG/fVa9wz3rtccQb99Vr3DPHa44g376rXuGeO1xxBv31WvcM8dqcd6g376rXuH8e1xxBv31WvcDnjtcMQb99Vr3DLHanHeoN+5/M6Ba9wP8ADtRuyJ4S22oTjsgeEBu2u1G7InhBXEVMQPCF3b2o3ZE8IKxFGIHhAbt7UbsieEFYijEDwgN29qN2RPCCsRRiB4QG7e1G7InhBWIoxA8IDdvajdkTwgrEUYgeEBu3t0Nyy8XEcRXxA8IDds3nZrdkpa6TwJb4lDekLu2X0YEtekbPEvwipiB4QG7em3q3dlRvxcF4lvEDwgN29qN2RPCCsRRiB4QG7e1G7InhBWIoxA8IDdvajdkTwgrEUYgeEBu3tRuyJ4QViKMQPCA3b2o3ZE8IKxFGIHhAbt7W7sieEFcRUxA8IDdvajdkTwuJx3S2+oDwgN29/JzHJzT8RzzBzz+I55g55/HLmZc/iOeSZc/jlzMufxy5mXPebOmXMy5hJabjtNplyTPmOpDSeYTd6PQc8zLns2xajjFeg55hovl/HLmZc/jlzMufxy5mXP45czLn8RzzBzz+I55g55/Hk5tOTn8W2ez0/i7MNj8XZmw/F2ZsPx2M2H4uzNh+LszYfgaY7M2HVb7ds2s2HVHTo2R6uUNjsoIt9ux+OxhsfjsYbH4uzNh+Oxhsfi7M2H4uzDY/HZ7Zt/H2z2en8XZhsfi7M2H4uzDY/HYzYfi7M2H4uzNh+B0jszYfjNjDYgzfqtS4Q0myGx+I0YbH47GGx+OxhsfjsZsPxdmbD8XZmw/F2YbH47PbNv4/Byxwc0/Fccxcc/iuOWLjn8cOZhz+K45YuOfxXHMXHP4rjmLjn8dOnMXHP4vDmatOYkJvHTpUutoxcczDkjt3m8dCiYc/iuOYuOfxXHMXHP4rjmLjn8cOZhz+K45YuOfxXHMXHP4rZzacHJ2KK68ePL1VuiL4S+2ptjsg+EFuntVuiL4QBiIuIPhBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIixB8ILdPardEXwgDERYg+EFuntVuiL4QBiIsQfCC3T2q3RL8IDXSIsQfCC3T2DSXvSX4XAGJ8Q2NJeusGotsupc1uior4lDErRtPRBbp7VbongSvCI+IPhBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIixB8ILdPardEXwgDERYg+EFuntVuiL4QBiIsQfCC3T2q3RF8ICYiLEHwgt09qt0RfCBx3S++oHwgt0xRxacfplla1LVd11X/GBXvoP4kS/cHnjtX/ABgV76pfuDy3rtXjiBXvql+4PPHavHECvfVL9wzx2rxxAr31S/cHnjtXjiBXvql+4PPHa44gV76pfuDzx0eq8MQVNnRL9weeOoubox8QV1F+4v8ADtXhiBR56Kf8k88dq8cSg89Uv3B5Y7XHECvfVL9weeO1eOIFe+qX7g88dq8cQK99Uv3B547XHECvfVL9wzx2rxxAr31S/cHnjtXhiBXvql+4PPeu1eGIFe5/O6BmYcmaLkH+mkGCHYOlmY4asCvjoL1yauYdEv4hloyzJLMkcNWBXx0C9WJWp0S/iDnRlmZZmOGrAr46BerErU6JfzDLRlmZZkjhqwK+egXqxK1OiX8wc6MszLMxw1YFfPQL1YlanRL+YZaMsySzJHDVgV8dAvViVqdEv5hloyzJLMkcNWBXz0C9WJWp0S/mGWjLMkszHDVgV8dAvVm8OiX8wy0ZZkg1zFxvA3cdNWrErUnES4vXXRlmZZmLjeGnxFgFW6yqLIa6w38Qy0ZZklmSOGrP8SbEC9WJWp0S/iDnRlmSWZI4asCvnoF6sStTol/MMtGWZJZkjhqwK+egXqxK1OiX8wy0ZZklmSOGrAr56BerErU6JfzDLRlmZZmLjVgV89AvViVqdEv5hloyzJLMxw1YFfPQL1YlanRL+IZaMszLMxcasCvjoF6sStTol/MMtGWZJZkjhqwK+Ohu7lEYi8GinX/7wnDSiGWjCkQFzdZRiJjRg389EGuXdTDotfEDOrKMSjBHDRg389BrRi3odFr4gZ1ZRiUYiY0YN/HQa0Yt6HRa+YZasoxKMRMaMG/noNaMW9DotfMDOrKMSjETGjBv56DWjFvQ6LXzDLVlGCUYI4aMG/noNaMW9DotfMDOrKMSjBExowb+eg1oxb0Oi18wM6sowSjBExowb+Og1ozQo36LXzAzqyjBAK2J4aMfpXQa0Yt6HRp8Qtvqyg4mmImNGGvnUYPDNHQlYlXxAzqyjBKMETGj0GDWjFvQ6LXzAzqyjBKMETGjBv56DWjFvQ6LXzAzqyjBKMRMaMG/noNaMW9DotfMMtWUYJRgjhowb+eg1oxb0Oi18wM6soxKMRMaMG/noNaMW9DotfMDOrKMSjBHDRg389BrRi3odFr4gZ1ZRiUYiY0YN/HQa0Yt6HRa+YZasowSjETGjBv46DZkaf5ZuzPrYwdFr5lLqbSf8uCK1G1ToYf756uOIN++g/jRa9wOeO1OO9Qb99Vr3DLHa4Yg376rXuGe9drjiDfvqte4HPHa44g376rXuGeO1xxBv31WvcM8drjiDfvqte4Z4mKLXq44g37j01vMM8dlxwxNcqURK2gt2JUqUzyjw4m/uV00YZ712ErhiDfvqte4Fa8RYs6uOIN++q17hnjtccQb99Vr3DPHanHEG/fVa9wzx2uOIN++q17hnjtcd6g376rXuGWO1OGIN++q17gc967U44jIB5ERG70Xd6Ba9xDbjvf7WV4H0r/8iD4OgUHVG7InhL7alOOyB4QG7e1G7InhcFYijEDwgN29qN2RPCCsRRiB4QG7e1G7InhBWIoxA8IDdvajdkTwgrEUYgeEBu3tRuyonhBWIoxA8IDdvajdkTwgrEUYgeEBu2buis6N3ZE8IKxLGJvNLgN29tN2Tk0gviK+JbxcBu3sWN3ZE8JqxE+JXhAbt7DbG7sqV4QViKMQG+LjZq9Br1RuyJ4QViKMQPCA3b2o3ZE8IKxFGIHhAdTXajdkTwgrEUYgeEBu3tRuyJ4QViKMQPCA3b2o3ZE8IKxFGIHhAbt7UbsieFwViKMQPC4DdvYCIAbrEyOy8vSEiBE47pYEAvcW6lufywP8xDfXvH/2e/k5J5uafiOeSDnn8cuZlz+I55g55/HLmZc/iOeZlz+I55Jlz1HRR65czLno6PaMNYOeSBzz0uXLl9mnWeZx2nTrlzMuei16HTtHPMy5/Ec8zLn8cuZlz+OXMHPP45czLn8RzzBzz2qK38oGJ+j7QAAKDjoYNj2uDM0AYc1vKwRU5s6eHUSFDp//ADt2R2en8XZmw/F2YbH4uzDY/F2ZsPx2M2H4uzNh1dowaYdXZhsdBz3bY7MNjqdh02MNjtFvY7MNiO0dZqe7Yw2Px2M2H47GGx+Lsw2PxdmGx+Lsw2Oyso7Z3YKc643NoarX/Q8x57XLN6OWUHlK2756NiDusur/APPGotTbtbI7PT+LszYfi7MNj8XZmw/F2ZsPx2M2H4uzDY7B0fV2YbHVDGarrtjsw2IdTqdNjDY6iYGV2OzNhF0HPdsYbH47GbD8XZmw/F2YbH4uzDY/HYw2OrqZzPHvL1uU9R+O3n2+fEsSu3+Cwf0hZ0AcHQb7ejlnBJs8S4p5XiGSqt17eDllbOafiuOYuOT8VxzFxz+K45YuOfxw5mHP4rjli45PxXHMXHPZs6KnrhzMOe7d02zDmbK5Ow7XxzMOYLgDvw5i45IrYQ0O5ccxcc/iuOWLjk/HDmYc/iuOYuOfxXHMXHP4rjmLjmLRbtGS1/0JWOj+egMoBavEYNrkPD/eU6zvf8/6wKKNo9nNoalLbRf18uxEsyc8+1W6IvhL7akOOyD4QW6e1W6IvhAGIixB8ILdPardEXwuAmIi4g+EFuntVuiL4QBiIsQfCC3T2q3RF8IAxEWIPhBbp7Vboi+EAYiLEHwgt012q3RUXwgDERYg+EFunqdeguxUXwgJiIuIL4gt09t30i8ICYiLiC+ILdPardEV8QB4iPiOztBdD2q3RFfEDwl64l24l93ardEXwuAMRFiD4QW6e1W6Ki+EAYiLEHwgt012q3RF8IAxEWIPhBbp7Vboi+EAYiLEHwgt09qt0RfC4CYiLiD4QW6e1W6IvhcAYhOQOYK/2fvBUIANA6br1VCrQ0/5jwmkkv6H8xW6IvhE0VTvGc2rVrEKf/Z77l44gV76b+NEv3B/x7V44gV76pfuDzx2rx3qBXvql+4PLHavHeoFe+qX7g88dq8cQK99Uv3DPHavHECvfVL9weeO1eOIFe+qX7g88dTp0o04gf8APVL9wzx2bI4b1DR56pfuGWO1/hAqPpoQzx2v8IFdHcS/c3a712rxxAr31S/cHnjtXjiBXvql+4PPHa44gV76pfuDzx2rxxAr31S/cHnjtXhiBXvql+4PPeu1eO9QK9zlhbG7B9C/CEv3B54mqf5E/wB5i6TU/D/6z+miD48dBugAbse7Jz5RdtbNHdj/APicHbZmLjVgV8dCOuTVzHol/EMtGWZlmY4asCvjoF6sStTol/EMtGWZJZkjhqwK+OgXqxK1OiX8Qc6MszLMxw1YFfHQL1YlanRL+YZaMszLMxw1YFfPQL1YlanRL+YOdGWZlmYuNWBXz0C9WJWp0S/mGWjLMksyRw1YFfPQL1YlanRL+YZaMsySzJHTpqz/AAYOkC9WU1HQjpxBbO8vzDXkmvDbKr4m2BerErU6JfxBzoyzJLMkXGrAr46C9WJWpLsIt/Et53nvPYleJTlx04tmRNUT/CGWjLMksyRw1YFfPQL1YlanRL+YZaMsySzJHDVgV89AvViVqdEv5g50ZZmWZi41YFfPQL1YlanRL+YZaMszLMxw1YFfPQL1YlanRL+IZaMszLMxw1YFfHQL1YlanRL+IZaMsySzJHDVgV8TSfw8e0B3cpceolanS/0lpx/pxHyiyvE4/wATbPaH8yzMUk6KF1T/AI4da0Fe60YiY0YN/HRhNXUx6LXxDLVlGJRiJjRg38dBrRi3odFr4gZ1ZRglGI4aMG/joNaMW9DotfEDOrKMSjETGjBv46DWjFvQ6LXzDLVlGCUYI4aMG/noNaMW9DotfMDOrKMSjETGjBv56DWjFvQ6LXzAzqyjBKMEcNGDfz0GtGLeh0WvmGWrKMEowTmNGDfzKCYOkW9CBP4YHOrKMEowRw0Yt/EGpoUxb0Oi18QM6soxKMRMaMG/iKiYMW9CCiLXzDLVi3BExrtowf8AGEbKYt6EEWvmGWrKMEowRw0YN/PQa0Yt6HRa+YGdWUYJRgiY0YN/PQa0Yt6HRa+YGdWUYlGImNGDfz0GtGLeh0WvmGWrKMEowRw0YN/PQa0Yt6HRa+IGdWUYlGImNGDfx0GtGLeh0WvmGWrKMEowRMaR1om2D1KO6u67sGtGBW8HCx7Hj/aVhmUOf9YBAAUAaEoxNrk2h6v+ibie/wDT8mrjiDfvpv40WvcM8dr/ABg376rXuH8e1OOIN++q17hljtcMQb99Vr3DPHa44g376rXuGeO1xxBv31WvcP49rjiDfvqte4Z47HaD/GDfub9Hb3DPHaOGIN+4MUWoZY7Xw3qFvfQl17hnjtv071P56BNnmGeO1OOIN++q17hnjtccQb99Vr3A547XHEG/fVa9wzx2uOIN++q17h/DtcMQb99Vr3A546uVocz2f5ZoQoGkG/cG4t7Alx1//RYP6wk+63PTl8wzx0taMvEFpRuwSbf8/t1/h/hUbsieEvtqU47IHhAbt7UbsieEFYijEDwgN29qN2RPCCsRRiB4QG7e1u7InhBXEUYgeEBu3tRuyJ4QViKMQPCA3b2o3ZE8IKxFGIHhAbt7UbsieEFYijEDwgN29pdRLniW8XFGIHhAbtrttdlRPCFuJeCJ8XC7t7RvURPCCsS7G0DwgN29qN2VEwuPpNTiB4QG7e1G7InhBWIoxA8IDdvajdkTwgrEUYgeEBu3tRuyJ4QViKMQPCA3b2o3ZE8IKxFTEDwhd29qN2RPC4KxFGIHhAbt6f8AD05Yd0P+D76I3ZKUsPdwEH2zYHRys/0lUADSavrBA8JtaAVEstHP+stdq7Ddl5KOzsdn8P8AK8/JPNzX8cuZlz+I55IOefxy5mXP4jnmDnn8RzzBzz+OXMy570uGky5Jlz+PLmZc9F3g55h1t3/E6XzKteX8cuZlz+I55g55/Ec8ky5/HLmZc/iOeYOeetiq7aKb/wDEeuqOgmg7ecI+tikNKwwKf/KWXMHPMe1BF/g59whr/wAb3HaF7f4f5XZHZ6fxdmbD8XZmw/F2YbH4uzNh+Lsw2PxdmbD8djNhFUtlstlst6uzDY7CztdmbCWy2Wy2W9hsYbH4uzDY/HYw2PxdmbD8XZhsfjsYbHRTrvxgTTVbrd68Xx3/AEZYPqLVPvgQWq0CgJsYTd/GUvZpwcEOyjz4HqJRFXdf/Aa7Y7PT+LszYfi7M2H4uzDY/F2ZsPxdmGx+LpTY/F2ZsIblpaWlpaWloqmJRLS0tLS0tLS0VTEolpaWlpaCvrsZsOl97sw2Px2M2H47GGx+Lsw2Px2MstWio6O3Py9IJGg6EPO0UBFgj6T5GCc5z3/9j1Jf9ZKyhDeFlZzvP4P4f5Hj5l7ea/iuOYuOfxXHMXHP4rjmLjn8VxzFxz+K45YuOfxesLh4i9oeq45i45776LjmLjn8VxzFxz1UvtXHMXHPR2TZFZ2KiXpXLMOfxXHMXHP4rjmLjn8VxzFxz+NrccHS7f7Q026MMfOTAQWZbF0Ms2MFrH+MDrXae/8ASOKuDmOBLZ/H+H+BVuiL4S22ptjsg+EFuntVuiL4QBiIsQfCC3T2q3RF8IAxEWIPhBbp7Vboi+FwBiIuIPhBbp7Vboi+EBMRFxB8ILdPardEXwgDERYg+EFuntVuiL4QsxcRcRcEFunsCK3RF8IAxEWIPhBbp7XCL4QBiIsS100gt09qt0RfCAMRFiD4QW6ZvJXVW6IvhAGIixB8J5Tb2St0RU4gBxEWIPhBbp7Vboi+EAYiLEHwgt012q3RF8IAxEXEHwgt09qt0RfCAMRFiD4XBbp7VbomnBZsJrOcGIRcQfCaIAWz/LgjUiaWaOH++YQzA3cr0dLQSw/3Eobr/wBWO/4gfl/D/ArwxAr3038aJfuDzx2rxxAr31S/cH/HtXjiBXvql+4PLHavHeoFe+qX7g8sdq/4QK99Uv3B5Y7V471Ar31S/cHnjtXjiBXucus3zcRPYOOnTeoI6VZFv3E4cS7qtEVtgr3KoWZs8xct66rUWiLwxBSXl0S/cM8dForlEF/4SqPMvLp4bwW7HQHSiG0GHYMQV5dBXN2Dzx2rxxAr31S/cHnjtXhiBXvql+4PLHavHECvfVL9weeO1VbI8QN1bN11t6PTc/2sq07df/kQfB0Cg6Xd9GZwxwi9RtvD/tFLF1V/P+H3GzMXGrAr46EdcirmPRL+IZaMszLMxw1YFfHQL1YlanRL+IZaMszLMxw1YFfPQL1YlanRL+IZaMszLMkcNWBXz0C9WJWp0S/iGWjLMyzMcNWBXx0C9WJWp0S/iGWjLMyzJHDVgV8dAvViVqdEv5hloyzJLMxw1YFfMoQ72IFkWDT5hloyzJBOZi1YuzxHSQu7OUm24L+I9W9GWZlmZxamOoNFzdtHe9Ecd/kMtGWZh5lpRqzd8mhMNlsFWnRP8Ja66M0uIQby/bVlHlXQGy2BSSJSaCaNOjBrWyVreb9NWfx9I5MHcTUxL+YZaMszLMkcNWBXz0C9WJWp0S/mGWjLMyzMcNWBXx0C9WJWp0S/iGWjLMyzMcNWBXx0C9WJWp0S/iGWjLMkQGqT3SMvU0x0rodQrUoCL6KXP4eE5vS2v/1MT/CGWjD6PTOMpqrsS9Ts8np+v8fuNGImNGDfx0Qa5V1Mei18QM6soxKMRMaMG/noNaMW9DotfMDOrKMSjETGjBv56DWjFvQ6LXxAzqyjEoxExowb+Og1oxb0Oi18wM6soxKMRMaMG/joNaMW9DotfEDOrKMSjETGjBv46DWjFvQ6LXzAzqyjBKMEcNGDfzEHeU0bRXoQBP8AmqFN9WUYiXiLHhAOreogkKC0olEACpoaMQG7vKMEoxD2aMAfiVpCjRjToRE1JDOrKMTxSnGjMmJRVSuiNbdC18SnOrPBEVtD0Ms+YhJTQxraBnBgN9TKVtPBEcaMB/xlJptCLQgBtFr5hlqyjBKMETGjBv56DWjFvQ6LXxAzqyjEoxExowb+Og1oxb0Oi18QM6soxKMRMaMG/joNaMW9DotfEDOrHdQIKow8/aVAoFbQb+IY3O3XBllzeaPPlhKhNnTx6Fr4g2r5cJ78ZzKSsNs/f7fxe7uNRnUYEhJyR/jBv30X8aLXuH8O1/jBv31WvcM8drjiDfvqte4fx7XDEG/fVa9wOe9dqcd6g376rXuGWO1wxBv31WvcMsdrjiDfvqte4Z712i9GIannr/lBXz2bUcMQb99Vr3DPHa44hreZXRa9wzx2M43WoN++pxvN93rtccQb99Vr3DPHanHEG/fVa9wyx2uGIN++q17hnjtTjvUG/fVa9wyxCS9XY3YR1Ph6tBaZH+h5mpU6aaOA5ZyTeY+eg3KoqVTk5l8bNjdnzoNv3fxO7jHBDAZaiZdaNXE8JbbUpx2wPCF3b2o3ZE8IKxFGIHhAbt7UbsieEFYijEDwgN29qN2RPCCsRRiB4XC7t7UbsieFwViKMQPC4XdvajdkTwgriKmIHhC7t7UbsieEFYijEDwhd29qN2RPC4KxFGIHhcBu3tRuyJ4QViKMQPCA3b2o3ZE8IKxFGIHhAbt7UbsieFwViKMQPCA3b2t3ZE8IKxFGIHhAbt7W7sieEFcRUxA8IDdva3dkTwgrEUYgeFwG7e1u7InhcFYijEDwuErn+L2hte7ddQsxc+3z4lMB7f4PB/SD36oBWIN4TUmmEIa/8PtGK75f/A/ifh1xUbDcl+I7DZnLzPPzX8cuSZc/jlyTLn8cuZlz+I55g55/HLmZc/jlzMufxy5IOefxHPMy5/Ec8ky5/HLmZcv45czLn8cuZlz+I55mXP45cw2tjhaOn+mU09vL0BEANVYwbXJPj/f/AIlLc/8AZv8AWABRoHQfPAj3/rT/AIm/0/7m+/8A4P8AE/H/AGgc2iWYpyQNFH8XZmw/F2ZsPxdmGx+Lsw2PxdmGx+Lsw2PxdmGx+Lsw2PxdmbD8XZhsfi7MNj8XZhsfi7MNj8XBAcwKbvBz/wBYaEBwdN4asBSyo/5Dwn9kkP8At1G1HI8EqcBqwsbv8nt/4f8AE/JMiCL40tWDQWnNfg7M2H4uzNh+Lsw2PxdmbD8XZhsfi7MNj8XZhsfi7MNj8XZhsfi7MNj8XZhsfi7MNj8XZhsfhdd7sN2McR6T3Nh01CX5T/eZRjXbcH/1n9MEHx46KBa0RbrXLKWi14N2Xlo7Ox/4n8T80v5EWJRsNyHQa7HZ71xzFxz+K45i45/Fccxcc/iuOYuOfxXHMXHJ+K45i45/Fccxcc/iuOYuOfxXHMXHP4rjmLjn8VxzFxz+K45i45/Fccxcc99Jcdhx7m5p54PUXHMXHMs7Rpw8/wDSKnh13vE4/wATavqH89FlQRr4Ofc05/4nuNHL/wCL/E/NL+Z0+xLhPzahaGzqrdEXwgJiIuIPhBbp7Vboi+EAYiLEHwgt09qt0RfCAMRFiD4QW6e1W6IvhAGIixB8ILdPardEXwuAMRFiD4XBbp7Vboi+EAYiLiD4QW6e1W6Ir4gJiIuIPhBbp7Vboi+EBMRFxB8ILdPardEXwgJiIuIPhBbp7Vboi+EBMRFxB8ILdPardEXwgDERcQfCC3T2q3RF8LgDERYg+FwW6e1W6IvhAGIixB8ILdPY2ps9P/aE7q13TF8Jqa6QGPt7bwy9wwFFr/zv+sAhAoBQdLm7W2UuBpwcECy3z4HqJRSruv8A438T81v5nU2kcQgcwxP00w6L/jAr31S/cH/HtXjiBXvql+4PPHavHECvfVL9weeO1eOIFe+qX7g8sdq8d6gV76pfuDz3rtX/ABgV76pfuDyx2rwxAr31S/cHljtXhiBXvql+4PLHavDECvfVL9weW9dq8N6gV76pfuDyx2rxxAr31S/cHnvXavHeoFe+qX7g8967V+6gV76pfuDzx0ZKA3WW6tz8vXxAhA4i8cQwp2rQlr9/0tj+sM5+G/py+Yl+4PPEs6v4pZ7BhY38zz/5D+J+a38ztWSRtyPcoab2dmH8OgXqxK1OiX8Qy0ZZmWZjhqwK+OgXqxK1OiX8wy0ZZmWZjhqwK+egXqxK1OiX8Qy0ZZmWZjhqwK+OgXqxK1OiX8Qy0ZZmWZjhqwK+OgXqxK1OiX8wy0ZZklmSOGrAr56BerErU6JfxDLRlmZZmOGrAr46BerErU6JfxDLRlmZZmOGrAr46BerErU6JfxDLRlmZZmOGrAr46BerErU6JfxDLRlmZZmOGrAr46BerErU6JfxDLRlmZZmOGrAr46BerErU6JfzDLRlmSWZI4asCvnoF6sStTol/EMtGWZlmY4asCvjoF6sStTol/EtFXjPqE9B1kECio4asdUCtDdwEENfZbSyuX+k0jqaTV8GCJWpL0uapPD/rF/wDtM4qdj/5P8T88qktjRP7aT+2k/tpP7aT+2kcpM3qqakXJuRd1L3BOj/OK9D+c/rrFGX7K5fzlY/5Ssf8AKVwp/wAwVl+z+usEaP8AOKtD+c/rrFGX7K5fylY/5Ssf8pXCn/MFZfs/rrBGj/OKtD+c/prFGX7K5W/5lY/5Ssf8pXCn/MFZfs/prBGj/OKtD+U/trFGX7K5W/5lYf5SsP8AKVwp/wAwVl+z+2sEaP8AKKtD+U/trFGX7K5W/wCZWH+UrD/KVwp/zBWX7P7awRo/yirQ/lP7axTl+zJb/mVh/lKw/wApXCn/ADBeX7P7awRo/wAoq0P5T+2sU/8AbK5W/wCZWH+UrD/KVwp/zBeX7P7awRo/yirQ/lP7axTl+yuVv+ZWH+UrD/KVwp/zBeX7P7awRo/yirQ/lP7axT/2yuVv+ZWH+UrD/KVwp/zBeX7P7awRo/yirQ/lP7axTl+yuVv+ZWH+UrD/ACmCn/MF5fs/trBGj/KKtD+U/trFGX7K5W/5lYf5SsP8pXCn/MFZfs/trBGj/KKtD+U/trFGX7K5W/5lYf5SsP8AKVwp/wAwVl+z+2sEaP8AKKtD+U/prBScgrmpXFu69ZWP+UrH/KAjbFvHlxA3PHB4YJGb72srmCNH+cWCDd1hP/AcwurpsI5Rfmk/vpP76T++k/vpP76T++k/vpP76T+uk/rpP66T+uk/rpP66T+mk/rpP6aT+mk/ppP6aT+mk/ppP6aT+mk/ppKwtDV+WJaE1V+H/wC7mZMQmq8iIXEuYegsw3XbREQxR1CZYB2qmbp2UjqEywDddsZmbsJHUN1gG47czM2SOob7AO2ZmZu0mdYd2Qax7d3d3aTOsu7IN527u7u0mdZd2SdJuWxGJbEOi7tJnWXdkm87d3d3aTOsO7JN527u7usJnWHdkG87czM3aTOob7AN525mZsEdQ3dEg4DLyMbvUzRhrX/E5ZaOltY3lwf5lNqQKCEBlR4nMuGl2PEsN+GhH6xuv/mO7uq7u7uzMzIiIiIiKgsF0X+IIBWfl7u7nd0hvH+Msx3biwkF2vaxEQ3adGBJISJBfr2sRENunRASSHSAt17W7u23TogJJKRALde1MzNt0iwB5JyIBbr2pmZtukWAPJORALde1d3dt0mwB5JyIBbr27u7tuk2QPJORILdem5bEIlsR6Ltuk2QPJORILde3d3dt0mwB5JyIBbr27u7tukWAPJORALde1MzNt0iwB5JyIBbr2pmZtunRBIUAb3NNZda6+krF/uFusSXzaKAju6U1D+DggQNaf5nL0tt0id4AP8A7NxA3eAlgAb5/wDnO7u67u7u7syIiIiIiM3qojW/+I5p5FKiW4+YGGTvy5mXP45czLn8cuZlz+OXMy5/HLmZc/jlzMufxy5mXP45cky5/HLmZc/jlzMufxy5mXP4KwBLtCftgAUB66FlDY5WAgARbF0DLNjRaxt4wOo3U5OJPaxXdlAeLL3/AO0LpUDbZVtHBBu+52YbH4uzNh+Lsw2PxdmbD8XZhsfi7MNj8XZhsfi7MNj8XZhsfi7MNj8djDY7ygp86QXc/qPmOzDYmslbXavlwRUt1KNLBn+sMZAbuV6MlA3WWrPLyi2a3sOZZv0cH/t7ctNjuQJALbg9rszYfi7MNj8XZhsfi7MNj8XZmw/F2YbH4uzDY/F2YbH4uzDY/HYw2PxdmGx3aTOf/wCsceRD/wCdHZjQ7Dd/2sq3Luf/AJEC89AoOj91Ku7W3+8taf8ABCNicv8A7ltG9IKI2p2OzNh+Lsw2PxdmGx+Lsw2PxdmbH4uzDY/F2YbH4uzDY/F2YbH47GGx+Lsw2O3TXhhNMWNuersy80xb0OmOwgQJbeJUqRa/+o//2gAMAwEAAgADAAAAEAmhWBPYGg2hvYGYWon4nYWrjPOI3QgDjsvvusjsoggjggggjgggsjstvvsjjgADEMPPMisvrtQQ9/5krqKpLp5LJoaMxeHeZMx2jeROQWh25mYWmLStBiASPuimhggustjz+stiRestjz+stggiphvvhkMAACzC/Diz2yQSj2i8kLKGWmqWVjYHrCPeTutzwtoRfMDU7xhlotazc/WRcdcaVcXcbXcTcfvsTcbXcTcaVcecSRfcTVeyys4gv/AIGOPsmomnvotFfJ4pPdGozpnYHIRon8jsRtfIZmaCcjrnj37gpv8A9IOL/wDSDj99SDj9/SDi/wD6gnrz7nnstkglQAG8sytkw3Adwnu/mer2h/YDA2h+ZGQWg34nYWjcZlfQ4Agz/v8A/wD/AD//AH30H333kHHHHEHX330H3338/wD/AP8A/wCPDCSC+uIAgw8sSHuJBTHLybke7aEz9aP5E5BaH7m5Be9kFQ//ADwz/wD/AD//APfcffccTQAABDTDDDDSAAATccffcfff/wDP/wDPDOS2+OsAQ08m2+LBP/vSuph6jHGdwMhGiH6G5GhmXfTmp6y2/wD5jy/fQAZQDPfefPJTWfPJTWfPNffTAGQQffRDyv8A/bLYJIYrgAA87/L7HGbe8oUlwqbqByE6J/JyEaEs5y2h36oYNetXy0lWkVnWkX2tapb+papb+papb0lWmUFWkV3ylesMpL77r8pbzjWgY4clWuMKuoEXndkFod+J2F5tZuTLBx//AKDj99V9dM85Bh++Tyj/AO0sos80sov/ANPKP75EHXwy32n31IOb++54r663yvyz8NUFNKor7kQIRofsbkRz83WgUpz/AP8A/wA33mED3zz74L//ALzCDDDDWDDDDyDDDDCz3/8AwvvvPPQEdfTf/wD/AP8AgktvvAEPLKvrgU5q1jIb4j+huRoghfij4n8v/wD32GEAzzD77/8ACzDDDODDDHaPbTn+LDDDODDDzC//APvsfDAEUfff/wDa8MLbIoBDzJL4sEr8uEoF+J2E6R0ZD0EEf4Mr30DHVzwU4v8A7C62DD6y699AkYBFkMY992y2DD6mC3/HOJ8s5hB99GD+vDKOIIAPO/W+5WCvaH8mZheLm+oyw0+6D+LRF5BJVqW/qKW6DW+6E9IUgEcsscU9oQoE9I2+qD2qCW/qWplB1JhH+D2+qXqW889oijD43XH6g5GXOlJE7+Me/wD0k4OQbQYfv09ogw7isvfUNKAQaOUAYaPHAQVMIPfcAngw0so/vkQXQdUI4v8A+54r663yPxJNhxfo5Ua82KabfoL7/wD/APSeQRPDPv8A+PIMM/0z3mEHAEEEHglFGnwEEEHAFHX0z08MPJP/AP8AjfCAdRff/wD/AOC2+K4Q8o2UBDdhu4V+QuStCC+//wD/AGEETzzL/wDjDODd99ghBBB8Nd99wtt99w99tNsBBBRQ99vDODT/AP8ALzwgEH3/AP8A/ggvrrANPEnKwYWnGO0G8Kqgusuv/RHdXPBTi4w+suvfQHNAQfNjs98s+zjs7xsw2kPAQeLAPfdstg1xzi/PObSff9ktglhkNVPMyWQZ2BBSkilSilqgg16VYFVaFv6ilqhyFIGAFPOEOt78wzw16w7951+3CNPKALEKAA1qhlv6lKaUaVawwlqhhiVKAAiC/Xd1iuarQogg7g4vfRTXfPk8ogw7gIOQbDHPfRN31thw4/vk649gr04PfbDHAdUAHgw0so/vLXSffUg/gwkglQNEwY60gj8oABiqgh/z/wD30H3zz78IMMP0z2EEHz33/bM4IYymRwRTkRQIpPL/AN98BBR9M9DDDC/+889B99/P/rCWGKAU8s+qCsWdAAWiiCX/AM//AH0Hnz7/APGDDH9w5BBB49/6CP6A+0Bcg8s8UVwyPC3/APdAQQdcPawwyv8A/wC81B99/wA/6wlkqgEPMFvvsvSwAJDng17gyvaedafvx3tg1ZjCAQeICPwm85yPJfFAxyFLWdu85wvxENAQRDGKw+riv/lcdVfRg/qwrjmAAB/Y/gF/qKFAP/vvi/i1VaQSVqlv/qrhPfKFKBCA16ww9IXNLNiKHPJK4w16wxKFKFPPSFlut6lqhSVaQR7k/vvvwqEFvK1/h/YwAGcvg1+g4/abSafv09ng1WMIAQbCIPwrz34eGSAH7wDDOPrz3wv0AHAQUMJKw7uo/wD5UV1X1IP6sPqKUABN0v76ozwABYoIJf8AP99tBt8+/wD0gw1/TKQQQbPfygt0gYFNFS8wMEdPouwhv/TAQQVRPaww4v8A/wC8dBd99P8A6wghqgAPCFvtl+PAAFoqgl/8/wD30H3z7/8ACDDD9wtBBB89/vCfCAEcPMQAAEAAiCPCf998BBB9w9jDDC//APvPQfff8/6wlkqgBPMK/lxES6AKRigk/gyvfUcffPhzigw6hCCQeMNPfxn9zlg/x4FF32xgu7yvfeMNARRCPgw7ji/vPcYffRg9owhilAFB8SKvV9AgFKF6qtqhg16VQVValv8AqpapcARTgBTyhT6tccfOPd8tutdNf6hTygDSggStapZb+pakkGlWsOJbpZalSgALyt0FsAvwC0CAoK4qb/1CV3zxPKMMO46720DxwHVxSD7rsPvZI8O/r9ySzEGzwD31w54MdLKPzy32H39o54IZIB0DwcGcMFbhLygDz64IP7//AN9RB08+O/vDD2T999QBBBlhhqrTXGKeqzTGzCxhBBBw999j6DD/APxvvOAYfff/AP4MJ75wBTyLToEFOirTwDxb4oL7/wD/APYSQdPMP/7wzg09fQLSQXQSAAY2y47zySwACJDSRXQPfYwzh3//ALLzwAUH3/8A/wDghvurAPOFlIxg+FC0vF+Nfvkstv8A8Y0klH00n/8AG+2DD6AIpBskI8x8o0LTQQM88UYU19EA2DD6uK/+HN9gFENK/wD+ssvvudK/Ih6MOW6VAwolvXPKlglvqw/qQVaQaVKlv+qlqgxmFKNBVQJNOBCCJIFaQAFHLCg1qltv6lqBYVaQVfg1/qhqlvLHaEgw1RJPxqjfim8lQFktng92g4/fQTffPE8o/wAuY55sWSjwH0iihFWQxyBUwxAUO45od9PKPzz01H31IOb+O7qCoCvCcbg19n5e9YHa5IywADYooIPc/wD/APfcQUPPDP8A/wDvSDbf9MLDBFUt9t5IhBBtsbHDDy//AP8A4zzzAGH33/8AP/jCGO6AAcMifinKfRK3mBB+u+8oAA6+KCD+/wD/AP2G0kHTHz778L++uniNv3lT133UCV/3HhOd/wDC/wDvvMeIBXUff/8A/wCDCG+2AAc8+R1EcJiy+6GKBRPfn8I5gA+u6y2//GHL9Nxx188FOL/73y2Jj2AUBBgGaNJ6iK//ABzifPOccTfRDyv/APrLZ74BDVzxuVr+MMMd2hYcONWnXv6hQkTypYpb64v4NelXz3mUnGlS57e6aqotapa7eoaYotJahXEVnX1ylWsPod76oapbyhWhT65kFBbn32RBus78uQ2u5JvJcBJjJIIO467/APSxhtJlNd0sJJl++zaXCCXSB+sVGt84tNZFdQxj/wD3jngwospIgI8J4XFUnScBoJIQEMbk/wAvFHa5o6wgAAz64oL7P/8A/P8AfffWTQQQMeMMGD0kgMBcMMMOYQQTYffffT//AP8Az+CGe+OAAE8MmH4qVbaf5VF5sAB+uT3DBB2+W08MA8Q2+uGCDz33/wD/AP13X3k0FwgAA0gAAA0BDQ0E333nn3//AP3/AMwwinvuorADPONBuyR1wncGCeWUBcdfPsgiiwaQ20tB/PQEjRiigustt/6u0/8AkoEHX0UG330kEnDEg093cINb/vrLYIYYoiID3wvyKgFVESIb2TA3RhhelH3mhY4YdOkAMdureiBSgEBYrY57r6pp/wDfbKXX7vy5XnzKDHTTejH7viW+2qO6GKCBUoQU7WjrGx3+CG5kgdlgYEgn9tMAdSzT3CncR2TnP8sDudAyYygOKmOeDTuOu/7+Pu//AHr7v37jvow7jmhjkspMgLfE3PD25Qoj/ounuSJWRZHGRZVBwkLCJPPjkzzwQUT/AI7LwwwgACTLL75o44ILIIMMP4MMMP4MMMLIII46777rLgAAQwTjI75isSm4OB/lgXlmyA02QtryIoDQEDDy5bP88H1Hb47bDzwwAAABDzL774K4444I4444I4454L777LyAAAAAzzzDo77qcwM2KKf2RA3FhyTFGTh1gpXwjsEkhCkRsvMb/wABBpDLOaLCLsM181AApAEyyJCAyyBCEyyJAVAA587McHCHmOHDVlC/Ff8AoJvZIHZVGBJWYdGZYmauTHTzGEIDDGFonjy14TQVaXYXuqkv7glvg/qlrg2qFJg3qlvk/qgnv4ltrk7FaQTVgITSq3m9yr254ul4/wBJrF1to6+i3WWLf3w2HX2XO/LKPN8oBgyDDGDDA8946ZPNI6KBBI6LONo648/TBDHBAyUAa/cPfFkMoFyX2FiTg2F2BjRgT2QaPj8cePY4KHCwgATT646LP+8/EEEHE/b77584447I4447I4446/777o3MEEHE9/8A/wA3HNaI3cGBeWHJEWZOGZeDJJ/o2D5MmT4XfgggMPACEPPLrig8/wD+888EEEEH3/777/8A/wD/AP8A++//APQwQQQTz3//APMMB0zf+AT2Sh2FhiSFkThkWhwSH//EACgRAAIBAwIGAgMBAQAAAAAAAAABERAgITFhMEFxgaGxUdFAUPBgkf/aAAgBAwEBPxD8ZWK1MvJvSZ0EoEqQt/aPsBZ0IIIIIIII/F0FprCMRghtIidRKcIhasv0Nm5ds2zbNHPCGPDpNs8ebZtmzEvKFkiCCCKRYxJ8a/8A/UNihsDWlmbgfSNIua/Q2w/Qlhu5um6b5vG8b5um+b3o3vRv+jfN/wBG96N70b/o3zf9DyXkeSsG/wCjfN/0b3o3vRv+jfN/0b3o3vRvm+b5vG8b5um6bxvG+bpum96N43zdF8puejcNw3TcNw3DcEXIkhqHZqpJfiyjOhZfoY8hucIUCVS8IlWguLFsWxbHHi2OGnGUQ+wZJKI/FNS4H+zTLEoEiT/yNaX++dRqhVLGp+F6ZYpmYRhFhDcETqJNuEY3P0Nt5f8AgGshM+ovwNCSxC5/4PQYS5sboGqeWk2zbNs2zbNs2zbNs2zbNs2tgPAtnjNRkRk/Q2aWNzoJQTrQRPhYVHRVdFV0RgwOiMGB0VMDoqYHRGKOiq6KrorVV0VMDorNAQ3xpxdSYH/F+akhLnr+PsY0uyOFFsWxbFsWxbFsceLdDi7aWWSJvA0+ENwROoxoRK0Zfrp9jc8fl+Ty/O0OJoTInDn8DWQb5ISH9AlLk+/8RocNXgtTJqv5G23LJnCEoExoL2aZYVZtm2bZtm2bZtm2bZtm2eFNuhwhCYYz4I2lRBDLX8ff0MaXV0VXRGKOiMUdFV0VXRDMDoquiq6KmB0RgwOiq6K1VdFZois0KtpJYtyPM6DcCU5YxoRDDV8/X3dFsWxbFsWxbFsWxbFsWxwot0LdCi1yLw1Y8kHyISgflohMcn3xOX+B0v7lboCMVqObh+43zZM6CUISlyfY/o4vL/A6X9ys0EwDMcENwa6iRC+R+uv0MaXZNs2zbNs2zbNs2zbNs2zbNs2zbo1QksQmf+EIeiJgS5sY0IaY6vn6tdFV0VMDojFHRVdFV0VXRVdFV0VXRVdFV0VXRVdFaqs0RUVyyxjyw+aQlBqnhGHQV8WxbFsWxbHHi2LYti2LY4WjZqan9yEqeEbq/Ycv0ehWG9RKcIyOr9Dbbl/5TQqxoQ0WP+zV4U2zbNs2zbNs2zbNs2zbNs2zwtGsqhYQzVFV2uitRgwOiq6Kroquiq6KrojFHRGKOiq6KrojBgdFV0VqqzRFZq8KLYti2LYti2LYti2LYti2LY4Wjbrf5XQs1ca37Ll+j0jV1VAHhmrwptm2bZtm2ePNs2zbPCnhaI0JPCqzVFV2uiq6KmB0VXRVdFV0VXRVdFTA6Kroquiq6IxYquitVWaIrNXhRbFsWxbFsWxbFsWxbFsWxbHC0bdb8Tl+t5fiaX9yt1PxOXH5fstL+5UY0KurbPCm2bZtm2eFNs2zbNs2zwpt0DVaIw8iuqIxR0VqpgdFV0VMDoquitRijorsGKqroquiMGB0VXRWqroqYpGrDQ3yVdS2OFFsWxbFsWxbHCi2LYtjhRZDc+Pv6HbmxucISiup+Ty/csaEQw1fP19kjtqJckfQ11P8i/oEpcn2NwROWK2kGu1YhYVdS2bZ4U8KbZtm2bZtnhTwptw6C9miWENwJc2OYQl7QhIVWagquiq6LgOiq6KrojBgdEYMDoqYHRGDA6KmB0Vqq6K1VdFWGev4+xjSyZwhJIZm8IWmVgS3qWxbHCi2LYti2LYti2LYti2LYoxoRK059BucszoEowh+D2FZOmv/AHO3U/xj3wNU8vyNwROoxgnS8v0Ir1/7nbqf4uZaCJ8LCG4EubHsBC4/6ISFZr8cm2ePNs2zbNs2zx5sSr4RrSxvkhKBpOiEsJQhKLdex0FwlTA6KrouA6IxR0VXRVdFV0VXRWq1VdEJS4R3X6Gbcsl6BKNB/wAX4FJm/X/udV54sY0DUti2LYti2LYti2LYti2OFFsDWhDTH/v6G4IeoY3CIXOTEdfA1/7nWBDDJC9P8NGl4RKtBDcCU5YwBGnX5FpC4Ov/AHOsECWFj/g/4RKX8saG+SEoHGNBSwtBJJQuFr/3OsEU4kT80a8GaT+JNs2z+JNs2zWF8j/tfoY3LG29BJIb8AQilcTX/udYIEMkiLKyN6CqHaB0FuqdR1UdR1D3HUIdR1D3HULcdR1D3HULcdR1D3HULcdR1D3HUdR1HUPcdQtx1HUPcdQtx1HUPcdQtx1HVR1DWhErWz8/RC+SXMLlRnlc/AjNrJOxOx0HQdB0HQdB0HQdB0Gr/c6wQIoUEbCNh2CSIGvz2O47zvO4jcdx3HcdxG47zvO87yN53ned53kb/B3ned/g7yN53nf4O/wd5G/wd53+Dv8AB3kb/B3mHr3MvXsd5G/wd53+Dv8AB3kb/B3+Dv8AB3+DvI3ned/g7zvI3ned53nefKQRKEja/JD5c+B/kJk6hXiDt8nb5O3ydvk7fJ2+Tt8nZ5Ozydnk7PJ2eTs8i+UeawRc0khkpMaP3JMcgbhyG4whczHMISmBCQvzEGocft1SfkMaWNCEoElpMjRyQl+H/8QAKxEAAQIFAwMDBQEBAAAAAAAAAQARITFBYfBRcbEgYNEQkaEwUIHB4UDx/9oACAECAQE/EP8ANWTghkxeg8+PRhEZoly5VRVTQeTb3QyEzM1P3Mh0WnVeHhOA8jf/AGkgHKbO718eVV7jt5QIyTiAIADifTa6nbQXmaNNDQBgP8JOdgEDncH7JGm7Q2KgPYodj9ICDGNTqrHKscqxyrHKscqxyrHKscq1yrXKtcq1yrfKtcq3yrfKlBH5TFDGt7IEBDnWKLpyjQ5IM4cxRdphpH5v8C81b5VvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+UTwTrFA8U6xVvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+Vb5VvlW+Vb5VnlWeVZ5QNm5QYd2QPDZ+0BnCG5VrlW+UdD0qdemRlf8FSKAnjtT/LXQoJgEGRQuT5t9H7OgwJ84+rSw0Hya/ewCw4KJG45fCf/uKjcek/K9MjK/XAf8HyUYzBU8+EBQKG5EvNED+egban4FdEIb8jU7/fgul6hsRVH2ZUNwVPyvTIyv1TojAJpcKnJBC5mvTZAinEAR0VgFrv7J8B8m1QCAMB2AxfbUbItE5L8peSIA4LjokZX6j3W5OyBsIHt/Twmk7mp3QdEo0BBHmMgJnbN0NUJUDybyFNewxc8qiU+vw8J7Pkb+sjK/THMjp8pxjUDXwPk/KChsAgAiUXIoZ8IuTTaZonD7tf0NBb3fsSblfQL3d139ZGV+kWrIOI+2p+E4uLTbfU/CAdQ3Il0T3mq/TUbyF0xH+3Op7Fm5XpkZX6B6RgExFqja+gtX4TyEaz40CBFEBAImOwCnAsVO+gtM10QABhLsaflemVlet9+wqVJW5DU3/4ggTDndCoougEFAMSkBM5UyFUFRiJCnkb+zdkT8r0y8r1CPxum/hPFLGlT4FkNAYBACIoklFgXr03eJmwigkTLsycgLDnsmflemXleglolTtk1H68/wDUdH6EeTf/AKgCZKEk0TUox61erGzR6NSYZ89lT8r0ysr6k5mATemr/vhMqMpnJBOIsgj82Cnwb3jjy0AAEB2XPyvTLyvo5p6BO2wp5QGFgEKii5NIBykBM+Bco4DvRoNr3nsIdmz8r0y8qq48c0UyJNPPj/iAADBMIjNEuYogj1Gg31Nvdk8GZTJmc0kOzp+V6CQA5QKONTnKrxx28oAmScSTRLRKliu1O2gv7aoCGwH+9vpt9ln5X1cmwUkw5HwmsRMz+U4jQj6csgUw1GEdpC/aM/K+sqIU8eUPDYBQBORTiCbTlT9nQXRw5f4Cw8zPaU/K+oDphPNG45VGH5DQeTb3QmEzM1O/ac/K+rIEADkEIYl8jH4HzshoDAdqT8r6hX/62RX2B51PwPlS8r2rPyvq4ffV+hpj+kvK9qz8r0y8r2rPyvTLyvas/K9EDQCf8yKN8q9q4t1E0Bl/ch6iIHIUvK9qz8qjEET0S8r2rPyvTLyvas/K9MvK9qz8r0y8r2rPyvoAc9ZeV7Vn5VCgBykMkLojuP8AAbeZn1l5XtV4C+poI82V4JmalOxMvWXle0yWiVKk2vXbz7aoqBD+oBEhPVLyvaTi2CEWLfJinvogKBCCa/1VEHo98pf1k5XtFpEykBM5rIKaOgUG178IkiIQIIpORTdWzPwmRNU+svK/cH+wGgn+A38TPyhPIuUycgLJyJkqIknqxoKlAEwhl/PKHBsOiTlezyW+1X6at5C5TE4ZPUoAA6ESrvHfwnmO9POgsgAIDI9MnK9mkR2AU3tK7tBaZrogAACYTzTkSpySqP15Q6/j/fSflemRlezBbzGQEybZugKcJUDyb0pqQCZIkQiaJiMBVMhas676CyrZUcp6z8r0yMr2XCN2lBcmg+TRPnXZn9AUGF04iyCPp2FTsgJIc/JvRNVYZPon5XpkZXso+oToFhqfgV0Xv5NSdSUKkdTUWR5yKdhAyGvgc/KGAsB0z8r0yMr2QESRgE8p/YPgPk2ExobAJhGZokRTiewebban4VWGLTbfU9c/K+pMQv8AMPIQ8ZwVIyvY7kfJsNUTEqn7HU/AuYoAmATiWaIjsBVNwLpnXwOfhOZHX4+hPyvQeQTWg+CmjMEx+exgEBOUh+zoL+zlEDt/iLDHNURCAghcVhzspGD2/Opy6YXuan6M/K9Ik6EiJzQPDNKD4PYhVPqaDybe6CFokzJmc9hRVJE7ASVaCkMkE+Bqf5oLodEwH0p+V6ZWVROBwVUvkbhDJXB7AJAiUYYm11O2gv7aoAGwCARISZVz4+TZTQE0P78KX05+V6QJFsithWwoxhEzqeCnBpAzFQthWwrYVsK2FbCthWwrYVsK2FbCthWwrYVsK2FbCthWwrYVsK2FbCthWwrYVsK2FbCthWwrYVsK2FbCthWwrYVsK2FbCthWwrYVsK2FbCthWwrYVsK2FbCthWwrYVsK2FbCthTASAmK5hQNd/EtXQfAEm0l0xAKI6la/jTdQLfjt5WwrYVsK2lbSthW0rYVsK2FbCtpQEG+R6ReEG6wisIrCKMA2ASId0BzINCdj7V9llFZRWUVlFZRWUVlFZRWUVlFZRWUVlFZRWUVlFZRWUVlFZRWUVlFZRWUVlFZRWUVhFYRWEVhFYRWEVhFYRWEVFM12d2UE7Wd3ZYRWEVhFYRWEVhFYRWEVhFYRWUVlFZRWUVlFZRWUVlFZRWUVlFNAiJkA75dAkYNJw28qQclJDkiAwD8o3Kq0/PhN4HaxdYRWEVhFYRWEVhFYRWEVhFYRWEVhFYRR1CHf6R4JwVAC/zeQQ8dwfsTp06f/IQzPwG/hCcZkzOcJ2JknYCSrhoNU7Vsy8ocGw/1x8DUUPhE4B+7nGmijsmAQQCYoiEQZE2Ts3bMCAADD/H/AP/EACkQAQACAgECBQQDAQEAAAAAAAEAESExQWGhIDBRkfEQcYHwscHh0UD/2gAIAQEAAT8Q+oeE8Z4T/wBOb0NujrKca2Nl+3odJfVR1ZHDXAbv/v1YBwkE5Viyyo7JwDKem03RZBVC7PhOl9TBbV3f07aMlTiX6QJo9DOfh/R/B4+2nbeT207bye2nbeT207Y8ntp23k9tO28ntp2x5PbTtvJ7adseT2U7bwXh3lSjT1NQBt5D3OnX3lwNjhY+z6MPpUD6B9KgfQIfQPqHnnhPMPOEXg5rno/6lOUWh2r+VnPwN39p6a+/1P8A5zM9wnscpLryEGl6l6/gZyNIpKB6j/o8uq+iYu9XH6vH2joTehPoeDyVimVxFi2Bx5KxTK4ixbAMnkrFM8EWLYGzyVimeCLFsA15KxTK4ixbA48lYplcRYtgceSsUyuJgtgceTgplcR4tgbPJWKZWiLFsDZ5KxTK4mC2Bx4XO4Ug8Q/F6Pb7Sn3eF7fr9t/eVTTv6ED6h9A+gfQhA+geaf8AuBUAteI17Nk29f8AiY7hWCh9X0IGs/Yez0H8xCmA4mhNXiZAdYC2lNOm3oZNU3kAPR49jbbvL3DZzuU/BR9HSkAWvCF8Nw8Hqet6/wCMZ3BY23quZROCaSIUwTiLSavHh0Jq8wCGS8Swcl2tygcE0kQpgnE0Jq8eHoIvMAhmuJYOa7WUDimkiFMU4zOgi8eHQmrzAIZrxmWDku1lA4JpIhTFOGaE1ePDoTV5gEM14lg5LtZQOCaSIUxTiaE1ePD0EXmAQzXjMsHNdrKBwTSRCmKcTQmrx4dCavMAhkvEsHJdspHBNJEKYJxNCavHhWk1eYFDJeJZOS7WUTgmkiFME4i0mrx4dCavMAhkvEtHJdrKRwTSRCmI4mhNXjwrSavMAhkvEsHJdrKBwTSRCmCcTQmrx4dCavMAhmvEsHJdrKRwTSRCmCcTQmrx4S6IMAydH1IFTWe6OvXc2tyHnqepKhD6h9D6BKhCBDwnjPCf+lNh0Q5MCP8AB16w6C6iY+x6sKm3pt9Vg3qAmVjPRKl1aJfJx9gcXxl8EK1za5D6bdOTnKKBaAMB9Nitf4D1YBRy7KHr6Oj5h/2oCgjjcKdTcGhpjXFSZeFpitcJvLa2xo3DOpjI0NMa4KTLwsYLWHvNxbW2LW4N6mIjQ0xnBQy8LTBa4TccrbFrcG9TETA0xrgpMvpaoP0D6v8AyCmD9A+p/wA+jTBa4TccrbFrcGzE3DA0xrgpMvC0wWuEzFbW2LW4N6mIjQ0xnBSZeFpgtYTOVtbYobhnU3hoaY1wUmXhaYrXCbi2tsaNwzqbhgaY1xUmXhYwWuE3FtbYtbg3qYiNDTGcFDLwtKC1wm8trbHG4Z1NwaGmNcyky8LTAtcJuLa2xQ3CnUxkwNMa4KTLwtMFrhNuhz+npG9DyH6V29Zbxc0TH2fRlQ3AgfQJzAgfSob+geAJbb1GI0dJ+/8AxP3/AOJ+/wDxP3/4n6f8T9P+J+n/ABP0/wCJ+n/E/Z/ifs/xP2f4n7P8T9n+J+o/yfq/xP1f4n7v8T93+J+7/E/cf5P3H+T9x/k/Uf5P1H+T9J/k/Sf5P0/4n7T/ACft/wAT9v8Aift/xP2/4n6T/J+k/wAleVP8xy9IMyIynaCMKvM61OiAQ4wGAlI5edzEFEQD+30NrH9w1X11OB93WWuLRWCCi4L7T1K6XuBoZws/Qf8AYcYaZb/0dYWw21e++v2hoy1d3/saC97/AGUjl53LRw87hcHd1joy1d3A0M4Y/af9n7T/ALAwLOD/AFDVlq7v/Y1F73+yocnO5YODncLg7uv+x1Zau7/2BkGcL/s/bf8AZ+2/7AwLOB/2GrLV3f8Asai97/ZQOTncsHBzuFwe9/sdWWru/wDYGQZwv+z9t/2ftv8AsDSzgf8AYauG7v8A2NS9XX/ZQOTncsHBzuFwe9/sdWWru/8AYGhnD/qEy+T2Pp/1Gbaddr6f9QMCzgf9hq4bu/8AY1L1df8AZQOTncsGyZ3C4O7r/sdWWru/9gaGcL/s/bf9n7b/ALA0s4H/AGGrhu7/ANjUXV1/2UDk53LBwc7hcHvf7HVlq7v/AGBkGcL/ALP23/Z+2/7A0s4H/YastXd/7Gove/2UDZc7lg4OdwuD3v8AY6stXd/7A0M4f9T9p/2ftP8AsDAs4INGWru41F70pHLzuWjh9YWB73+x05au7/2BoZwx+g/7P0H/AGBgWcDDRlq7v/Y0F7n+ykcvO5aOHncLA9z/AGOjhu7/ANg6GcL/ALP0H/Z+g/7BwJOBhqz1d3Ggujr/ALKBy87lwmPO4XB7sdWeru4GgnC/7P2H/Z+w/wCwMCTgYaM9XdxqL3ZSOXnctGyZ3C4Pd/2OjPV3cHQDhZ+g/wCz9J/2DpJwMNWaru40F78oHI6ytWBkFCNCOCD7HMsNJv2/yHwZ+k/yfvJ+8n6SfrIfHll3g/SrMPF/G/qWgHoAG8z9v+J+3/E/Z/ifs/xP0f4n6P8AE/R/ifs/xP0f4n6v8T9H+J+r/E/V/ifq/wAT9X+J+r/E/V/ifq/xP1f4n6v8T9/+J+//ABP3/wCJ+/8AxP3/AOJ+/wDxP3/4n7f8T9v+J+3/ABP2/wCJ+3/E/b/iIfubsftxrrDf1olr/wBZSPWyv/3ZbmCUT5RsV+n8wWL24oelutW8QMs0XRqjQvLlzVGJiLB+BDP4H5tzKcUXAgdtP3zAdrHuWn8T19Ml9heCDsp++ZbmCUT5RsV+n8wCDpjO3eAVdcY07woV+n8ynFHAPlB2w5+f0F+i/wCwdkOfnLMwSifKNyv0/mCQZMZ27wWWXHT3hQr9P5lGNmAfKDtht+f1EIdkOfnLMwSifKNiv0/mCQZMZ27wSrLjGneFSv0/mUY2YB8oO2G35/UQh2Q/fMszBKJ842K/T+YJBk9du8Eqy+zvChX6fzKMbMA+cDbDf7Ya1aTBIb1aDAIGyH75lmYJkfONiv0/mCQZPXbvBKsuOjvChX6fzKMUWgfODtht+f1EIdkNPzlmYJRPnGxX6fzBIMmM7d4LLrjo7woV+n8yjGxoHyg7Ybfn9RCHZDn5yzMEonzjYr9P5gkGTGdu8FllxjXvCpX6fzKLiLQPlB2w2/Ofov8Av0EOyGn5yzMHBPlGxX6fzAIOmOrvAKuuMad4UK/T+ZTjY4Hyg7ac/P6jGOymn5y3MEyIbFfp/MAg6YL27wGXX007woV+n8ynGzAPlB202/Ofo/8Av0EOymn5y3MUonyjYr9P5gEKmOrvCZVcdHeFAP0/mU4utA+UHbTb8/rWo7KafnLczSifKNyv2/mAQVMdXeAVVcY07wqV+38ym5fgHygbabX/AH9a1DZTn5yzM3BPlG5X7vzBIKnrt3gsqvpp3mGWKyp0c5I7BZGz7/Xr/MYAucNr11qfp/zP0/5n6P8AMM/09p+z/MqTQVsRn8r+4E5gQPD/ABv6n7H28Z/4zxOyRQBasAmuz6Ov/Hv6QHeDZgerME0qJl6HofRnNSYRmSKztOFHvTLzWGXd8ExD0gGrqnVxNYUQyuU2nqzUC1olguBZGgP+QsBbZn1H/X6jib1cp6ry/VnJSYTUShsiDsuAGiYgZWiMZLXLws5KGEzBwNkQdkANFTEDK0QpktcvCzkpMJqOBsiDsgBoqYgFrRGMlr4TOSkwmolDZEHZADRUxALWiMZLXLwlclJhNRKGyIOyAGipiAWtEYyWuXhZyUmEzBKGyIOy4AaJiBlaIxktcvCzkpMJmDgbIg7LgBoqagWtEYyWuXhZyUmEzBwNkQdlwA0TUC1ojGS1l4Wc1JhNRKGyIOy4AaJiAWtEYzWuXhZyUMJqJQ2RB2XADRUxALWiMZLWXhZzUmE1HA2RB2XADRUxAytEYyWuXhZyUMJmCUNkQdgwA0TUMrRKxsgP9RQAZ/kPp29Y2C1RsfZ9GB9AhP0fvB3P7+gZgQPD/G/qfsfaHhP/AE8N9jQeq8EvoRlGOn/rf2gG4HKM9H/UJH6Da+q8v0EIyhQBysZVwvu39Dt4Zutq25zZvry9eSGUYEUA0AaJRGS6IV18t29A5gIpkmvTfSdPmFjagUB4NCarMQjinMsDBNjKAyXQXAK5rmaE1WPDoTVZiEcE5lgYJsZQGS6CAVzXnM0JqseHQmqzEI4JzLAwTYygMl0EArkvM0JqseHQmqzEI4JzLAwTYygMl0EArkvM0JqseHQmqzEI4JzLAwTYygMl0EArmvM0JqseHQmqzEI4JzLAwTYygMl0EArkvOZoTVY8OhNVmIRxTnMsDBNjKAyXQQCua8zQmqx4dCarMQjiOSWBimxlAZroIBXNczQmqx4dCarMQjgnMsjBNkojJdBAK5LzNCarHh0JqsxCJUcywME2MoDJdBAK5LmaE1WPDoTVZiEcE5lgYJsZQGS6CAVyXmaE1WPDoTVZiESg5lgYJsZQGS6CAVyXmaE1WPpfRDRCmOOi3z/eOm/vKppwyoE/d+8/mf3AgQPF/E/qfpfb/wB1YuWF+A9XpA2c1fler/US0beV/p9oTECgCgPoL3rTt4A2rwGWd7/xNMA3V0bVrGOOWVt/QO+pn0rNzBTA5hx/oEaOsCu8j2Tl6/PkYKYHMxWyjL5OCmOSYLZXPk4KYHMxWyjfk4KYBuYLZRvycFMA3MFso35OCmBzMFso35OCmBzMVso35OKmOSYrZRl8nBTA0zBbK58nBTA5mC2Vt8nBTA5mC2Vt8nFTANzBbKN+HBNZg3+fUjnTkB7nXrv1m4Sw89T1IQft6z+dAgeP+B/U/S+31PMPGeOl23p/5nX29ZYCAYTB++s9ZAH+Dr1+uS4FJb6/yL8W4j3erIVwHKfl6BjCBCgXdXj0DB1bfqH0lJo6vL0ihhbzOgeh08ntp2x5PbTsjye2nZeT207I8ntp2x5PZTtjye2nbHk9lO2PJ7adt5PbTtvJ7adt5PZTtvEWd9jLCAz+hrt6x+i9oGPs+jD+3rP50r6h4f4H9T9L7edXmEWytAtX0Cc2A3dX1PTX3j6psv0vpBdgC79K6fV9M9dr7PYa59Fj27rQ44cK4B4Hz1Go+7yryuX6Fia0UBG161XXT9J1+JSsBwbX1XlnZHk9lO2PJ7adkeT207I8nsmdkeT2U7I8nsp2x5PbTsjyeynZeT207bye2nbeT2U7byeynbHkVtpjez6fxGmcBNF69ftuCqu7SpUCH0Pr/E/qfpfaHmHmj1bUwPqvEDuiZjXT0HdinLN/w9OsFAyv5DFi2BxHDmMAbVcBL9hOXOKNg/k8VtIO9ZI5dR9nregkICgCgPo74IBlXoHLASFoOer/AJhIQCgCgJgpngmK2Bx5KxTK4ixbANeSsUyjUWLYBryVimVxFi2Aa8l4plGo8WwGvJeKZRqLFsBryVimeCLFsA15KxTK4ixbA48lYplcRYtgGvJwUyuIsWwNnkrFMriLFsDjycVM6CLFscHkrFMriLFsDZ5JQaT3DW/UjsSXeH3jMOI/1AleL+L/AFP1vt5Z5wlC7Ob6Dl7Eyizgv1S8sR8VsaP1xGkC/ASycl2swwqTbwthPpLPdF1Ueiow0tMbcp+XFS7di69OT0Gvq1PrP91wSqBwOL0H9zQmrzAIZrxmWDku1lA4JpIhTBOJoTV48OhNXmAQzXiWDku1lA4JpIhTBOJoTV48OhNXmAQzXiWDmu1lA4JpIhTFOJoTV48OhNXmAQzXiWDmu1lA4ppIhTFOJ0EXjw9BF5gEM14zLBzXaygcU0kQpinGZ0EXjw9BF5gEM14zLBzXaygcU0kQpinGZ0EXjw9BF5gEM14lg5rtZSOKaSIUxTiaE1ePDoTV5gEM14zLByXaygcU0kQpinE0Jq8eHQmrzAIZrxLByXaygcE0kQpgnE0Jq8eHQmrzAIZLxLByXaygcE0kQpinGZoTV48OhNXmAQyXiWTku2UTgmkiFME4mhNXjw6E1eYBAuvEtHJdrKRwTSRCjQcZi0mrx4dCavMAgWXiWDku1lA4JpIhTFOJoTV48OhNXmAQyXiBuWcq/iOIRodZsTKB7/26+8wjc4DH59H6B4f4v9T9b7fU8Z5hCfZUS/pHTf2gz6CjoH9ELVtuuOj/AKjTFa4TmZW2YnWH2wTuO+BiN1sA2OkKxtxbmWIunLJyv6MHBGuCky+msgHz9v1Y7PJZK9X+voxgtcJuLa2xa3BvU3DA0xrgpMvC0wWuEzFytscbhnUxEwNMa5FJl4WmC1wm4trbFreIZ1MasDTGuCky9/C0wWuHvN5bW2LW4N6mIjQ0xnBSZe/hYwWuE3FtbYtbg3pmIjQ0xnBSZe/hYwWuHvNxbW2LW2DepiI0NMZwUmXv4WMFrh7zcW1ti1uDepjI0NMa4KTL38LTBa4TOXK2xxuCOszeMDTGuCky8LTBa4TccrbHG4Z1NwwNMa5FJl4WmC1wm45W2LW4N6mIjQ0xnBSZeFpgtcJuLa2xxuGdTETA0xripMvC0wWuE3FtbYobg3qYyYGmM4KGXhYxLXCbjlbYobg3qYiNDTGuCky8LTAtcJmLlbZjn+tRWV9H9St6JphrHLbt+n8faWRTonsSvD/B/qfrfb/zNzqh2sPJv7ft+r19vWVap9Af9ZScLtcnWDqqTctrkyj23jq5Dg/TQ7vJOc02+7bnq7TWMmDBwQfb+93BsH1laVstoJa/ESfT0jUyoM6T3gaqnE3Da2WLQvpCIdrnPEMJ0maOYNgzUNJYYOqhxOk950nvB1VNTcNrkxaFhAG1zTxDCNJmjmDYM1DSWGDqoTpPedJ7wdVTibhtbLFoX0hgO1zTxDKdJmjmDYM1DSWGBqobJ8xPmIGqpqbhtbLFoX0hAG1zTxDKdJmjmDYM1DSWGBqobnzE+YgaqmibhtcmLQvpCAdrnPEIp0maOYNgk1DSWGBqobnzE+YgaqnE3Da2WLQvpCAdrnPEIo0maOYNg+s1DSWGBqocT5ifMQNVTU3Da2WLQvpCAdrmniEU6TNHMGwfWahpLDA1UNz5ifMQNVTU3Da2WLQvpDANrmniGU6TNHMGwSahpLDB1UNk+YnSe8HVUm4bWyxaFhAG1zniEEaTNHMGwZqGksMHVQ2TpPedJ7wdVTRNw2tli0LCANrmniEUaTNHMGwZqGkwYGqhsnSe86T3g6qmibhtbLFouGA7XNPEIo0maOYNgzUtJgwdVCdJ7zpPeDqqcTctrkxaL9IYDtc08QynSZo5g2CTUNJgwNVDYz5idJ7wdVTRNy2uTFoWEAbXOeIQRpM45g2D6zUNJYYOqhsnzE6T3g6qnE3La5McC+kIgtd/GpcAGOvxBsGahpMGOggq2D7+pAhT6r/fv9D6/wAH+p+t9v8Ay52w9EXqv9bmBgUD8B6HSVK2DT/iQCXUAanSe0SHsAFtX0jVFXa9xSZT3dMjptTKTw8eho68ERqTBfJCK9rjHEGutxnL6BKrYybg6+thBgL9tfafET4iBuoczcFJkRLKhkekwXzDC9rjHECipqC1oEDdU2zpPadJ7Qd1CbgpMiJZUID0mM8wgva4s4gUVNQWuBA3VOZ0ntOk9oG6hpm4KSiRLKhgekxnmGV7XFnECgJqC1oEDdU2s+MnxkDdQ0zcFJRIllQyPSYzzDN9riziBRU1Ba0CBuqT4ifEQN1DTNwUlEiWVDA9JjPMM32uLOIFFTUFrQIG6pufET4iBuoam4KSiRLKhgekxnmGV7XGOIFFTUFrQIG6pufET4iBuoTcFJkRLKhgekwLzDK9riziGCpqC1oEDdU2z4yfGQN1CbgpKJEsqGB6TAvMIr2uLOIFFTUFrQIG6pudJ7TpPaBuoTcFJRIllQgPSevMIL2uMcQKKmoLXAg7qk6T2nSe0DdQ1NwUmREsqGR6TGeYYXtcWcQKKmoLWgQN1TmfET4iBuoaZuCkokSyoQHpMF8wiva4U4gUVNSWuBB3VNzpPadJ7QN1DTNyUmREsqER6TGeYRXtcNcQKKmpLWgQN1TbPiJ8RA3UNM3JSZESyoQHpMZ5hBW1w1xAoqaktaBA3VNs6T2nxEDdQ5JuSkyIllQiqk386lQQ46/ECipqS1oEHdU2wGVoAks0+H+H/U/e+3iPGeE+lcSco/B/3r7wZwYHavV5WECq5B93q/UzjwefdJ7G2iFcQhbHRr8BexI938DubefQzBKGyIOy4Y8BaOpcE6E8tdI4OsYyWsvCVyUmEzBwNkQdlwA0TUC1ojGS1y8JXJSYTUShsiDsuAGiYgFrRGMlrl4WclDD3molDZEHYMANATErK0RjJa5e/hZyUmE1EobIg7LgBoqYgFrRGMlrLws5KTCczA2RB2XADWJiVlaIxktcvCzkpMJzMDZEHZcANFTiFrRGMlrl4WclJhMwShsiDsuAGipqBa0RjJay9/CzkoYTmYGyIOwYAaAmIBa0RjJa5eFnJSYTUcDZEHZcANYmoFrRCmS1y8JXJSYTUShsiDsgBoqYgZWiFMlrl4WclDCaiUNkQdlwA0VMQC1ojGa1y8LOakwmolDZEHZcANFTEAtaIxktcvCzkoYTMEobIg7zADRNQytEYybXLws5KTCZglDZCOZf+MIYlYf1MQMrRCmTa5eP+P8A1P3vt/4QgQAq4A5iYpsdvX9uvpCV4AAUH9Eoy6ZRroek0JqsfRyls5ZpP9Hj1MMJAL3Tv8G1Xeeom7ncp+CiaE1WYlLFOZR8MFz0fUyvwm3KvqsArmuZoTVY8OhNVmIRwTmWBgmxlAZLoIBXJeZoTVY8OhNVmIRxTmWBgmxlAZroIBXNeczQmqx4egisxCOKcywMU2NygM10EArmvM6CKx4dCarMQjinOZYGCbGUBkuggFc15mhNVjw6E1WYhHFOZYGCbGUGy6JaqrUvDWqxA7fBoTVZiEcE5lgYJsZQGS6CAVyXmaE1WPDoTVZiEcU5zLAwTYygMl0EArmuZoTVY8OhNVmIRxTmWBimxlAZroLgFc1zOgiseHQmqzFI4pzmWBgmxlAZroIBXNeczQmqx4dCarMQjgnMsDBNjKAyXQQCua8zQmqx4dCarMQjiOZYGCbGUBmuggFcl5mhNVjw6E1WYhHBOZYGCbGUBkuiAVyXmaE1WPDoTVZiEcU5lgYJsZQGS6CAVbLzNCarHh0JqsxCOCcxupRyj+J1JrX4gFc15mhNVjx/x/6n732/8KoKoDu+h1nONil/93X+I0g5z/g9YKrXleX60VCz0vk49bR14GgsEvc2uU9NunIbFFAtAGj6bI6KU/4bRf0Q0YYDExWyjL5OCmAbmC2Ub8nBTAbmK2Vz5OCmA3Di2UZfJwUwOZgtlc+SQKtck0sbW2KoYwePBTHJMFso35OCmAbmC2Ub8nFTHJMVshl8nFTHJMFso35OCmBzMFsrnycFMckxWbRl8nBTA5mC2Vt8nFTA5mC2Vt8nEGBl9oMjIVfbyf4/9T977fU83PvsbD/b0masvUXX0OkrG7zR+70IVGoADBO2mNfKQmz0lj9vXpuiyU9StxdPR9dHHr9QDbAzF9AlKTWRb6r6v07adkeT207I8nsp2R5PbTsvJ7adkeTaBqpQOhAFeR207Y8ntp2x5PZTtjyeynZHk9tOyPJ7adkeT207byeynbHk/r+k7f8A15P8f+p+99oeM8J9GedzFf1jr7Q2mIn77yiJvNj/ALfp20zuBWSY1/IuDlhhdcCOB/sd0BcqNrPwn1HB+bfqud3+lQW5cNdA4Pr207I8ntp2x5PZTsjye2Z2R5PbTtvI+6My+0zMdPrcCAmPog2wR19O2nZHk9lO2PJ7Kdl5PZTsjye2nZHk9szsjye2nbeT2U7Y8n9f0na/68n+H/U/e+3jPDUbE1AtX0CVJ7lk6vW9Pf0hbHN6B1mK7jIZft6H16nMkjCmvWmXoNxGlYNIPRAauqZ22TgiMZXKbT1fooCrQcx8qmlMHT1PWcr2UynqvgWKZXEwWwOPJWKZXEWLYBrycFMhqYrY4PJWKZXEWLYHHkrFMriLFsDjyPwMWKZ4JgHjg+pyRVhi0wVFKCh9MFMo1Fi2Aa8lYplGosWwOPJWKZRqLFsA15OKmeCYrYBryVimVxFi2Aa8nBTK4mC2A15KxTK4mC2Bx5LxTOgmC2AyeS8BlYfaLIwEe3k/w/6n7328zhlIaHqvBLOwZTHSOPvv+IStPdc9B/2ARPv1foqcgWOARUdNJRa6j7PS8I0lkxY5s315PNaSBtCUBgANHSIUwTiD367gsDfNPv8AoQsBqAKD66E1eYBDJeJYOS7WUDgmkiFMRxNCavHh0Jq8wCGa8Swc12soHBNJEKYpxmaE1ePDoTV5gEM14zLBzXaygcU0kQpinE0Jq8eHQmrzAIZLxLByXaygcE0kQpgnE0Jq8eHQmrzAIZrxLBzXaygcE0kQpinE0Jq8eEilNXmY3JeIxeS7WAGiaSIUxTjM0Jq8RCgcfUWYtFGrzAIZLxLDZdrKBwTSRCmKcZmhNXjw6E1eYBDNeMywcl2soHFNJEKYpxNCavHh0Jq8wCGS8Swcl2soHBNJEKYpxNCavHh0Jq8wCGa4zLBzXaygcU0kQpinGZoTV48OhNXmAQzXjMsHJdrKBxTSRCmKcTQmrx4dCavMAhmvEsHJdrKBwTSRCmCcTQmrx4dCavMAhkvEsHJdrKJwTSRKmCcTQmrx4dCavMAhkvEtHJdrKRwTSRCjUcTQmrx4dCavMAhkvELcs5V/EPsmvxEKYpxNCavHj/j/ANT977eXRhcoWDoer0hSve/Leqxbhs5H9cQAAAUAYPobn7dQdDlXgMsQilMBeqMdG65X0wYwoW3oXfU/Fc3W4N6h49UKf8hekVl+i+FpgtcJmK2tsWtwb1NwwNMa4KTLwtMC1wnMytsWjMG9ZmMmBpjXBSZeFjBa4TMttbYtbg3qbhgaY1wUmXhaYLXCbjlbY43DOpiVgaY1wUmXhaYLWNxytsWtwb1MSmhpjXBSZeFo6WsczK2zW4hKZJUswNMQhKSj4DEeoF6JuOVtjjcM6mJWBpjXBSZeFpgtcJmK2tsWtwb1OJgaY1wUmXhaYLXCZi5W2ONwzqY1YGmNcFJl4WmC1wmYuVti1uDepiI0NMZwUmXv4WmC1w95uOVti0Zg3qYlNDTGuRSeE0wWuE3HK2xa3BHUxEaGmNcFJl4WMFrCbzlbY43BvUxKaGmNcVJl4WMC1wmYra2xQ3BvUxkwNMZwUMvC0wLXCbjlbZjn+tRWU9H9TcGhpjOCky8B9f4/9T977fU8J9K0tzoP+jrv+YQGAUlARwCijw+nr94OqhxOk95gZTZFuhx6lg+9Er7hjIz+U/L0NYE1oFn9egY+7mLQrCANrmniKMpbmr9aianqN9j0JqGksMDVQ2TpPedJ7wNVTRNw2tli0LCANrmniEEaTNHMGwZqGkwYOqhOk950nvB1VNTcNrkxaF9IQBtc54hlOkzRzBsGahpLDA1UN3PmJ8xA1VNTcNrZYtCwgHa5p4hBOkzRzBsGahpLDB1UJ8xPmIOqpqbhtbLFoWEAbXOeIQRpM0cwbBmoaSwwdVCfMT5iBqqTcNrkxaF9IQBtc54hBGkzRzBsGahpLDB1UJ8xPmIOqpGjza5McDfEIB2uc8QGhGUOYNgz0ElhmJKBxEKfciGj3IvBRPSJfZcljgv0hAG1zniEEaTNHMGwZqGksMHVQ9Z8xPmIOqpNw2uTFoWEAbXOeIYRpM0cwbBmoaSwwdVDc+YnzEHVU1Nw2tli0LCANrmniEEaTNHMGwZqGksMHVQ3PmJ8xB1VNTcNrZYtCwgHa5p4hBOkzRzBsH1moaSwwNVDdz5ifMQNVTU3Da2WLQvpDAdrmniGE6TNHMGwSahpLDB1UNk6T3nSe8HVUm4bWyxaLhAG1zniEUaTNHMGwZqGksMDVQ3Ok950nvAwVTibhtbLFoWGA7XNPEII0maOYNgzUtJgwdVCdJ7zpPeDqqaJuW1yYtCwyHa5p4hhOkzRzBsH1moaTBgaqGyfMT5iDqqam5bWyxaFgEFrv41LAAa6/EGwZqGkwYOqhsnzErwfxf6n6328ZGXnQLV6Shp539R9Xt95gIG79PxMlyM2/wDHSaktcCBuqSqMKd39Ub6GfWsW118Efo64bqjQPB+7olH3XavK5ZuSkyI0mALVcBF+KZeHo/7ldQO3a9V9YFATUFrQIG6ptZ0ntOk9oG6hqbgpKJEsqGB6TBfMIL2uMcQKKmoLWgQd1SdJ7TpPaBuoTcFJRIllQwPSYzzCK9rhTiBRU1Ba0CBuqbWfGT4iBuoek3BSUSJZTDA9JjPMML2uLOIFFTUFrQIG6pufET4iBuoam4KTIiWVCA9JjPMIr2vpxAoqagtaBA3VPWfET4iBuoam4KTIiWVCA9J68whfa4s4gUVNQWuBA3VJ8RPiIG6hFbZTgkzB5hAekxnmCprcFOIYCpqC1wIG6pBWPYmw9iBuoczcFJkRLKhAek1fMIL2uGuIFFTUFrQIG6pPiJ8RA3UJuCkyIllQgPSavmEV7XFnECipqC1oEDdUnxE+IgbqE3BSZESyEB6TGeYRXtcY4gUTUFrgQN1Tc+InSe0DdQm4KSiRLIYHpMZ5hBe1xZxAoqagtaBA3VN3PiJ8ZA3UNTcFJRIllQyPSYzzCK9rhTiBRU1Ba4EDdU3Ok9p0ntB3UOZuCkyIllQgPSYL5hBe1xZxAoqagtcCDuqczpPafEQN1DTNwUlEiWVDA9JgvmEb7XCnECipqS1wIG6pOk9p0ntA3UOZuSkyIllQwPSYzzDK9rhTiBRU1Ba4EDdU2s+InSe0DdQ0zclJkRLKgFFJt51KChx1+IFFTUFrQIG6pzOk9vD/ABf6n6328bRd6YH1XghEAVG7egjnVP8Ah6dZrZAExALWiXwLfoDaroIjNgJWcUb6cnjhmf2Wtg76j8ryQmwKAKA+jgWAvl9K5hMhU211ejpC6FQDAQA0VMQMrRGMlrLwlclJhMwShsiDsuAGipiAWtEYybXLws5KTD3mYJQ2RB2XADQExALWiMZLXL38LOSkwmYJQ2RB2XADRU1AtaIxktcvCVyUmE5mBsiDvMANFTEotaIxktcvCzkpMJzMDZEHZcANFTErK0RjJa5eFnJSYTmqk2RB2XArWJWCytEKZLX6CGYFFfRnJSYTmFDZEHZcANFTiZWiMZLXLws5KTCZl4GyIOy4AaKnELWiMZLXLws5KTCZl4GyIOy4AaKmJWVohTJa5eFnJSYTmFDZEHZcANYnELWiMZLXLws5KTD3molDZEHZcANFTEAtaIxktcvCVyUmE1EobIg7LgBoqYgFrRCmS1y8LOSkwmo4GyIOy4AaKmIBa0RjNa5eFnNSYTUShsiDsuAGipiAWtEYyWsvCzmpMJqJQ2QjmX/jAGBWH9TEAtaIxktcvH/B/qfofbxD81ZDfT1P8TIcOC19V5YZzwvH64iShqV6SgMl0E3/AIL7XAbV9CLCfKoT0gG6umNtM2AkNvYuvS2XoNfVBbqC9X0OsKB/8Pr1iESicy4ME2MoDJdBAK5rmaE1WPDoTVZiEcE5lgYJsZQGS6CAVyXmaE1WPD0EVmIRKpzLAxTY3KAzXQXAK5rmdBFY8OhNVmIRxTnMsDBNjKAyXQQCua8zQmqx4dCarMQjinMsDBNjKAyXQQCua8zQmqx4dCarMQjinMsDFNjKAzXQQCua85mhNVjw6E1WZlcU5lCME4ZQGS6CILWc5mdpqseHQmqzDcsU5iCAK2NygMl0EArmvM0JqseHQmqzEI4pzLAxTYygM10EArmvM0JqseHQmqzEI4pzmWBgmxlAZLoIBXJeZoTVY8OhNVmIRwTmWBgmxlAZLoIBXNeczQmqx4egisxCOI5lgYpsblAZroLgFc15mhNVjw6E1WYhHBOZYGCbGUBkuggFcl5mhNVjw6E1WYhHEcywME2MoDNdBAK5LzNCarHh0JqsxCOCcywME2MoDJdBAK5LzNCarHh0JqsxCOCcxtSjlH8TrSlV+IBXJeZoTVY8f8H+p+h9vqfTksOv+kdN/aahpQ6B/RD1aGa46P8Ar6YKYHMNZsfmN/lfxbESbQId7J/Li0IJpVOcblfwGD6jwLC9/wBXpLpyL9IHT64KY5Jis2jL5OCmBzMVsrnycFMBuYrZRl8nBTANzBbKN+TgpgczBbK58nBTHJDi2UZfJyZgZGD5i5+qogayfQQJ6JCl6SvQDcwWyjL5OCmBzBi2Ub8nBTANzBbKN+TgpgczBbKN+TgpgNzFbK2+TgpgczBbK58nBTHJMVsoy+TgpgczBbK2+TgDAy+0GEbQvt5P8X+p+h9vqho6Baysuxs/6vX5lQN7Gwfb1ekN1V27Or9Q6CO4ub9H00c6qbDDW/Ffu+mlZMeyRg/eefoGBrUoCLLHqmun6DrDRFwc9X18HbTsjye2nZHk9lOyPJ7adseT207I8ntp2Xk9tAA+n0m0PAjRCMuYFanbTtjyeynbHk9tO2PJ7KdseT2TOyPJ7adkeT207I8ntp23k/v+k7b/AF5P8X+p+h9voUthu09WUUVMTL0PQ6Sj+3o/4HWHqOgUH0bYooFtV0QiLAa1xSZD67dOah5uUj14dDR14FAeh9MY7QZV6BzHjE0XfX/mAAACgNHh7adkeT207I8nsp2R5PbTsvJ7adl5PbTsjye2nZH0Qdxbj6AQ0Svr207byeynbHk9lO2PJ7adseT2U7I8ntmdseT207I8ntp23k/v+k7b/Xk/xf6n6H2gGhuaZ6f+pRrLodq/thZW/Z931e31xVkLPG5T8tGYIyYOI9P/AEaBd48Dc92HDrt59DBTK0RYtgcRUn2E6rghgZNen6D+/HgplGCYrYBryVimVxFi2Aa8nFTK4mC2ODycFMriLFsDjyVimUaixbA48lYplcRYtgGvJwUytEeLYBryVimUaixbANeSsUyuIsWwDXkrFMo1Fi2Bx5OCmUamC2Aa8nBTKNTFbAa8lYplcRYtgGvJwUyjBMVsBrycFMriYLYGzycAZWH2jwmAX28ggVAWox7TCQgLaNfolqpDgofV9CZBF5Jrp6D6sFLTIHon+jwbS/P9R7wvyr3VMhl/cJ7HAQCBZcSycl2sFpuuxnqw5rm5T+t+k0Jq8eHQmrzAIZLxmWDku1lA4ppIhTFOJoTV48OhNXmAQzXiWDku1lA4JpIhTFOJoTV48OhNXmAQzXjMsHJdrKBwTSRCmKcTQmrx4dCavMAhmvEsHJdrKBwTSRCmCcTQmrx4dCavMAhmvEsHNdrKBwTSRCmKcTQmrx4dCavMAhmvEs3NdrGJkppIpRqnE+xF4nWlZX1lfWL0C8wyC64Ll45LtblA4JpLiFMU4zFpNXjwrSavMEhSXiFttbWWDJTSQtKo4iamrxK+sr6zqTqT7EXmZQLrxLByXaygcE0kQpinE0Jq8eHQmrzAIZrxLByXaygcE0kQpinE0Jq8eHQmrzAIZLxLByXaygcE0kQpinE0Jq8eHQmrzAIZrxLByXaygcE0kQpinGZoTV48OhNXmAQzXiWDmu1lA4JpIhTFOJoTV48OhNXmAQzXiWDku1lA4JpIhTBOJoTV48OhNXmBQyXiWTku1lE4JpIhTBOJoTV48OhNXmAQyXELfJyr+IPVKVX4iFME4mhNXjwkwDDIPJKVyepOvWVIASMW8HqyttMu6eq8xnBQy+lFgs9K5OB+x1yAmjo69za5T3eKwwWWCwTgCMYrWEKQ1qoiinztB6ekCoLBGImBpjOKky8LGC1wm45W2LW4N6mImBpjXBSZeFpgWuE5mVti1vEG9TETA0xnBSZeFjBa4TcW1ti0ZgjqbhgaY1wUmXhaYLXCcxtbZdbg3qcRoaY1wUmXv4WmC1wm45W2LW4N6mJTQ0xrgoZeFpgtcIFytrbFdoEG5iVgaY1xUmX1BUDmW9T3gwc9SGhVtbYtbg3rMxEaGmNcVDLwtMVrhNxbW2Km1qDSxPeNQ3hpOIzipPCaYlrCdG1tla4G9TERoaYzgoZeFpgtcJmK2tsWtwb1OJgaY1wUmXhaYLXCbi2tsWtwb1NwwNMa4KTLwtMFrhMxW1ti1uDepiI0NMZwUmXv4WmC1w95uOVti1uDepiI0NMa5FJl4WmC1wm45W2LW4N6mIjQ0xnBSZeFjFa4TMXK2xxuDepxGhpjOKky8LGC1hM5W1tjDL9aisp6P6m4YGmNcFJl4caAf3G+kzqfpjjpHjMKOF+i8EJUeBRWcVBsH1lMOUg9WZ0pHXegGV9NpuiyU6BV4XwvB+uji8M6T3g6qmiXBioV+gCDXYpv5PW9PiCgBxg4CEEaTOOYNgk1LSYMHVQ2T5idJ7wNVTRNw2tli0LCAdrmniGE6TNHMGwZqGkwYOqhudJ7zpPeDqqTcNrkxaFhAG1zTxDKdJmjmDYM1DSWGBqobJ8xPmIGqpqbhtbLFoX0hAG1zTxDCdJmjmDZc1DSWGDqoT5ifMQdVTU3Da2WLQsIA2uc8QgjSZo5g2DNQ0lhg6qE+YnzEDVUm4bWyxaF9IRDtc08QgjSZo5g2D6zUNJgwNVCfMT5iBqqTcNrkx0mBTKuc8QgjSZxzDIM1LSYMHVQnSe8CZBjrBqqLKLZayYqTCANrmniEEaTNHMGwZqWkwYOqhOk950nvB1VJuW1yYtCwqDa5zxAYVjZ6zV6MxKachgaqHE6T3nSe8HVUm5bXJjov0gUNrmniGUaTNHMGwZqGksMDVQ3PmJ8xB1VNTcNrZYtC+kIA2uaeIRTpM0cwbBmoaTBgaqG58xPmIOqpNw2tli0L6QgZ1zniEEaTNHMGwZqGksMHVQ3PmJ8xB1VJuG1ssWhfSEAbXOeIQTpM0cwbB9ZqGksMDVQ3PmJ8xA1VNTcNrZfzFoX0hAO1zTxCCNJmjmDYM1DSWGDqoTpPedJ7wdVTibhtcmLQsIB2uc8QgnSZo5g2D6zUNJYYGqhudJ7z5iDqqcTctrkxaF9IQBtc54hBGkzRzBsGalpLDA1UJ0nvOk94Gqpom4bXJi0LAILXbxqFaAaa/EGwZqWkwYOqhxOk9/oj1Y/h6dYR2WEtWDl29n/AEf3rKig6vzAKrXTxuKQlsyzflffRyktosYe83V9wSxlTEW6PY28riuk9p0ntOEuNB9XwR33ILHQeDrEsqEB6TGeYAXtcY4hgqaktcCBuqbZ0ntPiIG6hpm4KTIiWVDA9JgXmGV7XGOIFFTUFrQIO6ptnSe06T2g7qE3BSUSOSoYHpMZ5hFe1wpxAoqagtaBA3VNs+MnxEDdQ1NwUlEjkqGR6TGeYZXtcKcQKKmoLXAgbqm58RPiIG6hNwUlEjkqGB6TGeYRXtcKcQKKmoLXAgbqk+InxEDdQm4KSiRyVDA9JgvmEV7XGOIFATUFrgQN1T1nxE+IgbqGpuCkokFogUek9eYAVtfTiBRU1Ja4EruibnSe0A4e0HZA1NyUmRBahAekxnmEVbXFnECipqS1wIO6pzOk9p0ntB3UNTclJkRLKhIekxnmEFbXFnEqocG1wCctU3PRPadJ7Qd1DmbkpMiG8QLukwXzDK9riziBRU1Ba4EDdUnxE+IgbqE3BSZESyoQHpMZ5hle1xjiGCpqC1wIG6pufET4iBuoTcFJkRLKhAek9eYYXtcY4hgqagtaBA3VNz4ifEQN1CbgpKJEsqGB6TGeYYttcWcQwVNQWtAgbqm2fGT4yBuoaZuCkokSyoYHpMZ5hhe1w1xAoqagtaBB3VOZ0ntOk9oO6hqbgpKJEsqGR6TBfMMr2uGuIYKmoLXAgbqm2fETpPaBuoam5KTIiWVCA9JjPMIL2uMcQKKmpLXAg7qm2dJ7T4iBuoaZuCkyIllQCqk286lRQ4a/ECipqS1wIG6ptnSe0KnOy6P1xAlmqtwPqsImRhMvQ9CajgbIRyLy/uPA4A2Awo1dmNp6blXOFcIPRUeujN24bL0kZ5CbXr/X0Wi3BF9BLJfR9b+9YrJWtdt6rGclJhNRKGyIOy4AaxMQMrRGMlrl4WclJhNRwNkQdlwA0TEAtaIUyWuXhK5KTCajgbIg7IAaKmoFrRCmS1y9/CVyUmEzBwNkQdlwA0VMQC1ojGS1y8JXJSYTmYGyIOy4AaKmIBa0RjJa5eErkpMJmDgbIg7LgBoqYgFrRGMlrl4WclJhLEcDZKFyXADRMQMrRCma1yjv6EYzmpMJYDgbIg7zADWJiBlaIxmtcvCzmpMJqOBsgFpLgBrEqYytEYyWuXhMmmkwhyYGyARsuAGipqGVojGS1l4WclJhMwShsiDsuAGipxMrRCmS1y8LOSkwmYOBsiDsuAGipxMrRCmS1y8LOSkwmolDZEHZcANFTErK0RjJa5e/hZyUMJmCUNkQdlwA0VMQMrRCmTa5eErkpMJqJQ2RB2XADRUxAytEYyWuXhZyUmE1HA2RB2XADRNQLWiMZrXLws5KGHvMwShshHIv/GEChWH9TUMrRGMm1y+us6KNP52e3aCX9Fteq8s0Jqswku7l3x1gkVIuzRXSt7449QtmlVpYr7DWtt5rkCaKwWgDATQmqxCGHbAWPoGgdfT9fY/B0Cg+mhNVmIRwTmXRgmxlEZLogFcl5mhNVjw6E1WYhHFOZYGCbGUBkuggFc15mhNVjw6E1WYhHFOZYGKbGUBmuggFc15mhNVjw6E1WYhHFOZYGCbGUBkuggFc15ZoTVY8OhNVmIRxTmWBgmxlAZLogFc15mhNVjw6E1WYhEqnMuDBNjKAyXQQCua8zQmqx4dCarMZbBOSMJgmyUBkuiAVyXmaE1WI7+hGaE1WYzOCcyyME2SiMl0QCrZeZoTVY8OhNVmJRwTmMDBNjKIyXRALcl5mhNVjwtCarMQiUTmEJimxlAZLoIBXJczQmqx4dCarMQiVTmWBimxlAZLoIBXNeZoTVY8OhNVmIRxTmWBimxlAZLoIBXNeZoTVY8OhNVmIRxTmWBgmxlAZLoIBXNeZoTVY8OhNVmIRxTmWBimxlAZroIBXNeZoTVY8OhNVmIRwTklgYJsZQGS6CAVzXmaE1WPDoTVZiEcE5lkYJsZRGS6CAVyXmaE1WPDoTVZikcRzG0wco/iL1SlV+IBVsvM0JqseE/8A1tQdOr6BlgKuo/y19m6rK9NSbZsZBpbMPFYmBMq19/ohaka29A/uWKisG+q/p/XhwUwOYMWytvk4KYHMxWytvk4KYDcxWyjfk4KYDcwWyjfk4KY5JgtlG/JwUwOZitlG/I3ziYHMGLZXP1d/Sn0ZWNQI6IiqYHMOCyufpSUgjEEpAP04mATBbK2x15BkDANzBbKMvk4KYHMwWyjfk4KY5JgtlG/JwUwOZgtlc+TipgNzBbIb8nBTA5mC2UZfJwUwOYMWytvk4AxQvtDkNgV9vEgqFtC3Q4PVYPvRBWbxdGcrl93gDWNbAC30P4H5tzO6/wBz931lTK7OL1f9RCwun6Dg8fbTtvJ7adl5PZTsjye2nZHk9tOyPJ7adkeQLKY6jJTH7UuX9CArB3zAspB/EzW6T0QFSsqoB3KwAxDJAT7IWriBbESl+g1Lly4JYJX11TtjyeynbHk9lO2PJ7adt5PZM7I8ntp2Xk9tO28n930nZf68OJWU2tfVHPRn1rF2E9ayfaA1dU4HUPuuDyvKbV5XP0JYAarxuYGatjhXr5zMJRyuV9V5fI7adt5PbTsvJ7KdkeT207I8ntp2R5PbTsvJ7BmTHpKpp+vJNM/njXP6dtHR9hN+IuosR39Iq+0TZNn0PqgvCABROynbHk9lO2PJ7adseT207I8nsmdkeT207Lye2nbeT+76Tsv9eHKbpFFwno7+7PJC9qAUA0BwfTYpZeeh6sbQ9+N0LgPSCHDFQGdeTgplcTBbA48lYplcRYtgGvJwUyjUxWwGvJwUyuIsWwOPJWKZXEWLYHHkrFMo1Hi2Bx5OCmeCYrYGyFDLP05Jpn831cFMriDVCUNkzb8HX6uFi0ZDUqhi4Jsmz6EBXEEy7+uKmUamC2Aa8lYplcTBbA48lYplcRYtgceTgplcRYtgceTipngixbAa8nBTK4mC2Bx5OCmVxMFsDjycAZoT2jwhQLPbxpGvX1/6OsNMMjn8PL1n5ou/zG2wcKfmIUxHE0Jq8eFaTV5gEMl4lk5LtZQOCaSIUwHE0Jq8eHQmrzAIZrwSwcl2soHBNJEKYpxNCavHh0Jq8wCGa8Swc12tygcU0kUpinGZoTV48OhNXmAQyXiWDku1lA4JpIhTFOJoTV48OhNXmAQzXiWDku1lA4JpIhTFOJoTV48OhNXmAQzXiWDku1lA4ppIhTBOJoTV48OhNXmAQLriXDmu1lA4JpIhRonEzS6XiYCck0/S0Bq8yoCy4hF3ZXKy0YJpIkU09E4tq8eDxJgUavMZAEsstl2sy1kaZZRqOJk0avH0C2AFfTQmrzAIZriWDku1lQ4JpIhTEcTQmrx4dCavMAhkvEsHNdrKBwTSRCmKcTQmrx4dCavMAhmvEsHJdrKBxTSRCmKcTQmrx4dCavMAhmvEsHJdrKBwTSRCmI4mhNXjw6E1eYJDNeMywc12soHFNJEKYpxNCavHh0Jq8wCGa8Swcl2soHBNJEKYJxNCavHh0Jq8wCGS8Swcl2yicE0xCmCcTQmrx4dCavMAhmuIWxZyr+J1JSq/EQpgnE0Jq8eAaTwmj1Xr0+IAlr2F9D06JuLa2xhk8v7iHDP+sxEwNMZwUMvC0xWuE3HK2y63BvUxEwNMa4KTLwsYLXCbi2tsWtwb1MRGhpjXBSZeFpgtcJmLlbYoGcQb1MRGhpjOCky9/C0wWuEzFytsWtwzqYlYGmNcFJl4WmC1wm45W2ODMGzE3DA0xnBSZeFpgtcJmXlbYtbgjqYiNDTGcFJl4WMFrCby2tsWtsG9MxEaGmM4KTKLGHE0/TaYLXD3lBXK2xHoQpPUlwVhNMTIUlHwOkEUC1wnMytsdJWO09dynhoaZaoFIZ9/obJDB9GMFrCZitrbFreII6ZiI0NMZwUMvCxgtYTMVtbYoGYN6m4YGmNcFDLwsYLXCczK2xa3BvUxEaGmNcFJl4WmC1wnMytscbg3qYlYGmM4KTLwsYLXCbi2tsWtwR1MRGhpjOCky8LTBa4TccrbFrcEdTERoaYzgpMvC0wWuEzFytsWty71NwaGmNcVJl4WMFrhMxcrbEBbH+MdlPR/U3BoaYzipMvqWBtvHqA/v9QKj0yr1XM3La5MWhZYQPV+YRFSaedwbB9ZqWkwYGqhudJ7zpPeDqqaJuW1yYtFwgDa5zxCCNJmjmDYJNQ0mDA1UOJ0nvOk94GqpxNw2tli0LCANrmniEEaTNHMGwfWahpMGDqocTpPedJ7wdVSbhtcmLQvpCANrmniEU6TNHMGwZqGksMDVQ3PmJ8xA1VNTcNrZYtC+kIA2uc8QwjSZo5g2DNQ0lhgaqG58xPmIGqpqbhtbLFoX0hAG1zniEEaTNHMGwZqGkwYGqhPmJ8xA1VJuG1yYtCvEIA2uaeIRTpM0cwbBmoaSwwNVCfMT5iBqqaJuG1ssWhYRDtc08QinSZo5g2D6zUNJgwsahuFx/JKX+SBhVJuG1ssVJ9IYDtfXiBR0mccy7tKGmkMP5g6qE/2E/3EHBVJu21ssWhYShtc54hIdJnHMvaWFNIWP5gaqGyUmHvPmIGqpom4bWyxaF9IRBtc08QinSZo5g2DNQ0mDA1UOJ8xPmIGqpxNw2uTFoX0hAG1zTxDKNJmjmDYM1DSYMDVQnzE+YgaqnE3Da5MWhYQBtc54hBGkzRzBsGahpMGBqobnzE+Ygaqk3Da2WLQsIA2uc8QgjSZo5g2DNQ0mDA1UJ8xPmIGqpqbhtbLFoX0hEO1zTxDCdJmjmDYPrNQ0lhgaqHE6T3nSe8HVUm4bWyxaLhAG1zTxCCNJmjmDYM1DSWGBqobJ0nvOk94Gqpom4bWy/mLQvpCANrmniEUaTNHMGwZqWkwYOqhOk950nvA1VOJuW1yYtC+kIitdvGpcQGGvxBsGalpMGDqocTpPeChjABQQd1DTNyUmRKsqUFBlv8AMAqtdPG4FATUlrgQd1TbOk9p0ntA3UNM3JSZESyoYHpMZ5gBe1xjiBRU1Ba0CBuqbZ8RPiIG6hzNwUlEiWVDA9JjPMML2uLOIFFTUFrQIO6pOk9p0ntB3UOZuCkokSyoZHpMZ5hhe1xjiGCpqC1oEDdU2z4ifEQN1DU3BSZESyoYHpMZ5hC+1xZxAoqagtcCBuqbnxE+IgbqGpuCkyIllQgPSYt5hhe1xjiGCpqC1wIG6pPiJ8RA3UJuCkyIllQyPSYzzDK9riziGCpqC1oEDdU5nxE+IgbqGpuCkyIllQyPSYzzDK9riziGCpqC1oEEDVOk+Igp/gg5VDSSzIpwSBSQLOk1fMRZWuLOIpVEdWLUwTYqm5fo9oH/AIQmmoPSWXSkoksTMCjUmM8wke15OJWKlxRalBA3VJxr2nxEDdQm4KTIjkqGR6TGeYZXtcWcQwVNQWtAgbqm58RPiIG6hzNwUlEjkphgekxnmGV7Xk4gUVNQWtAgbqk+InxEDdQm4KSiRyVCA9JgvmEF7XFnECipqC1oEDdU3PiJ8RB3UJuCkokSyoYHpMZ5hBe1xZxAoqagtaBA3VNz4ifEQN1DU3BSUT8xyVDA9JjPMMr2uLOIFFTUFrgQd1SdJ7TpPaDuoczcFJkRLIYHpMZ5hhe1w1xDBU1Ba4EHdU3PiJ8RA3UNM3BSZESyoQHpMZ5hBe1xjiGCpqS1wIO6ptnSe06T2g7qGmbkpKJEsqAVUm3nUqKHDX4gUVNSWuBA3VNs6T2+qOSkwmo4GyEci8v7gDAPlmIBa0RjJay8LOakwmo4GyIO8wA0VMQMrRGMlrl4SuSkwmo4GyIOy4AaJiAWtEYyWuXv4SuSkwmYJQ2RB2XADRUxgytEYyWuXhZyUkZllDZEHZADRU1AtaIUyWuXhK5KTCajgbIg7LgBoqahlaIUyWuXhZyUmEzBKGyIOy4AaKmJWVojGS1l4WclDCaiUNkQdlwA0VMSi1ojGS1ynafQX1itbgXJQwZRbwNkoSkIA0BCoBa0SjNawCVKlEZxaTCIwShsgLzUYYujpKilVxAllay+hy/VnJSYTMHA2RB2XADRUxAytEYyWsvCzkoYe8zBwNkQdlwA0VNQytEYyWuXhZyUmE5hQ2RB2XADRUxKytEYyWuXhK5KTCaiUNkQdlwA0TEAtaIxktcvCzkpMJrOBsiDsuAGipiAWtEKZLXLwlclJhOYUNkQdlwA0TEAtaIUyWuXhZyUmHvMyyhsiDsgBoqYgZWiMZrXLws5KGEzBKGyAcg+GEMCsP6moZWiMZrXLw6E1WYhEonMfui/zC0bOEPzAK5LmaE1WPDoTVZiEcE5lkYJsZQGS6IBXJeZoTVY8OhNVmIRwTklgYJsZQGS6CAVzXmaE1WPDoTVZiEcU5zLAxTYygM10FwCua85nQRWPDoTVZiEcE5lgYJsZQGS6CAVzXmaE1WPDoTVZiEcU5lgYpsZQGS6CAVzXmaE1WPDoTVZiEcU5lwYJsZQGa6CAVzXmaE1WPDoTVZiEcRzLgwTYygMl0EArmuZoTVYnafQ+mhNVmMzgnMsDBNjKAyXQQCuS8zQmqx4dCarMQjgnMQGCbGUBkuggFuS8zQmqx9NX66E1WYhHEcywME2MoDJdBAKt1zNCarHh0JqsxCOA5lgYpsZQGS6CAVzXM6CKx4dCarMQjinMsDBNjKAzXQQCua8zQmqx4dCarMQjinMsDBNjKAyXQQCuS8zQmqx4egisxCOI5lgYpsblAZroIBXNeczQmqx4dCarMQjinMsDBNjKAyXQQCua8zQmqx4dCarMQjgnMsDBNjKAyXRAq5LzNCarHh0JqsxCOA5jaYOUfxF6pSq/EArkvM0JqseMYBpCd5gTKtffycFMDmDFsoy+TgpgczFbK58nBTAbmK2UZfJwUxyTBbKN+TgpgcwYtlc+TgpgG4MWyufJwUwOYcWyjL9ew+h9dWDFMDmDFsrn6rUG/CM0wOYMWyuZx9dXw4KNBuDFsoy+TipgG4MWyufJwUwOZgtlc+TgpgczBbK58nFTAbmK2Q35OCmBzMFsrnyRimBzBi2UZfJwBihfaHIbAr7eT33+5+76+T207bye2nZHk9tOyPJ7adkeT207I8ntp2R5PbTsj69p4dWdtO2+i1B6xNoNng1+xnbTj66vh7KdseT2U7byeynbHk9tO2PJ7JnZHk9tOy8ntp23k/u+k7L/XjBEAC1eIQuqGvydJ33+5+76+T207bye2nZeT207I8ntp2R5PbTsjye2nZeT207L66vt4dWdtO2+olnWOcQaa8Gv2M7acfXV8PZTtjyeynbHk9lO2PJ7adkeT2TOyPJ7adl5PbTtvJ/d9J2X+oQt1DddXpABBRYnPhurBaHb06faISRis30rmYxMr0PMwJgYffycFMriYLYHHkrFMriYLYHHkrFMriYrYDXk4KZRqYLYBrycFMo1Fi2Bx5OCmVxMVsA15OCmQ1MVsA19dXh3TBTK4mC2BxHUcaYS/AyUyuJgtgcTj66vhxUyuJgtgceTgplcTBbA48lYoWuIsWwGvJWKZXEWLYHHk4qZRqYLYBryVimVxMFsDjycFMriYLYHHk4AysPtMomF6msRCSM3iulcS6sNidvTr9vCB9bb46nWWlFua+v3nUm1/mNs0cKfmIUxHE0Jq8eHQmrzAIZLxLpyXayicE0kQpgnE0Jq8eHQmrzAIZrxLByXaygcE0kQpinE0Jq8eHQmrzAIZrxLBzXaygcU0lxSmKcZmhNXjw6E1eYBDNeJYOS7WUDgmkiFMU4mhNXjw6E1eYBDNeJYOS7WUDgmkiFMU4mhNXjw6E1eYBDNeJYOa7WUDimkiFGicTQmrx4dCavMAhmuJcOa7WUDgmkiFGg4mhNXiavofTQmrzC4yXiWTku2UTgmkgy4BxKK01eJrDUAzDU0Jq8wCGS8RI5LtlE4JpIJZgnE0Jq8fTV+uhNXmAQLriWDku1lA4ppIhTFOJoTV48OhNXmAQyXiWDku1lA4ppIhTFOJoTV48OhNXmAQzXiWDmu1lA4JpIhTFOJoTV48OhNXmAQzXiWDku1lA4JpIhTFOJoTV48OhNXmAQzXjMsHNdrKBxTSRCmKcTQmrx4dCavMAhmvEsHJdrKBwTSRCmKcTQmrx4dCavMAhkvEsHJdsonBNJEKNE4mhNXjw6E1eYBAuvELbJyr+J+CKr8SwgjE19fvAPpZXPV6+FjBa4TmZW2MMvV/cQ4Z/1mMmBpjOChl4WMVrhNxytsutwb1MRGhpjOCky8LGC1wm4trbFrcEdTETA0xrgpMvCxgtf7TcW1ti1uCOpiI0NMZwUmXv4WMFrhMxW1ti1uDepxMDTGuCky8LGC1wmZba2y63BvUxKwNMZwUmXhYwWuE3HK2xa3iDepiJgaYzgoZeFjBa4TcW1ti0ZgjqYiYGmM4KGU1fQ+jGJa4SwVtbYtbg3qWimk0xnMpMvqsNRjFa4TcW1tjpzBvUqYaGmM4KTLwrGC1wmYuVtihvEGzE3DA0xnBSZeFjBa4TccrbFDeIN6mJWBpjOCky8LGC1wmYuVti1uDepxGhpjOCky8LTBa4TccrbFrcETExEaGmM4KTLwsYLXD3m4trbFrcEdTERoaYzgpMvC0wWuE3HK2xa3BHUxEaGmM4KTLwtMFrhMy21ti1uDepuGBpjOZSZeFjBawmcuVtiDLH+MYlPR/U4jQ0xrmUmX1+YgaqmibltcmLQsK0D1fmAQUmnncGwfWalpMGBqobGdJ7zpPeDqqaJuW1yYtCwgDa5zxCCNJnHMGwZqWksMDVQ2TpPedJ7wNVTibhtbLFoWEA7XOeIQRpM0cwbB9ZqGkwYOqhsnSe86T3g6qk3Da2WLQvpCANrmniEE6TNHMGwZqGksMDVQ2T5ifMQNVTWZuG1yYtC+kIB2uaeIQTpM0cwbBmoaSwwNVCfMT5iBqqam4bWyxaF9IQMq5zxCCNJnHMGwZqGkwYGqhxPmJ8xA1VNZm4bXJi0L6QgDa5p4hBOkzRzBsH1moaSwwNVDc+YnzEDVU1Nw2tli0L6QiDa5p4hBOkzRzBsH1moaTBgUKhufMT5iBgqk3La5MQJ9IQMq5zxCCNJnHMXSQHaiFj+YGqhudJ7wjge81CitAzctrkxaLYNc65zxCKNJnHMG7TUNJYYGqhP+qT5iBqqam4bWyxaF9IQDtc08QinSZo5g2DNQ0mDA1UNz5ifMQNVSbhtcmLQvpCAdrmniEEaTNHMGwZqGkwYGqhufMT5iBqqTcNrZYtC+kIA2uc8QgjSZo5g2DNQ0mDA1UNz5ifMQdVTU3Da5MWhYQBtc54hBOkzRzBsH1moaSwwNVDc+YnzEDVU0TcNrkxaF9IQDtc08QgnSZo5g2D6zUNJgwdVDhnSe86T3g6qnE3Da5MWhYQBtc54hBOkzRzBsGahpLDA1UNzpPefMQNVSbltcmLQvpCANrmniEEaTNHMGwZqWksMDVQ2TpPedJ7wNVTRNw2uTFoX0gEFrheNS4gGmvxBsGalpLDB1UNz5idJ7QN1DTNyUmRHJUqKDq/MAqtcpxuBQE1Ba0CBuqbZ0ntOk9oG6hqbkpMiJZUID0mM8wQra4xxDBU1Ja4EDdU2zpPafEQN1Dkm4KSiRLKhgekwLzDC9rjHECipqC1oEHdU3Ok9p0ntB3UJuCkokclQwPScvMML2uFOIFFTUFrQPzA3VNs+MnxEDdQ1NwUlEjkqGR6TGeYYXtcKcQKKmoLXAgbqm58RPiIO6h6TcFJRI5KhgekxnmEF7XGOIYKmoLXAgbqk+InxEDdQ9JuCkokclQwPSYL5hhe1xjiBQE1Ba0CBuqbnxE+IgbqGpuCkokclQyPSYL5hle1xZxDBU1Ba0CBRqnSfEQu/oiN1DUfBSZEBr7xqvSavmUL7XDXErFTXFrgQG6Jufa9oK/oglNA1C+tJkRXDiUBKTGeYQXteTiVRU1Ba4EDdU3P+KT4iBuoTcFJkRyVDA9JjPMMr2uLOIYKmoLXAgbqk+InxEDdQm4KTIiWVDI9JgvmGF7XDXEMFTUFrQIG6pPiJ8RA3UJuCkyI5KhAekxnmGF7XFnEMFTUFrQIO6pu58RPiIG6hNwUlEiWVDA9JjPMMW2uLOIYKmoLWgQN1TbPjJ8ZA3UNM3BSUSJZUMD0mLeYYXtcY4hgqagtcCDuqbZ0ntOk9oO6hqbgpKJEsqGR6TBfMMr2uGuIYKmoLXAgbqm2fETpPaBuoaZuSkokclQgPSYzzCC9rjHECipqS1wIO6ptnSe06T2gbqGkm4KTIiWVAKqTbzqVFDhr8QwVNSWuBA3VNs+I+rOSkwmo4GyEci8v7hDA/VmMBa0RjJay8LOakwmolDZEHZcANExAytEKZrXLws5KTCajgbIg7zADRUxALWiMZLXLwlclJhMwcDZEHZcANFTEAtaIUyWuXhK5KTCazgbIg7zADRU4ha0QpktcvCVyUkczA2RB2XADRU4ha0QpktcvCVyUmE1HA2RB2XADRUxKytEKZLXL38LOSkwmo4GyIOy4AaKmNRa0RjJaynYfQnMs2VCFwcDZKHS48RUxA2tEQsrUHrOsFLLGiKFGkgNUYGyJgzBqVsFrRCmS1y8OVyUMPecwobIg7LgBoqYgZWiFMlrwiuSkwmYJQ2RB2XADRU1DK0QpktcvCVyUmE1EobIg7zADRU1DK0QpktcvCVyUmE1HA2RB2XADWJiVlaIUyWuXv4WclDD3mslDZEHZcANFTEDK0Qpk2uXhK5KTCaiUNkQdlwA0VMQMrRGMlrl4SuakwmYOBsiDsgBoqagWtEKZrXLws5KGEzhKGyEcj9SAChWH9TUMrRGM21y8OhNVmIRKJzF6pa7/MLXJwh+YBXJeZ0EVjw6E1WYhHBOZdGCbGURkuiAVyXmDSarHh0JqsxCOKcywME2MoDJdBAK5LzNCarHh0JqsxCOCcywME2MoDNdBAK5rzNCarHh0JqsxCOKcywME2MoDNdBAK5rzNCarHh0JqsxCOKcywME2MoDJdBAK5rzNCarHh0JqsxCOCcywME2MoDJdBAK5rzNCarHhbWrVZiAlBzmWpimxg0M10EArmvM0JqsTsPAmk1WY0MCcxi6JsYuAjXRLPIvMuwNViAqKJiKsEvyxC9dVmECUTmCWYJsZRGS6CAtyXmaE1WPDkXNKzGkbI5IizBNmYPqzwZgFc15mhNVjw6E1WYhHFOZYGCbGUBkuiAVzXnM0JqseHQmqzEI4pzLAwTYygMl0EArmvM0JqseHQmqzEI4pzLAxTYygM10EArmvM0JqseHQmqzEI4pzLAxTYygMl0EArkvM0JqseHQmqzEI4JzLAwTYygMl0EArmvM0JqseEaTVZiEcE5lkYJsZRGS6IBXJeZoTVY8OhNVmIRxHMbUo5R/EX2RVfiAVyXmaE1WPGcA0FXeDCZVr7+TgpgczBbK2+TgpgczBbKN+SMUwOYMWyjfk4KYDcOLZRl8kYpgG4MWyjfkjFGhzDi2Ub8kBijQNxoCbRuIbzCjtPobjCG3BimOSXATlmHkmTOoliH8TBzCDQUNRN7hlJio0DcGLZW2ceDAZ+mVt+mCmBpmdZyL5IxTA5gxbKN+SMUwDcGLZRvyRimAbhxbKMvkjFMDmDFso35OCmAbmC2UZfJwUwOZgtlGXyRgMDL7Q4RtC328nuv9z9/wBfJ7adt5PbTsvJ7adkeT2U7I8ntp2R5PbTsjyPyE7adkfQU1Epf0I7+mSgr7E7KIubTJIsEFWYx+m7NfsnbTj6l1Y6z4Ku/tBX2DyeynbHk9lO2PJ7adkeT2U7bye2nZHk9tO28n9/0nZf68nuv9z9/wBfJ7adt5PbTsjye2nbHk9lOyPJ7adkeT207LxX9Lrcztp2R4SO/oqMzEvSY/aiEWkpqAqSpRG0Fygm77Ttpx5GS6R+0eT2U7Y8nsp2x5PZM7I8ntp2R5PbTsjye2nbeT+/6Tsv9eS8BlFd4sJgYffycFMriYLYHHk4KZ4JitgGvJWKFriLFsDjycFMhqYrYHHk4KZXEwWwOPJwUyuJgtgGvA2mMQ6v0I6mZOVMFsA14T6izBTKKqIFiiaikVMKEVI5YX3ECoV7YlclqXTDBkgrbxiwRlFlNRFWKH1HxYKZXEwWwDXk4KZXEwWwOPJwUyjUxWwDXkrFMo1Fi2Aa8nBTPBMVsA15OCmVxMFsDjycAZWH2jwhQL7eAOGGlB9Xg+uhNXmAQzXiH1S93+YXfBwp+YhTBOJoTV48OhNXmAQyXiXDku1lE4JpIhRonE0Jq8eHQmrzAIZLxLhyXaygcE0kQpinE0Jq8eHQmrzAIZrxLByXaygcE0kQpinE0Jq8eHQmrzAIZrwXLBzXaygcU0kQpinGZoTV48OhNXmAQzXiWDmu1lA4JpIhTBOJoTV48OhNXmAQzXiWDku1lA4ppIhTFOJoTV48OhNXmIIZLxHHIu1lA4JpIhTFOJoTV48GwymlLq8yhAsuJlM12xFWiaSOVZHrBNaavEPafYJSFJFVTS7YFAsvEEcl2x1KvqTMmCcTQmrx4dCavMdBm+kAHZdrF1ommIUaJxNCavHh0Jq8wCGa8Swc12soHBNJEKYpxNCavHh0Jq8wCGS8Swcl2soHBNJEKYpxNCavHh0Jq8wCBdeMywc12soHFNJEKYpxmaE1ePDoTV5gEMl4lg5LtZQOCaSIUxTiaE1ePDoTV5gEM14zLByXaygcE0kQpinE0Jq8eHQmrzAIFl4lk5LtZUOCaSIUwTiaE1ePDoTV5gECy8Qt8nKv4nWmlfiIUxTiaF1eI/5laL6f6P5FhK7W/WL9WMC1jccrbFWXq/uO8M/6zcGhpjOCky8LGBa4TcW1tl1uDepiJgaYzioZeFjBa4TMVtbZYbxBHUxEaGmM4KTLwsYLXCZi5W2LW4Z1MRMDTGuCky8LGC1wmYra2xa2wb0zERoaYzgpMvfwsYLXD3mYra2xa3BvUxKwNMZwUmXhaYLXCZltrbFrcG9TErA0xnBSZfS2K+rGK1wnIbXbNt/TEpoaYzgpMvrczqGg1KAUrSEs5XbEDPEA9bg5GBpiOZSZRthYTnP0QqLXCHY5W2Kc6lb6kFEWhpheApPCYwWuEzy2tsUNwb1MRGhpjOKkyh4GmC1wm4trbFrcG9TcGhpjOCk8JjBa4TmZW2LW4N6nEwNMZwUmXhYwWuE3FtbYtbYN6ZiI0NMZwUmXv4WmC1wm45W2LW4N6mJWBpjXBSZeFjBa4TcW1tihuDepiI0NMZwUmXhYxWuEzFbW2LW4N6ZiI0NMZwUMvCxitcJuLa2x1n+tRXh6P6h/mtagmWaFDgenp+vsfta+g6T3gaqmibltbLFoX0hWi+uAQUmnncGwZqWkwYGqhPmJ8xA1VNBNy2tli0X6QiHa5p4hFGkzRzBsGalpMGDqocTpPedJ7wNVSbltcmLRfpCAdrmniEE6TNHMGwZqGkwYGqhOk958xA1VNE3Da2WLQsIA2uaeIQRpM0cwbBmoaSwwdVCdJ7zpPeBqqTcNrZYtC+kIB2uaeIRTpM0cwbBmoaSwwNVCfMT5iBqqazNy2tli0L6QgHa5zxCCNJmjmDYM1DSWGBqobnzE+YgaqmpuG1yYtCwgDa5p4hBGkzRzBsGahpLDA1UJ8xOk94GqpxNy2tli0L6QiDa+vEBJ07xzBsGahpMGBqobnzEEFHPWV0UVqbFa2ZZlOIKg2vrxM4aTOOZjSUtNIWMCUqHDBuHvGjT3gFCFcQG21sswXwRAET68RtHSZo5lgDmODdJgwNVCfMT5iBqqTmNrZZ2CEQ7XOeIQRpM0cwbB9ZU5pMGDqoes+YnzkDVUm4bWyxaF9IQBtc08QgjSZxzBsH1moaTBgaqG58xPmIGqpNw2tli0LCANrnPEII0maOYNgzUNJgwNVD1nzE+YgaqmpuG1ssWhfSEAbXNPEIp0maOYNgzUNJYYGqhudJ7zpPeDqqTcNrkxaL9IQBtc08QgjSZo5g2DNQ0lhgaqG58xOk94Gqpom4bXJi0X6QiHa5zxCCdJmjmDYM1LSYMDVQ4nSe86T3g6qmibltcmLQvpCAdrmniEE6TNHMGwfWahpLDA1UNjPmJ8xA1VJuW1yYtCwCC128alWOQG0KliKUXHT1Hp/pBoegVxA1UNkqbxeXqA98ujbOk9oO6hNwUlEiWVKAgfX+YBRa6eNwwBNSWuBB3VOWdJ7T4iBuoaSbgpKJHJUMj0mM8wyva4s4hgqaktcCDuqbnSe06T2g7qHM3JSZEclMID0mC+YZXtfTiGCpqC1oEDdU2s6T2nSe0HdQ1NwUlEiWQwPSYzzCC9rhriBRU1Ba4EHdU3Ok9p0ntB3UJuCkokclQyPSYzzDK9riziBRU1Ba0CBuqbWfGT4iBuoam4KTIjkhgekxnmGFbXFnEMFTUFrQIO6pudJ7T4iDuoam4KSiRyVDI9J68wwva4a4hgCagtaBB3VN3PhI/5EHdQm5KTIjkqHV6TBfMYuVYs4gUVNQWtAg7qk+IieR9ohpoGps1QokNVKotJp9ZSVtcX6QaKlTRa4ELKqQNp7TLj7S0EgR7ChkQYzqCUwJi3mNFlrjHEV9hMAFrgQd1TmfET4iDuoRW7KayTIqEB6TBfMIr2uGuIYKmgLXAg3qm58RPiIO6hqbgpKJHJUMD0mC+YYXtcY4hgqagtaBB3VJ8ROk9oO6hqbgpKJHJUMD0mM8wyva4s4hgqagtaBA3VOZ8ZPjIG6hqbgpKJHJUMj0mM8wyva4U4hgCagtaBB3VJ0ntOk9oO6hqbgpKJEsqGB6TGeYQXtcKcQwVNQWuBB3VNs6T2nxEDdQ0zcFJRI5KhgekxnmGV7XCnEMFTUlrgQd1SdJ7TpPaDuoczclJRI5KhgekxnmGV7XCnECipqC1wIG6ptZ8ROk9oO6hpm5KSiRyVKMkudrJwSvPQPsQQwVNQWtAjp7NlD0X/AEeOUv8AwjX31flW5+hXJSYe81HA2QDkcv7hDEr/AFmIBa0RjJa5eFnJQwmslDZEHZcANFTGDK0QpmtcvCVzUmE1HA2RB2XADRUxgLWiFMlrLwlclJhMwcDZEHZcANExALWiMZLXLwlclJhNRwNkQdlwA0VMYMrRCmS1y9/CVyUmE5mBsiDsuAGiYgFrRCmS1y8JXJSYTmFDZEHZcANYmMBa0QpktcpTjaPU9fqVyUmE1HA2QDsuAVgxHgC1ohTJa5fUahpcN5qTCerhNkpVJZC5I1DJdEJzrlGnDDoYM4xDLKBmqSLo8DZE03X2hgo1EABa6IUyWsvALQmItSf2mZeBsiDsuAGiprGVojZFrlHLHEqZ39SuSkwmcJQ2RB2XADRU1AtaIUyWuXhK5KTCZglDZEHZcANFTEAtaIUyWuXhZyUmE1kobIg7LgBoqYgZWiFMlrl4SuSkwmolDZEHZADWJiAWtEKZLXLwlclDCaiUNkQdlwA0VMQMrRCma1y8LOakwmcOBsiDsuAGiYgFrRGMlrLws5KTCAweMz/q9JmoQO6a/agDArD+piBlaJScjurkOB9NDu8kwX/Oz5tXK+u01RTCAcLB9AProTVZiEcU5j903+YWrlhD8wCuS8zQmqx4dCarMQjgOZcGCbGUBkuggFcl5mhNVjw6E1WYhHBOZcGCbGUBkuggFcl5zNCarHh0JqsxCOKcywME2MoDJdBAK5LzNCarHh0JqsxCOKcywMU2MoDNdBAK5rzmaE1WPD0EVmIRxTklgYpsZQGS6CAVzXmaE1WPDoTVZiEcE5lgYJsZQGS6CAVzXmaE1WIakaRlB9BpNVmIRwTmWBgmxmgl3QcwV5lNCarH1IiVcvxdVmGCwSPXRNkOmLOggurZczQmqx4OAgGJqsxCOCcykayNjBoVdxRcAtbLzNCarHgzjxD0RWYojgnMsDBNjKAyXRApyXMaKF1WItsst9dCarMQjgnMsDBNjKAyXQQCuS8zQmqx4dCarMQjinMsDBNjKAzXQQCua8zoArHh0JqsxCOKc5lgYpsZQGa6CAVzXnM0JqseHQmqzEI4pzLAxTYygM10EArmvM0JqseHQmqzEI4JzmWBgmxlAZLoIBXJeZoTVY8OhNVmIRKjmWBgmxlAZLoIBXJczQmqx4CxNaKAhUvl49U9J1+JoePV2/f1jalHKP4mSDxNAG16RxjYZa4r2nrt05Hc6dSuHh0NHV14hgGkp3hwmVa+/k4KYDDMVsoy+SMUwOYMWytvk4KYHMwWyjfkjFMDmDFso35OCmBzDi2Vt8nBTHJBi2Ub+thf0oa8AYpgcwUCytsckNh9TcZWUx8phpgNzELK5lekHzKdZWKZxDUQZwMJzMLyUyxrTfhqly/QYpgcwYtlG4Synp9KvDwUwOYMWyjfk4KNDmDFsrb5IxTA5gxbKMvkjFMDmYLZRl8kYpgcwYtlbfJxUwNMwWytvhIsXuvQOWAkrdteg/8AP6mUFQCgPoGeUXPCLafQgfXXJZK6p9NHXK47rLs7F0cXt6GPooCrRMKsGYD+Vfvr4e//ANz9f18ntp2R5PbTtvJ7adt5PbTsjyeynZHk9szsvqLUFNMqEisPr207aHWUv1G/BdtF7RGVeWKbaiTZniLH0fsM7YnHgoJxD6dtHg6RUmKysFJAo8PZTtjyeynZHk9lO28ntp23k9tO28ntp2x4CgwbPT+jrAqHI9k5evz9dmbfkJ6nL8W4iSN9By1F2isbaLQzNtIymNr3oMF4+hrltFBGWaC6+76HT3lJVLG930PD3/8Avyn9tOyPJ7adt5PbTsjye2nZHk9lOyPJ7adt4Kcn0uKj9O2nbfRB3OiSkw2xSyeC7abnQg5foYxNr+lNzD6H2J204+n2yA5uANEfr207CUFfTBbfi7Kdt5PZTsjye2nZHk9sztjye2nbeT2U7Y+qHnu1eq9enxHH+ob0PQ6fVkd12v5djn0Ud8xV0L+7qsDk03YHAA+Z2v8AqJat4Hb6BLIrGRjqfV6y9+ht/wCjFapaLXwrAFpDvMCYGH38nBTK0TFbAa8nBTK4mC2Bx5OCmeCYLYHHkrFMriLFsDjycFMhqYrYDXk4KZRqYLYBrwG3HDKn6rFMqLFsDj6ZqDLlECL6yxTKNR4LHB9azcFX9Tf02DKixbA4lvpELCXUuX4FimVxMFsBqXMFtENB4sFMriYLYHHk4qZDUwWwGvJWKZRqLFsA15OCmVxMVsA15OCmVxMFsDjycVMowTBbA4gIgAtVoItBVVb6f9wXyRXa9V5fo10SVANq8EStHXNzj1OnJ44W5aSZMOeo/PkgAAAoDATEGVh9oWg6UFYv7y+qq1KD0PQnCQtD0HodfDoTV5gEMl4h983+Y27Rwp+YhTFOJoTV48OhNXmAQLLxLhyXaygcE0kUpinE0Jq8eHQmrzAIZLiWTku2UTgmkiFGicTQmrx4dCavMEhmvGZYOa7WUDimkiFME4mhNXjw6E1eYBDNeJYOS7WUDgmkiFME4mhNXjw6E1eYBDNeJYOa7W5QOCaS4hTFOG50EXjw9BF5gEM14lg5rtZQOKaSIUxTiaE1ePrRBhjqyKtuAQLLxLLZdrKJwTTEqNE4mhNXjwZGpahS6vMJjJeJZbLtlE4JpIlTBOJoTV4+h9dCavMChkvEQbLtiacE0xQNE4bmCDV4nPg0Jq8wKGS8QS5S7Wb1lNJBEYpxLK0wXjw6E1eYBDNcZlg5rtZQOKaSIUxTjM0Jq8eHoIvMAhmvGZYOS7W5QOKaSIUxTidBF48OhNXmAQyXiWDku1lA4JpIhTBOGaE1ePDoTV5gEM14lg5rtZQOKaSIUxTiaE1ePDoTV5gEMlxLJyXayicE0xCjROJoTV48OhNXmCQzXBLByXazkrG/jrAiUqTIL19B+9YOA8GgPoM9rb7AbV4DLKws+Icugbq6Nq8WaO2N27A88Wz6Vm9CavMAhkvEte67AdPVi3Lg5teVjG0HFs9X/HiQwWuE3HK2x1n6v7jHH9bmIjQ0xnIpMvCxgtcJuLa2y63BHUxEwNMZwUmXhYwWsJuLa2y63BHUxEwNMZxUmXhYwWsJmK2tsWtsG9TcGhpjOCky8LGC1wm4trbFrcG9TETA0xrgpMvCxgtcJmK2tsUNwR1MRMDTGcFJl7+FjBa4TcW1ti1uDepiU0NMZwUmX1uvz9GpFrQlJltbYtbhnWpjVgaY1wUmXvKn5mPWBcJhyQsFbW2XW4N6mJWBpjXFSZeFpiWsczK7YQ5l3LrXTwxrgpMpj1lSpUaYlrhORlds0ZxL2NTEpoaZfVWzwsYLXCZitrbFrcG9TERoaYzgpMvfwsYLXCZi5W2LW4I6mIjQ0xnBSZeFpgtcJuOVtihuCOpiJgaYzgpMvCxgtcJuLa2xa3BvUxEwNMZwUmXhYxWuE3HK2xa3BvUxEaGmM4KGXhYwWsJmK2tsPtsfLXpKCxk2/ver+/bcGhpjOCkymK4Io+0OD1WD70SvDXFo/wBfVPy9AxhLBQLP69AwdW36J2AVKA9WHtPGv7HoQwu4HwHWYEYq9OcB4ek94OqpNy2tli0L6S4AeuAQUmvncGwSalpLDA1UNk6T3nSe8DVU0TctrkxaLhAG1zniEEaTNHMGwZqWkwYGqhsZ8xPmIGqpoJuW1ssWhfSEAbXNPEIJ0maOYNgzUtJgwdVDidJ7zpPeBqqam5bXJi0LCANrnPEIp0maOYNgzUNJYYGqhsnSe86T3gaqmibhtbLFoWEAbXNPEIJ0maOYNgzUNJgwdVDidJ7zpPeDqqTcNrZYtCwgDa5zxCCdJmjmDYM1DSWGBqobJ8xPmIGqpom4bWyxaF9IQDtc08QijSZo5g2DNQ0lhgaqG58xPnJgKpqHLduSzZ6QwHa5p4jDCJwcylYJkCkwYjKA2S7w95fhfdi6BwVCzba5MdJ9IQBtc08QgjSZo5g2DNS0mDB1UJ8xPmIOqpNy2uTFoX0gIG1zniGU6TNHMoacMrRRMGBqYDcwdPeFXPvRuo2uohnZbLFKXggDXtc08Q0uNM45hsVLDTSYMDVQ3PmJ8xA1VNTcNrZYtCwgDa5zxCKdJmjmDYPrNQ0lhgaqG58xPmIGqpNw2tli0L6QgDa5p4hBOkzRzBsGahpMGDqoTpPedJ7wdVTRNw2tli0L6QgDa5p4hBGkzRzBsGahpLDA1UNk6T3nSe8DVU0TcNrkxaL9IRDtc08QgjSZo5g2DNS0mDA1UJ0nvOk94GqpNy2uTFov0hAG1zniEUaTNHMGwZqWksMDVQ2T5ifMQNVTQTctrkx83D7D1X9RxRl6HQOCEEaTNHMGwYbdGI7tKP8AT0KZY/ZhGPSA1dU4vUK6nVvKdq8rmdJ7wcANHK+hEIqDgO+r6sJ4YTf3OvSLNfjlzP539+HpPaDuoczclJRI5KlQUOv8wii118bhgAmpLWgQN1TbOk9p0ntB3UOZuSkyI5KhgekxnmGFbX04hgAmpLXAg7qm2fETpPaBuoaZuSkyI5KhkekxnmGF7XFnEMFE1Ja4EHdU3Ok9p0ntB3UJuSkyI5KhkekxnmGV7XDXEMFTUFrQIG6ptnxE+IgbqGmbgpMiJZUMD0mC+YYXtcKcQwVNQWtAg7qnM6T2nSe0HdQm4KTIjkqGB6TGeYYXtcY4hgqagtaBB3VNz4ifEQN1DTNwUlEjkhkekxnmGV7XFnEMATUFrQIG6ptZ8ZPjINFITcFJkSwGWKaxj7yupa8nERKCKBZlwIBsnJPiJ8RA3UJYYpKJLycQgJSYzzAFtr6cQwTUlrgQd1SdJ7TpPaDuoTclJkQfuTgtJgvmBn2uMcShPSagtaBA3VJsLvtOAHtGyAHMu0pMiOCOSdHTGeYYVtcY4lRc1Ba0CBuqbZ8ZPjIG6hqbgpKJHJUMj0mM8wyva4U4hgqagtaBB3VNrPiJ8RB3UNTcFJRI5KhgekxnmEF7XGOIYKmoLWgQd1SdJ7TpPaDuoczcFJkRyVDI9JgvmGF7XFnEMFTUFrQIG6ptZ8RPiIG6hpJuCkokclQwPSYt5hle1xZxDBU1Ja4EHdU5nSe06T2g7qGpuSkyI5KhgekxnmGF7XCnEMATUFrQIG6pufET4iGF0RzFKCLeTo9T+9Y3Q5M5fVYYHpMZ5iEA1l4D1lUmTI8L6r7PS9igaWrYbs2HPJ5rSczwYA0BwE6T2mHALPb1fQhU8aDA9Jdq9H/H/ft6xtVVVyrP0PvP539+A+pXJSYTUcDZAOZy/uAMSv8AWYwZWiFMlrl4SuDSYTUShsiDsgBoqYgZWiFMm1y8LOSkwmslDZEHZcANFTGDK0QpmtcvCVzUmE1HA2RB2XADRMYC1ohTJa5eErkpMJmCUNkQdlwA0VNQLWiFMlrl4SuSkwmolDZEHZcANE1AtaIUybXLwlclJhNZwNkQdlwA0VMYMrRCmS1y9/ALRH1aTCajgbJWlXK8tBGiAWtEKZLXL38KNlSYTIsobJRvUBMUTE5XRCma18LnKGEybwNkodlwAlFRpDa0QpktcvfwIO5nHQwguRKGyIOy5koINAFrRCmS1y9/CzkpMJnCUNkQdlwA0VNQytEKZLXLwlclJhNRKGyIOy4AaJqGVojGS1y8JXJSYTUShsiDsuAGipiAWtEKZLXLwlclJhNRKGyIOy4AaxMQMrRCmba5eErmpMJrOBsiDsuAGipjAWtEYyWuX1IKS1Rtx2v/ACP37VOYYamYOBslg+10H/em2B6Ao1+B7Ppn0DyZWwv4Ps49UpktcvpYnQdv+j0lMYZT99pnjetf8HT6/o/efzv7+leHQmqzEI4pzF7hv8wNdsIfmAVyXmaE1WPDoTVZiEcU5lgYJsZQGS6CAVyXmaE1WPDoTVZiEcE5lwYJsZQGS6CAVyXmaE1WPCNJqsxCJROZZGCbGUBkuiAVyXmaE1WPDoTVZiEcU5lgYJsZQGS6CAVzXmaE1WPDoTVZiEcE5lgYJsZQGS6CAVyXmaE1WPDoTVZiEcU5lgYpsZQGa6CAVzXmaE1WPCIVarMBkonMORRGxuUBmuggFc15nQRWPCaE0rMQjgnMVxgmxl4qy8Eu25PWDSarHgrwQuwarMUjinMuDBNjKAyVwQCua8zQmqx4egisx4Wo5gCmCbIwdl4gFc15mhNVjw6E1WYhHFOZYGKbGUBmuggFc15mhNVjw6E1WYhHBOZYGCbGUBkuggFcl5mhNVjw6E1WYhHBOZYGCbGUBkuggFc15mhNVjw6E1WYhHBOZYGCbGURkuggFcl5g0mqx4dCarMQiUHMsDBNjKAyXQQCuS8zQmqx9LENuBynoELOhvg6vU/vSGCjU0Jqsxo+yZPvh99HLHCXADQ9ZtnbkHEFV9ffM/gH5WAVzXmZYQyboJYdpDC9PQdYqu9SPT/sypDI+V6+D9n7z+d/cPIOCaSneHCZWf38kYpgcw4tlGXycFMBhmK2UZfJGKYHMGLZXPk4KNDmYrZRl8nBTA5mC2Ub8kYpgcw4tlGXxkMwAogxTAbhxbK58dcfQYpgcwYtlbYNS3D9FozLsHgwUwDcsCZF35IvADDCHLJfkjFMDmDFsoy+TgpgG5gtlc+TgpjQw4s2jL5IxTA5gxbK2+TipgGGYrZRl+phxa8dX0IlVbnsj65KKYi+kNOm3j1NUrBAPTY9jbbhAJ1qZ5C7T6+2JgtlGWEQ3F/qKrzcc+r/AIl9DMFx1/8AG5y/0eD0Dg8P7P3n87+/J7v/AH5T+2nZHk9tOyPJ7adt5PbTsjye2nbHk9tOyPJ7KdkSv1j6060606060Vd/Tto/al/SkpifZ4e2mFXpOtOtOtOtOtL2n69lO2PJ7adseT2U7Y8ntp2R5PbTtvJ7Kdt9KsRwn6LE+efnL1+rRLslI5OPV0dWwTOwGvc2OU93oZQMMKBaANE7KMlbMW/8dY5oDTonEejz0fU9df0uBrRavq+L9D7z+R/fk9//ALn6/r5PbTsjye2nZHk9tO28ntp2R5PbTtjycg9GO06Hk9tOyIunkVVX40z8K8mqqvxpn4UeKqiD69lOyPogavPj7adseT2U7LyeynbeT207byeylQILKtBEltLT0PQdYefWD6NFgWC5V1Lk2zrnFBlPTaboslVVrFX6vHZOLafrXwpVcff/AMhhILZQERZqaf8AmdPf0h4a+n6P3n8z+/JWCLTrvMTYGP38nBTK0TFbA2eTgplaJgtgGvJwUyuJgtgceTgplcTBbA48nBTPBMFsDjybMFriJVVOEYB4QdfXBTK4mC2Bx46XX0wUyjUwWwDUWi2HjwUyuJgtgcfWtA9ZhQ78OCmVxMFsDj6U6kVWmQ8DWkzqzwRYtgGvJwUyuJgtgceTgplGpgtgceTgplcTBbA48lfUvAcsHppPrdf+IAAADAHH0JwWDz7pP8baJhwIJY6RexoLcniUzTeof6PPARaLdTkBof17ypczyJ6ByzKFm1YOr6viD6/o/efzP78B9dCavMAhkvE6w3v8wO7Rwp+YhTBOJoTV48OhNXmAQzXiXDku1lA4JpIhTBOMzQmrx4dCavMAgWXiWDku1lA4JpIpTBOJoTV48OhNXmCQyXEsHJdrKJwTSRCmCcTQmrx4dCavMAhkvEsnJdrKJwTSRCmKcTQmrx4dCavMAhmvGZYOS7WUDgmkiFME4mhNXjw6E1eYBDNeIGctbWUTimkjCYI6mhNXjwAamhNXmAQzXiWDku1lA4JpIhTBOJoTV48NsaavMAhmvGZYOS7WUDgmkmUqpxNSavHh0Jq8wCGa8Zlg5LtZQOCaSIUwTjM0Jq8TvIaLv66E1eYBDJeJYOS7WUDgmkiFME4gLWthePo6vroTV5hK5rxELku1lA4JpIhTFOJoTV48OhNXmAQyXiWDku1lA4JpIhTFOJ0EXjw6E1eYBDJeJYOS7WUTgmkiFME4mhNXjw6E1eYBDJeJYOS7WUDgmkiFMBxNCavHh0Jq8x0B1uer6Eb6RnYP+yicE0kQpgnESaBsfu/6PHNW5TO+8uXpfVW5I3ic73CexxX0JjnKzIjQ+v39OkxkLYvf0H8xAKYDQ+gcHiPB+j95/M/vxsYrXCbjlbYqz9X9xXj+tzERoaYzgpMvCxgtcJuOVtl1vEG9TETA0xnIpMvCxgtcJuOVti1vEG9TERoaYzipMvCxgtYTMXK2xa3BHWZiI0NMZxUmXhYxLXCbjlbYtbg3qbg0NMZxUmXhYwWsJuLa2xa2wb1NwaGmM4KTLwsYLXCVFcrbHmpE4DZDaaTTNNqjMPo6lgj6x8a9EIVyu2LC3BMjHWMDTEO6JlE3+uYlPS1KJQtbW36Fx9IbCNDTGRShl9ahMgxiwtcJeO12zBKM3DA0xrgpMoqRjRKkatRQotcIWlyts2TUcyyGg0xoDSZfSWmyXpe5bTiOVLWkuFbTliCzqDdKSLiMJpjOCky8LGC1wmYra2xa2wb1NwaGmM4KTLwsYrXCbi2tsWtwb1MRMDTGcVJl4WMFrhNxbW2KG8Qb0zERoaYzgpMvCrFVS+69ekHU63P/AAi1uDeo3YsGlcnp0dHN6ln75bNyrlfXaaophAOFgnAH0xhehv7JdFQ4NH/WUYD1b/32HaJ82ztXq+X+j95/I/vw9J7wdVSbltcmLRcsAHrhEFJq53BsGalpLDA1QNk6T3nSe8DVU1Ny2uTFov0hAG1zniEE6TNHMGwZqWkwYGqhxOk950nvA1VNE3Da2WLRfpCANrmniEEaTOOYNgzUtJYYGqhudJ7z5iBqqcTcNrkxaF9IRDtc08QinSZo5g2D6zUtJgwNVDZOk950nvA1VNE3La5MWhYQBtc08QgjSZxzBsGalpMGBqobnSe8+YgaqnE3La5MWhYRBtc08QinSZo5g2D6zUNJgwNVDZPmJ0nvA1VOJuG1ssJFl5O1zniIsaZr1l4qBpWnIYTigT5iBae8CtE4mba1yYzRBAxXOeI1V0ma9YxXqgNWEsP5hhUB1Ok950nvCTBDDOWrX8wbIwQQxteHiVqVjLXMFoJkUaTBhJVQ2M6T3iEKY6wQpSDsVXJlEDiCxiuQeJbHSenMGwZdi0lhg0UDYzUuEKjfrBQV9CFnzsYImHV2uc8SmNJnHMqKibEasYOkG4VMD7xz6e8CXomibFbWyy0Tglaja+vEoo0mccxZPWahpLDA1UNk6T3nzEDVU0TcNrZYtCwiHa5p4hFGkzRzBsGahpMGBqocTpPedJ7wNVSbltcmLQvpCANrnPEII0maOYNgzUtJgwNVDZOk950nvA1VNE3La2WLQvpCIdrmniEU6TNHMGwZqWksMDVQ2T5iJEQZVdRIzbXN0f8AUHKwsvK+rFoWNnQYCyquA6zMtJg7igyL129DZuONZ6B4dDR1dXGmkwYGqhslpBdF11YiCAU6A/gnEOhjoeg7vTzf2fvP5H9+HpPaDuoam5KTIjkqVBB1wii11cbhgCaktaBB3VOZ0ntOk9oO6hNwUmRHJUMD0nrzDCtriziGAJqC1wIO6pOk9p0ntB3UOZuCkokclQwPSYzzDCtriziGCpqS1oEHdU2zpPadJ7Qd1DTNyUlEjkphkekxnmGV7XGOIFFTUFrgQd1TbOk9p0ntB3UNTclJkRyVDA9JjPMMr2uMcQwVNSWuBB3VJ0ntOk9oO6hNyUlEjkqGR6T15hle1xjiGCpqC1oEHdU5nxE+IgbqGkm4KTIhtRVHkYzzAK1rhriaQgE4vAEMaJtZ0ntNkPaYlt6hLyKGUojqMC1Wr5g3pcY4lCanD2tAglAVtnxE6T2lA1hmJSUSVw4YTMaYL5g5leTiKOsapS4wfmDuqTpPaLtp9ojkgaYBhUmRMjhzEV2kxnmJDkXdcQwVNSWtAguSJtnT+0vwHtEF4DmDSpKJKAmIxMSYL5jQpa7TiGFLqIiltUETgs2xxqV9oAUj2m2aNS4wjgkXvEAhiTBfMNc64s4htRqC1oEDdU2z4ifEQd1DTNwUlEjkqGB6T15hle12nEMFTUlrgQd1SdJ7TpPaDuoTclJkRyVDA9JjPMIr2uGuIYKmpLXAg7qnM6T2nSe0HdQ0zclJRIllQyPSYzzDK9riziGCiaktcCDuqbYzG8UhBe3V1PQdIBqlQCj7TclJRJg71eXCDaehHyLJ1QeixhrRjblw0oW1hkHRxe3oYhgqaktaBFU6G06CBHDarV6ByxxeWJz1Pl6aO/iryP3fvP539+GxW8bnf5OmvSaHbfwPowrg0mE1EobIRyOX9wBiV/rMSsrRCmba5eErg0mE1HA2RB2XADRU4xa0QpktfCK5KTCazgbIg7LgBoqYgZWiFMm1y8JXNSYTWcDZEHZcANFTGAtaIxktZeFnJQwmYOBsiDvMANExAytEKZrXLwlc1JhNRwNkQdlwA0VNQLWiFM1rl4SuSkwmslDZEHZcANYmMGVohTJay8KZVJhCIOBslCUlwA0VFTjKwEdrbXL38KCm1JhNRKGyIOy4AaKmIGVohTJa5eErkpMJzMcj0gApzADRU1AtaIUyWuXgFbuFA0C0zBKGyIOy4AaId3s0EzCtWfCVyUmEzBwNkQdlwA0VNYytEKZLXLws5KTCZglDZEHZcANTWMrRCma18IrmpMJqJQ2RB2QA1iYwZWiFMlrl4WclDCayUNkQdlwA0VMYMrRCma1yg0HBy1jUg5HP/d6/UblC7Pe3+R+LcRLn0UL9kcbcWhCBBo1E3K/gMEANFRMQBdrUXIStD/wTCAszL/R1iS7WMAvQP734jyf3/vP539+HmyAfw+pAUNR+ovvAygyuTqepEI4JzF6hvf5ga7Yg/MArkvMGk1WPDoTVZiEcE5LlgYJsZQGS6CAVzXmaE1WPDoTVZiEcE5zLAwTYygMl0EArmvM0JqseHQmqzEI4JzLAwTYygMl0EArkucwaTVY8OhNVmIRKDmWBgmxlIZLoIBVsuYNJqseHQmqzEI4JzLIwTYyiMl0QCuS8waTVY8OhNVmIRKJzmWhgmxlAZLoIBXJeYNJqseHQmqzEI4jmWBgmxlAZLoIBXNcs0JqseHQmqzEI4JzLAwTYygMl0EArkvLNCarHh0JqsxCOCcywME2MoDJdBAK5LzNCarHh0JqsxCOI5lgYJsZQGS6CAVzXmaE1WPCNJqsxCOKcywME2MoDJdBAK5LyzQmqx4RpNVmIRKJzLIwTYyiMl0QCuS8zQmqx4RpNVmIRwTmWhgmxlAZLoIBXJczQmqx4RpNVmIRwHOZaGCbGUBkuggFWy5loLKQ0eq/qIX/y49D6s3UrL7qu/k9Fzf0ddH+bqsD0picOgP7XauVzLAwTYyj2cBt+0dXpcH+5wjxN/wDV094xKrVl/wA6eIPGfX9/7z+V/fhqGGzEtPXMfz+v3394DoBc9/0/j7Q4JoNH3hw2Vn9/JGKY5IcWytvkjFMckOLZW3yRimBzBi2Vz5OCmBpmK2UZfJGKYHMGLZW3yRimBzBi2Vt8kYpgNzFbKMvk4KYBhhxZtGXycFMckOLNoy+SMUwOYcWyGXyRimBzBi2UZfJGKYHMGLZXPk4KYGmHFsoy+SMUwOYQtZS1eJcUnozp63rMdF5TKeq/QMDqFAG1Y6yveK4/o/yZkU3YU76j8+SEhAUAUB9Attph3+ekuCIc4B09CY+jH+P26esVSpVyr4jy/wB/7z+V/fhIH0DitbRj7nowRR9eSMMdoM55PbTsjye2nZeT207bye2nbHk9tO28ntp23k9tO28ntp2x5PbTsjye2nbHk9tO28ntp23k9tO28k+6ZTCuzn3/AE/X2JqlAUH0Gz1sx9g2rwGWabN2p5dA3V0bVxV0vLxvoh593pWb+lsdHZ/1YcbOT9t6RXJtJdf8XSB4a839f7z+f/fhD6B9AdtpPxh9SY8JPSDs99TOtZlZPt6nkdtOyPJ7adl5PbTtjye2nZHk9tO28ntp23k9tO28ntp23k9tO2PJ7adt5PbTtvJ7adseT207byDzqlEtfQIDMMhv5fUzsj6JaDRQ9McHqsH3olc8hkjeX1T8vQMCa6KGT+vQMHVz9GYgLVaAlwmgcP2eh1mzd1T0P7mSjZXyvXxHkHi/X+8/n/34QgfX+P8A1FSjCf1xlljO/P6nXf3iqtRdh6+kPFgplcTBbA2eTgplcTBbA48nBTK0TBbANeTgplcTBbA48nBTK0TBbGw8nBTK4mC2Bx5OCmVxMFsDjycFMriYLYHHk4KZXEwWwOPJwUyuJgtgceTgplcTBbA48nBTK0TBbA2eTgplcTBbA48ZVp/RdS4IqUtl6fQcEwUyuJgtgbJopQN36U9+T0G5isjlEPSA1dU6tkM6mHt5TtXlc/Q83Meeh6xjYbjn1f8AERWIwXHX/wAbnMJR0HoHB4g8Z5H6/wB5/P8A78J9A+n8P+oP19IQ0K5t2PuejFBho2n7enb0g0L8n10Jq8wCGS8Sycl2sonBNJEKYJxNCavHh0Jq8wCGa8Zlg5LtZQOCaSIUwTiaE1ePDoTV5gEMl4zLByXaygcE0kQpinE0Jq8eHQmrzAIZLxLByXaygcE0xSmCcTQmrx4dCavMEhmuJYOS7WUDgmkilMBxNCavHh0Jq8wCGS8Swcl2sonBNJEKNE4mhNXjw6E1eYFDJeJZOS7WUTgmkiFME4mhNXjw6E1eYBAsvEsnJdrKJwTSRCmCcTQmrx4dCavMAhkvEsnJdrKJwTSRCmCcTQmrx4dCavMAhkvEsnJdrKJwTTEKNE4mhNXjw6E1eYBDJeJYOS7WUTgmkiFME4mhNXjw6E1eYJDJcSwcl2soHBNJFKNBwzQmrx4dCavMEhkvEsHJdrKBwTSRCmCcTQmrx4Lt2Bi+mev6+zwd8LX1WAQzXiAan1qwhVXMcD6r2HF7M8ombHN2wd8nmtJPm0wGADg+mCpY9/8AB1mmZp0dP+ww/UWej6nrr+lyNaLV9V8R/wCD9f7z+T/fiCcwJ/F/qft/aVDc0XkeXROTpEkPC32OvTfpKQq9vf49foxgWuE3HK2y63BvUxEaGmM5FJl4WMFrhNxytsWtwb1MRGhpjOCky8LGC1wm45W2LW4N6zMRGhpjOCky8LGC1wm45W2LW4N6m4NDTGcVJl4WMFrCbi2tsUNwR1MRMDTGcFDLwsYFrhNxbW2LW4N6mIjQ0xnFSZeFjFa4TccrbFrcEdTERoaYzipMvCxitcJuOVti0Zg3qYiYGmM4qTLwsYrXCczK2xa3iDZiYlYGmM1FDLwsYrWEzFytsUNwR1NwaGmM4qTLwsYLXCbi2tsWtwb1NwaGmM4KGXhYwWsJmK2tsUNwR1MRMDTGcFDLwsYFrCbjlbYtbg3qYiYGmM4KTL6C1W0UBFprlU10/R1fEEcWBGMFrhMJTGg/eIEpigT7n8Ppn0ARYOyv0+jj1cRGhpjOCkygvRjj7+vSNTqMpQEs9o6f+J09/SB4T/xfr/efyf78J9A+g7P9Qfr6QlZhBpEaSYh2H8467+8HKKWCrrDW9rZYtC+kIA2uc8QgjSZxzBsGalpMGBqobnSe86T3gaqmibltbLFouEAbX14hBOkzjmDYM1DSWGBqocTpPedJ7wNVTRNw2tli0LCAdrmniEE6TNHMGwfWalpMGBqocTpPedJ7wNVTRNy2tli0LCANrmniEE6TOOYNgzUtJgwNVDidJ7zpPeBqqam5bXJi0LCANrnPEIJ0maOYNg+s1DSYMDVQ2T5ifMQNVTRNw2tli0L6QiHa5p4hFOkzjmDYJNS0lhgaqGydJ7zpPeBqqaJuW1yYtC+kIA2uaeIRRpM0cwbBmpaSwwNVDc6T3nSe8DVU1Ny2uTFoX0hAG1zTxCKNJmjmDYM1LSWGBqocTpPedJ7wNVTRNy2tli0L6QgDa5p4hBGkzRzBsGalpMGBqobJ0nvOk94Gqpom5bXJi0L6QgDa5p4hBGkzjmDYPrNS0lhgaqGydJ7zpPeBqqaJuW1ssWhYRDtc08QinSZxzBsH1moaSwwNVDYz5ifMQNVTRNw2uTFoWEAbXOeIQRpM0cwbLmpaTBgaqG50nvOk94Gqpom5bWyxaLhAG1zniEEaTNHMGwZqWkwYvweAZX6DmZltk76+p6QIgDAHEDVU0S1fIyvdL+DlJV0JEdti+uwQvSFWfYOx7rCCdJnHMpkaKvMHYzB/Xv8AMoDnBtfQOWZOWWzB1fVh4Q8g8v8AX+8/m/34QgQ3An8X+pZtQY2X94H0kCSoKgUciA+49GEJeVY+3V/5A/PQimYpq9pbI1xjSFCpAcJGCC5bV9Y+Mj4yG4bB6QxwAZIblSpGKavaWjNfTSFSpBcJGCDMhL6x8bHxsNw2D0hLggpGG5TKkYpgvaWjNd1pCpRDRWigguWw+sfGx8bDcNg5IS4IMkNyoUjFMZ2loyXDWkKFQC4aMEF62H1j4mPiYbxsHpCXBBSQ2KhSME9dpaIl9NIUKgFw0YIL1sPrHxMfEw3iEPSGuCCkhsVCnYJgvaW7JcNaQoUQA4aKAgyth9Y+Jj4mG8bB6RqJBkhsVCnYJgvaW7JcNaQoAQA4alBBeoR5Y+Jj4mG8QhyRoJBSQ2KhTMEwXtLdkuLNIUKIAcNFBBeoR9Y+Jj4mG8QhyRoJBSMNioUzBMF7S3ZL6aQoVADhqYIL1CPrHxMfEw3jYOSEOCCkYbFQp2CYL2luyXDWkKFQI4aKCC9bD6x8THxMOFsHpDHBBkYRFQp2Ceu0t2S4a0hQqBXDRQEF6hH1j4mPiYbxsHpCXBBSMNhIUjBPXaWjJd1pChUAuGjBBeth9Y+Jj4mG8bB6RopBkhsVCkYJq9plJL6aQqBA241bLq+h1ibw6tB6D+58bHxsDKy7yH3Snd45Q7DaaaHUHXTBy3vKINZcjlL1/qUjFMF7QRfZGgRKxra0/f06QGgV01r1fQiMvgNR6BweIkkn/kJNttvvbbTSpmgMba+0/m/34iVCF5gIacQ/zp8ND/CnxU+Ih/mT4SasbIb6PqSuCNxf/CD/ANKY8wLQQZhX7wtkqZbnyc+Tnyc+TjbAoYbiDIv3iu2gOigDCvpcLZVTLc+anzU+YnzMfYKGG4gyL6XFdtA9FBGHfS4eyVMtz5SfKT5SfKR1woYbijJvpcW235gWi/MEYd+8NZCmW58pPlJ8pPlIywKGG4syb94ttvzAtB+YMw76XCWWUy3PlJ8pPlJ8pGWEhhuJMm+lxTafmAaD8wJh30uEuSmW58xPmJ8xPmIy4kMNxJkn0uKbT8wDQfmBMO+lwllKZbZ8xPmJ8xPmIy4kMNsSZJ9Lim0/MA0H5gTDP3hLrKZbZ8wx1cCgxZ6H/YaqBSZx6P8A2fMMZcSGG2JMk/eKbT8wDQfmBMM+lwllKZbnzE+YnzE+YjLiQw2xJk30uKbT8wDQfmBMM+lwl1KZbZ8xPmJ8xPmIypIYbiTJvpcU2n5gGg/MCYd9LhLKUy3PlJ8pPlJ8pGWAhhuLMm+lxbbfmBaD8wZh37wlkKZbZ8pPlJ8pPlI6wKGG4oyb94ttoFovzCu3nAPr1YkAttVf6Ok+UnykpJw5z6H/AIHXRagR8klC3uOm04AKgjQAYIgyb6XL9AMHavSUIVek/wCnrFASz2m9vaLvm8hWfCk+FJ8KT4Unw5D/AAyfFk+LJ8WT4snxZPiyfDk+Hnw8+HnwpPjZ8TPiSfEz4knwJPgZ8CT4GfCRPIBcnPhD6hCYAoL0T5aH+9D/AGof7EP9CfKT5yH+5PnYIW9wDP3HJK8QK+7mj+JQuy/vMtRrQM+DnwbPg58HMtTrSMWqg/DLIoTYjKIsXRTBbT8MylOtAz4ufHz49nx7MhTrSMU0X4ZbFCbEZTFi6AYBtvwzIU60DPjJ8Yz4xnxkyFOtIxTRP2ZbFCbEZRFi6AYLbfhmQp1oGfCM+Enwk+EmUp1pGL0X4ZYFCbEZQFi6KYPbfhmWp1oGfCM+EZ8Iz4RmWp1pGLqi/DLAoTYjKAsXRTB7b8My1OtAz4BnwDPgGfAMy1GtIxei/DLAqTYjKAuXQDB7b8My1GtAz4ifET4hnxDMtRrSMTVF+GXBUmxGUBcugGB234ZlqNaBnxDHFQMGfyf8hi4GTF9X/k+IZlqNaRidF+GXBUmxGUBcugGB234ZlqNaBnxDPiGfET4iZajWkYvRfhlgVJsRlAXLoBg9t+GZajWgZ8Az4BnwDPgGZanWkYvRfhlgUJsRlAWLoBg9t+GZanWgZ8Iz4RnwjPhJlqdaRi9F+GWBQmxGUBYuimD234ZlKdaBnwk+Enwk+EZkKdaRi2i/DAebasAescCaXvsF46/qOxvKVZkKdaBiZSVYtqriUEmW8INb3HpqWQ+cj9R/wOu58ZMhTrSMqZLNrHX0HeJg/dFA/ojJJac/ZejvPlSfKk+VJ8qT5Uh/rk+bJ82T5snzZPm582T5MnyZPlyfLz50nz8+dJ87PmSfIz5EnyM+RnyM+ZnzU+cIzIFJezwn0D6VA+gQIQgQPpUqrscrH3PRhJF0L7fTp7TXlJP4fTxjFMDmDFsrnyRimBzDi2Vz5IxTA5gxbK58kYpgcwYtlbfJGKYHMGLZRl8kYpgcwYtlbfJGKYBuHFsoy+SMUwG4MWytvjv6DFMDmDFsrb5IxTA5gxbK2+SMUwOYMWytvkc8kna+gcsN061df0HT5T8gAAUB6B6fTGWDZxuU/LRMX9hDfb/0aBdghhn5YH+jzwH04OBu6J6vaJhBbRaf2xlaDhc9Xq+0PCHkH/mIH0D6BCB9AgQIfSoEZKXJFIXx+jvvKu6VsydT1PF207bye2nZeT207Y8ntp2R5PbTtvJ7adt5PbTtvJ7adt5PbTtvJ7adseT2U7Y8b3wfKb+jrBlLJZ+yc9U7adtMarL8wHc54HNWPxMPcLo/KzkzuJzvcJ7HFfQXo2igJxvDX9j0O7LQVM7P/B1mUmtenoeIPGQ/85CB9KhAhAgQIQIH0IQ3CYq7Z7kwAeLv+j2+0HwdtOy8ntp2x5PbTtjye2nbHk9tOy8ntp23k9tO28ntp23k9tO28nsp2x5PbTtvERKHLT6v+o5zq79hwdPp20GQDmLr6Ppo51U5Ivb399Xk1jJg82sPt9H3AtQt6EvS0WTvr6n+IFwU8/c69I1g7eTxB4z/ANR9D6HiIfUhCEY5UpC8EAYAIAwYPB2zOy8ntp23k9tO28ntp23k9tOwPJ7adt5PbTtjye2nbeT207byeyZ23k9sztvC1SRGE+0GQEiMq3K8/Xto7quA3BbpTbn7wKKNfVyguBY4ilFQGkaiqq5XxHkHgPIPIPD/AP/Z';
const BULAN_ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function folderSertifikat_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_SERTIFIKAT');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(CONFIG.NAMA_SISTEM + ' - Sertifikat');
  props.setProperty('FOLDER_SERTIFIKAT', f.getId());
  return f;
}

function urlTemplateSertifikat_() {
  const id = PropertiesService.getScriptProperties().getProperty('TEMPLATE_SERT' + VERSI_TEMPLATE + '_' + desainUmum_().gaya);
  return id ? 'https://docs.google.com/presentation/d/' + id + '/edit' : '';
}

// ----- Penanda tangan sertifikat (bisa ditambah / dikurangi, maks. 4) -----
const MAKS_TTD = 4;
function daftarTtd_() {
  const props = PropertiesService.getScriptProperties();
  let list = null;
  try { list = JSON.parse(props.getProperty('TTD_LIST') || 'null'); } catch (e) {}
  if (!Array.isArray(list)) {                 // pindahkan data lama (Ketua & Sekretaris) ke format daftar
    let t = {};
    try { t = JSON.parse(props.getProperty('TTD_SERTIFIKAT') || '{}'); } catch (e) {}
    list = [
      { id: 'TTD1', jabatan: t.jabKetua || CONFIG.SERTIFIKAT_JABATAN_KETUA, nama: t.ketua || '', nia: t.niaKetua || '', file: t.fileKetua || '' },
      { id: 'TTD2', jabatan: t.jabSekre || CONFIG.SERTIFIKAT_JABATAN_SEKRETARIS, nama: t.sekre || '', nia: t.niaSekre || '', file: t.fileSekre || '' }
    ];
  }
  return list;
}
// ----- Cap / stempel sertifikat -----
function capSertifikat_() {
  let c = {};
  try { c = JSON.parse(PropertiesService.getScriptProperties().getProperty('CAP_SERTIFIKAT') || '{}') || {}; } catch (e) {}
  return { file: c.file || '', posisi: Number(c.posisi) || 0 };
}
/** Admin mengunggah / mengganti / menghapus gambar cap. berkas = {data, mime} | null; posisi = urutan penanda tangan (0 = pertama). */
function simpanCapSertifikat(pw, berkas, hapus, posisi) {
  cek_(pw);
  const props = PropertiesService.getScriptProperties();
  const c = capSertifikat_();
  if ((hapus || (berkas && berkas.data)) && c.file) { try { DriveApp.getFileById(c.file).setTrashed(true); } catch (e) {} c.file = ''; }
  if (berkas && berkas.data) {
    if (!/^image\//.test(berkas.mime || '')) throw new Error('Cap harus berupa gambar (PNG/JPG).');
    c.file = folderSertifikat_().createFile(Utilities.newBlob(Utilities.base64Decode(berkas.data), berkas.mime, 'Cap Sertifikat.png')).getId();
  }
  c.posisi = Math.max(0, Math.min(MAKS_TTD - 1, Number(posisi) || 0));
  props.setProperty('CAP_SERTIFIKAT', JSON.stringify(c));
  return getData(pw);
}

function infoPenandaTangan_() {
  const latar = PropertiesService.getScriptProperties().getProperty('LATAR_SERTIFIKAT');
  if (latar) pastikanLatarPratinjau_(latar);
  const cap = capSertifikat_();
  return {
    list: daftarTtd_().map(x => ({ id: x.id, jabatan: x.jabatan, nama: x.nama, nia: x.nia, adaTtd: !!x.file })),
    maks: MAKS_TTD,
    cap: { ada: !!cap.file, posisi: cap.posisi, url: cap.file ? 'https://drive.google.com/file/d/' + cap.file + '/view' : '' },
    desain: desainUmum_(),
    gaya: Object.keys(GAYA_SERTIFIKAT).map(k => ({ id: k, nama: GAYA_SERTIFIKAT[k].nama })),
    font: FONT_NAMA,
    posisi: posisiBawaanSertifikat_(),
    a4: !!PropertiesService.getScriptProperties().getProperty('SERTIFIKAT_A4'),
    latar: latar ? 'https://drive.google.com/file/d/' + latar + '/view' : ''
  };
}
/**
 * Admin menyimpan daftar penanda tangan. list = [{id?, jabatan, nama, nia, ttd?:{data,mime}, hapusTtd?}]
 * Urutan daftar = urutan tanda tangan dari kiri ke kanan di sertifikat.
 */
function simpanPenandaTangan(pw, list) {
  cek_(pw);
  if (!Array.isArray(list)) throw new Error('Data penanda tangan tidak valid.');
  if (!list.length) throw new Error('Minimal satu penanda tangan.');
  if (list.length > MAKS_TTD) throw new Error('Maksimal ' + MAKS_TTD + ' penanda tangan.');
  const lama = {};
  daftarTtd_().forEach(x => { lama[x.id] = x; });
  let n = Date.now();
  const baru = list.map(x => {
    const id = x.id && lama[x.id] ? x.id : 'TTD' + (n++);
    let file = lama[id] ? lama[id].file : '';
    if (x.hapusTtd && file) { try { DriveApp.getFileById(file).setTrashed(true); } catch (e) {} file = ''; }
    if (x.ttd && x.ttd.data) {
      if (!/^image\//.test(x.ttd.mime || '')) throw new Error('Tanda tangan harus berupa gambar (PNG/JPG).');
      const f = folderSertifikat_().createFile(Utilities.newBlob(Utilities.base64Decode(x.ttd.data), x.ttd.mime,
        'TTD ' + String(x.jabatan || id).trim() + '.png'));
      if (file) { try { DriveApp.getFileById(file).setTrashed(true); } catch (e) {} }
      file = f.getId();
    }
    const jabatan = String(x.jabatan || '').trim();
    if (!jabatan) throw new Error('Jabatan penanda tangan wajib diisi.');
    return { id: id, jabatan: jabatan, nama: String(x.nama || '').trim(), nia: String(x.nia || '').trim(), file: file };
  });
  // gambar milik penanda tangan yang dihapus dari daftar ikut dibuang
  Object.keys(lama).forEach(id => {
    if (!baru.some(b => b.id === id) && lama[id].file) { try { DriveApp.getFileById(lama[id].file).setTrashed(true); } catch (e) {} }
  });
  PropertiesService.getScriptProperties().setProperty('TTD_LIST', JSON.stringify(baru));
  return getData(pw);
}
/** Penanda tangan yang dipakai satu kegiatan (kosong = semua dalam daftar). */
function ttdKegiatan_(keg) {
  const semua = daftarTtd_();
  const pilih = String(keg[15] || '').split(',').map(s => s.trim()).filter(Boolean);
  const hasil = pilih.length ? semua.filter(x => pilih.indexOf(x.id) >= 0) : semua;
  return hasil.length ? hasil : semua;
}
function aturTtdKegiatan(pw, idKeg, ids) {
  cek_(pw);
  kunci_(() => {
    const sh = sh_('KEGIATAN'), v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    const i = v.findIndex(r => r[0] === idKeg);
    if (i < 0) throw new Error('Kegiatan tidak ditemukan.');
    sh.getRange(i + 2, 16).setValue((ids || []).join(','));
  });
  return getData(pw);
}

/**
 * Template sertifikat (Google Slides) — dibuat otomatis sekali. Desain boleh diubah bebas di Google Slides,
 * asal teks penanda tetap ada:
 * {{NOMOR}} {{NAMA}} {{IDENTITAS}} {{KALIMAT}} {{PERAN_KEGIATAN}} {{KETERANGAN}} {{KOTA_TANGGAL}}
 * {{AREA_TTD}} = kotak area tanda tangan; berapa pun jumlah penanda tangan, semuanya disusun rapi di dalam kotak ini.
 */
// ----- Desain sertifikat: 3 gaya latar + font nama + kalimat menyesuaikan kegiatan -----
const VERSI_TEMPLATE = '13';
// Batas area tulisan (satuan pt pada kertas A4 mendatar 842 x 595) agar tidak menimpa ornamen tiap gaya
const GAYA_SERTIFIKAT = {
  '1': { nama: 'Krem Klasik',     atas: 22, bawah: 512, kiri: 190, kanan: 652, ttdKiri: 172, ttdKanan: 670, ketKiri: 150, ketKanan: 692 },
  '2': { nama: 'Marun Rafflesia', atas: 22, bawah: 500, kiri: 214, kanan: 628, ttdKiri: 192, ttdKanan: 656, ketKiri: 168, ketKanan: 676 },
  '3': { nama: 'Bingkai Emas',    atas: 82, bawah: 496, kiri: 186, kanan: 656, ttdKiri: 196, ttdKanan: 646, ketKiri: 150, ketKanan: 692 },
  'u': { nama: 'Gambar sendiri',  atas: 24, bawah: 510, kiri: 160, kanan: 682, ttdKiri: 168, ttdKanan: 674, ketKiri: 150, ketKanan: 692 }
};
const FONT_NAMA = ['Great Vibes', 'Pinyon Script', 'Alex Brush', 'Allura', 'Parisienne', 'Dancing Script', 'Playfair Display', 'Cinzel', 'Times New Roman'];
const FONT_TEKS = 'Montserrat', FONT_JUDUL = 'Cinzel', FONT_ARAB = 'Amiri';

/** Pengaturan desain umum (berlaku untuk semua kegiatan yang tidak punya pengaturan sendiri). */
function desainUmum_() {
  const props = PropertiesService.getScriptProperties();
  let d = {};
  try { d = JSON.parse(props.getProperty('DESAIN_SERTIFIKAT') || '{}') || {}; } catch (e) {}
  return {
    gaya: GAYA_SERTIFIKAT[d.gaya] ? d.gaya : (props.getProperty('LATAR_SERTIFIKAT') ? 'u' : '2'),
    font: FONT_NAMA.indexOf(d.font) >= 0 ? d.font : 'Great Vibes',
    pesanPeserta: d.pesanPeserta || '', pesanPanitia: d.pesanPanitia || '',
    teksNama: d.teksNama || 'Dengan bangga diberikan kepada',
    teksX: d.teksX, teksY: d.teksY, teksLebar: d.teksLebar, teksTinggi: d.teksTinggi,
    namaX: d.namaX, namaY: d.namaY, namaLebar: d.namaLebar, namaTinggi: d.namaTinggi, namaUkuran: d.namaUkuran,
    tampilkan: Object.assign({ basmalah:true, judul:true, subjudul:true, nomor:true, teksNama:true, nama:true, labelPeran:true, peran:true, keterangan:true, tanggal:true, ttd:true }, d.tampilkan || {})
  };
}
function desainKhusus_(keg) {
  let d = {};
  const sel = String(keg[16] || '').trim();
  try { d = JSON.parse(sel || '{}') || {}; } catch (e) {}
  if (!sel && String(keg[12] || '').trim()) d.gaya = 'u';         // latar khusus versi lama = gambar sendiri
  return d;
}
/** Desain akhir satu kegiatan: pengaturan khusus kegiatan menimpa pengaturan umum. */
function desainKegiatan_(keg) {
  const u = desainUmum_(), k = desainKhusus_(keg);
  return {
    gaya: GAYA_SERTIFIKAT[k.gaya] ? k.gaya : u.gaya,
    font: FONT_NAMA.indexOf(k.font) >= 0 ? k.font : u.font,
    pesanPeserta: k.pesanPeserta || u.pesanPeserta, pesanPanitia: k.pesanPanitia || u.pesanPanitia,
    teksNama: k.teksNama || u.teksNama || 'Dengan bangga diberikan kepada',
    teksX: nilaiDesain_(k, u, 'teksX'), teksY: nilaiDesain_(k, u, 'teksY'),
    teksLebar: nilaiDesain_(k, u, 'teksLebar'), teksTinggi: nilaiDesain_(k, u, 'teksTinggi'),
    namaX: nilaiDesain_(k, u, 'namaX'), namaY: nilaiDesain_(k, u, 'namaY'),
    namaLebar: nilaiDesain_(k, u, 'namaLebar'), namaTinggi: nilaiDesain_(k, u, 'namaTinggi'), namaUkuran: nilaiDesain_(k, u, 'namaUkuran'),
    tampilkan: Object.assign({}, u.tampilkan || {}, k.tampilkan || {})
  };
}
function nilaiDesain_(khusus, umum, kunci) {
  const v = khusus && khusus[kunci];
  return v !== '' && v !== null && v !== undefined && isFinite(Number(v)) ? Number(v) : (umum && umum[kunci] !== '' && umum[kunci] != null && isFinite(Number(umum[kunci])) ? Number(umum[kunci]) : '');
}
/**
 * Admin menyimpan desain. idKeg kosong = pengaturan umum.
 * desain = { gaya: '1'|'2'|'3'|'u'|'' , font, pesanPeserta, pesanPanitia }  ('' = ikut pengaturan umum)
 */
function angkaDesain_(v, min, max) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return isFinite(n) ? Math.max(min, Math.min(max, n)) : '';
}
function simpanDesainSertifikat(pw, idKeg, desain) {
  cek_(pw);
  desain = desain || {};
  const bersih = {
    gaya: GAYA_SERTIFIKAT[desain.gaya] ? desain.gaya : '',
    font: FONT_NAMA.indexOf(desain.font) >= 0 ? desain.font : '',
    pesanPeserta: String(desain.pesanPeserta || '').trim().slice(0, 300),
    pesanPanitia: String(desain.pesanPanitia || '').trim().slice(0, 300),
    teksNama: String(desain.teksNama == null ? 'Dengan bangga diberikan kepada' : desain.teksNama).trim().slice(0, 120),
    teksX: angkaDesain_(desain.teksX, 0, 842), teksY: angkaDesain_(desain.teksY, 0, 595),
    teksLebar: angkaDesain_(desain.teksLebar, 20, 842), teksTinggi: angkaDesain_(desain.teksTinggi, 5, 150),
    namaX: angkaDesain_(desain.namaX, 0, 842), namaY: angkaDesain_(desain.namaY, 0, 595),
    namaLebar: angkaDesain_(desain.namaLebar, 20, 842), namaTinggi: angkaDesain_(desain.namaTinggi, 5, 150),
    namaUkuran: angkaDesain_(desain.namaUkuran, 8, 120),
    tampilkan: Object.assign({ basmalah:true, judul:true, subjudul:true, nomor:true, teksNama:true, nama:true, labelPeran:true, peran:true, keterangan:true, tanggal:true, ttd:true }, desain.tampilkan || {})
  };
  if (!idKeg) {
    if (!bersih.gaya) bersih.gaya = '2';
    if (!bersih.font) bersih.font = 'Great Vibes';
    PropertiesService.getScriptProperties().setProperty('DESAIN_SERTIFIKAT', JSON.stringify(bersih));
  } else {
    kunci_(() => {
      const sh = sh_('KEGIATAN'), v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
      const i = v.findIndex(r => r[0] === idKeg);
      if (i < 0) throw new Error('Kegiatan tidak ditemukan.');
      sh.getRange(i + 2, 17).setValue(JSON.stringify(bersih));
    });
  }
  return getData(pw);
}

/** Gambar latar gaya 1–3: diambil sekali dari situs (Netlify) lalu disimpan di Drive. */
function latarGaya_(n) {
  const props = PropertiesService.getScriptProperties(), kunciP = 'LATAR_GAYA_' + n;
  const id = props.getProperty(kunciP);
  if (id) { try { const f = DriveApp.getFileById(id); if (!f.isTrashed()) return f.getBlob(); } catch (e) {} }
  const url = String(CONFIG.URL_PUBLIK || '').replace(/\/+$/, '') + '/latar/gaya' + n + '.jpg';
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  const tipe = String((r.getHeaders() || {})['Content-Type'] || (r.getHeaders() || {})['content-type'] || '');
  if (r.getResponseCode() !== 200 || !/image/i.test(tipe)) {
    throw new Error('Gambar latar gaya ' + n + ' belum ada di situs (' + url + '). Unggah ulang simak-web.zip ke Netlify.');
  }
  const f = folderSertifikat_().createFile(r.getBlob().setName('Latar Gaya ' + n + '.jpg'));
  props.setProperty(kunciP, f.getId());
  return f.getBlob();
}

/** Membuat Google Slides ukuran A4 mendatar. Tanpa layanan Slides API, jatuh ke ukuran bawaan (16:9). */
function buatPresentasiA4_(judul) {
  const ukuran = { width: { magnitude: 842, unit: 'PT' }, height: { magnitude: 595, unit: 'PT' } };
  try {
    if (typeof Slides !== 'undefined') return tandaA4_(true, Slides.Presentations.create({ title: judul, pageSize: ukuran }).presentationId);
  } catch (e) { Logger.log('Slides API: ' + e.message); }
  try {
    const r = UrlFetchApp.fetch('https://slides.googleapis.com/v1/presentations', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ title: judul, pageSize: ukuran })
    });
    if (r.getResponseCode() === 200) return tandaA4_(true, JSON.parse(r.getContentText()).presentationId);
    Logger.log('Slides REST ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  } catch (e) { Logger.log('Slides REST: ' + e.message); }
  return tandaA4_(false, SlidesApp.create(judul).getId());
}
function tandaA4_(ok, id) {
  const props = PropertiesService.getScriptProperties();
  if (ok) props.setProperty('SERTIFIKAT_A4', '1'); else props.deleteProperty('SERTIFIKAT_A4');
  return id;
}

/** Template per gaya (dibuat sekali, disimpan di Drive). */
function templateSertifikat_(gaya) {
  gaya = GAYA_SERTIFIKAT[gaya] ? gaya : desainUmum_().gaya;
  const props = PropertiesService.getScriptProperties(), kunciP = 'TEMPLATE_SERT' + VERSI_TEMPLATE + '_' + gaya;
  const id = props.getProperty(kunciP);
  // template lama 16:9 dibuat ulang otomatis begitu layanan Slides API ditambahkan
  const perluA4 = typeof Slides !== 'undefined' && !props.getProperty(kunciP + '_A4');
  let perluLatar = false;                           // dibuat dengan latar cadangan → coba lagi ambil gambar gaya
  if (id && gaya !== 'u' && !props.getProperty(kunciP + '_LATAR')) { try { latarGaya_(gaya); perluLatar = true; } catch (e) {} }
  if (id && !perluA4 && !perluLatar) { try { const f = DriveApp.getFileById(id); if (!f.isTrashed()) return id; } catch (e) {} }
  if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }

  const idBaru = buatPresentasiA4_(CONFIG.NAMA_SISTEM + ' - Template Sertifikat (' + GAYA_SERTIFIKAT[gaya].nama + ')');
  const pres = SlidesApp.openById(idBaru);
  const W = pres.getPageWidth(), H = pres.getPageHeight();
  const slide = pres.getSlides()[0];
  slide.getPageElements().forEach(e => e.remove());
  let latar = null;
  if (gaya !== 'u') { try { latar = latarGaya_(gaya); } catch (e) { Logger.log(e.message); } }
  if (latar) props.setProperty(kunciP + '_LATAR', '1'); else props.deleteProperty(kunciP + '_LATAR');
  if (!latar) latar = Utilities.newBlob(Utilities.base64Decode(LATAR_SERTIFIKAT_BASE64), 'image/jpeg', 'latar.jpg');
  slide.getBackground().setPictureFill(latar);
  tataSertifikat_(slide, W, H, GAYA_SERTIFIKAT[gaya]);
  pres.saveAndClose();
  DriveApp.getFileById(idBaru).moveTo(folderSertifikat_());
  props.setProperty(kunciP, idBaru);
  if (props.getProperty('SERTIFIKAT_A4')) props.setProperty(kunciP + '_A4', '1'); else props.deleteProperty(kunciP + '_A4');
  return idBaru;
}

/**
 * Skala huruf sertifikat (pt, kertas A4 mendatar). Sama untuk semua gaya;
 * hanya jarak antarbaris yang menyesuaikan ruang kosong tiap latar.
 */
const UKURAN_SERTIFIKAT = {
  arab: 24, judul: 64, subjudul: 17, nomor: 12.5, label: 16, nama: 60, identitas: 12.5,
  peran: 30, keterangan: 14.5, tanggal: 14.5, jabatanTtd: 14.5, namaTtd: 16, niaTtd: 12.5
};

/** Menyusun isi sertifikat (gaya kalimat seperti sertifikat penghargaan) + unsur Arab, ditumpuk presisi. */
/** Kunci tiap bagian sertifikat → teks penanda di template. */
const BAGIAN_SERTIFIKAT = [
  ['basmalah', 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ'], ['judul', 'SERTIFIKAT'], ['subjudul', '{{SUBJUDUL}}'],
  ['nomor', 'Nomor: {{NOMOR}}'], ['teksNama', 'Dengan bangga diberikan kepada'], ['nama', '{{NAMA}}'], ['garis', '__GARIS__'],
  ['labelPeran', 'Sebagai:'], ['peran', '{{PERAN}}'], ['keterangan', '{{KETERANGAN}}'], ['tanggal', '{{KOTA_TANGGAL}}'], ['ttd', '{{AREA_TTD}}']
];
/**
 * Tata letak sertifikat (satuan pt pada A4 mendatar 842×595).
 * sembunyi = {kunci:true} bagian yang tidak ditampilkan → sisanya disusun ulang rapat & di tengah,
 * ukuran huruf tetap sama dengan template (dihitung dari susunan lengkap).
 */
function tataLetak_(g, sembunyi) {
  sembunyi = sembunyi || {};
  const U = UKURAN_SERTIFIKAT, EMAS = '#a8761b', MARUN = '#7a1414', ABU = '#5e5e5e', TEKS = '#2f2f2f';
  // [kunci, isi, ukuran, tinggi baris (x ukuran), jumlah baris, jarak sesudah, opsi]
  const B = [
    ['basmalah', 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ', U.arab, 1.3, 1, 6, { font: FONT_ARAB, warna: MARUN }],
    ['judul', 'SERTIFIKAT', U.judul, 0.95, 1, 3, { font: FONT_JUDUL, tebal: true, warna: EMAS }],
    ['subjudul', '{{SUBJUDUL}}', U.subjudul, 1.1, 1, 3, { tebal: true, warna: '#3a3a3a' }],
    ['nomor', 'Nomor: {{NOMOR}}', U.nomor, 1.1, 1, 9, { warna: ABU }],
    ['teksNama', 'Dengan bangga diberikan kepada', U.label, 1.1, 1, 2, { warna: '#3a3a3a' }],
    ['nama', '{{NAMA}}', U.nama, 1.05, 1, 2, { font: 'Great Vibes', warna: MARUN }],
    ['garis', '__GARIS__', 1.3, 1, 1, 10, {}],
    ['labelPeran', 'Sebagai:', U.label, 1.1, 1, 2, { warna: '#3a3a3a' }],
    ['peran', '{{PERAN}}', U.peran, 1.1, 1, 7, { tebal: true, warna: MARUN }],
    ['keterangan', '{{KETERANGAN}}', U.keterangan, 1.25, 3, 7, { warna: TEKS, kiri: g.ketKiri, lebar: g.ketKanan - g.ketKiri }],
    ['tanggal', '{{KOTA_TANGGAL}}', U.tanggal, 1.1, 1, 8, { warna: TEKS }],
    ['ttd', '{{AREA_TTD}}', 0, 0, 0, 0, { tinggi: 116, kiri: g.ttdKiri, lebar: g.ttdKanan - g.ttdKiri }]
  ];
  const tinggi = (b, f) => b[0] === 'garis' ? b[2] : b[6].tinggi ? b[6].tinggi * f : b[2] * f * b[3] * b[4];
  const ruang = g.bawah - g.atas;
  // ukuran huruf (f) selalu dari susunan lengkap agar sama dengan template
  const jarakSemua = B.reduce((t, b) => t + b[5], 0);
  let f = 1, isiSemua = B.reduce((t, b) => t + tinggi(b, 1), 0);
  if (isiSemua + jarakSemua * 0.3 > ruang) f = Math.max(0.85, (ruang - jarakSemua * 0.3) / isiSemua);
  if (sembunyi.nama) sembunyi = Object.assign({}, sembunyi, { garis: true });
  const tampil = B.filter(b => !sembunyi[b[0]]);
  const isi = tampil.reduce((t, b) => t + tinggi(b, f), 0);
  const jarakTotal = tampil.slice(0, -1).reduce((t, b) => t + b[5], 0) || 1;
  const kJarak = Math.max(0.3, Math.min(1.6, (ruang - isi) / jarakTotal));
  let y = g.atas + Math.max(0, (ruang - isi - jarakTotal * kJarak) / 2);
  return tampil.map(b => {
    const h = tinggi(b, f), o = b[6];
    const x = b[0] === 'garis' ? 421 - 190 : (o.kiri != null ? o.kiri : g.kiri);
    const w = b[0] === 'garis' ? 380 : (o.lebar != null ? o.lebar : g.kanan - g.kiri);
    const r = { kunci: b[0], isi: b[1], x: x, y: y, w: w, h: h, ukuran: Math.round((b[2] || 5) * f * 10) / 10, jarak: b[5], opsi: o };
    y += h + b[5] * kJarak;
    return r;
  });
}
/** Posisi bawaan tiap bagian untuk pratinjau di admin (pt). */
function posisiBawaanSertifikat_() {
  const o = {};
  Object.keys(GAYA_SERTIFIKAT).forEach(k => { const g = GAYA_SERTIFIKAT[k]; o[k] = tataLetak_(g).map(b => ({ kunci: b.kunci, x: Math.round(b.x), y: b.y, w: Math.round(b.w), h: b.h, u: b.ukuran, j: b.jarak, atas: g.atas, bawah: g.bawah })); });
  return o;
}

/** Menyusun isi sertifikat (gaya kalimat seperti sertifikat penghargaan) + unsur Arab, ditumpuk presisi. */
function tataSertifikat_(slide, W, H, g) {
  const sx = W / 842, sy = H / 595, TEKS = '#2f2f2f';
  tataLetak_(g).forEach(b => {
    const o = b.opsi;
    if (b.kunci === 'garis') {
      const sp = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, b.x * sx, b.y * sy, b.w * sx, Math.max(1, b.h * sy));
      sp.getFill().setSolidFill('#b8892b'); sp.getBorder().setTransparent();
      return;
    }
    const t = slide.insertTextBox(b.isi, b.x * sx, b.y * sy, b.w * sx, b.h * sy);
    const st = t.getText().getTextStyle();
    st.setFontSize(Math.round(b.ukuran * sy * 10) / 10).setFontFamily(o.font || FONT_TEKS)
      .setForegroundColor(b.kunci === 'ttd' ? '#ffffff' : (o.warna || TEKS)).setBold(!!o.tebal);
    t.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    try { t.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE); } catch (e) {}
  });
}

/** Kalimat sertifikat menyesuaikan jenis kegiatan & peran. */
function kataSertifikat_(namaKeg, peran, desain, tglTeks, tempat) {
  const n = String(namaKeg || '').toLowerCase(), peserta = !peran || /^peserta/i.test(peran);
  const oleh = 'yang diselenggarakan oleh ' + CONFIG.PENYELENGGARA + ' pada ' + tglTeks + (tempat ? ' di ' + tempat : '') + '.';
  let pesan;
  if (peserta) {
    pesan = desain.pesanPeserta ||
      (/darul\s*arqam|\bdad\b|\bdam\b|\bdap\b|perkaderan|kaderisasi/.test(n) ? 'Semoga menjadi kader yang Anggun dalam Moral dan Unggul dalam Intelektual.'
      : /kajian|pengajian|tabligh|ceramah|tausiyah|halaqah|tahsin|tadarus/.test(n) ? 'Semoga ilmu yang diperoleh menjadi cahaya dan bekal dalam berdakwah.'
      : /seminar|webinar|pelatihan|workshop|sekolah|madrasah|kelas|diskusi|bedah|talkshow|latihan|up\s*grading/.test(n) ? 'Semoga ilmu dan pengalaman yang diperoleh bermanfaat bagi diri, ikatan, dan umat.'
      : /bakti|baksos|sosial|santunan|donor|berbagi|peduli/.test(n) ? 'Semoga menjadi amal saleh dan menumbuhkan kepedulian terhadap sesama.'
      : /lomba|olimpiade|kompetisi|festival|turnamen/.test(n) ? 'Semoga terus berprestasi dan menebar kebaikan.'
      : 'Semoga menjadi pengalaman berharga dalam berikatan dan berdakwah.');
    return { subjudul: 'K E I K U T S E R T A A N', peran: 'PESERTA', keterangan: 'Dalam kegiatan ' + namaKeg + ' ' + oleh + ' ' + pesan };
  }
  pesan = desain.pesanPanitia || 'Semoga menjadi amal jariyah dalam ber-IMM.';
  return { subjudul: 'P E N G H A R G A A N', peran: String(peran).toUpperCase(),
    keterangan: 'Atas dedikasi dan kontribusinya dalam kegiatan ' + namaKeg + ' ' + oleh + ' ' + pesan };
}

/** Lebar rata-rata satu huruf (x ukuran font), diukur dari font aslinya pada 15 contoh nama. */
const LEBAR_HURUF = { 'Great Vibes': 0.477, 'Pinyon Script': 0.489, 'Alex Brush': 0.481, 'Allura': 0.470, 'Parisienne': 0.530,
  'Dancing Script': 0.457, 'Playfair Display': 0.555, 'Cinzel': 0.662, 'Times New Roman': 0.510 };
/** Ukuran font nama: sebesar mungkin (maks. 44 pt) tetapi tetap satu baris selebar 380 pt. */
function ukuranNama_(nama, font, dasar, lebarKotak) {
  const n = Math.max(String(nama || '').trim().length, 6);
  const lebar = lebarKotak ? (lebarKotak - 14.4) * 0.95 : 450;          // lebar kotak nama sebenarnya (A4 / 16:9)
  const muat = lebar / (n * (LEBAR_HURUF[font] || 0.55));
  return Math.round(Math.max(12, Math.min(dasar || UKURAN_SERTIFIKAT.nama, muat)) * 2) / 2;
}

/** Membuat satu sertifikat PDF dari template. d = isi penanda. */
function cetakSertifikat_(tpl, folder, d, namaFile) {
  const salinan = tpl.makeCopy('tmp-' + Utilities.getUuid(), folder);
  const pres = SlidesApp.openById(salinan.getId());
  // latar: khusus kegiatan > latar unggahan admin > latar bawaan template
  if (d.latarId) {
    try { const blob = DriveApp.getFileById(d.latarId).getBlob(); pres.getSlides().forEach(sl => sl.getBackground().setPictureFill(blob)); }
    catch (e) { Logger.log('Latar: ' + e.message); }
  }
  // tanda tangan: susun semua penanda tangan di dalam kotak {{AREA_TTD}}
  const ttd = d.ttd || [];
  // 1) bagian yang disembunyikan dibuang, sisanya disusun ulang rapat di tengah; garis ikut nama
  const vis = d.tampilkan || {}, sembunyi = {};
  BAGIAN_SERTIFIKAT.forEach(a => { if (vis[a[0]] === false) sembunyi[a[0]] = true; });
  const sxP = pres.getPageWidth() / 842, syP = pres.getPageHeight() / 595;
  const ada = v => v !== '' && v != null && isFinite(Number(v));
  const g = GAYA_SERTIFIKAT[d.gaya] || null;
  const letak = {};
  if (g) tataLetak_(g, sembunyi).forEach(b => { letak[b.kunci] = b; });
  pres.getSlides().forEach(sl => sl.getShapes().forEach(sp => {
    let isi = '';
    try { isi = sp.getText().asString(); } catch (e) { return; }
    const garis = !String(isi).trim() && sp.getHeight() < 4 * syP;
    const bag = garis ? ['garis'] : BAGIAN_SERTIFIKAT.find(a => a[0] !== 'garis' && isi.indexOf(a[1]) >= 0);
    if (!bag) return;
    if (sembunyi[bag[0]] || (bag[0] === 'garis' && sembunyi.nama)) { sp.remove(); return; }
    const b = letak[bag[0]];
    if (b) { try { sp.setLeft(b.x * sxP); sp.setTop(b.y * syP); sp.setWidth(b.w * sxP); sp.setHeight(Math.max(1, b.h * syP)); } catch (e) {} }
    if (bag[0] === 'garis') {                                   // garis selalu tepat di bawah nama
      if (ada(d.namaX) || ada(d.namaY) || ada(d.namaLebar) || ada(d.namaTinggi)) {
        const nb = letak.nama || { x: 231, y: 200, w: 380, h: 60 };
        const nx = ada(d.namaX) ? Number(d.namaX) : nb.x, ny = ada(d.namaY) ? Number(d.namaY) : nb.y;
        const nw = ada(d.namaLebar) ? Number(d.namaLebar) : nb.w, nh = ada(d.namaTinggi) ? Number(d.namaTinggi) : nb.h;
        const lw = Math.min(380, nw * 0.85);
        try { sp.setLeft((nx + (nw - lw) / 2) * sxP); sp.setTop((ny + nh + 2) * syP); sp.setWidth(lw * sxP); } catch (e) {}
      }
      return;
    }
    if (isi.indexOf('Dengan bangga diberikan kepada') >= 0 && !ada(d.teksX) && !ada(d.teksY) && (ada(d.namaX) || ada(d.namaY))) {
      // nama dipindah tetapi teks tidak → teks ikut berada tepat di atas nama
      const nb = letak.nama || { x: 231, y: 200, w: 380, h: 60 }, tb = letak.teksNama || { h: 18 };
      const nx = ada(d.namaX) ? Number(d.namaX) : nb.x, ny = ada(d.namaY) ? Number(d.namaY) : nb.y;
      const nw = ada(d.namaLebar) ? Number(d.namaLebar) : nb.w;
      try { sp.setLeft(nx * sxP); sp.setWidth(nw * sxP); sp.setTop(Math.max(0, ny - tb.h - 2) * syP); } catch (e) {}
    }
    if (isi.indexOf('Dengan bangga diberikan kepada') >= 0) { // teks otomatis sebelum/sesudah nama, posisi bebas
      try { sp.getText().replaceAllText('Dengan bangga diberikan kepada', String(d.teksNama == null ? 'Dengan bangga diberikan kepada' : d.teksNama)); } catch (e) { Logger.log('Teks nama: ' + e.message); }
      try {
        if (d.teksX !== '' && d.teksX != null) sp.setLeft(Number(d.teksX) * pres.getPageWidth() / 842);
        if (d.teksY !== '' && d.teksY != null) sp.setTop(Number(d.teksY) * pres.getPageHeight() / 595);
        if (d.teksLebar !== '' && d.teksLebar != null) sp.setWidth(Number(d.teksLebar) * pres.getPageWidth() / 842);
        if (d.teksTinggi !== '' && d.teksTinggi != null) sp.setHeight(Number(d.teksTinggi) * pres.getPageHeight() / 595);
      } catch (e) { Logger.log('Posisi teks nama: ' + e.message); }
      return;
    }
    if (isi.indexOf('{{NAMA}}') >= 0) {       // ukuran font dan area nama dapat diatur
      let dasar = 36;
      try { dasar = sp.getText().getTextStyle().getFontSize() || 36; } catch (e) {}
      try {
        if (d.namaX !== '' && d.namaX != null) sp.setLeft(Number(d.namaX) * pres.getPageWidth() / 842);
        if (d.namaY !== '' && d.namaY != null) sp.setTop(Number(d.namaY) * pres.getPageHeight() / 595);
        if (d.namaLebar !== '' && d.namaLebar != null) sp.setWidth(Number(d.namaLebar) * pres.getPageWidth() / 842);
        if (d.namaTinggi !== '' && d.namaTinggi != null) sp.setHeight(Number(d.namaTinggi) * pres.getPageHeight() / 595);
      } catch (e) { Logger.log('Area nama: ' + e.message); }
      try { sp.getText().replaceAllText('{{NAMA}}', d.nama || ' '); } catch (e) { Logger.log('Nama: ' + e.message); }
      try { if (d.font) sp.getText().getTextStyle().setFontFamily(d.font); } catch (e) { Logger.log('Font nama: ' + e.message); }
      try { sp.getText().getTextStyle().setFontSize(ukuranNama_(d.nama, d.font || 'Great Vibes', Number(d.namaUkuran) || dasar, sp.getWidth())); } catch (e) { Logger.log('Ukuran nama: ' + e.message); }
      return;
    }
    if (isi.indexOf('{{KETERANGAN}}') >= 0 && d.keterangan) {   // kalimat panjang: kecilkan seperlunya agar tetap 3 baris
      let dasar = 12;
      try { dasar = sp.getText().getTextStyle().getFontSize() || 12; } catch (e) {}
      const muat = 3 * (sp.getWidth() - 14.4) * 0.97 / (String(d.keterangan).length * 0.58);
      try { sp.getText().replaceAllText('{{KETERANGAN}}', d.keterangan); } catch (e) { Logger.log('Keterangan: ' + e.message); }
      try { sp.getText().getTextStyle().setFontSize(Math.round(Math.max(7, Math.min(dasar, muat)) * 2) / 2); } catch (e) {}
      return;
    }
    if (isi.indexOf('{{AREA_TTD}}') < 0) return;
    const L = sp.getLeft(), T = sp.getTop(), Wa = sp.getWidth(), Ha = sp.getHeight();
    sp.remove();
    const n = Math.max(ttd.length, 1), cw = Wa / n;
    // Ukuran seragam untuk semua kolom: dihitung dari teks terpanjang tiap baris (jabatan / nama / NIA),
    // sehingga "Ketua Umum", "Kabid Kader", dan "Sekretaris Umum" tampil sama besar dan tetap satu baris.
    const skalaHal = pres.getPageHeight() / 595, lebarKol = cw - 14.4;
    const pas = (teks, dasar, tebal) => {
      teks = String(teks || '');
      const kapital = teks === teks.toUpperCase() && /[A-Z]/.test(teks);
      const lebarHuruf = (tebal ? 0.66 : 0.62) * (kapital ? 1.18 : 1);
      return Math.min(dasar * skalaHal, lebarKol / (Math.max(teks.length, 1) * lebarHuruf));
    };
    const seragam = (daftar, dasar, tebal) => Math.round(Math.max(6, Math.min.apply(null,
      daftar.length ? daftar.map(t => pas(t, dasar, tebal)) : [dasar * skalaHal])) * 2) / 2;
    const adaNia = o => /[0-9A-Za-z]/.test(String(o.nia || ''));
    const ukJab = seragam(ttd.map(o => o.jabatan), UKURAN_SERTIFIKAT.jabatanTtd, false);
    const ukNamaPas = seragam(ttd.map(o => o.nama || '(' + o.jabatan + ')'), UKURAN_SERTIFIKAT.namaTtd, true);
    const ukNama = Math.max(ukNamaPas, Math.min(UKURAN_SERTIFIKAT.namaTtd * skalaHal, 9.5 * skalaHal));   // nama panjang boleh 2 baris
    const barisNama = ukNama > ukNamaPas + 0.1 ? 2 : 1;
    const ukNia = seragam(ttd.filter(adaNia).map(o => 'NIA. ' + o.nia), UKURAN_SERTIFIKAT.niaTtd, false);
    const tulis = (isiTeks, x, y, w, h, ukuran, opsi) => {
      opsi = opsi || {};
      const tb = sl.insertTextBox(isiTeks || ' ', x, y, w, h);
      const st = tb.getText().getTextStyle();
      st.setFontSize(ukuran).setFontFamily(d.font ? FONT_TEKS : 'Times New Roman').setForegroundColor('#222222').setBold(!!opsi.tebal);
      if (opsi.garisBawah) st.setUnderline(true);
      tb.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    };
    const hImg = Math.max(Ha - 72, 24);
    const cap = d.cap && d.cap.file ? d.cap : null;
    const posCap = cap ? Math.min(cap.posisi || 0, Math.max(ttd.length - 1, 0)) : -1;
    ttd.forEach((o, k) => {
      const x = L + k * cw;
      tulis(o.jabatan, x, T, cw, 20, ukJab);
      if (k === posCap) {               // cap di bawah tanda tangan, sedikit ke kiri (seperti stempel asli)
        try {
          const c = sl.insertImage(DriveApp.getFileById(cap.file).getBlob());
          const uk = Math.min(hImg + 26, cw * 0.62, 95), sk = uk / Math.max(c.getWidth(), c.getHeight());
          const w = c.getWidth() * sk, h = c.getHeight() * sk;
          c.setWidth(w).setHeight(h).setLeft(Math.max(L, x + cw / 2 - w * 0.85)).setTop(T + 26 + (hImg - h) / 2);
        } catch (e) { Logger.log('Cap: ' + e.message); }
      }
      if (o.file) {
        try {
          const g = sl.insertImage(DriveApp.getFileById(o.file).getBlob());
          const bw = Math.min(cw - 16, 165), sk = Math.min(bw / g.getWidth(), hImg / g.getHeight());
          const w = g.getWidth() * sk, h = g.getHeight() * sk;
          g.setWidth(w).setHeight(h).setLeft(x + (cw - w) / 2).setTop(T + 22 + (hImg - h) / 2);
        } catch (e) { Logger.log('TTD: ' + e.message); }
      }
      tulis(o.nama || '(' + o.jabatan + ')', x, T + 22 + hImg, cw, ukNama * 1.35 * barisNama + 6, ukNama, { tebal: true, garisBawah: true });
      if (adaNia(o)) tulis('NIA. ' + o.nia, x, T + 22 + hImg + ukNama * 1.35 * barisNama + 2, cw, 18, ukNia);
    });
  }));
  const ganti = {
    '{{SUBJUDUL}}': d.subjudul, '{{PERAN}}': d.peran,
    '{{NOMOR}}': d.nomor, '{{NAMA}}': d.nama, '{{IDENTITAS}}': d.identitas || '', '{{KALIMAT}}': d.kalimat,
    '{{PERAN_KEGIATAN}}': d.peranKegiatan, '{{KETERANGAN}}': d.keterangan, '{{KOTA_TANGGAL}}': d.kotaTanggal,
    // penanda template versi sebelumnya (jika masih dipakai)
    '{{JAB_KETUA}}': (ttd[0] || {}).jabatan, '{{KETUA}}': (ttd[0] || {}).nama, '{{NIA_KETUA}}': ttd[0] && ttd[0].nia ? 'NIA. ' + ttd[0].nia : '',
    '{{JAB_SEKRE}}': (ttd[1] || {}).jabatan, '{{SEKRE}}': (ttd[1] || {}).nama, '{{NIA_SEKRE}}': ttd[1] && ttd[1].nia ? 'NIA. ' + ttd[1].nia : '',
    '{{TTD_KETUA}}': '', '{{TTD_SEKRE}}': '',
    // penanda template lama (jika masih dipakai)
    '{{NPM}}': d.npm || '-', '{{KEGIATAN}}': d.kegiatan, '{{TANGGAL}}': d.tanggal, '{{TEMPAT}}': d.tempat
  };
  Object.keys(ganti).forEach(k => pres.replaceAllText(k, String(ganti[k] || '')));
  pres.saveAndClose();
  const pdf = folder.createFile(salinan.getAs('application/pdf').setName(namaFile));
  pdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  salinan.setTrashed(true);
  return pdf;
}

/** Pratinjau: sertifikat contoh (nama contoh) untuk satu kegiatan, tanpa dicatat. peran = 'Peserta' | 'Panitia' | peran lain. */
function pratinjauSertifikat(pw, idKeg, peran, desainCoba) {
  cek_(pw);
  const keg = rows_('KEGIATAN').find(r => r[0] === idKeg);
  if (!keg) throw new Error('Pilih kegiatan untuk pratinjau.');
  const desain = desainKegiatan_(keg);
  if (desainCoba) {                                      // pratinjau sebelum disimpan
    // Radio 'Ikuti umum' mengirim string kosong; pratinjau harus benar-benar mengikuti desain umum,
    // bukan diam-diam tetap memakai desain khusus kegiatan yang sedang dibuka.
    if (Object.prototype.hasOwnProperty.call(desainCoba, 'gaya')) {
      desain.gaya = GAYA_SERTIFIKAT[desainCoba.gaya] ? desainCoba.gaya : desainUmum_().gaya;
    }
    if (Object.prototype.hasOwnProperty.call(desainCoba, 'font')) {
      desain.font = FONT_NAMA.indexOf(desainCoba.font) >= 0 ? desainCoba.font : desainUmum_().font;
    }
    if (desainCoba.pesanPeserta) desain.pesanPeserta = desainCoba.pesanPeserta;
    if (desainCoba.pesanPanitia) desain.pesanPanitia = desainCoba.pesanPanitia;
    if (desainCoba.tampilkan && typeof desainCoba.tampilkan === 'object') desain.tampilkan = Object.assign({}, desain.tampilkan || {}, desainCoba.tampilkan);
    if (desainCoba.teksNama != null && String(desainCoba.teksNama).trim() !== '') desain.teksNama = String(desainCoba.teksNama);
    ['teksX','teksY','teksLebar','teksTinggi','namaX','namaY','namaLebar','namaTinggi','namaUkuran'].forEach(k => {
      if (desainCoba[k] !== undefined && desainCoba[k] !== '') desain[k] = angkaDesain_(desainCoba[k], k.toLowerCase().indexOf('ukuran') >= 0 ? 8 : 0, k.toLowerCase().indexOf('tinggi') >= 0 ? 595 : (k.toLowerCase().indexOf('lebar') >= 0 ? 842 : (k.toLowerCase().indexOf('ukuran') >= 0 ? 120 : 842)));
    });
  }
  peran = peran || 'Peserta';
  const lok = petaLokasi_()[keg[8]];
  const tempat = [lok ? lok.nama : '', keg[4]].filter(Boolean).join(', ') || CONFIG.SERTIFIKAT_KOTA;
  const tgl = tglIndo_(fmt_(keg[2]));
  // Gaya yang dipilih di formulir pratinjau menjadi sumber kebenaran. Jika memilih
  // 'Gambar sendiri', gunakan latar khusus kegiatan terlebih dahulu, lalu latar umum.
  const latarId = desain.gaya === 'u'
    ? (String(keg[12] || '').trim() || PropertiesService.getScriptProperties().getProperty('LATAR_SERTIFIKAT') || '')
    : '';
  const gayaTemplate = desain.gaya === 'u' && !latarId ? '2' : desain.gaya;
  const tpl = DriveApp.getFileById(templateSertifikat_(gayaTemplate));
  const kata = kataSertifikat_(keg[1], peran, desain, tgl, tempat);
  const dasar = dasarNomor_(keg);
  const props = PropertiesService.getScriptProperties();
  const lama = props.getProperty('PRATINJAU_SERTIFIKAT');
  if (lama) { try { DriveApp.getFileById(lama).setTrashed(true); } catch (e) {} }
  const pdf = cetakSertifikat_(tpl, folderSertifikat_(), {
    nomor: dasar[/^peserta/i.test(peran) ? 'peserta' : 'panitia'], nama: 'Muhammad Alif Ramadhan', npm: '2370233000',
    identitas: 'NPM/NIA: 2370233000', font: desain.font, teksNama: desain.teksNama,
    teksX: desain.teksX, teksY: desain.teksY, teksLebar: desain.teksLebar, teksTinggi: desain.teksTinggi,
    namaX: desain.namaX, namaY: desain.namaY, namaLebar: desain.namaLebar, namaTinggi: desain.namaTinggi, namaUkuran: desain.namaUkuran, tampilkan: desain.tampilkan,
    subjudul: kata.subjudul, peran: kata.peran, keterangan: kata.keterangan, kotaTanggal: CONFIG.SERTIFIKAT_KOTA + ', ' + tgl,
    kegiatan: keg[1], tanggal: tgl, tempat: tempat, latarId: latarId, ttd: ttdKegiatan_(keg), cap: capSertifikat_()
  , gaya: gayaTemplate}, 'PRATINJAU - ' + keg[1] + '.pdf');
  props.setProperty('PRATINJAU_SERTIFIKAT', pdf.getId());
  const peringatan = [];
  if (!props.getProperty('SERTIFIKAT_A4')) peringatan.push('Ukuran masih 16:9, belum A4. Tambahkan layanan "Google Slides API" di editor Apps Script (Layanan +), lalu pratinjau lagi.');
  if (desain.gaya !== 'u') { try { latarGaya_(desain.gaya); } catch (e) { peringatan.push('Latar gaya belum terambil: ' + e.message); } }
  return JSON.stringify({ url: pdf.getUrl(), peringatan: peringatan });
}

/** Peserta (status Hadir) + panitia yang ditandai aktif -> sertifikat PDF (yang belum punya). */
function buatSertifikatKegiatan_(keg, mulai) {
  mulai = mulai || Date.now();
  const idKeg = keg[0];
  const sudah = {};
  rows_('SERTIFIKAT').forEach(r => { if (r[0] === idKeg) sudah[r[2] + '|' + (r[8] || 'Peserta')] = true; });
  const kader = {};
  rows_('PESERTA').forEach(r => { kader[r[0]] = r; });
  const antre = [];
  const minH = minHadir_(keg), hdr = hitungHadir_(idKeg);           // hanya yang hadir minimal sekian hari
  const masuk = {};
  rows_('ABSENSI').forEach(r => {
    if (r[0] === idKeg && r[5] === 'Hadir' && !sudah[r[3] + '|Peserta'] && !masuk[r[3]] && (hdr.kader[r[3]] || 0) >= minH) {
      masuk[r[3]] = true; antre.push({ id: r[3], nama: r[4], peran: 'Peserta' });
    }
  });
  rows_('TAMU').forEach(r => {          // peserta umum / non-FAI lewat link khusus
    if (r[1] === idKeg && r[7] === 'Hadir' && (hdr.tamu[r[0]] || 0) >= minH && !sudah[r[0] + '|Peserta']) antre.push({ id: r[0], nama: r[2], peran: 'Peserta',
      identitas: [r[3] ? 'NPM: ' + r[3] : '', r[4]].filter(Boolean).join(' · '), email: String(r[5] || '').trim() });
  });
  rows_('PANITIA').forEach(r => {
    if (r[1] === idKeg && r[5] === 'Ya') {
      const idOrang = r[2] || r[0];
      if (!sudah[idOrang + '|' + r[4]]) antre.push({ id: idOrang, nama: r[3], peran: r[4] || 'Panitia' });
    }
  });
  if (!antre.length) return { dibuat: 0, sisa: 0 };

  const lok = petaLokasi_()[keg[8]];
  const tempat = [lok ? lok.nama : '', keg[4]].filter(Boolean).join(', ') || CONFIG.SERTIFIKAT_KOTA;
  const tgl = fmt_(keg[2]);
  const dasar = dasarNomor_(keg);
  const penandaTtd = ttdKegiatan_(keg);
  const cap = capSertifikat_();
  const desain = desainKegiatan_(keg);
  const latarId = desain.gaya === 'u' ? (String(keg[12] || '').trim() || PropertiesService.getScriptProperties().getProperty('LATAR_SERTIFIKAT') || '') : '';
  const tpl = DriveApp.getFileById(templateSertifikat_(desain.gaya === 'u' && !latarId ? '2' : desain.gaya));
  const folder = folderSertifikat_();

  let dibuat = 0;
  for (const o of antre) {
    if (Date.now() - mulai > 4.5 * 60 * 1000) break;      // batas waktu Apps Script
    const k = kader[o.id];
    const nomor = dasar[o.peran === 'Peserta' ? 'peserta' : 'panitia'];   // satu nomor per kelompok
    const nama = k ? k[1] : o.nama;
    const npm = k ? [k[2], k[10]].filter(Boolean).map(String).join(' / ') : (o.identitas || '');
    const peserta = o.peran === 'Peserta';
    const kata = kataSertifikat_(keg[1], o.peran, desain, tglIndo_(tgl), tempat);
    const pdf = cetakSertifikat_(tpl, folder, {
      nomor: nomor, nama: nama, npm: npm, font: desain.font, teksNama: desain.teksNama,
      teksX: desain.teksX, teksY: desain.teksY, teksLebar: desain.teksLebar, teksTinggi: desain.teksTinggi,
      namaX: desain.namaX, namaY: desain.namaY, namaLebar: desain.namaLebar, namaTinggi: desain.namaTinggi, namaUkuran: desain.namaUkuran, tampilkan: desain.tampilkan,
      subjudul: kata.subjudul, peran: kata.peran,
      identitas: k ? (npm ? 'NPM/NIA: ' + npm : '') : npm,
      kalimat: peserta ? 'Atas partisipasinya sebagai' : 'Atas dedikasi dan kontribusinya sebagai',
      peranKegiatan: o.peran + ' ' + keg[1],
      keterangan: kata.keterangan,
      kotaTanggal: CONFIG.SERTIFIKAT_KOTA + ', ' + tglIndo_(tgl),
      kegiatan: keg[1], tanggal: tglIndo_(tgl), tempat: tempat, latarId: latarId, ttd: penandaTtd, cap: cap, gaya: desain.gaya === 'u' && !latarId ? '2' : desain.gaya
    }, 'Sertifikat ' + o.peran + ' - ' + keg[1] + ' - ' + nama + '.pdf');
    sh_('SERTIFIKAT').appendRow([idKeg, keg[1], o.id, nama, nomor, pdf.getId(), pdf.getUrl(), new Date(), o.peran]);
    if (o.email) kirimSertifikatTamu_(o.email, nama, keg[1], pdf.getUrl());
    dibuat++;
  }
  return { dibuat: dibuat, sisa: antre.length - dibuat };
}

/**
 * Latar sertifikat dari gambar sendiri (mis. desain Canva, ukuran 16:9 / 1920x1080).
 * idKeg kosong = latar umum untuk semua kegiatan; idKeg diisi = latar khusus kegiatan itu.
 * berkas null + hapus=true = kembali ke latar sebelumnya (umum / bawaan).
 */
function simpanLatarSertifikat(pw, idKeg, berkas, hapus) {
  cek_(pw);
  const props = PropertiesService.getScriptProperties();
  let fid = '';
  if (!hapus) {
    if (!berkas || !berkas.data) throw new Error('Pilih gambar latar terlebih dahulu.');
    if (!/^image\/(png|jpe?g)$/.test(berkas.mime || '')) throw new Error('Latar harus gambar PNG atau JPG.');
    const fileLatar = folderSertifikat_().createFile(Utilities.newBlob(Utilities.base64Decode(berkas.data), berkas.mime,
      'Latar Sertifikat' + (idKeg ? ' - ' + idKeg : ' - Umum') + (berkas.mime === 'image/png' ? '.png' : '.jpg')));
    // Gambar latar memang perlu ditampilkan pada pratinjau di browser.
    fileLatar.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fid = fileLatar.getId();
  }
  kunci_(() => {
    if (!idKeg) {
      const lama = props.getProperty('LATAR_SERTIFIKAT');
      if (lama) { try { DriveApp.getFileById(lama).setTrashed(true); } catch (e) {} }
      if (fid) props.setProperty('LATAR_SERTIFIKAT', fid); else props.deleteProperty('LATAR_SERTIFIKAT');
      const du = desainUmum_();
      if (fid) du.gaya = 'u'; else if (du.gaya === 'u') du.gaya = '2';
      props.setProperty('DESAIN_SERTIFIKAT', JSON.stringify(du));
    } else {
      const sh = sh_('KEGIATAN'), v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 13).getValues();
      const i = v.findIndex(r => r[0] === idKeg);
      if (i < 0) throw new Error('Kegiatan tidak ditemukan.');
      if (v[i][12]) { try { DriveApp.getFileById(v[i][12]).setTrashed(true); } catch (e) {} }
      sh.getRange(i + 2, 13).setValue(fid);
      let dk = {};
      try { dk = JSON.parse(String(sh.getRange(i + 2, 17).getValue() || '') || '{}') || {}; } catch (e) {}
      if (fid) dk.gaya = 'u'; else if (dk.gaya === 'u') dk.gaya = '';
      sh.getRange(i + 2, 17).setValue(JSON.stringify(dk));
    }
  });
  return getData(pw);
}

// ----- Peserta umum (non-FAI / belum punya akun) lewat link khusus: <URL>?tamu=<ID kegiatan> -----
function daftarTamu_() {
  const sertif = {};
  rows_('SERTIFIKAT').forEach(r => { sertif[r[0] + '|' + r[2]] = r[6]; });
  return rows_('TAMU').map(r => ({ id: r[0], idKeg: r[1], nama: r[2], npm: String(r[3] || ''), asal: r[4], email: r[5],
    hp: String(r[6] || ''), status: r[7], waktu: fmt_(r[8], 'dd/MM HH:mm'), jarak: r[9], sertifikat: sertif[r[1] + '|' + r[0]] || '' }));
}
function infoTamu(idKeg) {
  const keg = rows_('KEGIATAN').find(r => r[0] === idKeg);
  if (!keg) throw new Error('Kegiatan tidak ditemukan. Periksa kembali link yang Anda terima.');
  const lok = petaLokasi_()[keg[8]];
  return { id: keg[0], nama: keg[1], tanggal: fmt_(keg[2]), waktu: fmt_(keg[3], 'HH:mm'), tempat: keg[4] || '',
    lokasi: lok ? { nama: lok.nama, radius: lok.radius } : null, status: statusKeg_(keg), sertifikat: keg[10] === 'Ya' || keg[14] === 'Ya',
    jumlahHari: jumlahHari_(keg), minHadir: minHadir_(keg), hariKe: hariKe_(keg), tanggalSelesai: tambahTgl_(fmt_(keg[2]), jumlahHari_(keg) - 1),
    penyelenggara: CONFIG.PENYELENGGARA, nama_sistem: CONFIG.NAMA_SISTEM };
}
/** Peserta umum absen Hadir (wajib di lokasi, GPS). Satu email = satu data per kegiatan. */
function absenTamu(idKeg, d, posisi) {
  d = d || {};
  const nama = String(d.nama || '').trim(), email = String(d.email || '').trim().toLowerCase();
  if (!nama) throw new Error('Nama lengkap wajib diisi.');
  if (!String(d.asal || '').trim()) throw new Error('Asal (prodi/fakultas/instansi) wajib diisi.');
  cekEmail_(email);
  let jarak = '', koordinat = '', hariTamu = 1, jmlTamu = 1;
  kunci_(() => {
    const keg = rows_('KEGIATAN').find(r => r[0] === idKeg);
    if (!keg) throw new Error('Kegiatan tidak ditemukan.');
    if (statusKeg_(keg) !== 'Buka') throw new Error('Absensi kegiatan ini sudah ditutup.');
    const lok = petaLokasi_()[keg[8]];
    if (!lok) throw new Error('Lokasi kegiatan belum diatur panitia.');
    if (!posisi || typeof posisi.lat !== 'number' || typeof posisi.lng !== 'number')
      throw new Error('Lokasi Anda tidak terbaca. Aktifkan GPS dan izinkan akses lokasi.');
    jarak = Math.round(jarak_(lok.lat, lok.lng, posisi.lat, posisi.lng));
    if (jarak > lok.radius) throw new Error('Anda berada ' + jarak + ' m dari ' + lok.nama + '. Absen hanya bisa dalam radius ' + lok.radius + ' m.');
    koordinat = posisi.lat.toFixed(6) + ', ' + posisi.lng.toFixed(6);
    const hari = hariKe_(keg);
    if (!hari) throw new Error('Hari ini bukan jadwal kegiatan ini (' + tglIndo_(fmt_(keg[2])) + ', ' + jumlahHari_(keg) + ' hari).');
    hariTamu = hari;
    const sh = sh_('TAMU'), v = sh.getDataRange().getValues();
    const i = v.findIndex((r, n) => n > 0 && r[1] === idKeg && String(r[5]).trim().toLowerCase() === email);
    const lama = i > 0 ? String(v[i][11] || '').split(',').map(x => x.trim()).filter(Boolean) : [];
    if (lama.indexOf(String(hari)) < 0) lama.push(String(hari));
    lama.sort((a, b) => a - b);
    const baris = [nama, d.npm ? "'" + String(d.npm).trim() : '', String(d.asal).trim(), email, d.hp ? "'" + String(d.hp).trim() : '',
      'Hadir', new Date(), jarak, koordinat, "'" + lama.join(',')];
    jmlTamu = lama.length;
    if (i > 0) sh.getRange(i + 1, 3, 1, baris.length).setValues([baris]);
    else sh.appendRow([idBaru_('TAMU', 'U'), idKeg].concat(baris));
  });
  return { ok: true, jarak: jarak, nama: nama, hari: hariTamu, jumlahHadir: jmlTamu };
}
/** Peserta umum mengecek / mengunduh sertifikatnya dengan email yang dipakai saat absen. */
function sertifikatTamu(idKeg, email) {
  email = String(email || '').trim().toLowerCase();
  const t = rows_('TAMU').find(r => r[1] === idKeg && String(r[5]).trim().toLowerCase() === email);
  if (!t) throw new Error('Email ini belum tercatat hadir di kegiatan ini.');
  const keg = rows_('KEGIATAN').find(r => r[0] === idKeg);
  const hadir = Math.max(1, String(t[11] || '').split(',').filter(x => x.trim()).length);
  const info = keg ? { jumlahHadir: hadir, jumlahHari: jumlahHari_(keg), minHadir: minHadir_(keg), kurang: hadir < minHadir_(keg) } : {};
  if (!keg || keg[14] !== 'Ya') return Object.assign({ nama: t[2], status: t[7], link: '', belumDibuka: true }, info);
  const s = rows_('SERTIFIKAT').find(r => r[0] === idKeg && r[2] === t[0]);
  return Object.assign({ nama: t[2], status: t[7], link: s ? s[6] : '' }, info);
}
function kirimSertifikatTamu_(email, nama, kegiatan, link) {
  try {
    if (MailApp.getRemainingDailyQuota() < 5) return;
    MailApp.sendEmail(email, 'Sertifikat ' + kegiatan + ' | ' + CONFIG.PENYELENGGARA,
      'Yth. ' + nama + ', terima kasih telah mengikuti ' + kegiatan + '. Sertifikat Anda: ' + link + '\n\n' + CONFIG.SALAM_PENUTUP,
      { name: pengirim_(), htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
        '<p>Yth. <b>' + esc_(nama) + '</b>,</p><p>Terima kasih telah mengikuti <b>' + esc_(kegiatan) + '</b>. Sertifikat Anda sudah tersedia:</p>' +
        '<p style="margin:18px 0"><a href="' + link + '" style="background:#8b1a1a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">📄 Unduh Sertifikat</a></p>' +
        '<p style="font-weight:bold;font-style:italic;color:#8b1a1a">' + esc_(CONFIG.SALAM_PENUTUP).replace(/\n/g, '<br>') + '</p>' +
        '<p>Hormat kami,<br><b>' + esc_(pengirim_()) + '</b></p></div>' });
  } catch (e) { Logger.log('Email sertifikat: ' + e.message); }
}

// ----- Panitia kegiatan -----
function daftarPanitia_() {
  const sertif = {};
  rows_('SERTIFIKAT').forEach(r => { if (r[8] && r[8] !== 'Peserta') sertif[r[0] + '|' + r[2] + '|' + r[8]] = r[6]; });
  return rows_('PANITIA').map(r => ({ id: r[0], idKeg: r[1], idKader: r[2], nama: r[3], peran: r[4], aktif: r[5] === 'Ya',
    sertifikat: sertif[r[1] + '|' + (r[2] || r[0]) + '|' + r[4]] || '' }));
}
function tambahPanitia(pw, idKeg, x) {
  cek_(pw);
  x = x || {};
  const peran = String(x.peran || '').trim() || 'Panitia';
  let nama = String(x.nama || '').trim(), idKader = String(x.idKader || '').trim();
  if (idKader) { const k = rows_('PESERTA').find(r => r[0] === idKader); if (!k) throw new Error('Kader tidak ditemukan.'); nama = k[1]; }
  if (!nama) throw new Error('Pilih kader atau tulis nama panitia.');
  if (!rows_('KEGIATAN').some(r => r[0] === idKeg)) throw new Error('Kegiatan tidak ditemukan.');
  kunci_(() => {
    if (rows_('PANITIA').some(r => r[1] === idKeg && r[4] === peran &&
        (idKader ? r[2] === idKader : String(r[3]).trim().toLowerCase() === nama.toLowerCase())))
      throw new Error(nama + ' sudah tercatat sebagai ' + peran + '.');
    sh_('PANITIA').appendRow([idBaru_('PANITIA', 'T'), idKeg, idKader, nama, peran, x.aktif === false ? 'Tidak' : 'Ya', new Date()]);
  });
  return getData(pw);
}
/** Tambah banyak panitia sekaligus. orang = [{idKader} | {nama}], peran sama untuk semua. Yang sudah tercatat dilewati. */
function tambahPanitiaMassal(pw, idKeg, peran, orang) {
  cek_(pw);
  peran = String(peran || '').trim() || 'Panitia';
  if (!Array.isArray(orang) || !orang.length) throw new Error('Pilih minimal satu nama.');
  if (!rows_('KEGIATAN').some(r => r[0] === idKeg)) throw new Error('Kegiatan tidak ditemukan.');
  const kader = {}; rows_('PESERTA').forEach(r => { kader[r[0]] = r; });
  let ditambah = 0, dilewati = 0;
  kunci_(() => {
    const ada = rows_('PANITIA').filter(r => r[1] === idKeg && r[4] === peran);
    const kunciAda = {}; ada.forEach(r => { kunciAda[r[2] ? 'K:' + r[2] : 'N:' + String(r[3]).trim().toLowerCase()] = 1; });
    const baru = [], kini = new Date();
    let n = rows_('PANITIA').reduce((m, r) => Math.max(m, parseInt(String(r[0]).replace('T', ''), 10) || 0), 0);
    orang.forEach(o => {
      const idK = String(o.idKader || '').trim();
      const nama = idK && kader[idK] ? String(kader[idK][1]) : String(o.nama || '').trim();
      if (!nama) return;
      const k = idK && kader[idK] ? 'K:' + idK : 'N:' + nama.toLowerCase();
      if (kunciAda[k]) { dilewati++; return; }
      kunciAda[k] = 1;
      baru.push(['T' + String(++n).padStart(3, '0'), idKeg, idK && kader[idK] ? idK : '', nama, peran, 'Ya', kini]);
    });
    if (baru.length) { const sh = sh_('PANITIA'); sh.getRange(sh.getLastRow() + 1, 1, baru.length, baru[0].length).setValues(baru); }
    ditambah = baru.length;
  });
  const d = getData(pw);
  d.hasilPanitia = { ditambah: ditambah, dilewati: dilewati };
  return d;
}
function ubahPanitia(pw, id, x) {
  cek_(pw);
  kunci_(() => {
    const sh = sh_('PANITIA'), v = sh.getDataRange().getValues();
    const i = v.findIndex((r, n) => n > 0 && r[0] === id);
    if (i < 0) throw new Error('Data panitia tidak ditemukan.');
    if (x.peran !== undefined) sh.getRange(i + 1, 5).setValue(String(x.peran).trim() || 'Panitia');
    if (x.aktif !== undefined) sh.getRange(i + 1, 6).setValue(x.aktif ? 'Ya' : 'Tidak');
  });
  return getData(pw);
}
function hapusPanitia(pw, id) { cek_(pw); kunci_(() => hapusBaris_('PANITIA', id)); return getData(pw); }
/** Bagian nomor surat setelah nomor urut. Jika admin belum mengisi, dibuat otomatis dari tanggal kegiatan. */
function dasarNomor_(keg, semua) {
  const tgl = fmt_(keg[2]);
  const bulan = BULAN_ROMAWI[parseInt(tgl.split('-')[1], 10) - 1] || '';
  const tahun = tgl.split('-')[0];
  // nomor urut kegiatan dalam tahun yang sama (urut tanggal), mis. kegiatan ke-3 tahun 2026 -> 003
  const urutan = (semua || rows_('KEGIATAN')).filter(r => fmt_(r[2]).slice(0, 4) === tahun)
    .sort((a, b) => (fmt_(a[2]) + a[0]).localeCompare(fmt_(b[2]) + b[0])).findIndex(r => r[0] === keg[0]) + 1;
  const no = String(Math.max(urutan, 1)).padStart(3, '0');
  const oto = kode => no + '/' + kode + '/' + CONFIG.SERTIFIKAT_KODE + '/' + bulan + '/' + tahun;
  return {
    peserta: String(keg[11] || '').trim() || oto(CONFIG.SERTIFIKAT_KODE_PESERTA),
    panitia: String(keg[13] || '').trim() || oto(CONFIG.SERTIFIKAT_KODE_PANITIA)
  };
}
/** Admin mengatur format nomor surat peserta & panitia (kosong = otomatis). */
function aturNomorSertifikat(pw, idKeg, x) {
  cek_(pw);
  if (typeof x === 'string') x = { peserta: x };
  x = x || {};
  kunci_(() => {
    const sh = sh_('KEGIATAN'), v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    const i = v.findIndex(r => r[0] === idKeg);
    if (i < 0) throw new Error('Kegiatan tidak ditemukan.');
    if (x.peserta !== undefined) sh.getRange(i + 2, 12).setValue(String(x.peserta || '').trim());
    if (x.panitia !== undefined) sh.getRange(i + 2, 14).setValue(String(x.panitia || '').trim());
  });
  return getData(pw);
}

/**
 * Admin membuka / menutup sertifikat satu kegiatan.
 * Dibuka  -> sertifikat diterbitkan (peserta hadir + panitia aktif + peserta umum) & bisa diunduh/dikirim email.
 * Ditutup -> sertifikat tidak tampil di aplikasi kader maupun link peserta umum (yang sudah terbit tetap tersimpan).
 */
function aturBukaSertifikat(pw, idKeg, buka) {
  cek_(pw);
  kunci_(() => {
    const sh = sh_('KEGIATAN'), v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    const i = v.findIndex(x => x[0] === idKeg);
    if (i < 0) throw new Error('Kegiatan tidak ditemukan.');
    sh.getRange(i + 2, 15).setValue(buka ? 'Ya' : '');
    if (buka) sh.getRange(i + 2, 11).setValue('Ya');
  });
  if (buka) { try { waSertifikat_(idKeg); } catch (e) {} }
  if (!buka) return getData(pw);
  return buatSertifikat(pw, idKeg);
}

/** WA ke peserta hadir, panitia aktif, dan peserta umum bahwa sertifikat bisa diunduh (sekali per kegiatan). */
function waSertifikat_(idKeg) {
  const w = pengaturanWA_();
  if (!w.aktif || !w.jenis.sertifikat || !w.token) return;
  const props = PropertiesService.getScriptProperties(), kunci = 'WA_SERTIF_' + idKeg;
  if (props.getProperty(kunci)) return;
  const keg = rows_('KEGIATAN').find(r => r[0] === idKeg); if (!keg) return;
  const idK = {};
  rows_('ABSENSI').forEach(r => { if (r[0] === idKeg && r[5] === 'Hadir') idK[r[3]] = 1; });
  rows_('PANITIA').forEach(r => { if (r[1] === idKeg && r[5] !== 'Tidak' && r[2]) idK[r[2]] = 1; });
  const hpKader = rows_('PESERTA').filter(r => idK[r[0]] && r[4]).map(r => r[4]);
  const url = urlAplikasi_();
  const h = kirimWA_(hpKader, '🏅 Sertifikat *' + keg[1] + '* sudah bisa diunduh.\nBuka SIMAK → menu Sertifikat:\n' + url + '/?masuk', 'sertifikat');
  rows_('TAMU').filter(r => r[1] === idKeg && r[7] === 'Hadir' && r[6]).forEach(r =>
    kirimWA_(r[6], '🏅 Sertifikat *' + keg[1] + '* atas nama ' + r[2] + ' sudah bisa diunduh:\n' + url + '/?tamu=' + r[0], 'sertifikat'));
  if (h.ok || !hpKader.length) props.setProperty(kunci, '1');
}

/** Tombol admin: terbitkan sertifikat yang belum ada (hanya bila sertifikat kegiatan sudah dibuka). */
function buatSertifikat(pw, idKeg) {
  cek_(pw);
  const keg = rows_('KEGIATAN').find(r => r[0] === idKeg);
  if (!keg) throw new Error('Kegiatan tidak ditemukan.');
  if (keg[14] !== 'Ya') throw new Error('Sertifikat kegiatan ini masih DITUTUP. Tekan "Buka" di tabel Buka / Tutup Sertifikat.');
  const hasil = buatSertifikatKegiatan_(keg);
  const data = getData(pw);
  data.hasilSertifikat = hasil;
  return data;
}

// =========================================================
//                  GALERI FOTO & VIDEO
// =========================================================
/** Folder Google Drive tempat foto/video disimpan (dibuat otomatis). */
function folderGaleri_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_GALERI');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  const f = DriveApp.createFolder(CONFIG.NAMA_SISTEM + ' - Galeri Kegiatan');
  props.setProperty('FOLDER_GALERI', f.getId());
  return f;
}

function galeri_() {
  const namaKeg = {};
  rows_('KEGIATAN').forEach(r => { namaKeg[r[0]] = r[1]; });
  return rows_('GALERI').map(r => ({
    id: r[0], idKeg: r[1], luar: !r[1], namaKeg: r[1] ? (namaKeg[r[1]] || '') : String(r[7] || ''), judul: r[2], tipe: r[3],
    fileId: r[4], link: r[5], dibuat: fmt_(r[6], 'yyyy-MM-dd HH:mm'), tanggal: fmt_(r[8] || '')
  })).sort((a, b) => b.dibuat.localeCompare(a.dibuat));
}

/** Info dokumentasi: untuk kegiatan tertentu, atau di luar kegiatan (rapat, silaturahmi, aksi, dll.). */
function infoMedia_(info) {
  info = info || {};
  const idKeg = String(info.idKeg || '').trim();
  if (idKeg && !rows_('KEGIATAN').some(r => r[0] === idKeg)) throw new Error('Kegiatan tidak ditemukan.');
  const tgl = String(info.tanggal || '').trim();
  if (tgl && !/^\d{4}-\d{2}-\d{2}$/.test(tgl)) throw new Error('Format tanggal tidak valid.');
  return { idKeg: idKeg, judul: rapiTeks_(info.judul || '').trim().slice(0, 200),
    acara: idKeg ? '' : rapiTeks_(info.acara || '').trim().slice(0, 150), tanggal: idKeg ? '' : tgl };
}
/** Upload 1 file foto/video (dikirim dari browser dalam bentuk base64). */
function uploadMedia(pw, info, file) {
  cek_(pw);
  info = infoMedia_(info);
  const tipe = /^image\//.test(file.mime) ? 'foto' : /^video\//.test(file.mime) ? 'video' : '';
  if (!tipe) throw new Error('File harus berupa foto atau video.');
  const bytes = Utilities.base64Decode(file.data);
  if (bytes.length > CONFIG.MAKS_UPLOAD_MB * 1024 * 1024) {
    throw new Error('Ukuran ' + file.nama + ' melebihi ' + CONFIG.MAKS_UPLOAD_MB +
      ' MB. Untuk video besar, upload ke YouTube/Drive lalu tempel link-nya.');
  }
  const f = folderGaleri_().createFile(Utilities.newBlob(bytes, file.mime, file.nama));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  kunci_(() => {
    const id = idBaru_('GALERI', 'G');
    sh_('GALERI').appendRow([id, info.idKeg, info.judul, tipe, f.getId(), f.getUrl(), new Date(), info.acara, info.tanggal ? "'" + info.tanggal : '']);
  });
  return getData(pw);
}

/** Tambah video/foto dari link YouTube atau Google Drive. */
function tambahLinkMedia(pw, info, link) {
  cek_(pw);
  info = infoMedia_(info);
  link = String(link || '').trim();
  let tipe = '', fid = '', m;
  if ((m = link.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/))) {
    tipe = 'youtube'; fid = m[1];
  } else if ((m = link.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]{20,})/))) {
    tipe = 'drive'; fid = m[1];
  } else {
    throw new Error('Link tidak dikenali. Gunakan link YouTube atau Google Drive.');
  }
  kunci_(() => {
    const id = idBaru_('GALERI', 'G');
    sh_('GALERI').appendRow([id, info.idKeg, info.judul, tipe, fid, link, new Date(), info.acara, info.tanggal ? "'" + info.tanggal : '']);
  });
  return getData(pw);
}

function hapusMedia(pw, id) {
  cek_(pw);
  const r = rows_('GALERI').find(x => x[0] === id);
  if (r && (r[3] === 'foto' || r[3] === 'video')) {
    try { DriveApp.getFileById(r[4]).setTrashed(true); } catch (e) {}
  }
  kunci_(() => hapusBaris_('GALERI', id));
  return getData(pw);
}

// =========================================================
//                        PESERTA
// =========================================================
// =========================================================
//            KEAMANAN AKUN KADER: PIN & SESI
// =========================================================
// Kolom Peserta: [8] hash PIN, [9] daftar token sesi (JSON), [10] NIA
function rahasia_() {
  const props = PropertiesService.getScriptProperties();
  let r = props.getProperty('RAHASIA');
  if (!r) { r = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('RAHASIA', r); }
  return r;
}
function hashPin_(idKader, pin) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    rahasia_() + ':' + idKader + ':' + String(pin)));
}
function cekFormatPin_(pin) {
  if (!/^\d{6}$/.test(String(pin || ''))) throw new Error('PIN harus 6 angka.');
}
function kaderByEmail_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) throw new Error('Email wajib diisi.');
  const p = rows_('PESERTA').find(r => String(r[3]).trim().toLowerCase() === email);
  if (!p) throw new Error('Email belum terdaftar. Silakan daftar terlebih dahulu.');
  return p;
}
function cekBatas_(email) {
  const n = Number(CacheService.getScriptCache().get('gagal:' + String(email).toLowerCase()) || 0);
  if (n >= 5) throw new Error('Terlalu banyak percobaan salah. Coba lagi 15 menit lagi.');
}
function catatGagal_(email) {
  const c = CacheService.getScriptCache(), k = 'gagal:' + String(email).toLowerCase();
  c.put(k, String(Number(c.get(k) || 0) + 1), 900);
}
function bacaSesi_(p) { try { return JSON.parse(p[9] || '[]'); } catch (e) { return []; } }
function buatSesi_(p) {
  const token = 'S' + Utilities.getUuid().replace(/-/g, '');
  const list = bacaSesi_(p).concat([token]).slice(-5);            // maksimal 5 perangkat
  sh_('PESERTA').getRange(barisKader_(p[0]), 10).setValue(JSON.stringify(list));
  return token;
}

/** Dipakai semua fungsi kader: email + token sesi dari loginKader. */
function verifikasi_(email, token) {
  const p = kaderByEmail_(email);
  if (!token || bacaSesi_(p).indexOf(String(token)) < 0) throw new Error('Sesi berakhir. Silakan masuk lagi.');
  return p;
}

/**
 * Login kader: email + NPM/NIA + PIN.
 * Kader yang belum punya PIN (lulus DAD / ditambah admin) diminta membuat PIN lewat kode email.
 */
function loginKader(email, nim, pin) {
  cekBatas_(email);
  const p = kaderByEmail_(email);
  const masuk = normalNomor_(nim), u = uraiNomor_(nim);
  const npm = normalNomor_(p[2]), nia = normalNomor_(p[10]);
  const cocok = x => x && (x === npm || x === nia);
  if ((npm || nia) && !(cocok(masuk) || cocok(normalNomor_(u.npm)) || cocok(normalNomor_(u.nia)))) {
    catatGagal_(email);
    const jenis = jenisNomor_(nim) || 'NPM/NIA';
    throw new Error(jenis + ' tidak cocok dengan email yang terdaftar.' +
      (jenis === 'NIA' && !nia ? ' NIA Anda belum tercatat, coba masuk dengan NPM.' : ''));
  }
  if (!p[8]) {
    kirimKodePin_(p, 'buat');
    return { perluPin: true, email: p[3] };
  }
  if (hashPin_(p[0], pin) !== p[8]) { catatGagal_(email); throw new Error('PIN salah.'); }
  CacheService.getScriptCache().remove('gagal:' + String(email).toLowerCase());
  const token = buatSesi_(p);
  return Object.assign(dataPeserta(p[3], token), { token: token });
}

function kirimKodePin_(p, jenis) {
  const kode = String(Math.floor(100000 + Math.random() * 900000));
  CacheService.getScriptCache().put('kodepin:' + String(p[3]).toLowerCase(), kode, 1800);
  const wa = p[4] ? kirimWA_(p[4], '🔐 Kode ' + (jenis === 'buat' ? 'membuat' : 'atur ulang') + ' PIN ' + CONFIG.NAMA_SISTEM + ': *' + kode +
    '*\nBerlaku 30 menit. Jangan berikan kode ini kepada siapa pun, termasuk pengurus.', 'pin') : { ok: false };
  if (MailApp.getRemainingDailyQuota() < 1) { if (wa.ok) return; throw new Error('Kuota email hari ini habis. Hubungi admin.'); }
  const judul = jenis === 'buat' ? 'Kode Membuat PIN' : 'Kode Atur Ulang PIN';
  MailApp.sendEmail(String(p[3]).trim(), judul + ' ' + CONFIG.NAMA_SISTEM + ': ' + kode,
    'Kode Anda: ' + kode + ' (berlaku 30 menit). Jangan berikan kode ini kepada siapa pun.',
    { name: pengirim_(), htmlBody:
      '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">' +
      '<p>Assalamu\'alaikum, <b>' + esc_(p[1]) + '</b>.</p>' +
      '<p>' + (jenis === 'buat' ? 'Untuk membuat PIN akun ' : 'Untuk mengatur ulang PIN akun ') + esc_(CONFIG.NAMA_SISTEM) + ', masukkan kode berikut:</p>' +
      '<p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#8b1a1a">' + kode + '</p>' +
      '<p>Kode berlaku 30 menit. <b>Jangan berikan kode ini kepada siapa pun</b>, termasuk pengurus.</p>' +
      '<p>Jika Anda tidak meminta kode ini, abaikan email ini.</p>' +
      '<p style="font-weight:bold;font-style:italic;color:#8b1a1a">' + esc_(CONFIG.SALAM_PENUTUP).replace(/\n/g, '<br>') + '</p></div>' });
}

/** "Lupa PIN": kirim kode ke email kader. */
function mintaKodePin(email) {
  cekBatas_(email);
  const p = kaderByEmail_(email);
  kirimKodePin_(p, p[8] ? 'lupa' : 'buat');
  return { email: p[3] };
}

/** Buat / atur ulang PIN dengan kode dari email, lalu langsung masuk. */
function aturPinDenganKode(email, kode, pinBaru) {
  cekBatas_(email);
  cekFormatPin_(pinBaru);
  const p = kaderByEmail_(email);
  const c = CacheService.getScriptCache(), k = 'kodepin:' + String(p[3]).toLowerCase();
  if (!kode || c.get(k) !== String(kode).trim()) { catatGagal_(email); throw new Error('Kode salah atau sudah kedaluwarsa.'); }
  c.remove(k);
  const baris = barisKader_(p[0]);
  sh_('PESERTA').getRange(baris, 9, 1, 2).setValues([[hashPin_(p[0], pinBaru), '[]']]);   // sesi lama dihapus
  p[8] = 'x'; p[9] = '[]';
  const token = buatSesi_(p);
  return Object.assign(dataPeserta(p[3], token), { token: token });
}

function gantiPin(email, token, pinLama, pinBaru) {
  const p = verifikasi_(email, token);
  cekFormatPin_(pinBaru);
  if (hashPin_(p[0], pinLama) !== p[8]) { catatGagal_(email); throw new Error('PIN lama salah.'); }
  sh_('PESERTA').getRange(barisKader_(p[0]), 9, 1, 2).setValues([[hashPin_(p[0], pinBaru), JSON.stringify([String(token)])]]);
  return dataPeserta(email, token);                                 // perangkat lain otomatis keluar
}

/** Kader mengubah profilnya sendiri (nama & No. HP). Email dan NPM/NIA tetap (kunci login). */
function ubahProfilKader(email, token, x) {
  const p = verifikasi_(email, token);
  const nama = String(x.nama || '').trim(), hp = String(x.hp || '').trim();
  if (!nama) throw new Error('Nama tidak boleh kosong.');
  const tglL = x.tanggalLahir !== undefined ? cekTglLahir_(x.tanggalLahir) : null;
  kunci_(() => {
    const b = barisKader_(p[0]);
    sh_('PESERTA').getRange(b, 2).setValue(nama);
    sh_('PESERTA').getRange(b, 5).setValue("'" + hp);
    if (x.tempatLahir !== undefined) pastikanKolomPeserta_().getRange(b, 13).setValue(String(x.tempatLahir || '').trim());
    if (tglL !== null) pastikanKolomPeserta_().getRange(b, 14).setValue(tglL ? "'" + tglL : '');
    if (nama !== p[1]) {                                   // nama di riwayat absensi ikut diperbarui
      const sa = sh_('ABSENSI'), la = sa.getLastRow();
      if (la >= 2) {
        const a = sa.getRange(2, 4, la - 1, 2).getValues();
        let ubah = false;
        a.forEach(r => { if (r[0] === p[0]) { r[1] = nama; ubah = true; } });
        if (ubah) sa.getRange(2, 4, la - 1, 2).setValues(a);
      }
    }
  });
  return dataPeserta(email, token);
}

function keluarKader(email, token) {
  try {
    const p = kaderByEmail_(email);
    sh_('PESERTA').getRange(barisKader_(p[0]), 10).setValue(JSON.stringify(bacaSesi_(p).filter(t => t !== token)));
  } catch (e) {}
  return true;
}

/** Admin: hapus PIN & semua sesi kader (kader membuat PIN baru lewat kode email). */
/** Admin mengatur PIN baru kader (mis. kader lupa PIN & tidak bisa buka email). Semua perangkat kader keluar. */
function aturPinKaderAdmin(pw, idKader, pinBaru) {
  cek_(pw);
  cekFormatPin_(pinBaru);
  sh_('PESERTA').getRange(barisKader_(idKader), 9, 1, 2).setValues([[hashPin_(idKader, String(pinBaru)), '[]']]);
  return getData(pw);
}

function resetPinKader(pw, idKader) {
  cek_(pw);
  sh_('PESERTA').getRange(barisKader_(idKader), 9, 1, 2).setValues([['', '[]']]);
  return getData(pw);
}

function dataPeserta(email, nim) {
  const p = verifikasi_(email, nim);
  if (!p[7]) { const id = pasangFotoDariDAD_(p); if (id) p[7] = id; }   // kader dari jalur DAD: pakai pas foto formulir
  const lokasi = petaLokasi_();
  const absenSaya = rows_('ABSENSI').filter(r => r[3] === p[0]);
  const statusSaya = {}, hariSaya = {};
  absenSaya.forEach(r => { statusSaya[r[0]] = r[5]; (hariSaya[r[0]] = hariSaya[r[0]] || {})[hariBaris_(r)] = r[5]; });

  const kegiatan = rows_('KEGIATAN').map(r => {
    const lok = lokasi[r[8]];
    const nHari = jumlahHari_(r), hk = hariKe_(r), hs = hariSaya[r[0]] || {};
    const hadirKali = Object.keys(hs).filter(h => hs[h] === 'Hadir').length;
    return {
      jumlahHari: nHari, hariKe: hk, minHadir: minHadir_(r), hadirKali: hadirKali, belumWaktu: hariIni_() < fmt_(r[2]), tanggalSelesai: tambahTgl_(fmt_(r[2]), nHari - 1),
      ringkas: nHari > 1 && statusSaya[r[0]] ? 'Hadir ' + hadirKali + '/' + nHari + ' hari' : '',
      id: r[0], nama: r[1], tanggal: fmt_(r[2]), waktu: fmt_(r[3], 'HH:mm'),
      tempat: r[4], ket: r[5], status: statusKeg_(r), saya: nHari > 1 ? (hs[hk] || '') : (statusSaya[r[0]] || ''), adaAbsen: !!statusSaya[r[0]],
      lokasi: lok ? { nama: lok.nama, lat: lok.lat, lng: lok.lng, radius: lok.radius } : null
    };
  });

  const rekap = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 };
  absenSaya.forEach(r => { rekap[r[5]] = (rekap[r[5]] || 0) + 1; });

  // sertifikat milik kader ini
  const sertifikat = {};
  const sertifikatLain = [];
  const dibuka = {};
  rows_('KEGIATAN').forEach(r => { if (r[14] === 'Ya') dibuka[r[0]] = true; });
  rows_('SERTIFIKAT').forEach(r => {
    if (r[2] !== p[0] || !dibuka[r[0]]) return;          // sertifikat tampil hanya jika sudah dibuka admin
    if (!r[8] || r[8] === 'Peserta') sertifikat[r[0]] = r[6];
    else sertifikatLain.push({ kegiatan: r[1], peran: r[8], link: r[6], dibuat: fmt_(r[7]) });
  });
  kegiatan.forEach(k => { k.sertifikat = sertifikat[k.id] || ''; });

  // pemberitahuan (terbaru di atas)
  const W = d => fmt_(d, 'yyyy-MM-dd HH:mm:ss');
  const notif = [];
  rows_('KEGIATAN').forEach(r => {
    if (!(r[6] instanceof Date)) return;
    const lok = lokasi[r[8]];
    notif.push({ waktu: W(r[6]), ikon: '📅', judul: 'Kegiatan baru: ' + r[1],
      isi: tglIndo_(r[2]) + (fmt_(r[3], 'HH:mm') ? ' · ' + fmt_(r[3], 'HH:mm') : '') + (lok ? ' · ' + lok.nama : '') });
  });
  galeri_().slice(0, 10).forEach(m => notif.push({ waktu: m.dibuat + ':00', ikon: m.tipe === 'foto' ? '🖼️' : '🎬',
    judul: (m.tipe === 'foto' ? 'Foto' : 'Video') + ' dokumentasi baru', isi: [m.judul, m.namaKeg].filter(Boolean).join(' · ') }));
  rows_('SERTIFIKAT').forEach(r => {
    if (r[2] === p[0] && r[7] instanceof Date && dibuka[r[0]]) notif.push({ waktu: W(r[7]), ikon: '📄',
      judul: 'Sertifikat tersedia' + (r[8] && r[8] !== 'Peserta' ? ' (' + r[8] + ')' : ''), isi: r[1], link: r[6] });
  });
  perkaderan_().forEach(x => {
    if (x.idKader === p[0] && x.status !== 'Menunggu' && x.diinput === 'Kader') notif.push({ waktu: x.diperbarui + ':00',
      ikon: x.status === 'Terverifikasi' ? '🎖️' : '⚠️', judul: 'Riwayat ' + x.jenjang + ' ' + x.status.toLowerCase(),
      isi: namaJenjang_(x.jenjang) + (x.tahun ? ' · ' + x.tahun : '') });
  });
  daftarPengumuman_().slice(0, 10).forEach(x => notif.push({ waktu: x.dibuat + ':00', ikon: '📢',
    judul: x.judul, isi: String(x.isi).slice(0, 80) }));
  notif.sort((a, b) => b.waktu.localeCompare(a.waktu));

  return bersih_({
    notif: notif.slice(0, 20),
    pengumuman: daftarPengumuman_().filter(x => x.umurHari <= 30).slice(0, 5),
    fotoProfil: p[7] && p[7] !== '-' ? String(p[7]) : '',
    perkaderan: perkaderanKader_(p),
    kta: p[11] ? true : false,
    sertifikatLain: sertifikatLain,
    jenjang: CONFIG.JENJANG_PERKADERAN,
    ntfyTopik: CONFIG.NTFY_TOPIK || '',
    sekarang: W(new Date()),
    profil: { id: p[0], nama: p[1], nim: String(p[2]), email: p[3], hp: String(p[4]), tahunDad: String(p[6] || ''),
              nia: String(p[10] || ''), tempatLahir: String(p[12] || ''), tanggalLahir: tglLahir_(p[13]) },
    syahadah: (s => ({ status: s.status, ditandai: p[14] === 'Sudah' || p[14] === 'Belum', nomor: s.nomor, predikat: s.predikat, berkas: !!s.berkas }))(syahadah_(p)),
    terbuka: kegiatan.filter(k => k.status === 'Buka').sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
    riwayat: kegiatan.filter(k => k.adaAbsen).map(k => Object.assign({}, k, { saya: k.jumlahHari > 1 ? (k.hadirKali ? 'Hadir' : (statusSaya[k.id] || '')) : k.saya }))
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    rekap: rekap,
    tidakHadir: absenSaya.filter(r => statusTidakHadir_(r[5])).length,
    batas: CONFIG.BATAS_TIDAK_HADIR,
    galeri: galeri_().slice(0, 40)
  });
}

function daftarPeserta(p) {
  if (!CONFIG.DAFTAR_MANDIRI) throw new Error('Pendaftaran mandiri sedang ditutup. Hubungi admin.');
  if (!p.nama || !p.email || !p.nim) throw new Error('Nama, NPM/NIA, dan email wajib diisi.');
  if (!p.tahunDad) throw new Error('Pilih tahun Anda mengikuti DAD.');
  if (!String(p.tempatLahir || '').trim() || !p.tanggalLahir) throw new Error('Tempat dan tanggal lahir wajib diisi.');
  const tglL = cekTglLahir_(p.tanggalLahir);
  cekFormatPin_(p.pin);
  cekEmail_(p.email);
  kunci_(() => {
    if (emailSudahAda_(p.email)) throw new Error('Email ini sudah terdaftar. Silakan masuk.');
    const no = pisahNomor_(p.nim, '');
    cekNomorUnik_(no.npm, no.nia, null);
    const id = idBaru_('PESERTA', 'P');
    sh_('PESERTA').appendRow([id, p.nama.trim(), no.npm ? "'" + no.npm : '', p.email.trim(),
      "'" + (p.hp || ''), new Date(), tahunDad_(p.tahunDad), '', hashPin_(id, p.pin), '[]', no.nia ? "'" + no.nia : '', '',
      String(p.tempatLahir).trim(), "'" + tglL, p.syahadah === 'Sudah' ? 'Sudah' : 'Belum', '', '', '']);
  });
  sambutKaderBaru_(p);
  const k = kaderByEmail_(p.email);
  const token = buatSesi_(k);
  return Object.assign(dataPeserta(p.email, token), { token: token });
}

/**
 * Kader absen sendiri.
 * Hadir  -> wajib mengirim posisi GPS dan harus berada di dalam radius lokasi.
 * Izin / Sakit -> boleh dari mana saja.
 */
function absenPeserta(email, nim, idKeg, status, posisi) {
  const p = verifikasi_(email, nim);
  if (['Hadir', 'Izin', 'Sakit'].indexOf(status) < 0) throw new Error('Pilihan tidak valid.');

  let jarak = '', koordinat = '';
  kunci_(() => {
    const keg = rows_('KEGIATAN').find(r => r[0] === idKeg);
    if (!keg) throw new Error('Kegiatan tidak ditemukan.');
    if (statusKeg_(keg) !== 'Buka') throw new Error('Absensi kegiatan ini sudah ditutup.');

    if (status === 'Hadir') {
      const lok = petaLokasi_()[keg[8]];
      if (!lok) throw new Error('Lokasi kegiatan belum diatur admin.');
      if (!posisi || typeof posisi.lat !== 'number' || typeof posisi.lng !== 'number') {
        throw new Error('Lokasi Anda tidak terbaca. Aktifkan GPS dan izinkan akses lokasi.');
      }
      jarak = Math.round(jarak_(lok.lat, lok.lng, posisi.lat, posisi.lng));
      if (jarak > lok.radius) {
        throw new Error('Anda berada ' + jarak + ' m dari ' + lok.nama +
          '. Absen hadir hanya bisa dalam radius ' + lok.radius + ' m.');
      }
      koordinat = posisi.lat.toFixed(6) + ', ' + posisi.lng.toFixed(6);
    }

    const nHari = jumlahHari_(keg), hari = hariKe_(keg);
    if (hariIni_() < fmt_(keg[2])) throw new Error('Absensi kegiatan ini baru dibuka mulai ' + tglIndo_(fmt_(keg[2])) + '.');
    if (!hari) {
      const mulaiK = fmt_(keg[2]), selesaiK = tambahTgl_(mulaiK, nHari - 1);
      throw new Error(hariIni_() < mulaiK ? 'Absensi kegiatan ini baru dibuka mulai ' + tglIndo_(mulaiK) + '.'
        : 'Kegiatan ini sudah berakhir (' + tglIndo_(mulaiK) + ' – ' + tglIndo_(selesaiK) + ').');
    }
    const sh = sh_('ABSENSI');
    const row = [keg[0], keg[1], nHari > 1 ? tambahTgl_(fmt_(keg[2]), hari - 1) : fmt_(keg[2]), p[0], p[1], status, new Date(), 'Peserta', jarak, koordinat,
      nHari > 1 ? hari : ''];
    const last = sh.getLastRow();
    if (last >= 2) {
      const v = sh.getRange(2, 1, last - 1, 11).getValues();
      for (let i = 0; i < v.length; i++) {
        if (v[i][0] === keg[0] && v[i][3] === p[0] && hariBaris_(v[i]) === hari) {
          sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
          return;
        }
      }
    }
    sh.appendRow(row);
  });

  const data = dataPeserta(email, nim);
  data.jarak = jarak;
  return data;
}

// =========================================================
//                  RIWAYAT PERKADERAN KADER
// =========================================================
function kodeJenjang_() { return CONFIG.JENJANG_PERKADERAN.map(j => j[0]); }
function namaJenjang_(k) { const j = CONFIG.JENJANG_PERKADERAN.find(x => x[0] === k); return j ? j[1] : k; }

function perkaderan_() {
  return rows_('PERKADERAN').map(r => ({
    id: r[0], idKader: r[1], nama: r[2], jenjang: r[3], tahun: String(r[4] || ''), penyelenggara: r[5] || '',
    status: r[6] || 'Menunggu', diperbarui: fmt_(r[7], 'yyyy-MM-dd HH:mm'), diinput: r[8] || ''
  }));
}

/** Riwayat satu kader. DAD diambil dari kolom "Tahun DAD" di data kader (otomatis terverifikasi). */
function perkaderanKader_(kader) {
  const daftar = perkaderan_().filter(x => x.idKader === kader[0] && x.jenjang !== 'DAD');
  if (kader[6]) daftar.unshift({ id: '', idKader: kader[0], jenjang: 'DAD', tahun: String(kader[6]),
    penyelenggara: '', status: 'Terverifikasi', diinput: 'Data kader' });
  const urut = kodeJenjang_();
  return daftar.sort((a, b) => urut.indexOf(a.jenjang) - urut.indexOf(b.jenjang));
}

function cekItemPerkaderan_(it, idKader) {
  if (kodeJenjang_().indexOf(it.jenjang) < 0) throw new Error('Jenjang perkaderan tidak dikenal.');
  if (it.jenjang === 'DAD') throw new Error('DAD dicatat lewat kolom "Tahun DAD" pada data kader.');
  const thn = tahunDad_(it.tahun);          // validasi tahun 1964..sekarang
  if (!thn) throw new Error('Isi tahun mengikuti ' + it.jenjang + '.');
  if (perkaderan_().some(x => x.idKader === idKader && x.jenjang === it.jenjang && x.status !== 'Ditolak')) {
    throw new Error('Riwayat ' + it.jenjang + ' sudah tercatat.');
  }
  return thn;
}

function simpanPerkaderan_(kader, it, status, oleh) {
  const thn = cekItemPerkaderan_(it, kader[0]);
  kunci_(() => {
    const id = idBaru_('PERKADERAN', 'R');
    sh_('PERKADERAN').appendRow([id, kader[0], kader[1], it.jenjang, thn, String(it.penyelenggara || '').trim(),
      status, new Date(), oleh]);
  });
}

/** Kader menambah riwayat perkaderannya sendiri (menunggu verifikasi admin). */
function tambahPerkaderanKader(email, nim, it) {
  const p = verifikasi_(email, nim);
  simpanPerkaderan_(p, it, 'Menunggu', 'Kader');
  return dataPeserta(email, nim);
}

/** Kader membatalkan riwayat yang belum diverifikasi. */
function hapusPerkaderanKader(email, nim, id) {
  const p = verifikasi_(email, nim);
  const x = perkaderan_().find(r => r.id === id);
  if (!x || x.idKader !== p[0]) throw new Error('Data tidak ditemukan.');
  if (x.status === 'Terverifikasi') throw new Error('Riwayat yang sudah diverifikasi hanya bisa diubah admin.');
  kunci_(() => hapusBaris_('PERKADERAN', id));
  return dataPeserta(email, nim);
}

/** Admin menambah riwayat untuk kader (langsung terverifikasi). */
function tambahPerkaderanAdmin(pw, idKader, it) {
  cek_(pw);
  const k = rows_('PESERTA').find(r => r[0] === idKader);
  if (!k) throw new Error('Kader tidak ditemukan.');
  if (it.jenjang === 'DAD') {                 // DAD = kolom Tahun DAD kader
    const sh = sh_('PESERTA');
    const v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    const i = v.findIndex(r => r[0] === idKader);
    sh.getRange(i + 2, 7).setValue(tahunDad_(it.tahun));
  } else {
    simpanPerkaderan_(k, it, 'Terverifikasi', 'Admin');
  }
  return getData(pw);
}

function verifikasiPerkaderan(pw, id, status) {
  cek_(pw);
  if (status !== 'Terverifikasi' && status !== 'Ditolak') throw new Error('Status tidak dikenal.');
  kunci_(() => {
    const sh = sh_('PERKADERAN');
    const v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    const i = v.findIndex(r => r[0] === id);
    if (i < 0) throw new Error('Data tidak ditemukan.');
    sh.getRange(i + 2, 7, 1, 2).setValues([[status, new Date()]]);
  });
  return getData(pw);
}

function hapusPerkaderan(pw, id) {
  cek_(pw);
  kunci_(() => hapusBaris_('PERKADERAN', id));
  return getData(pw);
}

// =========================================================
//          PENDAFTARAN CALON PESERTA DAD (BELUM KADER)
// =========================================================
function dataDAD_() {
  return rows_('DAD').map(r => ({
    id: r[0], nama: r[1], npm: String(r[2]), prodi: r[3], semester: String(r[4]), email: r[5],
    hp: String(r[6]), alamat: r[7], alasan: r[8], tanggal: fmt_(r[9], 'yyyy-MM-dd HH:mm'), status: normalTahap_(r[10]),
    diperbarui: fmt_(r[11], 'yyyy-MM-dd HH:mm'), catatan: r[12] || '',
    jk: r[13] || '', tempatLahir: r[14] || '', tglLahir: fmt_(r[15]), alamatAsal: r[16] || '', sosmed: r[17] || '',
    motto: r[18] || '', pt: r[19] || '', pendidikan: r[20] || '', organisasi: r[21] || '', buku: r[22] || '',
    karya: r[23] || '', target: r[24] || '', foto: r[25] || '', formulir: r[26] || '', tahunDaftar: String(r[27] || '')
  })).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

/** Formulir publik: calon kader yang belum/mau ikut DAD. */
/** Pemeriksaan isian formulir DAD (semua wajib kecuali bagian C). */
function validasiFormDAD_(p, fotoSudahAda) {
  if (!p.nama || !p.email || !p.hp) throw new Error('Nama, email, dan No. HP wajib diisi.');
  if (!p.setuju) throw new Error('Centang pernyataan komitmen terlebih dahulu.');
  const wajib = { jk: 'Jenis kelamin', npm: 'NPM', tempatLahir: 'Tempat lahir', tglLahir: 'Tanggal lahir',
    alamatAsal: 'Alamat asal', alamat: 'Alamat sekarang', sosmed: 'Sosial media', motto: 'Motto', pt: 'Perguruan tinggi',
    prodi: 'Program studi', semester: 'Semester', target: 'Target', motivasi: 'Motivasi' };
  const kurang = Object.keys(wajib).filter(k => !String(p[k] || '').trim()).map(k => wajib[k]);
  if (!(p.foto && p.foto.data) && !fotoSudahAda) kurang.push('Pas foto');
  ['SD', 'SMP', 'SMA', 'PT'].forEach(j => {
    const x = (p.pendidikan || []).find(y => y.jenjang === j) || {};
    if (!String(x.sekolah || '').trim() || (j !== 'PT' && !String(x.lulus || '').trim())) kurang.push('Riwayat pendidikan ' + j);
  });
  if (kurang.length) throw new Error('Wajib diisi: ' + kurang.join(', ') + '.');
  cekEmail_(p.email);
}

/** Isi kolom data formulir (kolom N..Y & AC) dari isian p. */
function kolomFormDAD_(p) {
  const teksBaris = (arr, f) => (arr || []).filter(x => Object.values(x).some(v => String(v || '').trim())).map(f).join('\n');
  const bersih = arr => (arr || []).filter(x => Object.keys(x).some(k => k !== 'jenjang' && String(x[k] || '').trim()));
  const data = { pendidikan: bersih(p.pendidikan), organisasi: bersih(p.organisasi), buku: bersih(p.buku), karya: bersih(p.karya) };
  return {
    pendidikan: teksBaris(data.pendidikan, x => x.jenjang + ': ' + (x.sekolah || '-') + (x.lulus ? ' (' + x.lulus + ')' : '')),
    organisasi: teksBaris(data.organisasi, x => (x.organisasi || '-') + ' — ' + (x.jabatan || '-') + (x.periode ? ' (' + x.periode + ')' : '')),
    buku: teksBaris(data.buku, x => (x.judul || '-') + ' — ' + (x.penulis || '-')),
    karya: teksBaris(data.karya, x => (x.judul || '-') + ' — ' + (x.media || '-')),
    json: JSON.stringify(data)
  };
}

/** Formulir publik: calon kader yang belum/mau ikut DAD. */
function daftarDAD(p) {
  validasiFormDAD_(p, false);
  const email = p.email.trim().toLowerCase();
  if (emailSudahAda_(email)) throw new Error('Email ini sudah terdaftar sebagai kader. Silakan masuk.');
  if (rows_('DAD').some(r => String(r[5]).trim().toLowerCase() === email)) {
    throw new Error('Email ini sudah terdaftar sebagai calon peserta DAD. Untuk memperbaiki data, gunakan Cek Status → Edit Formulir.');
  }

  const kini = new Date();
  const tahun = Utilities.formatDate(kini, CONFIG.ZONA_WAKTU, 'yyyy');
  const k = kolomFormDAD_(p);
  const fotoFile = folderFormulirDAD_().createFile(Utilities.newBlob(Utilities.base64Decode(p.foto.data), 'image/jpeg',
    'Foto - ' + p.nama.trim() + '.jpg'));
  const pdf = buatFormulirDAD_(p, kini);                 // tahun = tahun mendaftar
  const pdfFile = folderFormulirDAD_().createFile(pdf);

  kunci_(() => {
    if (rows_('DAD').some(r => String(r[5]).trim().toLowerCase() === email)) throw new Error('Email ini sudah terdaftar.');
    const id = idBaru_('DAD', 'D');
    sh_('DAD').appendRow([id, p.nama.trim(), "'" + String(p.npm || '').trim(), p.prodi || '', "'" + (p.semester || ''),
      p.email.trim(), "'" + p.hp, p.alamat || '', p.motivasi || '', kini, 'Terdaftar', kini, '',
      p.jk || '', p.tempatLahir || '', p.tglLahir ? "'" + p.tglLahir : '', p.alamatAsal || '', p.sosmed || '', p.motto || '',
      p.pt || '', k.pendidikan, k.organisasi, k.buku, k.karya, p.target || '',
      fotoFile.getUrl(), pdfFile.getUrl(), Number(tahun), k.json]);
  });
  try { kirimKonfirmasiDAD_(p, pdf); } catch (e) {}
  try { grupSetelahDaftarDAD_(); } catch (e) {}
  return { nama: p.nama.trim(), grupWA: CONFIG.LINK_GRUP_WA_DAD,
           pdf: Utilities.base64Encode(pdf.getBytes()), namaPdf: pdf.getName() };
}

// ----- Edit formulir oleh pendaftar sendiri (verifikasi: email + No. HP yang didaftarkan) -----
const TAHAP_BISA_EDIT = ['Terdaftar', 'Lolos Screening', 'Mengikuti DAD'];

function hpSama_(a, b) {
  const n = x => String(x || '').replace(/\D/g, '').replace(/^62/, '0').replace(/^0+/, '');
  return n(a).length >= 8 && n(a) === n(b);
}
function idDrive_(url) { const m = String(url || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }

function cariPendaftarDAD_(email, hp) {
  email = String(email || '').trim().toLowerCase();
  cekBatas_('pdf:' + email);
  const sh = sh_('DAD');
  const last = sh.getLastRow();
  const v = last >= 2 ? sh.getRange(2, 1, last - 1, SHEET.DAD.header.length).getValues() : [];
  const i = v.findIndex(r => String(r[5]).trim().toLowerCase() === email);
  if (i < 0 || !hpSama_(hp, v[i][6])) { catatGagal_('pdf:' + email); throw new Error('Email atau No. HP tidak cocok dengan data pendaftaran DAD.'); }
  if (TAHAP_BISA_EDIT.indexOf(normalTahap_(v[i][10])) < 0) {
    throw new Error('Formulir tidak bisa diubah lagi karena status pendaftaran sudah "' + normalTahap_(v[i][10]) + '". Hubungi panitia.');
  }
  return { baris: i + 2, r: v[i] };
}

/**
 * Pendaftar mengambil lagi formulir PDF-nya (lupa / hilang). Verifikasi: email + No. HP yang didaftarkan.
 * kirimEmail = true → PDF juga dikirim ulang ke email pendaftar.
 */
function ambilPdfFormulirDAD(email, hp, kirimEmail) {
  email = String(email || '').trim().toLowerCase();
  cekBatas_('pdf:' + email);
  const sh = sh_('DAD'), last = sh.getLastRow();
  const v = last >= 2 ? sh.getRange(2, 1, last - 1, SHEET.DAD.header.length).getValues() : [];
  const i = v.findIndex(r => String(r[5]).trim().toLowerCase() === email);
  if (i < 0 || !hpSama_(hp, v[i][6])) { catatGagal_('pdf:' + email); throw new Error('Email atau No. HP tidak cocok dengan data pendaftaran DAD.'); }
  const r = v[i];
  let pdf = null;
  try { pdf = DriveApp.getFileById(idDrive_(r[26])).getBlob(); } catch (e) {}
  if (!pdf) {                                      // berkas hilang: buat ulang dari data tersimpan
    const p = isianDariBaris_(r);
    if (r[25]) { try { p.foto = { data: Utilities.base64Encode(DriveApp.getFileById(idDrive_(r[25])).getBlob().getBytes()) }; } catch (e) {} }
    pdf = buatFormulirDAD_(p, r[9] instanceof Date ? r[9] : new Date());
  }
  const nama = 'Formulir DAD - ' + String(r[1]).trim() + '.pdf';
  try { pdf.setName(nama); } catch (e) {}
  let terkirim = false;
  if (kirimEmail && MailApp.getRemainingDailyQuota() > 0) {
    MailApp.sendEmail(String(r[5]).trim(), 'Formulir Pendaftaran DAD | ' + CONFIG.PENYELENGGARA,
      'Berikut formulir pendaftaran DAD Anda (terlampir). Silakan dicetak. ' + CONFIG.SALAM_PENUTUP,
      { name: pengirim_(), attachments: [pdf] });
    terkirim = true;
  }
  return { nama: String(r[1]).trim(), namaPdf: nama, pdf: Utilities.base64Encode(pdf.getBytes()), terkirim: terkirim, emailSamar: samarEmail_(r[5]) };
}

/** Ambil isian formulir untuk diedit. */
function ambilFormulirDAD(email, hp) {
  return isianDariBaris_(cariPendaftarDAD_(email, hp).r);
}
/** Isian formulir (bentuk sama dengan form) dari satu baris sheet Pendaftar DAD. */
function isianDariBaris_(r) {
  let d = {};
  try { d = JSON.parse(r[28] || '{}'); } catch (e) {}
  // data lama (sebelum ada kolom sistem): baca dari teks
  const pecah = (teks, f) => String(teks || '').split('\n').filter(Boolean).map(f);
  if (!d.pendidikan) d.pendidikan = pecah(r[20], b => { const m = b.match(/^(\w+):\s*(.*?)(?:\s*\((\d{4})\))?$/) || [];
    return { jenjang: m[1] || '', sekolah: m[2] || '', lulus: m[3] || '' }; });
  if (!d.organisasi) d.organisasi = pecah(r[21], b => { const [a, c = ''] = b.split(' — '); const m = c.match(/^(.*?)(?:\s*\((.*)\))?$/) || [];
    return { organisasi: a, jabatan: m[1] || '', periode: m[2] || '' }; });
  if (!d.buku) d.buku = pecah(r[22], b => { const [a, c = ''] = b.split(' — '); return { judul: a, penulis: c }; });
  if (!d.karya) d.karya = pecah(r[23], b => { const [a, c = ''] = b.split(' — '); return { judul: a, media: c }; });
  return {
    nama: r[1], npm: String(r[2]), prodi: r[3], semester: String(r[4]), email: r[5], hp: String(r[6]), alamat: r[7],
    motivasi: r[8], jk: r[13], tempatLahir: r[14], tglLahir: fmt_(r[15]), alamatAsal: r[16], sosmed: r[17], motto: r[18],
    pt: r[19], target: r[24], adaFoto: !!r[25], pendidikan: d.pendidikan, organisasi: d.organisasi, buku: d.buku, karya: d.karya
  };
}

/** Simpan perbaikan formulir + buat ulang PDF (tahun tetap tahun mendaftar). */
function ubahFormulirDAD(email, hp, p) {
  const ditemukan = cariPendaftarDAD_(email, hp);
  p.email = String(ditemukan.r[5]).trim();                 // email tidak bisa diganti (kunci data)
  validasiFormDAD_(p, !!ditemukan.r[25]);
  return simpanUbahDAD_(ditemukan, p, true);
}

// ----- Admin: buka & edit seluruh isian formulir pendaftar DAD -----
function barisDAD_(id) {
  const sh = sh_('DAD'), last = sh.getLastRow();
  const v = last >= 2 ? sh.getRange(2, 1, last - 1, SHEET.DAD.header.length).getValues() : [];
  const i = v.findIndex(r => r[0] === id);
  if (i < 0) throw new Error('Pendaftar DAD tidak ditemukan.');
  return { baris: i + 2, r: v[i] };
}
function ambilFormulirDADAdmin(pw, id) {
  cek_(pw);
  const x = isianDariBaris_(barisDAD_(id).r);
  x.id = id;
  return JSON.stringify(x);
}
/** Admin menyimpan perubahan (tanpa centang pernyataan & tanpa batas tahap); email boleh diganti. */
function ubahFormulirDADAdmin(pw, id, p) {
  cek_(pw);
  const ditemukan = barisDAD_(id);
  if (!String(p.nama || '').trim() || !String(p.email || '').trim() || !String(p.hp || '').trim()) {
    throw new Error('Nama, email, dan No. HP wajib diisi.');
  }
  cekEmail_(p.email);
  const email = p.email.trim().toLowerCase();
  if (rows_('DAD').some(r => r[0] !== id && String(r[5]).trim().toLowerCase() === email)) throw new Error('Email ini sudah dipakai pendaftar lain.');
  simpanUbahDAD_(ditemukan, p, false);
  return getData(pw);
}
/** Admin: buat ulang PDF formulir semua pendaftar (mis. setelah format formulir diperbarui). */
function buatUlangSemuaFormulirDAD(pw, mulaiDari) {
  cek_(pw);
  const mulai = Date.now(), semua = rows_('DAD').map(r => r[0]);
  let i = Math.max(0, Number(mulaiDari) || 0), dibuat = 0;
  for (; i < semua.length; i++) {
    if (Date.now() - mulai > 4.5 * 60 * 1000) break;
    try {
      const f = barisDAD_(semua[i]), p = isianDariBaris_(f.r);
      p.email = String(f.r[5]).trim();
      simpanUbahDAD_(f, p, false);
      dibuat++;
    } catch (e) { Logger.log('Formulir ' + semua[i] + ': ' + e.message); }
  }
  const d = getData(pw);
  d.hasilFormulir = { dibuat: dibuat, berikut: i, total: semua.length, selesai: i >= semua.length };
  return d;
}

/** Inti penyimpanan perubahan formulir: foto, PDF baru, kolom sheet. */
function simpanUbahDAD_(ditemukan, p, kirimEmail) {
  const lama = ditemukan.r;

  const folder = folderFormulirDAD_();
  let fotoUrl = lama[25];
  if (p.foto && p.foto.data) {                             // foto baru
    try { DriveApp.getFileById(idDrive_(lama[25])).setTrashed(true); } catch (e) {}
    fotoUrl = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.foto.data), 'image/jpeg',
      'Foto - ' + p.nama.trim() + '.jpg')).getUrl();
  } else if (lama[25]) {                                   // pakai foto lama untuk PDF
    try { p.foto = { data: Utilities.base64Encode(DriveApp.getFileById(idDrive_(lama[25])).getBlob().getBytes()) }; } catch (e) {}
  }
  const tglDaftar = lama[9] instanceof Date ? lama[9] : new Date();
  const pdf = buatFormulirDAD_(p, tglDaftar);
  try { DriveApp.getFileById(idDrive_(lama[26])).setTrashed(true); } catch (e) {}
  const pdfFile = folder.createFile(pdf);
  const k = kolomFormDAD_(p);

  kunci_(() => {
    const sh = sh_('DAD');
    const b = ditemukan.baris;
    sh.getRange(b, 2, 1, 8).setValues([[p.nama.trim(), "'" + String(p.npm || '').trim(), p.prodi || '', "'" + (p.semester || ''),
      p.email, "'" + p.hp, p.alamat || '', p.motivasi || '']]);
    sh.getRange(b, 12).setValue(new Date());
    sh.getRange(b, 14, 1, 16).setValues([[p.jk || '', p.tempatLahir || '', p.tglLahir ? "'" + p.tglLahir : '', p.alamatAsal || '',
      p.sosmed || '', p.motto || '', p.pt || '', k.pendidikan, k.organisasi, k.buku, k.karya, p.target || '',
      fotoUrl, pdfFile.getUrl(), lama[27], k.json]]);
  });
  if (kirimEmail) try {
    if (MailApp.getRemainingDailyQuota() > 0) MailApp.sendEmail(p.email, 'Formulir DAD Diperbarui | ' + CONFIG.PENYELENGGARA,
      'Formulir pendaftaran DAD Anda sudah diperbarui. Versi terbaru terlampir. ' + CONFIG.SALAM_PENUTUP,
      { name: pengirim_(), attachments: [pdf] });
  } catch (e) {}
  return { nama: p.nama.trim(), grupWA: CONFIG.LINK_GRUP_WA_DAD, diperbarui: true,
           pdf: Utilities.base64Encode(pdf.getBytes()), namaPdf: pdf.getName() };
}

// =========================================================
//                     FOTO PROFIL KADER
// =========================================================
function folderFotoProfil_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_FOTO_PROFIL');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(CONFIG.NAMA_SISTEM + ' - Foto Profil');   // privat
  props.setProperty('FOLDER_FOTO_PROFIL', f.getId());
  return f;
}

function barisKader_(idKader) {
  const sh = sh_('PESERTA');
  const v = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  const i = v.findIndex(r => r[0] === idKader);
  if (i < 0) throw new Error('Kader tidak ditemukan.');
  return i + 2;
}

/** Jika kader belum punya foto profil, ambil dari pas foto formulir DAD-nya (sekali saja). */
function pasangFotoDariDAD_(p) {
  try {
    const email = String(p[3]).trim().toLowerCase();
    const d = rows_('DAD').find(r => String(r[5]).trim().toLowerCase() === email && r[25]);
    if (!d) return '';
    const salinan = DriveApp.getFileById(idDrive_(d[25])).makeCopy('Profil - ' + p[1] + '.jpg', folderFotoProfil_());
    sh_('PESERTA').getRange(barisKader_(p[0]), 8).setValue(salinan.getId());
    return salinan.getId();
  } catch (e) { return ''; }
}

/** Foto profil (base64) — hanya untuk kader pemiliknya; disimpan privat di Drive. */
function ambilFotoProfil(email, nim) {
  const p = verifikasi_(email, nim);
  if (!p[7] || p[7] === '-') return null;
  try {
    const b = DriveApp.getFileById(String(p[7])).getBlob();
    return { id: String(p[7]), data: 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes()) };
  } catch (e) { return null; }
}

function ubahFotoProfil(email, nim, foto) {
  const p = verifikasi_(email, nim);
  if (!foto || !foto.data) throw new Error('Pilih foto terlebih dahulu.');
  const bytes = Utilities.base64Decode(foto.data);
  if (bytes.length > 2 * 1024 * 1024) throw new Error('Ukuran foto terlalu besar.');
  const f = folderFotoProfil_().createFile(Utilities.newBlob(bytes, 'image/jpeg', 'Profil - ' + p[1] + '.jpg'));
  if (p[7] && p[7] !== '-') { try { DriveApp.getFileById(String(p[7])).setTrashed(true); } catch (e) {} }
  sh_('PESERTA').getRange(barisKader_(p[0]), 8).setValue(f.getId());
  const d = dataPeserta(email, nim);
  d.fotoData = 'data:image/jpeg;base64,' + foto.data;
  return d;
}

function hapusFotoProfil(email, nim) {
  const p = verifikasi_(email, nim);
  if (p[7]) { try { DriveApp.getFileById(String(p[7])).setTrashed(true); } catch (e) {} }
  sh_('PESERTA').getRange(barisKader_(p[0]), 8).setValue('-');      // '-' = sengaja tanpa foto
  return dataPeserta(email, nim);
}


// =========================================================
//        WHATSAPP (gateway Fonnte: https://fonnte.com)
// =========================================================
// Token & pengaturan disimpan di Script Properties (diatur dari menu Administrasi → WhatsApp).
const JENIS_WA = [
  ['dadDaftar', 'Pendaftaran DAD diterima (ke pendaftar)', true],
  ['dadAdmin', 'Pendaftar DAD baru (ke nomor admin)', true],
  ['dadTahap', 'Perubahan tahap DAD: lolos screening, lulus, dll.', true],
  ['pin', 'Kode Lupa PIN / buat PIN', true],
  ['pengingat', 'Pengingat kegiatan H-1 (pukul 19.00, ke semua kader)', true],
  ['hariH', 'Absensi dibuka hari ini (pukul 06.00, ke semua kader)', false],
  ['peringatan', 'Peringatan tidak hadir berulang', true],
  ['sertifikat', 'Sertifikat sudah bisa diunduh', false],
  ['kaderBaru', 'Sambutan kader yang baru membuat akun (dengan motivasi & dalil)', true],
  ['grupSambut', 'Ucapan selamat datang di grup calon peserta DAD (tiap 5 pendaftar baru)', true],
  ['grupRekap', 'Daftar pendaftar DAD ke grup pengurus (tiap 5 pendaftar baru)', true],
  ['balas', 'Balas otomatis bila isi pesan PERSIS satu kata kunci: MENU, STATUS, JADWAL, DAFTAR, AKUN, MOTIVASI, ADMIN', false]
];
function pengaturanWA_() {
  let x = {};
  try { x = JSON.parse(PropertiesService.getScriptProperties().getProperty('WA_PENGATURAN') || '{}') || {}; } catch (e) {}
  const jenis = {};
  JENIS_WA.forEach(j => { jenis[j[0]] = x.jenis && typeof x.jenis[j[0]] === 'boolean' ? x.jenis[j[0]] : j[2]; });
  return { token: String(x.token || ''), aktif: !!x.aktif, noAdmin: String(x.noAdmin || ''), jenis: jenis, rahasia: String(x.rahasia || ''),
    grupCalon: String(x.grupCalon || ''), grupCalonNama: String(x.grupCalonNama || ''),
    grupPengurus: String(x.grupPengurus || ''), grupPengurusNama: String(x.grupPengurusNama || '') };
}
/** Kode rahasia di URL webhook supaya hanya Fonnte yang bisa memicu balasan. */
function rahasiaWA_() {
  const props = PropertiesService.getScriptProperties();
  let x = {}; try { x = JSON.parse(props.getProperty('WA_PENGATURAN') || '{}') || {}; } catch (e) {}
  if (!x.rahasia) { x.rahasia = Utilities.getUuid().replace(/-/g, '').slice(0, 16); props.setProperty('WA_PENGATURAN', JSON.stringify(x)); }
  return x.rahasia;
}
function urlWebhookWA_() {
  let u = ''; try { u = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  return u ? u + '?wa=' + rahasiaWA_() : '';
}
function infoWA_() {
  const w = pengaturanWA_();
  return { aktif: w.aktif, adaToken: !!w.token, tokenSamar: w.token ? w.token.slice(0, 3) + '•••••' + w.token.slice(-3) : '',
    noAdmin: w.noAdmin, jenis: w.jenis, webhook: urlWebhookWA_(), daftarJenis: JENIS_WA.map(j => ({ kode: j[0], label: j[1] })),
    grupCalon: w.grupCalon, grupCalonNama: w.grupCalonNama, grupPengurus: w.grupPengurus, grupPengurusNama: w.grupPengurusNama,
    grupDAD: (() => { try { const t = pendaftarDADTahunIni_(); return { tahun: t.tahun, total: t.semua.length, disambut: t.disambut }; } catch (e) { return null; } })(),
    log: rows_('LOGWA').slice(-8).reverse().map(r => ({ waktu: fmt_(r[0], 'dd/MM HH:mm'), jenis: r[1], tujuan: String(r[2]), jumlah: r[3], status: r[4], ket: String(r[5] || '') })) };
}
/** Admin menyimpan pengaturan WA. Token kosong = token lama dipakai. */
function simpanPengaturanWA(pw, x) {
  cek_(pw);
  x = x || {};
  const lama = pengaturanWA_(), jenis = {};
  JENIS_WA.forEach(j => { jenis[j[0]] = x.jenis && typeof x.jenis[j[0]] === 'boolean' ? x.jenis[j[0]] : lama.jenis[j[0]]; });
  const token = x.hapusToken ? '' : (String(x.token || '').trim() || lama.token);
  const noAdmin = x.noAdmin !== undefined ? String(x.noAdmin || '').trim() : lama.noAdmin;
  if (noAdmin && !nomorWA_(noAdmin)) throw new Error('Nomor WA admin tidak valid.');
  const grup = {};
  ['grupCalon', 'grupPengurus'].forEach(k => {
    const id = x[k] !== undefined ? String(x[k] || '').trim() : lama[k];
    if (id && !grupWA_(id)) throw new Error('ID grup WhatsApp tidak valid.');
    grup[k] = id;
    grup[k + 'Nama'] = x[k] !== undefined ? String(x[k + 'Nama'] || '').slice(0, 100) : lama[k + 'Nama'];
  });
  PropertiesService.getScriptProperties().setProperty('WA_PENGATURAN', JSON.stringify(Object.assign({
    token: token, aktif: x.aktif !== undefined ? !!x.aktif : lama.aktif, noAdmin: noAdmin, jenis: jenis, rahasia: lama.rahasia }, grup)));
  return getData(pw);
}
/** 0812… / +62 812… / 62812… → 62812… ; tidak valid → '' */
function nomorWA_(hp) {
  let n = rapiTeks_(hp).replace(/[^\d]/g, '');
  if (n.indexOf('0') === 0) n = '62' + n.slice(1);
  else if (n.indexOf('8') === 0) n = '62' + n;
  return /^62\d{8,13}$/.test(n) ? n : '';
}
/** ID grup WhatsApp dari Fonnte (mis. 120363xxxx@g.us) → sama; selain itu ''. */
function grupWA_(id) {
  const t = String(id || '').trim();
  return /^\d[\d-]{5,40}@g\.us$/.test(t) ? t : '';
}
function catatWA_(jenis, tujuan, jumlah, status, ket) {
  try { sh_('LOGWA').appendRow([new Date(), jenis, "'" + tujuan, jumlah, status, String(ket || '').slice(0, 300)]); } catch (e) {}
}
/** Kirim ke Fonnte. paksa = abaikan sakelar aktif/jenis (untuk tombol tes). Tidak pernah melempar galat. */
function kirimWA_(nomor, pesan, jenis, paksa) {
  const w = pengaturanWA_();
  const daftar = (Array.isArray(nomor) ? nomor : [nomor]).map(n => grupWA_(n) || nomorWA_(n)).filter(Boolean)
    .filter((n, i, a) => a.indexOf(n) === i);
  if (!w.token || !daftar.length) return { ok: false, alasan: !w.token ? 'Token belum diisi' : 'Nomor tidak valid' };
  if (!paksa && (!w.aktif || !w.jenis[jenis])) return { ok: false, alasan: 'Dimatikan' };
  const kaki = '\n\n_' + CONFIG.PENYELENGGARA + ' · pesan otomatis ' + CONFIG.NAMA_SISTEM + '_';
  let hasil;
  try {
    const r = UrlFetchApp.fetch('https://api.fonnte.com/send', {
      method: 'post', muteHttpExceptions: true, headers: { Authorization: w.token },
      payload: { target: daftar.join(','), message: pesan + kaki, countryCode: '62', delay: daftar.length > 1 ? '8-15' : '0', preview: 'false' }
    });
    let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) {}
    hasil = j.status ? { ok: true } : { ok: false, alasan: j.reason || j.detail || ('HTTP ' + r.getResponseCode()) };
  } catch (e) { hasil = { ok: false, alasan: e.message }; }
  catatWA_(jenis, daftar.length > 1 ? daftar.length + ' nomor' : (grupWA_(daftar[0]) ? 'grup ' + daftar[0].slice(-12) : daftar[0]), daftar.length, hasil.ok ? 'Terkirim' : 'Gagal', hasil.alasan || '');
  return hasil;
}
function tesWA(pw, nomor) {
  cek_(pw);
  const w = pengaturanWA_();
  if (!w.token) throw new Error('Isi dan simpan token Fonnte dulu.');
  const n = nomorWA_(nomor || w.noAdmin);
  if (!n) throw new Error('Isi nomor WA tujuan tes.');
  const h = kirimWA_(n, 'Assalamu\'alaikum. Ini pesan *tes* dari ' + CONFIG.NAMA_SISTEM + '. Jika pesan ini sampai, WhatsApp SIMAK sudah tersambung. ✅', 'tes', true);
  if (!h.ok) throw new Error('Gagal mengirim: ' + h.alasan);
  const d = getData(pw); d.hasilTesWA = n; return d;
}
// ----- Grup WhatsApp DAD: sambutan (grup calon peserta) & rekap pendaftar (grup pengurus) -----
/** Admin: minta Fonnte memperbarui lalu mengambil daftar grup yang diikuti nomor tersambung. */
function daftarGrupWA(pw) {
  cek_(pw);
  const w = pengaturanWA_();
  if (!w.token) throw new Error('Isi dan simpan token Fonnte dulu.');
  const opsi = { method: 'post', muteHttpExceptions: true, headers: { Authorization: w.token } };
  try { UrlFetchApp.fetch('https://api.fonnte.com/fetch-group', opsi); } catch (e) {}
  let j = {};
  try { j = JSON.parse(UrlFetchApp.fetch('https://api.fonnte.com/get-whatsapp-group', opsi).getContentText()) || {}; } catch (e) {}
  if (!j.status || !Array.isArray(j.data)) throw new Error('Gagal mengambil grup dari Fonnte: ' + (j.detail || j.reason || 'tidak ada respons') +
    '. Pastikan nomor WA SIMAK sudah masuk ke grupnya, tunggu 1 menit, lalu coba lagi.');
  return j.data.filter(g => grupWA_(g.id)).map(g => ({ id: String(g.id), nama: String(g.name || g.id).slice(0, 100) }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}
/** Pendaftar DAD tahun ini (urut daftar) + berapa yang sudah disambut di grup. */
function pendaftarDADTahunIni_() {
  const tahun = Number(Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy'));
  const semua = rows_('DAD').filter(r => Number(r[27]) === tahun);
  const disambut = Number(PropertiesService.getScriptProperties().getProperty('WA_GRUP_DAD_' + tahun) || 0);
  return { tahun: tahun, semua: semua, disambut: Math.min(disambut, semua.length) };
}
function pesanSambutGrupDAD_(baru) {
  return 'Assalamu\'alaikum warahmatullahi wabarakatuh 👋\n\n' +
    'Selamat datang di grup *Calon Peserta Darul Arqam Dasar (DAD)* ' + CONFIG.PENYELENGGARA + '.\n\n' +
    'Terima kasih sudah mendaftar dan bergabung:\n' +
    baru.map((r, i) => (i + 1) + '. *' + String(r[1]).trim() + '*' + (r[3] ? ' (' + r[3] + ')' : '')).join('\n') +
    '\n\nInformasi jadwal, persiapan, dan teknis DAD akan disampaikan di grup ini. Mohon aktif memantau grup ya 🤝\n\n' +
    'Fastabiqul khairat! ✊\nWassalamu\'alaikum warahmatullahi wabarakatuh';
}
function pesanRekapGrupDAD_(t) {
  const aktif = t.semua.filter(r => TAHAP_GAGAL.indexOf(String(r[10])) < 0);
  return '📋 *Rekap Pendaftar DAD ' + t.tahun + '*\nTotal: *' + aktif.length + ' orang*\n\n' +
    aktif.map((r, i) => (i + 1) + '. ' + String(r[1]).trim() + ' — ' + (r[3] || '-') + (r[4] ? ', smt ' + r[4] : '') +
      ' — ' + (String(r[6] || '').trim() || '-') + (r[10] && r[10] !== 'Terdaftar' ? ' [' + r[10] + ']' : '')).join('\n') +
    '\n\nDetail lengkap: SIMAK → Admin → tab DAD';
}
/** Dipanggil setelah pendaftaran DAD: tiap terkumpul 5 pendaftar yang belum disambut → sambut di grup calon + rekap ke grup pengurus. */
function grupSetelahDaftarDAD_() {
  const w = pengaturanWA_();
  if (!w.token || !w.aktif || (!w.grupCalon && !w.grupPengurus)) return;
  let t, baru = [];
  kunci_(() => {
    t = pendaftarDADTahunIni_();
    if (t.semua.length - t.disambut < 5) return;
    baru = t.semua.slice(t.disambut);
    PropertiesService.getScriptProperties().setProperty('WA_GRUP_DAD_' + t.tahun, String(t.semua.length));
  });
  if (!baru.length) return;
  if (w.grupCalon) kirimWA_(w.grupCalon, pesanSambutGrupDAD_(baru), 'grupSambut');
  if (w.grupPengurus) kirimWA_(w.grupPengurus, pesanRekapGrupDAD_(t), 'grupRekap');
}
/** Admin: kirim sekarang. apa = 'sambut' (pendaftar yang belum disambut) | 'rekap' (daftar lengkap ke grup pengurus). */
function kirimGrupDAD(pw, apa) {
  cek_(pw);
  const w = pengaturanWA_();
  if (!w.token) throw new Error('Isi dan simpan token Fonnte dulu.');
  let h;
  if (apa === 'rekap') {
    if (!w.grupPengurus) throw new Error('Pilih & simpan grup pengurus dulu.');
    const t = pendaftarDADTahunIni_();
    if (!t.semua.length) throw new Error('Belum ada pendaftar DAD tahun ' + t.tahun + '.');
    h = kirimWA_(w.grupPengurus, pesanRekapGrupDAD_(t), 'grupRekap', true);
  } else {
    if (!w.grupCalon) throw new Error('Pilih & simpan grup calon peserta dulu.');
    let t, baru = [];
    kunci_(() => { t = pendaftarDADTahunIni_(); baru = t.semua.slice(t.disambut); });
    if (!baru.length) throw new Error('Semua pendaftar sudah disambut di grup.');
    h = kirimWA_(w.grupCalon, pesanSambutGrupDAD_(baru), 'grupSambut', true);
    if (h.ok) kunci_(() => PropertiesService.getScriptProperties().setProperty('WA_GRUP_DAD_' + t.tahun, String(t.disambut + baru.length)));
  }
  if (!h.ok) throw new Error('Gagal mengirim: ' + h.alasan);
  return getData(pw);
}

// ----- Balas otomatis: Fonnte mengirim pesan masuk ke webhook (doPost) -----
function doPost(e) {
  try {
    const prm = (e && e.parameter) || {};
    let d = {};
    try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; } catch (er) { d = prm; }
    const w = pengaturanWA_();
    if (!w.rahasia || prm.wa !== w.rahasia) { catatWA_('masuk', '-', 0, 'Ditolak', 'Kode ?wa= di URL webhook salah / terpotong'); return ContentService.createTextOutput('no'); }
    const sender = String(d.sender || ''), pesan = String(d.message || d.text || '').trim();
    if (!sender || !pesan) { catatWA_('masuk', sender || '-', 0, 'Diabaikan', 'Pesan kosong · data: ' + JSON.stringify(d).slice(0, 200)); return ContentService.createTextOutput('skip'); }
    if (d.member || /@g\.us|-/.test(sender)) return ContentService.createTextOutput('skip');   // pesan grup tidak dibalas
    // Fonnte juga meneruskan pesan KELUAR (balasan SIMAK sendiri). Abaikan supaya tidak terjadi balasan berantai/dobel.
    // Pesan yang DIKETIK SENDIRI dari nomor WA SIMAK (mis. admin chat ke teman) juga diteruskan Fonnte -> jangan dibalas.
    if (/pesan otomatis/i.test(pesan) || pesan.length > 80 || pesanSendiri_(d, sender)) {
      catatWA_('masuk', sender, 1, 'Diabaikan', 'Pesan keluar dari nomor SIMAK sendiri · ' + ringkasWebhook_(d));
      return ContentService.createTextOutput('self');
    }
    // Cegah balasan dobel: Fonnte bisa mengirim ulang webhook yang sama. Satu kata kunci dari satu nomor dibalas sekali per 2 menit.
    const c = CacheService.getScriptCache();
    const kata = rapiTeks_(pesan).toLowerCase().replace(/[^\w\s]/g, ' ').trim().split(/\s+/)[0] || '';
    const k1 = 'wa_in_' + nomorWA_(sender) + '_' + kata.slice(0, 20), k2 = d.inboxid ? 'wa_ib_' + String(d.inboxid).slice(0, 60) : '';
    const lock = LockService.getScriptLock();
    try { lock.waitLock(15000); } catch (er) { return ContentService.createTextOutput('busy'); }
    try {
      if (c.get(k1) || (k2 && c.get(k2))) return ContentService.createTextOutput('dup');
      c.put(k1, '1', 120); if (k2) c.put(k2, '1', 3600);
    } finally { lock.releaseLock(); }
    const balasan = balasanWA_(sender, pesan, String(d.name || ''));
    if (!balasan) catatWA_('masuk', sender, 1, 'Diterima', 'Bukan kata kunci, tidak dibalas · ' + ringkasWebhook_(d));
    else if (!w.aktif || !w.jenis.balas) catatWA_('masuk', sender, 1, 'Tidak dibalas', 'WA otomatis / Balas otomatis belum dicentang & disimpan di SIMAK');
    else kirimWA_(sender, balasan, 'balas');
  } catch (er) { Logger.log('doPost WA: ' + er.message); }
  return ContentService.createTextOutput('ok');
}
const KATA_KUNCI_WA = ['menu', 'status', 'jadwal', 'daftar', 'akun', 'motivasi', 'admin'];
/** Menyusun balasan berdasarkan kata kunci. Pesan tanpa kata kunci TIDAK dibalas (supaya chat biasa tidak terganggu). */
function balasanWA_(sender, pesan, nama) {
  // Hanya pesan yang ISINYA PERSIS satu kata kunci (boleh huruf besar/kecil, boleh diawali # atau /) yang dibalas.
  // "semangat ya", "menu nya apa", dll. tidak dibalas supaya chat biasa tidak terganggu.
  const t = rapiTeks_(pesan).toLowerCase().replace(/[^\w\s]/g, ' ').trim();
  const kata = /\s/.test(t) ? '' : t;
  if (KATA_KUNCI_WA.indexOf(kata) < 0) return '';
  const url = urlAplikasi_(), w = pengaturanWA_();
  const MENU = '📋 *Menu ' + CONFIG.NAMA_SISTEM + ' — ' + CONFIG.PENYELENGGARA + '*\nBalas dengan kata berikut:\n\n' +
    '*STATUS* — cek status pendaftaran DAD / akun kader\n*JADWAL* — kegiatan terdekat\n*DAFTAR* — link pendaftaran DAD\n' +
    '*AKUN* — link masuk SIMAK & lupa PIN\n*MOTIVASI* — motivasi & dalil penyemangat\n*ADMIN* — kontak pengurus';
  if (['menu'].indexOf(kata) >= 0) return 'Assalamu\'alaikum' + (nama ? ', ' + nama : '') + ' 👋\n\n' + MENU;
  if (['status'].indexOf(kata) >= 0) {
    const kader = rows_('PESERTA').find(r => hpSama_(sender, r[4]));
    if (kader) {
      const a = rows_('ABSENSI').filter(r => r[3] === kader[0]), hadir = a.filter(r => r[5] === 'Hadir').length;
      return '✅ Nomor ini terdaftar sebagai *kader* atas nama *' + kader[1] + '*' + (kader[6] ? ' (DAD ' + kader[6] + ')' : '') +
        '.\nKehadiran: ' + hadir + ' dari ' + a.length + ' kegiatan.\nSyahadah DAD: ' + syahadah_(kader).status + '\n\nMasuk SIMAK: ' + url + '/?masuk';
    }
    try {
      const st = cekStatusDAD(sender);
      return '📝 Pendaftaran DAD atas nama *' + st.nama + '*\nStatus: *' + st.status + '*' + (st.tanggal ? '\nTanggal daftar: ' + st.tanggal : '') +
        (st.grupWA ? '\n\nGrup calon peserta DAD:\n' + st.grupWA : '') + '\n\nDetail: ' + url + '/?status';
    } catch (er) {
      return 'Nomor ini belum terdaftar sebagai calon peserta DAD maupun kader.\nDaftar DAD: ' + url + '/?dad\nSudah pernah DAD? Buat akun: ' + url + '/?kader';
    }
  }
  if (['jadwal'].indexOf(kata) >= 0) {
    const kini = hariIni_(), lokasi = petaLokasi_();
    const k = rows_('KEGIATAN').filter(r => tambahTgl_(fmt_(r[2]), jumlahHari_(r) - 1) >= kini)
      .sort((a, b) => fmt_(a[2]).localeCompare(fmt_(b[2]))).slice(0, 5);
    if (!k.length) return '📅 Belum ada kegiatan terjadwal. Pantau terus info dari pengurus ya.';
    return '📅 *Kegiatan terdekat*\n\n' + k.map((r, i) => {
      const lok = lokasi[r[8]], n = jumlahHari_(r), waktu = fmt_(r[3], 'HH:mm');
      return (i + 1) + '. *' + r[1] + '*\n   ' + tglIndo_(fmt_(r[2])) + (n > 1 ? ' – ' + tglIndo_(tambahTgl_(fmt_(r[2]), n - 1)) : '') +
        (waktu ? ', ' + waktu : '') + ([lok ? lok.nama : '', r[4]].filter(Boolean).length ? '\n   📍 ' + [lok ? lok.nama : '', r[4]].filter(Boolean).join(' · ') : '');
    }).join('\n\n') + '\n\nAbsen lewat SIMAK: ' + url + '/?masuk';
  }
  if (['daftar'].indexOf(kata) >= 0)
    return '📝 *Pendaftaran Darul Arqam Dasar (DAD)*' + (jadwalDAD_() ? '\nJadwal: ' + jadwalDAD_() : '') +
      '\n\nIsi formulir di sini:\n' + url + '/?dad\n\nCek status pendaftaran: ' + url + '/?status';
  if (['akun'].indexOf(kata) >= 0)
    return '🔑 *Masuk SIMAK*\n' + url + '/?masuk\n\nMasuk dengan email + NPM/NIA + PIN. Lupa PIN? Tekan *Lupa PIN?* di halaman masuk, kode dikirim ke email' +
      (w.jenis.pin ? ' dan WhatsApp' : '') + '.\n\nSudah DAD tapi belum punya akun? ' + url + '/?kader';
  if (['motivasi'].indexOf(kata) >= 0)
    return 'Assalamu\'alaikum' + (nama ? ', ' + nama : '') + ' 🌱\n\n' + teksDalil_(DALIL_KADER.concat(DALIL_DAD)) +
      '\n\n_Balas *MOTIVASI* lagi lain waktu untuk motivasi lainnya._';
  if (['admin'].indexOf(kata) >= 0)
    return '📞 *Kontak ' + CONFIG.PENYELENGGARA + '*\n' + (w.noAdmin ? 'WhatsApp: wa.me/' + nomorWA_(w.noAdmin) + '\n' : '') + 'Email: pkimmfaiumbengkulu@gmail.com';
  return '';
}

/** Tanda-tanda pesan keluar (dikirim dari nomor yang tersambung di Fonnte), dari berbagai nama field yang mungkin. */
function pesanSendiri_(d, sender) {
  const ya = v => v === true || v === 1 || /^(true|1|yes|out|outgoing|sent|me)$/i.test(String(v == null ? '' : v));
  if (['fromMe', 'from_me', 'isFromMe', 'isfromme', 'is_from_me', 'self', 'isMe', 'fromme', 'outgoing'].some(k => ya(d[k]))) return true;
  if (['direction', 'type', 'status_message', 'msgType'].some(k => /^(out|outgoing|sent|send)$/i.test(String(d[k] || '')))) return true;
  const dev = nomorWA_(d.device || ''), pengirim = nomorWA_(sender);
  return !!(dev && pengirim && dev === pengirim);
}
/** Ringkasan isi webhook untuk Riwayat (tanpa isi pesan panjang) — membantu melacak field dari Fonnte. */
function ringkasWebhook_(d) {
  const o = {};
  Object.keys(d || {}).forEach(k => { if (k !== 'message' && k !== 'text') o[k] = String(d[k]).slice(0, 25); });
  return 'pesan: "' + String(d.message || d.text || '').slice(0, 20) + '" · ' + JSON.stringify(o).slice(0, 220);
}

/** Admin: SIMAK mengirim pesan "MENU" palsu ke webhook-nya sendiri, untuk memastikan bagian penerima berjalan. */
function tesWebhookWA(pw, nomor) {
  cek_(pw);
  const w = pengaturanWA_(), url = urlWebhookWA_(), n = nomorWA_(nomor || w.noAdmin);
  if (!url) throw new Error('URL webhook belum tersedia. Pastikan aplikasi sudah di-deploy.');
  if (!n) throw new Error('Isi nomor tujuan tes.');
  const r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', followRedirects: false, muteHttpExceptions: true,
    payload: JSON.stringify({ sender: n, message: 'menu', name: 'Tes Webhook', timestamp: String(Date.now()) }) });
  Utilities.sleep(1500);
  const d = getData(pw);
  d.hasilTesWebhook = { kode: r.getResponseCode(), nomor: n };
  return d;
}

/** Pemicu harian 06.00 & 19.00: pengingat kegiatan. */
function pengingatWA(e) {
  pemicu_(e);
  const w = pengaturanWA_();
  if (!w.aktif || !w.token) return;
  const jam = Number(Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'H'));
  const pagi = jam < 12, hariIni = hariIni_(), besok = tambahTgl_(hariIni, 1);
  if (pagi ? !w.jenis.hariH : !w.jenis.pengingat) return;
  const props = PropertiesService.getScriptProperties(), lokasi = petaLokasi_();
  const hp = rows_('PESERTA').map(r => r[4]).filter(Boolean);
  rows_('KEGIATAN').forEach(r => {
    if (statusKeg_(r) !== 'Buka' && fmt_(r[2]) < hariIni) return;
    const mulai = fmt_(r[2]), n = jumlahHari_(r), selesai = tambahTgl_(mulai, n - 1);
    const kena = pagi ? (hariIni >= mulai && hariIni <= selesai) : mulai === besok;
    if (!kena) return;
    const kunci = 'WA_INGAT_' + r[0] + '_' + (pagi ? hariIni : 'besok');
    if (props.getProperty(kunci)) return;
    const lok = lokasi[r[8]], waktu = fmt_(r[3], 'HH:mm');
    const hk = pagi && n > 1 ? ' (hari ke-' + (selisihHari_(mulai, hariIni) + 1) + ' dari ' + n + ')' : '';
    const pesan = (pagi ? '📝 *Absensi dibuka hari ini*' : '📅 *Pengingat kegiatan besok*') + '\n\n' +
      '*' + r[1] + '*' + hk + '\n🗓️ ' + tglIndo_(pagi ? hariIni : mulai) + (waktu ? ', pukul ' + waktu : '') +
      ([lok ? lok.nama : '', r[4]].filter(Boolean).length ? '\n📍 ' + [lok ? lok.nama : '', r[4]].filter(Boolean).join(' · ') : '') +
      '\n\n' + (pagi ? 'Jangan lupa absen *Hadir* di lokasi lewat SIMAK:\n' : 'Absen lewat SIMAK saat kegiatan:\n') + urlAplikasi_() + '/?masuk';
    const h = kirimWA_(hp, pesan, pagi ? 'hariH' : 'pengingat');
    if (h.ok) props.setProperty(kunci, '1');
  });
}

// =========================================================
//            KTA IMM (diurus offline, di sini hanya diarsipkan)
// =========================================================
// Kader / admin mengunggah KTA yang sudah terbit (foto atau PDF) beserta NIA.
function folderKTA_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_KTA');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(CONFIG.NAMA_SISTEM + ' - KTA IMM');   // privat
  props.setProperty('FOLDER_KTA', f.getId());
  return f;
}
// ----- Tempat/tanggal lahir & syahadah DAD (kolom 13-18 sheet Peserta) -----
function tglLahir_(v) { return fmt_(v); }
function cekTglLahir_(t) {
  t = String(t || '').trim();
  if (!t) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error('Format tanggal lahir tidak valid.');
  const th = Number(t.slice(0, 4)), kini = Number(Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy'));
  if (th < 1950 || th > kini - 10) throw new Error('Tanggal lahir tidak masuk akal, periksa kembali.');
  return t;
}
/** Status syahadah: 'Sudah' bila ditandai sudah atau berkas sudah diunggah, selain itu 'Belum'. */
function syahadah_(r) {
  const berkas = String(r[17] || '');
  return { status: r[14] === 'Sudah' || berkas ? 'Sudah' : 'Belum', nomor: String(r[15] || ''), predikat: String(r[16] || ''), berkas: berkas };
}
function folderSyahadah_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_SYAHADAH');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(CONFIG.NAMA_SISTEM + ' - Syahadah DAD');   // privat
  props.setProperty('FOLDER_SYAHADAH', f.getId());
  return f;
}
function pastikanKolomPeserta_() {
  const sh = sh_('PESERTA');
  if (sh.getMaxColumns() < 18) sh.insertColumnsAfter(sh.getMaxColumns(), 18 - sh.getMaxColumns());
  return sh;
}
/** Simpan data syahadah satu kader. d = {status?, nomor?, predikat?, berkas?} */
function simpanSyahadah_(baris, p, d) {
  const sh = pastikanKolomPeserta_();
  d = d || {};
  if (d.status !== undefined) sh.getRange(baris, 15).setValue(d.status === 'Sudah' ? 'Sudah' : 'Belum');
  if (d.nomor !== undefined) sh.getRange(baris, 16).setValue("'" + String(d.nomor || '').trim());
  if (d.predikat !== undefined) sh.getRange(baris, 17).setValue(String(d.predikat || '').trim().toUpperCase());
  if (d.berkas && d.berkas.data) {
    const mime = d.berkas.mime === 'application/pdf' ? 'application/pdf' : (d.berkas.mime || 'image/jpeg');
    if (!/^image\/|^application\/pdf$/.test(mime)) throw new Error('Syahadah harus berupa foto atau PDF.');
    const bytes = Utilities.base64Decode(d.berkas.data);
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Ukuran berkas syahadah maksimal 8 MB.');
    const f = folderSyahadah_().createFile(Utilities.newBlob(bytes, mime, 'Syahadah DAD - ' + String(p[1]).trim() + (mime === 'application/pdf' ? '.pdf' : '.jpg')));
    const lama = idDariUrl_(p[17]);
    if (lama) { try { DriveApp.getFileById(lama).setTrashed(true); } catch (e) {} }
    sh.getRange(baris, 18).setValue(f.getUrl());
    sh.getRange(baris, 15).setValue('Sudah');
  }
}
/** Kader mengisi data syahadah DAD-nya (sudah/belum, nomor, predikat, foto). */
function simpanSyahadahKader(email, token, d) {
  const p = verifikasi_(email, token);
  kunci_(() => simpanSyahadah_(barisKader_(p[0]), p, d || {}));
  return dataPeserta(email, token);
}
function lihatSyahadahKader(email, token) {
  const p = verifikasi_(email, token);
  const id = idDariUrl_(p[17]);
  if (!id) throw new Error('Syahadah belum diunggah.');
  const b = DriveApp.getFileById(id).getBlob();
  return { data: Utilities.base64Encode(b.getBytes()), mime: b.getContentType(), nama: b.getName() };
}
function hapusSyahadahKader(email, token) {
  const p = verifikasi_(email, token);
  kunci_(() => {
    const id = idDariUrl_(p[17]);
    if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
    pastikanKolomPeserta_().getRange(barisKader_(p[0]), 18).setValue('');
  });
  return dataPeserta(email, token);
}
/** Admin mengisi / mengganti data syahadah seorang kader. */
function simpanSyahadahAdmin(pw, idKader, d) {
  cek_(pw);
  kunci_(() => {
    const p = rows_('PESERTA').find(r => r[0] === idKader);
    if (!p) throw new Error('Kader tidak ditemukan.');
    simpanSyahadah_(barisKader_(idKader), p, d || {});
  });
  return getData(pw);
}
/** Admin menandai banyak kader sekaligus: status 'Sudah' / 'Belum'. */
function tandaiSyahadahMassal(pw, ids, status) {
  cek_(pw);
  if (!Array.isArray(ids) || !ids.length) throw new Error('Centang minimal satu kader.');
  kunci_(() => {
    const sh = pastikanKolomPeserta_(), last = sh.getLastRow();
    const v = sh.getRange(2, 1, last - 1, 1).getValues();
    v.forEach((r, i) => { if (ids.indexOf(r[0]) >= 0) sh.getRange(i + 2, 15).setValue(status === 'Sudah' ? 'Sudah' : 'Belum'); });
  });
  return getData(pw);
}

function idDariUrl_(url) { const m = String(url || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }

function simpanBerkasKTA_(baris, p, nia, berkas) {
  const sh = sh_('PESERTA');
  if (nia !== undefined && nia !== null) {
    nia = String(nia).trim();
    if (nia) cekNomorUnik_('', nia, p[0]);
    sh.getRange(baris, 11).setValue(nia ? "'" + nia : '');
  }
  if (berkas && berkas.data) {
    const mime = berkas.mime === 'application/pdf' ? 'application/pdf' : (berkas.mime || 'image/jpeg');
    if (!/^image\/|^application\/pdf$/.test(mime)) throw new Error('KTA harus berupa foto atau PDF.');
    const bytes = Utilities.base64Decode(berkas.data);
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Ukuran berkas KTA maksimal 8 MB.');
    const ext = mime === 'application/pdf' ? '.pdf' : '.jpg';
    const f = folderKTA_().createFile(Utilities.newBlob(bytes, mime, 'KTA IMM - ' + String(p[1]).trim() + ext));
    const lama = idDariUrl_(p[11]);
    if (lama) { try { DriveApp.getFileById(lama).setTrashed(true); } catch (e) {} }
    sh.getRange(baris, 12).setValue(f.getUrl());
  }
}

/** Kader menyimpan NIA dan/atau mengunggah KTA (foto/PDF). */
function simpanKTAKader(email, token, d) {
  const p = verifikasi_(email, token);
  d = d || {};
  if (!(d.berkas && d.berkas.data) && !p[11] && !String(d.nia || '').trim()) throw new Error('Isi NIA atau pilih berkas KTA.');
  kunci_(() => simpanBerkasKTA_(barisKader_(p[0]), p, d.nia, d.berkas));
  return dataPeserta(email, token);
}
/** Kader melihat berkas KTA miliknya (dikirim sebagai data, folder tetap privat). */
function lihatKTAKader(email, token) {
  const p = verifikasi_(email, token);
  const id = idDariUrl_(p[11]);
  if (!id) throw new Error('KTA belum diunggah.');
  const b = DriveApp.getFileById(id).getBlob();
  return { data: Utilities.base64Encode(b.getBytes()), mime: b.getContentType(), nama: b.getName() };
}
function hapusKTAKader(email, token) {
  const p = verifikasi_(email, token);
  kunci_(() => {
    const id = idDariUrl_(p[11]);
    if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
    sh_('PESERTA').getRange(barisKader_(p[0]), 12).setValue('');
  });
  return dataPeserta(email, token);
}
/** Admin mengunggah / mengganti KTA seorang kader. */
function simpanKTAAdmin(pw, idKader, nia, berkas) {
  cek_(pw);
  kunci_(() => {
    const p = rows_('PESERTA').find(r => r[0] === idKader);
    if (!p) throw new Error('Kader tidak ditemukan.');
    simpanBerkasKTA_(barisKader_(idKader), p, nia, berkas);
  });
  return getData(pw);
}

function folderFormulirDAD_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_FORMULIR_DAD');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(CONFIG.NAMA_SISTEM + ' - Formulir DAD');   // privat: hanya pemilik akun
  props.setProperty('FOLDER_FORMULIR_DAD', f.getId());
  return f;
}

function jadwalDAD_() {
  return PropertiesService.getScriptProperties().getProperty('JADWAL_DAD') || CONFIG.JADWAL_DAD_AWAL || '';
}
/** Admin mengatur jadwal DAD yang tercetak di pernyataan formulir. */
function aturJadwalDAD(pw, teks) {
  cek_(pw);
  PropertiesService.getScriptProperties().setProperty('JADWAL_DAD', String(teks || '').trim());
  const d = getData(pw);
  return d;
}

const LOGO_IMM_BASE64 = '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';
const LOGO_PK_BESAR_BASE64 = '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';
const BISMILLAH_BASE64 = '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';

/** Membuat PDF "Formulir Pendaftaran Calon Kader" + "Surat Pernyataan" yang sudah terisi. */
function buatFormulirDAD_(p, kini) {
  const e = v => esc_(v == null || v === '' ? '' : v);
  const tahun = Utilities.formatDate(kini, CONFIG.ZONA_WAKTU, 'yyyy');
  const tglHariIni = tglIndo_(Utilities.formatDate(kini, CONFIG.ZONA_WAKTU, 'yyyy-MM-dd'));
  const ttl = [p.tempatLahir, p.tglLahir ? tglIndo_(p.tglLahir) : ''].filter(Boolean).join(', ');
  const jadwal = jadwalDAD_() || '.......................................';
  const img = (b64, tipe, gaya) => '<img src="data:' + tipe + ';base64,' + b64 + '" style="' + gaya + '">';

  const kop =
    '<table style="width:100%;border-bottom:3px double #000;margin-bottom:8px"><tr>' +
    '<td style="width:80px;text-align:center;vertical-align:middle">' + img(LOGO_IMM_BASE64, 'image/png', 'height:95px') + '</td>' +
    '<td style="text-align:center;line-height:1.15">' +
    '<div style="color:#c00000;font-weight:bold;font-size:13pt">PANITIA PELAKSANA</div>' +
    '<div style="color:#c00000;font-weight:bold;font-size:13pt">DARUL ARQAM DASAR</div>' +
    '<div style="color:#c00000;font-weight:bold;font-size:13pt">IKATAN MAHASISWA MUHAMMADIYAH</div>' +
    '<div style="color:#c00000;font-style:italic;font-size:9pt">(Muhammadiyah Student\'s Association)</div>' +
    '<div style="color:#c00000;font-weight:bold;font-size:13pt">' + e(CONFIG.KOP_KOMISARIAT) + '</div>' +
    '<div style="color:#c00000;font-weight:bold;font-size:12pt">' + e(CONFIG.KOP_UNIVERSITAS) + '</div>' +
    '<div style="font-size:8pt">' + e(CONFIG.KOP_SEKRETARIAT) + '</div>' +
    '<div style="font-size:8pt">' + e(CONFIG.KOP_KONTAK) + '</div>' +
    '</td></tr></table>';

  const isian = (label, nilai) => '<tr><td style="width:170px;padding:2px 0">' + label + '</td><td style="width:10px">:</td><td>' + e(nilai) + '</td></tr>';
  const tabel = (kepala, baris, kosong) => {
    const rows = (baris && baris.length ? baris : []).slice();
    while (rows.length < kosong) rows.push(kepala.map(() => ''));
    return '<table class="g"><tr>' + kepala.map(h => '<th>' + h + '</th>').join('') + '</tr>' +
      rows.map(r => '<tr>' + r.map(c => '<td>' + e(c) + '&nbsp;</td>').join('') + '</tr>').join('') + '</table>';
  };
  const ada = arr => (arr || []).filter(x => Object.values(x).some(v => String(v || '').trim()));
  const pend = ['SD', 'SMP', 'SMA', 'PT'].map(j => {
    const x = (p.pendidikan || []).find(y => y.jenjang === j) || {};
    return [j, x.sekolah || '', x.lulus || ''];
  });
  const foto = p.foto && p.foto.data
    ? img(p.foto.data, 'image/jpeg', 'width:3cm;height:4cm;object-fit:cover;border:1px solid #000')
    : '<div style="width:3cm;height:4cm;border:1px solid #000;text-align:center;font-size:8pt;padding-top:1.3cm">FOTO 3X4<br>WARNA<br>BACKGROUND<br>MERAH</div>';
  const ttd = '<table style="width:100%;margin-top:18px"><tr><td style="width:55%"></td><td style="text-align:center">' +
    e(CONFIG.SERTIFIKAT_KOTA) + ', ' + e(tglHariIni) + '<br>Hormat Saya,<br><br><br><br>' +
    '<b><u>( ' + e(p.nama) + ' )</u></b><br>NPM. ' + e(p.npm || '..................') + '</td></tr></table>';

  const html =
    '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:"Times New Roman",Times,serif;font-size:11.5pt;color:#000;margin:0}' +
    'h3{font-size:12pt;margin:12px 0 4px} p{margin:4px 0;text-align:justify}' +
    'table.g{width:100%;border-collapse:collapse;margin:4px 0 8px} table.g th,table.g td{border:1px solid #000;padding:3px 6px;font-size:10.5pt}' +
    'table.g th{background:#eee} .pb{page-break-before:always}' +
    '</style></head><body>' +

    // ---------- SAMPUL ----------
    '<div style="text-align:center;padding-top:30px">' + img(LOGO_PK_BESAR_BASE64, 'image/png', 'height:230px') +
    '<div style="margin-top:40px;font-weight:bold;font-size:13pt;line-height:1.45">FORMULIR PENDAFTARAN<br>CALON KADER<br>' +
    'PIMPINAN KOMISARIAT<br>IKATAN MAHASISWA MUHAMMADIYAH<br>' + e(CONFIG.KOP_KOMISARIAT) + '<br>' + e(CONFIG.KOP_UNIVERSITAS) +
    '<br>TAHUN ' + tahun + '</div></div>' +
    '<table class="g" style="margin-top:150px;font-weight:bold">' +
    '<tr><td style="width:38%">NAMA LENGKAP</td><td>: ' + e(p.nama) + '</td></tr>' +
    '<tr><td>NPM</td><td>: ' + e(p.npm || '-') + '</td></tr>' +
    '<tr><td>TEMPAT, TANGGAL LAHIR</td><td>: ' + e(ttl) + '</td></tr>' +
    '<tr><td>NOMOR HP</td><td>: ' + e(p.hp) + '</td></tr></table>' +

    // ---------- FORMULIR ----------
    '<div class="pb">' + kop +
    '<div style="text-align:center">' + img(BISMILLAH_BASE64, 'image/png', 'height:22px') + '</div>' +
    '<div style="text-align:center;font-weight:bold;text-decoration:underline;margin:6px 0 8px">FORMULIR CALON KADER ' +
    e(CONFIG.PENYELENGGARA.toUpperCase()) + '</div>' +
    '<h3>A. Data Diri</h3>' +
    '<table style="width:100%"><tr><td style="vertical-align:top"><table style="width:100%">' +
    isian('Nama Lengkap', p.nama) + isian('Jenis Kelamin', p.jk) + isian('Tempat, Tanggal Lahir', ttl) +
    isian('Alamat Asal', p.alamatAsal) + isian('Alamat Sekarang', p.alamat) + isian('No. Telp./HP', p.hp) +
    isian('Alamat E-mail', p.email) + isian('Sosial Media', p.sosmed) + isian('Motto', p.motto) +
    isian('Perguruan Tinggi', p.pt) + isian('Program Studi', p.prodi) +
    isian('NPM / Semester', [p.npm, p.semester ? 'Semester ' + p.semester : ''].filter(Boolean).join(' / ')) +
    '</table></td><td style="width:3.4cm;vertical-align:top;text-align:right">' + foto + '</td></tr></table>' +
    '<h3>B. Riwayat Akademik</h3><p>Riwayat Pendidikan Formal &amp; Non formal:</p>' +
    tabel(['Jenjang', 'Sekolah', 'Tahun Lulus'], pend, 4) +
    '<h3>C. Riwayat Keorganisasian</h3><p>Riwayat Organisasi / Lembaga:</p>' +
    tabel(['Organisasi / Lembaga', 'Jabatan', 'Periode'], ada(p.organisasi).map(x => [x.organisasi, x.jabatan, x.periode]), 3) +
    '<p>Buku yang pernah dibaca:</p>' +
    tabel(['Buku', 'Penulis'], ada(p.buku).map(x => [x.judul, x.penulis]), 3) +
    '<p>Karya yang pernah dipublikasikan:</p>' +
    tabel(['Karya', 'Media'], ada(p.karya).map(x => [x.judul, x.media]), 2) +
    '<h3>D. Target dan Motivasi</h3>' +
    '<p>1. Target yang ingin diraih ketika menjadi Kader di ' + e(CONFIG.PENYELENGGARA) + '?</p>' +
    '<p style="margin-left:16px">' + e(p.target || '-').replace(/\n/g, '<br>') + '</p>' +
    '<p>2. Motivasi mendaftar menjadi Kader ' + e(CONFIG.PENYELENGGARA) + '?</p>' +
    '<p style="margin-left:16px">' + e(p.motivasi || '-').replace(/\n/g, '<br>') + '</p>' +
    '<p style="margin-top:12px">Dengan ini mengisi daftar riwayat hidup saya menyatakan bahwa saya:</p>' +
    '<p style="margin-left:24px;margin-right:24px">“Berkomitmen mengikuti seluruh rangkaian agenda dan ketentuan DARUL ARQAM DASAR (DAD) ' +
    'yang diselenggarakan oleh Panitia Pelaksana (PANPEL) Pimpinan Komisariat Ikatan Mahasiswa Muhammadiyah ' +
    e(CONFIG.KOP_KOMISARIAT.replace(/\w\S*/g, t => t.charAt(0) + t.slice(1).toLowerCase())) + ' ' +
    e(CONFIG.KOP_UNIVERSITAS.replace(/\w\S*/g, t => t.charAt(0) + t.slice(1).toLowerCase())) +
    ' tanggal ' + e(jadwal) + '”.</p>' + ttd + '</div>' +

    // ---------- SURAT PERNYATAAN ----------
    '<div class="pb">' + kop +
    '<div style="text-align:center;font-weight:bold;text-decoration:underline;font-size:13pt;margin:14px 0">SURAT PERNYATAAN</div>' +
    '<p>Yang bertanda tangan di bawah ini:</p><table style="width:100%;margin-left:16px">' +
    isian('Nama Lengkap', p.nama) + isian('Tempat, Tanggal Lahir', ttl) + isian('NPM', p.npm) +
    isian('Prodi', p.prodi) + isian('Semester', p.semester) + '</table>' +
    '<p style="margin-top:10px">Dengan ini menyatakan bahwa:</p><ol style="margin-top:2px">' +
    '<li><p>Saya bersedia mengikuti seluruh aturan dan ketentuan yang berlaku dalam Ikatan Mahasiswa Muhammadiyah yang ' +
    'diselenggarakan oleh ' + e(CONFIG.PENYELENGGARA) + ' secara penuh dari awal hingga akhir serta mematuhi semua peraturan yang ditetapkan.</p></li>' +
    '<li><p>Data yang saya serahkan adalah benar.</p></li></ol>' +
    '<p>Demikian surat kesanggupan ini saya buat dengan penuh kesadaran dan rasa tanggung jawab untuk dapat dipergunakan sebagaimana mestinya.</p>' +
    ttd + '</div></body></html>';

  return HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf')
    .setName('Formulir DAD ' + tahun + ' - ' + String(p.nama).trim() + '.pdf');
}

function kirimKonfirmasiDAD_(p, pdf) {
  const nama = String(p.nama).trim();
  try {
    kirimWA_(p.hp, 'Assalamu\'alaikum, *' + nama + '*.\n\nPendaftaran *Darul Arqam Dasar (DAD)* Anda sudah kami terima ✅. ' +
      'Formulir PDF dikirim ke email ' + String(p.email).trim() + ' — silakan dicetak, ditandatangani, lalu diserahkan ke panitia.' +
      (CONFIG.LINK_GRUP_WA_DAD ? '\n\nGabung grup calon peserta DAD:\n' + CONFIG.LINK_GRUP_WA_DAD : '') +
      '\n\nCek status pendaftaran: ' + urlAplikasi_() + '/?status\n\n' + teksMenuWA_() + teksDalil_(DALIL_DAD), 'dadDaftar');
    const w = pengaturanWA_();
    if (w.noAdmin) kirimWA_(w.noAdmin, '🆕 *Pendaftar DAD baru*\n' + nama + '\nNPM: ' + (p.npm || '-') + '\nProdi: ' + (p.prodi || '-') +
      '\nHP: ' + (p.hp || '-'), 'dadAdmin');
  } catch (e) {}
  if (MailApp.getRemainingDailyQuota() < 1) return;
  if (CONFIG.EMAIL_SAMBUTAN) {
    const html =
      '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;line-height:1.6">' +
      '<p>Assalamu\'alaikum warahmatullahi wabarakatuh,</p>' +
      '<p>Terima kasih, <b>' + esc_(nama) + '</b>, sudah mendaftar sebagai <b>calon peserta Darul Arqam Dasar (DAD)</b> ' +
      esc_(CONFIG.PENYELENGGARA) + '.</p>' +
      '<p>Data Anda sudah kami terima. <b>Formulir pendaftaran Anda (PDF) terlampir</b> di email ini — ' +
      'silakan <b>dicetak</b>, tempel pas foto 3×4 bila belum ada, <b>tanda tangani</b>, lalu serahkan ke panitia. ' +
      'Panitia akan menghubungi Anda melalui WhatsApp/email ' +
      'untuk informasi jadwal dan persyaratan DAD.</p>' +
      (CONFIG.LINK_GRUP_WA_DAD ? '<p><b>Silakan bergabung ke grup WhatsApp calon peserta DAD:</b></p>' +
        '<p style="margin:14px 0"><a href="' + CONFIG.LINK_GRUP_WA_DAD + '" style="background:#25D366;color:#fff;' +
        'padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold">' +
        'Gabung Grup WhatsApp DAD</a></p>' : '') +
      '<p>Setelah mengikuti DAD, Anda akan didaftarkan sebagai kader dan bisa masuk ke <b>' +
      esc_(CONFIG.NAMA_SISTEM) + '</b> untuk absensi kegiatan.</p>' +
      '<p style="font-style:italic;color:#555">"Anggun dalam Moral, Unggul dalam Intelektual"</p>' +
      '<p style="font-weight:bold;font-style:italic;color:#8b1a1a">' + esc_(CONFIG.SALAM_PENUTUP).replace(/\n/g, '<br>') + '</p>' +
    '<p>Wassalamu\'alaikum warahmatullahi wabarakatuh.</p>' +
      '<p>Hormat kami,<br><b>' + esc_(pengirim_()) + '</b></p></div>';
    MailApp.sendEmail(p.email.trim(), 'Pendaftaran DAD Diterima | ' + CONFIG.PENYELENGGARA,
      'Terima kasih ' + nama + ', pendaftaran DAD Anda sudah kami terima. ' + CONFIG.SALAM_PENUTUP,
      Object.assign({ name: pengirim_(), htmlBody: html }, pdf ? { attachments: [pdf] } : {}));
  }
  if (CONFIG.EMAIL_ADMIN) {
    MailApp.sendEmail(CONFIG.EMAIL_ADMIN, 'Pendaftar DAD baru: ' + nama,
      'Pendaftar DAD baru:\n' + nama + '\nNPM: ' + (p.npm || '-') + '\nProdi: ' + (p.prodi || '-') +
      '\nHP: ' + p.hp + '\nEmail: ' + p.email + '\n\nLihat di tab DAD pada ' + CONFIG.NAMA_SISTEM + '.',
      { name: CONFIG.NAMA_SISTEM });
  }
}

// ----- Tahapan calon kader: Terdaftar → Lolos Screening → Mengikuti DAD → Lulus DAD (= jadi kader) -----
const TAHAP_DAD = ['Terdaftar', 'Lolos Screening', 'Mengikuti DAD', 'Sudah jadi kader'];
const TAHAP_LULUS_LUAR = 'Lulus DAD (Luar FAI)';   // tahap akhir peserta luar FAI: lulus, tanpa akun kader
const TAHAP_GAGAL = ['Tidak Lolos Screening', 'Tidak Lulus DAD'];
const LANJUT_DAD = {                      // tahap sekarang -> tahap yang boleh dipilih admin
  'Terdaftar': ['Lolos Screening', 'Tidak Lolos Screening'],
  'Lolos Screening': ['Mengikuti DAD', 'Tidak Lolos Screening'],
  'Mengikuti DAD': ['Lulus DAD', 'Tidak Lulus DAD'],
  'Tidak Lolos Screening': ['Terdaftar'],
  'Tidak Lulus DAD': ['Mengikuti DAD']
};

function normalTahap_(t) {
  t = String(t || '').trim();
  return (!t || t === 'Menunggu') ? 'Terdaftar' : t;
}

/**
 * Admin memindahkan calon kader ke tahap berikutnya.
 * "Lulus DAD" otomatis membuat akun kader (tahun DAD = tahun ini) + email selamat datang.
 */
function ubahTahapDAD(pw, id, tahap, catatan) {
  cek_(pw);
  ubahTahap1_(id, tahap, catatan);
  return getData(pw);
}

/** Acc massal: ubah tahap banyak pendaftar sekaligus (email tetap dikirim ke masing-masing). */
function ubahTahapDADMassal(pw, ids, tahap, catatan) {
  cek_(pw);
  if (!Array.isArray(ids) || !ids.length) throw new Error('Pilih minimal satu pendaftar.');
  const mulai = Date.now(), hasil = { berhasil: 0, gagal: [], sisa: [] };
  ids.forEach(id => {
    if (Date.now() - mulai > 4.5 * 60 * 1000) { hasil.sisa.push(id); return; }   // batas waktu Apps Script
    try { ubahTahap1_(id, tahap, catatan); hasil.berhasil++; }
    catch (e) { const d = rows_('DAD').find(r => r[0] === id); hasil.gagal.push({ nama: d ? d[1] : id, pesan: e.message }); }
  });
  const d = getData(pw);
  d.hasilMassal = hasil;
  return d;
}

function ubahTahap1_(id, tahap, catatan) {
  let calon = null, nama = '', email = '', hp = '';
  kunci_(() => {
    const sh = sh_('DAD');
    const last = sh.getLastRow();
    const v = last >= 2 ? sh.getRange(2, 1, last - 1, SHEET.DAD.header.length).getValues() : [];
    const i = v.findIndex(r => r[0] === id);
    if (i < 0) throw new Error('Data pendaftar tidak ditemukan.');
    const r = v[i];
    const kini = normalTahap_(r[10]);
    if ((LANJUT_DAD[kini] || []).indexOf(tahap) < 0) throw new Error('Tahap "' + tahap + '" tidak bisa dipilih dari "' + kini + '".');
    nama = r[1]; email = String(r[5]).trim(); hp = String(r[6] || '');

    let simpan = tahap;
    if (tahap === 'Lulus DAD' && kelompokProdi_(r[3]) === 'Luar FAI') {
      // SIMAK khusus kader FAI: peserta dari luar FAI cukup dinyatakan lulus, tidak dibuatkan akun kader.
      simpan = TAHAP_LULUS_LUAR;
    } else if (tahap === 'Lulus DAD') {
      if (emailSudahAda_(email)) throw new Error('Email ' + email + ' sudah terdaftar sebagai kader.');
      const idK = idBaru_('PESERTA', 'P');
      sh_('PESERTA').appendRow([idK, r[1], "'" + String(r[2]).trim(), email, "'" + r[6], new Date(),
        Number(Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU, 'yyyy')), '', '', '', '', '',
        String(r[14] || '').trim(), r[15] ? "'" + tglLahir_(r[15]) : '', 'Belum', '', '', '']);
      calon = { nama: r[1], nim: String(r[2]).trim(), email: email };
      try {
        const fid = idDrive_(r[25]);
        if (fid) {
          const salinan = DriveApp.getFileById(fid).makeCopy('Profil - ' + r[1] + '.jpg', folderFotoProfil_());
          sh_('PESERTA').getRange(sh_('PESERTA').getLastRow(), 8).setValue(salinan.getId());
        }
      } catch (e) {}
      simpan = 'Sudah jadi kader';
    }
    sh.getRange(i + 2, 11, 1, 3).setValues([[simpan, new Date(), catatan ? String(catatan).trim() : (r[12] || '')]]);
  });

  if (calon) { sambutKaderBaru_(calon); return; }   // email + WA sambutan + undangan kalender
  const akhir = tahap === 'Lulus DAD' ? TAHAP_LULUS_LUAR : tahap;
  try { emailTahapDAD_(nama, email, akhir, catatan); } catch (e) {}
  try { waTahapDAD_(nama, hp, akhir, catatan, email); } catch (e) {}
}

/** Tetap disediakan untuk kompatibilitas: langsung luluskan & jadikan kader. */
function jadikanKader(pw, id) {
  const d = dataDAD_().find(x => x.id === id);
  if (d && d.status === 'Terdaftar') ubahTahapDAD(pw, id, 'Lolos Screening');
  if (d && d.status !== 'Mengikuti DAD') ubahTahapDAD(pw, id, 'Mengikuti DAD');
  return ubahTahapDAD(pw, id, 'Lulus DAD');
}

function waTahapDAD_(nama, hp, tahap, catatan, email) {
  if (!hp) return;
  const isi = {
    'Lolos Screening': '🎉 Selamat! Anda dinyatakan *lolos screening* calon peserta DAD. Info jadwal, lokasi, dan perlengkapan akan disampaikan lewat grup WA & email.',
    'Mengikuti DAD': 'Anda sekarang tercatat sebagai *peserta DAD*. Ikuti seluruh rangkaian dengan sungguh-sungguh. 💪',
    'Lulus DAD': '🎓 Selamat! Anda dinyatakan *lulus DAD* dan resmi menjadi kader. Akun SIMAK Anda sudah aktif — masuk dengan email ' + email +
      ' (buat PIN lewat "Lupa PIN" bila belum punya):\n' + urlAplikasi_() + '/?masuk',
    'Lulus DAD (Luar FAI)': '🎓 Selamat! Anda dinyatakan *lulus DAD*. Karena Anda dari luar FAI, perkaderan selanjutnya dilanjutkan di *komisariat IMM fakultas Anda*. Info syahadah akan disampaikan panitia.\n\n' + teksDalil_(DALIL_KADER),
    'Tidak Lolos Screening': 'Terima kasih atas minat Anda. Untuk saat ini Anda *belum lolos screening* DAD. Anda tetap bisa mendaftar pada periode berikutnya.',
    'Tidak Lulus DAD': 'Terima kasih telah mengikuti DAD. Saat ini Anda *belum dinyatakan lulus*. Silakan hubungi panitia untuk tindak lanjut.'
  }[tahap];
  if (!isi) return;
  kirimWA_(hp, 'Assalamu\'alaikum, *' + nama + '*.\n\n' + isi + (catatan ? '\n\n*Catatan panitia:* ' + catatan : ''), 'dadTahap');
}

function emailTahapDAD_(nama, email, tahap, catatan) {
  if (!email || MailApp.getRemainingDailyQuota() < 1) return;
  const isi = {
    'Lolos Screening': ['Selamat! Anda Lolos Screening DAD',
      'Selamat, Anda dinyatakan <b>lolos screening</b> calon peserta Darul Arqam Dasar (DAD). ' +
      'Informasi jadwal, lokasi, dan perlengkapan DAD akan disampaikan melalui grup WhatsApp dan email.'],
    'Mengikuti DAD': ['Anda Terdaftar sebagai Peserta DAD',
      'Anda sekarang tercatat sebagai <b>peserta DAD</b>. Ikuti seluruh rangkaian kegiatan dengan sungguh-sungguh. ' +
      'Setelah dinyatakan lulus, akun kader Anda di ' + esc_(CONFIG.NAMA_SISTEM) + ' akan aktif.'],
    'Tidak Lolos Screening': ['Hasil Screening DAD',
      'Terima kasih atas minat Anda. Untuk saat ini Anda <b>belum lolos screening</b> DAD. ' +
      'Jangan berkecil hati — Anda tetap bisa mendaftar kembali pada periode berikutnya.'],
    'Lulus DAD (Luar FAI)': ['Selamat! Anda Lulus DAD',
      'Selamat, Anda dinyatakan <b>lulus Darul Arqam Dasar (DAD)</b> ' + esc_(CONFIG.PENYELENGGARA) + '. ' +
      'Karena Anda berasal dari luar FAI, proses perkaderan selanjutnya dilanjutkan di <b>komisariat IMM fakultas Anda</b>. ' +
      'Syahadah DAD akan diinformasikan oleh panitia. Semoga ilmu dan semangat DAD menjadi bekal bergerak di mana pun Anda berada.'],
    'Tidak Lulus DAD': ['Hasil Kelulusan DAD',
      'Terima kasih telah mengikuti DAD. Saat ini Anda <b>belum dinyatakan lulus</b>. ' +
      'Silakan menghubungi panitia untuk informasi tindak lanjut.'],
    'Terdaftar': ['Status Pendaftaran DAD Diperbarui',
      'Status pendaftaran DAD Anda dikembalikan menjadi <b>Terdaftar</b> dan akan ditinjau ulang oleh panitia.']
  }[tahap];
  if (!isi) return;
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;line-height:1.6">' +
    '<p>Assalamu\'alaikum warahmatullahi wabarakatuh,</p>' +
    '<p>Yth. <b>' + esc_(nama) + '</b>,</p><p>' + isi[1] + '</p>' +
    (catatan ? '<p><b>Catatan panitia:</b><br>' + esc_(catatan).replace(/\n/g, '<br>') + '</p>' : '') +
    (CONFIG.LINK_GRUP_WA_DAD && (tahap === 'Lolos Screening' || tahap === 'Mengikuti DAD')
      ? '<p><a href="' + CONFIG.LINK_GRUP_WA_DAD + '" style="background:#25D366;color:#fff;padding:10px 18px;border-radius:6px;' +
        'text-decoration:none;display:inline-block;font-weight:bold">Grup WhatsApp DAD</a></p>' : '') +
    '<p style="font-weight:bold;font-style:italic;color:#8b1a1a">' + esc_(CONFIG.SALAM_PENUTUP).replace(/\n/g, '<br>') + '</p>' +
    '<p>Wassalamu\'alaikum warahmatullahi wabarakatuh.</p>' +
    '<p>Hormat kami,<br><b>Panitia DAD ' + esc_(CONFIG.PENYELENGGARA) + '</b></p></div>';
  MailApp.sendEmail(email, isi[0] + ' | ' + CONFIG.PENYELENGGARA,
    'Yth. ' + nama + ', status pendaftaran DAD Anda: ' + tahap + '. ' + CONFIG.SALAM_PENUTUP,
    { name: pengirim_(), htmlBody: html });
}

/** Publik: calon peserta mengecek status pendaftaran DAD dengan emailnya. */
function cekStatusDAD(kunci) {
  kunci = String(kunci || '').trim();
  if (!kunci) throw new Error('Isi email atau nomor WhatsApp yang dipakai saat mendaftar DAD.');
  const pakaiEmail = kunci.indexOf('@') >= 0, email = kunci.toLowerCase();
  if (!pakaiEmail && kunci.replace(/\D/g, '').length < 8) throw new Error('Nomor WhatsApp tidak valid.');
  const d = dataDAD_().find(x => pakaiEmail ? String(x.email).trim().toLowerCase() === email : hpSama_(kunci, x.hp));
  if (!d) {
    if (pakaiEmail && emailSudahAda_(email)) return { nama: '', status: 'Sudah jadi kader', tanggal: '', diperbarui: '', grupWA: '' };
    if (!pakaiEmail && rows_('PESERTA').some(r => hpSama_(kunci, r[4]))) return { nama: '', status: 'Sudah jadi kader', tanggal: '', diperbarui: '', grupWA: '' };
    throw new Error(pakaiEmail ? 'Email ini belum terdaftar sebagai calon peserta DAD.' : 'Nomor WhatsApp ini belum terdaftar sebagai calon peserta DAD.');
  }
  return { nama: d.nama, lewatHp: !pakaiEmail, emailSamar: samarEmail_(d.email), status: d.status, tanggal: d.tanggal, diperbarui: d.diperbarui, bisaEdit: TAHAP_BISA_EDIT.indexOf(d.status) >= 0,
    grupWA: (d.status === 'Lolos Screening' || d.status === 'Mengikuti DAD' || d.status === 'Terdaftar') ? CONFIG.LINK_GRUP_WA_DAD : '' };
}

function samarEmail_(e) {
  const m = String(e || '').match(/^(.{1,2})(.*)(@.*)$/);
  return m ? m[1] + m[2].replace(/./g, '•') + m[3] : '';
}

function hapusDAD(pw, id) {
  cek_(pw);
  kunci_(() => hapusBaris_('DAD', id));
  return getData(pw);
}

// =========================================================
//                 EMAIL SELAMAT DATANG
// =========================================================
/** Dipanggil setelah kader baru tersimpan: undang ke kalender + kirim email sambutan. */

// ----- Motivasi + dalil untuk pesan WA sambutan (dipilih acak) -----
const DALIL_KADER = [
  { arab: 'وَلْتَكُنْ مِنْكُمْ أُمَّةٌ يَدْعُونَ إِلَى الْخَيْرِ وَيَأْمُرُونَ بِالْمَعْرُوفِ وَيَنْهَوْنَ عَنِ الْمُنْكَرِ ۚ وَأُولَٰئِكَ هُمُ الْمُفْلِحُونَ',
    arti: 'Dan hendaklah di antara kamu ada segolongan umat yang menyeru kepada kebajikan, menyuruh kepada yang makruf, dan mencegah dari yang mungkar. Mereka itulah orang-orang yang beruntung.',
    sumber: 'QS. Ali Imran: 104',
    pesan: 'Inilah ruh gerakan IMM. Menjadi kader berarti siap menjadi bagian dari umat yang mengajak pada kebaikan.' },
  { arab: 'إِنَّ اللَّهَ لَا يُغَيِّرُ مَا بِقَوْمٍ حَتَّىٰ يُغَيِّرُوا مَا بِأَنْفُسِهِمْ',
    arti: 'Sesungguhnya Allah tidak mengubah keadaan suatu kaum sebelum mereka mengubah keadaan diri mereka sendiri.',
    sumber: 'QS. Ar-Ra\'d: 11',
    pesan: 'Perubahan besar selalu dimulai dari diri sendiri. Mulailah dengan hadir, belajar, dan bergerak bersama.' },
  { arab: 'يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنْكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ',
    arti: 'Allah akan mengangkat (derajat) orang-orang yang beriman di antaramu dan orang-orang yang diberi ilmu beberapa derajat.',
    sumber: 'QS. Al-Mujadilah: 11',
    pesan: 'Iman dan ilmu adalah dua sayap kader. Teruslah membaca, berdiskusi, dan mengamalkan.' },
  { arab: 'إِنْ تَنْصُرُوا اللَّهَ يَنْصُرْكُمْ وَيُثَبِّتْ أَقْدَامَكُمْ',
    arti: 'Jika kamu menolong (agama) Allah, niscaya Dia akan menolongmu dan meneguhkan kedudukanmu.',
    sumber: 'QS. Muhammad: 7',
    pesan: 'Setiap langkah dalam dakwah dan perkaderan adalah jalan menolong agama Allah. Teguhkan niat, Allah yang meneguhkan langkah.' },
  { arab: 'فَاسْتَبِقُوا الْخَيْرَاتِ',
    arti: 'Maka berlomba-lombalah kamu dalam kebaikan.',
    sumber: 'QS. Al-Baqarah: 148',
    pesan: 'Fastabiqul khairat bukan sekadar slogan, tetapi cara hidup kader: selalu menjadi yang terdepan dalam kebaikan.' },
  { arab: 'وَقُلِ اعْمَلُوا فَسَيَرَى اللَّهُ عَمَلَكُمْ وَرَسُولُهُ وَالْمُؤْمِنُونَ',
    arti: 'Dan katakanlah: Bekerjalah kamu, maka Allah, Rasul-Nya, dan orang-orang mukmin akan melihat pekerjaanmu itu.',
    sumber: 'QS. At-Taubah: 105',
    pesan: 'Kader tidak cukup pandai berbicara. Buktikan lewat kerja nyata, sekecil apa pun, dan biarkan Allah yang menilai.' },
  { arab: 'وَالْعَصْرِ ۝ إِنَّ الْإِنْسَانَ لَفِي خُسْرٍ ۝ إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ',
    arti: 'Demi masa. Sesungguhnya manusia benar-benar dalam kerugian, kecuali orang-orang yang beriman dan beramal saleh serta saling menasihati untuk kebenaran dan saling menasihati untuk kesabaran.',
    sumber: 'QS. Al-\'Ashr: 1–3',
    pesan: 'Waktu terus berjalan. Isi dengan iman, amal, dan saling menguatkan sesama kader agar kita tidak termasuk orang yang merugi.' }
];
const DALIL_DAD = [
  { arab: 'مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ',
    arti: 'Barang siapa menempuh suatu jalan untuk mencari ilmu, Allah akan memudahkan baginya jalan menuju surga.',
    sumber: 'HR. Muslim',
    pesan: 'Mendaftar DAD adalah langkah pertama menempuh jalan ilmu dan perkaderan. Semoga Allah memudahkan setiap langkahmu.' },
  { arab: 'اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ',
    arti: 'Bacalah dengan (menyebut) nama Tuhanmu yang menciptakan.',
    sumber: 'QS. Al-\'Alaq: 1',
    pesan: 'Perkaderan dimulai dari membaca: membaca diri, membaca zaman, dan membaca ayat-ayat Allah.' },
  { arab: 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا ۝ إِنَّ مَعَ الْعُسْرِ يُسْرًا',
    arti: 'Maka sesungguhnya bersama kesulitan ada kemudahan. Sesungguhnya bersama kesulitan ada kemudahan.',
    sumber: 'QS. Al-Insyirah: 5–6',
    pesan: 'Rangkaian DAD mungkin melelahkan, tetapi di baliknya ada kemudahan dan pengalaman berharga. Siapkan diri sebaik-baiknya.' },
  { arab: 'وَلْتَكُنْ مِنْكُمْ أُمَّةٌ يَدْعُونَ إِلَى الْخَيْرِ',
    arti: 'Dan hendaklah di antara kamu ada segolongan umat yang menyeru kepada kebajikan.',
    sumber: 'QS. Ali Imran: 104',
    pesan: 'Dengan mendaftar DAD, kamu sedang bersiap menjadi bagian dari golongan itu. Selamat berproses!' }
];
/** Ajakan memakai menu WA (hanya bila balas otomatis menyala). */
function teksMenuWA_() {
  const w = pengaturanWA_();
  return w.aktif && w.jenis.balas ? '💬 Butuh info? Balas *MENU* ke nomor ini untuk cek status, jadwal kegiatan, link akun, dan kontak pengurus.\n\n' : '';
}
function teksDalil_(daftar) {
  const d = daftar[Math.floor(Math.random() * daftar.length)];
  return '📖 *Pesan untuk Anda*\n\n' + d.arab + '\n\n_"' + d.arti + '"_\n(' + d.sumber + ')\n\n' + d.pesan +
    '\n\n*Anggun dalam Moral, Unggul dalam Intelektual.*\n\n' + CONFIG.SALAM_PENUTUP;
}
/** WA sambutan untuk kader yang baru membuat akun / baru lulus DAD. */
function waSambutanKader_(nama, hp, email) {
  if (!hp) return;
  kirimWA_(hp, 'Assalamu\'alaikum warahmatullahi wabarakatuh, *' + nama + '* 👋\n\n' +
    'Selamat datang di *' + CONFIG.NAMA_SISTEM + '* — ' + CONFIG.PENYELENGGARA + '. Akun kader Anda sudah aktif ✅\n\n' +
    'Masuk: ' + urlAplikasi_() + '/?masuk\nEmail: ' + email + '\n\n' + teksMenuWA_() + teksDalil_(DALIL_KADER), 'kaderBaru');
}

function sambutKaderBaru_(p) {
  undangKegiatanMendatang_(p.email);
  const email = String(p.email).trim();
  const row = rows_('PESERTA').find(r => String(r[3]).trim().toLowerCase() === email.toLowerCase());
  try { waSambutanKader_(String(p.nama).trim(), p.hp || (row ? row[4] : ''), email); } catch (e) {}
  if (!CONFIG.EMAIL_SAMBUTAN) return;
  let hasil = 'Sambutan: Terkirim';
  try {
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Kuota email harian habis');
    kirimSambutan_(String(p.nama).trim(), email, String(p.nim || '').trim());
  } catch (e) {
    hasil = 'Sambutan: Gagal - ' + e.message;
  }
  sh_('LOG').appendRow([new Date(), row ? row[0] : '', String(p.nama).trim(), email, '', 0, hasil]);
}

function kirimSambutan_(nama, email, nim) {
  const url = urlAplikasi_();
  const td = 'style="padding:6px 10px;border:1px solid #ddd"';
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;line-height:1.6">' +
    '<p>Assalamu\'alaikum warahmatullahi wabarakatuh,</p>' +
    '<p>Selamat datang, <b>' + esc_(nama) + '</b>! 🎉</p>' +
    '<p>Anda sudah terdaftar sebagai kader di <b>' + esc_(CONFIG.NAMA_SISTEM) + '</b> &mdash; ' +
    'sistem absensi dan pendataan kader <b>' + esc_(CONFIG.PENYELENGGARA) + '</b>.</p>' +
    '<p><b>Data masuk Anda:</b></p>' +
    '<table style="border-collapse:collapse;font-size:13px">' +
    '<tr><td ' + td + '>Email</td><td ' + td + '><b>' + esc_(email) + '</b></td></tr>' +
    '<tr><td ' + td + '>NPM / NIA</td><td ' + td + '><b>' + esc_(nim || '(kosong — cukup email)') + '</b></td></tr>' +
    '</table>' +
    (url ? '<p style="margin:18px 0"><a href="' + url + '" style="background:#8b1a1a;color:#fff;padding:10px 18px;' +
      'border-radius:6px;text-decoration:none;display:inline-block">Buka ' + esc_(CONFIG.NAMA_SISTEM) + '</a></p>' : '') +
    '<p><b>Cara absen:</b></p><ol style="padding-left:20px;margin-top:0">' +
    '<li>Buka link di atas lalu masuk dengan email, NPM/NIA, dan <b>PIN 6 angka</b>. ' +
      'Jika belum punya PIN, saat pertama masuk kode untuk membuat PIN akan dikirim ke email ini.</li>' +
    '<li>Saat kegiatan, tekan <b>Hadir</b> dan izinkan akses lokasi (harus berada di lokasi kegiatan).</li>' +
    '<li>Jika berhalangan, pilih <b>Izin</b> atau <b>Sakit</b>.</li></ol>' +
    '<p>Jadwal kegiatan akan otomatis masuk ke <b>Google Calendar</b> Anda sebagai pengingat. ' +
    'Mohon diperhatikan: tidak hadir tanpa keterangan sebanyak ' + CONFIG.BATAS_TIDAK_HADIR +
    ' kali akan mendapat surat pemberitahuan.</p>' +
    (CONFIG.NTFY_TOPIK ? '<p><b>Agar notifikasi kegiatan muncul di HP:</b> pasang aplikasi <b>ntfy</b> dari Play Store/App Store, ' +
      'tekan tombol <b>+</b>, lalu isi topik: <b>' + esc_(CONFIG.NTFY_TOPIK) + '</b>.</p>' : '') +
    '<p style="font-style:italic;color:#555">"Anggun dalam Moral, Unggul dalam Intelektual"</p>' +
    '<p style="font-weight:bold;font-style:italic;color:#8b1a1a">' + esc_(CONFIG.SALAM_PENUTUP).replace(/\n/g, '<br>') + '</p>' +
    '<p>Wassalamu\'alaikum warahmatullahi wabarakatuh.</p>' +
    '<p>Hormat kami,<br><b>' + esc_(pengirim_()) + '</b></p>' +
    '<p style="font-size:11px;color:#888">Email ini dikirim otomatis oleh sistem.</p></div>';

  const teks = 'Selamat datang, ' + nama + '! Anda terdaftar di ' + CONFIG.NAMA_SISTEM +
    '. Masuk dengan email ' + email + (nim ? ' dan NPM/NIA ' + nim : '') + '. ' + url + ' ' + CONFIG.SALAM_PENUTUP;

  const opsi = { name: pengirim_(), htmlBody: html };
  MailApp.sendEmail(email, 'Selamat Datang di ' + CONFIG.NAMA_SISTEM + ' | ' + CONFIG.PENYELENGGARA, teks, opsi);
}

// =========================================================
//                    EMAIL PERINGATAN
// =========================================================
/**
 * Cek semua kader. Jika jumlah tidak hadir mencapai 3 (atau 6, 9, ...)
 * dan peringatan tahap itu belum pernah terkirim, kirim email.
 */
function cekPeringatan_() {
  const batas = CONFIG.BATAS_TIDAK_HADIR;
  const absen = rows_('ABSENSI');
  const tahapTerkirim = {};
  rows_('LOG').forEach(r => {
    if (r[6] === 'Terkirim') tahapTerkirim[r[1]] = Math.max(tahapTerkirim[r[1]] || 0, Number(r[5]));
  });

  const terkirim = [];
  rows_('PESERTA').forEach(p => {
    const daftar = absen.filter(r => r[3] === p[0] && statusTidakHadir_(r[5]));
    const jumlah = daftar.length;
    const tahap = Math.floor(jumlah / batas);
    if (tahap >= 1 && tahap > (tahapTerkirim[p[0]] || 0)) {
      let hasil = 'Terkirim';
      try {
        if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Kuota email harian habis');
        kirimEmail_(p, daftar, jumlah, tahap);
        if (p[4]) kirimWA_(p[4], 'Assalamu\'alaikum, *' + p[1] + '*.\n\nBerdasarkan catatan absensi, Anda tercatat *tidak hadir ' + jumlah +
          ' kali*. Mohon hadir pada kegiatan berikutnya. Detail ada di email & SIMAK:\n' + urlAplikasi_() + '/?masuk', 'peringatan');
      } catch (e) {
        hasil = 'Gagal: ' + e.message;
      }
      sh_('LOG').appendRow([new Date(), p[0], p[1], p[3], jumlah, tahap, hasil]);
      if (hasil === 'Terkirim') terkirim.push(p[1]);
    }
  });
  return terkirim;
}

function kirimEmail_(p, daftar, jumlah, tahap) {
  const nama = p[1];
  const baris = daftar.map((r, i) =>
    '<tr><td style="border:1px solid #ccc;padding:6px;text-align:center">' + (i + 1) + '</td>' +
    '<td style="border:1px solid #ccc;padding:6px">' + esc_(r[1]) + '</td>' +
    '<td style="border:1px solid #ccc;padding:6px">' + esc_(tglIndo_(r[2])) + '</td>' +
    '<td style="border:1px solid #ccc;padding:6px;text-align:center">' + esc_(r[5]) + '</td></tr>'
  ).join('');

  const subjek = '[' + CONFIG.PENYELENGGARA + '] Pemberitahuan Ketidakhadiran (' + jumlah + ' kali)';

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;line-height:1.6">' +
    '<p>Assalamu\'alaikum warahmatullahi wabarakatuh,</p>' +
    '<p>Yth. <b>' + esc_(nama) + '</b>,</p>' +
    '<p>Berdasarkan catatan absensi, Saudara/i tercatat <b>tidak hadir sebanyak ' + jumlah +
    ' kali</b> pada kegiatan berikut:</p>' +
    '<table style="border-collapse:collapse;width:100%;font-size:13px">' +
    '<tr style="background:#8b1a1a;color:#fff">' +
    '<th style="border:1px solid #ccc;padding:6px">No</th>' +
    '<th style="border:1px solid #ccc;padding:6px">Kegiatan</th>' +
    '<th style="border:1px solid #ccc;padding:6px">Tanggal</th>' +
    '<th style="border:1px solid #ccc;padding:6px">Status</th></tr>' + baris + '</table>' +
    (tahap > 1 ? '<p>Ini merupakan <b>peringatan ke-' + tahap + '</b>.</p>' : '') +
    '<p>Mohon perhatian Saudara/i untuk dapat mengikuti kegiatan berikutnya. ' +
    'Apabila terdapat kekeliruan data atau ada kendala, silakan menghubungi panitia.</p>' +
    '<p style="font-weight:bold;font-style:italic;color:#8b1a1a">' + esc_(CONFIG.SALAM_PENUTUP).replace(/\n/g, '<br>') + '</p>' +
    '<p>Wassalamu\'alaikum warahmatullahi wabarakatuh.</p>' +
    '<p>Hormat kami,<br><b>' + esc_(pengirim_()) + '</b></p>' +
    '<p style="font-size:11px;color:#888">Email ini dikirim otomatis oleh sistem absensi.</p></div>';

  const teks = 'Yth. ' + nama + ', Anda tercatat tidak hadir sebanyak ' + jumlah +
    ' kali. Mohon hadir pada kegiatan berikutnya. ' + CONFIG.SALAM_PENUTUP + ' - ' + pengirim_();

  const opsi = { name: pengirim_(), htmlBody: html };
  if (CONFIG.EMAIL_ADMIN) opsi.cc = CONFIG.EMAIL_ADMIN;
  MailApp.sendEmail(p[3], subjek, teks, opsi);
}

/**
 * Tombol "Peringatan" di halaman admin: kirim email peringatan ke satu kader
 * kapan saja, berisi daftar ketidakhadirannya + pesan tambahan dari admin.
 */
function kirimPeringatanManual(pw, idKader, pesan) {
  cek_(pw);
  const p = rows_('PESERTA').find(r => r[0] === idKader);
  if (!p) throw new Error('Kader tidak ditemukan.');
  if (!p[3]) throw new Error('Kader ini belum punya email.');
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Kuota email harian habis. Coba lagi besok.');

  const daftar = rows_('ABSENSI').filter(r => r[3] === p[0] && statusTidakHadir_(r[5]));
  const jumlah = daftar.length;
  pesan = String(pesan || '').trim();

  const baris = daftar.map((r, i) =>
    '<tr><td style="border:1px solid #ccc;padding:6px;text-align:center">' + (i + 1) + '</td>' +
    '<td style="border:1px solid #ccc;padding:6px">' + esc_(r[1]) + '</td>' +
    '<td style="border:1px solid #ccc;padding:6px">' + esc_(tglIndo_(r[2])) + '</td>' +
    '<td style="border:1px solid #ccc;padding:6px;text-align:center">' + esc_(r[5]) + '</td></tr>'
  ).join('');

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;line-height:1.6">' +
    '<p>Assalamu\'alaikum warahmatullahi wabarakatuh,</p>' +
    '<p>Yth. <b>' + esc_(p[1]) + '</b>,</p>' +
    (pesan ? '<p>' + esc_(pesan).replace(/\n/g, '<br>') + '</p>' : '') +
    (jumlah
      ? '<p>Berdasarkan catatan absensi, Saudara/i tercatat <b>tidak hadir sebanyak ' + jumlah + ' kali</b>:</p>' +
        '<table style="border-collapse:collapse;width:100%;font-size:13px">' +
        '<tr style="background:#8b1a1a;color:#fff">' +
        '<th style="border:1px solid #ccc;padding:6px">No</th>' +
        '<th style="border:1px solid #ccc;padding:6px">Kegiatan</th>' +
        '<th style="border:1px solid #ccc;padding:6px">Tanggal</th>' +
        '<th style="border:1px solid #ccc;padding:6px">Status</th></tr>' + baris + '</table>'
      : '') +
    '<p>Mohon perhatian Saudara/i untuk aktif mengikuti kegiatan-kegiatan berikutnya. ' +
    'Apabila ada kendala, silakan menghubungi pengurus.</p>' +
    '<p style="font-weight:bold;font-style:italic;color:#8b1a1a">' + esc_(CONFIG.SALAM_PENUTUP).replace(/\n/g, '<br>') + '</p>' +
    '<p>Wassalamu\'alaikum warahmatullahi wabarakatuh.</p>' +
    '<p>Hormat kami,<br><b>' + esc_(pengirim_()) + '</b></p></div>';

  const teks = 'Yth. ' + p[1] + ', ' + (pesan ? pesan + ' ' : '') +
    (jumlah ? 'Anda tercatat tidak hadir sebanyak ' + jumlah + ' kali. ' : '') +
    'Mohon aktif mengikuti kegiatan berikutnya. ' + CONFIG.SALAM_PENUTUP + ' - ' + pengirim_();

  const opsi = { name: pengirim_(), htmlBody: html };
  if (CONFIG.EMAIL_ADMIN) opsi.cc = CONFIG.EMAIL_ADMIN;
  MailApp.sendEmail(p[3], '[' + CONFIG.PENYELENGGARA + '] Surat Peringatan', teks, opsi);

  // dicatat terpisah agar tidak mengganggu hitungan peringatan otomatis
  sh_('LOG').appendRow([new Date(), p[0], p[1], p[3], jumlah, 'Manual', 'Terkirim (manual)']);
  return { nama: p[1], email: p[3] };
}

/**
 * Data untuk tombol "WA": nomor HP kader + daftar ketidakhadirannya.
 * Pesan WhatsApp disusun di browser lalu dibuka lewat wa.me.
 */
function dataPeringatanWA(pw, idKader) {
  cek_(pw);
  const p = rows_('PESERTA').find(r => r[0] === idKader);
  if (!p) throw new Error('Kader tidak ditemukan.');
  const daftar = rows_('ABSENSI').filter(r => r[3] === p[0] && statusTidakHadir_(r[5]))
    .map(r => ({ nama: r[1], tanggal: tglIndo_(r[2]), status: r[5] }));
  sh_('LOG').appendRow([new Date(), p[0], p[1], String(p[4]), daftar.length, 'Manual', 'WhatsApp dibuka']);
  return { nama: p[1], hp: String(p[4]), daftar: daftar, penyelenggara: CONFIG.PENYELENGGARA, penutup: CONFIG.SALAM_PENUTUP };
}

/** Opsional: jalankan dari editor untuk mengetes email ke diri sendiri. */
function tesEmail() {
  hanyaEditor_();
  const saya = Session.getActiveUser().getEmail();
  kirimEmail_(['P000', 'Kader Uji Coba', '', saya], [
    ['K001', 'Kajian Rutin', '2026-10-01', 'P000', 'Kader Uji Coba', 'Alpa'],
    ['K002', 'Rapat Pengurus', '2026-10-08', 'P000', 'Kader Uji Coba', 'Alpa'],
    ['K003', 'Kajian Rutin', '2026-10-15', 'P000', 'Kader Uji Coba', 'Alpa']
  ], 3, 1);
  Logger.log('Email uji coba dikirim ke ' + saya);
}

// ===== AKHIR FILE KODE =====
