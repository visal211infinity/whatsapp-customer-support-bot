import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import fs from "fs";
import path from "path";

/**
 * Telegram client wrapper for fetching media from groups
 */
class TelegramService {
  constructor(apiId, apiHash, sessionName = "telegram_session") {
    this.apiId = parseInt(apiId);
    this.apiHash = apiHash;
    this.sessionName = sessionName;
    this.client = null;
    this.sessionString = "";
  }

  /**
   * Load session from file if exists
   */
  loadSession() {
    const sessionFile = `${this.sessionName}.json`;
    if (fs.existsSync(sessionFile)) {
      const data = fs.readFileSync(sessionFile, "utf-8");
      this.sessionString = JSON.parse(data).session;
    }
  }

  /**
   * Save session to file
   */
  saveSession() {
    const sessionFile = `${this.sessionName}.json`;
    fs.writeFileSync(
      sessionFile,
      JSON.stringify({ session: this.client.session.save() })
    );
  }

  /**
   * Initialize and connect to Telegram
   */
  async connect() {
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
      onError: (err) => console.error("❌ Telegram error:", err),
    });

    console.log("✅ Connected to Telegram!");
    this.saveSession();
  }

  /**
   * Fetch all video messages from a Telegram group
   * @param {string} groupUsername - The group username (e.g., wbsd06)
   * @returns {Promise<Array>} - Array of video message objects
   */
  async fetchVideosFromGroup(groupUsername) {
    try {
      console.log(`📥 Fetching videos from group: ${groupUsername}`);

      // Get the entity (group/channel)
      const entity = await this.client.getEntity(groupUsername);

      // Fetch messages
      const messages = await this.client.getMessages(entity, {
        limit: 100, // Adjust based on your needs
      });

      // Filter video messages
      const videos = [];
      for (const message of messages) {
        if (message.media && message.video) {
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
    } catch (error) {
      console.error(
        `❌ Error fetching videos from ${groupUsername}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Download video from Telegram
   * @param {Object} videoMessage - The video message object
   * @param {string} outputPath - Path to save the video
   * @returns {Promise<string>} - Path to downloaded file
   */
  async downloadVideo(videoMessage, outputPath = "./temp") {
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
        progressCallback: (downloaded, total) => {
          const percentage = ((downloaded / total) * 100).toFixed(2);
          process.stdout.write(`\r   Progress: ${percentage}%`);
        },
      });

      console.log("\n");

      // Save to file
      fs.writeFileSync(filePath, buffer);
      console.log(`✅ Video saved to: ${filePath}`);

      return filePath;
    } catch (error) {
      console.error(`❌ Error downloading video:`, error.message);
      throw error;
    }
  }

  /**
   * Disconnect from Telegram
   */
  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      console.log("👋 Disconnected from Telegram");
    }
  }
}

export default TelegramService;
