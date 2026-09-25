/**
 * =========================================================================
 * CODE.GS — BACKEND APLIKASI UTAMA (Portal Konsultan Pajak)
 * TAHAP 1: Login + Manajemen Users
 * =========================================================================
 * CARA PASANG:
 * 1. Buka Google Sheet "Skema-Database-Aplikasi" Anda
 * 2. Menu Extensions > Apps Script
 * 3. Hapus semua isi editor bawaan, tempel SELURUH isi file ini
 * 4. Klik Save (Ctrl+S)
 * 5. Deploy > New deployment > tipe "Web app"
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Deploy, salin URL yang muncul, kabari Claude
 *
 * CATATAN: Ini BARU Tahap 1 (Login + Users). Modul lain (Klien, Pekerjaan,
 * Invoice, dst) akan ditambahkan bertahap di file ini juga — jangan kaget
 * kalau nanti file ini bertambah panjang seiring tahap berikutnya.
 *
 * PENTING soal Sheet yang dipakai: script ini SELALU membaca/menulis ke
 * Spreadsheet TEMPAT SCRIPT INI TERPASANG (lewat Extensions > Apps Script
 * di Sheet Anda sendiri) — BUKAN ke Sheet ID tertentu yang ditanam di kode.
 * Jadi kalau file ini dipakai untuk klien lain (salin Sheet template lalu
 * paste kode ini ke Sheet salinannya), TIDAK ADA yang perlu diedit di kode
 * — otomatis akan nempel ke Sheet masing-masing klien.
 * =========================================================================
 */

// ============================================================
// KONFIGURASI
// ============================================================
const TAB_USERS = 'Users';
const TAB_CLIENTS = 'Clients';
const TAB_JOBS = 'Jobs';
const TAB_REMINDERS = 'Reminders';
const TAB_INVOICES = 'Invoices';
const TAB_INVOICE_ITEMS = 'InvoiceItems';
const TAB_DOCUMENTS = 'Documents';
const TAB_CALENDAR_NOTES = 'CalendarNotes';
const TAB_MESSAGES = 'Messages';
const TAB_ACTIVITY_LOG = 'ActivityLog';
const TAB_SYSTEM_SETTINGS = 'SystemSettings';
const TAB_MODULE_ACCESS = 'ModuleAccess';
const TAB_BIDANG_USAHA = 'BidangUsahaList';
const TAB_BENTUK_BADAN = 'BentukBadanList';
const TAB_SUB_MODULE_ACCESS = 'SubModuleAccess';
const TAB_USER_MODULE_OVERRIDE = 'UserModuleOverride';
const TAB_MEETING_MINUTES = 'MeetingMinutes';
const TAB_MEETING_CLIENTS = 'MeetingMinutesClients';
const TAB_MEETING_ACTION_ITEMS = 'MeetingActionItems';
const TAB_TELEGRAM_NOTIF = 'TelegramNotifSettings';
const TAB_LAYANAN_SELESAI = 'LayananSelesaiLog';

// Nama folder Google Drive tempat menyimpan dokumen yang diupload lewat modul Dokumen
const DRIVE_FOLDER_DOKUMEN = 'Portal Konsultan Pajak - Dokumen';

// Nama kolom pertama tiap tab — dipakai untuk cari baris header secara OTOMATIS
// (supaya tidak masalah walau ada baris keterangan/kosong di atas header sungguhan)
const FIRST_HEADER_CELL = {
  Users: 'id',
  Clients: 'id',
  Jobs: 'id',
  Reminders: 'id',
  Invoices: 'id',
  InvoiceItems: 'id',
  Documents: 'id',
  CalendarNotes: 'id',
  Messages: 'id',
  ActivityLog: 'id',
  SystemSettings: 'field',
  ModuleAccess: 'moduleId',
  SubModuleAccess: 'subModuleId',
  UserModuleOverride: 'id',
  BidangUsahaList: 'id',
  BentukBadanList: 'id',
  MeetingMinutes: 'id',
  MeetingMinutesClients: 'id',
  MeetingActionItems: 'id',
  TelegramNotifSettings: 'aksiId',
  LayananSelesaiLog: 'id',
};

// ============================================================
// SPREADSHEET AKTIF — helper tunggal ini menggantikan pola lama
// `SpreadsheetApp.openById(SHEET_ID)`. Dengan getActiveSpreadsheet(),
// script otomatis mengoperasikan Sheet TEMPAT SCRIPT INI TERPASANG,
// jadi tidak ada ID yang perlu disamakan/diedit manual per klien.
// ============================================================
// ============================================================
// PAKET DATA AWAL — menggabungkan SEMUA data yang dibutuhkan saat aplikasi
// pertama dibuka jadi SATU kali panggilan (bukan 15 permintaan terpisah).
// Ini optimasi PALING BERPENGARUH untuk kecepatan: tiap permintaan HTTP ke
// Apps Script Web App itu ada biaya "buka eksekusi baru" sendiri-sendiri —
// menggabungkannya jadi 1 permintaan menghemat 14x biaya itu sekaligus.
// Isinya cuma memanggil fungsi-fungsi getAllX yang SUDAH ADA (tidak diubah
// sama sekali), supaya tidak ada risiko perilaku beda antara dipanggil
// sendiri-sendiri vs digabung di sini.
// ============================================================
// Jalankan 1 potongan data dengan aman — kalau tab Sheet-nya belum ada atau
// error apa pun, JANGAN gagalkan seluruh paket, cukup potongan itu saja yang
// kosong. Ini pelajaran dari insiden sebelumnya: 1 fungsi besar tanpa
// penjagaan sendiri-sendiri berarti 1 tab yang belum lengkap bisa
// menjatuhkan SEMUA data — padahal versi lama (gelombang terpisah) tidak
// begitu, karena tiap potongan memang independen.
function amankanPotongan(fn) {
  try { return { ok: true, data: fn() }; }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
}

// ============================================================
// CEK KESEHATAN KONEKSI — versi RINGAN dari getBootBundle, cuma cek tiap
// tab Sheet ADA atau TIDAK (tidak baca isinya sama sekali), supaya bisa
// dipanggil berkala tanpa boros kuota/waktu. Dipakai tab "Koneksi" di
// Pengaturan untuk indikator pulse hijau/merah yang auto-refresh.
// ============================================================
function cekKesehatanSheetBackend() {
  const petaTab = {
    users: TAB_USERS, clients: TAB_CLIENTS, jobs: TAB_JOBS, reminders: TAB_REMINDERS,
    invoices: TAB_INVOICES, invoiceItems: TAB_INVOICE_ITEMS, documents: TAB_DOCUMENTS,
    notes: TAB_CALENDAR_NOTES, messages: TAB_MESSAGES, logs: TAB_ACTIVITY_LOG,
    systemSettings: TAB_SYSTEM_SETTINGS, moduleAccess: TAB_MODULE_ACCESS,
    subModuleAccess: TAB_SUB_MODULE_ACCESS, overrides: TAB_USER_MODULE_OVERRIDE,
    bidangUsahaDaftar: TAB_BIDANG_USAHA, bentukBadanDaftar: TAB_BENTUK_BADAN,
    meetings: TAB_MEETING_MINUTES, meetingClients: TAB_MEETING_CLIENTS, meetingActionItems: TAB_MEETING_ACTION_ITEMS,
    telegramSettings: TAB_TELEGRAM_NOTIF, layananSelesaiDaftar: TAB_LAYANAN_SELESAI,
  };
  const ss = getSS();
  const hasil = {};
  Object.keys(petaTab).forEach(key => {
    try { hasil[key] = ss.getSheetByName(petaTab[key]) !== null; }
    catch (err) { hasil[key] = false; }
  });
  return { success: true, status: hasil };
}

function getBootBundleBackend(email) {
  const potongan = {
    users: amankanPotongan(() => getAllUsers().users),
    clients: amankanPotongan(() => getAllClients().clients),
    jobs: amankanPotongan(() => getAllJobs().jobs),
    reminders: amankanPotongan(() => getAllReminders().reminders),
    meetings: amankanPotongan(() => getAllMeetingMinutesBackend().meetings),
    layananSelesaiDaftar: amankanPotongan(() => getLayananSelesaiBackend(bulanTahunSekarangBackend()).daftar),
    invoices: amankanPotongan(() => getAllInvoices().invoices),
    documents: amankanPotongan(() => getAllDocuments().documents),
    notes: amankanPotongan(() => getAllCalendarNotes().notes),
    messages: amankanPotongan(() => getAllMessages().messages),
    logs: amankanPotongan(() => getActivityLog().logs),
    overrides: amankanPotongan(() => getUserOverridesBackend(email).overrides),
    bidangUsahaDaftar: amankanPotongan(() => getBidangUsahaListBackend().daftar),
    bentukBadanDaftar: amankanPotongan(() => getBentukBadanListBackend().daftar),
    telegramSettings: amankanPotongan(() => getTelegramNotifSettingsBackend().settings),
  };

  const hasil = { success: true, gagal: [] };
  Object.keys(potongan).forEach(key => {
    if (potongan[key].ok) hasil[key] = potongan[key].data;
    else { hasil[key] = []; hasil.gagal.push({ bagian: key, error: potongan[key].error }); }
  });
  return hasil;
}
function bulanTahunSekarangBackend(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

function getSS(){
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ============================================================
// WEB APP ENTRYPOINT
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    let result;
    switch (action) {
      case 'login':
        result = login(body.email, body.password, body.forceLogin, body.deviceInfo);
        break;
      case 'verifySession':
        result = verifySessionBackend(body.email, body.sessionToken);
        break;
      case 'getBootBundle':
        result = getBootBundleBackend(body.email);
        break;
      case 'cekKesehatanSheet':
        result = cekKesehatanSheetBackend();
        break;
      case 'checkEmailExists':
        result = checkEmailExists(body.email);
        break;
      case 'forgotPassword':
        result = forgotPassword(body.email);
        break;
      case 'buatSuperadminPertama':
        result = buatSuperadminPertama(body.nama, body.email, body.password);
        break;
      case 'getSystemSettings':
        result = getSystemSettingsBackend();
        break;
      case 'getAllModulesMatrix':
        result = getAllModulesMatrixBackend();
        break;
      case 'toggleModuleAccess':
        result = toggleModuleAccessBackend(body.moduleId, body.role);
        break;
      case 'getAllSubModulesMatrix':
        result = getAllSubModulesMatrixBackend();
        break;
      case 'toggleSubModuleAccess':
        result = toggleSubModuleAccessBackend(body.subModuleId, body.role);
        break;
      case 'getUserOverrides':
        result = getUserOverridesBackend(body.email);
        break;
      case 'setUserOverride':
        result = setUserOverrideBackend(body.email, body.subModuleId, body.allowed);
        break;
      case 'removeUserOverride':
        result = removeUserOverrideBackend(body.email, body.subModuleId);
        break;
      case 'getBidangUsahaList':
        result = getBidangUsahaListBackend();
        break;
      case 'addBidangUsaha':
        result = addBidangUsahaBackend(body.nama);
        break;
      case 'getBentukBadanList':
        result = getBentukBadanListBackend();
        break;
      case 'addBentukBadan':
        result = addBentukBadanBackend(body.nama);
        break;
      case 'getAllMeetingMinutes':
        result = getAllMeetingMinutesBackend();
        break;
      case 'getMeetingMinutesForClient':
        result = getMeetingMinutesForClientBackend(body.clientId);
        break;
      case 'searchMeetingMinutes':
        result = searchMeetingMinutesBackend(body.query, body.clientId);
        break;
      case 'addMeetingMinutes':
        result = addMeetingMinutesBackend(body.data);
        break;
      case 'updateMeetingMinutes':
        result = updateMeetingMinutesBackend(body.id, body.data);
        break;
      case 'getTelegramNotifSettings':
        result = getTelegramNotifSettingsBackend();
        break;
      case 'updateTelegramNotifSetting':
        result = updateTelegramNotifSettingBackend(body.aksiId, body.field, body.value);
        break;
      case 'kirimTestTelegram':
        result = kirimTestTelegramBackend();
        break;
      case 'kirimNotifikasiAktivitasTelegram':
        result = kirimNotifikasiAktivitasTelegram(body.aksi, body.detail, body.user);
        break;
      case 'getLayananSelesai':
        result = getLayananSelesaiBackend(body.bulanTahun);
        break;
      case 'toggleLayananSelesai':
        result = toggleLayananSelesaiBackend(body.clientId, body.layanan, body.bulanTahun);
        break;
      case 'kirimRingkasanKinerjaKeTelegram':
        result = kirimRingkasanKinerjaKeTelegramBackend(body.tglMulai, body.tglSelesai);
        break;
      case 'aturJadwalRingkasanKinerja':
        result = aturJadwalRingkasanKinerjaBackend(body.jam);
        break;
      case 'nonaktifkanJadwalRingkasanKinerja':
        result = nonaktifkanJadwalRingkasanKinerjaBackend();
        break;
      case 'getInfoKoneksi':
        result = getInfoKoneksi();
        break;
      case 'updateSystemSettings':
        result = updateSystemSettingsBackend(body.updates);
        break;
      case 'uploadLogoKantor':
        result = uploadLogoKantorBackend(body.base64Data, body.mimeType);
        break;
      case 'getAllUsers':
        result = getAllUsers();
        break;
      case 'addUser':
        result = addUser(body.user);
        break;
      case 'updateUser':
        result = updateUser(body.user);
        break;
      case 'deleteUser':
        result = deleteUser(body.email);
        break;
      case 'getAllClients':
        result = getAllClients();
        break;
      case 'addClient':
        result = addClient(body.client);
        break;
      case 'updateClient':
        result = updateClient(body.client);
        break;
      case 'deleteClient':
        result = deleteClient(body.id);
        break;
      case 'getAllJobs':
        result = getAllJobs();
        break;
      case 'addJob':
        result = addJob(body.job);
        break;
      case 'updateJob':
        result = updateJob(body.id, body.updates);
        break;
      case 'deleteJob':
        result = deleteJob(body.id);
        break;
      case 'getAllReminders':
        result = getAllReminders();
        break;
      case 'addReminder':
        result = addReminder(body.reminder);
        break;
      case 'updateReminder':
        result = updateReminder(body.id, body.updates);
        break;
      case 'deleteReminder':
        result = deleteReminder(body.id);
        break;
      case 'getAllInvoices':
        result = getAllInvoices();
        break;
      case 'addInvoice':
        result = addInvoice(body.invoice);
        break;
      case 'updateInvoiceStatus':
        result = updateInvoiceStatus(body.id, body.status);
        break;
      case 'deleteInvoice':
        result = deleteInvoice(body.id);
        break;
      case 'getAllDocuments':
        result = getAllDocuments();
        break;
      case 'addDocument':
        result = addDocument(body.document);
        break;
      case 'updateDocument':
        result = updateDocument(body.document);
        break;
      case 'deleteDocument':
        result = deleteDocument(body.id);
        break;
      case 'getAllCalendarNotes':
        result = getAllCalendarNotes();
        break;
      case 'addCalendarNote':
        result = addCalendarNote(body.note);
        break;
      case 'updateCalendarNote':
        result = updateCalendarNote(body.id, body.updates);
        break;
      case 'deleteCalendarNote':
        result = deleteCalendarNote(body.id);
        break;
      case 'getAllMessages':
        result = getAllMessages();
        break;
      case 'sendMessage':
        result = sendMessage(body.message);
        break;
      case 'markMessagesRead':
        result = markMessagesRead(body.fromEmail, body.toEmail);
        break;
      case 'getActivityLog':
        result = getActivityLog();
        break;
      case 'addActivityLog':
        result = addActivityLog(body.log);
        break;
      default:
        result = { success: false, message: 'Aksi tidak dikenali: ' + action };
    }
    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ success: false, message: 'Terjadi kesalahan server: ' + err.message });
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    'Backend Aplikasi Utama Portal Konsultan Pajak aktif. Endpoint ini menerima request POST, bukan GET.'
  ).setMimeType(ContentService.MimeType.TEXT);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// LOGIN
