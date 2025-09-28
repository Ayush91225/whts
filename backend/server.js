const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const crypto = require('crypto');
const { 
    SECURITY_CONFIG, 
    sanitizeFilename, 
    validateFileExtension, 
    validatePhoneNumber, 
    validateSessionId, 
    generateSecureFilename, 
    safeJsonParse, 
    securityMiddleware, 
    validateFileUpload 
} = require('./security');
const { 
    performanceMonitor, 
    batchProcessor, 
    rateLimiter, 
    getMemoryUsage 
} = require('./performance');
const database = require('./database');
const scheduler = require('./scheduler');
const sarvamAI = require('./sarvam');

const app = express();

// Apply security middleware
app.use(securityMiddleware);

app.use(express.json({ limit: '10mb' }));
app.use(fileUpload({
    limits: { fileSize: SECURITY_CONFIG.MAX_FILE_SIZE },
    abortOnLimit: true,
    createParentPath: true
}));
app.use(validateFileUpload);
app.use(express.static(path.join(__dirname, '../frontend')));

let sendingProgress = { total: 0, sent: 0, failed: 0, inProgress: false, jobId: null, startTime: null };
let sessions = new Map(); // sessionId -> { client, qrCode, isReady, phoneNumber }
let activeJobs = new Map(); // jobId -> { promise, controller }

// Create WhatsApp client for a session
function createClient(sessionId) {
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId }),
        puppeteer: { 
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            timeout: 60000
        }
    });

    const session = { client, qrCode: '', isReady: false, phoneNumber: '' };
    sessions.set(sessionId, session);

    client.on('qr', (qr) => {
        console.log(`QR Code received for session ${sessionId}`);
        qrcode.toDataURL(qr, (err, url) => {
            if (err) {
                console.error(`QR code generation failed for session ${sessionId}:`, err);
                return;
            }
            session.qrCode = url;
        });
    });

    client.on('ready', async () => {
        console.log(`WhatsApp session ${sessionId} is ready!`);
        session.isReady = true;
        session.qrCode = '';
        try {
            const info = client.info;
            session.phoneNumber = info.wid.user;
            console.log(`Session ${sessionId} phone: ${session.phoneNumber}`);
        } catch (error) {
            console.log(`Could not get phone number for session ${sessionId}`);
        }
    });

    client.on('auth_failure', () => {
        console.log(`Authentication failed for session ${sessionId}`);
        session.isReady = false;
    });

    client.on('disconnected', (reason) => {
        console.log(`WhatsApp session ${sessionId} disconnected:`, reason);
        session.isReady = false;
        // Try to reinitialize after disconnect
        setTimeout(() => {
            if (!session.isReady) {
                console.log(`Attempting to reinitialize session ${sessionId}`);
                client.initialize();
            }
        }, 5000);
    });

    client.initialize();
    return session;
}

// Get all sessions status
app.get('/sessions', (req, res) => {
    const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
        id,
        isReady: session.isReady,
        phoneNumber: session.phoneNumber || 'Unknown',
        qrCode: session.qrCode
    }));
    res.json({ sessions: sessionList });
});

// Create new session
app.post('/sessions', (req, res) => {
    const sessionId = `session_${Date.now()}`;
    createClient(sessionId);
    res.json({ sessionId, status: 'created' });
});

// Get QR code for specific session
app.get('/sessions/:sessionId/qr', (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    if (session.isReady) return res.json({ status: 'authenticated', phoneNumber: session.phoneNumber });
    if (session.qrCode) return res.json({ qr: session.qrCode });
    res.json({ status: 'waiting' });
});

