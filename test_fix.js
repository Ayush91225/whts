#!/usr/bin/env node

// Simple test to verify the fix
const axios = require('axios');

async function testSendEndpoint() {
    console.log('Testing /send endpoint with saved contacts...');
    
    try {
        // Test with saved contacts (JSON string format)
        const testData = {
            sessionId: 'test_session',
            message: 'Test message',
            recipients: JSON.stringify(['1234567890', '9876543210']),
            campaignName: 'Test Campaign'
        };
        
        console.log('Sending test data:', testData);
        
        // This will fail because no session exists, but we can check if parsing works
        const response = await axios.post('http://localhost:5001/send', testData, {
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('Response:', response.data);
    } catch (error) {
        console.log('Expected error (no session):', error.response?.data || error.message);
        
        // Check if it's the expected error (session not found) rather than parsing error
        if (error.response?.data?.error?.includes('Session not ready') || 
            error.response?.data?.error?.includes('Session ID required')) {
            console.log('✅ Recipients parsing is working correctly!');
        } else {
            console.log('❌ Still has parsing issues:', error.response?.data);
        }
    }
}

if (require.main === module) {
    testSendEndpoint();
}