// ============================================================
// ============================================================
// PERLINDUNGAN LOGIN — kunci sementara setelah gagal berkali-kali
// Pakai CacheService (bawaan Apps Script) — otomatis kadaluarsa sendiri,
// tidak perlu tabel Sheet tambahan, dan tidak akan "menumpuk" data.
// ============================================================
const BATAS_GAGAL_LOGIN = 5;
const DURASI_KUNCI_DETIK = 15 * 60; // 15 menit

function cekApakahTerkunci(email) {
  const cache = CacheService.getScriptCache();
  const jumlahGagal = Number(cache.get('gagal_login_' + email)) || 0;
  return jumlahGagal >= BATAS_GAGAL_LOGIN;
}
function catatGagalLogin(email) {
  const cache = CacheService.getScriptCache();
  const key = 'gagal_login_' + email;
  const jumlahGagal = (Number(cache.get(key)) || 0) + 1;
  cache.put(key, String(jumlahGagal), DURASI_KUNCI_DETIK);
}
function resetGagalLogin(email) {
  CacheService.getScriptCache().remove('gagal_login_' + email);
}

function login(email, password, forceLogin, deviceInfo) {
  if (!email || !password) {
    return { success: false, message: 'Email dan password wajib diisi.' };
  }
  email = String(email).trim().toLowerCase();

  if (cekApakahTerkunci(email)) {
    return { success: false, message: 'Terlalu banyak percobaan gagal. Akun ini dikunci sementara selama 15 menit demi keamanan. Silakan coba lagi nanti.' };
  }

  const users = getSheetAsObjects(TAB_USERS);
  const user = users.find(u => String(u.email).trim().toLowerCase() === email);

  if (!user) {
    catatGagalLogin(email);
    return { success: false, message: 'Email tidak terdaftar.' };
  }
  if (String(user.status).trim() !== 'Aktif') {
    return { success: false, message: 'Akun tidak aktif, hubungi super admin.' };
  }
  if (hashPassword(password) !== user.password) {
    catatGagalLogin(email);
    return { success: false, message: 'Password salah.' };
  }

  resetGagalLogin(email); // login berhasil — hapus catatan gagal sebelumnya

  // Sesi Tunggal — kalau akun ini SUDAH punya sesi aktif di tempat lain, dan
  // yang login sekarang belum konfirmasi "lanjutkan" (forceLogin), tolak dulu
  // dan kasih tahu info sesi lama itu — biar frontend bisa tampilkan modal
  // konfirmasi sebelum benar-benar menggantikannya.
  if (user.sessionToken && !forceLogin) {
    return {
      success: false, sessionConflict: true,
      message: 'Akun ini sedang aktif di tempat lain.',
      nama: user.nama, sessionInfo: user.sessionInfo || 'perangkat lain', sessionTimestamp: user.sessionTimestamp || '',
    };
  }

  const sessionToken = Utilities.getUuid();
  const sessionTimestamp = Utilities.formatDate(new Date(), 'GMT+7', "yyyy-MM-dd'T'HH:mm:ss");

  // catat waktu login terakhir + sesi baru (otomatis menggantikan sesi lama kalau ada)
  updateRowByKey(TAB_USERS, 'email', user.email, {
    terakhirAktif: sessionTimestamp,
    sessionToken: sessionToken, sessionInfo: deviceInfo || '', sessionTimestamp: sessionTimestamp,
  });

  // jangan pernah kirim balik password (walau sudah di-hash) ke aplikasi
  return {
    success: true,
    message: 'Login berhasil.',
    user: {
      id: user.id,
      nama: user.nama,
      email: user.email,
      role: user.role,
      fotoURL: user.fotoURL || '',
      whatsapp: user.whatsapp || '',
      perluGantiPassword: String(user.perluGantiPassword).trim() === 'TRUE',
      sessionToken: sessionToken,
    },
  };
}

// Dipanggil berkala dari tiap device yang sedang login — cek apakah token
// sesi device ini masih yang PALING BARU untuk akun ini. Kalau sudah ada
// login lain (menggantikan sessionToken di Sheet), device ini akan tahu
// sesinya sudah tidak aktif lagi.
function verifySessionBackend(email, sessionToken) {
  if (!email || !sessionToken) return { success: true, valid: false };
  const users = getSheetAsObjects(TAB_USERS);
  const user = users.find(u => String(u.email).trim().toLowerCase() === String(email).trim().toLowerCase());
  if (!user) return { success: true, valid: false };
  return { success: true, valid: user.sessionToken === sessionToken };
}

// Cek apakah 1 email terdaftar sebagai User — TANPA perlu password.
// Dipakai di halaman "Gerbang Email" sebelum masuk ke form login sungguhan.
// Sengaja TIDAK mengembalikan info lain (nama, role, dst) demi keamanan — cukup ya/tidak saja.
function checkEmailExists(email) {
  if (!email) return { success: true, exists: false };
  email = String(email).trim().toLowerCase();
  const users = getSheetAsObjects(TAB_USERS);
  const ada = users.some(u => String(u.email).trim().toLowerCase() === email);
  return { success: true, exists: ada };
}

// ============================================================
// LUPA PASSWORD — Opsi B (password sementara dikirim via email).
// Alurnya: cek dulu email terdaftar sebagai User -> kalau tidak, TOLAK dengan
// pesan jelas (bukan pesan generik "berhasil dikirim" demi keamanan semu —
// aplikasi ini dipakai kalangan tertutup 1 kantor, bukan publik umum, jadi
// aman memberi tahu langsung kalau emailnya tidak terdaftar).
// ============================================================
function generatePasswordSementara() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // tanpa karakter mirip (0/O, 1/l/I)
  let hasil = '';
  for (let i = 0; i < 10; i++) hasil += chars.charAt(Math.floor(Math.random() * chars.length));
  return hasil;
}

function forgotPassword(email) {
  if (!email) return { success: false, message: 'Email wajib diisi.' };
  email = String(email).trim().toLowerCase();

  // Pembatas percobaan — cegah 1 email di-spam permintaan reset berkali-kali
  const cache = CacheService.getScriptCache();
  const cacheKey = 'lupapass_' + email;
  const jumlahPercobaan = Number(cache.get(cacheKey)) || 0;
  if (jumlahPercobaan >= 5) {
    return { success: false, message: 'Terlalu banyak percobaan reset password. Silakan coba lagi dalam 15 menit.' };
  }
  cache.put(cacheKey, String(jumlahPercobaan + 1), 15 * 60);

  const users = getSheetAsObjects(TAB_USERS);
  const user = users.find(u => String(u.email).trim().toLowerCase() === email);
  if (!user) {
    return { success: false, message: 'Email ini tidak ditemukan sebagai user terdaftar. Periksa kembali ejaan email, atau hubungi Superadmin kantor Anda.' };
  }
  if (String(user.status).trim() !== 'Aktif') {
    return { success: false, message: 'Akun tidak aktif, hubungi Superadmin kantor Anda.' };
  }

  const passwordBaru = generatePasswordSementara();
  const ok = updateRowByKey(TAB_USERS, 'email', user.email, {
    password: hashPassword(passwordBaru),
    perluGantiPassword: 'TRUE',
  });
  if (!ok) return { success: false, message: 'Gagal memproses permintaan. Coba lagi nanti.' };

  try {
    kirimEmailPasswordSementara(user.email, user.nama, passwordBaru);
  } catch (err) {
    return { success: false, message: 'Password berhasil diganti, tapi email gagal terkirim (' + err.message + '). Hubungi Superadmin untuk password sementara Anda.' };
  }

  return { success: true, message: 'Password sementara sudah dikirim ke email Anda.' };
}

