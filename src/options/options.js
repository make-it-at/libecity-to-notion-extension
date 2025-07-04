// ebayCPaSS2GoogleSheets Options Page Script

// DOM要素
const elements = {
  // 抽出設定
  autoExtract: document.getElementById('autoExtract'),
  showNotifications: document.getElementById('showNotifications'),
  csvAutoDownload: document.getElementById('csvAutoDownload'),
  
  // CSV設定
  csvFilename: document.getElementById('csvFilename'),
  includeHeaders: document.getElementById('includeHeaders'),
  
  // データ管理
  exportData: document.getElementById('exportData'),
  importData: document.getElementById('importData'),
  importFile: document.getElementById('importFile'),
  clearHistory: document.getElementById('clearHistory'),
  
  // アクション
  saveSettings: document.getElementById('saveSettings'),
  resetSettings: document.getElementById('resetSettings'),
  
  // ステータス
  status: document.getElementById('status')
};

// アプリケーション状態
let currentSettings = null;
let isLoading = false;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Options page initialized');
  
  try {
    await loadSettings();
    setupEventListeners();
    showStatus('設定を読み込みました', 'success');
  } catch (error) {
    console.error('Options page initialization error:', error);
    showStatus('初期化に失敗しました: ' + error.message, 'error');
  }
});

// 設定を読み込み
async function loadSettings() {
  try {
    setLoading(true);
    
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    
    if (response.success) {
      currentSettings = response.settings;
      updateUI();
    } else {
      throw new Error(response.error || '設定の読み込みに失敗しました');
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('設定の読み込みに失敗しました: ' + error.message, 'error');
  } finally {
    setLoading(false);
  }
}

// UIを更新
function updateUI() {
  if (!currentSettings) return;
  
  // 抽出設定
  elements.autoExtract.checked = currentSettings.extractionSettings?.autoExtract || false;
  elements.showNotifications.checked = currentSettings.extractionSettings?.showNotifications !== false;
  elements.csvAutoDownload.checked = currentSettings.extractionSettings?.csvAutoDownload || false;
  
  // CSV設定
  elements.csvFilename.value = currentSettings.csvSettings?.filename || 'ebaycpass_data_{date}.csv';
  elements.includeHeaders.checked = currentSettings.csvSettings?.includeHeaders !== false;
}

// イベントリスナーを設定
function setupEventListeners() {
  // 設定保存
  elements.saveSettings.addEventListener('click', saveSettings);
  
  // 設定リセット
  elements.resetSettings.addEventListener('click', resetSettings);
  
  // データエクスポート
  elements.exportData.addEventListener('click', exportData);
  
  // データインポート
  elements.importData.addEventListener('click', () => {
    elements.importFile.click();
  });
  
  elements.importFile.addEventListener('change', importData);
  
  // 履歴クリア
  elements.clearHistory.addEventListener('click', clearHistory);
  
  // リアルタイム設定変更
  elements.autoExtract.addEventListener('change', onSettingChange);
  elements.showNotifications.addEventListener('change', onSettingChange);
  elements.csvAutoDownload.addEventListener('change', onSettingChange);
  elements.csvFilename.addEventListener('input', onSettingChange);
  elements.includeHeaders.addEventListener('change', onSettingChange);
}

// 設定変更時の処理
function onSettingChange() {
  // 保存ボタンを有効化
  elements.saveSettings.disabled = false;
  elements.saveSettings.textContent = '設定を保存 *';
}

// 設定を保存
async function saveSettings() {
  if (isLoading) return;
  
  try {
    setLoading(true);
    
    // 現在のフォーム値を取得
    const newSettings = {
      extractionSettings: {
        autoExtract: elements.autoExtract.checked,
        showNotifications: elements.showNotifications.checked,
        csvAutoDownload: elements.csvAutoDownload.checked
      },
      csvSettings: {
        filename: elements.csvFilename.value || 'ebaycpass_data_{date}.csv',
        includeHeaders: elements.includeHeaders.checked
      },
      // 既存の設定を保持
      selectorConfig: currentSettings?.selectorConfig || {}
    };
    
    // Background scriptに送信
    const response = await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: newSettings
    });
    
    if (response.success) {
      currentSettings = newSettings;
      elements.saveSettings.disabled = true;
      elements.saveSettings.textContent = '設定を保存';
      showStatus('設定を保存しました', 'success');
    } else {
      throw new Error(response.error || '設定の保存に失敗しました');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('設定の保存に失敗しました: ' + error.message, 'error');
  } finally {
    setLoading(false);
  }
}

