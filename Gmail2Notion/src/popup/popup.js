// Gmail2Notion Chrome Extension - Popup Script
// ポップアップ画面の動作制御

console.log('Gmail2Notion Popup Script loaded');

// DOM要素の取得
const elements = {
  form: document.getElementById('settingsForm'),
  apiKeyInput: document.getElementById('notionApiKey'),
  databaseIdInput: document.getElementById('notionDatabaseId'),
  showNotificationsCheckbox: document.getElementById('showNotifications'),
  saveAsHtmlCheckbox: document.getElementById('saveAsHtml'),
  saveImagesCheckbox: document.getElementById('saveImages'),
  autoSaveCheckbox: document.getElementById('autoSave'),
  preventDuplicatesCheckbox: document.getElementById('preventDuplicates'),
  testConnectionBtn: document.getElementById('testConnection'),
  saveSettingsBtn: document.getElementById('saveSettings'),
  status: document.getElementById('status'),
  databaseInfo: document.getElementById('databaseInfo'),
  dbTitle: document.getElementById('dbTitle'),
  dbProperties: document.getElementById('dbProperties'),
  savedEmailCount: document.getElementById('savedEmailCount'),
  clearHistoryBtn: document.getElementById('clearHistory')
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup DOM loaded');
  initializePopup();
});

// ポップアップが表示されるたびに設定を再読み込み
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    console.log('Popup became visible, reloading settings');
    loadSettings().catch(error => {
      console.error('Error reloading settings:', error);
    });
  }
});

// ポップアップの初期化
async function initializePopup() {
  try {
    // 既存の設定を読み込み
    await loadSettings();
    
    // 保存済みメール数を更新
    await updateSavedEmailCount();
    
    // イベントリスナーを設定
    setupEventListeners();
    
    console.log('Popup initialized successfully');
  } catch (error) {
    console.error('Error initializing popup:', error);
    showStatus('初期化エラーが発生しました', 'error');
  }
}

