#!/bin/bash

echo "🚀 Starting WhatsApp Bulk Sender..."
echo "📱 Make sure you have your phone ready to scan QR codes"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "🌐 Starting server on http://localhost:5001"
echo "💡 Keep this terminal open while using the application"
echo ""

npm start