// LibeCity to Notion - Popup Script

// DOM要素の取得
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  pageStatus: document.getElementById('pageStatus'),
  databaseSelect: document.getElementById('databaseSelect'),
  refreshDatabases: document.getElementById('refreshDatabases'),
  progressSection: document.getElementById('progressSection'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  successNotification: document.getElementById('successNotification'),
  errorNotification: document.getElementById('errorNotification'),
  errorMessage: document.getElementById('errorMessage'),
  notionLink: document.getElementById('notionLink'),
  retryBtn: document.getElementById('retryBtn'),
  helpBtn: document.getElementById('helpBtn'),
  // タブ関連
  statusTab: document.getElementById('statusTab'),
  settingsTab: document.getElementById('settingsTab'),
  statusContent: document.getElementById('statusContent'),
  settingsContent: document.getElementById('settingsContent'),
  // 設定関連
  apiKey: document.getElementById('apiKey'),
  toggleApiKey: document.getElementById('toggleApiKey'),
  testConnection: document.getElementById('testConnection'),
  connectionResult: document.getElementById('connectionResult'),
  saveImages: document.getElementById('saveImages'),
  saveLinks: document.getElementById('saveLinks'),
  notifications: document.getElementById('notifications'),
  saveSettings: document.getElementById('saveSettings')
};

// 状態管理
let currentTab = null;
let databases = [];

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup initialized');
  
  await initializePopup();
  setupEventListeners();
  await loadInitialData();
});

// ポップアップの初期化
async function initializePopup() {
  try {
    // デバッグ情報の表示
    await showDebugInfo();
    
    // 現在のタブ情報を取得
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];
    
    // ページ状態の更新
    updatePageStatus();
    
    // 接続状態の確認
    await checkConnectionStatus();
    
  } catch (error) {
    console.error('Popup initialization failed:', error);
    showError('初期化に失敗しました: ' + error.message);
  }
}

// デバッグ情報の表示
async function showDebugInfo() {
  console.log('=== Debug Information ===');
  console.log('Chrome version:', navigator.userAgent);
  console.log('Extension ID:', chrome.runtime.id);
  
  // Background scriptの状態チェック
  try {
    const bgResponse = await chrome.runtime.sendMessage({ action: 'ping' });
    console.log('Background script status:', bgResponse ? 'Active' : 'No response');
  } catch (bgError) {
    console.error('Background script communication failed:', bgError);
  }
  
  // Content scriptの状態チェック（現在のタブで）
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      const contentResponse = await chrome.tabs.sendMessage(tabs[0].id, { action: 'ping' });
      console.log('Content script status:', contentResponse ? 'Active' : 'No response');
    }
  } catch (contentError) {
    console.log('Content script not active:', contentError.message);
  }
  
  console.log('=========================');
}

// イベントリスナーの設定
function setupEventListeners() {
  // タブ関連
  elements.statusTab.addEventListener('click', () => switchTab('status'));
  elements.settingsTab.addEventListener('click', () => switchTab('settings'));
  
  // データベース関連
  elements.databaseSelect.addEventListener('change', handleDatabaseChange);
  elements.refreshDatabases.addEventListener('click', handleRefreshDatabases);
  
  // 設定関連
  elements.toggleApiKey.addEventListener('click', handleToggleApiKey);
  elements.testConnection.addEventListener('click', handleTestConnection);
  elements.saveSettings.addEventListener('click', handleSaveSettings);
  elements.apiKey.addEventListener('input', handleApiKeyChange);
  
  // 再試行ボタン
  elements.retryBtn.addEventListener('click', handleRetry);
  
  // フッターボタン
  elements.helpBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/kmakita1201/libecity-to-notion-extension' });
  });
  
  // メッセージリスナー
  chrome.runtime.onMessage.addListener(handleMessage);
}

// 初期データの読み込み
async function loadInitialData() {
  try {
    // 設定の読み込み
    await loadSettings();
    
    // データベース一覧の取得
    await loadDatabases();
    
    // 保存されたデータベース選択の復元
    const settings = await chrome.storage.sync.get(['selectedDatabase']);
    if (settings.selectedDatabase) {
      elements.databaseSelect.value = settings.selectedDatabase;
      handleDatabaseChange();
    }
    
  } catch (error) {
    console.error('Failed to load initial data:', error);
  }
}

