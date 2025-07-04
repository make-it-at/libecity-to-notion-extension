// ebayCPaSS2GoogleSheets Storage Utilities

/**
 * ストレージ管理クラス
 */
class StorageManager {
  constructor() {
    this.syncStorage = chrome.storage.sync;
    this.localStorage = chrome.storage.local;
    
    // デフォルト設定
    this.defaultSettings = {
      extractionSettings: {
        autoExtract: false,
        showNotifications: true,
        csvAutoDownload: false
      },
      selectorConfig: {
        estimatedCost: {
          patterns: [
            { selector: 'div span.value', priority: 1, successRate: 0.95 },
            { selector: '.cost-display .amount', priority: 2, successRate: 0.80 },
            { selector: '[data-cost] .price', priority: 3, successRate: 0.70 }
          ],
          userCustom: []
        },
        trackingNumber: {
          patterns: [
            { selector: 'a span:empty', priority: 1, successRate: 0.90 },
            { selector: '.tracking-info a', priority: 2, successRate: 0.75 },
            { selector: 'a[href*="tracking"]', priority: 3, successRate: 0.60 }
          ],
          userCustom: []
        },
        lastMileNumber: {
          patterns: [
            { selector: 'span.bold', priority: 1, successRate: 0.85 },
            { selector: '.last-mile-tracking', priority: 2, successRate: 0.70 },
            { selector: '.tracking-number', priority: 3, successRate: 0.55 }
          ],
          userCustom: []
        }
      },
      csvSettings: {
        filename: 'ebaycpass_data_{date}.csv',
        includeHeaders: true,
        encoding: 'utf-8'
      }
    };
    
    this.defaultStatistics = {
      totalExtracted: 0,
      todayExtracted: 0,
      successRate: 0,
      lastExtractionDate: null,
      extractionHistory: []
    };
  }
  
  /**
   * 設定を取得
   */
  async getSettings() {
    try {
      const result = await this.syncStorage.get('settings');
      return result.settings || this.defaultSettings;
    } catch (error) {
      console.error('Failed to get settings:', error);
      return this.defaultSettings;
    }
  }
  
