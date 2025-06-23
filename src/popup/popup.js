// LibeCity to Notion - Popup Script

// DOM要素の取得
const elements = {
  connectionStatus: document.getElementById('connectionStatus'),
  pageStatus: document.getElementById('pageStatus'),
  databaseSelect: document.getElementById('databaseSelect'),
  refreshDatabases: document.getElementById('refreshDatabases'),
  selectContentBtn: document.getElementById('selectContentBtn'),
  selectedContent: document.getElementById('selectedContent'),
  saveToNotion: document.getElementById('saveToNotion'),
  progressSection: document.getElementById('progressSection'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  successNotification: document.getElementById('successNotification'),
  errorNotification: document.getElementById('errorNotification'),
  errorMessage: document.getElementById('errorMessage'),
  notionLink: document.getElementById('notionLink'),
  retryBtn: document.getElementById('retryBtn'),
  historyList: document.getElementById('historyList'),
  clearHistory: document.getElementById('clearHistory'),
  settingsBtn: document.getElementById('settingsBtn'),
  helpBtn: document.getElementById('helpBtn')
};

// 状態管理
let currentTab = null;
let selectedElement = null;
let databases = [];
let isSelectionMode = false;

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
  // データベース関連
  elements.databaseSelect.addEventListener('change', handleDatabaseChange);
  elements.refreshDatabases.addEventListener('click', handleRefreshDatabases);
  
  // 新しいデータベース作成ボタン
  const createDatabaseBtn = document.getElementById('createDatabaseBtn');
  if (createDatabaseBtn) {
    createDatabaseBtn.addEventListener('click', handleCreateDatabase);
  }
  
  // コンテンツ選択
  elements.selectContentBtn.addEventListener('click', handleSelectContent);
  
  // 保存ボタン
  elements.saveToNotion.addEventListener('click', handleSaveToNotion);
  
  // 再試行ボタン
  elements.retryBtn.addEventListener('click', handleRetry);
  
  // 履歴関連
  elements.clearHistory.addEventListener('click', handleClearHistory);
  
  // フッターボタン
  elements.settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  elements.helpBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/kmakita1201/libecity-to-notion-extension' });
  });
  
  // 選択クリアボタン
  const clearSelectionBtn = document.querySelector('.clear-selection');
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', clearSelection);
  }
  
  // メッセージリスナー
  chrome.runtime.onMessage.addListener(handleMessage);
}

// 初期データの読み込み
async function loadInitialData() {
  try {
    // データベース一覧の取得
    await loadDatabases();
    
    // 履歴の読み込み
    await loadHistory();
    
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
  
  // LibeCityページでない場合は機能を制限
  if (!isLibeCity) {
    elements.selectContentBtn.disabled = true;
    elements.saveToNotion.disabled = true;
    showError('このページはLibeCityではありません。libecity.comでご利用ください。');
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
      showError('Notion APIに接続できません。設定を確認してください。');
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
  
  // データベースオプションを追加
  databases.forEach(db => {
    const option = document.createElement('option');
    option.value = db.id;
    option.textContent = db.title || 'Untitled Database';
    elements.databaseSelect.appendChild(option);
  });
  
  // デフォルトデータベース作成オプション
  const createOption = document.createElement('option');
  createOption.value = 'create_default';
  createOption.textContent = '+ デフォルトデータベースを作成';
  elements.databaseSelect.appendChild(createOption);
}

// データベース変更の処理
async function handleDatabaseChange() {
  const selectedValue = elements.databaseSelect.value;
  
  if (selectedValue === 'create_default') {
    await createDefaultDatabase();
    return;
  }
  
  // 選択されたデータベースを保存
  if (selectedValue) {
    await chrome.storage.sync.set({ selectedDatabase: selectedValue });
    updateSaveButtonState();
  }
}

// デフォルトデータベースの作成
async function createDefaultDatabase() {
  try {
    showProgress('デフォルトデータベースを作成中...', 30);
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'createDefaultDatabase',
      pageTitle: currentTab.title
    });
    
    if (response && response.success) {
      showProgress('データベース作成完了', 100);
      
      // データベース一覧を更新
      await loadDatabases();
      
      // 新しく作成されたデータベースを選択
      elements.databaseSelect.value = response.databaseId;
      await chrome.storage.sync.set({ selectedDatabase: response.databaseId });
      
      updateSaveButtonState();
      hideProgress();
      
      showSuccess('デフォルトデータベースが作成されました');
    } else {
      throw new Error(response?.error || 'データベースの作成に失敗しました');
    }
  } catch (error) {
    console.error('Failed to create default database:', error);
    hideProgress();
    showError('データベースの作成に失敗しました: ' + error.message);
    
    // 選択をリセット
    elements.databaseSelect.value = '';
  }
}

