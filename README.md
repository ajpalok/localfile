# Local P2P Share

A Next.js-based peer-to-peer file sharing and messaging application for local networks.

## Features

- 🔌 **Device Discovery**: Automatically discover devices on your local network
- 💬 **Real-time Chat**: Send instant messages to connected devices
- 📁 **File Sharing**: Share files of any size with other devices
- 🎭 **Anonymous**: No authentication required - just random device names
- 🔄 **Ephemeral Messages**: Messages are stored only in the UI and disappear on reload
- 🌐 **Local Network Only**: All communication happens within your local network

## How It Works

1. Each device gets a random generated name (e.g., "SwiftFalcon123")
2. The application shows all available devices on your network
3. Select a device to start chatting and sharing files
4. Share your device name verbally so others can identify you
5. Messages are broadcast in real-time but not persisted
6. Files are transferred directly through the WebSocket connection

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

### Running the Application

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Using on Multiple Devices

1. Make sure all devices are connected to the same local network
2. Find your computer's local IP address:
   - Windows: Run `ipconfig` in Command Prompt
   - Mac/Linux: Run `ifconfig` or `ip addr` in Terminal
3. On other devices, open a browser and navigate to `http://[YOUR_IP]:3000`
   - Example: `http://192.168.1.100:3000`

## Usage

### Connecting to Devices

1. Open the app on multiple devices on your local network
2. Each device will show a list of other connected devices
3. Click on a device name to start a conversation

### Sending Messages

1. Type your message in the input field
2. Press Enter or click "Send"
3. Messages appear instantly on both devices
4. **Note**: Messages are not saved - reloading the page will clear all messages

### Sharing Files

1. Click the paperclip/attachment icon
2. Select a file from your device
3. The file metadata (name, size, type) is sent to the recipient
4. Recipient sees a "Download" or "Cancel" button
5. Click "Download" to save the file
6. Click "Cancel" to reject the file transfer

## Technical Details

### Architecture

- **Frontend**: Next.js 15+ with React and TypeScript
- **Backend**: Custom Node.js server with Socket.io
- **Styling**: Tailwind CSS
- **Real-time Communication**: WebSocket (Socket.io)

### File Transfer Process

1. Sender selects a file
2. File is read as ArrayBuffer
3. Split into chunks (1MB each)
4. Metadata sent first, then chunks sequentially
5. Receiver collects chunks and reassembles
6. File downloaded when complete

### Data Storage

- **Device Names**: Stored in browser's localStorage (persists across sessions for the same browser)
- **Messages**: Stored only in React state (cleared on page reload)
- **File Transfers**: Temporary in-memory storage during transfer

## Security Notes

⚠️ **Important**: This application is designed for trusted local networks only.

- No encryption is implemented
- No authentication system
- Anyone on your network can see your device and connect
- Files and messages are transmitted in plain text
- Use only on private, trusted networks

## Browser Compatibility

Works on all modern browsers that support:
- WebSocket API
- File API
- LocalStorage API

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Troubleshooting

### Devices Not Showing Up

- Ensure all devices are on the same WiFi network
- Check if firewall is blocking port 3000
- Try refreshing the page

### Connection Issues

- Verify the server is running (`npm run dev`)
- Check console for error messages
- Ensure WebSocket connections are not blocked by network settings

### File Transfer Fails

- Very large files (>100MB) may have issues
- Check browser console for errors
- Ensure stable network connection

## Customization

### Change Port

Edit `server.js` and modify the `port` variable:

```javascript
const port = 3000; // Change to your preferred port
```

### Modify Device Names

Edit `lib/deviceName.ts` to customize the adjectives and nouns used for random names.

### Adjust File Chunk Size

In `components/ChatInterface.tsx`, modify the `chunkSize` variable:

```typescript
const chunkSize = 1024 * 1024; // 1MB (adjust as needed)
```

## License

[GPL-2.0 license](LICENSE.txt)

## Contributing

Feel free to submit issues and pull requests!

