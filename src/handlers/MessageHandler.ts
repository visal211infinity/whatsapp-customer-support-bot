import { getTelegramGroup, isValidSeries } from "../../config/series.config.js";
import pkg from "whatsapp-web.js";
const { MessageMedia } = pkg;
import type {
  Message as WAMessage,
  Client as WAClient,
  MessageMedia as WAMessageMedia,
} from "whatsapp-web.js";
import fs from "fs";
import path from "path";
import CacheManager from "../utils/CacheManager.js";
import TelegramService from "../telegram/TelegramClient.js";
import DatabaseManager from "../database/DatabaseManager.js";
import { VideoInfo } from "../types";

/**
 * Customer support message handler
 */
class MessageHandler {
  private telegramService: TelegramService;
  private databaseManager: DatabaseManager;
  private activeRequests: Map<string, string>;
  private cacheManager: CacheManager;
  private botId: number;

  constructor(
    telegramService: TelegramService,
    databaseManager: DatabaseManager,
    botId: number
  ) {
    this.telegramService = telegramService;
    this.databaseManager = databaseManager;
    this.botId = botId;
    this.activeRequests = new Map(); // Track active requests per chat
    this.cacheManager = new CacheManager("./temp/cache", {
      maxCacheSize: 1024 * 1024 * 1024, // 1GB
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Run cleanup on initialization
    this.cacheManager.cleanup();
  }

  /**
   * Main message handling logic
   */
  async handle(
    message: WAMessage,
    client: WAClient,
    accountName: string
  ): Promise<void> {
    // Ignore group messages and status updates
    if (message.from === "status@broadcast") return;

    const chatId = message.from;
    const messageText = message.body.trim().toLowerCase();

    console.log(`\n📨 [${accountName}] Message from ${chatId}: ${messageText}`);

    // Get or create user in database
    const user = await this.databaseManager.getOrCreateUser(
      chatId,
      this.botId,
      {
        phoneNumber: chatId.split("@")[0],
        name: (message as any)._data.notifyName || "Unknown",
      }
    );

    // Welcome new users
    if (user.is_new_user && !this.activeRequests.has(chatId)) {
      await this.sendWelcomeMessage(message);
      return;
    }

    // List command - show all available series
    if (messageText === "list" || messageText === "/list") {
      await this.sendSeriesList(message);
      return;
    }

    // Help command
    if (messageText === "help" || messageText === "/help") {
      await this.sendHelpMessage(message);
      return;
    }

    // Check if user is requesting a series
    if (this.isSeriesRequest(messageText)) {
      await this.handleSeriesRequest(messageText, chatId, message, client);
      return;
    }

    // Default response for returning users
    if (!this.activeRequests.has(chatId)) {
      await message.reply(
        "📺 Send a series code (e.g., AB001) to watch.\n\n" +
          'Type "list" to see all available series.\n' +
          'Type "help" for more information.'
      );
    }
  }

  /**
   * Check if message is a series request
   */
  private isSeriesRequest(text: string): boolean {
    // Match pattern like AB001, AB002, etc.
    const seriesPattern = /^[A-Z]{2}\d{3}$/i;
    return seriesPattern.test(text);
  }

  /**
   * Handle series request
   */
  private async handleSeriesRequest(
    seriesCode: string,
    chatId: string,
    message: WAMessage,
    client: WAClient
  ): Promise<void> {
    // Check if already processing a request for this chat
    if (this.activeRequests.has(chatId)) {
      await message.reply(
        "⏳ Please wait, we are still processing your previous request..."
      );
      return;
    }

    const code = seriesCode.toUpperCase();

    // Check if series exists
    if (!isValidSeries(code)) {
      await message.reply(
        `❌ Sorry, series "${code}" not found.\n\n` +
          "Please check the series code and try again."
      );
      return;
    }

    try {
      // Mark as active
      this.activeRequests.set(chatId, code);

      // Get Telegram group username
      const groupUsername = getTelegramGroup(code);
      if (!groupUsername) {
        throw new Error(`No Telegram group found for series ${code}`);
      }

      await message.reply(
        `✅ Found series: ${code}\n\n` +
          "🔍 Fetching videos from our library...\n" +
          "This may take a few moments."
      );

      // Fetch videos from Telegram
      const videos = await this.telegramService.fetchVideosFromGroup(
        groupUsername
      );

      if (videos.length === 0) {
        await message.reply(
          "❌ No videos found for this series.\n\n" +
            "Please contact support if you believe this is an error."
        );
        this.activeRequests.delete(chatId);
        return;
      }

      // Check cache status
      const videoIds = videos.map((v) => v.id.toString());
      const isCached = this.cacheManager.isSeriesCached(code, videoIds);

      if (isCached) {
        await message.reply(
          `📺 Found ${videos.length} video(s)! (Cached ⚡)\n\n` +
            "🚀 Sending videos instantly..."
        );
      } else {
        await message.reply(
          `📺 Found ${videos.length} video(s)!\n\n` +
            "⏳ Downloading and caching for faster future access..."
        );
      }

      // Send videos in order (with caching)
      await this.sendVideosInOrder(videos, chatId, client, code);

      // Update user's request in database
      await this.databaseManager.updateUserRequest(chatId, code);

      await client.sendMessage(
        chatId,
        "✅ All videos sent successfully!\n\n" + "Enjoy watching! 🎬"
      );
    } catch (error) {
      console.error("❌ Error handling series request:", error);
      await message.reply(
        "❌ Sorry, an error occurred while processing your request.\n\n" +
          "Please try again later or contact support."
      );
    } finally {
      // Remove from active requests
      this.activeRequests.delete(chatId);
    }
  }

  /**
   * Send videos to customer in order
   */
  private async sendVideosInOrder(
    videos: VideoInfo[],
    chatId: string,
    client: WAClient,
    seriesCode: string
  ): Promise<void> {
    const tempDir = "./temp";

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const videoNumber = i + 1;
      const videoId = video.id.toString();

      try {
        console.log(
          `📤 Sending video ${videoNumber}/${videos.length} to ${chatId}`
        );

        let filePath: string;

        // Check if video is cached
        const cachedPath = this.cacheManager.getCachedVideo(
          seriesCode,
          videoId
        );

        if (cachedPath) {
          console.log(`   ⚡ Using cached version`);
          filePath = cachedPath;
        } else {
          console.log(`   ⬇️  Downloading from Telegram...`);
          // Download video from Telegram
          filePath = await this.telegramService.downloadVideo(video, tempDir);

          // Cache the video for future use
          console.log(`   💾 Caching video...`);
          this.cacheManager.cacheVideo(seriesCode, videoId, filePath);
        }

        // Create WhatsApp media
        const media = MessageMedia.fromFilePath(filePath);

        // Send to customer with caption
        const caption = video.caption
          ? `📹 Video ${videoNumber}/${videos.length}\n\n${video.caption}`
          : `📹 Video ${videoNumber}/${videos.length}`;

        await client.sendMessage(chatId, media, { caption });

        // Clean up downloaded file (only if not from cache)
        if (!cachedPath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        console.log(
          `✅ Video ${videoNumber}/${videos.length} sent successfully`
        );

        // Small delay between sends to avoid rate limiting
        if (i < videos.length - 1) {
          await this.sleep(2000);
        }
      } catch (error) {
        console.error(`❌ Error sending video ${videoNumber}:`, error);
        await client.sendMessage(
          chatId,
          `⚠️ Error sending video ${videoNumber}. Skipping to next...`
        );
      }
    }

    // Clean up temp directory (not cache)
    this.cleanTempDirectory(tempDir);
  }

  /**
   * Send welcome message to new users
   */
  private async sendWelcomeMessage(message: WAMessage): Promise<void> {
    const welcomeText = `
🎬 *Welcome to Our Video Library!*

Hello! I'm your personal video assistant. Here's how to get started:

*Quick Start:*
📝 Type "list" to see all available series
🎥 Send a series code (e.g., AB001) to watch
❓ Type "help" for detailed instructions

*Example:*
Send: AB001
→ I'll send you all videos from that series!

Let's get started! Type "list" to see what's available. 🚀
    `.trim();

    await message.reply(welcomeText);
  }

  /**
   * Send list of available series
   */
  private async sendSeriesList(message: WAMessage): Promise<void> {
    const { seriesMapping } = await import("../../config/series.config.js");

    const seriesList = Object.keys(seriesMapping)
      .sort()
      .map((code, index) => `${index + 1}. ${code}`)
      .join("\n");

    const listText = `
📺 *Available Series*

${seriesList}

*How to watch:*
Simply send the series code (e.g., ${Object.keys(seriesMapping)[0]})

Total series available: ${Object.keys(seriesMapping).length}
    `.trim();

    await message.reply(listText);
  }

  /**
   * Send help message
   */
  private async sendHelpMessage(message: WAMessage): Promise<void> {
    const helpText = `
📖 *Customer Support Bot - Help*

*Available Commands:*
• list - Show all available series
• help - Show this help message
• [Series Code] - Watch a series (e.g., AB001)

*How to use:*
1. Type "list" to see all available series
2. Send a series code (e.g., AB001) to start watching
3. The bot will send all videos in order
4. Enjoy! 🎬

*Features:*
⚡ Instant delivery for cached series
📹 Videos sent in correct order
🔄 Multi-account support

If you need assistance, please contact our support team.
    `.trim();

    await message.reply(helpText);
  }

  /**
   * Clean temporary directory (only files, not cache subdirectory)
   */
  private cleanTempDirectory(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);

          // Only delete files, skip directories (like cache/)
          if (stat.isFile()) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error cleaning temp directory:", error);
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default MessageHandler;
