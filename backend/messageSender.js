function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Optimized template replacement using regex
function replaceTemplate(template, data) {
    if (!template || !data) return template || '';
    
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
    });
}

// Validate phone number format
function validatePhoneNumber(number) {
    if (!number) return false;
    const cleanNum = number.toString().replace(/\D/g, '');
    return cleanNum.length >= 10 && cleanNum.length <= 15;
}

async function sendMessages(sock, data, template) {
    // Input validation
    if (!sock) throw new Error('Socket connection required');
    if (!Array.isArray(data) || data.length === 0) throw new Error('Valid data array required');
    if (!template) throw new Error('Message template required');
    
    const results = { sent: 0, failed: 0, errors: [] };
    
    for (const row of data) {
        try {
            const number = row.Phone || row.phone || row.number;
            
            if (!validatePhoneNumber(number)) {
                results.failed++;
                results.errors.push(`Invalid phone number: ${number}`);
                continue;
            }
            
            const message = replaceTemplate(template, row);
            const jid = number.toString().replace(/\D/g, '') + '@s.whatsapp.net';
            
            await sock.sendMessage(jid, { text: message });
            results.sent++;
            console.log('Sent to', number);
            
        } catch (err) {
            results.failed++;
            const errorMsg = `Failed for ${row.Phone || row.phone || row.number}: ${err.message}`;
            results.errors.push(errorMsg);
            console.log('', errorMsg);
        }
        
        // Random delay between messages
        await delay(1500 + Math.random() * 2000);
    }
    
    return results;
}

module.exports = { sendMessages, validatePhoneNumber, replaceTemplate };
