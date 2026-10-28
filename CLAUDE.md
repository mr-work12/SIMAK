# SIMAK — PK IMM FAI UM Bengkulu

SIMAK (Sistem Informasi Manajemen Kaderisasi) is a Google Apps Script web app owned by the PK Google account
(pkimmfaiumbengkulu@gmail.com). The user is Alzawan (Kabid Kader). He writes short Indonesian commands, often with a
"fancy font" keyboard (𝖭𝗉𝗆 𝟤𝟥𝟩…). Reply in short, plain Indonesian. He is not a programmer.

## Folder

| Path | Isi |
|---|---|
| `src/Code.gs` | Server code. In the Apps Script project this file is named **Kode**. |
| `src/Index.html` | Whole client (HTML+CSS+JS) in one file, named **Index** in the project. |
| `.github/workflows/pasang.yml` | GitHub Actions: on every push to `main` that touches `src/**`, clones the live Apps Script project with clasp, overwrites the server file (the `.js` containing `function setup()`) and `Index.html`, `clasp push --force`, then `clasp deploy -i $DEPLOYMENT_ID` (updates the existing deployment, so the `/exec` URL stays the same). Secrets: `CLASPRC_JSON`, `SCRIPT_ID`, `DEPLOYMENT_ID` (Actions → Repository secrets). |
| `web/` | Netlify wrapper site (`https://simak-pk-imm-fai-um-bengkulu.netlify.app`), iframes the `/exec` URL. Not auto-deployed. |
| `tes/harness.js` | Node `vm` harness: loads `src/Code.gs` with mocked Apps Script services. `require('./harness')` gives `{ R, pw, sheets, mails, ctx }`; `R("fungsi(...)")` runs code inside the script. Example: `node tes/contoh-tes.js`. |
| `tes/mock.js` | Browser mock of `google.script.run` for Playwright UI tests of `src/Index.html`. |

## Releasing

1. Edit `src/Code.gs` / `src/Index.html`, bump the version label, test (below).
2. Commit and push to `main`. The workflow deploys in ~1–2 minutes; tell the user to check the version label under the
   logo in SIMAK, and to look at the Actions tab if it does not change.
3. If the change needs `setup` (new sheet/column, new trigger, new permission scope), tell the user to run `setup` once
   from the Apps Script editor with the PK account — `setup` refuses to run from the browser.
4. Never commit secrets (tokens, `.clasprc.json`, passwords). Admin password, Fonnte token and webhook secret live in
   Script Properties, not in code.

## Code conventions

- Indonesian names. Server helpers end with `_` (hidden from `google.script.run`). Every function without `_` is
  callable from any browser, so it must start with `cek_(pw)` (admin), `verifikasi_(email, token)` (kader), use
  `cekBatas_/catatGagal_` (public), or `hanyaEditor_()` / `pemicu_(e)` (editor-only / trigger handlers).
- Admin password: `passwordAdmin_()` (Script Property `PASSWORD_ADMIN`). Never hardcode a real password.
- Writes inside `kunci_(() => {...})`.
- New columns: append to the header in `SHEET`; `siapkanSheet_()` adds them (needs setup). Old rows have them empty.
  Write number-like text with a `"'" +` prefix.
- `getData(pw)` (admin) and `dataPeserta(email, token)` (kader) feed the browser; a raw `Date` in the result turns the
  whole payload into `null` — format with `fmt_()` / `tglIndo_()`.
- Normalize user text with `rapiTeks_()` (NFKC). Escape with `esc()` (client) / `esc_()` (email HTML).
- Client: wrap each `renderXxx()` call in `render()` with try/catch. Kader pages use `data-ps-page` + `MENU_PESERTA`.
- WhatsApp (Fonnte): `kirimWA_(nomor|array, pesan, jenis)` never throws, logs to *Log WhatsApp*; message types are
  toggles in `JENIS_WA`. Webhook `doPost` ignores echoes ("pesan otomatis") and dedupes per sender+keyword.
- SIMAK is for FAI kader (prodi PAI/KPI). DAD graduates from other prodi get status `Lulus DAD (Luar FAI)`, no account.
- Bump the label `Versi DD Mmm YYYY · HH.MM` in `src/Index.html` (appears twice) on every release.

## Testing before every release

1. `node -e "new Function(require('fs').readFileSync('src/Code.gs','utf8'))"` (syntax).
2. Server logic with `tes/harness.js` — call the changed functions with realistic data, including failure paths.
3. UI: Playwright, 390×844 viewport, init script `tes/mock.js`, open `src/Index.html`, screenshot the changed part, and
   require zero `pageerror` events.

Say plainly what could not be tested here (real Sheets/Drive/Slides/Gmail, triggers, Fonnte).

## Lessons learned

- "Masih sama" usually means the old version is still deployed — check the version label and the Actions run first.
- Fonnte webhook needs **autoread** ON; the free plan appends "Sent via fonnte.com".
- Keep WA mass broadcasts off while the connected number is someone's personal number.
- Certificates: Slides templates keyed by `VERSI_TEMPLATE` + style; bump it when the layout changes.
