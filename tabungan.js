// === FILE BARU: tabungan.js (VERSI REFACTOR PINTAR) ===

/**
 * (FUNGSI BANTU BARU)
 * Menerjemahkan "Nomor Urut" (misal: 3) menjadi "ID KTP" asli (misal: 108)
 */
async function getRealIdFromRowNumber(db, namaTabel, nomorUrut) {
    // Pastikan nomorUrut adalah angka
    const index = parseInt(nomorUrut, 10);
    if (isNaN(index) || index <= 0) {
        return null; // Nomor tidak valid
    }

    try {
        const offset = index - 1;
        const [rows] = await db.query(`SELECT id FROM ${namaTabel} ORDER BY id ASC LIMIT 1 OFFSET ?`, [offset]);
        
        if (rows.length > 0) {
            return rows[0].id; // Mengembalikan ID KTP asli
        } else {
            return null; // Nomor urut tidak ditemukan
        }
    } catch (err) {
        console.error("Error di getRealIdFromRowNumber:", err);
        return null;
    }
}

/**
 * (FUNGSI BANTU BARU)
 * Menerjemahkan input nama (misal: 'adik') ke nama tabel asli (misal: 'tabungan_ayank')
 */
function getTableNameFromAlias(nama) {
    const alias = nama.toLowerCase();
    if (alias === 'abang') {
        return 'tabungan_abang';
    }
    if (alias === 'adik') {
        return 'tabungan_ayank'; // Ini adalah "terjemahannya"
    }
    return null; // Jika nama tidak valid
}


/**
 * Fungsi ini dipanggil oleh bot.js
 */