// ページ状態の更新
function updatePageStatus() {
  if (!currentTab) return;
  
  const isLibeCity = currentTab.url && currentTab.url.includes('libecity.com');
  
  elements.pageStatus.textContent = isLibeCity ? 'LibeCity' : 'その他';
  elements.pageStatus.className = `status-value ${isLibeCity ? 'libecity' : 'other'}`;
  
  // LibeCityページでない場合は警告を表示
  if (!isLibeCity) {
    showError('📍 libecity.comのページでご利用ください。現在のページでは機能を使用できません。');
  }
}

// 接続状態の確認
async function checkConnectionStatus() {
  try {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ action: 'testConnection' });
    } catch (commError) {
      console.error('Background script communication failed:', commError);
      elements.connectionStatus.textContent = 'Background Script エラー';
      elements.connectionStatus.className = 'status-value disconnected';
      showError('Background scriptとの通信に失敗しました。拡張機能を再読み込みしてください。');
      return;
    }
    
    if (response && response.success) {
      elements.connectionStatus.textContent = '接続済み';
      elements.connectionStatus.className = 'status-value connected';
    } else {
      elements.connectionStatus.textContent = '未接続';
      elements.connectionStatus.className = 'status-value disconnected';
      showError('🔗 Notion APIに接続できません。設定画面でAPIキーを確認してください。');
    }
  } catch (error) {
    console.error('Connection check failed:', error);
    elements.connectionStatus.textContent = 'エラー';
    elements.connectionStatus.className = 'status-value disconnected';
  }
}

// データベース一覧の読み込み
async function loadDatabases() {
  try {
    showLoading(elements.refreshDatabases);
    
    let response;
    try {
      response = await chrome.runtime.sendMessage({ action: 'getDatabases' });
    } catch (commError) {
      console.error('Background script communication failed:', commError);
      throw new Error('Background scriptとの通信に失敗しました。拡張機能を再読み込みしてください。');
    }
    
    if (response && response.success) {
      databases = response.databases || [];
      updateDatabaseSelect();
    } else {
      throw new Error(response?.error || 'データベースの取得に失敗しました');
    }
  } catch (error) {
    console.error('Failed to load databases:', error);
    showError('データベースの読み込みに失敗しました: ' + error.message);
  } finally {
    hideLoading(elements.refreshDatabases);
  }
}

// データベース選択の更新
function updateDatabaseSelect() {
  // 既存のオプションをクリア（最初のオプションは残す）
  while (elements.databaseSelect.children.length > 1) {
    elements.databaseSelect.removeChild(elements.databaseSelect.lastChild);
  }
  
  if (databases.length === 0) {
    elements.databaseSelect.innerHTML = '<option value="">データベースが見つかりません</option>';
    return;
  }
  
  // データベースオプションを追加
  databases.forEach(db => {
    const option = document.createElement('option');
    option.value = db.id;
    option.textContent = db.title;
    elements.databaseSelect.appendChild(option);
  });
}

// データベース選択の処理
async function handleDatabaseChange() {
  const selectedDatabase = elements.databaseSelect.value;
  
  // 選択されたデータベースを保存
  try {
    await chrome.storage.sync.set({ selectedDatabase });
  } catch (error) {
    console.error('Failed to save database selection:', error);
  }
}

// データベース更新の処理
async function handleRefreshDatabases() {
  await loadDatabases();
}

// 再試行ボタンの処理
async function handleRetry() {
  hideError();
  await checkConnectionStatus();
  await loadDatabases();
}

// メッセージハンドラー
function handleMessage(message, sender, sendResponse) {
  console.log('Popup received message:', message);
  
  if (message.action === 'elementSelected') {
    // 不要になった機能
  } else if (message.action === 'saveProgress') {
    showProgress(message.text, message.percent);
  } else if (message.action === 'saveComplete') {
    hideProgress();
    if (message.success) {
      showSaveSuccess(message.notionUrl);
    } else {
      showError('保存に失敗しました: ' + message.error);
    }
  }
  
  sendResponse({ received: true });
}

// プログレス表示
function showProgress(text, percent) {
  elements.progressSection.style.display = 'block';
  elements.progressText.textContent = text;
  elements.progressFill.style.width = percent + '%';
}

// プログレス非表示
function hideProgress() {
  elements.progressSection.style.display = 'none';
}

// 保存成功の表示
function showSaveSuccess(notionUrl) {
  elements.successNotification.style.display = 'block';
  if (notionUrl && elements.notionLink) {
    elements.notionLink.href = notionUrl;
    elements.notionLink.style.display = 'inline-block';
  }
  
  // 3秒後に自動で非表示
  setTimeout(() => {
    elements.successNotification.style.display = 'none';
  }, 3000);
}

// 成功メッセージの表示
function showSuccess(message) {
  console.log('Success:', message);
  // 必要に応じて成功通知UI
}