  /**
   * 設定を保存
   */
  async saveSettings(settings) {
    try {
      await this.syncStorage.set({ settings });
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  }
  
  /**
   * 特定の設定を更新
   */
  async updateSetting(path, value) {
    try {
      const settings = await this.getSettings();
      const pathArray = path.split('.');
      
      let current = settings;
      for (let i = 0; i < pathArray.length - 1; i++) {
        if (!current[pathArray[i]]) {
          current[pathArray[i]] = {};
        }
        current = current[pathArray[i]];
      }
      
      current[pathArray[pathArray.length - 1]] = value;
      
      return await this.saveSettings(settings);
    } catch (error) {
      console.error('Failed to update setting:', error);
      return false;
    }
  }
  
  /**
   * 統計情報を取得
   */
  async getStatistics() {
    try {
      const result = await this.localStorage.get('statistics');
      return result.statistics || this.defaultStatistics;
    } catch (error) {
      console.error('Failed to get statistics:', error);
      return this.defaultStatistics;
    }
  }
  
  /**
   * 統計情報を保存
   */
  async saveStatistics(statistics) {
    try {
      await this.localStorage.set({ statistics });
      return true;
    } catch (error) {
      console.error('Failed to save statistics:', error);
      return false;
    }
  }
  
  /**
   * 統計情報を更新
   */
  async updateStatistics(extractionResult) {
    try {
      const statistics = await this.getStatistics();
      const today = new Date().toDateString();
      
      // 総抽出数を更新
      statistics.totalExtracted++;
      
      // 今日の抽出数を更新
      if (statistics.lastExtractionDate !== today) {
        statistics.todayExtracted = 1;
        statistics.lastExtractionDate = today;
      } else {
        statistics.todayExtracted++;
      }
      
      // 成功率を計算
      const recentHistory = statistics.extractionHistory.slice(-100); // 最新100件
      const successCount = recentHistory.filter(h => h.success).length;
      statistics.successRate = recentHistory.length > 0 ? 
        Math.round((successCount / recentHistory.length) * 100) : 0;
      
      // 履歴に追加
      statistics.extractionHistory.push({
        timestamp: new Date().toISOString(),
        success: extractionResult.success,
        dataCount: extractionResult.dataCount || 0,
        url: extractionResult.url
      });
      
      // 履歴を最新1000件に制限
      if (statistics.extractionHistory.length > 1000) {
        statistics.extractionHistory = statistics.extractionHistory.slice(-1000);
      }
      
      return await this.saveStatistics(statistics);
    } catch (error) {
      console.error('Failed to update statistics:', error);
      return false;
    }
  }
  
  /**
   * データ履歴を取得
   */
  async getDataHistory() {
    try {
      const result = await this.localStorage.get('dataHistory');
      return result.dataHistory || [];
    } catch (error) {
      console.error('Failed to get data history:', error);
      return [];
    }
  }
  
  /**
   * データ履歴を保存
   */
  async saveDataHistory(history) {
    try {
      await this.localStorage.set({ dataHistory: history });
      return true;
    } catch (error) {
      console.error('Failed to save data history:', error);
      return false;
    }
  }
  
  /**
   * データ履歴に追加
   */
  async addToDataHistory(data) {
    try {
      const history = await this.getDataHistory();
      
      const historyItem = {
        timestamp: new Date().toISOString(),
        estimatedCost: data.estimatedCost,
        trackingNumber: data.trackingNumber,
        lastMileNumber: data.lastMileNumber,
        pageUrl: data.pageUrl,
        extractionTime: data.extractionTime
      };
      
      history.unshift(historyItem); // 先頭に追加
      
      // 履歴を最新500件に制限
      if (history.length > 500) {
        history.splice(500);
      }
      
      return await this.saveDataHistory(history);
    } catch (error) {
      console.error('Failed to add to data history:', error);
      return false;
    }
  }
  
  /**
   * データ履歴をクリア
   */
  async clearDataHistory() {
    try {
      await this.localStorage.remove('dataHistory');
      return true;
    } catch (error) {
      console.error('Failed to clear data history:', error);
      return false;
    }
  }
  
  /**
   * 最新の抽出データを取得
   */
  async getLatestExtractedData() {
    try {
      const result = await this.localStorage.get('latestExtractedData');
      return result.latestExtractedData || null;
    } catch (error) {
      console.error('Failed to get latest extracted data:', error);
      return null;
    }
  }
  
  /**
   * 最新の抽出データを保存
   */
  async saveLatestExtractedData(data) {
    try {
      await this.localStorage.set({ latestExtractedData: data });
      return true;
    } catch (error) {
      console.error('Failed to save latest extracted data:', error);
      return false;
    }
  }
  
  /**
   * セレクター設定を更新
   */
  async updateSelectorConfig(type, newPattern) {
    try {
      const settings = await this.getSettings();
      
      if (!settings.selectorConfig[type]) {
        settings.selectorConfig[type] = { patterns: [], userCustom: [] };
      }
      
      // ユーザーカスタムパターンに追加
      settings.selectorConfig[type].userCustom.unshift({
        selector: newPattern.selector,
        priority: 0, // ユーザーパターンは最優先
        successRate: 1.0,
        addedAt: new Date().toISOString(),
        description: newPattern.description || ''
      });
      
      // ユーザーカスタムパターンを最新10件に制限
      if (settings.selectorConfig[type].userCustom.length > 10) {
        settings.selectorConfig[type].userCustom.splice(10);
      }
      
      return await this.saveSettings(settings);
    } catch (error) {
      console.error('Failed to update selector config:', error);
      return false;
    }
  }
  
  /**
   * セレクターの成功率を更新
   */
  async updateSelectorSuccessRate(type, selector, success) {
    try {
      const settings = await this.getSettings();
      
      if (!settings.selectorConfig[type]) return false;
      
      // パターンを検索して成功率を更新
      const patterns = settings.selectorConfig[type].patterns;
      const pattern = patterns.find(p => p.selector === selector);
      
      if (pattern) {
        // 簡単な成功率計算（実際の実装では移動平均などを使用）
        const currentRate = pattern.successRate || 0.5;
        const newRate = success ? 
          Math.min(1.0, currentRate + 0.1) : 
          Math.max(0.0, currentRate - 0.1);
        
        pattern.successRate = Math.round(newRate * 100) / 100;
        pattern.lastUsed = new Date().toISOString();
        
        return await this.saveSettings(settings);
      }
      
      return false;
    } catch (error) {
      console.error('Failed to update selector success rate:', error);
      return false;
    }
  }
  
  /**
   * 全データをエクスポート
   */
  async exportAllData() {
    try {
      const settings = await this.getSettings();
      const statistics = await this.getStatistics();
      const dataHistory = await this.getDataHistory();
      const latestData = await this.getLatestExtractedData();
      
      return {
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        settings,
        statistics,
        dataHistory,
        latestData
      };
    } catch (error) {
      console.error('Failed to export all data:', error);
      return null;
    }
  }
  
  /**
   * データをインポート
   */
  async importData(data) {
    try {
      if (!data || !data.version) {
        throw new Error('Invalid import data format');
      }
      
      // バックアップを作成
      const backup = await this.exportAllData();
      await this.localStorage.set({ backup: backup });
      
      // データをインポート
      if (data.settings) {
        await this.saveSettings(data.settings);
      }
      
      if (data.statistics) {
        await this.saveStatistics(data.statistics);
      }
      
      if (data.dataHistory) {
        await this.saveDataHistory(data.dataHistory);
      }
      
      if (data.latestData) {
        await this.saveLatestExtractedData(data.latestData);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  }
  
  /**
   * ストレージ使用量を取得
   */
  async getStorageUsage() {
    try {
      const syncUsage = await this.syncStorage.getBytesInUse();
      const localUsage = await this.localStorage.getBytesInUse();
      
      return {
        sync: {
          used: syncUsage,
          quota: chrome.storage.sync.QUOTA_BYTES,
          percentage: Math.round((syncUsage / chrome.storage.sync.QUOTA_BYTES) * 100)
        },
        local: {
          used: localUsage,
          quota: chrome.storage.local.QUOTA_BYTES,
          percentage: Math.round((localUsage / chrome.storage.local.QUOTA_BYTES) * 100)
        }
      };
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      return null;
    }
  }
  
  /**
   * ストレージをクリーンアップ
   */
  async cleanup() {
    try {
      // 古い履歴データを削除
      const history = await this.getDataHistory();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const filteredHistory = history.filter(item => 
        new Date(item.timestamp) > oneMonthAgo
      );
      
      if (filteredHistory.length !== history.length) {
        await this.saveDataHistory(filteredHistory);
      }
      
      // 古い統計履歴を削除
      const statistics = await this.getStatistics();
      if (statistics.extractionHistory.length > 1000) {
        statistics.extractionHistory = statistics.extractionHistory.slice(-1000);
        await this.saveStatistics(statistics);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to cleanup storage:', error);
      return false;
    }
  }
}

// シングルトンインスタンス
const storageManager = new StorageManager();

// エクスポート（モジュール形式とグローバル形式の両方をサポート）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = storageManager;
} else {
  window.StorageManager = storageManager;
} 