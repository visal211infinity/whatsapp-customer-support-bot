/**
 * Common type definitions for the WhatsApp-Telegram Bot
 */

import { Message as WAMessage, Client as WAClient } from "whatsapp-web.js";
import { Api } from "telegram";

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface ChatUser {
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

export interface UserData {
  phoneNumber?: string;
  name?: string;
}

// ============================================================================
// TELEGRAM TYPES
// ============================================================================

export interface VideoInfo {
  id: number;
  date: number;
  caption: string;
  video: Api.Document;
  messageObj: Api.Message;
}

export interface SessionData {
  session: string;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

export interface CacheConfig {
  maxCacheSize?: number;
  maxAge?: number;
  metadataFile?: string;
}

export interface SeriesMetadata {
  createdAt: number;
  lastAccessAt: number;
  accessCount: number;
  videos: {
    [videoId: string]: VideoMetadata;
  };
}

export interface VideoMetadata {
  size: number;
  cachedAt: number;
}

export interface CacheMetadata {
  [seriesCode: string]: SeriesMetadata;
}

export interface CacheStats {
  totalSize: number;
  totalFiles: number;
  seriesCount: number;
  maxSize: number;
  usagePercent: string;
}

// ============================================================================
// WHATSAPP TYPES
// ============================================================================

export interface WhatsAppClientInfo {
  client: WAClient;
  accountName: string;
}

export type MessageHandler = (
  message: WAMessage,
  client: WAClient,
  accountName: string
) => Promise<void>;

// ============================================================================
// CONFIG TYPES
// ============================================================================

export interface SeriesMapping {
  [seriesCode: string]: string;
}

export interface DatabaseConfig {
  host?: string;
  port?: number;
  user: string;
  password?: string;
  database: string;
}
