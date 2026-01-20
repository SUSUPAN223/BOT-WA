// === TAHAP 1: MEMANGGIL SEMUA ALAT BANTU ===
console.log('Memulai bot...');

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const mysql = require('mysql2/promise');
const qrcode = require('qrcode-terminal');
const fs = require('fs'); 
const path = require('path');
const axios = require('axios');
const { handleTabunganCommand } = require('./tabungan.js');
const { handleAutoReplyCommand, findAutoReply } = require('./autoreply_contains.js');
const { handleHideTagCommand } = require('./fungsi.js');

let botId, botNumber; 

// === TAHAP 2: KONFIGURASI KONEKSI DATABASE (MYSQL) ===
// === TAHAP 2: KONEKSI KE TIDB CLOUD (SESUAI GAMBAR ANDA) ===
const db = mysql.createPool({
    host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com', 
    port: 4000,                                           
    user: 'ErS11EtXHVAS3D1.root',                         
    password: '1guU9hfaX1EXQKtU',         
    database: 'test',                                      
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection()
    .then(connection => {
        console.log('✅ Koneksi DB berhasil!');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Gagal terhubung ke database:', err.message);
    });

// === TAHAP 3: PERSIAPAN FILE ===
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log('Folder "uploads" berhasil dibuat.');
}

// === TAHAP 4: KONFIGURASI KONEKSI WHATSAPP ===
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('Scan QR Code ini dengan HP Anda:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('===============================');
    console.log('✅ Bot siap!');
    
    botId = client.info.wid._serialized;
    botNumber = client.info.wid.user;
    
    console.log(`Bot ID (Lengkap): ${botId}`);
    console.log(`Bot ID (Angka): ${botNumber}`);
    console.log('===============================');
});


// === TAHAP 5: FUNGSI BANTU (TIDAK BERUBAH) ===
// (Fungsi getAndSendReply dan handleAdminCommand sama persis seperti sebelumnya)

async function getAndSendReply(chat, keyword) { // 'keyword' di sini adalah pesan user
    try {
        let responseData = null; // Variabel untuk menyimpan balasan

        // --- PRIORITAS 1: EXACT MATCH (Tabel auto_reply) ---
        const [exactRows] = await db.query("SELECT response_text, response_caption FROM auto_reply WHERE LOWER(keyword) = LOWER(?)", [keyword]);

        if (exactRows.length > 0) {
            console.log("[DEBUG] Match: Ditemukan EXACT reply.");
            responseData = exactRows[0];
        } else {
            // --- PRIORITAS 2: CONTAINS MATCH (Tabel auto_reply_contains) ---
            console.log("[DEBUG] Match: Tidak ditemukan exact. Mencari CONTAINS reply...");
            responseData = await findAutoReply(db, keyword); // Memanggil fungsi dari file baru kita
            if (responseData) {
                console.log("[DEBUG] Match: Ditemukan CONTAINS reply.");
            }
        }

        // --- LOGIKA BALASAN (Jika salah satu ditemukan) ---
        if (responseData) {
            const response = responseData.response_text;
            const caption = responseData.response_caption; 

            // Cek apakah ini path gambar (dari tabel 'auto_reply' lama)
            if (response.startsWith(uploadsDir)) {
                if (fs.existsSync(response)) {
                    const media = MessageMedia.fromFilePath(response);
                    await chat.sendMessage(media, { caption: caption });
                } else {
                    await chat.sendMessage("Maaf, file balasan tidak ditemukan.");
                }
            } else {
                // Jika bukan gambar, kirim sebagai teks (dari tabel lama ATAU baru)
                await chat.sendMessage(response);
            }
        }
        // Jika responseData tetap null, bot akan diam (sesuai keinginan Anda)

    } catch (err) {
        console.error("Error di getAndSendReply (gabungan):", err);
    }
}


