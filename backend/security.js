const crypto = require('crypto');
const path = require('path');

// Security configuration
const SECURITY_CONFIG = {
    // File upload limits
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    MAX_CSV_SIZE: 5 * 1024 * 1024,   // 5MB for CSV
    MAX_MEDIA_SIZE: 16 * 1024 * 1024, // 16MB for media
    
    // Allowed file extensions
    ALLOWED_CSV_EXTENSIONS: ['.csv'],
    ALLOWED_MEDIA_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.txt', '.zip', '.rar'],
    
    // Rate limiting
    MAX_SESSIONS_PER_IP: 5,
    MESSAGE_RATE_LIMIT: 100, // messages per minute
    
    // Validation patterns
    PHONE_PATTERN: /^\d{10,15}$/,
    SESSION_ID_PATTERN: /^session_\d+$/,
    
    // Security headers
    SECURITY_HEADERS: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; connect-src 'self' https://unpkg.com"
    }
};

// Sanitize filename to prevent path traversal
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        throw new Error('Invalid filename');
    }
    
    // Remove path separators and dangerous characters
    const sanitized = filename
        .replace(/[\/\\:*?"<>|]/g, '_')
        .replace(/\.\./g, '_')
        .replace(/^\.+/, '')
        .substring(0, 100);
    
    if (!sanitized || sanitized.length === 0) {
        throw new Error('Invalid filename after sanitization');
    }
    
    return sanitized;
}

// Validate file extension
function validateFileExtension(filename, allowedExtensions) {
    if (!filename || !Array.isArray(allowedExtensions)) {
        return false;
    }
    
    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
}

// Validate phone number
function validatePhoneNumber(phone) {
    if (!phone) return false;
    const cleanPhone = phone.toString().replace(/\D/g, '');
    return SECURITY_CONFIG.PHONE_PATTERN.test(cleanPhone);
}

// Validate session ID
function validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
        return false;
    }
    return SECURITY_CONFIG.SESSION_ID_PATTERN.test(sessionId);
}

// Generate secure filename while preserving original name
function generateSecureFilename(originalName) {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const sanitizedBaseName = sanitizeFilename(baseName);
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}_${sanitizedBaseName}_${random}${ext}`;
}

// Validate JSON input safely
function safeJsonParse(jsonString, defaultValue = null) {
    if (!jsonString || typeof jsonString !== 'string') {
        return defaultValue;
    }
    
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn('Invalid JSON input:', error.message);
        return defaultValue;
    }
}

// Security middleware
function securityMiddleware(req, res, next) {
    // Set security headers
    Object.entries(SECURITY_CONFIG.SECURITY_HEADERS).forEach(([header, value]) => {
        res.setHeader(header, value);
    });
    
    // Basic request validation
    if (req.body && typeof req.body === 'object') {
        // Limit request body size is handled by express.json middleware
        next();
    } else {
        next();
    }
}

// File upload validation middleware
function validateFileUpload(req, res, next) {
    if (!req.files) {
        return next();
    }
    
    try {
        // Validate CSV file
        if (req.files.csv) {
            const csvFile = req.files.csv;
            
            if (csvFile.size > SECURITY_CONFIG.MAX_CSV_SIZE) {
                return res.status(400).json({ error: 'CSV file too large' });
            }
            
            if (!validateFileExtension(csvFile.name, SECURITY_CONFIG.ALLOWED_CSV_EXTENSIONS)) {
                return res.status(400).json({ error: 'Invalid CSV file type' });
            }
        }
        
        // Validate media file
        if (req.files.media) {
            const mediaFile = req.files.media;
            
            if (mediaFile.size > SECURITY_CONFIG.MAX_MEDIA_SIZE) {
                return res.status(400).json({ error: 'Media file too large' });
            }
            
            if (!validateFileExtension(mediaFile.name, SECURITY_CONFIG.ALLOWED_MEDIA_EXTENSIONS)) {
                return res.status(400).json({ error: 'Invalid media file type' });
            }
        }
        
        next();
    } catch (error) {
        console.error('File validation error:', error);
        res.status(400).json({ error: 'File validation failed' });
    }
}

module.exports = {
    SECURITY_CONFIG,
    sanitizeFilename,
    validateFileExtension,
    validatePhoneNumber,
    validateSessionId,
    generateSecureFilename,
    safeJsonParse,
    securityMiddleware,
    validateFileUpload
};