function kirimEmailPasswordSementara(email, nama, passwordBaru) {
  const settings = getSystemSettingsBackend().settings || {};
  const namaKantor = settings.namaKantor || 'Portal Konsultan Pajak';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#16233F;margin-bottom:4px;">${namaKantor}</h2>
      <p style="color:#5B5E68;font-size:13px;margin-top:0;">Permintaan Reset Password</p>
      <p>Halo ${nama},</p>
      <p>Berikut password sementara untuk akun Anda:</p>
      <div style="background:#F7F6F1;border:1px solid #E4E1D4;border-radius:8px;padding:14px 18px;
                  font-family:'Courier New',monospace;font-size:20px;font-weight:bold;letter-spacing:1px;
                  color:#16233F;text-align:center;margin:16px 0;">
        ${passwordBaru}
      </div>
      <p>Gunakan password ini untuk login, lalu <b>segera ganti dengan password pilihan Anda sendiri</b>
         di menu Profil Saya — sistem akan otomatis mengingatkan Anda begitu berhasil login.</p>
      <p style="color:#8A6D00;font-size:12.5px;">Kalau Anda tidak merasa meminta reset password ini,
         segera hubungi Superadmin kantor Anda.</p>
      <hr style="border:none;border-top:1px solid #E4E1D4;margin:20px 0;">
      <p style="color:#A8ABB5;font-size:11px;">Email ini dikirim otomatis oleh sistem ${namaKantor}.</p>
    </div>`;
  GmailApp.sendEmail(email, `Password Sementara — ${namaKantor}`, '', { htmlBody: html, name: namaKantor });
}

// Buat akun Superadmin PERTAMA — dipanggil otomatis dari Wizard Aktivasi begitu
// serial number terverifikasi valid. SENGAJA dibuat aman: kalau tab Users
// SUDAH ada isinya (bukan Sheet baru lagi), fungsi ini MENOLAK — mencegah
// siapa pun membuat akun superadmin tambahan lewat celah ini di kemudian hari.
function buatSuperadminPertama(nama, email, password) {
  if (!nama || !email || !password) {
    return { success: false, message: 'Nama, email, dan password wajib diisi.' };
  }
  const existingUsers = getSheetAsObjects(TAB_USERS);
  if (existingUsers.length > 0) {
    return { success: false, message: 'Sudah ada user terdaftar di sistem ini — tidak bisa membuat admin pertama lagi lewat jalur ini.' };
  }
  const id = 'USR-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_USERS, {
    id: id, nama: nama, email: String(email).trim().toLowerCase(),
    password: hashPassword(password), role: 'superadmin', status: 'Aktif',
    fotoURL: '', whatsapp: '', terakhirAktif: '',
  });
  return { success: true, message: 'Akun admin pertama berhasil dibuat.', id: id };
}

// ============================================================
// SYSTEM SETTINGS — format KEY-VALUE (kolom: field, value), BEDA dari
// tabel per-baris biasa. Dipakai untuk cek status aktivasi kantor (serialNumber)
// dan konfigurasi umum lainnya — sekarang tersimpan di Sheet, BUKAN cuma
// di memori browser, supaya konsisten walau diakses dari device berbeda-beda.
// ============================================================
function getSystemSettingsBackend() {
  const sheet = getSS().getSheetByName(TAB_SYSTEM_SETTINGS);
  const headerRow = findHeaderRow(sheet, FIRST_HEADER_CELL[TAB_SYSTEM_SETTINGS]);
  const lastRow = sheet.getLastRow();
  const settings = {};
  if (lastRow > headerRow) {
    const values = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, 2).getValues();
    values.forEach(row => { if (row[0]) settings[row[0]] = row[1]; });
  }
  return { success: true, settings: settings };
}
function updateSystemSettingsBackend(updates) {
  if (!updates || typeof updates !== 'object') return { success: false, message: 'Data pengaturan tidak valid.' };
  const sheet = getSS().getSheetByName(TAB_SYSTEM_SETTINGS);
  const headerRow = findHeaderRow(sheet, FIRST_HEADER_CELL[TAB_SYSTEM_SETTINGS]);
  const lastRow = sheet.getLastRow();
  const existingFields = lastRow > headerRow ? sheet.getRange(headerRow + 1, 1, lastRow - headerRow, 1).getValues().map(r => r[0]) : [];

  Object.keys(updates).forEach(field => {
    const idx = existingFields.indexOf(field);
    if (idx > -1) {
      sheet.getRange(headerRow + 1 + idx, 2).setValue(updates[field]);
    } else {
      sheet.appendRow([field, updates[field]]);
      existingFields.push(field); // supaya field yang sama tidak dobel ditambahkan dalam 1 kali panggilan
    }
  });
  return { success: true, message: 'Pengaturan berhasil disimpan.' };
}

// ============================================================
// LOGO KANTOR — disimpan ke Google Drive (BUKAN langsung ke sel Sheet),
// karena base64 gambar nyaris selalu melebihi batas 50.000 karakter per sel
// Google Sheets. Yang disimpan ke SystemSettings cuma URL hasilnya (pendek).
// ============================================================
const DRIVE_FOLDER_LOGO = 'Portal Konsultan Pajak - Logo';

function uploadLogoKantorBackend(base64Data, mimeType) {
  if (!base64Data) return { success: false, message: 'Data logo kosong.' };
  try {
    const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_LOGO);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_LOGO);
    // Hapus logo lama di folder ini dulu, supaya tidak menumpuk file tiap kali ganti logo
    const filesLama = folder.getFiles();
    while (filesLama.hasNext()) { filesLama.next().setTrashed(true); }
    const bersih = String(base64Data).replace(/^data:[^;]+;base64,/, '');
    const blob = Utilities.newBlob(Utilities.base64Decode(bersih), mimeType || 'image/png', 'logo-kantor');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
    return { success: true, url: url };
  } catch (err) {
    return { success: false, message: 'Gagal menyimpan logo: ' + err.message };
  }
}

// Konfirmasi koneksi sungguhan — dipakai di Langkah 2 Wizard Setup untuk menampilkan
// BUKTI nyata (nama Sheet asli, nama folder Drive asli), bukan minta isi ulang Sheet ID/Folder ID
// (karena itu sudah otomatis "given" sejak admin tempel kode ke Sheet & Deploy).
function getInfoKoneksi() {
  const ss = getSS();
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_DOKUMEN);
  const folderSudahAda = folders.hasNext();
  return {
    success: true,
    namaSheet: ss.getName(),
    namaFolderDrive: DRIVE_FOLDER_DOKUMEN,
    folderSudahDibuat: folderSudahAda,
  };
}

// ============================================================
// MODULE ACCESS — matriks akses modul per role (Administrasi > Modul)
// Format Sheet: kolom moduleId, moduleName, lalu 1 kolom per role berisi TRUE/FALSE.
// Sebelumnya ini cuma disimulasikan di memori browser — sekarang beneran tersimpan
// ke Sheet, supaya perubahan toggle TIDAK hilang saat refresh atau beda device.
// ============================================================
const DAFTAR_ROLE_ID = ['superadmin', 'owner', 'direktur', 'admin', 'konsultan', 'klien', 'finance'];

function getAllModulesMatrixBackend() {
  const rows = getSheetAsObjects(TAB_MODULE_ACCESS);
  const modules = rows.map(r => {
    const row = { id: r.moduleId, name: r.moduleName };
    DAFTAR_ROLE_ID.forEach(roleId => { row[roleId] = (r[roleId] === true || r[roleId] === 'TRUE'); });
    return row;
  });
  return { success: true, modules: modules };
}

function toggleModuleAccessBackend(moduleId, role) {
  if (!moduleId || !role) return { success: false, message: 'Data tidak lengkap.' };
  const rows = getSheetAsObjects(TAB_MODULE_ACCESS);
  const row = rows.find(r => r.moduleId === moduleId);
  if (!row) return { success: false, message: 'Modul dengan ID itu tidak ditemukan di Sheet.' };

  const nilaiSekarang = (row[role] === true || row[role] === 'TRUE');
  const nilaiBaru = !nilaiSekarang;
  const ok = updateRowByKey(TAB_MODULE_ACCESS, 'moduleId', moduleId, { [role]: nilaiBaru ? 'TRUE' : 'FALSE' });
  if (!ok) return { success: false, message: 'Gagal memperbarui data di Sheet.' };
  return { success: true, newValue: nilaiBaru };
}

// ============================================================
// SUB-MODULE ACCESS — perluasan dari ModuleAccess, tapi untuk RINCIAN di
// dalam tiap modul (tab, sub-tab, tampilan tertentu). Format Sheet SAMA
// persis seperti ModuleAccess: kolom subModuleId, subModuleName,
// parentModuleId, lalu 1 kolom per role berisi TRUE/FALSE.
// ============================================================
function getAllSubModulesMatrixBackend() {
  const rows = getSheetAsObjects(TAB_SUB_MODULE_ACCESS);
  const subModules = rows.map(r => {
    const row = { id: r.subModuleId, name: r.subModuleName, parentId: r.parentModuleId };
    DAFTAR_ROLE_ID.forEach(roleId => { row[roleId] = (r[roleId] === true || r[roleId] === 'TRUE'); });
    return row;
  });
  return { success: true, subModules: subModules };
}

// ============================================================
// NOTIFIKASI TELEGRAM — checklist aktivitas mana yang dikirim ke Telegram,
// dan ke mana (Grup/Pribadi). Bot Token & ID Grup disimpan lewat mekanisme
// SystemSettings yang sudah ada (updateSystemSettingsBackend) — tidak perlu
// tabel terpisah untuk itu.
// ============================================================
function getTelegramNotifSettingsBackend() {
  const rows = getSheetAsObjects(TAB_TELEGRAM_NOTIF);
  const hasil = rows.map(r => ({
    aksiId: r.aksiId, aktif: String(r.aktif).trim() === 'TRUE',
    kirimGrup: String(r.kirimGrup).trim() === 'TRUE', kirimPribadi: String(r.kirimPribadi).trim() === 'TRUE',
  }));
  return { success: true, settings: hasil };
}

// Helper bersama — dipakai baik oleh Test Kirim Pesan maupun notifikasi
// aktivitas sungguhan, supaya logic panggil API Telegram-nya cuma di 1 tempat.
function kirimPesanTelegramMentah(chatId, pesan) {
  const settings = getSystemSettingsBackend().settings || {};
  const token = settings.telegramBotToken;
  if (!token) return { success: false, message: 'Bot Token belum diisi.' };
  if (!chatId) return { success: false, message: 'Chat ID tujuan kosong.' };
  try {
    const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: String(chatId).trim(), text: pesan, parse_mode: 'Markdown' }),
      muteHttpExceptions: true,
    });
    const hasil = JSON.parse(resp.getContentText());
    if (!hasil.ok) return { success: false, message: 'Telegram menolak: ' + (hasil.description || 'alasan tidak diketahui') };
    return { success: true };
  } catch (err) {
    return { success: false, message: 'Gagal mengirim: ' + err.message };
  }
}

// ============================================================
// STATUS SELESAI PER LAYANAN — dipakai tab tabel Reminder (Selesai vs
// Belum Selesai bulan berjalan). Formatnya sengaja SEDERHANA: 1 baris per
// kombinasi klien+layanan+bulan yang sudah ditandai selesai. Kalau tidak
// ada barisnya, berarti belum selesai (default).
// ============================================================
function getLayananSelesaiBackend(bulanTahun) {
  const rows = getSheetAsObjects(TAB_LAYANAN_SELESAI);
  const milikBulanIni = bulanTahun ? rows.filter(r => r.bulanTahun === bulanTahun) : rows;
  return { success: true, daftar: milikBulanIni.map(r => ({ clientId: r.clientId, layanan: r.layanan, bulanTahun: r.bulanTahun })) };
}

function toggleLayananSelesaiBackend(clientId, layanan, bulanTahun) {
  if (!clientId || !layanan || !bulanTahun) return { success: false, message: 'Data tidak lengkap.' };
  const rows = getSheetAsObjects(TAB_LAYANAN_SELESAI);
  const existing = rows.find(r => r.clientId === clientId && r.layanan === layanan && r.bulanTahun === bulanTahun);
  if (existing) {
    const ok = deleteRowByKey(TAB_LAYANAN_SELESAI, 'id', existing.id);
    return ok ? { success: true, selesai: false } : { success: false, message: 'Gagal membatalkan status selesai.' };
  }
  const id = 'LS-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_LAYANAN_SELESAI, { id: id, clientId: clientId, layanan: layanan, bulanTahun: bulanTahun, tanggalSelesai: new Date().toISOString() });
  return { success: true, selesai: true };
}

function kirimTestTelegramBackend() {
  const settings = getSystemSettingsBackend().settings || {};
  if (!settings.telegramBotToken) return { success: false, message: 'Bot Token belum diisi. Isi dulu di atas, lalu Simpan Konfigurasi.' };
  if (!settings.telegramGrupChatId) return { success: false, message: 'ID Grup Telegram belum diisi. Isi dulu di atas, lalu Simpan Konfigurasi.' };
  const namaKantor = settings.namaKantor || 'Portal Konsultan Pajak';
  const pesan = `\u2705 Tes koneksi berhasil!\n\nBot Telegram untuk *${namaKantor}* sudah tersambung dengan benar. Notifikasi aktivitas akan mulai terkirim ke grup ini begitu diaktifkan di checklist.`;
  const hasil = kirimPesanTelegramMentah(settings.telegramGrupChatId, pesan);
  return hasil.success ? { success: true, message: 'Pesan test berhasil terkirim ke grup Telegram.' } : hasil;
}

// Notifikasi AKTIVITAS SUNGGUHAN — dipanggil dari logActivity() di frontend
// setiap kali ada aksi yang checklist-nya sudah diaktifkan untuk kanal Grup.
// Sengaja cek ULANG checklist-nya di sini (bukan cuma percaya frontend) —
// supaya kalau ada yang mengubah pengaturan di tab lain / device lain
// tepat sebelum aksi ini terjadi, tetap ikut aturan checklist yang terbaru.
function kirimNotifikasiAktivitasTelegram(aksi, detail, user) {
  const rows = getSheetAsObjects(TAB_TELEGRAM_NOTIF);
  const cfg = rows.find(r => r.aksiId === aksi);
  if (!cfg || String(cfg.aktif).trim() !== 'TRUE' || String(cfg.kirimGrup).trim() !== 'TRUE') {
    return { success: true, message: 'Dilewati — aktivitas ini tidak diaktifkan untuk kanal Grup.' };
  }
  const settings = getSystemSettingsBackend().settings || {};
  if (!settings.telegramBotToken || !settings.telegramGrupChatId) return { success: false, message: 'Konfigurasi Bot belum lengkap.' };

  const pesan = `\u{1F514} *${aksi}*\n${user}${detail ? '\n' + detail : ''}`;
  return kirimPesanTelegramMentah(settings.telegramGrupChatId, pesan);
}

// ============================================================
// RINGKASAN KINERJA — infografis otomatis (via Google Slides, di-export
// jadi PNG) dikirim ke Grup Telegram. Bisa terjadwal (jam diatur admin)
// atau manual (rentang tanggal bebas, kirim sekarang).
// ============================================================

// Kelompok kategori "kerjaan" — dipetakan dari nama aksi mentah di
// ActivityLog ke label yang lebih enak dibaca di infografis. Aksi yang
// tidak masuk daftar mana pun (Login/Logout/dst) tidak dihitung sebagai
// "kerjaan", supaya ringkasannya fokus ke hasil kerja, bukan sekadar buka-tutup aplikasi.
const KATEGORI_KERJAAN = {
  'Pekerjaan diselesaikan': ['Setujui Pekerjaan', 'Tolak Pekerjaan', 'Tambah Pekerjaan', 'Ubah Pekerjaan'],
  'Klien ditangani': ['Tambah Klien', 'Ubah Klien'],
  'Reminder ditindaklanjuti': ['Tandai Reminder Selesai', 'Tambah Reminder', 'Ubah Reminder'],
  'Invoice diproses': ['Buat Invoice', 'Ubah Status Invoice'],
  'Dokumen diunggah': ['Unggah Dokumen', 'Ubah Dokumen'],
  'Notulensi dicatat': ['Tambah Notulensi', 'Ubah Notulensi'],
};

function hitungDurasiLoginUser(logsSemua, namaUser) {
  const events = logsSemua.filter(l => l.user === namaUser && (l.aksi === 'Login' || l.aksi === 'Logout'))
    .map(l => ({ aksi: l.aksi, waktu: new Date(l.tanggal + 'T' + l.waktu) }))
    .sort((a, b) => a.waktu - b.waktu);
  let totalMenit = 0, jumlahLogin = 0, loginTerakhir = null;
  events.forEach(e => {
    if (e.aksi === 'Login') { loginTerakhir = e.waktu; jumlahLogin++; }
    else if (e.aksi === 'Logout' && loginTerakhir) {
      totalMenit += (e.waktu - loginTerakhir) / 60000;
      loginTerakhir = null; // sesi tanpa Logout (browser ditutup dsb) sengaja TIDAK dihitung durasinya, biar tidak salah tebak
    }
  });
  return { jumlahLogin, totalMenit: Math.round(totalMenit) };
}
function formatDurasiSingkat(menit) {
  if (menit <= 0) return '0m';
  const jam = Math.floor(menit / 60), sisa = menit % 60;
  return jam > 0 ? `${jam}j ${sisa}m` : `${sisa}m`;
}

function hitungRingkasanKinerja(tglMulai, tglSelesai) {
  const logs = getSheetAsObjects(TAB_ACTIVITY_LOG).filter(l => l.tanggal >= tglMulai && l.tanggal <= tglSelesai);
  const semuaUserAktif = getSheetAsObjects(TAB_USERS).filter(u => String(u.status).trim() === 'Aktif');

  const perUser = {}; // nama -> { total, kategori: {label: count} }
  semuaUserAktif.forEach(u => { perUser[u.nama] = { total: 0, kategori: {} }; }); // semua user aktif MULAI dari 0, biar yang tidak ngapa-ngapain pun tetap kelihatan

  logs.forEach(l => {
    let kategoriDitemukan = null;
    for (const [label, daftarAksi] of Object.entries(KATEGORI_KERJAAN)) {
      if (daftarAksi.includes(l.aksi)) { kategoriDitemukan = label; break; }
    }
    if (!kategoriDitemukan) return; // Login/Logout/dst -> dilewati, bukan "kerjaan"
    if (!perUser[l.user]) perUser[l.user] = { total: 0, kategori: {} }; // jaga-jaga kalau ada user yang sudah nonaktif tapi masih punya log lama
    perUser[l.user].total++;
    perUser[l.user].kategori[kategoriDitemukan] = (perUser[l.user].kategori[kategoriDitemukan] || 0) + 1;
  });

  const daftarUser = Object.keys(perUser).map(nama => {
    const { jumlahLogin, totalMenit } = hitungDurasiLoginUser(logs, nama);
    return {
      nama: nama, total: perUser[nama].total,
      kategori: Object.entries(perUser[nama].kategori).sort((a, b) => b[1] - a[1]).slice(0, 3),
      jumlahLogin: jumlahLogin, durasiLoginMenit: totalMenit,
    };
  }).sort((a, b) => b.total - a.total);

  const totalAktivitas = daftarUser.reduce((s, u) => s + u.total, 0);
  return {
    totalAktivitas: totalAktivitas,
    staffAktif: daftarUser.filter(u => u.total > 0).length,
    staffTotal: semuaUserAktif.length,
    topPerformer: (daftarUser[0] && daftarUser[0].total > 0) ? daftarUser[0].nama : '-',
    daftarUser: daftarUser, // SEMUA user aktif, bukan dipotong — yang 0 aktivitas pun tetap tampil
  };
}

function inisialNama(nama) {
  return nama.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 3);
}

function buatGambarRingkasanKinerja(data, judulPeriode) {
  const settings = getSystemSettingsBackend().settings || {};
  const namaKantor = settings.namaKantor || 'Portal Konsultan Pajak';
  const NAVY = '#16233F', GOLD = '#B8862B', SLATE = '#2E7D8C', CARD = '#1D2C4D', LINE = '#2A3B5C', SOFT = '#9AA4BB';

  const presentation = SlidesApp.create('TempRingkasanKinerja_' + Date.now());
  const slide = presentation.getSlides()[0];
  slide.getShapes().forEach(sh => sh.remove()); // buang placeholder judul bawaan
  const pw = presentation.getPageWidth(), ph = presentation.getPageHeight();

  slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, pw, ph).getFill().setSolidFill(NAVY);

  // Header
  const logo = slide.insertShape(SlidesApp.ShapeType.ELLIPSE, 24, 20, 36, 36);
  logo.getFill().setSolidFill(GOLD); logo.getBorder().setTransparent();
  logo.getText().setText(namaKantor.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase());
  logo.getText().getTextStyle().setFontSize(13).setBold(true).setForegroundColor(NAVY);
  logo.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  const judul = slide.insertTextBox(namaKantor.toUpperCase(), 72, 18, pw-300, 22);
  judul.getText().getTextStyle().setFontSize(15).setBold(true).setForegroundColor('#FFFFFF');
  const sub = slide.insertTextBox('Ringkasan Kinerja \u2014 ' + judulPeriode, 72, 40, pw-300, 18);
  sub.getText().getTextStyle().setFontSize(10).setForegroundColor(SOFT);

  // Stat cards (3)
  const cardY = 68, cardH = 42, gap = 10, cardW = (pw - 48 - 2*gap) / 3;
  const stats = [
    ['Total Aktivitas', String(data.totalAktivitas), GOLD],
    ['Staff Aktif', data.staffAktif + '/' + data.staffTotal, '#2FA36B'],
    ['Top Performer', data.topPerformer, SLATE],
  ];
  stats.forEach((s, i) => {
    const x = 24 + i*(cardW+gap);
    const c = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, x, cardY, cardW, cardH);
    c.getFill().setSolidFill(CARD); c.getBorder().getLineFill().setSolidFill(LINE);
    const lbl = slide.insertTextBox(s[0], x+10, cardY+6, cardW-20, 14);
    lbl.getText().getTextStyle().setFontSize(8).setForegroundColor(SOFT);
    const val = slide.insertTextBox(s[1], x+10, cardY+20, cardW-20, 20);
    val.getText().getTextStyle().setFontSize(15).setBold(true).setForegroundColor(s[2]);
  });

  // ===== AREA 2 KOLOM =====
  // Kiri: chart batang HORIZONTAL, kecil, muat semua staff dalam kolom sempit.
  // Kanan: detail lengkap tiap staff (nama, login+durasi, rincian kerjaan) —
  // dengan chart dipindah ke kiri, kolom kanan dapat tinggi PENUH sampai ke
  // bawah, jadi lebih leluasa menampung SEMUA staff walau 0 aktivitas.
  const colY = cardY + cardH + 12;
  const colBottom = ph - 16;
  const colH = colBottom - colY;
  const leftW = (pw - 48 - 16) * 0.32;
  const rightX = 24 + leftW + 16;
  const rightW = pw - 48 - leftW - 16;

  // --- KOLOM KIRI: chart kecil ---
  const chartBox = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, 24, colY, leftW, colH);
  chartBox.getFill().setSolidFill('#FFFFFF'); chartBox.getBorder().setTransparent();
  const chartTitle = slide.insertTextBox('Aktivitas', 32, colY+6, leftW-16, 12);
  chartTitle.getText().getTextStyle().setFontSize(8.3).setBold(true).setForegroundColor(NAVY);

  const maxVal = Math.max(1, ...data.daftarUser.map(u=>u.total));
  const barRowH = Math.min(18, (colH-22) / (data.daftarUser.length || 1));
  const barMaxW = leftW - 78;
  let by = colY + 20;
  data.daftarUser.forEach((u, i) => {
    const bw = Math.max((u.total / maxVal) * barMaxW, 2); // minimal 2pt — Slides menolak lebar shape 0
    const lbl = slide.insertTextBox(inisialNama(u.nama), 30, by, 24, barRowH-1);
    lbl.getText().getTextStyle().setFontSize(6.6).setForegroundColor('#5B5E68');
    const bar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 56, by+2, bw, Math.max(barRowH-6, 2));
    bar.getFill().setSolidFill(u.total===0 ? '#E4E1D4' : (i<2?GOLD:SLATE)); bar.getBorder().setTransparent();
    const vt = slide.insertTextBox(String(u.total), 56+bw+3, by, 20, barRowH-1);
    vt.getText().getTextStyle().setFontSize(6.6).setBold(true).setForegroundColor(u.total===0?'#A8ABB5':NAVY);
    by += barRowH;
  });

  // --- KOLOM KANAN: detail per staff, SEMUA orang ---
  let ry = colY;
  const rincianTitle = slide.insertTextBox('Detail Tiap Staff', rightX, ry, rightW, 14);
  rincianTitle.getText().getTextStyle().setFontSize(10).setBold(true).setForegroundColor(GOLD);
  ry += 17;

  let jumlahTerlewat = 0;
  data.daftarUser.forEach(u => {
    const kosong = u.total === 0;
    const loginInfo = `${u.jumlahLogin}x Login (${formatDurasiSingkat(u.durasiLoginMenit)})`;
    const rowH = kosong ? 26 : (26 + u.kategori.length * 11 + 4);
    if (ry + rowH > colBottom) { jumlahTerlewat++; return; } // jaga-jaga jangan sampai keluar slide

    const box = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, rightX, ry, rightW, rowH);
    box.getFill().setSolidFill(kosong ? '#182645' : CARD); box.getBorder().getLineFill().setSolidFill(LINE);
    const nm = slide.insertTextBox(u.nama, rightX+10, ry+3, rightW-140, 12);
    nm.getText().getTextStyle().setFontSize(8.8).setBold(true).setForegroundColor(kosong ? '#7A87A8' : '#FFFFFF');
    const tt = slide.insertTextBox(kosong ? 'Belum ada aktivitas' : (u.total + ' aktivitas'), rightX+rightW-136, ry+3, 126, 12);
    tt.getText().getTextStyle().setFontSize(7.8).setBold(true).setForegroundColor(kosong ? '#5B6A8F' : GOLD);
    tt.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.END);
    const li = slide.insertTextBox(loginInfo, rightX+rightW-176, ry+14, 166, 11);
    li.getText().getTextStyle().setFontSize(6.8).setForegroundColor('#7A87A8');
    li.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.END);
    if (!kosong) {
      let iy = ry + 26;
      u.kategori.forEach(([label, val]) => {
        const it = slide.insertTextBox('\u2022 ' + label, rightX+18, iy, rightW-200, 10);
        it.getText().getTextStyle().setFontSize(7.3).setForegroundColor('#C9D0DE');
        const iv = slide.insertTextBox(String(val), rightX+rightW-116, iy, 106, 10);
        iv.getText().getTextStyle().setFontSize(7.3).setBold(true).setForegroundColor(SLATE);
        iv.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.END);
        iy += 11;
      });
    }
    ry += rowH + 2;
  });
  if (jumlahTerlewat > 0) {
    const note = slide.insertTextBox(`+ ${jumlahTerlewat} staff lainnya tidak muat di gambar ini`, rightX, ry, rightW, 14);
    note.getText().getTextStyle().setFontSize(8).setItalic(true).setForegroundColor('#6B7899');
  }

  const footnote = slide.insertTextBox(
    'Aktivitas dihitung dari: Pekerjaan, Klien, Reminder, Invoice, Dokumen, Notulensi. Login dihitung terpisah sebagai jam kehadiran.',
    24, ph-13, pw-48, 11);
  footnote.getText().getTextStyle().setFontSize(6.3).setItalic(true).setForegroundColor('#5B6A8F');

  presentation.saveAndClose();
  const presentationId = presentation.getId();
  const slideId = slide.getObjectId();
  const exportUrl = `https://docs.google.com/presentation/d/${presentationId}/export/png?pageid=${slideId}`;
  const resp = UrlFetchApp.fetch(exportUrl, {
    headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
  });
  const blob = resp.getBlob().setName('ringkasan-kinerja.png');
  DriveApp.getFileById(presentationId).setTrashed(true); // bersihkan file sementara
  return blob;
}