async function handleAdminCommand(msg, command, args) {
    // --- ADMIN: ADDLIST (Teks) ---
    if (command === 'addlist' || command === 'updatelist') {
        // --- KODE BARU (DIPERBAIKI) ---
    const delimiterPos = args.indexOf('|');
        if (delimiterPos === -1) { // Cek jika | tidak ada
            msg.reply("Format salah. Gunakan tanda '|' untuk memisahkan.\n" + command + " [keyword] | [teks balasan]");
            return true; // Perintah ditangani (meskipun error)
        }
        // Ambil teks SEBELUM | pertama sebagai keyword
        const rawKeyword = args.substring(0, delimiterPos).trim();
        // Ambil SEMUA teks SESUDAH | pertama sebagai balasan
        const response = args.substring(delimiterPos + 1).trim();

        if (!rawKeyword || !response) {
            msg.reply("Format salah. Keyword dan balasan tidak boleh kosong.");
            return true;
        }
        const keyword = rawKeyword.toLowerCase();
        const sql = command === 'addlist' 
            ? "INSERT INTO auto_reply (keyword, response_text, response_caption) VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE response_text = ?, response_caption = NULL"
            : "UPDATE auto_reply SET response_text = ?, response_caption = NULL WHERE LOWER(keyword) = LOWER(?)";
        const params = command === 'addlist' ? [keyword, response, response] : [response, keyword];
        try {
            const [result] = await db.query(sql, params);
            if (command === 'addlist') msg.reply(`✅ Berhasil! Keyword \`${keyword}\` telah ditambahkan/diperbarui.`);
            else if (result.affectedRows > 0) msg.reply(`✅ Berhasil! Keyword \`${keyword}\` telah diperbarui.`);
            else msg.reply(`ℹ️ Info: Keyword \`${keyword}\` tidak ditemukan.`);
        } catch (err) {
             msg.reply("❌ Gagal menyimpan ke database.");
        }
        return true;
    }

    // --- ADMIN: ADDLIST-GAMBAR (Gambar + Caption) ---
    if (command === 'addlist-gambar') {
        if (!msg.hasMedia || msg.type !== 'image') {
            msg.reply('Format salah. Kirim gambar dengan caption:\naddlist-gambar [keyword] | [teks caption]');
            return true;
        }
        const [rawKeyword, caption] = args.split('|').map(s => s.trim());
        const keyword = rawKeyword.toLowerCase();
        if (!keyword) {
            msg.reply('Format salah. Keyword tidak boleh kosong.\nContoh: addlist-gambar payment | Teks caption');
            return true;
        }
        const media = await msg.downloadMedia();
        const fileExt = media.mimetype.split('/')[1] || 'jpeg';
        const fileName = `${keyword.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.${fileExt}`;
        const filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, media.data, { encoding: 'base64' });
        try {
            const sql = "INSERT INTO auto_reply (keyword, response_text, response_caption) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE response_text = ?, response_caption = ?";
            await db.query(sql, [keyword, filePath, caption, filePath, caption]);
            msg.reply(`✅ Gambar berhasil! Keyword \`${keyword}\` telah disimpan/diperbarui.`);
        } catch (err) {
            msg.reply("❌ Gagal menyimpan path ke database.");
        }
        return true;
    }

    // --- ADMIN: DELLIST ---
    if (command === 'dellist') {
        const rawKeyword = args;
        if (!rawKeyword) {
            msg.reply("Format salah. Gunakan:\ndellist [keyword]");
            return true;
        }
        const keyword = rawKeyword.toLowerCase();
        const [rows] = await db.query("SELECT response_text FROM auto_reply WHERE LOWER(keyword) = LOWER(?)", [keyword]);
        const [result] = await db.query("DELETE FROM auto_reply WHERE LOWER(keyword) = LOWER(?)", [keyword]);
        if (result.affectedRows > 0) {
            if (rows.length > 0 && rows[0].response_text.startsWith('uploads' + path.sep)) {
                const filePath = rows[0].response_text;
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath); 
                }
            }
            msg.reply(`✅ Berhasil! Keyword \`${keyword}\` telah dihapus.`);
        } else {
            msg.reply(`ℹ️ Info: Keyword \`${keyword}\` tidak ditemukan.`);
        }
        return true;
    }

    // -----------------------------------------------------------------
    // --- (TAMBAHAN BARU) ADMIN: LISTKEYWORD ---
    // -----------------------------------------------------------------
    if (command === '!listkeyword') {
        try {
            // 1. Ambil semua keyword dari DB, diurutkan A-Z
            const [rows] = await db.query("SELECT keyword FROM auto_reply ORDER BY keyword ASC");

            if (rows.length === 0) {
                msg.reply("ℹ️ Database keyword Anda masih kosong.");
                return true;
            }

            // 2. Format balasan
            let replyText = `*-- DAFTAR KEYWORD TERSIMPAN --*\nTotal: ${rows.length} keyword\n\n`;
            
            // Ambil nama keyword-nya saja
            const keywordList = rows.map(row => `- ${row.keyword}`);
            
            replyText += keywordList.join('\n'); // Gabungkan dengan baris baru

            // 3. Kirim balasan
            msg.reply(replyText);

        } catch (err) {
            console.error("Error saat mengambil list keyword:", err);
            msg.reply("❌ Gagal mengambil daftar keyword dari database.");
        }
        
        return true; // Perintah sudah ditangani
    }

    // -----------------------------------------------------------------
    // --- (TAMBAHAN BARU) ADMIN: PROSES ---
    // -----------------------------------------------------------------
    if (command === '!proses') {
        const now = new Date(); // Ambil waktu saat ini
        // Opsi untuk format Indonesia (WIB)
        const optionsDate = { dateStyle: 'long', timeZone: 'Asia/Jakarta' };
        const optionsTime = { timeStyle: 'short', timeZone: 'Asia/Jakarta' };

        const tanggalSaatIni = now.toLocaleDateString('id-ID', optionsDate);
        const jamSaatIni = now.toLocaleTimeString('id-ID', optionsTime);

        // Buat template balasan
        const replyText = `~bot Reply \n⏳ *PESANAN DIPROSES* ⏳\n\nPesanan Anda telah kami terima dan akan segera diproses.\n\n🗓️ Tanggal: ${tanggalSaatIni}\n⏰ Waktu: ${jamSaatIni} WIB\n\nMohon ditunggu ya, Kak! 🙏 \n \n *Note* : \n- Jika admin terlalu lama, silahkan ketik -> !bantuan <-`;
        
        msg.reply(replyText); // Kirim balasan
        return true; // Perintah sudah ditangani
    }

