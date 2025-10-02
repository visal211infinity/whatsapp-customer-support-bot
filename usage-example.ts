/**
 * USAGE EXAMPLE - How to use WhatsApp-Telegram Bot in your central project
 *
 * Copy whatsapp-telegram-bot.ts to your central project and import it like this:
 */

import { WhatsAppTelegramBot, BotConfig } from "./whatsapp-telegram-bot";
// OR if you put it in a services folder:
// import { WhatsAppTelegramBot, BotConfig } from './services/whatsapp-telegram-bot';

// ============================================================================
// CONFIGURATION
// ============================================================================

const botConfig: BotConfig = {
  // Bot ID from your central system
  botId: 1,

  // Telegram API credentials (get from https://my.telegram.org)
  telegramApiId: process.env.TELEGRAM_API_ID!,
  telegramApiHash: process.env.TELEGRAM_API_HASH!,

  // Optional: Telegram session string (save this after first login to skip re-authentication)
  telegramSessionString: process.env.TELEGRAM_SESSION_STRING,

  // Database configuration
  databaseConfig: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME!,
  },

  // Optional: WhatsApp accounts (defaults to ['default'])
  whatsappAccounts: process.env.WHATSAPP_ACCOUNTS?.split(",") || ["default"],

  // Series mapping - Map series codes to Telegram group usernames
  seriesMapping: {
    AB001: "wbsd06",
    AB002: "wbsd07",
    AB003: "wbsd08",
    // Add more mappings...
  },

  // Optional: Cache configuration
  cacheConfig: {
    directory: "./temp/cache",
    maxCacheSize: 1024 * 1024 * 1024, // 1GB
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
};

// ============================================================================
// START THE BOT
// ============================================================================

async function main() {
  const bot = new WhatsAppTelegramBot(botConfig);

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    await bot.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await bot.stop();
    process.exit(0);
  });

  // Start the bot
  try {
    await bot.start();
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// ============================================================================
// ALTERNATIVE: Use as a service in your central project
// ============================================================================

export class WhatsAppBotService {
  private bot: WhatsAppTelegramBot;
  private isRunning: boolean = false;

  constructor(config: BotConfig) {
    this.bot = new WhatsAppTelegramBot(config);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("⚠️  Bot is already running");
      return;
    }

    await this.bot.start();
    this.isRunning = true;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log("⚠️  Bot is not running");
      return;
    }

    await this.bot.stop();
    this.isRunning = false;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

// Usage in your central project:
// import { WhatsAppBotService } from './services/whatsapp-bot-service';
//
// const botService = new WhatsAppBotService(botConfig);
// await botService.start();
