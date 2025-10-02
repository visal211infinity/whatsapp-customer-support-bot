/**
 * WhatsApp-Telegram Bot Service
 * Consolidated TypeScript module for integration into central project
 *
 * @module whatsapp-telegram-bot
 * @version 1.0.0
 */

import {
  Client,
  LocalAuth,
  MessageMedia,
  Message as WAMessage,
} from "whatsapp-web.js";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import qrcode from "qrcode-terminal";
import { Pool, PoolConfig } from "pg";
import fs from "fs";
import path from "path";
import input from "input";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface BotConfig {
  botId: number;
  telegramApiId: string;
  telegramApiHash: string;
  telegramSessionString?: string;
  databaseConfig: PoolConfig;
  whatsappAccounts?: string[];
  seriesMapping: Record<string, string>;
  cacheConfig?: {
    directory?: string;
    maxCacheSize?: number;
    maxAge?: number;
  };
}

interface ChatUser {
  id: number;
  chat_id: string;
  bot_id: number;
  phone_number: string | null;
  name: string | null;
  is_new_user: boolean;
  last_series_requested: string | null;
  total_requests: number;
  created_at: Date;
  updated_at: Date;
  isReturning?: boolean;
}

interface VideoInfo {
  id: number;
  caption: string | null;
  filePath?: string;
}

interface CacheMetadata {
  [seriesCode: string]: {
    files: string[];
    lastAccessed: number;
    size: number;
  };
}

// ============================================================================
// DATABASE MANAGER
// ============================================================================

class DatabaseManager {
  private pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool({
      host: config.host || "localhost",
      port: config.port || 5432,
      user: config.user,
      password: config.password || "",
      database: config.database,
    });