// 設定を読み込み
async function loadSettings() {
  try {
    const settings = await new Promise((resolve, reject) => {
      chrome.storage.sync.get([
        'notionApiKey',
        'notionDatabaseId',
        'showNotifications',
        'saveAsHtml',
        'saveImages',
        'autoSave',
        'preventDuplicates'
      ], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
    
    console.log('Loaded settings:', { 
      ...settings, 
      notionApiKey: settings.notionApiKey ? `***${settings.notionApiKey.slice(-4)}` : 'empty',
      notionDatabaseId: settings.notionDatabaseId ? `***${settings.notionDatabaseId.slice(-4)}` : 'empty'
    });
    
    // フォームに設定値を反映
    if (settings.notionApiKey) {
      elements.apiKeyInput.value = settings.notionApiKey;
      console.log('API Key loaded and set');
    } else {
      console.log('No API Key found in storage');
    }
    
    if (settings.notionDatabaseId) {
      elements.databaseIdInput.value = settings.notionDatabaseId;
      console.log('Database ID loaded and set');
    } else {
      console.log('No Database ID found in storage');
    }
    
    elements.showNotificationsCheckbox.checked = settings.showNotifications !== false;
    elements.saveAsHtmlCheckbox.checked = settings.saveAsHtml !== false;
    elements.saveImagesCheckbox.checked = settings.saveImages !== false;
    elements.autoSaveCheckbox.checked = settings.autoSave === true;
    elements.preventDuplicatesCheckbox.checked = settings.preventDuplicates !== false; // デフォルトはtrue
    
    // 設定が完了している場合は接続テストを実行
    if (settings.notionApiKey && settings.notionDatabaseId) {
      console.log('Both API Key and Database ID found, will test connection');
      setTimeout(() => testConnection(), 500);
    } else {
      console.log('Missing API Key or Database ID, skipping connection test');
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    throw error;
  }
}

// イベントリスナーの設定
function setupEventListeners() {
  // フォーム送信
  elements.form.addEventListener('submit', handleFormSubmit);
  
  // 接続テストボタン
  elements.testConnectionBtn.addEventListener('click', testConnection);
  
  // 履歴クリアボタン
  elements.clearHistoryBtn.addEventListener('click', clearSavedEmailHistory);
  
  // 入力フィールドの変更監視
  elements.apiKeyInput.addEventListener('input', handleInputChange);
  elements.databaseIdInput.addEventListener('input', handleInputChange);
  
  // チェックボックスの変更監視
  elements.showNotificationsCheckbox.addEventListener('change', handleCheckboxChange);
  elements.saveAsHtmlCheckbox.addEventListener('change', handleCheckboxChange);
  elements.saveImagesCheckbox.addEventListener('change', handleCheckboxChange);
  elements.autoSaveCheckbox.addEventListener('change', handleCheckboxChange);
  elements.preventDuplicatesCheckbox.addEventListener('change', handleCheckboxChange);
  
  console.log('Event listeners set up');
}

// フォーム送信処理
async function handleFormSubmit(event) {
  event.preventDefault();
  
  try {
    setButtonState(elements.saveSettingsBtn, 'loading', '保存中...');
    
    const settings = {
      notionApiKey: elements.apiKeyInput.value.trim(),
      notionDatabaseId: elements.databaseIdInput.value.trim(),
      showNotifications: elements.showNotificationsCheckbox.checked,
      saveAsHtml: elements.saveAsHtmlCheckbox.checked,
      saveImages: elements.saveImagesCheckbox.checked,
      autoSave: elements.autoSaveCheckbox.checked,
      preventDuplicates: elements.preventDuplicatesCheckbox.checked
    };
    
    // バリデーション
    if (!settings.notionApiKey) {
      throw new Error('Notion APIキーを入力してください');
    }
    
    if (!settings.notionDatabaseId) {
      throw new Error('データベースIDを入力してください');
    }
    
    // 設定を保存
    console.log('Saving settings:', {
      ...settings,
      notionApiKey: settings.notionApiKey ? `***${settings.notionApiKey.slice(-4)}` : 'empty',
      notionDatabaseId: settings.notionDatabaseId ? `***${settings.notionDatabaseId.slice(-4)}` : 'empty'
    });
    
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage sync error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('Settings saved to chrome.storage.sync successfully');
          resolve();
        }
      });
    });
    
    // 保存後に確認のため再読み込み
    const savedSettings = await new Promise((resolve) => {
      chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId'], resolve);
    });
    
    console.log('Verification - settings after save:', {
      notionApiKey: savedSettings.notionApiKey ? `***${savedSettings.notionApiKey.slice(-4)}` : 'empty',
      notionDatabaseId: savedSettings.notionDatabaseId ? `***${savedSettings.notionDatabaseId.slice(-4)}` : 'empty'
    });
    
    console.log('Settings saved successfully');
    showStatus('設定を保存しました', 'success');
    
    // 接続テストを実行
    setTimeout(() => testConnection(), 500);
    
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus(`保存エラー: ${error.message}`, 'error');
  } finally {
    setButtonState(elements.saveSettingsBtn, 'normal', '設定を保存');
  }
}

// 接続テスト
async function testConnection() {
  try {
    const apiKey = elements.apiKeyInput.value.trim();
    const databaseId = elements.databaseIdInput.value.trim();
    
    if (!apiKey || !databaseId) {
      showStatus('APIキーとデータベースIDを入力してください', 'error');
      return;
    }
    
    setButtonState(elements.testConnectionBtn, 'loading', 'テスト中...');
    showStatus('接続をテストしています...', 'info');
    
    // バックグラウンドスクリプトに接続テストを依頼
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'testNotionConnection',
        apiKey: apiKey,
        databaseId: databaseId
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (response.success) {
      console.log('Connection test successful:', response.data);
      showStatus('接続テストが成功しました', 'success');
      showDatabaseInfo(response.data);
    } else {
      console.error('Connection test failed:', response.error);
      showStatus(`接続テスト失敗: ${response.error}`, 'error');
      hideDatabaseInfo();
    }
    
  } catch (error) {
    console.error('Error testing connection:', error);
    showStatus(`接続テストエラー: ${error.message}`, 'error');
    hideDatabaseInfo();
  } finally {
    setButtonState(elements.testConnectionBtn, 'normal', '接続テスト');
  }
}

