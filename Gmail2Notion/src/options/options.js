// オプション画面のメイン処理
document.addEventListener('DOMContentLoaded', function() {
  // DOM要素の取得
  const elements = {
    form: document.getElementById('basicSettingsForm'),
    apiKeyInput: document.getElementById('notionApiKey'),
    databaseIdInput: document.getElementById('notionDatabaseId'),
    testButton: document.getElementById('testConnection'),
    status: document.getElementById('status'),
    showNotificationsToggle: document.getElementById('showNotifications'),
    autoSaveToggle: document.getElementById('autoSave'),
    dbTitle: document.getElementById('dbTitle'),
    dbProperties: document.getElementById('dbProperties')
  };

  // 初期化
  initializeOptions();

  // イベントリスナーの設定
  setupEventListeners();

  /**
   * オプション画面の初期化
   */
  function initializeOptions() {
    loadSavedSettings();
    loadDatabaseInfo();
  }

  /**
   * イベントリスナーの設定
   */
  function setupEventListeners() {
    // フォーム送信
    elements.form.addEventListener('submit', handleFormSubmit);
    
    // 接続テストボタン
    elements.testButton.addEventListener('click', handleConnectionTest);
    
    // 通知設定の変更
    elements.showNotificationsToggle.addEventListener('change', handleNotificationToggle);
    
    // 自動保存設定の変更（将来の機能）
    elements.autoSaveToggle.addEventListener('change', handleAutoSaveToggle);

    // 入力値の変更監視
    elements.apiKeyInput.addEventListener('input', validateInputs);
    elements.databaseIdInput.addEventListener('input', validateInputs);
  }

  /**
   * 保存された設定の読み込み
   */
  async function loadSavedSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'notionApiKey',
        'notionDatabaseId',
        'showNotifications',
        'autoSave'
      ]);

      if (result.notionApiKey) {
        elements.apiKeyInput.value = result.notionApiKey;
      }

      if (result.notionDatabaseId) {
        elements.databaseIdInput.value = result.notionDatabaseId;
      }

      elements.showNotificationsToggle.checked = result.showNotifications !== false;
      elements.autoSaveToggle.checked = result.autoSave === true;

      validateInputs();
    } catch (error) {
      console.error('設定の読み込みに失敗しました:', error);
      showStatus('設定の読み込みに失敗しました', 'error');
    }
  }

  /**
   * データベース情報の読み込み
   */
  async function loadDatabaseInfo() {
    try {
      const result = await chrome.storage.sync.get(['databaseInfo']);
      if (result.databaseInfo) {
        updateDatabaseInfo(result.databaseInfo);
      }
    } catch (error) {
      console.error('データベース情報の読み込みに失敗しました:', error);
    }
  }

  /**
   * フォーム送信の処理
   */
  async function handleFormSubmit(event) {
    event.preventDefault();
    
    const apiKey = elements.apiKeyInput.value.trim();
    const databaseId = elements.databaseIdInput.value.trim();

    if (!apiKey || !databaseId) {
      showStatus('APIキーとデータベースIDを入力してください', 'error');
      return;
    }

    try {
      showStatus('設定を保存中...', 'loading');

      // 設定を保存
      await chrome.storage.sync.set({
        notionApiKey: apiKey,
        notionDatabaseId: databaseId,
        showNotifications: elements.showNotificationsToggle.checked,
        autoSave: elements.autoSaveToggle.checked
      });

      // 接続テストを実行
      const testResult = await testNotionConnection(apiKey, databaseId);
      
      if (testResult.success) {
        showStatus('設定が正常に保存されました', 'success');
        
        // データベース情報を更新
        if (testResult.databaseInfo) {
          await chrome.storage.sync.set({
            databaseInfo: testResult.databaseInfo
          });
          updateDatabaseInfo(testResult.databaseInfo);
        }
      } else {
        showStatus(`設定は保存されましたが、接続テストに失敗しました: ${testResult.error}`, 'error');
      }
    } catch (error) {
      console.error('設定の保存に失敗しました:', error);
      showStatus('設定の保存に失敗しました', 'error');
    }
  }

  /**
   * 接続テストの処理
   */
  async function handleConnectionTest() {
    const apiKey = elements.apiKeyInput.value.trim();
    const databaseId = elements.databaseIdInput.value.trim();

    if (!apiKey || !databaseId) {
      showStatus('APIキーとデータベースIDを入力してください', 'error');
      return;
    }

    try {
      showStatus('接続をテスト中...', 'loading');
      elements.testButton.disabled = true;

      const result = await testNotionConnection(apiKey, databaseId);
      
      if (result.success) {
        showStatus('接続テストが成功しました', 'success');
        
        if (result.databaseInfo) {
          updateDatabaseInfo(result.databaseInfo);
        }
      } else {
        showStatus(`接続テストに失敗しました: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('接続テストでエラーが発生しました:', error);
      showStatus('接続テストでエラーが発生しました', 'error');
    } finally {
      elements.testButton.disabled = false;
    }
  }

  /**
   * Notion接続テスト
   */
  async function testNotionConnection(apiKey, databaseId) {
    try {
      const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorData.message || 'Unknown error'}`
        };
      }

      const databaseData = await response.json();
      
      // 必要なプロパティの確認
      const properties = databaseData.properties;
      const hasTitle = Object.values(properties).some(prop => prop.type === 'title');
      const hasUrl = properties.URL && properties.URL.type === 'url';

      if (!hasTitle) {
        return {
          success: false,
          error: 'データベースにタイトルプロパティが見つかりません'
        };
      }

      return {
        success: true,
        databaseInfo: {
          title: databaseData.title?.[0]?.plain_text || 'Untitled Database',
          properties: Object.keys(properties).join(', '),
          hasRequiredProperties: hasTitle && hasUrl
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 通知設定の変更処理
   */
  async function handleNotificationToggle() {
    try {
      await chrome.storage.sync.set({
        showNotifications: elements.showNotificationsToggle.checked
      });
    } catch (error) {
      console.error('通知設定の保存に失敗しました:', error);
    }
  }

  /**
   * 自動保存設定の変更処理
   */
  async function handleAutoSaveToggle() {
    try {
      await chrome.storage.sync.set({
        autoSave: elements.autoSaveToggle.checked
      });
    } catch (error) {
      console.error('自動保存設定の保存に失敗しました:', error);
    }
  }

  /**
   * 入力値の検証
   */
  function validateInputs() {
    const apiKey = elements.apiKeyInput.value.trim();
    const databaseId = elements.databaseIdInput.value.trim();
    
    const isApiKeyValid = apiKey.startsWith('secret_') && apiKey.length > 20;
    const isDatabaseIdValid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(databaseId) ||
                             /^[a-f0-9]{32}$/i.test(databaseId);

    // APIキーの入力フィールドのスタイル更新
    if (apiKey && !isApiKeyValid) {
      elements.apiKeyInput.style.borderColor = '#ef4444';
    } else {
      elements.apiKeyInput.style.borderColor = '';
    }

    // データベースIDの入力フィールドのスタイル更新
    if (databaseId && !isDatabaseIdValid) {
      elements.databaseIdInput.style.borderColor = '#ef4444';
    } else {
      elements.databaseIdInput.style.borderColor = '';
    }

    // ボタンの有効/無効状態を更新
    const isFormValid = isApiKeyValid && isDatabaseIdValid;
    elements.testButton.disabled = !isFormValid;
  }

  /**
   * ステータス表示
   */
  function showStatus(message, type = 'info') {
    elements.status.className = `status ${type}`;
    elements.status.textContent = message;
    elements.status.classList.remove('hidden');

    // 成功メッセージは3秒後に非表示
    if (type === 'success') {
      setTimeout(() => {
        elements.status.classList.add('hidden');
      }, 3000);
    }
  }

  /**
   * データベース情報の更新
   */
  function updateDatabaseInfo(info) {
    elements.dbTitle.textContent = info.title || '-';
    elements.dbProperties.textContent = info.properties || '-';
    
    // 必要なプロパティが不足している場合の警告
    if (!info.hasRequiredProperties) {
      const warning = document.createElement('div');
      warning.className = 'status error';
      warning.style.marginTop = '1rem';
      warning.textContent = '警告: データベースに必要なプロパティ（タイトル、URL）が不足している可能性があります';
      
      const databaseInfo = document.getElementById('databaseInfo');
      const existingWarning = databaseInfo.querySelector('.status.error');
      if (existingWarning) {
        existingWarning.remove();
      }
      databaseInfo.appendChild(warning);
    }
  }

  /**
   * エラーハンドリング
   */
  window.addEventListener('error', function(event) {
    console.error('グローバルエラー:', event.error);
    showStatus('予期しないエラーが発生しました', 'error');
  });

  // 未処理のPromise拒否をキャッチ
  window.addEventListener('unhandledrejection', function(event) {
    console.error('未処理のPromise拒否:', event.reason);
    showStatus('予期しないエラーが発生しました', 'error');
  });
}); 