// Test message sending
app.post('/sessions/:sessionId/test', async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session || !session.isReady) {
        return res.status(400).json({ error: 'Session not ready' });
    }
    
    try {
        const testNumber = session.phoneNumber; // Send to self
        const chatId = testNumber + '@c.us';
        const testMessage = 'Test message from WhatsApp Bulk Sender';
        
        console.log(`Sending test message to ${chatId}`);
        const result = await session.client.sendMessage(chatId, testMessage);
        console.log('Test message result:', result);
        
        res.json({ success: true, messageId: result?.id, chatId });
    } catch (error) {
        console.error('Test message failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete session
app.delete('/sessions/:sessionId', async (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    try {
        await session.client.destroy();
        sessions.delete(req.params.sessionId);
        res.json({ status: 'deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// Get sending progress
app.get('/progress', (req, res) => {
    const memUsage = getMemoryUsage();
    const metrics = performanceMonitor.getMetrics('single_message_send');
    
    res.json({
        ...sendingProgress,
        activeJobs: activeJobs.size,
        performance: {
            memoryUsage: memUsage,
            messageMetrics: metrics
        }
    });
});

// Contacts API
app.get('/contacts', (req, res) => {
    const contacts = database.getContacts();
    res.json({ contacts });
});

app.post('/contacts', (req, res) => {
    const { contacts } = req.body;
    const savedContacts = database.saveContacts(contacts);
    res.json({ contacts: savedContacts, message: 'Contacts saved successfully' });
});

app.delete('/contacts/:number', (req, res) => {
    const { number } = req.params;
    const contacts = database.deleteContact(number);
    res.json({ contacts, message: 'Contact deleted successfully' });
});

// Upload contacts from CSV
app.post('/contacts/upload', async (req, res) => {
    try {
        if (!req.files?.csv) {
            return res.status(400).json({ error: 'CSV file required' });
        }

        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        
        const csvFilename = generateSecureFilename(req.files.csv.name);
        const csvPath = path.join(uploadsDir, csvFilename);
        
        await req.files.csv.mv(csvPath);
        const numbers = await parseCSV(csvPath);
        fs.unlinkSync(csvPath);
        
        if (numbers.length === 0) {
            return res.status(400).json({ error: 'No valid numbers found in CSV' });
        }
        
        const contacts = numbers.map(number => ({
            number,
            name: `Contact ${number}`,
            source: 'csv_upload'
        }));
        
        const savedContacts = database.saveContacts(contacts);
        res.json({ 
            contacts: savedContacts, 
            message: `${contacts.length} contacts uploaded successfully`,
            newContacts: contacts.length
        });
    } catch (error) {
        console.error('Error uploading contacts:', error);
        res.status(500).json({ error: 'Failed to upload contacts' });
    }
});

// Campaigns API
app.get('/campaigns', (req, res) => {
    const campaigns = database.getCampaigns();
    res.json({ campaigns });
});

app.post('/campaigns', (req, res) => {
    const campaign = database.saveCampaign(req.body);
    res.json({ campaign, message: 'Campaign saved successfully' });
});

// Schedule campaign
app.post('/campaigns/:id/schedule', (req, res) => {
    const { id } = req.params;
    const { scheduledTime } = req.body;
    
    try {
        const scheduleInfo = scheduler.scheduleCampaign(id, scheduledTime, () => {
            // Execute campaign when scheduled time arrives
            console.log(`Executing scheduled campaign: ${id}`);
            // Add campaign execution logic here
        });
        
        database.updateCampaign(id, { 
            status: 'scheduled',
            scheduledTime,
            scheduleInfo
        });
        
        res.json({ 
            message: 'Campaign scheduled successfully',
            scheduleInfo
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Cancel scheduled campaign
app.delete('/campaigns/:id/schedule', (req, res) => {
    const { id } = req.params;
    const cancelled = scheduler.cancelScheduledCampaign(id);
    
    if (cancelled) {
        database.updateCampaign(id, { 
            status: 'draft',
            scheduledTime: null,
            scheduleInfo: null
        });
        res.json({ message: 'Campaign schedule cancelled' });
    } else {
        res.status(404).json({ error: 'Scheduled campaign not found' });
    }
});

// Reports API
app.get('/reports', (req, res) => {
    const { date, campaignId } = req.query;
    let reports;
    
    if (date) {
        reports = database.getReportsByDate(date);
    } else if (campaignId) {
        reports = database.getReportsByCampaign(campaignId);
    } else {
        reports = database.getReports();
    }
    
    res.json({ reports });
});

// Get report statistics
app.get('/reports/stats', (req, res) => {
    const reports = database.getReports();
    const stats = {
        totalCampaigns: reports.length,
        totalSent: reports.reduce((sum, r) => sum + (r.sent || 0), 0),
        totalFailed: reports.reduce((sum, r) => sum + (r.failed || 0), 0),
        successRate: 0
    };
    
    const totalMessages = stats.totalSent + stats.totalFailed;
    if (totalMessages > 0) {
        stats.successRate = ((stats.totalSent / totalMessages) * 100).toFixed(2);
    }
    
    res.json({ stats });
});

// Sarvam AI Integration
app.get('/ai/languages', (req, res) => {
    const languages = sarvamAI.getSupportedLanguages();
    res.json({ languages });
});

app.post('/ai/generate', async (req, res) => {
    const { language, prompt } = req.body;
    
    try {
        const result = await sarvamAI.generateCampaignMessage(language, prompt);
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to generate message',
            fallbackMessage: sarvamAI.getFallbackMessage(language, prompt)
        });
    }
});

// Get active jobs
app.get('/jobs', (req, res) => {
    const jobs = Array.from(activeJobs.entries()).map(([jobId, job]) => ({
        jobId,
        startTime: new Date(job.startTime).toISOString(),
        duration: Math.round((Date.now() - job.startTime) / 1000)
    }));
    
    res.json({ activeJobs: jobs, currentJob: sendingProgress.jobId });
});

// Cancel job
app.delete('/jobs/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    
    if (activeJobs.has(jobId)) {
        activeJobs.delete(jobId);
        if (sendingProgress.jobId === jobId) {
            sendingProgress.inProgress = false;
        }
        console.log(`Job ${jobId} cancelled`);
        res.json({ status: 'Job cancelled', jobId });
    } else {
        res.status(404).json({ error: 'Job not found' });
    }
});

// Utility functions moved to security.js

function parseCSV(csvPath) {
    return new Promise((resolve, reject) => {
        const numbers = [];
        fs.createReadStream(csvPath)
            .pipe(csv())
            .on('data', (row) => {
                // Try multiple column names
                const num = row.number || row.phone || row.mobile || row.Number || row.Phone || row.Mobile || row.PHONE || row.NUMBER;
                if (num && num.toString().trim()) {
                    const cleanNum = num.toString().replace(/\D/g, '');
                    if (cleanNum.length >= 10) { // Basic validation for phone number length
                        numbers.push(cleanNum);
                    }
                }
            })
            .on('end', () => {
                console.log(`Parsed ${numbers.length} numbers from CSV`);
                resolve(numbers);
            })
            .on('error', reject);
    });
}

async function executeCampaign(client, numbers, messageText, mediaFiles, buttons, jobId, campaignId) {
    performanceMonitor.startTimer('bulk_message_processing');
    
    const processor = async (number) => {
        console.log(`\n=== PROCESSING NUMBER: ${number} ===`);
        
        // Check if job was cancelled
        if (!activeJobs.has(jobId)) {
            console.log('Job was cancelled');
            throw new Error('Job cancelled');
        }
        
        // Verify client is still ready
        if (!client || typeof client.sendMessage !== 'function') {
            console.log('WhatsApp client not available:', { hasClient: !!client, hasSendMessage: !!(client && client.sendMessage) });
            throw new Error('WhatsApp client not available');
        }
        
        console.log('Starting message send process...');
        performanceMonitor.startTimer('single_message_send');
        try {
            // Check if session is still ready before sending
            if (!client.info || !client.info.wid) {
                throw new Error('WhatsApp session disconnected');
            }
            
            // 5-8 second delay to avoid rate limiting
            const delay = Math.random() * 3000 + 5000;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            const chatId = number + '@c.us';
            console.log(`Attempting to send message to ${chatId}`);
            
            // Send text message first
            if (messageText && messageText.trim()) {
                console.log(`Sending text message: ${messageText.substring(0, 50)}...`);
                await sendRichMessage(client, chatId, 'text', messageText, null, buttons);
                console.log(`Message sent successfully to ${number}`);
            } else {
                console.log('No message text provided');
            }
            
            // Send media files if any
            for (const mediaFile of mediaFiles) {
                await sendRichMessage(client, chatId, mediaFile.type, '', mediaFile.path, null);
                // Small delay between media files
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            sendingProgress.sent++;
            console.log(`✅ SUCCESS: Sent to ${number} (${sendingProgress.sent}/${sendingProgress.total}) - Job: ${jobId}`);
            return { success: true, number };
        } catch (error) {
            sendingProgress.failed++;
            console.error(`❌ FAILED: Failed to send to ${number}:`, error.message);
            console.error('Error stack:', error.stack);
            return { success: false, number, error: error.message };
        } finally {
            console.log(`=== FINISHED PROCESSING: ${number} ===\n`);
            performanceMonitor.endTimer('single_message_send');
        }
    };
    
    const onProgress = (progress) => {
        console.log(`Job ${jobId} - Batch ${progress.batchIndex}/${progress.totalBatches} completed. Progress: ${progress.processedItems}/${progress.totalItems}`);
        
        // Log memory usage periodically
        if (progress.batchIndex % 3 === 0) {
            const memUsage = getMemoryUsage();
            console.log(`Memory usage: ${memUsage.heapUsed}MB / ${memUsage.heapTotal}MB`);
        }
    };
    
    try {
        console.log(`\n🚀 STARTING BATCH PROCESSING FOR JOB: ${jobId}`);
        console.log(`Numbers to process: ${JSON.stringify(numbers)}`);
        console.log(`Message text: ${messageText ? messageText.substring(0, 100) + '...' : 'NO MESSAGE'}`);
        
        await batchProcessor.processBatch(numbers, processor, onProgress);
        
        const totalTime = performanceMonitor.endTimer('bulk_message_processing');
        console.log(`\n⏱ Job ${jobId} completed in ${(totalTime / 1000).toFixed(2)} seconds`);
        console.log(`Final results: ${sendingProgress.sent} sent, ${sendingProgress.failed} failed`);
        
        // Save campaign report
        const report = database.saveReport({
            campaignId,
            jobId,
            total: sendingProgress.total,
            sent: sendingProgress.sent,
            failed: sendingProgress.failed,
            successRate: ((sendingProgress.sent / sendingProgress.total) * 100).toFixed(2),
            duration: totalTime,
            completedAt: new Date().toISOString()
        });
        
        // Update campaign status
        database.updateCampaign(campaignId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            reportId: report.id
        });
        
        // Clean up media files
        mediaFiles.forEach(mediaFile => {
            if (fs.existsSync(mediaFile.path)) {
                fs.unlinkSync(mediaFile.path);
            }
        });
        console.log('Cleaned up media files');
        
        sendingProgress.inProgress = false;
        console.log(`\n✅ Job ${jobId} finished: ${sendingProgress.sent} sent, ${sendingProgress.failed} failed`);
        
    } catch (error) {
        console.error(`\n❌ Job ${jobId} error:`, error.message);
        console.error('Full error:', error);
        
        // Clean up media files on error
        mediaFiles.forEach(mediaFile => {
            if (fs.existsSync(mediaFile.path)) {
                fs.unlinkSync(mediaFile.path);
            }
        });
        
        // Save error report
        database.saveReport({
            campaignId,
            jobId,
            total: sendingProgress.total,
            sent: sendingProgress.sent,
            failed: sendingProgress.failed,
            error: error.message,
            completedAt: new Date().toISOString()
        });
        
        database.updateCampaign(campaignId, {
            status: 'failed',
            error: error.message,
            completedAt: new Date().toISOString()
        });
        
        sendingProgress.inProgress = false;
    } finally {
        // Remove job from active jobs
        activeJobs.delete(jobId);
        performanceMonitor.logSummary();
    }
}

// Send bulk messages
app.post('/send', async (req, res) => {
    // Rate limiting
    const clientIP = req.ip || req.connection.remoteAddress;
    if (!rateLimiter.isAllowed(clientIP)) {
        return res.status(429).json({ 
            error: 'Rate limit exceeded. Please try again later.',
            remainingRequests: rateLimiter.getRemainingRequests(clientIP)
        });
    }
    
    performanceMonitor.startTimer('bulk_send_request');
    try {
        let { 
            sessionId, 
            message = '', 
            buttons: buttonsStr,
            recipients = [],
            scheduledTime,
            campaignName = 'Untitled Campaign'
        } = req.body;
        
        // Fix array values from FormData
        if (Array.isArray(sessionId)) sessionId = sessionId[0];
        if (Array.isArray(message)) message = message[0];
        if (Array.isArray(campaignName)) campaignName = campaignName[0];
        if (Array.isArray(scheduledTime)) scheduledTime = scheduledTime[0];
        if (Array.isArray(buttonsStr)) buttonsStr = buttonsStr[0];
        if (Array.isArray(recipients)) recipients = recipients[0];
        
        console.log('Received request body:', {
            sessionId: Array.isArray(sessionId) ? `Array[${sessionId.length}]` : sessionId,
            message: message ? 'Present' : 'Missing',
            recipients: recipients ? (typeof recipients === 'string' ? 'String' : Array.isArray(recipients) ? `Array[${recipients.length}]` : typeof recipients) : 'Missing',
            hasCSV: !!req.files?.csv,
            campaignName: Array.isArray(campaignName) ? `Array[${campaignName.length}]` : campaignName,
            scheduledTime: Array.isArray(scheduledTime) ? `Array[${scheduledTime.length}]` : scheduledTime
        });
        
        if (!sessionId) {
            console.log('Missing session ID in request');
            return res.status(400).json({ error: 'Session ID required' });
        }
        
        const session = sessions.get(sessionId);
        if (!session) {
            console.log('Session not found:', sessionId, 'Available sessions:', Array.from(sessions.keys()));
            return res.status(400).json({ error: 'Session not found' });
        }
        
        if (!session.isReady) {
            console.log('Session not ready:', sessionId, 'Session state:', session.isReady);
            return res.status(400).json({ error: 'Session not ready. Please connect WhatsApp first.' });
        }
        
        if (sendingProgress.inProgress) {
            console.log('Campaign already in progress');
            return res.status(400).json({ error: 'Another campaign is already in progress. Please wait.' });
        }
        
        // Validate session ID
        if (!validateSessionId(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }
        
        let numbers = [];
        let mediaFiles = [];
        
        // Handle recipients from different sources
        if (recipients) {
            // Use selected contacts
            try {
                if (typeof recipients === 'string') {
                    numbers = JSON.parse(recipients);
                } else if (Array.isArray(recipients)) {
                    numbers = recipients;
                } else {
                    numbers = [recipients];
                }
                
                // Ensure we have valid numbers
                if (!Array.isArray(numbers) || numbers.length === 0) {
                    console.log('Invalid numbers after parsing:', numbers);
                    return res.status(400).json({ error: 'No valid recipients found' });
                }
                
                console.log(`Successfully parsed ${numbers.length} recipients from saved contacts`);
                
                // Validate phone numbers
                numbers = numbers.filter(num => {
                    const cleanNum = num.toString().replace(/\D/g, '');
                    return cleanNum.length >= 10 && cleanNum.length <= 15;
                });
                
                if (numbers.length === 0) {
                    return res.status(400).json({ error: 'No valid phone numbers found in selected contacts' });
                }
                
                console.log(`${numbers.length} valid phone numbers after filtering`);
            } catch (e) {
                console.error('Error parsing recipients:', e, 'Recipients value:', recipients);
                return res.status(400).json({ error: 'Invalid recipients format' });
            }
        } else if (req.files?.csv) {
            // Parse CSV file
            const uploadsDir = path.join(__dirname, 'uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            
            const csvFilename = generateSecureFilename(req.files.csv.name);
            const csvPath = path.join(uploadsDir, csvFilename);
            
            await req.files.csv.mv(csvPath);
            numbers = await parseCSV(csvPath);
            fs.unlinkSync(csvPath);
            
            console.log(`Successfully parsed ${numbers.length} recipients from CSV`);
            
            // Phone numbers are already validated in parseCSV function
            
            // Auto-save contacts from CSV
            const contacts = numbers.map(number => ({
                number,
                name: `Contact ${number}`,
                source: 'campaign_csv'
            }));
            database.saveContacts(contacts);
        } else {
            console.log('No recipients found. Recipients:', recipients, 'CSV file:', !!req.files?.csv);
            return res.status(400).json({ error: 'Recipients required (CSV file or selected contacts)' });
        }
        
        if (numbers.length === 0) {
            console.log('No valid numbers found. Numbers array:', numbers, 'Recipients param:', recipients, 'CSV file:', !!req.files?.csv);
            return res.status(400).json({ error: 'No valid numbers found' });
        }
        
        console.log(`Final numbers array has ${numbers.length} recipients`);
        
        // Handle multiple media files
        if (req.files) {
            const uploadsDir = path.join(__dirname, 'uploads');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
            
            for (const [key, file] of Object.entries(req.files)) {
                if (key !== 'csv' && file.size > 0) {
                    const mediaFilename = generateSecureFilename(file.name);
                    const mediaPath = path.join(uploadsDir, mediaFilename);
                    await file.mv(mediaPath);
                    
                    mediaFiles.push({
                        path: mediaPath,
                        type: file.mimetype.startsWith('image/') ? 'image' : 'document',
                        name: file.name,
                        size: file.size
                    });
                    
                    console.log(`Media file uploaded: ${mediaFilename} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
                }
            }
        }
        
        // Parse buttons safely
        const buttons = safeJsonParse(buttonsStr, null);
        
        // Generate unique job ID
        const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        // Save campaign
        const campaign = database.saveCampaign({
            name: campaignName,
            sessionId,
            message,
            recipients: numbers,
            mediaFiles: mediaFiles.map(f => ({ name: f.name, type: f.type, size: f.size })),
            buttons,
            jobId,
            status: scheduledTime ? 'scheduled' : 'running',
            scheduledTime
        });
        
        // Handle scheduling
        if (scheduledTime) {
            try {
                const scheduleInfo = scheduler.scheduleCampaign(jobId, scheduledTime, async () => {
                    // Execute campaign when scheduled
                    console.log(`Executing scheduled campaign: ${jobId} with ${numbers.length} recipients`);
                    console.log('Session state at execution:', {
                        sessionId,
                        isReady: session.isReady,
                        hasClient: !!session.client,
                        phoneNumber: session.phoneNumber
                    });
                    
                    if (!session.isReady) {
                        console.error('Session not ready during scheduled execution');
                        return;
                    }
                    
                    activeJobs.set(jobId, { startTime: Date.now() });
                    await executeCampaign(session.client, numbers, message, mediaFiles, buttons, jobId, campaign.id);
                });
                
                database.updateCampaign(campaign.id, { scheduleInfo });
                
                return res.json({
                    status: 'Campaign scheduled successfully',
                    campaignId: campaign.id,
                    jobId,
                    scheduledTime,
                    total: numbers.length
                });
            } catch (error) {
                return res.status(400).json({ error: error.message });
            }
        }
        
        // Verify session is still ready before starting
        if (!session.isReady) {
            return res.status(400).json({ error: 'WhatsApp session disconnected. Please reconnect.' });
        }
        
        console.log(`Session ${sessionId} verified ready. Client info:`, {
            hasClient: !!session.client,
            hasSendMessage: !!(session.client && session.client.sendMessage),
            phoneNumber: session.phoneNumber
        });
        
        // Execute immediately
        sendingProgress = { 
            total: numbers.length, 
            sent: 0, 
            failed: 0, 
            inProgress: true, 
            jobId: jobId,
            campaignId: campaign.id,
            startTime: new Date().toISOString()
        };
        
        res.json({ 
            status: 'Campaign started as background job', 
            total: numbers.length, 
            jobId: jobId,
            campaignId: campaign.id,
            message: 'Messages will continue sending even if you close the browser'
        });
        
        console.log(`Starting background job ${jobId}: ${numbers.length} recipients`, numbers.slice(0, 3));
        
        // Test message sending capability
        try {
            console.log('Testing WhatsApp client connectivity...');
            const testChatId = session.phoneNumber + '@c.us';
            // Don't actually send a test message, just verify the client structure
            if (!session.client.sendMessage) {
                throw new Error('sendMessage method not available on client');
            }
            console.log('WhatsApp client appears ready for sending');
        } catch (testError) {
            console.error('WhatsApp client test failed:', testError.message);
            return res.status(500).json({ error: 'WhatsApp client not properly initialized' });
        }
        
        // Start background job
        activeJobs.set(jobId, { startTime: Date.now() });
        const jobPromise = executeCampaign(session.client, numbers, message, mediaFiles, buttons, jobId, campaign.id);
        activeJobs.get(jobId).promise = jobPromise;
        
    } catch (error) {
        sendingProgress.inProgress = false;
        console.error('Error in bulk send:', error);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        performanceMonitor.endTimer('bulk_send_request');
    }
});

// Convert HTML to WhatsApp formatting (optimized)
const htmlToWhatsAppMap = {
    bold: [/<b>(.*?)<\/b>/g, /<strong>(.*?)<\/strong>/g],
    italic: [/<i>(.*?)<\/i>/g, /<em>(.*?)<\/em>/g],
    strikethrough: [/<s>(.*?)<\/s>/g, /<strike>(.*?)<\/strike>/g],
    code: [/<code>(.*?)<\/code>/g, /<pre>(.*?)<\/pre>/g],
    headers: [/<h[1-6]>(.*?)<\/h[1-6]>/g],
    links: [/<a href="(.*?)">(.*?)<\/a>/g],
    lists: [/<ul>(.*?)<\/ul>/gs, /<ol>(.*?)<\/ol>/gs],
    listItems: [/<li>(.*?)<\/li>/g],
    breaks: [/<br\s*\/?>/g],
    paragraphs: [/<p>(.*?)<\/p>/g]
};

function convertHtmlToWhatsApp(html) {
    let result = html;
    
    // Apply all transformations in one pass
    result = result
        .replace(htmlToWhatsAppMap.bold[0], '*$1*')
        .replace(htmlToWhatsAppMap.bold[1], '*$1*')
        .replace(htmlToWhatsAppMap.italic[0], '_$1_')
        .replace(htmlToWhatsAppMap.italic[1], '_$1_')
        .replace(htmlToWhatsAppMap.strikethrough[0], '~$1~')
        .replace(htmlToWhatsAppMap.strikethrough[1], '~$1~')
        .replace(htmlToWhatsAppMap.code[0], '```$1```')
        .replace(htmlToWhatsAppMap.code[1], '```$1```')
        .replace(htmlToWhatsAppMap.breaks[0], '\n')
        .replace(htmlToWhatsAppMap.paragraphs[0], '$1\n\n')
        .replace(htmlToWhatsAppMap.headers[0], '*$1*\n')
        .replace(htmlToWhatsAppMap.links[0], '$2: $1')
        .replace(htmlToWhatsAppMap.lists[0], '$1')
        .replace(htmlToWhatsAppMap.lists[1], '$1')
        .replace(htmlToWhatsAppMap.listItems[0], '• $1\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();
    
    return result;
}

// Function to send rich messages
async function sendRichMessage(client, chatId, messageType, text, mediaPath, buttons) {
    try {
        // Verify client is still connected
        if (!client.info || !client.info.wid) {
            throw new Error('WhatsApp client disconnected');
        }
        
        const formattedText = convertHtmlToWhatsApp(text);
        console.log(`Sending ${messageType} message to ${chatId}: ${formattedText.substring(0, 100)}...`);
        
        switch (messageType) {
            case 'text':
                const result = await client.sendMessage(chatId, formattedText);
                console.log(`WhatsApp API response:`, result?.id || 'No ID returned');
                break;
                
            case 'image':
            case 'document':
                if (mediaPath && fs.existsSync(mediaPath)) {
                    const media = MessageMedia.fromFilePath(mediaPath);
                    const caption = text ? formattedText : '';
                    await client.sendMessage(chatId, media, { caption });
                } else {
                    await client.sendMessage(chatId, formattedText);
                }
                break;
                
            case 'list':
                if (buttons && buttons.length > 0) {
                    const listMessage = formattedText + '\n\n' + buttons.map((btn, i) => `${i + 1}. ${btn}`).join('\n');
                    await client.sendMessage(chatId, listMessage);
                } else {
                    await client.sendMessage(chatId, formattedText);
                }
                break;
                
            case 'buttons':
                if (buttons && buttons.length > 0) {
                    const buttonObjs = buttons.map((btn, i) => {
                        const parts = btn.split('|');
                        const buttonText = parts[0].trim();
                        const buttonUrl = parts[1] ? parts[1].trim() : null;
                        
                        if (buttonUrl) {
                            return {
                                buttonId: `btn_${i}`,
                                buttonText: { displayText: buttonText },
                                type: 1,
                                url: buttonUrl
                            };
                        } else {
                            return {
                                buttonId: `btn_${i}`,
                                buttonText: { displayText: buttonText },
                                type: 1
                            };
                        }
                    }).slice(0, 3);
                    
                    try {
                        await client.sendMessage(chatId, {
                            text: formattedText,
                            buttons: buttonObjs,
                            headerType: 1
                        });
                    } catch (error) {
                        let fallbackMessage = formattedText + '\n\n';
                        buttons.forEach((btn, i) => {
                            const parts = btn.split('|');
                            const buttonText = parts[0].trim();
                            const buttonUrl = parts[1] ? parts[1].trim() : null;
                            
                            if (buttonUrl) {
                                fallbackMessage += `🔗 *${buttonText}*: ${buttonUrl}\n`;
                            } else {
                                fallbackMessage += `▶️ *${buttonText}*\n`;
                            }
                        });
                        await client.sendMessage(chatId, fallbackMessage.trim());
                    }
                } else {
                    await client.sendMessage(chatId, formattedText);
                }
                break;
                
            default:
                await client.sendMessage(chatId, formattedText);
        }
    } catch (error) {
        console.error(`Error sending ${messageType} message to ${chatId}:`, error.message, error.stack);
        throw error;
    }
}

// Default route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Memory usage at startup: ${JSON.stringify(getMemoryUsage(), null, 2)}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    for (const [sessionId, session] of sessions) {
        try {
            await session.client.destroy();
            console.log(`Session ${sessionId} destroyed`);
        } catch (error) {
            console.error(`Error destroying session ${sessionId}:`, error);
        }
    }
    process.exit(0);
});
