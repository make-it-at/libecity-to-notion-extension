// ebayCPaSS2GoogleSheets CSV Export Utilities

/**
 * CSV出力管理クラス
 */
class CSVExporter {
  constructor() {
    this.defaultHeaders = [
      '抽出日時',
      '推定送料',
      '追跡番号',
      'ラストマイル追跡番号',
      'ページURL',
      '抽出ステータス'
    ];
    
    this.englishHeaders = [
      'Extraction Date',
      'Estimated Cost',
      'Tracking Number',
      'Last Mile Tracking Number',
      'Page URL',
      'Extraction Status'
    ];
  }
  
  /**
   * 単一データをCSV形式で出力
   */
  async exportSingleData(data, options = {}) {
    try {
      const settings = await this.getCSVSettings();
      const headers = options.useEnglishHeaders ? this.englishHeaders : this.defaultHeaders;
      
      // CSVデータを作成
      const csvData = this.createCSVData([data], headers, settings);
      
      // ファイル名を生成
      const filename = this.generateFilename(settings.filename, 'single');
      
      // ダウンロード
      return await this.downloadCSV(csvData, filename);
    } catch (error) {
      console.error('Failed to export single data:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 複数データをCSV形式で出力
   */
  async exportMultipleData(dataArray, options = {}) {
    try {
      const settings = await this.getCSVSettings();
      const headers = options.useEnglishHeaders ? this.englishHeaders : this.defaultHeaders;
      
      // CSVデータを作成
      const csvData = this.createCSVData(dataArray, headers, settings);
      
      // ファイル名を生成
      const filename = this.generateFilename(settings.filename, 'multiple');
      
      // ダウンロード
      return await this.downloadCSV(csvData, filename);
    } catch (error) {
      console.error('Failed to export multiple data:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * 履歴データをCSV形式で出力
   */
  async exportHistoryData(options = {}) {
    try {
      // ストレージから履歴データを取得
      const storageManager = window.StorageManager || require('./storage.js');
      const history = await storageManager.getDataHistory();
      
      if (!history || history.length === 0) {
        return { success: false, error: 'エクスポートする履歴データがありません' };
      }
      
      return await this.exportMultipleData(history, options);
    } catch (error) {
      console.error('Failed to export history data:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * CSVデータを作成
   */
  createCSVData(dataArray, headers, settings) {
    const rows = [];
    
    // ヘッダー行を追加
    if (settings.includeHeaders) {
      rows.push(headers);
    }
    
    // データ行を追加
    dataArray.forEach(data => {
      const row = [
        this.formatDate(data.timestamp || data.extractionTime),
        this.formatCurrency(data.estimatedCost),
        data.trackingNumber || '',
        data.lastMileNumber || '',
        data.pageUrl || '',
        data.extractionStatus || '成功'
      ];
      rows.push(row);
    });
    
    // CSVフォーマットに変換
    return this.arrayToCSV(rows, settings);
  }
  
  /**
   * 配列をCSV文字列に変換
   */
  arrayToCSV(rows, settings) {
    const delimiter = settings.delimiter || ',';
    const lineBreak = settings.lineBreak || '\r\n';
    const quote = settings.quote || '"';
    
    return rows.map(row => {
      return row.map(cell => {
        const cellStr = String(cell || '');
        
        // クォートが必要かチェック
        if (cellStr.includes(delimiter) || cellStr.includes(quote) || cellStr.includes('\n') || cellStr.includes('\r')) {
          return quote + cellStr.replace(new RegExp(quote, 'g'), quote + quote) + quote;
        }
        
        return cellStr;
      }).join(delimiter);
    }).join(lineBreak);
  }
  
  /**
   * ファイル名を生成
   */
  generateFilename(template, type) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    const timestamp = `${dateStr}_${timeStr}`;
    
    let filename = template || 'ebaycpass_data_{date}.csv';
    
    // テンプレート変数を置換
    filename = filename
      .replace('{date}', dateStr)
      .replace('{time}', timeStr)
      .replace('{timestamp}', timestamp)
      .replace('{type}', type);
    
    // 拡張子を確認
    if (!filename.endsWith('.csv')) {
      filename += '.csv';
    }
    
    return filename;
  }
  
  /**
   * 日付をフォーマット
   */
  formatDate(dateString) {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  }
  
  /**
   * 通貨をフォーマット
   */
  formatCurrency(currencyString) {
    if (!currencyString) return '';
    
    // 既に適切な形式の場合はそのまま返す
    if (typeof currencyString === 'string' && currencyString.includes(' ')) {
      return currencyString;
    }
    
    // 数値の場合は JPY を追加
    if (typeof currencyString === 'number') {
      return `${currencyString.toLocaleString()} JPY`;
    }
    
    return currencyString;
  }
  
  /**
   * CSV設定を取得
   */
  async getCSVSettings() {
    try {
      const storageManager = window.StorageManager || require('./storage.js');
      const settings = await storageManager.getSettings();
      
      return {
        filename: settings.csvSettings?.filename || 'ebaycpass_data_{date}.csv',
        includeHeaders: settings.csvSettings?.includeHeaders !== false,
        encoding: settings.csvSettings?.encoding || 'utf-8',
        delimiter: settings.csvSettings?.delimiter || ',',
        lineBreak: settings.csvSettings?.lineBreak || '\r\n',
        quote: settings.csvSettings?.quote || '"'
      };
    } catch (error) {
      console.error('Failed to get CSV settings:', error);
      return {
        filename: 'ebaycpass_data_{date}.csv',
        includeHeaders: true,
        encoding: 'utf-8',
        delimiter: ',',
        lineBreak: '\r\n',
        quote: '"'
      };
    }
  }
  
  /**
   * CSVファイルをダウンロード
   */
  async downloadCSV(csvData, filename) {
    try {
      // BOM付きUTF-8で出力（Excelでの文字化け防止）
      const bom = '\uFEFF';
      const csvContent = bom + csvData;
      
      // Blobを作成
      const blob = new Blob([csvContent], { 
        type: 'text/csv;charset=utf-8;' 
      });
      
      // Chrome拡張機能の場合はchrome.downloads APIを使用
      if (typeof chrome !== 'undefined' && chrome.downloads) {
        const url = URL.createObjectURL(blob);
        
        const downloadId = await chrome.downloads.download({
          url: url,
          filename: filename,
          saveAs: true
        });
        
        // URLを解放
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        return { 
          success: true, 
          downloadId: downloadId,
          filename: filename,
          size: blob.size
        };
      } else {
        // 通常のWebページの場合
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // URLを解放
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        return { 
          success: true, 
          filename: filename,
          size: blob.size
        };
      }
    } catch (error) {
      console.error('Failed to download CSV:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * CSV文字列をパース
   */
  parseCSV(csvString, options = {}) {
    try {
      const delimiter = options.delimiter || ',';
      const quote = options.quote || '"';
      const hasHeaders = options.hasHeaders !== false;
      
      const lines = csvString.split(/\r?\n/);
      const result = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const row = this.parseCSVLine(line, delimiter, quote);
        
        if (hasHeaders && i === 0) {
          // ヘッダー行はスキップ（必要に応じて保存）
          continue;
        }
        
        // データ行を追加
        if (row.length >= 6) {
          result.push({
            timestamp: row[0],
            estimatedCost: row[1],
            trackingNumber: row[2],
            lastMileNumber: row[3],
            pageUrl: row[4],
            extractionStatus: row[5]
          });
        }
      }
      
      return { success: true, data: result };
    } catch (error) {
      console.error('Failed to parse CSV:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * CSV行をパース
   */
  parseCSVLine(line, delimiter, quote) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === quote) {
        if (inQuotes && line[i + 1] === quote) {
          // エスケープされたクォート
          current += quote;
          i += 2;
        } else {
          // クォートの開始/終了
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === delimiter && !inQuotes) {
        // デリミタ
        result.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    // 最後のフィールドを追加
    result.push(current);
    
    return result;
  }
  
  /**
   * CSVテンプレートを生成
   */
  generateTemplate(options = {}) {
    const headers = options.useEnglishHeaders ? this.englishHeaders : this.defaultHeaders;
    const sampleData = [{
      timestamp: new Date().toISOString(),
      estimatedCost: '2,486.00 JPY',
      trackingNumber: 'EM1013071241398FE06040099C0N',
      lastMileNumber: '882312169260',
      pageUrl: 'https://ebaycpass.com/sample',
      extractionStatus: '成功'
    }];
    
    const settings = {
      includeHeaders: true,
      delimiter: ',',
      lineBreak: '\r\n',
      quote: '"'
    };
    
    return this.createCSVData(sampleData, headers, settings);
  }
  
  /**
   * 統計情報をCSV形式で出力
   */
  async exportStatistics(options = {}) {
    try {
      const storageManager = window.StorageManager || require('./storage.js');
      const statistics = await storageManager.getStatistics();
      
      const headers = options.useEnglishHeaders ? 
        ['Date', 'Total Extracted', 'Today Extracted', 'Success Rate'] :
        ['日付', '総抽出数', '今日の抽出数', '成功率'];
      
      const data = [{
        date: new Date().toISOString().split('T')[0],
        totalExtracted: statistics.totalExtracted || 0,
        todayExtracted: statistics.todayExtracted || 0,
        successRate: (statistics.successRate || 0) + '%'
      }];
      
      const settings = await this.getCSVSettings();
      const csvData = this.arrayToCSV([headers, ...data.map(d => Object.values(d))], settings);
      const filename = this.generateFilename('ebaycpass_statistics_{date}.csv', 'statistics');
      
      return await this.downloadCSV(csvData, filename);
    } catch (error) {
      console.error('Failed to export statistics:', error);
      return { success: false, error: error.message };
    }
  }
}

// シングルトンインスタンス
const csvExporter = new CSVExporter();

// エクスポート（モジュール形式とグローバル形式の両方をサポート）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = csvExporter;
} else {
  window.CSVExporter = csvExporter;
} 