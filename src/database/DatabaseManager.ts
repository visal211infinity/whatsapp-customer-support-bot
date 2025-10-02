import pkg from "pg";
const { Pool } = pkg;
import type { Pool as PoolType, PoolConfig, QueryResult } from "pg";
import { ChatUser, UserData } from "../types";

/**
 * Database Manager for PostgreSQL
 */
class DatabaseManager {
  private pool: PoolType;

  constructor(config: PoolConfig) {
    this.pool = new Pool({
      host: config.host || "localhost",
      port: config.port || 5432,
      user: config.user,
      password: config.password || "",
      database: config.database,
    });

    this.pool.on("error", (err: Error) => {
      console.error("❌ Unexpected database error:", err);
    });
  }

  /**
   * Initialize database tables
   */
  async initialize(): Promise<void> {
    try {
      console.log("🔧 Initializing database tables...");

      // Create chat_users table
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

      // Create index for faster lookups
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chat_id ON chat_users(chat_id)
      `);

      console.log("✅ Database tables initialized");
    } catch (error) {
      console.error("❌ Database initialization error:", error);
      throw error;
    }
  }

  /**
   * Get or create user
   */
  async getOrCreateUser(
    chatId: string,
    botId: number,
    userData: UserData = {}
  ): Promise<ChatUser> {
    try {
      // Check if user exists
      const checkResult: QueryResult<ChatUser> = await this.pool.query(
        "SELECT * FROM chat_users WHERE chat_id = $1",
        [chatId]
      );

      if (checkResult.rows.length > 0) {
        // User exists - update last activity
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
          is_new_user: user.is_new_user, // Keep original is_new_user for this session
          isReturning: !user.is_new_user,
        };
      }

      // Create new user
      const insertResult: QueryResult<ChatUser> = await this.pool.query(
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

  /**
   * Update user's series request
   */
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

  /**
   * Get user statistics
   */
  async getUserStats(chatId: string): Promise<any | null> {
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

  /**
   * Get all users count
   */
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

  /**
   * Get new users today
   */
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

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
    console.log("👋 Database connection closed");
  }
}

export default DatabaseManager;
