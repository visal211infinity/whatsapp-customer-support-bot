import fs from "fs";
import path from "path";

/**
 * Smart cache manager with LRU and size-based eviction
 */
class CacheManager {
  constructor(cacheDir = "./temp/cache", config = {}) {
    this.cacheDir = cacheDir;
    this.config = {
      maxCacheSize: config.maxCacheSize || 1024 * 1024 * 1024, // 1GB default
      maxAge: config.maxAge || 7 * 24 * 60 * 60 * 1000, // 7 days default
      metadataFile: path.join(cacheDir, "metadata.json"),
    };
    this.metadata = this.loadMetadata();
    this.ensureCacheDir();
  }

  /**
   * Ensure cache directory exists
   */
  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Load metadata from file
   */
  loadMetadata() {
    try {
      if (fs.existsSync(this.config.metadataFile)) {
        const data = fs.readFileSync(this.config.metadataFile, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn("⚠️  Failed to load cache metadata:", error.message);
    }
    return {};
  }

  /**
   * Save metadata to file
   */
  saveMetadata() {
    try {
      fs.writeFileSync(
        this.config.metadataFile,
        JSON.stringify(this.metadata, null, 2)
      );
    } catch (error) {
      console.error("❌ Failed to save cache metadata:", error.message);
    }
  }

  /**
   * Get series cache directory
   */
  getSeriesDir(seriesCode) {
    return path.join(this.cacheDir, seriesCode);
  }

  /**
   * Get video cache path
   */
  getVideoPath(seriesCode, videoId) {
    return path.join(this.getSeriesDir(seriesCode), `${videoId}.mp4`);
  }

  /**
   * Check if video is cached
   */
  isCached(seriesCode, videoId) {
    const videoPath = this.getVideoPath(seriesCode, videoId);
    return fs.existsSync(videoPath);
  }

  /**
   * Check if entire series is cached
   */
  isSeriesCached(seriesCode, videoIds) {
    return videoIds.every((id) => this.isCached(seriesCode, id));
  }

  /**
   * Get cached video path
   */
  getCachedVideo(seriesCode, videoId) {
    const videoPath = this.getVideoPath(seriesCode, videoId);
    if (fs.existsSync(videoPath)) {
      // Update access time
      this.updateAccessTime(seriesCode, videoId);
      return videoPath;
    }
    return null;
  }

  /**
   * Cache a video
   */
  cacheVideo(seriesCode, videoId, filePath) {
    try {
      const seriesDir = this.getSeriesDir(seriesCode);
      if (!fs.existsSync(seriesDir)) {
        fs.mkdirSync(seriesDir, { recursive: true });
      }

      const targetPath = this.getVideoPath(seriesCode, videoId);

      // Copy file to cache
      fs.copyFileSync(filePath, targetPath);

      // Update metadata
      const fileSize = fs.statSync(targetPath).size;
      const now = Date.now();

      if (!this.metadata[seriesCode]) {
        this.metadata[seriesCode] = {
          createdAt: now,
          lastAccessAt: now,
          accessCount: 0,
          videos: {},
        };
      }

      this.metadata[seriesCode].videos[videoId] = {
        size: fileSize,
        cachedAt: now,
      };
      this.metadata[seriesCode].lastAccessAt = now;
      this.metadata[seriesCode].accessCount++;

      this.saveMetadata();
      return targetPath;
    } catch (error) {
      console.error(`❌ Failed to cache video ${videoId}:`, error.message);
      return null;
    }
  }

  /**
   * Update access time for a series
   */
  updateAccessTime(seriesCode, videoId) {
    if (this.metadata[seriesCode]) {
      this.metadata[seriesCode].lastAccessAt = Date.now();
      this.metadata[seriesCode].accessCount++;
      this.saveMetadata();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    let totalSize = 0;
    let totalFiles = 0;

    for (const seriesCode in this.metadata) {
      const series = this.metadata[seriesCode];
      for (const videoId in series.videos) {
        totalSize += series.videos[videoId].size || 0;
        totalFiles++;
      }
    }

    return {
      totalSize,
      totalFiles,
      seriesCount: Object.keys(this.metadata).length,
      maxSize: this.config.maxCacheSize,
      usagePercent: ((totalSize / this.config.maxCacheSize) * 100).toFixed(2),
    };
  }

  /**
   * Clean old cache entries
   */
  cleanOldEntries() {
    console.log("🧹 Cleaning old cache entries...");
    const now = Date.now();
    let cleaned = 0;

    for (const seriesCode in this.metadata) {
      const series = this.metadata[seriesCode];
      const age = now - series.createdAt;

      // Remove if too old
      if (age > this.config.maxAge) {
        this.removeSeries(seriesCode);
        cleaned++;
        console.log(
          `   Removed old series: ${seriesCode} (${(
            age /
            1000 /
            60 /
            60 /
            24
          ).toFixed(1)} days old)`
        );
      }
    }

    if (cleaned > 0) {
      console.log(`✅ Cleaned ${cleaned} old series`);
    } else {
      console.log("✅ No old entries to clean");
    }
  }

  /**
   * Clean cache based on size (LRU eviction)
   */
  cleanBySize() {
    const stats = this.getCacheStats();

    if (stats.totalSize <= this.config.maxCacheSize) {
      return; // Cache is within limit
    }

    console.log(
      `🧹 Cache size (${(stats.totalSize / 1024 / 1024).toFixed(
        2
      )}MB) exceeds limit, cleaning...`
    );

    // Sort series by last access time (LRU)
    const seriesList = Object.entries(this.metadata)
      .map(([code, data]) => ({
        code,
        lastAccessAt: data.lastAccessAt,
        size: Object.values(data.videos).reduce(
          (sum, v) => sum + (v.size || 0),
          0
        ),
      }))
      .sort((a, b) => a.lastAccessAt - b.lastAccessAt); // Oldest first

    // Remove series until we're under the limit
    let currentSize = stats.totalSize;
    let removed = 0;

    for (const series of seriesList) {
      if (currentSize <= this.config.maxCacheSize * 0.8) {
        break; // Keep 20% buffer
      }

      this.removeSeries(series.code);
      currentSize -= series.size;
      removed++;
      console.log(
        `   Removed: ${series.code} (freed ${(
          series.size /
          1024 /
          1024
        ).toFixed(2)}MB)`
      );
    }

    console.log(
      `✅ Removed ${removed} series, freed ${(
        (stats.totalSize - currentSize) /
        1024 /
        1024
      ).toFixed(2)}MB`
    );
  }

  /**
   * Remove a series from cache
   */
  removeSeries(seriesCode) {
    const seriesDir = this.getSeriesDir(seriesCode);

    try {
      if (fs.existsSync(seriesDir)) {
        fs.rmSync(seriesDir, { recursive: true, force: true });
      }
      delete this.metadata[seriesCode];
      this.saveMetadata();
    } catch (error) {
      console.error(`❌ Failed to remove series ${seriesCode}:`, error.message);
    }
  }

  /**
   * Perform full cache cleanup
   */
  cleanup() {
    console.log("\n🧹 Starting cache cleanup...");
    this.cleanOldEntries();
    this.cleanBySize();

    const stats = this.getCacheStats();
    console.log(`\n📊 Cache Stats:`);
    console.log(
      `   Total Size: ${(stats.totalSize / 1024 / 1024).toFixed(2)}MB / ${(
        stats.maxSize /
        1024 /
        1024
      ).toFixed(2)}MB (${stats.usagePercent}%)`
    );
    console.log(`   Files: ${stats.totalFiles}`);
    console.log(`   Series: ${stats.seriesCount}`);
    console.log("");
  }

  /**
   * Clear entire cache
   */
  clearAll() {
    console.log("🗑️  Clearing entire cache...");

    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
      }
      this.metadata = {};
      this.ensureCacheDir();
      this.saveMetadata();
      console.log("✅ Cache cleared");
    } catch (error) {
      console.error("❌ Failed to clear cache:", error.message);
    }
  }
}

export default CacheManager;
