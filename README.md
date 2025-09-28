# WhatsApp Bulk Sender

A professional WhatsApp marketing tool that allows bulk messaging without using the official WhatsApp API. Uses WhatsApp Web automation with a beautiful, user-friendly interface.

## ✨ Features

- **🔗 Connect via WhatsApp Web** - No API required, uses your existing WhatsApp account
- **📊 Multiple Message Types** - Send text, images, documents, and formatted list messages
- **📱 Multi-Account Support** - Connect multiple WhatsApp accounts for higher volume
- **📈 Real-time Progress Tracking** - Monitor campaign progress with live updates
- **💾 Session Persistence** - Stay logged in between restarts
- **🎯 CSV Contact Management** - Upload and manage contact lists easily
- **📋 Rich Media Support** - Send images (JPG, PNG), documents (PDF, DOC, TXT, etc.)
- **⚡ Smart Rate Limiting** - Built-in delays to avoid WhatsApp blocking
- **📊 Campaign Reports** - Track sent/failed messages and performance
- **🎨 WhatsApp-themed UI** - Familiar green interface design

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- A WhatsApp account

### Installation

1. **Clone or download this project**
```bash
git clone <repository-url>
cd whatsapp-bulk-sender
```

2. **Install dependencies**
```bash
npm install
```

3. **Start the application**
```bash
npm start
```

4. **Open your browser**
Navigate to `http://localhost:5000`

## 📖 How to Use

### 1. Connect WhatsApp Account
- Click on "Accounts" in the sidebar
- Click "Add Account" 
- Scan the QR code with your WhatsApp mobile app
- Go to WhatsApp → Menu → Linked Devices → Link a Device

### 2. Prepare Your Contact List
Create a CSV file with phone numbers:
```csv
number,name
1234567890,John Doe
9876543210,Jane Smith
```
**Important:** Phone numbers should be in international format without the + sign.

### 3. Create a Campaign
- Click "Campaigns" in the sidebar
- Click "New Campaign"
- Upload your CSV file
- (Optional) Upload media files (images/documents)
- Select message type and WhatsApp account
- Write your message with formatting:
  - `*Bold text*` for **bold**
  - `_Italic text_` for *italic*
  - `~Strikethrough~` for ~~strikethrough~~
- Click "Send Campaign"

### 4. Monitor Progress
- View real-time sending progress
- Check reports for campaign statistics
- Monitor failed/successful deliveries

## 📁 CSV Format

Your CSV file should have a column named `number`, `phone`, or `mobile`:

```csv
number,name,company
1234567890,John Doe,ABC Corp
9876543210,Jane Smith,XYZ Ltd
5555551234,Bob Johnson,Tech Inc
```

## 💬 Message Types

### Text Messages
Simple text messages with WhatsApp formatting support.

### Image Messages
Send images with optional captions. Supported formats:
- JPG, JPEG, PNG
- Maximum size: 5MB

### Document Messages
Send documents and files. Supported formats:
- PDF, DOC, DOCX, TXT, XLS, XLSX
- Maximum size: 16MB

### List Messages
Create numbered lists in your messages:
```
*Special Offers:*
1. 50% off on Product A
2. Buy 2 Get 1 Free on Product B
3. Free shipping on orders over $100
```

## ⚙️ Configuration

### Rate Limiting
- Default delay: 2-4 seconds between messages
- Configurable in `backend/server.js`
- Helps prevent WhatsApp blocking

### File Size Limits
- Images: 5MB maximum
- Documents: 16MB maximum
- Configurable in security settings

### Session Management
- Sessions persist between restarts
- Stored in `.wwebjs_auth/` directory
- Automatic reconnection on startup

## 🔒 Security Features

- Input validation and sanitization
- File type restrictions
- Rate limiting protection
- Secure file handling
- XSS protection

## 📊 Performance

- Batch processing for large lists
- Memory usage monitoring
- Background job processing
- Progress tracking and reporting

## 🛠️ Troubleshooting

### Common Issues

**QR Code not appearing:**
- Wait a few seconds and try again
- Refresh the page
- Check console for errors

**Messages not sending:**
- Verify WhatsApp account is connected
- Check phone number format (no + sign)
- Ensure stable internet connection

**High memory usage:**
- Restart the application
- Use smaller batch sizes
- Monitor system resources

### Error Messages

**"Session not ready"**
- Reconnect your WhatsApp account
- Scan QR code again

**"CSV must contain number column"**
- Ensure CSV has 'number', 'phone', or 'mobile' column
- Check CSV format and encoding

**"Rate limit exceeded"**
- Wait before sending another campaign
- Reduce sending frequency

## 📝 File Structure

```
whatsapp-bulk-sender/
├── backend/
│   ├── server.js          # Main server file
│   ├── security.js        # Security utilities
│   ├── performance.js     # Performance monitoring
│   └── uploads/           # Temporary file storage
├── frontend/
│   └── index.html         # Web interface
├── .wwebjs_auth/          # WhatsApp session data
├── package.json
└── README.md
```

## 🔧 Advanced Configuration

### Environment Variables
```bash
PORT=5000                  # Server port
MAX_FILE_SIZE=50MB        # Maximum upload size
RATE_LIMIT=100            # Requests per hour
```

### Custom Delays
Edit `backend/server.js`:
```javascript
// Change delay between messages (milliseconds)
await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds
```

## ⚠️ Important Notes

- **Compliance:** Use responsibly and comply with WhatsApp's Terms of Service
- **Rate Limits:** Don't send too many messages too quickly to avoid blocking
- **Phone Numbers:** Use international format without + (e.g., 1234567890)
- **File Sizes:** Respect WhatsApp's file size limitations
- **Legal:** Ensure you have permission to message your contacts

## 🆘 Support

If you encounter issues:

1. Check the console for error messages
2. Verify your CSV format
3. Ensure WhatsApp account is properly connected
4. Check internet connection
5. Restart the application

## 📄 License

This project is for educational purposes. Use responsibly and in compliance with WhatsApp's Terms of Service and local regulations regarding bulk messaging.

## 🔄 Updates

- v1.0.0: Initial release with full functionality
- Multi-account support
- Real-time progress tracking
- Rich media support
- Professional UI/UX

---

**Disclaimer:** This tool is for educational and legitimate business purposes only. Users are responsible for complying with WhatsApp's Terms of Service and applicable laws regarding bulk messaging and data privacy.