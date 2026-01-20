// === FILE BARU: fungsi.js (KODE PALING SEDERHANA & STABIL) ===
const { MessageMedia } = require('whatsapp-web.js');

/**
 * Handle perintah .h (untuk tag semua/tag all)
 * Ini hanya boleh dipanggil oleh bot itu sendiri.
 */
async function handleHideTagCommand(client, msg, args) {
    // Perintah .h hanya berlaku di grup
    const chat = await msg.getChat();
    if (!chat.isGroup) {
        msg.reply("Perintah .h hanya dapat digunakan di dalam grup.");
        return true;
    }
    
    // Mengambil ID partisipan secara langsung (format paling stabil)
    const mentionsArray = chat.participants
        .filter(p => p.id && typeof p.id._serialized === 'string') 
        .map(p => p.id._serialized);

    let messageToSend = '';
    let mediaToSend = null;

    // --- Skenario 1: REPLY pesan ---
    if (msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        
        if (quotedMsg.hasMedia) {
            mediaToSend = await quotedMsg.downloadMedia();
            messageToSend = args.trim() || quotedMsg.body; 
        } else {
            messageToSend = args.trim() || quotedMsg.body; 
        }
        
    } 
    // --- Skenario 2: PESAN BARU ---
    else {
        messageToSend = args.trim();
    }

    if (!messageToSend) {
        msg.reply("Format salah. Gunakan:\n.h [pesan tag all] atau balas pesan dengan .h");
        return true;
    }

    try {
        // Pesan akhir hanya berisi pesan Anda + tag everyone di baris baru.
        const finalMessage = `${messageToSend}\n\n@everyone`; 

        // Kirim pesan dengan Mention (menggunakan array semua partisipan)
        if (mediaToSend) {
             await client.sendMessage(msg.from, mediaToSend, { 
                caption: finalMessage, 
                mentions: mentionsArray
            });
        } else {
            await client.sendMessage(msg.from, finalMessage, { 
                mentions: mentionsArray
            });
        }
        
        // **LOGIKA PENGHAPUSAN DIHAPUS DI SINI**

    } catch (err) {
        // Jika pengiriman gagal, setidaknya beri tahu Anda (pemilik bot)
        console.error("Error handleHideTagCommand:", err); 
        msg.reply("❌ Gagal mengirim pesan Tag All. Cek log VPS.");
    }
    
    return true; 
}

module.exports = { 
    handleHideTagCommand 
};