// 入力フィールドの変更処理
function handleInputChange(event) {
  // データベース情報を非表示
  hideDatabaseInfo();
  
  // ステータスをクリア
  hideStatus();
}

// チェックボックスの変更処理
function handleCheckboxChange(event) {
  console.log(`Checkbox ${event.target.id} changed:`, event.target.checked);
}

// ボタンの状態を変更
function setButtonState(button, state, text) {
  const svg = button.querySelector('svg');
  const textNode = button.childNodes[button.childNodes.length - 1];
  
  switch (state) {
    case 'loading':
      button.disabled = true;
      button.classList.add('loading');
      textNode.textContent = text || 'Loading...';
      break;
      
    case 'normal':
    default:
      button.disabled = false;
      button.classList.remove('loading');
      textNode.textContent = text || 'Button';
      break;
  }
}

// ステータスメッセージを表示
function showStatus(message, type = 'info') {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
  elements.status.classList.remove('hidden');
  
  console.log(`Status (${type}):`, message);
  
  // 成功メッセージは3秒後に自動で非表示
  if (type === 'success') {
    setTimeout(hideStatus, 3000);
  }
}

// ステータスメッセージを非表示
function hideStatus() {
  elements.status.classList.add('hidden');
}

// データベース情報を表示
function showDatabaseInfo(data) {
  elements.dbTitle.textContent = data.title || 'タイトルなし';
  elements.dbProperties.textContent = data.properties ? data.properties.join(', ') : 'プロパティなし';
  elements.databaseInfo.classList.remove('hidden');
  
  console.log('Database info displayed:', data);
}

// データベース情報を非表示
function hideDatabaseInfo() {
  elements.databaseInfo.classList.add('hidden');
}

// 保存済みメール数を更新
async function updateSavedEmailCount() {
  try {
    const result = await chrome.storage.local.get(['savedEmails']);
    const count = result.savedEmails ? result.savedEmails.length : 0;
    elements.savedEmailCount.textContent = count;
    console.log('Saved email count updated:', count);
  } catch (error) {
    console.error('Error updating saved email count:', error);
    elements.savedEmailCount.textContent = '?';
  }
}

// 保存履歴をクリア
async function clearSavedEmailHistory() {
  if (!confirm('保存済みメールの履歴をすべてクリアしますか？\n\nこの操作は取り消せません。')) {
    return;
  }
  
  try {
    setButtonState(elements.clearHistoryBtn, 'loading', 'クリア中...');
    
    // ローカルストレージから保存履歴を削除
    await chrome.storage.local.remove(['savedEmails']);
    
    // 表示を更新
    await updateSavedEmailCount();
    
    showStatus('保存履歴をクリアしました', 'success');
    console.log('Saved email history cleared');
    
  } catch (error) {
    console.error('Error clearing saved email history:', error);
    showStatus(`履歴クリアエラー: ${error.message}`, 'error');
  } finally {
    setButtonState(elements.clearHistoryBtn, 'normal', '履歴をクリア');
  }
}

// エラーハンドリング
window.addEventListener('error', (event) => {
  console.error('Popup error:', event.error);
  showStatus('予期しないエラーが発生しました', 'error');
});

// Chrome拡張機能のエラーハンドリング
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Popup received message:', request);
  
  if (request.action === 'updateStatus') {
    showStatus(request.message, request.type);
  }
  
  sendResponse({ received: true });
});

// ページのアンロード時の処理
window.addEventListener('beforeunload', () => {
  console.log('Popup closing');
}); 