// (LOGIKA BARU) Perintah !done (HANYA Google Sheets)
    if (command === '!done') {
        
        // Skenario 1: Ini adalah PERINTAH UTAMA (karena Anda me-reply)
        // -> Kirim template ke customer + Simpan data (silent)
        if (msg.hasQuotedMsg) {
            
            // 1. Ambil data pelanggan dari pesan yang di-reply
            const quotedMsg = await msg.getQuotedMessage();
            const no_pelanggan_id = quotedMsg.from; // Ini nomor @c.us pelanggan

            // 2. Pisahkan {barang} dan {durasi}
            const delimiterPos = args.indexOf('|');
            if (delimiterPos === -1) {
                // Beri tahu admin jika formatnya salah
                msg.reply("Format salah. Balas pesan customer dengan format:\n!done [Nama Barang] | [Durasi]");
                return true;
            }
            const barang = args.substring(0, delimiterPos).trim();
            const durasi = args.substring(delimiterPos + 1).trim();
            
            if (!barang || !durasi) {
                msg.reply("Format salah. Barang dan Durasi tidak boleh kosong.");
                return true;
            }

            // 3. Ambil tanggal saat ini
            const tanggal_pemesanan = new Date();

            // 4. (MODE SILENT) Simpan HANYA ke Google Sheets
            try {
                // --- KIRIM KE GOOGLE SHEETS (Via Zapier) ---
                await axios.post(ZAPIER_WEBHOOK_URL, {
                    tanggal: tanggal_pemesanan.toISOString(),
                    no_pelanggan: no_pelanggan_id.split('@')[0],
                    barang: barang,
                    durasi: durasi
                });
                
                // --- 5. (AKSI UTAMA) KIRIM TEMPLATE SELESAI KE CUSTOMER ---
                const optionsDate = { dateStyle: 'long', timeZone: 'Asia/Jakarta' };
                const optionsTime = { timeStyle: 'short', timeZone: 'Asia/Jakarta' };
                const tanggalSaatIni = tanggal_pemesanan.toLocaleDateString('id-ID', optionsDate);
                const jamSaatIni = tanggal_pemesanan.toLocaleTimeString('id-ID', optionsTime);

                const replyText = `✅ *PESANAN SELESAI* ✅\n\nPesanan Anda telah berhasil diselesaikan.\n\n🗓️ Tanggal: ${tanggalSaatIni}\n⏰ Waktu: ${jamSaatIni} WIB\n\nTerima kasih telah berbelanja di store kami!\nDitunggu orderan selanjutnya, Kak. 😊`;
                
                // Kirim ke CUSTOMER (menggunakan ID pelanggan, bukan 'chat')
                await client.sendMessage(no_pelanggan_id, replyText);
                
                // TIDAK ADA BALASAN KE ADMIN (sesuai permintaan "mode silent")

            } catch (err) {
                console.error("Gagal kirim ke Zapier:", err);
                // Jika error, BARU beri tahu admin
                msg.reply("❌ Gagal. Data tidak terkirim ke Google Sheets. Cek log.");
            }
            return true; // Perintah selesai
        } 
        
        // Skenario 2: Ini adalah PERINTAH TEMPLATE (jika dikirim BUKAN sebagai reply)
        else {
            const now = new Date();
            const optionsDate = { dateStyle: 'long', timeZone: 'Asia/Jakarta' };
            const optionsTime = { timeStyle: 'short', timeZone: 'Asia/Jakarta' };
            const tanggalSaatIni = now.toLocaleDateString('id-ID', optionsDate);
            const jamSaatIni = now.toLocaleTimeString('id-ID', optionsTime);
            
            const replyText = `✅ *PESANAN SELESAI* ✅\n\nPesanan Anda telah berhasil diselesaikan.\n\n🗓️ Tanggal: ${tanggalSaatIni}\n⏰ Waktu: ${jamSaatIni} WIB\n\nTerima kasih telah berbelanja di store kami!\nDitunggu orderan selanjutnya, Kak. 😊`;
            
            // Balas ke chat admin saat ini
            msg.reply(replyText);
            return true;
        }
    }

    // --- (BARU) PERINTAH UNTUK TES ZAPIER ---
    if (command === '!testsheet') {
        try {
        // Kirim data palsu ke URL Zapier
            await axios.post(ZAPIER_WEBHOOK_URL, {
                tanggal: new Date().toISOString(), // Kirim tanggal
                no_pelanggan: '628123456789@c.us', // Data palsu
                barang: 'Barang Tes', // Data palsu
                durasi: '1 Bulan' // Data palsu
            });
            msg.reply('✅ Data tes terkirim ke Zapier!');
        } catch (err) {
            msg.reply('❌ Gagal kirim data tes.');
        }
    return true;
}

