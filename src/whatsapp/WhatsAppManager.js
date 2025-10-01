import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";

/**
 * Manages multiple WhatsApp client instances
 */
class WhatsAppManager {
  constructor(accountNames = ["default"]) {
    this.accountNames = accountNames;
    this.clients = new Map();
    this.readyClients = new Set();
    this.messageHandlers = [];
  }

  /**
   * Register a message handler
   * @param {Function} handler - Function to handle incoming messages
   */
  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  /**
   * Create and initialize a WhatsApp client
   * @param {string} accountName - Unique identifier for the account
   */
  createClient(accountName) {
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: accountName }),
      puppeteer: {
        headless: true,
        executablePath:
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      },
    });

    // QR Code generation
    client.on("qr", (qr) => {
      console.log(`\n📱 QR Code for account: ${accountName}`);
      console.log("Scan this QR code with WhatsApp:");
      qrcode.generate(qr, { small: true });
    });

    // Authentication
    client.on("authenticated", () => {
      console.log(`✅ Authenticated: ${accountName}`);
    });

    // Ready state
    client.on("ready", () => {
      console.log(`🚀 Client ready: ${accountName}`);
      this.readyClients.add(accountName);
    });

    // Message handling
    client.on("message", async (message) => {
      // Execute all registered message handlers
      for (const handler of this.messageHandlers) {
        try {
          await handler(message, client, accountName);
        } catch (error) {
          console.error(
            `❌ Error in message handler for ${accountName}:`,
            error
          );
        }
      }
    });

    // Disconnection
    client.on("disconnected", (reason) => {
      console.log(`⚠️  Client disconnected: ${accountName}. Reason:`, reason);
      this.readyClients.delete(accountName);
    });

    // Error handling
    client.on("auth_failure", (msg) => {
      console.error(`❌ Authentication failure for ${accountName}:`, msg);
    });

    return client;
  }

  /**
   * Initialize all WhatsApp clients
   */
  async initializeAll() {
    console.log(
      `🔧 Initializing ${this.accountNames.length} WhatsApp account(s)...`
    );

    for (const accountName of this.accountNames) {
      const client = this.createClient(accountName);
      this.clients.set(accountName, client);
      await client.initialize();
    }

    console.log("⏳ Waiting for all clients to be ready...");
  }

  /**
   * Get a specific client
   * @param {string} accountName - Account identifier
   * @returns {Client|null}
   */
  getClient(accountName) {
    return this.clients.get(accountName) || null;
  }

  /**
   * Get the first available ready client
   * @returns {Object|null} - {client, accountName}
   */
  getAvailableClient() {
    for (const accountName of this.readyClients) {
      return {
        client: this.clients.get(accountName),
        accountName,
      };
    }
    return null;
  }

  /**
   * Check if all clients are ready
   * @returns {boolean}
   */
  allClientsReady() {
    return this.readyClients.size === this.accountNames.length;
  }

  /**
   * Destroy all clients
   */
  async destroyAll() {
    console.log("🛑 Destroying all WhatsApp clients...");
    for (const [accountName, client] of this.clients) {
      await client.destroy();
      console.log(`✅ Destroyed: ${accountName}`);
    }
    this.clients.clear();
    this.readyClients.clear();
  }
}

export default WhatsAppManager;
