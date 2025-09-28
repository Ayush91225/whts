#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting WhatsApp Bulk Sender...\n');

// Start the backend server
const server = spawn('node', ['backend/server.js'], {
    cwd: __dirname,
    stdio: 'inherit'
});

server.on('error', (err) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});

server.on('close', (code) => {
    console.log(`\n📱 Server stopped with code ${code}`);
    process.exit(code);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down WhatsApp Bulk Sender...');
    server.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down WhatsApp Bulk Sender...');
    server.kill('SIGTERM');
});