function kirimRingkasanKinerjaKeTelegramBackend(tglMulai, tglSelesai) {
  const settings = getSystemSettingsBackend().settings || {};
  if (!settings.telegramBotToken) return { success: false, message: 'Bot Token belum diisi di Konfigurasi Bot.' };
  if (!settings.telegramGrupChatId) return { success: false, message: 'ID Grup Telegram belum diisi di Konfigurasi Bot.' };

  const data = hitungRingkasanKinerja(tglMulai, tglSelesai);
  const judulPeriode = tglMulai === tglSelesai ? formatTanggalIndo(tglMulai) : formatTanggalIndo(tglMulai) + ' \u2013 ' + formatTanggalIndo(tglSelesai);

  let blob;
  try {
    blob = buatGambarRingkasanKinerja(data, judulPeriode);
  } catch (err) {
    return { success: false, message: 'Gagal membuat gambar: ' + err.message };
  }

  const caption = `\u{1F4CA} *Ringkasan Kinerja \u2014 ${judulPeriode}*\n\nTotal ${data.totalAktivitas} aktivitas dari ${data.staffAktif} staff.`;
  const chatIdBersih = String(settings.telegramGrupChatId).trim();
  try {
    const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendPhoto`, {
      method: 'post',
      payload: { chat_id: chatIdBersih, photo: blob, caption: caption, parse_mode: 'Markdown' },
      muteHttpExceptions: true,
    });
    const hasil = JSON.parse(resp.getContentText());
    if (!hasil.ok) return { success: false, message: `Telegram menolak (chat_id dikirim: "${chatIdBersih}"): ` + (hasil.description || 'tidak diketahui') };
  } catch (err) {
    return { success: false, message: 'Gagal mengirim: ' + err.message };
  }
  return { success: true, message: 'Ringkasan kinerja berhasil dikirim ke grup Telegram.' };
}

function formatTanggalIndo(iso) {
  const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const [y,m,d] = iso.split('-');
  return `${parseInt(d)} ${bulan[parseInt(m)-1]} ${y}`;
}

// --- Jadwal otomatis harian ---
const NAMA_TRIGGER_RINGKASAN_KINERJA = 'jalankanRingkasanKinerjaTerjadwal';

function aturJadwalRingkasanKinerjaBackend(jam) {
  jam = parseInt(jam, 10);
  if (isNaN(jam) || jam < 0 || jam > 23) return { success: false, message: 'Jam tidak valid (0-23).' };
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === NAMA_TRIGGER_RINGKASAN_KINERJA) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(NAMA_TRIGGER_RINGKASAN_KINERJA).timeBased().atHour(jam).everyDays(1).create();
  updateSystemSettingsBackend({ ringkasanKinerjaJam: String(jam) });
  return { success: true, message: `Ringkasan kinerja akan otomatis terkirim tiap hari jam ${jam}:00.` };
}

function nonaktifkanJadwalRingkasanKinerjaBackend() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === NAMA_TRIGGER_RINGKASAN_KINERJA) ScriptApp.deleteTrigger(t);
  });
  updateSystemSettingsBackend({ ringkasanKinerjaJam: '' });
  return { success: true, message: 'Jadwal otomatis dinonaktifkan.' };
}

// Dipanggil OTOMATIS oleh trigger terjadwal — bukan lewat doPost. Kirim
// ringkasan untuk HARI INI (00:00 s.d. sekarang berjalan).
function jalankanRingkasanKinerjaTerjadwal() {
  const hariIni = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  kirimRingkasanKinerjaKeTelegramBackend(hariIni, hariIni);
}

function updateTelegramNotifSettingBackend(aksiId, field, value) {
  if (!aksiId || !['aktif','kirimGrup','kirimPribadi'].includes(field)) return { success: false, message: 'Data tidak lengkap.' };
  const rows = getSheetAsObjects(TAB_TELEGRAM_NOTIF);
  const existing = rows.find(r => r.aksiId === aksiId);
  if (!existing) {
    appendRowFromObject(TAB_TELEGRAM_NOTIF, {
      aksiId: aksiId, aktif: field==='aktif' ? (value?'TRUE':'FALSE') : 'FALSE',
      kirimGrup: field==='kirimGrup' ? (value?'TRUE':'FALSE') : 'FALSE',
      kirimPribadi: field==='kirimPribadi' ? (value?'TRUE':'FALSE') : 'FALSE',
    });
    return { success: true };
  }
  const ok = updateRowByKey(TAB_TELEGRAM_NOTIF, 'aksiId', aksiId, { [field]: value ? 'TRUE' : 'FALSE' });
  if (!ok) return { success: false, message: 'Gagal menyimpan pengaturan.' };
  return { success: true };
}

function toggleSubModuleAccessBackend(subModuleId, role) {
  if (!subModuleId || !role) return { success: false, message: 'Data tidak lengkap.' };
  const rows = getSheetAsObjects(TAB_SUB_MODULE_ACCESS);
  const row = rows.find(r => r.subModuleId === subModuleId);
  if (!row) return { success: false, message: 'Sub-modul dengan ID itu tidak ditemukan di Sheet.' };

  const nilaiSekarang = (row[role] === true || row[role] === 'TRUE');
  const nilaiBaru = !nilaiSekarang;
  const ok = updateRowByKey(TAB_SUB_MODULE_ACCESS, 'subModuleId', subModuleId, { [role]: nilaiBaru ? 'TRUE' : 'FALSE' });
  if (!ok) return { success: false, message: 'Gagal memperbarui data di Sheet.' };
  return { success: true, newValue: nilaiBaru };
}

// ============================================================
// USER MODULE OVERRIDE — pengecualian akses PER INDIVIDU (di luar aturan
// default role-nya). Contoh: role Konsultan Pajak biasanya tidak lihat tab
// Invoice, tapi 1 orang konsultan tertentu perlu dikecualikan (diizinkan).
// Format Sheet: id, userEmail, subModuleId, allowed (TRUE/FALSE).
// Kalau tidak ada baris override untuk kombinasi user+subModule tertentu,
// berarti ikut aturan default role-nya (dari SubModuleAccess).
// ============================================================
function getUserOverridesBackend(email) {
  if (!email) return { success: false, message: 'Email wajib diisi.' };
  email = String(email).trim().toLowerCase();
  const rows = getSheetAsObjects(TAB_USER_MODULE_OVERRIDE);
  const milikUser = rows.filter(r => String(r.userEmail).trim().toLowerCase() === email);
  const overrides = milikUser.map(r => ({
    subModuleId: r.subModuleId,
    allowed: String(r.allowed).trim() === 'TRUE',
  }));
  return { success: true, overrides: overrides };
}

function setUserOverrideBackend(email, subModuleId, allowed) {
  if (!email || !subModuleId) return { success: false, message: 'Data tidak lengkap.' };
  email = String(email).trim().toLowerCase();
  const rows = getSheetAsObjects(TAB_USER_MODULE_OVERRIDE);
  const existing = rows.find(r => String(r.userEmail).trim().toLowerCase() === email && r.subModuleId === subModuleId);

  if (existing) {
    const ok = updateRowByKey(TAB_USER_MODULE_OVERRIDE, 'id', existing.id, { allowed: allowed ? 'TRUE' : 'FALSE' });
    if (!ok) return { success: false, message: 'Gagal memperbarui override.' };
    return { success: true, message: 'Override berhasil diperbarui.' };
  }
  const id = 'OVR-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_USER_MODULE_OVERRIDE, {
    id: id, userEmail: email, subModuleId: subModuleId, allowed: allowed ? 'TRUE' : 'FALSE',
  });
  return { success: true, message: 'Override berhasil ditambahkan.', id: id };
}

function removeUserOverrideBackend(email, subModuleId) {
  if (!email || !subModuleId) return { success: false, message: 'Data tidak lengkap.' };
  email = String(email).trim().toLowerCase();
  const rows = getSheetAsObjects(TAB_USER_MODULE_OVERRIDE);
  const existing = rows.find(r => String(r.userEmail).trim().toLowerCase() === email && r.subModuleId === subModuleId);
  if (!existing) return { success: true, message: 'Tidak ada override untuk dihapus (sudah ikut default role).' };
  const ok = deleteRowByKey(TAB_USER_MODULE_OVERRIDE, 'id', existing.id);
  if (!ok) return { success: false, message: 'Gagal menghapus override.' };
  return { success: true, message: 'Override berhasil dihapus, kembali ke aturan default role.' };
}

// ============================================================
// BIDANG USAHA — daftar pilihan yang bisa BERTAMBAH dari waktu ke waktu.
// Dulu field bebas ketik, sekarang jadi daftar pilihan supaya konsisten
// (menghindari "Perdagangan" vs "perdagangan" vs "Dagang" untuk hal yang sama).
// Format Sheet: kolom id, nama.
// ============================================================
function getBidangUsahaListBackend() {
  const rows = getSheetAsObjects(TAB_BIDANG_USAHA);
  const daftar = rows.map(r => r.nama).filter(Boolean);
  return { success: true, daftar: daftar };
}

function addBidangUsahaBackend(nama) {
  if (!nama || !String(nama).trim()) return { success: false, message: 'Nama bidang usaha wajib diisi.' };
  nama = String(nama).trim();
  const rows = getSheetAsObjects(TAB_BIDANG_USAHA);
  const sudahAda = rows.some(r => String(r.nama).trim().toLowerCase() === nama.toLowerCase());
  if (sudahAda) return { success: true, message: 'Sudah ada di daftar.', duplikat: true };
  const id = 'BU-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_BIDANG_USAHA, { id: id, nama: nama });
  return { success: true, message: 'Bidang usaha baru berhasil ditambahkan.', id: id };
}

// ============================================================
// BENTUK BADAN — sama seperti Bidang Usaha di atas: daftar yang bisa
// BERTAMBAH, bukan ketik bebas. Menggantikan pola lama "Lainnya" + kolom
// sebutkan — sekarang begitu ditambahkan, langsung jadi pilihan permanen
// untuk klien berikutnya juga.
// ============================================================
function getBentukBadanListBackend() {
  const rows = getSheetAsObjects(TAB_BENTUK_BADAN);
  const daftar = rows.map(r => r.nama).filter(Boolean);
  return { success: true, daftar: daftar };
}

function addBentukBadanBackend(nama) {
  if (!nama || !String(nama).trim()) return { success: false, message: 'Nama bentuk badan wajib diisi.' };
  nama = String(nama).trim();
  const rows = getSheetAsObjects(TAB_BENTUK_BADAN);
  const sudahAda = rows.some(r => String(r.nama).trim().toLowerCase() === nama.toLowerCase());
  if (sudahAda) return { success: true, message: 'Sudah ada di daftar.', duplikat: true };
  const id = 'BB-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_BENTUK_BADAN, { id: id, nama: nama });
  return { success: true, message: 'Bentuk badan baru berhasil ditambahkan.', id: id };
}

// ============================================================
// USERS — CRUD (dipakai modul Administrasi > User)
// ============================================================
function getAllUsers() {
  const users = getSheetAsObjects(TAB_USERS);
  // jangan pernah kirim kolom password ke aplikasi, walau sudah di-hash
  const aman = users.map(u => {
    const { password, ...sisanya } = u;
    return sisanya;
  });
  return { success: true, users: aman };
}

function addUser(u) {
  if (!u || !u.nama || !u.email || !u.password || !u.role) {
    return { success: false, message: 'Nama, email, password, dan role wajib diisi.' };
  }
  const existing = getSheetAsObjects(TAB_USERS).find(x => String(x.email).trim().toLowerCase() === String(u.email).trim().toLowerCase());
  if (existing) return { success: false, message: 'Email ini sudah terdaftar.' };

  const id = 'USR-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_USERS, {
    id: id,
    nama: u.nama,
    email: u.email,
    password: hashPassword(u.password),
    role: u.role,
    status: u.status || 'Aktif',
    fotoURL: u.fotoURL || '',
    whatsapp: u.whatsapp || '',
    terakhirAktif: '',
  });
  return { success: true, message: 'User berhasil ditambahkan.', id: id };
}

function updateUser(u) {
  if (!u || !u.email) return { success: false, message: 'Email user tidak ada.' };

  const updates = {
    nama: u.nama, role: u.role, status: u.status,
    fotoURL: u.fotoURL, whatsapp: u.whatsapp,
  };
  // password cuma ditimpa kalau memang diisi baru (biar tidak perlu isi ulang tiap update profil)
  if (u.password) {
    updates.password = hashPassword(u.password);
    updates.perluGantiPassword = 'FALSE'; // password sudah diganti -> hilangkan notif "wajib ganti password"
  }

  const ok = updateRowByKey(TAB_USERS, 'email', u.email, updates);
  if (!ok) return { success: false, message: 'User dengan email itu tidak ditemukan.' };
  return { success: true, message: 'User berhasil diperbarui.' };
}

function deleteUser(email) {
  if (!email) return { success: false, message: 'Email tidak ada.' };
  const ok = deleteRowByKey(TAB_USERS, 'email', email);
  if (!ok) return { success: false, message: 'User dengan email itu tidak ditemukan.' };
  return { success: true, message: 'User berhasil dihapus.' };
}

// ============================================================
// CLIENTS — CRUD (dipakai modul Klien Pajak)
// ============================================================
// Field-field ini disimpan di Sheet sebagai teks dipisah koma,
// tapi dipakai aplikasi sebagai array — dikonversi bolak-balik di sini.
const CLIENT_LIST_FIELDS = ['jenisLayanan', 'jenisPajak'];

function clientRowToObject(c){
  const hasil = { ...c };
  CLIENT_LIST_FIELDS.forEach(f => {
    hasil[f] = c[f] ? String(c[f]).split(',').map(s => s.trim()).filter(Boolean) : [];
  });
  return hasil;
}
function clientObjectToRow(c){
  const hasil = { ...c };
  CLIENT_LIST_FIELDS.forEach(f => {
    if (Array.isArray(c[f])) hasil[f] = c[f].join(',');
  });
  return hasil;
}

function getAllClients() {
  const clients = getSheetAsObjects(TAB_CLIENTS);
  return { success: true, clients: clients.map(clientRowToObject) };
}

function addClient(c) {
  if (!c || !c.nama || !c.jenisWP) {
    return { success: false, message: 'Nama dan Jenis Wajib Pajak wajib diisi.' };
  }
  const id = 'CLI-' + Date.now().toString().slice(-8);
  const row = clientObjectToRow({ ...c, id: id });
  appendRowFromObject(TAB_CLIENTS, row);
  return { success: true, message: 'Klien berhasil ditambahkan.', id: id };
}

function updateClient(c) {
  if (!c || !c.id) return { success: false, message: 'ID klien tidak ada.' };
  const row = clientObjectToRow(c);
  const { id, ...updates } = row; // id dipakai sebagai kunci pencarian, bukan ikut ditimpa
  const ok = updateRowByKey(TAB_CLIENTS, 'id', c.id, updates);
  if (!ok) return { success: false, message: 'Klien dengan ID itu tidak ditemukan.' };
  return { success: true, message: 'Klien berhasil diperbarui.' };
}

function deleteClient(id) {
  if (!id) return { success: false, message: 'ID klien tidak ada.' };
  const ok = deleteRowByKey(TAB_CLIENTS, 'id', id);
  if (!ok) return { success: false, message: 'Klien dengan ID itu tidak ditemukan.' };
  return { success: true, message: 'Klien berhasil dihapus.' };
}

// ============================================================
// JOBS — CRUD (dipakai modul Penugasan Pekerjaan & Daftar Pekerjaan)
// updateJob dibuat GENERIK — dipakai untuk form edit, mulai kerja,
// kirim persetujuan, setujui, maupun tolak (tinggal beda field yang dikirim).
// ============================================================
function getAllJobs() {
  return { success: true, jobs: getSheetAsObjects(TAB_JOBS) };
}
function addJob(j) {
  if (!j || !j.judul || !j.ditugaskanKe) {
    return { success: false, message: 'Judul pekerjaan dan penerima tugas wajib diisi.' };
  }
  const id = 'JOB-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_JOBS, { ...j, id: id });
  return { success: true, message: 'Pekerjaan berhasil ditambahkan.', id: id };
}
function updateJob(id, updates) {
  if (!id) return { success: false, message: 'ID pekerjaan tidak ada.' };
  const ok = updateRowByKey(TAB_JOBS, 'id', id, updates || {});
  if (!ok) return { success: false, message: 'Pekerjaan dengan ID itu tidak ditemukan.' };
  return { success: true, message: 'Pekerjaan berhasil diperbarui.' };
}
function deleteJob(id) {
  if (!id) return { success: false, message: 'ID pekerjaan tidak ada.' };
  const ok = deleteRowByKey(TAB_JOBS, 'id', id);
  if (!ok) return { success: false, message: 'Pekerjaan dengan ID itu tidak ditemukan.' };
  return { success: true, message: 'Pekerjaan berhasil dihapus.' };
}

// ============================================================
// REMINDERS — CRUD (dipakai modul Buat Reminder Pekerjaan)
// ============================================================
function reminderRowToObject(r){
  // Pemisah PIPA (|), bukan koma — karena Google Sheets suka salah mengira
  // angka dipisah koma (contoh: "7,8,9") sebagai pola tanggal dan mengubahnya diam-diam.
  // Tetap dukung data LAMA yang masih pakai koma (mundur-kompatibel).
  let arr = [];
  if (r.isiReminder){
    const teks = String(r.isiReminder);
    const pemisah = teks.includes('|') ? '|' : ',';
    arr = teks.split(pemisah).map(s=>Number(s.trim())).filter(n=>!isNaN(n));
  }
  return { ...r, isiReminder: arr };
}
function reminderObjectToRow(r){
  const hasil = { ...r };
  if (Array.isArray(r.isiReminder)) hasil.isiReminder = r.isiReminder.join('|');
  return hasil;
}
function getAllReminders() {
  const reminders = getSheetAsObjects(TAB_REMINDERS);
  return { success: true, reminders: reminders.map(reminderRowToObject) };
}
function addReminder(r) {
  if (!r || !r.clientId || !r.isiReminder || !r.isiReminder.length) {
    return { success: false, message: 'Klien dan isi reminder wajib diisi.' };
  }
  const id = 'REM-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_REMINDERS, reminderObjectToRow({ ...r, id: id }));
  return { success: true, message: 'Reminder berhasil ditambahkan.', id: id };
}
function updateReminder(id, updates) {
  if (!id) return { success: false, message: 'ID reminder tidak ada.' };
  const ok = updateRowByKey(TAB_REMINDERS, 'id', id, reminderObjectToRow(updates || {}));
  if (!ok) return { success: false, message: 'Reminder dengan ID itu tidak ditemukan.' };
  return { success: true, message: 'Reminder berhasil diperbarui.' };
}
function deleteReminder(id) {
  if (!id) return { success: false, message: 'ID reminder tidak ada.' };
  const ok = deleteRowByKey(TAB_REMINDERS, 'id', id);
  if (!ok) return { success: false, message: 'Reminder dengan ID itu tidak ditemukan.' };
  return { success: true, message: 'Reminder berhasil dihapus.' };
}

// ============================================================
// INVOICES + INVOICEITEMS — CRUD (1 invoice bisa punya banyak baris item)
// ============================================================
function getAllInvoices() {
  const invoices = getSheetAsObjects(TAB_INVOICES);
  const items = getSheetAsObjects(TAB_INVOICE_ITEMS);
  const hasil = invoices.map(inv => ({
    ...inv,
    items: items.filter(it => it.invoiceId === inv.id).map(it => ({ deskripsi: it.deskripsi, qty: Number(it.qty)||0, harga: Number(it.harga)||0 })),
  }));
  return { success: true, invoices: hasil };
}
function addInvoice(inv) {
  if (!inv || !inv.id || !inv.clientId || !inv.items || !inv.items.length) {
    return { success: false, message: 'Data invoice tidak lengkap (wajib ada id, klien, dan minimal 1 item).' };
  }
  appendRowFromObject(TAB_INVOICES, {
    id: inv.id, clientId: inv.clientId, tanggal: inv.tanggal,
    kenaPPh23: inv.kenaPPh23 ? 'TRUE' : 'FALSE',
    metodePembayaran: inv.metodePembayaran, status: inv.status || 'Belum Lunas',
    dibuatOleh: inv.dibuatOleh,
  });
  inv.items.forEach((it, idx) => {
    appendRowFromObject(TAB_INVOICE_ITEMS, {
      id: 'ITM-' + Date.now().toString().slice(-8) + '-' + idx,
      invoiceId: inv.id, deskripsi: it.deskripsi, qty: it.qty, harga: it.harga,
    });
  });
  return { success: true, message: 'Invoice berhasil dibuat.', id: inv.id };
}
function updateInvoiceStatus(id, status) {
  if (!id || !status) return { success: false, message: 'ID dan status wajib diisi.' };
  const ok = updateRowByKey(TAB_INVOICES, 'id', id, { status });
  if (!ok) return { success: false, message: 'Invoice dengan ID itu tidak ditemukan.' };
  return { success: true, message: 'Status invoice berhasil diperbarui.' };
}
function deleteInvoice(id) {
  if (!id) return { success: false, message: 'ID invoice tidak ada.' };
  const ok = deleteRowByKey(TAB_INVOICES, 'id', id);
  if (!ok) return { success: false, message: 'Invoice dengan ID itu tidak ditemukan.' };
  // hapus juga semua baris item terkait invoice ini
  const sheet = getSS().getSheetByName(TAB_INVOICE_ITEMS);
  const headerRow = findHeaderRow(sheet, FIRST_HEADER_CELL[TAB_INVOICE_ITEMS]);
  let terusHapus = true;
  while (terusHapus) {
    terusHapus = deleteRowByKey(TAB_INVOICE_ITEMS, 'invoiceId', id);
  }
  return { success: true, message: 'Invoice berhasil dihapus.' };
}

// ============================================================
// NOTULENSI RAPAT — 1 notulensi bisa melibatkan BANYAK klien (relasi
// banyak-ke-banyak lewat MeetingMinutesClients), dan punya banyak Tindak
// Lanjut (MeetingActionItems), mengikuti pola persis Invoice+InvoiceItems.
// Status "Direncanakan" vs "Terlaksana" DIHITUNG dari ada/tidaknya
// tanggalEksekusi — bukan kolom terpisah yang bisa nyimpang dari faktanya.
// ============================================================
function hitungStatusNotulensi(m) {
  return m.tanggalEksekusi ? 'Terlaksana' : 'Direncanakan';
}

function getAllMeetingMinutesBackend() {
  const meetings = getSheetAsObjects(TAB_MEETING_MINUTES);
  const links = getSheetAsObjects(TAB_MEETING_CLIENTS);
  const clients = getSheetAsObjects(TAB_CLIENTS);
  const items = getSheetAsObjects(TAB_MEETING_ACTION_ITEMS);

  const hasil = meetings.map(m => {
    const clientIds = links.filter(l => l.meetingId === m.id).map(l => l.clientId);
    const clientNames = clientIds.map(cid => {
      const c = clients.find(c => c.id === cid);
      return c ? c.nama : cid;
    });
    const actionItems = items.filter(it => it.meetingId === m.id).map(it => ({
      id: it.id, item: it.item, pic: it.pic, tenggat: it.tenggat,
      selesai: String(it.selesai).trim() === 'TRUE',
    }));
    return {
      ...m, clientIds: clientIds, clientNames: clientNames, actionItems: actionItems,
      status: hitungStatusNotulensi(m),
    };
  });
  return { success: true, meetings: hasil };
}

function getMeetingMinutesForClientBackend(clientId) {
  if (!clientId) return { success: false, message: 'Client ID wajib diisi.' };
  const semua = getAllMeetingMinutesBackend().meetings;
  const milikKlien = semua.filter(m => m.clientIds.includes(clientId));
  return { success: true, meetings: milikKlien };
}

function searchMeetingMinutesBackend(query, clientId) {
  let semua = getAllMeetingMinutesBackend().meetings;
  if (clientId) semua = semua.filter(m => m.clientIds.includes(clientId));
  if (query) {
    const q = String(query).trim().toLowerCase();
    semua = semua.filter(m => (m.id && m.id.toLowerCase().includes(q)) || (m.judul && m.judul.toLowerCase().includes(q)));
  }
  semua.sort((a, b) => (b.tanggalRencana || '').localeCompare(a.tanggalRencana || ''));
  return { success: true, meetings: semua.slice(0, 20) };
}

function addMeetingMinutesBackend(data) {
  if (!data || !data.judul || !data.clientIds || !data.clientIds.length) {
    return { success: false, message: 'Data tidak lengkap (wajib ada judul dan minimal 1 klien terkait).' };
  }
  const id = 'NTL-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_MEETING_MINUTES, {
    id: id, judul: data.judul, tanggalRencana: data.tanggalRencana || '', tanggalEksekusi: data.tanggalEksekusi || '',
    waktu: data.waktu || '', lokasi: data.lokasi || '',
    pesertaInternal: data.pesertaInternal || '', pesertaKlien: data.pesertaKlien || '',
    agenda: data.agenda || '', hasilPembahasan: data.hasilPembahasan || '', keputusan: data.keputusan || '',
    dibuatOleh: data.dibuatOleh || '', tanggalDibuat: new Date().toISOString(),
    diperbaruiOleh: data.dibuatOleh || '', tanggalDiperbarui: new Date().toISOString(),
  });
  data.clientIds.forEach(cid => {
    appendRowFromObject(TAB_MEETING_CLIENTS, { id: 'MC-' + Date.now().toString().slice(-8) + '-' + cid, meetingId: id, clientId: cid });
  });
  (data.actionItems || []).forEach((it, idx) => {
    appendRowFromObject(TAB_MEETING_ACTION_ITEMS, {
      id: 'AI-' + Date.now().toString().slice(-8) + '-' + idx, meetingId: id,
      item: it.item, pic: it.pic || '', tenggat: it.tenggat || '', selesai: it.selesai ? 'TRUE' : 'FALSE',
    });
  });
  return { success: true, message: 'Notulensi berhasil disimpan.', id: id };
}

// ============================================================
// NOTIFIKASI TELEGRAM — ceklist aktivitas mana saja yang dikirim, dan ke
// mana (Grup kantor dan/atau Pribadi user terkait). Sengaja TERPISAH dari
// mekanisme kirim-nya sendiri (itu baru aktif setelah Bot Token disiapkan)
// — bagian ini murni pengaturan, aman disiapkan lebih dulu.
// Format Sheet: activityKey, enabled, kirimGrup, kirimPribadi.
// ============================================================


function updateMeetingMinutesBackend(id, data) {
  if (!id || !data) return { success: false, message: 'Data tidak lengkap.' };
  const ok = updateRowByKey(TAB_MEETING_MINUTES, 'id', id, {
    judul: data.judul, tanggalRencana: data.tanggalRencana || '', tanggalEksekusi: data.tanggalEksekusi || '',
    waktu: data.waktu || '', lokasi: data.lokasi || '',
    pesertaInternal: data.pesertaInternal || '', pesertaKlien: data.pesertaKlien || '',
    agenda: data.agenda || '', hasilPembahasan: data.hasilPembahasan || '', keputusan: data.keputusan || '',
    diperbaruiOleh: data.diperbaruiOleh || '', tanggalDiperbarui: new Date().toISOString(),
  });
  if (!ok) return { success: false, message: 'Notulensi dengan ID itu tidak ditemukan.' };

  // Klien terkait & Tindak Lanjut ditimpa ulang seluruhnya — cara paling aman
  // supaya tidak perlu diff manual per baris (sama seperti pola Invoice/Items).
  if (data.clientIds) {
    let terusHapus = true;
    while (terusHapus) { terusHapus = deleteRowByKey(TAB_MEETING_CLIENTS, 'meetingId', id); }
    data.clientIds.forEach(cid => {
      appendRowFromObject(TAB_MEETING_CLIENTS, { id: 'MC-' + Date.now().toString().slice(-8) + '-' + cid, meetingId: id, clientId: cid });
    });
  }
  if (data.actionItems) {
    let terusHapus = true;
    while (terusHapus) { terusHapus = deleteRowByKey(TAB_MEETING_ACTION_ITEMS, 'meetingId', id); }
    data.actionItems.forEach((it, idx) => {
      appendRowFromObject(TAB_MEETING_ACTION_ITEMS, {
        id: 'AI-' + Date.now().toString().slice(-8) + '-' + idx, meetingId: id,
        item: it.item, pic: it.pic || '', tenggat: it.tenggat || '', selesai: it.selesai ? 'TRUE' : 'FALSE',
      });
    });
  }
  return { success: true, message: 'Notulensi berhasil diperbarui.' };
}

// ============================================================
// DOCUMENTS — CRUD + upload file sungguhan ke Google Drive
// ============================================================
function simpanFileDokumen(base64Data, namaFile, mime) {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_DOKUMEN);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_DOKUMEN);
  const bersih = base64Data.replace(/^data:[^;]+;base64,/, '');
  const blob = Utilities.newBlob(Utilities.base64Decode(bersih), mime, namaFile);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/file/d/' + file.getId() + '/view';
}
function hapusFileDokumenDariUrl(url) {
  try {
    const match = String(url).match(/\/file\/d\/([^/]+)/);
    if (match) DriveApp.getFileById(match[1]).setTrashed(true);
  } catch (err) { /* kalau gagal hapus file fisik, jangan sampai gagalkan penghapusan data */ }
}
function getAllDocuments() {
  return { success: true, documents: getSheetAsObjects(TAB_DOCUMENTS) };
}
function addDocument(d) {
  if (!d || !d.namaDokumen || !d.fileBase64) {
    return { success: false, message: 'Nama dokumen dan file wajib diisi.' };
  }
  const fileURL = simpanFileDokumen(d.fileBase64, d.namaFileAsli || d.namaDokumen, d.mimeType || 'application/octet-stream');
  const now = new Date();
  const id = 'DOC-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_DOCUMENTS, {
    id: id, namaDokumen: d.namaDokumen, namaFile: d.namaDokumen, milik: d.milik || 'Kantor',
    clientId: d.clientId || '', jenis: d.jenis || 'lainnya', ukuran: d.ukuran || '',
    fileURL: fileURL, diunggahOleh: d.diunggahOleh,
    tanggalUpload: Utilities.formatDate(now, 'GMT+7', 'yyyy-MM-dd'),
    waktuUpload: Utilities.formatDate(now, 'GMT+7', 'HH:mm'),
  });
  return { success: true, message: 'Dokumen berhasil diunggah.', id: id };
}
function updateDocument(d) {
  if (!d || !d.id) return { success: false, message: 'ID dokumen tidak ada.' };
  const updates = { namaDokumen: d.namaDokumen, namaFile: d.namaDokumen, milik: d.milik, clientId: d.clientId };
  if (d.fileBase64) {
    updates.fileURL = simpanFileDokumen(d.fileBase64, d.namaFileAsli || d.namaDokumen, d.mimeType || 'application/octet-stream');
    updates.jenis = d.jenis || 'lainnya';
    updates.ukuran = d.ukuran || '';
  }
  const ok = updateRowByKey(TAB_DOCUMENTS, 'id', d.id, updates);
  if (!ok) return { success: false, message: 'Dokumen dengan ID itu tidak ditemukan.' };
  return { success: true, message: 'Dokumen berhasil diperbarui.' };
}
function deleteDocument(id) {
  if (!id) return { success: false, message: 'ID dokumen tidak ada.' };
  const doc = getSheetAsObjects(TAB_DOCUMENTS).find(d => d.id === id);
  const ok = deleteRowByKey(TAB_DOCUMENTS, 'id', id);
  if (!ok) return { success: false, message: 'Dokumen dengan ID itu tidak ditemukan.' };
  if (doc && doc.fileURL) hapusFileDokumenDariUrl(doc.fileURL);
  return { success: true, message: 'Dokumen berhasil dihapus.' };
}

// ============================================================
// CALENDAR NOTES — catatan pribadi di modul Agenda & Kalender
// ============================================================
function getAllCalendarNotes() {
  const notes = getSheetAsObjects(TAB_CALENDAR_NOTES);
  return { success: true, notes: notes.map(n => ({ ...n, selesai: n.selesai === 'TRUE' || n.selesai === true })) };
}
function addCalendarNote(n) {
  if (!n || !n.tanggal || !n.judul) return { success: false, message: 'Tanggal dan judul wajib diisi.' };
  const id = 'CAL-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_CALENDAR_NOTES, { ...n, id: id, selesai: n.selesai ? 'TRUE' : 'FALSE' });
  return { success: true, message: 'Catatan berhasil ditambahkan.', id: id };
}
function updateCalendarNote(id, updates) {
  if (!id) return { success: false, message: 'ID catatan tidak ada.' };
  const u = { ...updates };
  if (u.selesai !== undefined) u.selesai = u.selesai ? 'TRUE' : 'FALSE';
  const ok = updateRowByKey(TAB_CALENDAR_NOTES, 'id', id, u);
  if (!ok) return { success: false, message: 'Catatan dengan ID itu tidak ditemukan.' };
  return { success: true, message: 'Catatan berhasil diperbarui.' };
}
function deleteCalendarNote(id) {
  if (!id) return { success: false, message: 'ID catatan tidak ada.' };
  const ok = deleteRowByKey(TAB_CALENDAR_NOTES, 'id', id);
  if (!ok) return { success: false, message: 'Catatan dengan ID itu tidak ditemukan.' };
  return { success: true, message: 'Catatan berhasil dihapus.' };
}

// ============================================================
// MESSAGES — riwayat chat sungguhan (bukan balasan simulasi)
// ============================================================
function getAllMessages() {
  const messages = getSheetAsObjects(TAB_MESSAGES);
  return { success: true, messages: messages.map(m => ({ ...m, read: m.read === 'TRUE' || m.read === true })) };
}
function sendMessage(m) {
  if (!m || !m.from || !m.to || !m.text) return { success: false, message: 'Data pesan tidak lengkap.' };
  const id = 'MSG-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_MESSAGES, {
    id: id, from: m.from, to: m.to, text: m.text,
    timestamp: m.timestamp || new Date().toISOString(),
    read: m.read ? 'TRUE' : 'FALSE',
  });
  return { success: true, message: 'Pesan terkirim.', id: id };
}
function markMessagesRead(fromEmail, toEmail) {
  if (!fromEmail || !toEmail) return { success: false, message: 'Email pengirim/penerima tidak ada.' };
  const sheet = getSS().getSheetByName(TAB_MESSAGES);
  const headerRow = findHeaderRow(sheet, FIRST_HEADER_CELL[TAB_MESSAGES]);
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colFrom = headers.indexOf('from'), colTo = headers.indexOf('to'), colRead = headers.indexOf('read');
  const dataRange = sheet.getRange(headerRow + 1, 1, Math.max(0, sheet.getLastRow() - headerRow), sheet.getLastColumn());
  const values = dataRange.getValues();
  values.forEach((row, i) => {
    if (row[colFrom] === fromEmail && row[colTo] === toEmail && row[colRead] !== 'TRUE') {
      sheet.getRange(headerRow + 1 + i, colRead + 1).setValue('TRUE');
    }
  });
  return { success: true, message: 'Pesan ditandai sudah dibaca.' };
}

// ============================================================
// ACTIVITY LOG — jejak audit permanen (dulu cuma di memori, sekarang tersimpan)
// ============================================================
function getActivityLog() {
  const logs = getSheetAsObjects(TAB_ACTIVITY_LOG);
  // Data LAMA (sebelum fix format Plain Text di atas) mungkin masih tersimpan
  // sebagai objek Date/Time yang berantakan — bersihkan dulu di sini supaya
  // data lama yang sudah kejadian pun ikut tampil rapi, bukan cuma data baru.
  logs.forEach(log => {
    if (Object.prototype.toString.call(log.tanggal) === '[object Date]') {
      log.tanggal = Utilities.formatDate(log.tanggal, 'GMT+7', 'yyyy-MM-dd');
    }
    if (Object.prototype.toString.call(log.waktu) === '[object Date]') {
      log.waktu = Utilities.formatDate(log.waktu, 'GMT+7', 'HH:mm:ss');
    }
  });
  logs.sort((a, b) => (String(b.tanggal)+String(b.waktu)).localeCompare(String(a.tanggal)+String(a.waktu)));
  return { success: true, logs: logs };
}
function addActivityLog(l) {
  if (!l || !l.aksi) return { success: false, message: 'Data log tidak lengkap.' };
  const id = 'LOG-' + Date.now().toString().slice(-8);
  appendRowFromObject(TAB_ACTIVITY_LOG, { id: id, user: l.user || 'Sistem', aksi: l.aksi, detail: l.detail || '', tanggal: l.tanggal, waktu: l.waktu });
  return { success: true, id: id };
}

// ============================================================
// HASH PASSWORD — supaya password TIDAK tersimpan polos di Sheet
// ============================================================
function hashPassword(plain) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(plain) + '|jundezain-salt');
  return bytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

// ============================================================
// HELPER — baca/tulis Sheet berbasis nama kolom (bukan indeks tetap),
// dan cari baris header otomatis. Pola sama seperti Penjaga Lisensi
// yang sudah terbukti jalan.
// ============================================================
function findHeaderRow(sheet, firstHeaderText) {
  const maxScan = Math.max(1, Math.min(15, sheet.getLastRow()));
  const colA = sheet.getRange(1, 1, maxScan, 1).getValues();
  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() === firstHeaderText) return i + 1;
  }
  return 1;
}

function getSheetAsObjects(tabName) {
  const sheet = getSS().getSheetByName(tabName);
  const headerRow = findHeaderRow(sheet, FIRST_HEADER_CELL[tabName]);
  const values = sheet.getDataRange().getValues();
  const headers = values[headerRow - 1];
  const rows = values.slice(headerRow);
  return rows
    .filter(r => r.some(cell => cell !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
}

function appendRowFromObject(tabName, obj) {
  const sheet = getSS().getSheetByName(tabName);
  const headerRow = findHeaderRow(sheet, FIRST_HEADER_CELL[tabName]);
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
  const targetRow = sheet.getLastRow() + 1;
  const range = sheet.getRange(targetRow, 1, 1, row.length);
  // PENTING: paksa format PLAIN TEXT dulu SEBELUM nilai ditulis — supaya Google
  // Sheets tidak diam-diam mengubah string tanggal/jam ("2026-07-25", "06:18:55")
  // jadi tipe Date/Time internal. Kalau sudah kejadian, saat dibaca lagi lewat
  // getSheetAsObjects() nilainya jadi objek Date yang berantakan saat digabung
  // jadi teks (misal muncul "1899-12-31T..." untuk kolom jam-saja).
  range.setNumberFormat('@');
  range.setValues([row]);
}

function updateRowByKey(tabName, keyColumn, keyValue, updates) {
  const sheet = getSS().getSheetByName(tabName);
  const headerRow = findHeaderRow(sheet, FIRST_HEADER_CELL[tabName]);
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const keyColIdx = headers.indexOf(keyColumn);
  if (keyColIdx === -1) return false;
  if (sheet.getLastRow() <= headerRow) return false; // tabel kosong total, tidak ada baris data sama sekali

  const dataRange = sheet.getRange(headerRow + 1, 1, sheet.getLastRow() - headerRow, sheet.getLastColumn());
  const values = dataRange.getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][keyColIdx]).toLowerCase() === String(keyValue).toLowerCase()) {
      const targetRow = headerRow + 1 + i;
      headers.forEach((h, colIdx) => {
        if (updates[h] !== undefined) {
          const cell = sheet.getRange(targetRow, colIdx + 1);
          cell.setNumberFormat('@'); // sama seperti appendRowFromObject — cegah auto-convert jadi Date/Time
          cell.setValue(updates[h]);
        }
      });
      return true;
    }
  }
  return false;
}

function deleteRowByKey(tabName, keyColumn, keyValue) {
  const sheet = getSS().getSheetByName(tabName);
  const headerRow = findHeaderRow(sheet, FIRST_HEADER_CELL[tabName]);
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const keyColIdx = headers.indexOf(keyColumn);
  if (keyColIdx === -1) return false;
  if (sheet.getLastRow() <= headerRow) return false; // tabel kosong total, tidak ada baris data sama sekali

  const dataRange = sheet.getRange(headerRow + 1, 1, sheet.getLastRow() - headerRow, sheet.getLastColumn());
  const values = dataRange.getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][keyColIdx]).toLowerCase() === String(keyValue).toLowerCase()) {
      sheet.deleteRow(headerRow + 1 + i);
      return true;
    }
  }
  return false;
}

// ============================================================
// SETUP AWAL — jalankan SEKALI dari editor untuk isi 1 akun superadmin
// pertama (supaya ada yang bisa dipakai login pertama kali).
// Cara pakai: pilih fungsi "setupAkunSuperadminPertama" di dropdown atas
// editor, klik Run. Ganti dulu email/password di bawah sesuai keinginan.
//
// CATATAN: sekarang jalur RESMI untuk buat admin pertama adalah lewat
// Wizard "Setup Awal Kantor" di aplikasi (aksi buatSuperadminPertama),
// BUKAN fungsi ini. Fungsi ini disisakan hanya untuk keadaan darurat
// (misal wizard tidak bisa diakses) — kalau dipakai, tab Users jadi
// terisi dan wizard TIDAK BISA lagi membuat admin pertama lewat form
// (safety check di buatSuperadminPertama akan menolak).
// ============================================================
// ============================================================
// OTORISASI GMAIL — jalankan SEKALI dari editor (pilih fungsi ini di dropdown
// atas, klik Run) supaya muncul layar "Authorization required" untuk izin
// GmailApp. Tanpa ini, fitur "Lupa Password" gagal kirim email dengan pesan
// "does not have permission" walau kode-nya sendiri sudah benar.
// ============================================================
function otorisasiGmailSekaliJalan() {
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), 'Tes Otorisasi Gmail Berhasil',
    'Kalau Anda menerima email ini, izin GmailApp untuk aplikasi sudah aktif. Fitur Lupa Password sekarang bisa mengirim email sungguhan.');
  Logger.log('Email tes terkirim ke ' + Session.getActiveUser().getEmail());
}

// ============================================================
// OTORISASI URLFETCH — jalankan SEKALI dari editor (pilih fungsi ini di
// dropdown atas, klik Run) supaya muncul layar "Authorization required"
// untuk izin UrlFetchApp (script.external_request). Tanpa ini, fitur
// "Notifikasi Telegram" gagal kirim dengan pesan "tidak memiliki izin
// untuk memanggil UrlFetchApp.fetch" walau kode-nya sendiri sudah benar.
// ============================================================
function otorisasiUrlFetchSekaliJalan() {
  const resp = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('Berhasil, status: ' + resp.getResponseCode() + '. Izin UrlFetchApp untuk aplikasi sudah aktif.');
}

// ============================================================
// OTORISASI SLIDES & DRIVE — jalankan SEKALI dari editor, sama seperti 2
// fungsi otorisasi di atas. Dipakai oleh fitur "Ringkasan Kinerja" untuk
// bikin infografis (Slides) lalu membersihkan file sementaranya (Drive).
// ============================================================
function otorisasiSlidesSekaliJalan() {
  const p = SlidesApp.create('TesOtorisasiSlides_' + Date.now());
  const id = p.getId();
  p.saveAndClose();
  DriveApp.getFileById(id).setTrashed(true);
  Logger.log('Berhasil. Izin Slides & Drive untuk aplikasi sudah aktif.');
}

function setupAkunSuperadminPertama() {
  const email = 'superadmin@kantorpajak.id';
  const password = 'admin123'; // GANTI setelah login pertama kali!

  const existing = getSheetAsObjects(TAB_USERS).find(u => u.email === email);
  if (existing) {
    Logger.log('Akun ' + email + ' sudah ada, tidak dibuat ulang.');
    return;
  }
  appendRowFromObject(TAB_USERS, {
    id: 'USR-00000001',
    nama: 'Super Admin',
    email: email,
    password: hashPassword(password),
    role: 'superadmin',
    status: 'Aktif',
    fotoURL: '',
    whatsapp: '',
    terakhirAktif: '',
  });
  Logger.log('Akun superadmin pertama berhasil dibuat: ' + email + ' / ' + password);
}
