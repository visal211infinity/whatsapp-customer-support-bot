# WhatsApp-Telegram Bot - TypeScript Single File Version

A consolidated TypeScript module for integrating WhatsApp-Telegram bot into your central project.

## 📦 What You Get

- **Single TypeScript File**: `whatsapp-telegram-bot.ts` (~1000 lines)
- **Type-Safe**: Full TypeScript support with interfaces and types
- **Easy Integration**: Import and use in your central project
- **All Features**: Database, caching, multi-account support

## 🚀 Quick Start

### Option 1: Copy to Your Central Project

1. Copy `whatsapp-telegram-bot.ts` to your project:

```bash
cp whatsapp-telegram-bot.ts /path/to/your/central-project/services/
```

2. Install dependencies in your central project:

```bash
pnpm add whatsapp-web.js telegram qrcode-terminal input dotenv puppeteer pg
pnpm add -D @types/node @types/pg @types/qrcode-terminal
```

3. Import and use:

```typescript
import { WhatsAppTelegramBot } from "./services/whatsapp-telegram-bot";

const bot = new WhatsAppTelegramBot({
  botId: 1,
  telegramApiId: process.env.TELEGRAM_API_ID!,
  telegramApiHash: process.env.TELEGRAM_API_HASH!,
  databaseConfig: {
    host: "localhost",
    user: "postgres",
    database: "mydb",
  },
  seriesMapping: {
    AB001: "wbsd06",
    AB002: "wbsd07",
  },
});

await bot.start();
```

### Option 2: Build and Use Locally

1. Install dependencies:

```bash
# Rename package-typescript.json to package.json if needed
pnpm install
```

2. Build TypeScript:

```bash
pnpm run build
```

3. The compiled files will be in `dist/` folder

4. Use in your project:

```javascript
const { WhatsAppTelegramBot } = require("./dist/whatsapp-telegram-bot");
```

## 📋 Configuration

### BotConfig Interface

```typescript
interface BotConfig {
  // Required: Bot ID from your central system
  botId: number;

  // Required: Telegram API credentials
  telegramApiId: string;
  telegramApiHash: string;

  // Optional: Telegram session string (saves re-authentication)
  telegramSessionString?: string;

  // Required: PostgreSQL database config
  databaseConfig: {
    host?: string;
    port?: number;
    user: string;
    password?: string;
    database: string;
  };

  // Optional: WhatsApp account names (default: ['default'])
  whatsappAccounts?: string[];

  // Required: Map series codes to Telegram groups
  seriesMapping: Record<string, string>;

  // Optional: Cache configuration
  cacheConfig?: {
    directory?: string; // default: './temp/cache'
    maxCacheSize?: number; // default: 1GB
    maxAge?: number; // default: 7 days
  };
}
```

## 🏗️ Architecture

The single file contains all these classes:

1. **DatabaseManager** - PostgreSQL operations
2. **CacheManager** - Smart video caching with LRU eviction
3. **TelegramService** - Telegram client for fetching videos
4. **WhatsAppManager** - Multi-account WhatsApp management
5. **MessageHandler** - Customer message handling logic
6. **WhatsAppTelegramBot** - Main orchestrator class

## 💡 Usage Examples

### Basic Usage

```typescript
import { WhatsAppTelegramBot } from "./whatsapp-telegram-bot";

const bot = new WhatsAppTelegramBot({
  botId: 1,
  telegramApiId: "12345",
  telegramApiHash: "abc123",
  databaseConfig: {
    user: "postgres",
    database: "mydb",
  },
  seriesMapping: {
    AB001: "wbsd06",
  },
});

// Start the bot
await bot.start();

// Graceful shutdown
process.on("SIGINT", async () => {
  await bot.stop();
  process.exit(0);
});
```

### As a Service Class

```typescript
import { WhatsAppTelegramBot, BotConfig } from "./whatsapp-telegram-bot";

export class WhatsAppBotService {
  private bot: WhatsAppTelegramBot;
  private isRunning = false;

  constructor(config: BotConfig) {
    this.bot = new WhatsAppTelegramBot(config);
  }

  async start() {
    if (this.isRunning) return;
    await this.bot.start();
    this.isRunning = true;
  }

  async stop() {
    if (!this.isRunning) return;
    await this.bot.stop();
    this.isRunning = false;
  }
}
```

