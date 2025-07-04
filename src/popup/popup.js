// ebayCPaSS2GoogleSheets Popup Script

// DOM要素の取得
const elements = {
  // ステータス
  statusIndicator: document.getElementById('statusIndicator'),
  statusDot: document.querySelector('.status-dot'),
  statusText: document.querySelector('.status-text'),
  
  // ページ情報
  currentPage: document.getElementById('currentPage'),
  targetSite: document.getElementById('targetSite'),
  
  // 抽出データ
  estimatedCost: document.getElementById('estimatedCost'),
  trackingNumber: document.getElementById('trackingNumber'),
  lastMileNumber: document.getElementById('lastMileNumber'),
  lastExtractionTime: document.getElementById('lastExtractionTime'),
  
  // アクションボタン
  extractBtn: document.getElementById('extractBtn'),
  highlightBtn: document.getElementById('highlightBtn'),
  exportBtn: document.getElementById('exportBtn'),
  
  // 統計情報
  totalExtracted: document.getElementById('totalExtracted'),
  todayExtracted: document.getElementById('todayExtracted'),
  successRate: document.getElementById('successRate'),
  
  // 設定
  autoExtract: document.getElementById('autoExtract'),
  showNotifications: document.getElementById('showNotifications'),
  csvAutoDownload: document.getElementById('csvAutoDownload'),
  
  // 履歴
  historyList: document.getElementById('historyList'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  
  // モーダル
  loadingOverlay: document.getElementById('loadingOverlay'),
  errorModal: document.getElementById('errorModal'),
  successModal: document.getElementById('successModal'),
  errorMessage: document.getElementById('errorMessage'),
  successMessage: document.getElementById('successMessage'),
  
  // フッターリンク
  helpLink: document.getElementById('helpLink'),
  settingsLink: document.getElementById('settingsLink'),
  aboutLink: document.getElementById('aboutLink')
};

// アプリケーションの状態
let currentTab = null;
let extractedData = null;
let settings = null;
let statistics = null;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup initialized');
  
  try {
    // 現在のタブ情報を取得
    await getCurrentTab();
    
    // 設定を読み込み
    await loadSettings();
    
    // 統計情報を読み込み
    await loadStatistics();
    
    // 履歴を読み込み
    await loadHistory();
    
    // イベントリスナーを設定
    setupEventListeners();
    
    // 現在のページ情報を更新
    updatePageInfo();
    
    // ebayCPaSSサイトかどうかチェック
    checkTargetSite();
    
    // 最新の抽出データを取得
    await getLatestExtractedData();
    
  } catch (error) {
    console.error('Popup initialization error:', error);
    showError('初期化に失敗しました: ' + error.message);
  }
});

// 現在のタブ情報を取得
async function getCurrentTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];
    console.log('Current tab:', currentTab);
  } catch (error) {
    console.error('Failed to get current tab:', error);
    throw error;
  }
}

// 設定を読み込み
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response.success) {
      settings = response.settings;
      updateSettingsUI();
    } else {
      throw new Error(response.error || '設定の読み込みに失敗しました');
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    // デフォルト設定を使用
    settings = {
      extractionSettings: {
        autoExtract: false,
        showNotifications: true,
        csvAutoDownload: false
      }
    };
    updateSettingsUI();
  }
}

// 統計情報を読み込み
async function loadStatistics() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStatistics' });
    if (response.success) {
      statistics = response.statistics;
      updateStatisticsUI();
    } else {
      throw new Error(response.error || '統計情報の読み込みに失敗しました');
    }
  } catch (error) {
    console.error('Failed to load statistics:', error);
    // デフォルト統計情報を使用
    statistics = {
      totalExtracted: 0,
      todayExtracted: 0,
      successRate: 0
    };
    updateStatisticsUI();
  }
}

// 履歴を読み込み
async function loadHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getHistory' });
    if (response.success) {
      updateHistoryUI(response.history);
    } else {
      throw new Error(response.error || '履歴の読み込みに失敗しました');
    }
  } catch (error) {
    console.error('Failed to load history:', error);
    updateHistoryUI([]);
  }
}

// イベントリスナーを設定
function setupEventListeners() {
  // アクションボタン
  elements.extractBtn.addEventListener('click', extractData);
  elements.highlightBtn.addEventListener('click', highlightElements);
  elements.exportBtn.addEventListener('click', exportToCsv);
  
  // 設定変更
  elements.autoExtract.addEventListener('change', updateSetting);
  elements.showNotifications.addEventListener('change', updateSetting);
  elements.csvAutoDownload.addEventListener('change', updateSetting);
  
  // 履歴クリア
  elements.clearHistoryBtn.addEventListener('click', clearHistory);
  
  // モーダル閉じる
  document.getElementById('errorModalClose').addEventListener('click', () => hideModal('errorModal'));
  document.getElementById('errorModalOk').addEventListener('click', () => hideModal('errorModal'));
  document.getElementById('successModalClose').addEventListener('click', () => hideModal('successModal'));
  document.getElementById('successModalOk').addEventListener('click', () => hideModal('successModal'));
  
  // フッターリンク
  elements.helpLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/make-it-at/EbayCPaSS2GoogleSheets/blob/main/README.md' });
  });
  
  elements.settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  
  elements.aboutLink.addEventListener('click', (e) => {
    e.preventDefault();
    showSuccess('ebayCPaSS2GoogleSheets v1.0.0\n\neBayセラー向け配送情報抽出ツール\n\n© 2024 ebayCPaSS2GoogleSheets');
  });
}