// -----------------------------------------------------------------
// --- (BARU) MEMANGGIL MODUL TABUNGAN ---
// -----------------------------------------------------------------
// Coba teruskan perintah ke file tabungan.js
// 'db' adalah variabel koneksi database kita dari atas
const tabunganHandled = await handleTabunganCommand(db, msg, command, args);
if (tabunganHandled) {
    return true; // Jika tabungan.js menangani, selesai.
}
const autoReplyHandled = await handleAutoReplyCommand(db, msg, command, args);
if (autoReplyHandled) {
    return true;
}
    
    return false; // BUKAN perintah admin
}

// === TAHAP 6: OTAK UTAMA BOT (LOGIKA BARU DENGAN PRIORITAS) ===

// Daftar Grup yang boleh menjalankan perintah admin (jika di-tag)
const ADMIN_GROUP_IDS = [
    '120363417875831035@g.us',
    '120363421674922742@g.us',
    '120363403014851195@g.us',
    '120363406543026768@g.us'// Ganti/tambah dengan ID grup admin 2, dst.
]; 

const ZAPIER_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/25614743/uf2ajbq/'; // <-- GANTI INI

// --- (TAMBAHAN BARU) KONFIGURASI TOMBOL PANIK ---
const PANIC_KEYWORD = '!bantuan'; // Keyword yang akan diketik customer
const PANIC_GROUP_ID = '120363417875831035@g.us'; // GANTI INI dengan ID Grup Admin Anda
const OWNER_CONTACT_ID = '6282143738267@c.us'; // GANTI INI dengan ID Admin/Owner yang akan di-tag
// --- AKHIR TAMBAHAN BARU ---

