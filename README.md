# WhatsApp-Telegram Customer Support Bot

A multi-account WhatsApp customer support bot that integrates with Telegram to deliver video content from Telegram groups to WhatsApp users.

## 🌟 Features

- **Multi-Account Support**: Run multiple WhatsApp accounts concurrently
- **Telegram Integration**: Fetch videos from Telegram groups
- **Series Management**: Map series codes to Telegram groups
- **Sequential Delivery**: Send videos in order to customers
- **Smart Caching**: Intelligent cache system with LRU eviction (1GB, 7-day TTL)
- **Instant Delivery**: Cached series delivered instantly ⚡
- **Clean Architecture**: Easy to maintain and extend

## 📋 Prerequisites

- Node.js 18 or higher
- WhatsApp account(s)
- Telegram API credentials ([Get here](https://my.telegram.org))

## 🚀 Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
# Get these from https://my.telegram.org
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# Optional: Multiple WhatsApp accounts (comma-separated)
WHATSAPP_ACCOUNTS=support1,support2
```

### 3. Configure Series Mapping

Edit `config/series.config.js` to map series codes to Telegram groups:

```javascript
export const seriesMapping = {
  AB001: "wbsd06", // Maps AB001 to t.me/wbsd06
  AB002: "wbsd07",
  AB003: "wbsd08",
  // Add more mappings...
};
```

### 4. Run the Bot

```bash
pnpm start
```

Or for development with auto-reload:

```bash
pnpm run dev
```

## 📖 Usage

### First Time Setup

1. **Telegram Login**: On first run, you'll be prompted to log in to Telegram:

   - Enter your phone number
   - Enter the verification code sent to your Telegram app
   - Enter your 2FA password (if enabled)

2. **WhatsApp Login**: Scan the QR code(s) with WhatsApp for each account

### Customer Interaction

Customers can interact with the bot by sending:

1. **Series Code**: Send a series code (e.g., `AB001`) to receive all videos
2. **Help**: Send `help` to get usage instructions

### Example Flow

```
Customer: AB001

Bot: ✅ Found series: AB001
     🔍 Fetching videos from our library...

Bot: 📺 Found 10 video(s)!
     ⏳ Starting to send videos in order...

[Bot sends all videos sequentially]

Bot: ✅ All videos sent successfully!
     Enjoy watching! 🎬
```

## 🏗️ Project Structure

```
whatsapp/
├── config/
│   └── series.config.js       # Series to Telegram group mapping
├── src/
│   ├── telegram/
│   │   └── TelegramClient.js  # Telegram service for fetching videos
│   ├── whatsapp/
│   │   └── WhatsAppManager.js # Multi-account WhatsApp manager
│   ├── handlers/
│   │   └── MessageHandler.js  # Customer message handling logic
│   └── index.js               # Main application entry point
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## 🔧 Configuration

### Adding More Series

Edit `config/series.config.js`:

```javascript
export const seriesMapping = {
  AB001: "wbsd06",
  AB002: "wbsd07",
  NEW001: "new_group_username", // Add new mapping
};
```

### Multiple WhatsApp Accounts

In `.env`, specify multiple accounts:

```env
WHATSAPP_ACCOUNTS=support1,support2,support3
```

Each account will:

- Have its own QR code for authentication
- Store separate session data
- Handle messages independently

## 🛠️ Maintenance

### Session Data

- **Telegram**: Stored in `telegram_session.json`
- **WhatsApp**: Stored in `.wwebjs_auth/` directory

### Smart Caching System

The bot uses an intelligent caching system for blazing-fast delivery:

- **Cache Location**: `temp/cache/{series_code}/`
- **Max Size**: 1GB (configurable)
- **TTL**: 7 days (configurable)
- **Eviction**: LRU (Least Recently Used)

**How it works:**

1. First request: Downloads and caches all videos
2. Subsequent requests: Instant delivery from cache ⚡
3. Auto-cleanup: Removes old/least-used series when cache is full

**Benefits:**

- 🚀 10-50x faster for cached series
- 💾 Saves Telegram bandwidth
- 🎯 Smart eviction keeps popular series

**Configure in** `src/handlers/MessageHandler.js`:

```javascript
this.cacheManager = new CacheManager("./temp/cache", {
  maxCacheSize: 1024 * 1024 * 1024, // 1GB
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

### Temporary Files

- Downloaded videos are stored in `temp/` directory (transient)
- Cached videos in `temp/cache/` (persistent with auto-cleanup)
- Files are automatically managed by the cache system

### Logs

The bot outputs detailed logs for:

- Client initialization
- Message handling
- Video fetching and sending
- Errors and warnings

## 🔒 Security

- Never commit `.env` file or session data
- Keep API credentials secure
- Regularly update dependencies
- Use environment variables for sensitive data

## 📝 Notes

- Videos are sent in chronological order (oldest first)
- Large videos may take time to download and send
- Rate limiting is applied to avoid WhatsApp blocks
- The bot ignores group messages and status updates

## 🐛 Troubleshooting

### Telegram Connection Issues

1. Verify API credentials at https://my.telegram.org
2. Delete `telegram_session.json` and re-authenticate
3. Check internet connection

### WhatsApp QR Code Not Showing

1. Clear `.wwebjs_auth/` directory
2. Restart the bot
3. Ensure no other WhatsApp Web sessions are active

### Videos Not Sending

1. Check Telegram group permissions
2. Verify series code mapping
3. Ensure sufficient disk space for temp files

## 📄 License

MIT

## 🤝 Support

For issues or questions, please open an issue on the repository.