// 設定をリセット
async function resetSettings() {
  if (isLoading) return;
  
  if (!confirm('設定をデフォルト値にリセットしますか？')) {
    return;
  }
  
  try {
    setLoading(true);
    
    const response = await chrome.runtime.sendMessage({ action: 'resetSettings' });
    
    if (response.success) {
      await loadSettings();
      showStatus('設定をリセットしました', 'success');
    } else {
      throw new Error(response.error || '設定のリセットに失敗しました');
    }
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showStatus('設定のリセットに失敗しました: ' + error.message, 'error');
  } finally {
    setLoading(false);
  }
}

// データをエクスポート
async function exportData() {
  if (isLoading) return;
  
  try {
    setLoading(true);
    
    const response = await chrome.runtime.sendMessage({ action: 'exportAllData' });
    
    if (response.success) {
      // JSONファイルとしてダウンロード
      const dataStr = JSON.stringify(response.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `ebaycpass_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      showStatus('データをエクスポートしました', 'success');
    } else {
      throw new Error(response.error || 'データのエクスポートに失敗しました');
    }
  } catch (error) {
    console.error('Failed to export data:', error);
    showStatus('データのエクスポートに失敗しました: ' + error.message, 'error');
  } finally {
    setLoading(false);
  }
}

// データをインポート
async function importData(event) {
  if (isLoading) return;
  
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    setLoading(true);
    
    const text = await file.text();
    const data = JSON.parse(text);
    
    // データ形式をチェック
    if (!data.version || !data.exportDate) {
      throw new Error('無効なバックアップファイル形式です');
    }
    
    if (!confirm('現在の設定とデータを上書きしますか？この操作は元に戻せません。')) {
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'importData',
      data: data
    });
    
    if (response.success) {
      await loadSettings();
      showStatus('データをインポートしました', 'success');
    } else {
      throw new Error(response.error || 'データのインポートに失敗しました');
    }
  } catch (error) {
    console.error('Failed to import data:', error);
    showStatus('データのインポートに失敗しました: ' + error.message, 'error');
  } finally {
    setLoading(false);
    // ファイル選択をリセット
    event.target.value = '';
  }
}

// 履歴をクリア
async function clearHistory() {
  if (isLoading) return;
  
  if (!confirm('すべての抽出履歴を削除しますか？この操作は元に戻せません。')) {
    return;
  }
  
  try {
    setLoading(true);
    
    const response = await chrome.runtime.sendMessage({ action: 'clearHistory' });
    
    if (response.success) {
      showStatus('履歴をクリアしました', 'success');
    } else {
      throw new Error(response.error || '履歴のクリアに失敗しました');
    }
  } catch (error) {
    console.error('Failed to clear history:', error);
    showStatus('履歴のクリアに失敗しました: ' + error.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ローディング状態を設定
function setLoading(loading) {
  isLoading = loading;
  
  // すべてのボタンを無効化/有効化
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    button.disabled = loading;
    if (loading) {
      button.classList.add('loading');
    } else {
      button.classList.remove('loading');
    }
  });
  
  // 入力フィールドを無効化/有効化
  const inputs = document.querySelectorAll('input');
  inputs.forEach(input => {
    input.disabled = loading;
  });
}

// ステータスメッセージを表示
function showStatus(message, type = 'info') {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
  
  // 3秒後に自動で消去
  setTimeout(() => {
    elements.status.textContent = '';
    elements.status.className = 'status';
  }, 3000);
}

// キーボードショートカット
document.addEventListener('keydown', (event) => {
  // Ctrl+S で設定保存
  if (event.ctrlKey && event.key === 's') {
    event.preventDefault();
    if (!elements.saveSettings.disabled) {
      saveSettings();
    }
  }
  
  // Ctrl+R で設定リセット
  if (event.ctrlKey && event.key === 'r') {
    event.preventDefault();
    resetSettings();
  }
});

// ページを離れる前の確認
window.addEventListener('beforeunload', (event) => {
  if (!elements.saveSettings.disabled) {
    event.preventDefault();
    event.returnValue = '保存されていない変更があります。ページを離れますか？';
  }
}); 