    this.pool.on("error", (err) => {
      console.error("❌ Unexpected database error:", err);
    });
  }

  async initialize(): Promise<void> {
    try {
      console.log("🔧 Initializing database tables...");

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS chat_users (
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
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_id ON chat_users(chat_id)
      `);

      console.log("✅ Database tables initialized");
    } catch (error) {
      console.error("❌ Database initialization error:", error);
      throw error;
    }
  }

  async getOrCreateUser(
    chatId: string,
    botId: number,
    userData: { phoneNumber?: string; name?: string } = {}
  ): Promise<ChatUser> {
    try {
      const checkResult = await this.pool.query(
        "SELECT * FROM chat_users WHERE chat_id = $1",
        [chatId]
      );

      if (checkResult.rows.length > 0) {
        const user = checkResult.rows[0];

        await this.pool.query(
          `UPDATE chat_users 
           SET updated_at = CURRENT_TIMESTAMP,
               is_new_user = false
           WHERE chat_id = $1`,
          [chatId]
        );

        return {
          ...user,
          is_new_user: user.is_new_user,
          isReturning: !user.is_new_user,
        };
      }

      const insertResult = await this.pool.query(
        `INSERT INTO chat_users (chat_id, bot_id, phone_number, name, is_new_user)
         VALUES ($1, $2, $3, $4, true)
         RETURNING *`,
        [chatId, botId, userData.phoneNumber || null, userData.name || null]
      );

      const newUser = insertResult.rows[0];
      return {
        ...newUser,
        isReturning: false,
      };
    } catch (error) {
      console.error("❌ Error getting/creating user:", error);
      throw error;
    }
  }

  async updateUserRequest(chatId: string, seriesCode: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE chat_users 
         SET last_series_requested = $1,
             total_requests = total_requests + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE chat_id = $2`,
        [seriesCode, chatId]
      );
    } catch (error) {
      console.error("❌ Error updating user request:", error);
    }
  }

  async getUserStats(chatId: string): Promise<any> {
    try {
      const result = await this.pool.query(
        `SELECT 
          chat_id,
          bot_id,
          total_requests,
          last_series_requested,
          created_at,
          updated_at
         FROM chat_users
         WHERE chat_id = $1`,
        [chatId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error("❌ Error getting user stats:", error);
      return null;
    }
  }

  async getTotalUsers(): Promise<number> {
    try {
      const result = await this.pool.query(
        "SELECT COUNT(*) as count FROM chat_users"
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error("❌ Error getting total users:", error);
      return 0;
    }
  }

  async getNewUsersToday(): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count 
         FROM chat_users 
         WHERE DATE(created_at) = CURRENT_DATE`
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error("❌ Error getting new users today:", error);
      return 0;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    console.log("👋 Database connection closed");
  }
}

// ============================================================================
// CACHE MANAGER
// ============================================================================

class CacheManager {
  private cacheDir: string;
  private maxCacheSize: number;
  private maxAge: number;
  private metadataFile: string;

  constructor(
    cacheDir: string,
    options: { maxCacheSize?: number; maxAge?: number } = {}
  ) {
    this.cacheDir = cacheDir;
    this.maxCacheSize = options.maxCacheSize || 1024 * 1024 * 1024; // 1GB
    this.maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.metadataFile = path.join(this.cacheDir, "metadata.json");

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private loadMetadata(): CacheMetadata {
    try {
      if (fs.existsSync(this.metadataFile)) {
        const data = fs.readFileSync(this.metadataFile, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.error("⚠️  Error loading cache metadata:", error);
    }
    return {};
  }

  private saveMetadata(metadata: CacheMetadata): void {
    try {
      fs.writeFileSync(
        this.metadataFile,
        JSON.stringify(metadata, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.error("⚠️  Error saving cache metadata:", error);
    }
  }

  private getDirectorySize(dirPath: string): number {
    let size = 0;
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        files.forEach((file) => {
          const filePath = path.join(dirPath, file);
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            size += stats.size;
          }
        });
      }
    } catch (error) {
      console.error("⚠️  Error calculating directory size:", error);
    }
    return size;
  }

  getCachedVideo(seriesCode: string, videoId: string): string | null {
    const seriesDir = path.join(this.cacheDir, seriesCode);
    const cachedPath = path.join(seriesDir, `${videoId}.mp4`);

    if (fs.existsSync(cachedPath)) {
      const metadata = this.loadMetadata();
      if (metadata[seriesCode]) {
        metadata[seriesCode].lastAccessed = Date.now();
        this.saveMetadata(metadata);
      }
      return cachedPath;
    }

    return null;
  }

  cacheVideo(seriesCode: string, videoId: string, sourcePath: string): void {
    try {
      const seriesDir = path.join(this.cacheDir, seriesCode);

      if (!fs.existsSync(seriesDir)) {
        fs.mkdirSync(seriesDir, { recursive: true });
      }

      const cachedPath = path.join(seriesDir, `${videoId}.mp4`);
      fs.copyFileSync(sourcePath, cachedPath);

      const metadata = this.loadMetadata();
      if (!metadata[seriesCode]) {
        metadata[seriesCode] = {
          files: [],
          lastAccessed: Date.now(),
          size: 0,
        };
      }

      if (!metadata[seriesCode].files.includes(videoId)) {
        metadata[seriesCode].files.push(videoId);
      }

      metadata[seriesCode].lastAccessed = Date.now();
      metadata[seriesCode].size = this.getDirectorySize(seriesDir);

      this.saveMetadata(metadata);
      this.enforceCache();
    } catch (error) {
      console.error("⚠️  Error caching video:", error);
    }
  }

  isSeriesCached(seriesCode: string, videoIds: string[]): boolean {
    const metadata = this.loadMetadata();
    const cachedSeries = metadata[seriesCode];

    if (!cachedSeries) return false;

    return videoIds.every((id) => cachedSeries.files.includes(id));
  }

  private enforceCache(): void {
    const metadata = this.loadMetadata();
    let totalSize = Object.values(metadata).reduce(
      (sum, series) => sum + series.size,
      0
    );

    const now = Date.now();
    const seriesToRemove: string[] = [];

    for (const [seriesCode, seriesData] of Object.entries(metadata)) {
      if (now - seriesData.lastAccessed > this.maxAge) {
        seriesToRemove.push(seriesCode);
      }
    }

    seriesToRemove.forEach((code) => this.removeSeries(code));

    const sortedSeries = Object.entries(metadata).sort(
      ([, a], [, b]) => a.lastAccessed - b.lastAccessed
    );

    for (const [seriesCode] of sortedSeries) {
      if (totalSize <= this.maxCacheSize) break;

      const seriesSize = metadata[seriesCode]?.size || 0;
      this.removeSeries(seriesCode);
      totalSize -= seriesSize;
    }
  }

  private removeSeries(seriesCode: string): void {
    try {
      const seriesDir = path.join(this.cacheDir, seriesCode);

      if (fs.existsSync(seriesDir)) {
        fs.rmSync(seriesDir, { recursive: true, force: true });
        console.log(`🗑️  Removed cached series: ${seriesCode}`);
      }

      const metadata = this.loadMetadata();
      delete metadata[seriesCode];
      this.saveMetadata(metadata);
    } catch (error) {
      console.error(`⚠️  Error removing series ${seriesCode}:`, error);
    }
  }

  cleanup(): void {
    console.log("🧹 Running cache cleanup...");
    this.enforceCache();
  }
}

// ============================================================================
// TELEGRAM CLIENT
// ============================================================================

class TelegramService {
  private client: TelegramClient;
  private apiId: string;
  private apiHash: string;
  private sessionString: string;

  constructor(apiId: string, apiHash: string, sessionString?: string) {
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.sessionString = sessionString || "";
    this.client = new TelegramClient(
      new StringSession(this.sessionString),
      parseInt(this.apiId),
      this.apiHash,
      {
        connectionRetries: 5,
      }
    );
  }

  async connect(): Promise<string> {
    console.log("🔗 Connecting to Telegram...");

    await this.client.start({
      phoneNumber: async () =>
        await input.text("Please enter your phone number: "),
      password: async () => await input.text("Please enter your password: "),
      phoneCode: async () =>
        await input.text("Please enter the code you received: "),
      onError: (err) => console.error("Telegram error:", err),
    });

    console.log("✅ Connected to Telegram");
    const sessionString = (this.client.session as StringSession).save();
    return sessionString;
  }

  async fetchVideosFromGroup(groupUsername: string): Promise<VideoInfo[]> {
    try {
      console.log(`📥 Fetching videos from @${groupUsername}...`);

      const entity = await this.client.getEntity(groupUsername);
      const messages = await this.client.getMessages(entity, {
        limit: 100,
      });

      const videos = messages
        .filter((msg: any) => msg.media?.video)
        .reverse()
        .map((msg: any) => ({
          id: msg.id,
          caption: msg.message || null,
        }));

      console.log(`✅ Found ${videos.length} videos in @${groupUsername}`);
      return videos;
    } catch (error) {
      console.error(`❌ Error fetching videos from @${groupUsername}:`, error);
      throw error;
    }
  }

  async downloadVideo(
    videoInfo: VideoInfo,
    outputDir: string
  ): Promise<string> {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, `${videoInfo.id}.mp4`);
      const messages = await this.client.getMessages("me", {
        ids: [videoInfo.id],
      });

      if (messages.length === 0 || !messages[0].media) {
        throw new Error("Video not found");
      }

      const buffer = await this.client.downloadMedia(messages[0].media, {});
      fs.writeFileSync(outputPath, buffer as Buffer);

      return outputPath;
    } catch (error) {
      console.error(`❌ Error downloading video ${videoInfo.id}:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    console.log("👋 Disconnected from Telegram");
  }
}

// ============================================================================
// WHATSAPP MANAGER
// ============================================================================

class WhatsAppManager {
  private clients: Map<string, Client> = new Map();
  private accountNames: string[];
  private messageHandler?: (
    message: WAMessage,
    client: Client,
    accountName: string
  ) => Promise<void>;

  constructor(accountNames: string[]) {
    this.accountNames = accountNames;
  }

  onMessage(
    handler: (
      message: WAMessage,
      client: Client,
      accountName: string
    ) => Promise<void>
  ): void {
    this.messageHandler = handler;
  }

  async initializeAll(): Promise<void> {
    const initPromises = this.accountNames.map((name) =>
      this.initializeClient(name)
    );
    await Promise.all(initPromises);
  }

  private async initializeClient(accountName: string): Promise<void> {
    console.log(`\n📱 Initializing WhatsApp client: ${accountName}`);

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: accountName }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    client.on("qr", (qr) => {
      console.log(`\n🔐 QR Code for ${accountName}:`);
      qrcode.generate(qr, { small: true });
    });

    client.on("ready", () => {
      console.log(`✅ ${accountName} is ready!`);
    });

    client.on("authenticated", () => {
      console.log(`🔓 ${accountName} authenticated`);
    });

    client.on("auth_failure", (msg) => {
      console.error(`❌ ${accountName} authentication failed:`, msg);
    });

    client.on("disconnected", (reason) => {
      console.log(`📴 ${accountName} disconnected:`, reason);
    });

    if (this.messageHandler) {
      client.on("message", async (message) => {
        if (this.messageHandler) {
          await this.messageHandler(message, client, accountName);
        }
      });
    }

    await client.initialize();
    this.clients.set(accountName, client);
  }

  getClient(accountName: string): Client | undefined {
    return this.clients.get(accountName);
  }

  async destroyAll(): Promise<void> {
    for (const [name, client] of this.clients.entries()) {
      console.log(`📴 Destroying ${name}...`);
      await client.destroy();
    }
    this.clients.clear();
  }
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

class MessageHandler {
  private telegramService: TelegramService;
  private databaseManager: DatabaseManager;
  private seriesMapping: Record<string, string>;
  private activeRequests: Map<string, string> = new Map();
  private cacheManager: CacheManager;
  private botId: number;

  constructor(
    telegramService: TelegramService,
    databaseManager: DatabaseManager,
    seriesMapping: Record<string, string>,
    botId: number,
    cacheConfig: {
      directory?: string;
      maxCacheSize?: number;
      maxAge?: number;
    } = {}
  ) {
    this.telegramService = telegramService;
    this.databaseManager = databaseManager;
    this.seriesMapping = seriesMapping;
    this.botId = botId;
    this.cacheManager = new CacheManager(
      cacheConfig.directory || "./temp/cache",
      {
        maxCacheSize: cacheConfig.maxCacheSize || 1024 * 1024 * 1024,
        maxAge: cacheConfig.maxAge || 7 * 24 * 60 * 60 * 1000,
      }
    );

    this.cacheManager.cleanup();
  }

  async handle(
    message: WAMessage,
    client: Client,
    accountName: string
  ): Promise<void> {
    if (message.from === "status@broadcast") return;

    const chatId = message.from;
    const messageText = message.body.trim().toLowerCase();

    console.log(`\n📨 [${accountName}] Message from ${chatId}: ${messageText}`);

    const user = await this.databaseManager.getOrCreateUser(
      chatId,
      this.botId,
      {
        phoneNumber: chatId.split("@")[0],
        name: (message as any)._data.notifyName || "Unknown",
      }
    );

    if (user.is_new_user && !this.activeRequests.has(chatId)) {
      await this.sendWelcomeMessage(message);
      return;
    }

    if (messageText === "list" || messageText === "/list") {
      await this.sendSeriesList(message);
      return;
    }

    if (messageText === "help" || messageText === "/help") {
      await this.sendHelpMessage(message);
      return;
    }

    if (this.isSeriesRequest(messageText)) {
      await this.handleSeriesRequest(messageText, chatId, message, client);
      return;
    }

    if (!this.activeRequests.has(chatId)) {
      await message.reply(
        "📺 Send a series code (e.g., AB001) to watch.\n\n" +
          'Type "list" to see all available series.\n' +
          'Type "help" for more information.'
      );
    }
  }

  private isSeriesRequest(text: string): boolean {
    const seriesPattern = /^[A-Z]{2}\d{3}$/i;
    return seriesPattern.test(text);
  }

  private isValidSeries(code: string): boolean {
    return code.toUpperCase() in this.seriesMapping;
  }

  private getTelegramGroup(code: string): string {
    return this.seriesMapping[code.toUpperCase()];
  }

  private async handleSeriesRequest(
    seriesCode: string,
    chatId: string,
    message: WAMessage,
    client: Client
  ): Promise<void> {
    if (this.activeRequests.has(chatId)) {
      await message.reply(
        "⏳ Please wait, we are still processing your previous request..."
      );
      return;
    }

    const code = seriesCode.toUpperCase();

    if (!this.isValidSeries(code)) {
      await message.reply(
        `❌ Sorry, series "${code}" not found.\n\n` +
          "Please check the series code and try again."
      );
      return;
    }

    try {
      this.activeRequests.set(chatId, code);

      const groupUsername = this.getTelegramGroup(code);

      await message.reply(
        `✅ Found series: ${code}\n\n` +
          "🔍 Fetching videos from our library...\n" +
          "This may take a few moments."
      );

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

      await this.sendVideosInOrder(videos, chatId, client, code);

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
      this.activeRequests.delete(chatId);
    }
  }

  private async sendVideosInOrder(
    videos: VideoInfo[],
    chatId: string,
    client: Client,
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

        const cachedPath = this.cacheManager.getCachedVideo(
          seriesCode,
          videoId
        );

        if (cachedPath) {
          console.log(`   ⚡ Using cached version`);
          filePath = cachedPath;
        } else {
          console.log(`   ⬇️  Downloading from Telegram...`);
          filePath = await this.telegramService.downloadVideo(video, tempDir);

          console.log(`   💾 Caching video...`);
          this.cacheManager.cacheVideo(seriesCode, videoId, filePath);
        }

        const media = MessageMedia.fromFilePath(filePath);

        const caption = video.caption
          ? `📹 Video ${videoNumber}/${videos.length}\n\n${video.caption}`
          : `📹 Video ${videoNumber}/${videos.length}`;

        await client.sendMessage(chatId, media, { caption });

        if (!cachedPath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        console.log(
          `✅ Video ${videoNumber}/${videos.length} sent successfully`
        );

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

    this.cleanTempDirectory(tempDir);
  }

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

  private async sendSeriesList(message: WAMessage): Promise<void> {
    const seriesList = Object.keys(this.seriesMapping)
      .sort()
      .map((code, index) => `${index + 1}. ${code}`)
      .join("\n");

    const listText = `
📺 *Available Series*

${seriesList}

*How to watch:*
Simply send the series code (e.g., ${Object.keys(this.seriesMapping)[0]})

Total series available: ${Object.keys(this.seriesMapping).length}
    `.trim();

    await message.reply(listText);
  }

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

  private cleanTempDirectory(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);

          if (stat.isFile()) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error cleaning temp directory:", error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// MAIN BOT CLASS
// ============================================================================

export class WhatsAppTelegramBot {
  private config: BotConfig;
  private whatsappManager?: WhatsAppManager;
  private telegramService?: TelegramService;
  private messageHandler?: MessageHandler;
  private databaseManager?: DatabaseManager;

  constructor(config: BotConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    console.log("🚀 Starting WhatsApp-Telegram Bot...\n");

    // Initialize Database
    console.log("═══════════════════════════════════════");
    console.log("  STEP 1: Initialize Database");
    console.log("═══════════════════════════════════════");
    this.databaseManager = new DatabaseManager(this.config.databaseConfig);
    await this.databaseManager.initialize();

    // Initialize Telegram service
    console.log("\n═══════════════════════════════════════");
    console.log("  STEP 2: Initialize Telegram Client");
    console.log("═══════════════════════════════════════");
    this.telegramService = new TelegramService(
      this.config.telegramApiId,
      this.config.telegramApiHash,
      this.config.telegramSessionString
    );
    const sessionString = await this.telegramService.connect();
    console.log("💾 Telegram session string:", sessionString);

    // Initialize message handler
    this.messageHandler = new MessageHandler(
      this.telegramService,
      this.databaseManager,
      this.config.seriesMapping,
      this.config.botId,
      this.config.cacheConfig
    );

    // Initialize WhatsApp manager
    console.log("\n═══════════════════════════════════════");
    console.log("  STEP 3: Initialize WhatsApp Clients");
    console.log("═══════════════════════════════════════");

    const accountNames = this.config.whatsappAccounts || ["default"];
    this.whatsappManager = new WhatsAppManager(accountNames);

    // Register message handler
    this.whatsappManager.onMessage((message, client, accountName) => {
      return this.messageHandler!.handle(message, client, accountName);
    });

    // Initialize WhatsApp clients
    await this.whatsappManager.initializeAll();

    console.log("\n═══════════════════════════════════════");
    console.log("  ✅ Bot is ready and running!");
    console.log("═══════════════════════════════════════\n");
  }

  async stop(): Promise<void> {
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
  }
}

// ============================================================================
// EXPORT FOR EASY USAGE
// ============================================================================

export default WhatsAppTelegramBot;
