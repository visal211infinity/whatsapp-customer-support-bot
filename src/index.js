import dotenv from "dotenv";
import WhatsAppManager from "./whatsapp/WhatsAppManager.js";
import TelegramService from "./telegram/TelegramClient.js";
import MessageHandler from "./handlers/MessageHandler.js";
import DatabaseManager from "./database/DatabaseManager.js";

// Load environment variables
dotenv.config();

/**
 * Main application class
 */
class WhatsAppTelegramBot {
  constructor() {
    this.whatsappManager = null;
    this.telegramService = null;
    this.messageHandler = null;
    this.databaseManager = null;
  }

  /**
   * Validate environment variables
   */
  validateConfig() {
    const required = [
      "TELEGRAM_API_ID",
      "TELEGRAM_API_HASH",
      "DB_USER",
      "DB_NAME",
    ];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      console.error(
        "❌ Missing required environment variables:",
        missing.join(", ")
      );
      console.log(
        "\n📝 Please copy .env.example to .env and fill in the values."
      );
      process.exit(1);
    }
  }

  /**
   * Initialize all services
   */
  async initialize() {
    console.log("🚀 Starting WhatsApp-Telegram Customer Support Bot...\n");

    this.validateConfig();

    // Initialize Database
    console.log("═══════════════════════════════════════");
    console.log("  STEP 1: Initialize Database");
    console.log("═══════════════════════════════════════");
    this.databaseManager = new DatabaseManager({
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME,
    });
    await this.databaseManager.initialize();

    // Initialize Telegram service
    console.log("\n═══════════════════════════════════════");
    console.log("  STEP 2: Initialize Telegram Client");
    console.log("═══════════════════════════════════════");
    this.telegramService = new TelegramService(
      process.env.TELEGRAM_API_ID,
      process.env.TELEGRAM_API_HASH,
      process.env.TELEGRAM_SESSION_NAME || "telegram_session"
    );
    await this.telegramService.connect();

    // Initialize message handler
    this.messageHandler = new MessageHandler(
      this.telegramService,
      this.databaseManager
    );

    // Initialize WhatsApp manager
    console.log("\n═══════════════════════════════════════");
    console.log("  STEP 3: Initialize WhatsApp Clients");
    console.log("═══════════════════════════════════════");

    const accountNames = process.env.WHATSAPP_ACCOUNTS
      ? process.env.WHATSAPP_ACCOUNTS.split(",").map((name) => name.trim())
      : ["default"];

    this.whatsappManager = new WhatsAppManager(accountNames);

    // Register message handler
    this.whatsappManager.onMessage((message, client, accountName) => {
      return this.messageHandler.handle(message, client, accountName);
    });

    // Initialize WhatsApp clients
    await this.whatsappManager.initializeAll();

    console.log("\n═══════════════════════════════════════");
    console.log("  ✅ Bot is ready and running!");
    console.log("═══════════════════════════════════════\n");
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log("\n\n🛑 Shutting down gracefully...");

    if (this.telegramService) {
      await this.telegramService.disconnect();
    }

    if (this.whatsappManager) {
      await this.whatsappManager.destroyAll();
    }

    if (this.databaseManager) {
      await this.databaseManager.close();
    }

    console.log("👋 Goodbye!");
    process.exit(0);
  }
}

// Create and start the bot
const bot = new WhatsAppTelegramBot();

// Handle graceful shutdown
process.on("SIGINT", () => bot.shutdown());
process.on("SIGTERM", () => bot.shutdown());

// Start the bot
bot.initialize().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