// エラー表示
function showError(message) {
  elements.errorNotification.style.display = 'block';
  elements.errorMessage.textContent = message;
}

// エラー非表示
function hideError() {
  elements.errorNotification.style.display = 'none';
}

// ローディング表示
function showLoading(button) {
  if (button) {
    button.disabled = true;
    button.innerHTML = '<div class="spinner"></div>';
  }
}

// ローディング非表示
function hideLoading(button) {
  if (button) {
    button.disabled = false;
    button.innerHTML = '🔄';
  }
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 日付フォーマット
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  // 1時間以内
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}分前`;
  }
  
  // 1日以内
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}時間前`;
  }
  
  // それ以上
  return date.toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// タブ切り替え
function switchTab(tabName) {
  // タブボタンの状態更新
  elements.statusTab.classList.toggle('active', tabName === 'status');
  elements.settingsTab.classList.toggle('active', tabName === 'settings');
  
  // タブコンテンツの表示切り替え
  elements.statusContent.classList.toggle('active', tabName === 'status');
  elements.settingsContent.classList.toggle('active', tabName === 'settings');
}

// 設定の読み込み
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['apiKey', 'saveImages', 'saveLinks', 'notifications']);
    
    if (result.apiKey) {
      elements.apiKey.value = result.apiKey;
    }
    
    elements.saveImages.checked = result.saveImages !== false;
    elements.saveLinks.checked = result.saveLinks !== false;
    elements.notifications.checked = result.notifications !== false;
    
    console.log('Settings loaded');
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// APIキー表示切り替え
function handleToggleApiKey() {
  if (elements.apiKey.type === 'password') {
    elements.apiKey.type = 'text';
    elements.toggleApiKey.textContent = '🙈';
    elements.toggleApiKey.title = 'APIキーを非表示';
  } else {
    elements.apiKey.type = 'password';
    elements.toggleApiKey.textContent = '👁️';
    elements.toggleApiKey.title = 'APIキーを表示';
  }
}

// APIキー変更時の処理
function handleApiKeyChange() {
  // 接続結果をクリア
  elements.connectionResult.textContent = '';
  elements.connectionResult.className = 'connection-result';
}

// 接続テスト
async function handleTestConnection() {
  const apiKey = elements.apiKey.value.trim();
  
  if (!apiKey) {
    showConnectionResult('APIキーを入力してください', 'error');
    return;
  }
  
  try {
    elements.testConnection.disabled = true;
    elements.testConnection.textContent = 'テスト中...';
    showConnectionResult('接続を確認中...', '');
    
    // 一時的にAPIキーを保存してテスト
    const response = await chrome.runtime.sendMessage({
      action: 'testConnection',
      apiKey: apiKey
    });
    
    if (response && response.success) {
      showConnectionResult('✅ 接続成功', 'success');
    } else {
      showConnectionResult('❌ 接続失敗: ' + (response?.error || '不明なエラー'), 'error');
    }
  } catch (error) {
    console.error('Connection test failed:', error);
    showConnectionResult('❌ 接続テストに失敗しました', 'error');
  } finally {
    elements.testConnection.disabled = false;
    elements.testConnection.textContent = '接続テスト';
  }
}

// 接続結果の表示
function showConnectionResult(message, type) {
  elements.connectionResult.textContent = message;
  elements.connectionResult.className = `connection-result ${type}`;
}

// 設定保存
async function handleSaveSettings() {
  try {
    elements.saveSettings.disabled = true;
    elements.saveSettings.textContent = '保存中...';
    
    const settings = {
      apiKey: elements.apiKey.value.trim(),
      saveImages: elements.saveImages.checked,
      saveLinks: elements.saveLinks.checked,
      notifications: elements.notifications.checked
    };
    
    // 設定を保存
    await chrome.storage.sync.set(settings);
    
    // 接続状態を更新
    await checkConnectionStatus();
    
    // データベース一覧を更新
    if (settings.apiKey) {
      await loadDatabases();
    }
    
    // 成功メッセージ
    elements.saveSettings.textContent = '✅ 保存完了';
    setTimeout(() => {
      elements.saveSettings.textContent = '設定を保存';
    }, 2000);
    
    console.log('Settings saved successfully');
  } catch (error) {
    console.error('Failed to save settings:', error);
    elements.saveSettings.textContent = '❌ 保存失敗';
    setTimeout(() => {
      elements.saveSettings.textContent = '設定を保存';
    }, 2000);
  } finally {
    elements.saveSettings.disabled = false;
  }
} 