### With Express/Fastify

```typescript
import express from "express";
import { WhatsAppTelegramBot } from "./whatsapp-telegram-bot";

const app = express();
const bot = new WhatsAppTelegramBot(config);

app.get("/bot/start", async (req, res) => {
  try {
    await bot.start();
    res.json({ success: true, message: "Bot started" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/bot/stop", async (req, res) => {
  await bot.stop();
  res.json({ success: true, message: "Bot stopped" });
});

app.listen(3000);
```

## 🔧 Development

### Type Checking

```bash
pnpm run type-check
```

### Build

```bash
pnpm run build
```

### Run Example

```bash
pnpm run dev
```

## 📝 Database Schema

The bot automatically creates this table:

```sql
CREATE TABLE chat_users (
  id SERIAL PRIMARY KEY,
  chat_id VARCHAR(255) UNIQUE NOT NULL,
  bot_id INTEGER NOT NULL,
  phone_number VARCHAR(50),
  name VARCHAR(255),
  is_new_user BOOLEAN DEFAULT true,
  last_series_requested VARCHAR(50),
  total_requests INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_id ON chat_users(chat_id);
```

## 🎯 Features

- ✅ **Type-Safe**: Full TypeScript support
- ✅ **Single File**: Easy to copy and integrate
- ✅ **Smart Caching**: LRU cache with 1GB limit, 7-day TTL
- ✅ **Multi-Account**: Support multiple WhatsApp accounts
- ✅ **Database**: PostgreSQL with user tracking
- ✅ **Telegram**: Fetch videos from Telegram groups
- ✅ **Sequential Delivery**: Videos sent in order
- ✅ **Error Handling**: Robust error handling throughout

## 🔒 Environment Variables

Create a `.env` file:

```env
# Telegram
TELEGRAM_API_ID=12345
TELEGRAM_API_HASH=abc123xyz
TELEGRAM_SESSION_STRING=optional_session_string

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_NAME=whatsapp_bot

# WhatsApp (optional)
WHATSAPP_ACCOUNTS=support1,support2

# Bot ID
BOT_ID=1
```

## 📊 Why Single File?

### Pros:

- ✅ Easy to copy to central project
- ✅ No module resolution issues
- ✅ Self-contained
- ✅ Single import statement

### Cons:

- ⚠️ Large file (~1000 lines)
- ⚠️ Less modular than separate files

## 🤝 Integration Patterns

### Pattern 1: Direct Import

```typescript
import { WhatsAppTelegramBot } from "./lib/whatsapp-telegram-bot";
```

### Pattern 2: Service Wrapper

```typescript
import { WhatsAppBotService } from "./services/whatsapp-bot-service";
```

### Pattern 3: Dependency Injection

```typescript
class AppController {
  constructor(private bot: WhatsAppTelegramBot) {}
}
```

## 📄 Files Included

- `whatsapp-telegram-bot.ts` - Main single file (COPY THIS)
- `usage-example.ts` - Usage examples
- `tsconfig.json` - TypeScript config
- `package-typescript.json` - Package dependencies
- `README-TYPESCRIPT.md` - This file

## 🚀 Next Steps

1. Copy `whatsapp-telegram-bot.ts` to your central project
2. Install dependencies
3. Configure with your bot ID and credentials
4. Import and use in your application
5. Deploy! 🎉

## 🐛 Troubleshooting

### Type Errors

```bash
pnpm add -D @types/node @types/pg @types/qrcode-terminal
```

### Module Resolution

```typescript
// Use relative import
import { WhatsAppTelegramBot } from "./whatsapp-telegram-bot";
```

### Session Issues

- Delete old session files
- Let bot re-authenticate
- Save the session string for future use

## 📞 Support

For issues or questions about integration into your central project, check the usage examples or open an issue.

---

**Made with ❤️ for easy integration into your central project**
