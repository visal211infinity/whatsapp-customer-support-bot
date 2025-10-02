import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram";
import input from "input";
import fs from "fs";
import path from "path";
import { VideoInfo, SessionData } from "../types";

/**
 * Telegram client wrapper for fetching media from groups
 */
class TelegramService {
  private apiId: number;
  private apiHash: string;
  private sessionName: string;
  private client: TelegramClient | null;
  private sessionString: string;

  constructor(
    apiId: string,
    apiHash: string,
    sessionName: string = "telegram_session"
  ) {
    this.apiId = parseInt(apiId);
    this.apiHash = apiHash;
    this.sessionName = sessionName;
    this.client = null;
    this.sessionString = "";
  }

  /**
   * Load session from file if exists
   */
  private loadSession(): void {
    const sessionFile = `${this.sessionName}.json`;
    if (fs.existsSync(sessionFile)) {
      const data = fs.readFileSync(sessionFile, "utf-8");
      const sessionData: SessionData = JSON.parse(data);
      this.sessionString = sessionData.session;
    }
  }

  /**
   * Save session to file
   */
  private saveSession(): void {
    if (!this.client) return;

    const sessionFile = `${this.sessionName}.json`;
    const sessionData: SessionData = {
      session: (this.client.session as StringSession).save(),
    };
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData));
  }

  /**
   * Initialize and connect to Telegram
   */
  async connect(): Promise<void> {
    console.log("🔌 Connecting to Telegram...");

    this.loadSession();
    const session = new StringSession(this.sessionString);

    this.client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
    });

    await this.client.start({
      phoneNumber: async () =>
        await input.text("Please enter your phone number: "),
      password: async () => await input.text("Please enter your password: "),
      phoneCode: async () =>
        await input.text("Please enter the code you received: "),
      onError: (err: Error) => console.error("❌ Telegram error:", err),
    });

    console.log("✅ Connected to Telegram!");
    this.saveSession();
  }

  /**
   * Fetch all video messages from a Telegram group
   */
  async fetchVideosFromGroup(groupUsername: string): Promise<VideoInfo[]> {
    if (!this.client) {
      throw new Error("Telegram client not connected");
    }

    try {
      console.log(`📥 Fetching videos from group: ${groupUsername}`);

      // Get the entity (group/channel)
      const entity = await this.client.getEntity(groupUsername);

      // Fetch messages
      const messages = await this.client.getMessages(entity, {
        limit: 100, // Adjust based on your needs
      });

      // Filter video messages
      const videos: VideoInfo[] = [];
      for (const message of messages) {
        if (message instanceof Api.Message && message.media && message.video) {
          videos.push({
            id: message.id,
            date: message.date,
            caption: message.message || "",
            video: message.video,
            messageObj: message,
          });
        }
      }

      // Sort by message ID (oldest first for proper order)
      videos.sort((a, b) => a.id - b.id);

      console.log(`✅ Found ${videos.length} videos in group ${groupUsername}`);
      return videos;
    } catch (error: any) {
      console.error(
        `❌ Error fetching videos from ${groupUsername}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Download video from Telegram
   */
  async downloadVideo(
    videoMessage: VideoInfo,
    outputPath: string = "./temp"
  ): Promise<string> {
    if (!this.client) {
      throw new Error("Telegram client not connected");
    }

    try {
      // Create temp directory if it doesn't exist
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      const fileName = `video_${videoMessage.id}_${Date.now()}.mp4`;
      const filePath = path.join(outputPath, fileName);

      console.log(`⬇️  Downloading video ${videoMessage.id}...`);

      // Download the media
      const buffer = await this.client.downloadMedia(videoMessage.messageObj, {
        progressCallback: (
          downloaded: bigInt.BigInteger,
          total: bigInt.BigInteger
        ) => {
          const downloadedNum = Number(downloaded);
          const totalNum = Number(total);
          const percentage = ((downloadedNum / totalNum) * 100).toFixed(2);
          process.stdout.write(`\r   Progress: ${percentage}%`);
        },
      });

      console.log("\n");

      // Save to file
      if (buffer) {
        fs.writeFileSync(filePath, buffer as Buffer);
        console.log(`✅ Video saved to: ${filePath}`);
      }

      return filePath;
    } catch (error: any) {
      console.error(`❌ Error downloading video:`, error.message);
      throw error;
    }
  }

  /**
   * Disconnect from Telegram
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      console.log("👋 Disconnected from Telegram");
    }
  }
}

export default TelegramService;