// ページ情報を更新
function updatePageInfo() {
  if (currentTab) {
    elements.currentPage.textContent = currentTab.title || 'タイトルなし';
    elements.currentPage.title = currentTab.url;
  }
}

// 対象サイトかどうかチェック
function checkTargetSite() {
  if (currentTab && currentTab.url) {
    const isTargetSite = currentTab.url.includes('ebaycpass.com');
    elements.targetSite.textContent = isTargetSite ? 'ebayCPaSS (対象サイト)' : '対象外サイト';
    elements.targetSite.className = isTargetSite ? 'info-value target-site' : 'info-value other-site';
    
    // ボタンの有効/無効を切り替え
    elements.extractBtn.disabled = !isTargetSite;
    elements.highlightBtn.disabled = !isTargetSite;
    
    // ステータスを更新
    updateStatus(isTargetSite ? 'ready' : 'inactive');
  }
}

// ステータスを更新
function updateStatus(status) {
  elements.statusDot.className = 'status-dot';
  
  switch (status) {
    case 'ready':
      elements.statusDot.classList.add('active');
      elements.statusText.textContent = '準備完了';
      break;
    case 'extracting':
      elements.statusText.textContent = '抽出中...';
      break;
    case 'error':
      elements.statusDot.classList.add('error');
      elements.statusText.textContent = 'エラー';
      break;
    case 'inactive':
    default:
      elements.statusText.textContent = '待機中';
      break;
  }
}

// 設定UIを更新
function updateSettingsUI() {
  if (settings && settings.extractionSettings) {
    elements.autoExtract.checked = settings.extractionSettings.autoExtract || false;
    elements.showNotifications.checked = settings.extractionSettings.showNotifications !== false;
    elements.csvAutoDownload.checked = settings.extractionSettings.csvAutoDownload || false;
  }
}

// 統計情報UIを更新
function updateStatisticsUI() {
  if (statistics) {
    elements.totalExtracted.textContent = statistics.totalExtracted || 0;
    elements.todayExtracted.textContent = statistics.todayExtracted || 0;
    elements.successRate.textContent = (statistics.successRate || 0) + '%';
  }
}

// 履歴UIを更新
function updateHistoryUI(history) {
  if (!history || history.length === 0) {
    elements.historyList.innerHTML = `
      <div class="history-empty">
        <span class="empty-icon">📭</span>
        <p>データ履歴がありません</p>
      </div>
    `;
    return;
  }
  
  const historyHtml = history.slice(0, 10).map(item => `
    <div class="history-item">
      <div class="history-time">${formatDate(item.timestamp)}</div>
      <div class="history-data">
        ${item.estimatedCost ? `送料: ${item.estimatedCost}` : ''}
        ${item.trackingNumber ? ` | 追跡: ${item.trackingNumber.substring(0, 10)}...` : ''}
      </div>
    </div>
  `).join('');
  
  elements.historyList.innerHTML = historyHtml;
}

// 最新の抽出データを取得
async function getLatestExtractedData() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getLatestData' });
    if (response.success && response.data) {
      extractedData = response.data;
      updateExtractedDataUI();
    }
  } catch (error) {
    console.error('Failed to get latest extracted data:', error);
  }
}

// 抽出データUIを更新
function updateExtractedDataUI() {
  if (extractedData) {
    // 推定送料
    if (extractedData.estimatedCost) {
      elements.estimatedCost.textContent = extractedData.estimatedCost;
      elements.estimatedCost.className = 'data-value';
      elements.estimatedCost.parentElement.classList.add('has-data');
    } else {
      elements.estimatedCost.textContent = '-';
      elements.estimatedCost.className = 'data-value empty';
      elements.estimatedCost.parentElement.classList.remove('has-data');
    }
    
    // 追跡番号
    if (extractedData.trackingNumber) {
      elements.trackingNumber.textContent = extractedData.trackingNumber;
      elements.trackingNumber.className = 'data-value';
      elements.trackingNumber.parentElement.classList.add('has-data');
    } else {
      elements.trackingNumber.textContent = '-';
      elements.trackingNumber.className = 'data-value empty';
      elements.trackingNumber.parentElement.classList.remove('has-data');
    }
    
    // ラストマイル追跡番号
    if (extractedData.lastMileNumber) {
      elements.lastMileNumber.textContent = extractedData.lastMileNumber;
      elements.lastMileNumber.className = 'data-value';
      elements.lastMileNumber.parentElement.classList.add('has-data');
    } else {
      elements.lastMileNumber.textContent = '-';
      elements.lastMileNumber.className = 'data-value empty';
      elements.lastMileNumber.parentElement.classList.remove('has-data');
    }
    
    // 抽出時刻
    if (extractedData.extractionTime) {
      elements.lastExtractionTime.textContent = formatDate(extractedData.extractionTime);
    }
    
    // エクスポートボタンの有効/無効
    const hasData = extractedData.estimatedCost || extractedData.trackingNumber || extractedData.lastMileNumber;
    elements.exportBtn.disabled = !hasData;
  }
}