// データベース更新の処理
async function handleRefreshDatabases() {
  await loadDatabases();
}

// 新しいデータベース作成の処理
async function handleCreateDatabase() {
  try {
    const createBtn = document.getElementById('createDatabaseBtn');
    showLoading(createBtn);
    
    showProgress('新しいデータベースを作成中...', 30);
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'createDefaultDatabase',
      pageTitle: currentTab?.title || 'LibeCity Chat Archive'
    });
    
    if (response && response.success) {
      showProgress('データベース作成完了', 100);
      
      // データベース一覧を更新
      await loadDatabases();
      
      // 新しく作成されたデータベースを選択
      elements.databaseSelect.value = response.databaseId;
      await chrome.storage.sync.set({ selectedDatabase: response.databaseId });
      
      updateSaveButtonState();
      hideProgress();
      
      showSuccess('新しいデータベースが作成されました！プロパティ設定の問題が解決されました。');
    } else {
      throw new Error(response?.error || 'データベースの作成に失敗しました');
    }
  } catch (error) {
    console.error('Failed to create database:', error);
    hideProgress();
    showError('データベースの作成に失敗しました: ' + error.message);
  } finally {
    const createBtn = document.getElementById('createDatabaseBtn');
    hideLoading(createBtn);
  }
}

// コンテンツ選択の処理
async function handleSelectContent() {
  if (isSelectionMode) {
    // 選択モードを終了
    await stopSelectionMode();
  } else {
    // 選択モードを開始
    await startSelectionMode();
  }
}

// 選択モードの開始
async function startSelectionMode() {
  try {
    // まずcontent scriptが注入されているかチェック
    let response;
    try {
      response = await chrome.tabs.sendMessage(currentTab.id, { 
        action: 'ping' 
      });
    } catch (pingError) {
      console.log('Content script not found, injecting...');
      
      // content scriptを手動で注入
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['src/content/content.js']
      });
      
      // CSSも注入
      await chrome.scripting.insertCSS({
        target: { tabId: currentTab.id },
        files: ['src/content/content.css']
      });
      
      // 少し待ってから再試行
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    response = await chrome.tabs.sendMessage(currentTab.id, { 
      action: 'startSelection' 
    });
    
    if (response && response.success) {
      isSelectionMode = true;
      elements.selectContentBtn.textContent = '選択を終了';
      elements.selectContentBtn.classList.add('active');
    } else {
      throw new Error('選択モードの開始に失敗しました');
    }
  } catch (error) {
    console.error('Failed to start selection mode:', error);
    showError('選択モードの開始に失敗しました: ' + error.message);
  }
}

// 選択モードの終了
async function stopSelectionMode() {
  try {
    await chrome.tabs.sendMessage(currentTab.id, { 
      action: 'stopSelection' 
    });
    
    isSelectionMode = false;
    elements.selectContentBtn.textContent = 'コンテンツを選択';
    elements.selectContentBtn.classList.remove('active');
  } catch (error) {
    console.error('Failed to stop selection mode:', error);
  }
}

// 選択のクリア
function clearSelection() {
  selectedElement = null;
  elements.selectedContent.style.display = 'none';
  updateSaveButtonState();
}

