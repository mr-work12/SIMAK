// Contoh uji fungsi server. Jalankan: node tes/contoh-tes.js
const { R, pw } = require('./harness');
R(`daftarPeserta({nama:'Ani',nim:'2370233001',email:'ani@x.com',hp:'0811',tahunDad:'2024',pin:'123456',tempatLahir:'Manna',tanggalLahir:'2004-01-01',syahadah:'Belum'})`);
const d = R(`getData(${pw})`);
console.log('Jumlah kader:', d.peserta.length, '| nama:', d.peserta.map(x => x.nama).join(', '));