// データ抽出
async function extractData() {
  if (!currentTab || !currentTab.url.includes('ebaycpass.com')) {
    showError('ebayCPaSSサイトでのみ実行可能です');
    return;
  }
  
  showLoading(true);
  updateStatus('extracting');
  
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'extractData' });
    
    if (response && response.success) {
      extractedData = response.data;
      updateExtractedDataUI();
      
      // 統計情報を更新
      await loadStatistics();
      
      // 履歴を更新
      await loadHistory();
      
      showSuccess('データ抽出が完了しました');
      updateStatus('ready');
    } else {
      throw new Error(response?.error || 'データ抽出に失敗しました');
    }
  } catch (error) {
    console.error('Data extraction error:', error);
    showError('データ抽出に失敗しました: ' + error.message);
    updateStatus('error');
  } finally {
    showLoading(false);
  }
}

// 要素をハイライト
async function highlightElements() {
  if (!currentTab || !currentTab.url.includes('ebaycpass.com')) {
    showError('ebayCPaSSサイトでのみ実行可能です');
    return;
  }
  
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'highlightElements' });
    
    if (response && response.success) {
      showSuccess('要素をハイライトしました');
    } else {
      throw new Error(response?.error || 'ハイライトに失敗しました');
    }
  } catch (error) {
    console.error('Highlight error:', error);
    showError('ハイライトに失敗しました: ' + error.message);
  }
}

// CSVエクスポート
async function exportToCsv() {
  if (!extractedData) {
    showError('抽出データがありません');
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'exportCsv', 
      data: extractedData 
    });
    
    if (response && response.success) {
      showSuccess('CSVファイルがダウンロードされました');
    } else {
      throw new Error(response?.error || 'CSVエクスポートに失敗しました');
    }
  } catch (error) {
    console.error('CSV export error:', error);
    showError('CSVエクスポートに失敗しました: ' + error.message);
  }
}

// 設定を更新
async function updateSetting(event) {
  const setting = event.target.id;
  const value = event.target.checked;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updateSetting',
      setting: setting,
      value: value
    });
    
    if (response && response.success) {
      // 設定を再読み込み
      await loadSettings();
      console.log(`Setting ${setting} updated to ${value}`);
    } else {
      throw new Error(response?.error || '設定の更新に失敗しました');
    }
  } catch (error) {
    console.error('Setting update error:', error);
    showError('設定の更新に失敗しました: ' + error.message);
    
    // チェックボックスを元に戻す
    event.target.checked = !value;
  }
}

// 履歴をクリア
async function clearHistory() {
  if (!confirm('履歴をすべて削除しますか？')) {
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'clearHistory' });
    
    if (response && response.success) {
      await loadHistory();
      showSuccess('履歴をクリアしました');
    } else {
      throw new Error(response?.error || '履歴のクリアに失敗しました');
    }
  } catch (error) {
    console.error('Clear history error:', error);
    showError('履歴のクリアに失敗しました: ' + error.message);
  }
}

// ローディング表示
function showLoading(show) {
  if (show) {
    elements.loadingOverlay.classList.add('show');
  } else {
    elements.loadingOverlay.classList.remove('show');
  }
}

// エラーモーダル表示
function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorModal.classList.add('show');
}

// 成功モーダル表示
function showSuccess(message) {
  elements.successMessage.textContent = message;
  elements.successModal.classList.add('show');
}

// モーダル非表示
function hideModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
}

// 日付フォーマット
function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
}

// Background scriptからのメッセージを受信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Popup received message:', request);
  
  switch (request.action) {
    case 'dataExtracted':
      extractedData = request.data;
      updateExtractedDataUI();
      loadStatistics();
      loadHistory();
      break;
      
    case 'settingsUpdated':
      loadSettings();
      break;
      
    case 'statisticsUpdated':
      loadStatistics();
      break;
      
    default:
      console.warn('Unknown action:', request.action);
  }
  
  sendResponse({ success: true });
});

// ポップアップが閉じられる前の処理
window.addEventListener('beforeunload', () => {
  console.log('Popup closing');
}); 