// Notionへの保存処理
async function handleSaveToNotion() {
  const databaseId = elements.databaseSelect.value;
  
  if (!databaseId) {
    showError('データベースを選択してください');
    return;
  }
  
  try {
    // 保存ボタンをローディング状態に
    elements.saveToNotion.classList.add('loading');
    elements.saveToNotion.disabled = true;
    
    showProgress('コンテンツを抽出中...', 20);
    
    // コンテンツの抽出
    let extractResponse;
    try {
      extractResponse = await chrome.tabs.sendMessage(currentTab.id, {
        action: 'extractContent',
        elementSelector: selectedElement?.selector
      });
    } catch (extractError) {
      console.log('Content script not found during extraction, injecting...');
      
      // content scriptを手動で注入
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['src/content/content.js']
      });
      
      // CSSも注入
      await chrome.scripting.insertCSS({
        target: { tabId: currentTab.id },
        files: ['src/content/content.css']
      });
      
      // 少し待ってから再試行
      await new Promise(resolve => setTimeout(resolve, 500));
      
      extractResponse = await chrome.tabs.sendMessage(currentTab.id, {
        action: 'extractContent',
        elementSelector: selectedElement?.selector
      });
    }
    
    if (!extractResponse || !extractResponse.success) {
      throw new Error(extractResponse?.error || 'コンテンツの抽出に失敗しました');
    }
    
    showProgress('Notionに保存中...', 60);
    
    // Notionに保存
    let saveResponse;
    try {
      saveResponse = await chrome.runtime.sendMessage({
        action: 'saveToNotion',
        databaseId: databaseId,
        content: extractResponse.content
      });
    } catch (saveError) {
      console.error('Background script communication failed:', saveError);
      throw new Error('Background scriptとの通信に失敗しました。拡張機能を再読み込みしてください。');
    }
    
    if (!saveResponse || !saveResponse.success) {
      throw new Error(saveResponse?.error || 'Notionへの保存に失敗しました');
    }
    
    showProgress('保存完了', 100);
    
    // 成功通知を表示
    showSaveSuccess(saveResponse.pageUrl);
    
    // 履歴に追加
    await addToHistory({
      title: extractResponse.content.title || currentTab.title,
      url: currentTab.url,
      notionUrl: saveResponse.pageUrl,
      timestamp: Date.now(),
      blocks: extractResponse.content.blocks || 0
    });
    
    // 履歴を更新
    await loadHistory();
    
  } catch (error) {
    console.error('Save to Notion failed:', error);
    showError('保存に失敗しました: ' + error.message);
  } finally {
    // ローディング状態を解除
    elements.saveToNotion.classList.remove('loading');
    elements.saveToNotion.disabled = false;
    hideProgress();
  }
}

// 再試行処理
async function handleRetry() {
  hideError();
  await handleSaveToNotion();
}

// 履歴のクリア
async function handleClearHistory() {
  if (confirm('履歴をすべてクリアしますか？')) {
    await chrome.storage.local.remove('saveHistory');
    await loadHistory();
  }
}

// 履歴の読み込み
async function loadHistory() {
  try {
    const result = await chrome.storage.local.get('saveHistory');
    const history = result.saveHistory || [];
    
    updateHistoryDisplay(history);
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

// 履歴表示の更新
function updateHistoryDisplay(history) {
  if (history.length === 0) {
    elements.historyList.innerHTML = '<div class="no-history">履歴がありません</div>';
    return;
  }
  
  const historyHtml = history
    .slice(-5) // 最新5件のみ表示
    .reverse() // 新しい順に表示
    .map(item => `
      <div class="history-item" data-url="${item.notionUrl}">
        <div class="history-title">${escapeHtml(item.title)}</div>
        <div class="history-meta">
          <span>${formatDate(item.timestamp)}</span>
          <span>→ Notion</span>
        </div>
      </div>
    `).join('');
  
  elements.historyList.innerHTML = historyHtml;
  
  // 履歴項目のクリックイベント
  elements.historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url;
      if (url) {
        chrome.tabs.create({ url });
      }
    });
  });
}

// 履歴に項目を追加
function addToHistory(item) {
  const historyList = document.getElementById('historyList');
  
  const historyItem = document.createElement('div');
  historyItem.className = 'history-item';
  
  const title = item.title.length > 30 ? item.title.substring(0, 30) + '...' : item.title;
  const blocksInfo = item.blocks ? ` (${item.blocks}ブロック)` : '';
  
  historyItem.innerHTML = `
    <div class="history-title">${title}${blocksInfo}</div>
    <div class="history-meta">
      <span class="history-time">${item.timestamp}</span>
      ${item.pageUrl ? `<a href="${item.pageUrl}" target="_blank" class="history-link">Notionで開く</a>` : ''}
    </div>
  `;
  
  // 最新の項目を先頭に追加
  if (historyList.firstChild) {
    historyList.insertBefore(historyItem, historyList.firstChild);
  } else {
    historyList.appendChild(historyItem);
  }
  
  // 履歴が5個を超えたら古いものを削除
  while (historyList.children.length > 5) {
    historyList.removeChild(historyList.lastChild);
  }
  
  // ローカルストレージに保存
  saveHistoryToStorage();
}

// メッセージハンドラー
function handleMessage(message, sender, sendResponse) {
  console.log('Popup received message:', message);
  
  switch (message.action) {
    case 'elementSelected':
      selectedElement = message.element;
      showSelectedElement(message.element);
      updateSaveButtonState();
      break;
      
    case 'selectionCancelled':
      stopSelectionMode();
      break;
  }
}

// 選択された要素の表示
function showSelectedElement(element) {
  const previewText = `${element.tagName}: ${element.textContent}`;
  elements.selectedContent.querySelector('.preview-text').textContent = previewText;
  elements.selectedContent.style.display = 'block';
}