async function handleTabunganCommand(db, msg, command, args) {
    
    // -----------------------------------------------------------------
    // --- FITUR TABUNGAN: TAMBAH ---
    // -----------------------------------------------------------------
    if (command === '!tambahtabungan') {
        // Format: !tambahtabungan {nama} | {jumlah}
        const parts = args.split('|').map(s => s.trim());
        if (parts.length !== 2) {
            msg.reply("Format salah. Gunakan:\n!tambahtabungan [nama] | [jumlah]");
            return true;
        }
        
        const [nama, jumlah] = parts;
        const jumlahAngka = parseInt(jumlah, 10);

        // (PERUBAHAN) Gunakan fungsi "penerjemah"
        const namaTabel = getTableNameFromAlias(nama);
        if (!namaTabel) {
            msg.reply("Nama tabel salah. Gunakan 'abang' atau 'adik'.");
            return true;
        }
        
        if (isNaN(jumlahAngka) || jumlahAngka <= 0) {
            msg.reply("Jumlah tabungan tidak valid.");
            return true;
        }

        const tanggal = new Date();
        try {
            await db.query(`INSERT INTO ${namaTabel} (tanggal, jumlah) VALUES (?, ?)`, [tanggal, jumlahAngka]);
            const [rows] = await db.query(`SELECT SUM(jumlah) as total FROM ${namaTabel}`);
            const totalTabungan = rows[0].total || 0;
            msg.reply(`✅ *Tabungan Dicatat!*\n\nNama: ${nama}\nJumlah: +Rp ${jumlahAngka.toLocaleString('id-ID')}\nTotal Tabungan (${nama}): Rp ${totalTabungan.toLocaleString('id-ID')}`);
        } catch (err) {
            console.error("Gagal tambah tabungan:", err);
            msg.reply("❌ Gagal menyimpan ke database.");
        }
        return true;
    }

    // -----------------------------------------------------------------
    // --- FITUR TABUNGAN: LIHAT SEMUA (!tabungan) ---
    // -----------------------------------------------------------------
    if (command === '!tabungan') {
        const nama = args.toLowerCase().trim();
        let tabelUntukDiCek = [];

        // (PERUBAHAN) Gunakan 'adik' sebagai input
        if (nama === 'abang') {
            tabelUntukDiCek.push('tabungan_abang');
        } else if (nama === 'adik') {
            tabelUntukDiCek.push('tabungan_ayank'); // Tapi panggil 'tabungan_ayank'
        } else {
            tabelUntukDiCek.push('tabungan_abang', 'tabungan_ayank');
        }

        let replyText = '';
        try {
            for (const namaTabel of tabelUntukDiCek) {
                const [rows] = await db.query(`SELECT id, tanggal, jumlah FROM ${namaTabel} ORDER BY id ASC`);
                
                // (PERUBAHAN) Tampilkan 'adik' di balasan
                let namaOrang = namaTabel.split('_')[1]; // 'abang' or 'ayank'
                if (namaOrang === 'ayank') namaOrang = 'adik'; // Terjemahkan balasan

                replyText += `*--- TABUNGAN: ${namaOrang.toUpperCase()} ---*\n`;

                if (rows.length === 0) {
                    replyText += "_Belum ada tabungan._\n\n";
                    continue;
                }

                let runningTotal = 0;
                rows.forEach((row, index) => {
                    runningTotal += row.jumlah;
                    const nomorUrut = index + 1;
                    const tgl = new Date(row.tanggal).toLocaleDateString('id-ID');
                    const jml = `+Rp ${row.jumlah.toLocaleString('id-ID')}`;
                    const total = `Rp ${runningTotal.toLocaleString('id-ID')}`;
                    
                    replyText += `*No: ${nomorUrut}* | ${tgl} | ${jml} | (Total: ${total})\n`;
                });
                replyText += '\n';
            }
            msg.reply(replyText);
        } catch (err) {
            console.error("Gagal lihat tabungan:", err);
            msg.reply("❌ Gagal mengambil data dari database.");
        }
        return true;
    }

    // -----------------------------------------------------------------
    // --- FITUR TABUNGAN: LIHAT TOTAL (!totaltabungan) ---
    // -----------------------------------------------------------------
    if (command === '!totaltabungan') {
        const nama = args.toLowerCase().trim();
        let tabelUntukDiCek = [];

        // (PERUBAHAN) Gunakan 'adik' sebagai input
        if (nama === 'abang') tabelUntukDiCek.push('tabungan_abang');
        else if (nama === 'adik') tabelUntukDiCek.push('tabungan_ayank');
        else tabelUntukDiCek.push('tabungan_abang', 'tabungan_ayank');

        let replyText = '*--- TOTAL TABUNGAN ---*\n';
        let totalGabungan = 0;
        let totalTransaksiGabungan = 0;

        try {
            for (const namaTabel of tabelUntukDiCek) {
                const [rows] = await db.query(`SELECT SUM(jumlah) as total, COUNT(*) as jumlah_transaksi FROM ${namaTabel}`);
                const total = parseInt(rows[0].total || 0, 10);
                const jumlah_transaksi = parseInt(rows[0].jumlah_transaksi || 0, 10);
                
                // (PERUBAHAN) Tampilkan 'adik' di balasan
                let namaOrang = namaTabel.split('_')[1];
                if (namaOrang === 'ayank') namaOrang = 'adik';

                replyText += `Total ${namaOrang}: Rp ${total.toLocaleString('id-ID')} (dari ${jumlah_transaksi}x tabungan)\n`;
                totalGabungan += total;
                totalTransaksiGabungan += jumlah_transaksi;
            }

            if (tabelUntukDiCek.length > 1) {
                replyText += `------------------------\n*Total Gabungan: Rp ${totalGabungan.toLocaleString('id-ID')} (dari ${totalTransaksiGabungan}x tabungan)*`;
            }
            msg.reply(replyText);
        } catch (err) {
            console.error("Gagal lihat total:", err);
            msg.reply("❌ Gagal mengambil data dari database.");
        }
        return true;
    }

    // -----------------------------------------------------------------
    // --- FITUR TABUNGAN: HAPUS ---
    // -----------------------------------------------------------------
    if (command === '!hapustabungan') {
        const parts = args.split(' ');
        if (parts.length !== 2) {
            msg.reply("Format salah. Gunakan:\n!hapustabungan [nama] [No. Urut]");
            return true;
        }
        
        const [nama, nomorUrut] = parts;
        
        // (PERUBAHAN) Gunakan fungsi "penerjemah"
        const namaTabel = getTableNameFromAlias(nama);
        if (!namaTabel) {
            msg.reply("Nama tabel salah. Gunakan 'abang' atau 'adik'.");
            return true;
        }
        
        try {
            const realId = await getRealIdFromRowNumber(db, namaTabel, nomorUrut);
            
            if (!realId) {
                msg.reply(`ℹ️ No. Urut ${nomorUrut} tidak ditemukan di tabungan ${nama}.`);
                return true;
            }

            const [result] = await db.query(`DELETE FROM ${namaTabel} WHERE id = ?`, [realId]);
            
            if (result.affectedRows > 0) {
                msg.reply(`✅ Berhasil menghapus No. Urut ${nomorUrut} (ID Asli: ${realId}) dari tabungan ${nama}.`);
            } else {
                msg.reply(`ℹ️ No. Urut ${nomorUrut} tidak ditemukan di tabungan ${nama}.`);
            }
        } catch (err) {
            console.error("Gagal hapus tabungan:", err);
            msg.reply("❌ Gagal menghapus data.");
        }
        return true;
    }

    // -----------------------------------------------------------------
    // --- FITUR TABUNGAN: EDIT ---
    // -----------------------------------------------------------------
    if (command === '!edittabungan') {
        const parts = args.split('|').map(s => s.trim());
        if (parts.length !== 2) {
            msg.reply("Format salah. Gunakan:\n!edittabungan [nama] [No. Urut] | [jumlah_baru]");
            return true;
        }
        
        const [info, jumlahBaru] = parts;
        const infoParts = info.split(' ');
        
        if (infoParts.length !== 2) {
            msg.reply("Format salah. Gunakan:\n!edittabungan [nama] [No. Urut] | [jumlah_baru]");
            return true;
        }

        const nama = infoParts[0].toLowerCase();
        const nomorUrut = infoParts[1];
        
        // (PERUBAHAN) Gunakan fungsi "penerjemah"
        const namaTabel = getTableNameFromAlias(nama);
        if (!namaTabel) {
            msg.reply("Nama tabel salah. Gunakan 'abang' atau 'adik'.");
            return true;
        }
        
        try {
            const realId = await getRealIdFromRowNumber(db, namaTabel, nomorUrut);

            if (!realId) {
                msg.reply(`ℹ️ No. Urut ${nomorUrut} tidak ditemukan di tabungan ${nama}.`);
                return true;
            }

            const [result] = await db.query(`UPDATE ${namaTabel} SET jumlah = ? WHERE id = ?`, [jumlahBaru, realId]);
            
            if (result.affectedRows > 0) {
                msg.reply(`✅ Berhasil update No. Urut ${nomorUrut} (ID Asli: ${realId}) di tabungan ${nama}.`);
            } else {
                msg.reply(`ℹ️ No. Urut ${nomorUrut} tidak ditemukan di tabungan ${nama}.`);
            }
        } catch (err) {
            console.error("Gagal edit tabungan:", err);
            msg.reply("❌ Gagal mengedit data.");
        }
        return true;
    }
    
    // Jika bukan perintah tabungan, kembalikan 'false'
    return false;
}

// "Ekspor" fungsi ini agar bisa 'di-require' oleh bot.js
module.exports = { handleTabunganCommand };