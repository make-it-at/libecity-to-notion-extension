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
      
      // APIキーが入力されている場合、接続テストボタンを有効にする
      const apiKeyValue = elements.apiKey.value.trim();
      if (apiKeyValue && elements.testConnection) {
        elements.testConnection.disabled = false;
      } else if (elements.testConnection) {
        elements.testConnection.disabled = true;
      }
      
      // データベース一覧を更新
      await loadDatabases();
      
    } catch (error) {
      console.error('Initialization error:', error);
      showError('初期化エラー', error.message);
    }
  }

  // イベントリスナーの設定
  function setupEventListeners() {
    console.log("Setting up event listeners");
    
    // APIキー表示切り替え
    if (elements.toggleApiKey) {
      elements.toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
      console.log("Toggle API key listener added");
    }
    
    // 接続テスト
    if (elements.testConnection) {
      elements.testConnection.addEventListener('click', testNotionConnection);
      console.log("Test connection listener added");
    }
    
    // APIキー入力時の処理
    if (elements.apiKey) {
      elements.apiKey.addEventListener('input', onApiKeyInput);
      console.log("API key input listener added");
    }
    
    // ページ確認
    if (elements.checkPages) {
      elements.checkPages.addEventListener('click', checkNotionPages);
      console.log("Check pages listener added");
    }
    
    // データベース作成
    if (elements.createDatabase) {
      elements.createDatabase.addEventListener('click', createNotionDatabase);
      console.log("Create database listener added");
    }
    
    // データベース更新
    if (elements.refreshDatabases) {
      elements.refreshDatabases.addEventListener('click', loadDatabases);
      console.log("Refresh databases listener added");
    }
    
    // データベース選択
    if (elements.databaseSelect) {
      elements.databaseSelect.addEventListener('change', onDatabaseSelect);
      console.log("Database select listener added");
    }
    
    // 設定保存
    if (elements.saveSettings) {
      elements.saveSettings.addEventListener('click', saveAdvancedSettings);
      console.log("Save settings listener added");
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
        // APIキーが既に入力されている場合、接続テストボタンを有効にする
        if (elements.testConnection) {
          elements.testConnection.disabled = false;
        }
      } else {
        // APIキーがない場合は接続テストボタンを無効にする
        elements.testConnection.disabled = true;
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
        // APIキーがある場合、接続テストボタンを有効にする
        if (elements.testConnection) {
          elements.testConnection.disabled = false;
        }
      } else {
        updateStepStatus('step1Status', '未設定', 'pending');
        // APIキーがない場合、接続テストボタンを無効にする
        if (elements.testConnection) {
          elements.testConnection.disabled = true;
        }
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
    console.log("API key input detected");
    const apiKey = elements.apiKey.value.trim();
    console.log("API key length:", apiKey.length);
    
    if (apiKey && elements.testConnection) {
      elements.testConnection.disabled = false;
      updateStepStatus('step1Status', '入力済み', 'active');
      console.log("Test connection button enabled");
    } else if (elements.testConnection) {
      elements.testConnection.disabled = true;
      updateStepStatus('step1Status', '未設定', 'pending');
      console.log("Test connection button disabled");
    }
  }

  // Notion接続テスト
  async function testNotionConnection() {
    console.log("Test connection clicked");
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
        
        // データベース一覧を更新
        await loadDatabases();
        
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
    const result = await chrome.storage.sync.get(['notionApiKey']);
    const apiKey = result.notionApiKey;
    
    if (!apiKey) {
      showPageCheckResult('pageCheckResult', 'まずAPIキーを設定してください', 'error');
      return;
    }

    try {
      elements.checkPages.disabled = true;
      elements.checkPages.textContent = '確認中...';
      showPageCheckResult('pageCheckResult', 'ページを確認中...', 'info');

      // ページ一覧を取得
      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: { property: 'object', value: 'page' },
          page_size: 10
        })
      });

      if (response.ok) {
        const data = await response.json();
        const pageCount = data.results.length;
        
        if (pageCount > 0) {
          showPageCheckResult('pageCheckResult', `${pageCount}個のページにアクセス可能です`, 'success');
          updateStepStatus('step2Status', '完了', 'complete');
          enableStep(3);
        } else {
          showPageCheckResult('pageCheckResult', '⚠️ アクセス可能なページがありません。統合を招待してください', 'warning');
          updateStepStatus('step2Status', '要設定', 'warning');
        }
      } else {
        throw new Error('ページの取得に失敗しました');
      }

    } catch (error) {
      console.error('Page check error:', error);
      showPageCheckResult('pageCheckResult', `エラー: ${error.message}`, 'error');
    } finally {
      elements.checkPages.disabled = false;
      elements.checkPages.textContent = 'ページを確認';
    }
  }

  // データベース作成
  async function createNotionDatabase() {
    console.log("Creating Notion database...");
    const result = await chrome.storage.sync.get(["notionApiKey"]);
    const apiKey = result.notionApiKey;
    
    if (!apiKey) {
      showDatabaseCreateResult("先にAPIキーを設定してください", "error");
      return;
    }

    try {
      elements.createDatabase.disabled = true;
      elements.createDatabase.innerHTML = '<span class="icon">⏳</span>作成中...';
      showDatabaseCreateResult("データベースを作成中...", "info");

      // まず利用可能なページを取得
      const searchResponse = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          filter: {
            value: "page",
            property: "object"
          },
          page_size: 1
        })
      });

      if (!searchResponse.ok) {
        throw new Error("親ページの取得に失敗しました");
      }

      const searchData = await searchResponse.json();
      if (searchData.results.length === 0) {
        throw new Error("利用可能なページがありません。統合を招待してください");
      }

      const parentPageId = searchData.results[0].id;
      console.log("Parent page ID:", parentPageId);

      // データベースを作成
      const createResponse = await fetch("https://api.notion.com/v1/databases", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          parent: {
            type: "page_id",
            page_id: parentPageId
          },
          title: [
            {
              type: "text",
              text: {
                content: "LibeCity Posts"
              }
            }
          ],
          properties: {
            "Title": {
              title: {}
            },
            "URL": {
              url: {}
            },
            "Author": {
              rich_text: {}
            },
            "Chat": {
              rich_text: {}
            },
            "Date": {
              date: {}
            },
            "Tags": {
              multi_select: {
                options: []
              }
            },
            "Status": {
              select: {
                options: [
                  {
                    name: "保存済み",
                    color: "green"
                  },
                  {
                    name: "処理中",
                    color: "yellow"
                  }
                ]
              }
            }
          }
        })
      });

      if (createResponse.ok) {
        const database = await createResponse.json();
        console.log("Created database:", database);
        console.log("Database ID:", database.id);
        
        // データベースIDを保存
        await chrome.storage.sync.set({ 
          notionDatabaseId: database.id,
          databaseTitle: database.title[0]?.plain_text || "LibeCity Posts"
        });
        
        console.log("Database ID saved to storage:", database.id);
        
        // 保存されたことを確認
        const verification = await chrome.storage.sync.get(["notionDatabaseId"]);
        console.log("Verification - saved database ID:", verification.notionDatabaseId);
        
        showDatabaseCreateResult("✅ データベースが作成されました", "success");
        updateStepStatus("step3Status", "完了", "complete");
        enableStep(4);
        
        // データベース一覧を再読み込みして、作成されたデータベースを選択
        await loadDatabases();
        
        // 作成されたデータベースを自動選択
        if (elements.databaseSelect) {
          elements.databaseSelect.value = database.id;
          // 選択イベントを手動で発火
          await onDatabaseSelect();
        }
        
      } else {
        const errorData = await createResponse.json();
        console.error("Database creation failed:", errorData);
        throw new Error(errorData.message || "データベースの作成に失敗しました");
      }

    } catch (error) {
      console.error("Database creation error:", error);
      showDatabaseCreateResult(`エラー: ${error.message}`, "error");
      updateStepStatus("step3Status", "エラー", "error");
    } finally {
      elements.createDatabase.disabled = false;
      elements.createDatabase.innerHTML = '<span class="icon">➕</span>標準データベースを作成';
    }
  }

  // データベース一覧を更新
  async function loadDatabases() {
    const result = await chrome.storage.sync.get(['notionApiKey']);
    const apiKey = result.notionApiKey;
    
    if (!apiKey || !elements.databaseSelect) {
      return;
    }

    try {
      if (elements.refreshDatabases) {
        elements.refreshDatabases.disabled = true;
      }

      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
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
      if (elements.refreshDatabases) {
        elements.refreshDatabases.disabled = false;
      }
    }
  }

  // データベース選択時の処理
  async function onDatabaseSelect() {
    const selectedDatabaseId = elements.databaseSelect.value;
    console.log('Database selection changed:', selectedDatabaseId);
    
    if (selectedDatabaseId) {
      try {
        // データベースIDを保存
        await chrome.storage.sync.set({ notionDatabaseId: selectedDatabaseId });
        
        // データベースIDの診断情報を表示
        console.log('=== DATABASE ID DIAGNOSTIC ===');
        console.log('Selected ID:', selectedDatabaseId);
        console.log('ID length:', selectedDatabaseId.length);
        console.log('ID format valid:', /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(selectedDatabaseId));
        
        // 保存確認
        const verification = await chrome.storage.sync.get('notionDatabaseId');
        console.log('Storage verification:', verification.notionDatabaseId === selectedDatabaseId ? '✓ MATCH' : '✗ MISMATCH');
        console.log('Stored value:', verification.notionDatabaseId);
        console.log('Selected database name:', elements.databaseSelect.selectedOptions[0]?.textContent || 'Unknown');
        console.log('===============================');
        
        // UIを更新
        updateStepStatus('step4Status', '完了', 'complete');
        elements.completionMessage.style.display = 'block';
        
        console.log('✅ Database selection completed successfully');
        
      } catch (error) {
        console.error('❌ Database selection error:', error);
      }
    } else {
      // 選択解除の場合
      try {
        await chrome.storage.sync.remove('notionDatabaseId');
        updateStepStatus('step4Status', '未選択', 'pending');
        elements.completionMessage.style.display = 'none';
        console.log('Database selection cleared');
      } catch (error) {
        console.error('Database deselection error:', error);
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

  function disableStep(stepNumber) {
    const step = document.getElementById(`step${stepNumber}`);
    if (step) {
      step.classList.add('disabled');
    }
  }

  function showPageCheckResult(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
      element.className = `check-result ${type}`;
      element.style.display = 'block';
    }
  }

  function showDatabaseCreateResult(elementId, message, type) {
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

  // データベース選択の処理
  async function handleDatabaseChange() {
    const selectedDatabase = elements.databaseSelect.value;
    console.log("Database selection changed:", selectedDatabase);
    
    // 選択されたデータベースを保存
    try {
      await chrome.storage.sync.set({ selectedDatabase });
      
      // データベースIDの診断情報を表示
      if (selectedDatabase) {
        console.log("=== DATABASE ID DIAGNOSTIC ===");
        console.log("Selected ID:", selectedDatabase);
        console.log("ID length:", selectedDatabase.length);
        console.log("ID format valid:", /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(selectedDatabase));
        
        // 保存確認
        const verification = await chrome.storage.sync.get("selectedDatabase");
        console.log("Storage verification:", verification.selectedDatabase === selectedDatabase ? "✓ MATCH" : "✗ MISMATCH");
        console.log("===============================");
      }
    } catch (error) {
      console.error('Failed to save database selection:', error);
    }
  }
}); 
