// LibeCity to Notion - Popup Script
// ステップバイステップUIに対応したポップアップ機能

document.addEventListener('DOMContentLoaded', async function() {
  console.log('Popup loaded');
  
  // DOM要素の取得
  const elements = {
    // ステップ1: API設定
    apiKey: document.getElementById('apiKey'),
    toggleApiKey: document.getElementById('toggleApiKey'),
    testConnection: document.getElementById('testConnection'),
    connectionResult: document.getElementById('connectionResult'),
    step1Status: document.getElementById('step1Status'),
    
    // ステップ2: ページ確認
    checkPages: document.getElementById('checkPages'),
    pageCheckResult: document.getElementById('pageCheckResult'),
    step2Status: document.getElementById('step2Status'),
    
    // ステップ3: データベース作成
    createDatabase: document.getElementById('createDatabase'),
    databaseCreateResult: document.getElementById('databaseCreateResult'),
    step3Status: document.getElementById('step3Status'),
    
    // ステップ4: 完了
    databaseSelect: document.getElementById('databaseSelect'),
    refreshDatabases: document.getElementById('refreshDatabases'),
    completionMessage: document.getElementById('completionMessage'),
    step4Status: document.getElementById('step4Status'),
    
    // 詳細設定
    saveImages: document.getElementById('saveImages'),
    saveLinks: document.getElementById('saveLinks'),
    notifications: document.getElementById('notifications'),
    saveSettings: document.getElementById('saveSettings'),
    
    // その他
    pageStatusText: document.getElementById('pageStatusText'),
    progressSection: document.getElementById('progressSection'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    successNotification: document.getElementById('successNotification'),
    errorNotification: document.getElementById('errorNotification'),
    errorMessage: document.getElementById('errorMessage'),
    retryBtn: document.getElementById('retryBtn'),
    helpBtn: document.getElementById('helpBtn')
  };

  // 初期化
  await initializePopup();
  
  // イベントリスナーの設定
  setupEventListeners();

  // 初期化関数
  async function initializePopup() {
    try {
      // 現在のページ状態をチェック
      await checkCurrentPage();
      
      // 保存された設定を読み込み
      await loadSettings();
      
      // ステップ状態を更新
      await updateStepStates();
      
    } catch (error) {
      console.error('Initialization error:', error);
      showError('初期化エラー', error.message);
    }
  }

  // イベントリスナーの設定
  function setupEventListeners() {
    // APIキー表示切り替え
    if (elements.toggleApiKey) {
      elements.toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
    }
    
    // 接続テスト
    if (elements.testConnection) {
      elements.testConnection.addEventListener('click', testNotionConnection);
    }
    
    // APIキー入力時の処理
    if (elements.apiKey) {
      elements.apiKey.addEventListener('input', onApiKeyInput);
    }
    
    // ページ確認
    if (elements.checkPages) {
      elements.checkPages.addEventListener('click', checkNotionPages);
    }
    
    // データベース作成
    if (elements.createDatabase) {
      elements.createDatabase.addEventListener('click', createNotionDatabase);
    }
    
    // データベース更新
    if (elements.refreshDatabases) {
      elements.refreshDatabases.addEventListener('click', refreshDatabaseList);
    }
    
    // データベース選択
    if (elements.databaseSelect) {
      elements.databaseSelect.addEventListener('change', onDatabaseSelect);
    }
    
    // 設定保存
    if (elements.saveSettings) {
      elements.saveSettings.addEventListener('click', saveAdvancedSettings);
    }
    
    // ヘルプボタン
    if (elements.helpBtn) {
      elements.helpBtn.addEventListener('click', showHelp);
    }
  }

  // 現在のページ状態をチェック
  async function checkCurrentPage() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      if (currentTab && currentTab.url) {
        if (currentTab.url.includes('libecity.com')) {
          elements.pageStatusText.textContent = 'LibeCity ページ検出';
          elements.pageStatusText.parentElement.style.background = 'rgba(40, 167, 69, 0.2)';
        } else {
          elements.pageStatusText.textContent = '他のページ（LibeCityで使用推奨）';
          elements.pageStatusText.parentElement.style.background = 'rgba(255, 193, 7, 0.2)';
        }
      }
    } catch (error) {
      console.error('Page check error:', error);
      elements.pageStatusText.textContent = 'ページ状態不明';
    }
  }

  // 設定を読み込み
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'notionApiKey', 
        'notionDatabaseId',
        'saveImages',
        'saveLinks', 
        'notifications'
      ]);
      
      if (result.notionApiKey) {
        elements.apiKey.value = result.notionApiKey;
      }
      
      if (result.notionDatabaseId) {
        elements.databaseSelect.value = result.notionDatabaseId;
      }
      
      // 詳細設定
      elements.saveImages.checked = result.saveImages !== false;
      elements.saveLinks.checked = result.saveLinks !== false;
      elements.notifications.checked = result.notifications !== false;
      
    } catch (error) {
      console.error('Settings load error:', error);
    }
  }

  // ステップ状態を更新
  async function updateStepStates() {
    try {
      const result = await chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId']);
      
      // ステップ1: APIキー
      if (result.notionApiKey) {
        updateStepStatus('step1Status', '完了', 'complete');
        enableStep(2);
      } else {
        updateStepStatus('step1Status', '未設定', 'pending');
      }
      
      // ステップ2-4は条件に応じて更新
      if (result.notionApiKey) {
        updateStepStatus('step2Status', '待機中', 'active');
      }
      
      if (result.notionDatabaseId) {
        updateStepStatus('step3Status', '完了', 'complete');
        updateStepStatus('step4Status', '完了', 'complete');
        elements.completionMessage.style.display = 'block';
      }
      
    } catch (error) {
      console.error('Step state update error:', error);
    }
  }

  // APIキー表示切り替え
  function toggleApiKeyVisibility() {
    const input = elements.apiKey;
    if (input.type === 'password') {
      input.type = 'text';
      elements.toggleApiKey.textContent = '🙈';
    } else {
      input.type = 'password';
      elements.toggleApiKey.textContent = '👁️';
    }
  }

  // APIキー入力時の処理
  function onApiKeyInput() {
    const apiKey = elements.apiKey.value.trim();
    if (apiKey) {
      elements.testConnection.disabled = false;
      updateStepStatus('step1Status', '入力済み', 'active');
    } else {
      elements.testConnection.disabled = true;
      updateStepStatus('step1Status', '未設定', 'pending');
    }
  }

  // Notion接続テスト
  async function testNotionConnection() {
    const apiKey = elements.apiKey.value.trim();
    
    if (!apiKey) {
      showConnectionResult('APIキーを入力してください', 'error');
      return;
    }

    try {
      elements.testConnection.disabled = true;
      elements.testConnection.textContent = 'テスト中...';
      showConnectionResult('接続を確認中...', 'info');

      // Notion APIをテスト
      const response = await fetch('https://api.notion.com/v1/users/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28'
        }
      });

      if (response.ok) {
        const userData = await response.json();
        
        // APIキーを保存
        await chrome.storage.sync.set({ notionApiKey: apiKey });
        
        showConnectionResult('接続成功！', 'success');
        updateStepStatus('step1Status', '完了', 'complete');
        enableStep(2);
        
        console.log('Connection successful:', userData);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'API接続に失敗しました');
      }

    } catch (error) {
      console.error('Connection test error:', error);
      showConnectionResult(`接続エラー: ${error.message}`, 'error');
      updateStepStatus('step1Status', 'エラー', 'error');
    } finally {
      elements.testConnection.disabled = false;
      elements.testConnection.textContent = '接続テスト';
    }
  }

  // 接続結果を表示
  function showConnectionResult(message, type) {
    elements.connectionResult.textContent = message;
    elements.connectionResult.className = `connection-result ${type}`;
  }

  // Notionページ確認
  async function checkNotionPages() {
    try {
      const result = await chrome.storage.sync.get(['notionApiKey']);
      if (!result.notionApiKey) {
        showCheckResult('pageCheckResult', 'まずAPIキーを設定してください', 'error');
        return;
      }

      elements.checkPages.disabled = true;
      elements.checkPages.textContent = '確認中...';
      showCheckResult('pageCheckResult', 'ページを確認中...', 'info');

      // ページ一覧を取得
      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${result.notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: { property: 'object', value: 'page' }
        })
      });

      if (response.ok) {
        const data = await response.json();
        showCheckResult('pageCheckResult', `${data.results.length}個のページが見つかりました`, 'success');
        updateStepStatus('step2Status', '完了', 'complete');
        enableStep(3);
      } else {
        throw new Error('ページの取得に失敗しました');
      }

    } catch (error) {
      console.error('Page check error:', error);
      showCheckResult('pageCheckResult', `エラー: ${error.message}`, 'error');
    } finally {
      elements.checkPages.disabled = false;
      elements.checkPages.textContent = 'ページを確認';
    }
  }

  // データベース作成
  async function createNotionDatabase() {
    try {
      const result = await chrome.storage.sync.get(['notionApiKey']);
      if (!result.notionApiKey) {
        showCheckResult('databaseCreateResult', 'まずAPIキーを設定してください', 'error');
        return;
      }

      elements.createDatabase.disabled = true;
      elements.createDatabase.textContent = '作成中...';
      showCheckResult('databaseCreateResult', 'データベースを作成中...', 'info');

      // 最初に利用可能なページを取得
      const pagesResponse = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${result.notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: { property: 'object', value: 'page' }
        })
      });

      if (!pagesResponse.ok) {
        throw new Error('ページの取得に失敗しました');
      }

      const pagesData = await pagesResponse.json();
      if (pagesData.results.length === 0) {
        throw new Error('利用可能なページが見つかりません。Notionでページを作成し、統合を招待してください。');
      }

      const parentPage = pagesData.results[0];

      // データベースを作成
      const databaseResponse = await fetch('https://api.notion.com/v1/databases', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${result.notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parent: { page_id: parentPage.id },
          title: [{ text: { content: 'LibeCity Posts' } }],
          properties: {
            'Title': { title: {} },
            'URL': { url: {} },
            'Author': { rich_text: {} },
            'Chat': { rich_text: {} },
            'Date': { date: {} },
            'Tags': { multi_select: { options: [] } },
            'Status': { 
              select: { 
                options: [
                  { name: '新規', color: 'blue' },
                  { name: '確認済み', color: 'green' },
                  { name: 'アーカイブ', color: 'gray' }
                ] 
              } 
            }
          }
        })
      });

      if (databaseResponse.ok) {
        const databaseData = await databaseResponse.json();
        
        // データベースIDを保存
        await chrome.storage.sync.set({ notionDatabaseId: databaseData.id });
        
        showCheckResult('databaseCreateResult', 'データベースが正常に作成されました！', 'success');
        updateStepStatus('step3Status', '完了', 'complete');
        enableStep(4);
        
        // データベース一覧を更新
        await refreshDatabaseList();
        
      } else {
        const errorData = await databaseResponse.json();
        throw new Error(errorData.message || 'データベースの作成に失敗しました');
      }

    } catch (error) {
      console.error('Database creation error:', error);
      showCheckResult('databaseCreateResult', `エラー: ${error.message}`, 'error');
    } finally {
      elements.createDatabase.disabled = false;
      elements.createDatabase.textContent = '標準データベースを作成';
    }
  }

  // データベース一覧を更新
  async function refreshDatabaseList() {
    try {
      const result = await chrome.storage.sync.get(['notionApiKey']);
      if (!result.notionApiKey) return;

      elements.refreshDatabases.disabled = true;
      elements.refreshDatabases.querySelector('.refresh-icon').style.transform = 'rotate(360deg)';

      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${result.notionApiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: { property: 'object', value: 'database' }
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // セレクトボックスをクリア
        elements.databaseSelect.innerHTML = '<option value="">データベースを選択してください...</option>';
        
        // データベースを追加
        data.results.forEach(db => {
          const option = document.createElement('option');
          option.value = db.id;
          option.textContent = db.title[0]?.text?.content || 'Untitled Database';
          elements.databaseSelect.appendChild(option);
        });
        
        // 保存されたデータベースIDがあれば選択
        const savedResult = await chrome.storage.sync.get(['notionDatabaseId']);
        if (savedResult.notionDatabaseId) {
          elements.databaseSelect.value = savedResult.notionDatabaseId;
        }
      }

    } catch (error) {
      console.error('Database refresh error:', error);
    } finally {
      elements.refreshDatabases.disabled = false;
      elements.refreshDatabases.querySelector('.refresh-icon').style.transform = 'rotate(0deg)';
    }
  }

  // データベース選択時の処理
  async function onDatabaseSelect() {
    const selectedDatabaseId = elements.databaseSelect.value;
    
    if (selectedDatabaseId) {
      try {
        await chrome.storage.sync.set({ notionDatabaseId: selectedDatabaseId });
        updateStepStatus('step4Status', '完了', 'complete');
        elements.completionMessage.style.display = 'block';
      } catch (error) {
        console.error('Database selection error:', error);
      }
    }
  }

  // 詳細設定を保存
  async function saveAdvancedSettings() {
    try {
      await chrome.storage.sync.set({
        saveImages: elements.saveImages.checked,
        saveLinks: elements.saveLinks.checked,
        notifications: elements.notifications.checked
      });
      
      // 保存完了のフィードバック
      const originalText = elements.saveSettings.textContent;
      elements.saveSettings.textContent = '保存しました！';
      elements.saveSettings.style.background = '#28a745';
      
      setTimeout(() => {
        elements.saveSettings.textContent = originalText;
        elements.saveSettings.style.background = '';
      }, 2000);
      
    } catch (error) {
      console.error('Settings save error:', error);
    }
  }

  // ヘルプを表示
  function showHelp() {
    chrome.tabs.create({
      url: 'https://github.com/your-repo/libecity-to-notion/wiki'
    });
  }

  // ユーティリティ関数
  function updateStepStatus(elementId, text, status) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text;
      element.className = `step-status ${status}`;
    }
  }

  function enableStep(stepNumber) {
    const step = document.getElementById(`step${stepNumber}`);
    if (step) {
      step.classList.add('active');
    }
  }

  function showCheckResult(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
      element.className = `check-result ${type}`;
      element.style.display = 'block';
    }
  }

  function showError(title, message) {
    elements.errorMessage.textContent = `${title}: ${message}`;
    elements.errorNotification.style.display = 'block';
    
    setTimeout(() => {
      elements.errorNotification.style.display = 'none';
    }, 5000);
  }
}); 