// 保存ボタンの状態更新
function updateSaveButtonState() {
  const hasDatabase = elements.databaseSelect.value && elements.databaseSelect.value !== 'create_default';
  const isLibeCity = currentTab && currentTab.url && currentTab.url.includes('libecity.com');
  
  elements.saveToNotion.disabled = !hasDatabase || !isLibeCity;
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

// 成功通知の表示
function showSaveSuccess(notionUrl) {
  elements.successNotification.style.display = 'block';
  elements.errorNotification.style.display = 'none';
  
  if (notionUrl) {
    elements.notionLink.href = notionUrl;
    elements.notionLink.style.display = 'inline-flex';
  } else {
    elements.notionLink.style.display = 'none';
  }
  
  // 3秒後に自動で隠す
  setTimeout(() => {
    elements.successNotification.style.display = 'none';
  }, 3000);
}

// 成功通知（一般）
function showSuccess(message) {
  // 簡単な成功通知を表示
  console.log('Success:', message);
}

// エラー表示
function showError(message) {
  elements.errorNotification.style.display = 'block';
  elements.successNotification.style.display = 'none';
  elements.errorMessage.textContent = message;
}

// エラー非表示
function hideError() {
  elements.errorNotification.style.display = 'none';
}

// ローディング表示
function showLoading(button) {
  if (button.classList.contains('refresh-btn')) {
    button.classList.add('spinning');
  }
}

// ローディング非表示
function hideLoading(button) {
  if (button.classList.contains('refresh-btn')) {
    button.classList.remove('spinning');
  }
}

// ユーティリティ関数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'たった今';
  if (diffMins < 60) return `${diffMins}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;
  
  return date.toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric'
  });
}

async function saveToNotionDatabase(databaseId) {
  const saveButton = document.getElementById('saveBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const successMessage = document.getElementById('successMessage');
  
  try {
    // UIの更新
    saveButton.disabled = true;
    saveButton.textContent = 'コンテンツを抽出中...';
    progressContainer.style.display = 'block';
    progressBar.style.width = '10%';
    progressText.textContent = 'コンテンツを抽出しています...';
    
    // アクティブタブの取得
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // コンテンツの抽出
    const extractResult = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'extractContent' }, resolve);
    });
    
    if (!extractResult.success) {
      throw new Error(extractResult.error || 'コンテンツの抽出に失敗しました');
    }
    
    // 進捗更新
    progressBar.style.width = '30%';
    progressText.textContent = 'Notionに保存中...';
    saveButton.textContent = 'Notionに保存中...';
    
    // Notionに保存
    const saveResult = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'saveToNotion',
        databaseId: databaseId,
        content: extractResult.content
      }, resolve);
    });
    
    if (saveResult.success) {
      // 成功時の処理
      progressBar.style.width = '100%';
      progressText.textContent = '保存完了！';
      
      // 詳細な結果表示
      let resultMessage = '✅ 保存が完了しました！';
      if (saveResult.totalBlocks) {
        resultMessage += `\n📝 ${saveResult.totalBlocks}個のブロックを保存`;
      }
      
      successMessage.innerHTML = resultMessage.replace(/\n/g, '<br>');
      successMessage.style.display = 'block';
      
      // 履歴に追加
      addToHistory({
        title: extractResult.content.title || 'Untitled',
        url: extractResult.content.url || tab.url,
        timestamp: new Date().toLocaleString(),
        pageUrl: saveResult.pageUrl,
        blocks: saveResult.totalBlocks || 0
      });
      
      // ボタンを復元
      setTimeout(() => {
        saveButton.disabled = false;
        saveButton.textContent = '保存';
        progressContainer.style.display = 'none';
        successMessage.style.display = 'none';
      }, 3000);
      
    } else {
      throw new Error(saveResult.error || '保存に失敗しました');
    }
    
  } catch (error) {
    console.error('Save error:', error);
    
    // エラー表示
    progressText.textContent = 'エラーが発生しました';
    progressBar.style.backgroundColor = '#ff4444';
    
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.textContent = `❌ ${error.message}`;
    errorMessage.style.cssText = `
      color: #ff4444;
      font-size: 12px;
      margin-top: 10px;
      padding: 8px;
      background: #fff2f2;
      border-radius: 4px;
      border: 1px solid #ffcccc;
    `;
    
    document.querySelector('.popup-main').appendChild(errorMessage);
    
    // エラー表示を3秒後に削除
    setTimeout(() => {
      errorMessage.remove();
      progressContainer.style.display = 'none';
      progressBar.style.backgroundColor = '#4CAF50';
    }, 3000);
    
    // ボタンを復元
    saveButton.disabled = false;
    saveButton.textContent = '保存';
  }
} 