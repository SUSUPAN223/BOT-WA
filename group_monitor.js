// === FILE BARU: group_monitor.js ===

/**
 * Bagian 1: Logika untuk Perintah Admin (dipanggil oleh handleAdminCommand)
 */
async function handleGroupMonitorCommand(db, msg, command) {
    const NAMA_TABEL = 'group_monitor_settings';
    const groupId = msg.from; // Perintah ini harus dijalankan di dalam grup
    const chat = await msg.getChat();

    if (!chat.isGroup) {
        msg.reply("Perintah ini hanya bisa dijalankan di dalam grup.");
        return true;
    }

    // --- Perintah !monitoradd ---
    if (command === '!monitoradd') {
        try {
            await db.query(`INSERT INTO ${NAMA_TABEL} (group_id) VALUES (?) ON DUPLICATE KEY UPDATE group_id = ?`, [groupId, groupId]);
            msg.reply(`✅ Grup ini (${chat.name}) sekarang resmi dipantau.\n\nSetelan Default:\n- Pesan Keluar: AKTIF\n- Pesan Masuk: NON-AKTIF`);
        } catch (err) {
            console.error("Error !monitoradd:", err);
            msg.reply("❌ Gagal menambahkan grup ke database.");
        }
        return true;
    }

    // --- Perintah !monitordel ---
    if (command === '!monitordel') {
        try {
            const [result] = await db.query(`DELETE FROM ${NAMA_TABEL} WHERE group_id = ?`, [groupId]);
            if (result.affectedRows > 0) {
                msg.reply(`✅ Grup ini (${chat.name}) telah dihapus dari pantauan.`);
            } else {
                msg.reply(`ℹ️ Grup ini memang tidak sedang dipantau.`);
            }
        } catch (err) {
            console.error("Error !monitordel:", err);
            msg.reply("❌ Gagal menghapus grup dari database.");
        }
        return true;
    }

    // --- Perintah !setleave on/off ---
    if (command === '!setleave') {
        const args = msg.body.split(' ')[1] ? msg.body.split(' ')[1].toLowerCase() : '';
        let setting;
        if (args === 'on') setting = 1;
        else if (args === 'off') setting = 0;
        else {
            msg.reply("Format salah. Gunakan `!setleave on` atau `!setleave off`");
            return true;
        }

        try {
            await db.query(`UPDATE ${NAMA_TABEL} SET enable_leave_msg = ? WHERE group_id = ?`, [setting, groupId]);
            msg.reply(`✅ Pesan 'Selamat Tinggal' untuk grup ini telah di-set ke: *${args.toUpperCase()}*`);
        } catch (err) {
            msg.reply("❌ Gagal update setelan. Pastikan grup ini sudah di `!monitoradd`");
        }
        return true;
    }

    // --- Perintah !setjoin on/off ---
    if (command === '!setjoin') {
        const args = msg.body.split(' ')[1] ? msg.body.split(' ')[1].toLowerCase() : '';
        let setting;
        if (args === 'on') setting = 1;
        else if (args === 'off') setting = 0;
        else {
            msg.reply("Format salah. Gunakan `!setjoin on` atau `!setjoin off`");
            return true;
        }

        try {
            await db.query(`UPDATE ${NAMA_TABEL} SET enable_join_msg = ? WHERE group_id = ?`, [setting, groupId]);
            msg.reply(`✅ Pesan 'Selamat Datang' untuk grup ini telah di-set ke: *${args.toUpperCase()}*`);
        } catch (err) {
            msg.reply("❌ Gagal update setelan. Pastikan grup ini sudah di `!monitoradd`");
        }
        return true;
    }

    return false; // Bukan perintah monitor
}


/**
 * Bagian 2: Logika untuk Kejadian (dipanggil oleh client.on...)
 */

// --- Dipanggil oleh client.on('group_leave') ---
async function handleGroupLeave(db, client, notification) {
    const groupId = notification.chatId;

    try {
        // 1. Cek apakah grup ini dipantau & fiturnya aktif
        const [rows] = await db.query(`SELECT enable_leave_msg FROM group_monitor_settings WHERE group_id = ? AND enable_leave_msg = 1`, [groupId]);

        if (rows.length > 0) {
            // 2. Jika ya, ambil ID & kontak yang keluar
            const participantId = notification.recipientIds[0];
            const contact = await client.getContactById(participantId);
            const chat = await notification.getChat();

            // 3. Buat pesan (mention orangnya)
            const message = `.----------------------------------.\n| 👋 SELAMAT TINGGAL 👋\n|----------------------------------.\n|\n|  @${contact.id.user}\n|\n|  Yaah....\n|  Satu lagi memilih berpisah \n|  Terima kasih atas kenangannyaa \n|  Semoga takdir mempertemukan kita kembali\n'----------------------------------'`;

            // 4. Kirim pesan ke grup dengan mention
            await chat.sendMessage(message, {
                mentions: [contact]
            });
        }
        // Jika tidak, bot akan diam
    } catch (err) {
        console.error("Error di handleGroupLeave:", err);
    }
}

// --- Dipanggil oleh client.on('group_join') ---
async function handleGroupJoin(db, client, notification) {
    const groupId = notification.chatId;

    try {
        // 1. Cek apakah grup ini dipantau & fiturnya aktif
	const [rows] = await db.query(`SELECT enable_join_msg FROM group_monitor_settings WHERE group_id = ? AND enable_join_msg = 1`, [groupId]);

        if (rows.length > 0) {
            // 2. Jika ya, ambil ID & kontak yang masuk
            const participantId = notification.recipientIds[0];
            const contact = await client.getContactById(participantId);
            const chat = await notification.getChat();
            const pushname = contact.pushname || contact.number;

            // 3. Buat pesan (mention orangnya)
            const message = `.------------------.\n| 🎉 Selamat datang di grup 🥳 \n| saudara @${contact.id.user} (${pushname})\n| Intro dulu nich \n| Nama: \n|Umur: \n| Asal: \n| USN Roblox: \n| Diisi yaa.. \n| Admin kami makan orang soalnya 😅\n| Jangan lupa check deskripsi.\n .------------------.`;

            // 4. Kirim pesan ke grup dengan mention
            await chat.sendMessage(message, {
                mentions: [contact]
            });
        }
        // Jika tidak, bot akan diam
    } catch (err) {
        console.error("Error di handleGroupJoin:", err);
    }
}


// Ekspor semua fungsi
module.exports = { handleGroupMonitorCommand, handleGroupLeave, handleGroupJoin };