client.on('message_create', async (msg) => {

    try {
        const chat = await msg.getChat();
        const message = msg.body.trim();
        
        // =======================================================
        // (PERUBAHAN 1) LOGIKA PRIORITAS: SUPER ADMIN (SAYA/BOT)
        // =======================================================
        // Cek apakah pesan ini dari SAYA (akun bot)
        if (msg.fromMe) {
            const parts = message.split(' ');
            const command = parts[0].toLowerCase();
            const args = parts.slice(1).join(' ');

	    if (command === '.h') {
                const handled = await handleHideTagCommand(client, msg, args); // Hapus botId jika tidak diperlukan
                if (handled) return; 
            }

            // Coba jalankan sebagai perintah admin
            const commandHandled = await handleAdminCommand(msg, command, args);

            // Jika BUKAN perintah admin, jalankan 'self-reply'
            if (!commandHandled) {
                await getAndSendReply(chat, message);
            }
            return; // Selesai. Jangan proses logika di bawah.
        }

        if (message.toLowerCase() === PANIC_KEYWORD) {
            
            // --- [REVISI FINAL: BYPASS MENTION ERROR] ---
            
            // 1. Ambil data pelanggan (Bypass getContact)
            const customerId = msg.from; 
            const customerName = msg._data.notifyName || msg.pushname || customerId.split('@')[0];
            
            // 2. Tentukan ID Owner (String Murni)
            // Pastikan formatnya benar: 'NOMOR@c.us'
            const adminId = OWNER_CONTACT_ID; 

            // 3. Siapkan pesan alert
            const alertMessage = `🚨 BANTUAN DIPERLUKAN! 🚨\n\nPelanggan:\n*${customerName}*\n(${customerId})\n\nSedang menunggu balasan Anda @${adminId.split('@')[0]}. Mohon segera hubungi chat pribadi mereka!`;
            
            try {
                // 4. COBA KIRIM DENGAN MENTION (Pakai String Array)
                // Kita masukkan ID string langsung ke array. Library WA Web biasanya otomatis memproses ini.
                await client.sendMessage(PANIC_GROUP_ID, alertMessage, {
                    mentions: [adminId] 
                });
                console.log(`[SUKSES] Alert bantuan terkirim dengan mention.`);

            } catch (err) {
                console.error("[ERROR MENTION] Gagal mention, mencoba kirim pesan biasa...", err.message);
                
                // 5. FALLBACK (CADANGAN): KIRIM TANPA MENTION
                // Jika mention error (t.match...), kode ini akan jalan.
                // Pesan tetap masuk ke grup admin, tapi tidak berwarna biru (tidak nge-tag).
                try {
                     await client.sendMessage(PANIC_GROUP_ID, alertMessage);
                     console.log(`[SUKSES] Alert bantuan terkirim (Tanpa Mention).`);
                } catch (fallbackErr) {
                     console.error("[FATAL] Gagal mengirim alert ke grup admin:", fallbackErr);
                }
            }

            // 6. Konfirmasi ke Customer
            // Kirim balasan ke customer bahwa pesan sudah diteruskan
            msg.reply('✅ Pesan Anda telah diteruskan ke Owner.\nMohon tunggu, Admin kami akan segera menghubungi Anda. 🙏 \n \n Jangan Menyepam pesan, tunggu beberapa menit jika pesan tetap tidak terhandle.');
            
            return; // Selesai
        }

        // =======================================================
        // (PERUBAHAN 2) LOGIKA PESAN MASUK (GRUP / DM)
        // =======================================================

        // --- LOGIKA GRUP (UNTUK ORANG LAIN) ---
        // --- MODE DEBUG / INSPEKSI (UNTUK MENCARI PERBEDAAN HP VS LAPTOP) ---
        // --- LOGIKA GRUP (FINAL FIX: LID SUPPORT) ---
        if (chat.isGroup) {
            
            // 1. Definisikan ID Tambahan (LID) dari Log Debug Anda
            // Ini ID khusus Android yang menyebabkan bot diam sebelumnya
            const botLid = '17683017953294@lid'; 
            
            let botWasMentioned = false;
            
            // CARA 1: Cek Data Internal (Support HP & Laptop)
            // Kita cek apakah ID yang di-tag cocok dengan ID Bot (Phone) ATAU ID Bot (LID)
            if (msg._data && msg._data.mentionedJidList && msg._data.mentionedJidList.length > 0) {
                if (msg._data.mentionedJidList.includes(botId) || msg._data.mentionedJidList.includes(botLid)) {
                    botWasMentioned = true;
                    console.log(`[GROUP] Bot di-tag (Match via Internal ID/LID).`);
                }
            }

            // CARA 2: Cek Regex Teks (Fallback)
            if (!botWasMentioned) {
                // Kita regex angka apa saja setelah @, karena HP mengirim @1768... sedangkan Laptop @628...
                // Ini menangkap keduanya.
                const generalTagRegex = /@\d+/g;
                if (message.match(generalTagRegex)) {
                    // Cek manual apakah nomor di teks cocok dengan salah satu ID bot
                    const matchedString = message.match(generalTagRegex)[0].replace('@', '');
                    if (botId.includes(matchedString) || botLid.includes(matchedString)) {
                         botWasMentioned = true;
                         console.log(`[GROUP] Bot di-tag (Match via Regex Teks).`);
                    }
                }
            }

            // --- EKSEKUSI ---
            if (botWasMentioned) {
                // 1. Bersihkan pesan dari tag (Apapun format angkanya: @628.. atau @176..)
                const cleanMessage = message.replace(/@\d+/g, '').trim();
                
                // 2. Jika user cuma ngetag doang tanpa pesan
                if (cleanMessage.length === 0) {
                    msg.reply("👋 Ada yang bisa saya bantu? Ketik kata kunci setelah mention saya.");
                    return;
                }
                
                // 3. Siapkan variabel perintah
                const parts = cleanMessage.split(' ');
                const command = parts[0].toLowerCase();
                const args = parts.slice(1).join(' ');

                // 4. Cek apakah ini GRUP ADMIN?
                if (ADMIN_GROUP_IDS.includes(msg.from)) { 
                    const commandHandled = await handleAdminCommand(msg, command, args);
                    if (!commandHandled) {
                        await getAndSendReply(chat, cleanMessage);
                    }
                } else {
                    // Grup Biasa + Tag = Jalankan Auto Reply
                    await getAndSendReply(chat, cleanMessage);
               }
            } 
            
            return; 
        }

        // --- LOGIKA DM (UNTUK ORANG LAIN) ---
        // (Pesan dari orang lain di chat pribadi)
        await getAndSendReply(chat, message); 

    } catch (err) {
        console.error("Terjadi error di message_create:", err);
    }
});


// === TAHAP 7: MULAI BOT ===
client.initialize();

