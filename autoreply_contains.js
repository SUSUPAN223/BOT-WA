// === FILE BARU: autoreply_contains.js ===
// File ini HANYA mengurus keyword "Contains Match" (addlist-a, dll)

// -----------------------------------------------------------------
// --- 1. FUNGSI ADMIN (Dipanggil oleh handleAdminCommand) ---
// -----------------------------------------------------------------
async function handleAutoReplyCommand(db, msg, command, args) {
    
    const NAMA_TABEL = 'auto_reply_contains'; // Tabel baru kita

    // --- ADDLIST-A / UPDATELIST-A (Teks) ---
    if (command === 'addlist-a' || command === 'updatelist-a') {
        const delimiterPos = args.indexOf('|');
        if (delimiterPos === -1) {
            msg.reply("Format salah. Gunakan tanda '|' untuk memisahkan.\n" + command + " [keyword] | [teks balasan]");
            return true;
        }
        const rawKeyword = args.substring(0, delimiterPos).trim();
        const response = args.substring(delimiterPos + 1).trim();
        
        if (!rawKeyword || !response) {
            msg.reply("Format salah. Keyword dan balasan tidak boleh kosong.");
            return true;
        }
        const keyword = rawKeyword.toLowerCase();
        
        const sql = (command === 'addlist-a')
            ? `INSERT INTO ${NAMA_TABEL} (keyword, response_text, response_caption) VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE response_text = ?, response_caption = NULL`
            : `UPDATE ${NAMA_TABEL} SET response_text = ?, response_caption = NULL WHERE LOWER(keyword) = LOWER(?)`;
        
        const params = (command === 'addlist-a') ? [keyword, response, response] : [response, keyword];
        try {
            const [result] = await db.query(sql, params);
            if (command === 'addlist-a') msg.reply(`✅ Berhasil! Keyword 'Contains' \`${keyword}\` telah ditambahkan/diperbarui.`);
            else if (result.affectedRows > 0) msg.reply(`✅ Berhasil! Keyword 'Contains' \`${keyword}\` telah diperbarui.`);
            else msg.reply(`ℹ️ Info: Keyword 'Contains' \`${keyword}\` tidak ditemukan.`);
        } catch (err) {
             msg.reply("❌ Gagal menyimpan ke database (auto_reply_contains).");
        }
        return true;
    }

    // --- DELLIST-A ---
    if (command === 'dellist-a') {
        const rawKeyword = args;
        if (!rawKeyword) {
            msg.reply("Format salah. Gunakan:\ndellist-a [keyword]");
            return true;
        }
        const keyword = rawKeyword.toLowerCase();
        
        try {
            // Kita tidak perlu cek file 'uploads' karena fitur ini hanya teks
            const [result] = await db.query(`DELETE FROM ${NAMA_TABEL} WHERE LOWER(keyword) = LOWER(?)`, [keyword]);
            if (result.affectedRows > 0) {
                msg.reply(`✅ Berhasil! Keyword 'Contains' \`${keyword}\` telah dihapus.`);
            } else {
                msg.reply(`ℹ️ Info: Keyword 'Contains' \`${keyword}\` tidak ditemukan.`);
            }
        } catch (err) {
            msg.reply("❌ Gagal menghapus data (auto_reply_contains).");
        }
        return true;
    }

    return false; // Bukan perintah 'auto-reply'
}


// -----------------------------------------------------------------
// --- 2. FUNGSI PENCARIAN (Dipanggil oleh getAndSendReply) ---
// -----------------------------------------------------------------
/**
 * Mencari balasan "Contains Match"
 * @param {object} db - Koneksi database
 * @param {string} message - Pesan lengkap dari user
 * @returns {object | null} - Objek balasan jika ditemukan
 */
async function findAutoReply(db, message) {
    try {
        // SQL ini mencari apakah pesan user (misal: "halo kak") MENGANDUNG keyword (misal: "halo")
        // Dia juga mengurutkan berdasarkan keyword terpanjang,
        // jadi "produk premium" akan diprioritaskan di atas "produk"
        const [rows] = await db.query(
            `SELECT response_text, response_caption 
             FROM auto_reply_contains 
             WHERE LOWER(?) LIKE CONCAT('%', LOWER(keyword), '%') 
             ORDER BY CHAR_LENGTH(keyword) DESC 
             LIMIT 1`,
            [message]
        );
        
        if (rows.length > 0) {
            return rows[0]; // Kembalikan objek balasan
        }
        return null; // Tidak ada yang cocok
    } catch (err) {
        console.error("Error di findAutoReply:", err);
        return null;
    }
}

// Ekspor kedua fungsi agar bisa 'di-require' oleh bot.js
module.exports = { handleAutoReplyCommand, findAutoReply };
