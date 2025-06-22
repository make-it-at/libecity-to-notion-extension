// LibeCity to Notion - Options Script

document.addEventListener('DOMContentLoaded', function() {
  console.log('Options page loaded');
  
  // DOM要素の取得
  const elements = {
    apiKey: document.getElementById('apiKey'),
    toggleApiKey: document.getElementById('toggleApiKey'),
    testConnection: document.getElementById('testConnection'),
    connectionResult: document.getElementById('connectionResult'),
    openNotionAuth: document.getElementById('openNotionAuth'),
    createWorkspace: document.getElementById('createWorkspace'),
    openIntegrationGuide: document.getElementById('openIntegrationGuide'),
    checkIntegrationStatus: document.getElementById('checkIntegrationStatus'),
    saveImages: document.getElementById('saveImages'),
    saveLinks: document.getElementById('saveLinks'),
    notifications: document.getElementById('notifications'),
    defaultDatabase: document.getElementById('defaultDatabase'),
    refreshDatabases: document.getElementById('refreshDatabases'),
    totalSaved: document.getElementById('totalSaved'),
    lastSaved: document.getElementById('lastSaved'),
    errorCount: document.getElementById('errorCount'),
    exportSettings: document.getElementById('exportSettings'),
    importSettings: document.getElementById('importSettings'),
    importFile: document.getElementById('importFile'),
    clearHistory: document.getElementById('clearHistory'),
    resetSettings: document.getElementById('resetSettings'),
    saveSettings: document.getElementById('saveSettings'),
    cancelSettings: document.getElementById('cancelSettings'),
    notification: document.getElementById('notification')
  };

  // 初期化
  init();

  async function init() {
    try {
      await loadSettings();
      await loadStats();
      await loadDatabases();
      setupEventListeners();
      console.log('Options page initialized');
    } catch (error) {
      console.error('Failed to initialize options page:', error);
      showNotification('初期化に失敗しました', 'error');
    }
  }

  // 設定の読み込み
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || {};

      elements.apiKey.value = settings.apiKey || '';
      elements.saveImages.checked = settings.saveImages !== false;
      elements.saveLinks.checked = settings.saveLinks !== false;
      elements.notifications.checked = settings.notifications !== false;
      elements.defaultDatabase.value = settings.defaultDatabase || '';

      console.log('Settings loaded');
    } catch (error) {
      console.error('Failed to load settings:', error);
      showNotification('設定の読み込みに失敗しました', 'error');
    }
  }

  // 統計情報の読み込み
  async function loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStats' });
      
      if (response && response.success) {
        const stats = response.stats;
        elements.totalSaved.textContent = stats.totalSaved || 0;
        elements.lastSaved.textContent = stats.lastSaved ? 
          new Date(stats.lastSaved).toLocaleString('ja-JP') : '未実行';
        elements.errorCount.textContent = stats.errors || 0;
      } else {
        elements.totalSaved.textContent = '0';
        elements.lastSaved.textContent = '未実行';
        elements.errorCount.textContent = '0';
      }

      console.log('Stats loaded');
    } catch (error) {
      console.error('Failed to load stats:', error);
      elements.totalSaved.textContent = '-';
      elements.lastSaved.textContent = '-';
      elements.errorCount.textContent = '-';
    }
  }

  // データベース一覧の読み込み
  async function loadDatabases() {
    try {
      const apiKey = elements.apiKey.value.trim();
      if (!apiKey) {
        elements.defaultDatabase.innerHTML = '<option value="">APIキーを設定してください</option>';
        return;
      }

      elements.refreshDatabases.disabled = true;
      elements.refreshDatabases.textContent = '読み込み中...';

      const response = await chrome.runtime.sendMessage({ action: 'getDatabases' });
      
      elements.defaultDatabase.innerHTML = '<option value="">選択してください...</option>';
      
      if (response && response.success) {
        response.databases.forEach(db => {
          const option = document.createElement('option');
          option.value = db.id;
          option.textContent = db.title || '無題のデータベース';
          elements.defaultDatabase.appendChild(option);
        });
        
        // 現在の設定値を復元
        const result = await chrome.storage.sync.get('settings');
        const settings = result.settings || {};
        if (settings.defaultDatabase) {
          elements.defaultDatabase.value = settings.defaultDatabase;
        }
        
        console.log(`${response.databases.length} databases loaded`);
      } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = response?.error || 'データベースの取得に失敗しました';
        elements.defaultDatabase.appendChild(option);
      }
    } catch (error) {
      console.error('Failed to load databases:', error);
      elements.defaultDatabase.innerHTML = '<option value="">エラーが発生しました</option>';
    } finally {
      elements.refreshDatabases.disabled = false;
      elements.refreshDatabases.textContent = '更新';
    }
  }

  // イベントリスナーの設定
  function setupEventListeners() {
    // APIキー表示切り替え
    elements.toggleApiKey.addEventListener('click', function() {
      if (elements.apiKey.type === 'password') {
        elements.apiKey.type = 'text';
        elements.toggleApiKey.textContent = '非表示';
      } else {
        elements.apiKey.type = 'password';
        elements.toggleApiKey.textContent = '表示';
      }
    });

    // 接続テスト
    elements.testConnection.addEventListener('click', async function() {
      console.log('Connection test button clicked');
      await testConnection();
    });

    // データベース更新
    elements.refreshDatabases.addEventListener('click', async function() {
      await loadDatabases();
    });

    // APIキー変更時にデータベース一覧をクリア
    elements.apiKey.addEventListener('input', function() {
      elements.defaultDatabase.innerHTML = '<option value="">APIキーを保存後に更新してください</option>';
      elements.connectionResult.textContent = '';
      elements.connectionResult.className = 'connection-result';
    });

    // 設定保存
    elements.saveSettings.addEventListener('click', async function() {
      await saveSettings();
    });

    // キャンセル
    elements.cancelSettings.addEventListener('click', function() {
      window.close();
    });

    // エクスポート
    elements.exportSettings.addEventListener('click', async function() {
      await exportSettings();
    });

    // インポート
    elements.importSettings.addEventListener('click', function() {
      elements.importFile.click();
    });

    elements.importFile.addEventListener('change', async function(e) {
      if (e.target.files.length > 0) {
        await importSettings(e.target.files[0]);
      }
    });

    // 履歴クリア
    elements.clearHistory.addEventListener('click', async function() {
      if (confirm('履歴をクリアしますか？この操作は取り消せません。')) {
        await clearHistory();
      }
    });

    // Notion認証ページを開く
    elements.openNotionAuth.addEventListener('click', async function() {
      await openNotionAuth();
    });

    // ワークスペース作成
    elements.createWorkspace.addEventListener('click', async function() {
      await createWorkspace();
    });

    // 統合招待ガイド
    elements.openIntegrationGuide.addEventListener('click', function() {
      openIntegrationGuide();
    });

    // 統合状態確認
    elements.checkIntegrationStatus.addEventListener('click', async function() {
      await checkIntegrationStatus();
    });

    // 設定リセット
    elements.resetSettings.addEventListener('click', async function() {
      if (confirm('設定をリセットしますか？この操作は取り消せません。')) {
        await resetSettings();
      }
    });

    // 通知の閉じるボタン
    const notificationClose = document.querySelector('.notification-close');
    if (notificationClose) {
      notificationClose.addEventListener('click', function() {
        elements.notification.style.display = 'none';
      });
    }

    // キーボードショートカット
    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            saveSettings();
            break;
          case 't':
            e.preventDefault();
            testConnection();
            break;
        }
      }
    });

    console.log('Event listeners setup complete');
  }

  // 接続テスト
  async function testConnection() {
    try {
      console.log('Starting connection test...');
      
      const apiKey = elements.apiKey.value.trim();
      if (!apiKey) {
        showConnectionResult('APIキーを入力してください', 'error');
        return;
      }

      // まず設定を一時保存
      await chrome.storage.sync.set({
        settings: {
          apiKey: apiKey,
          saveImages: elements.saveImages.checked,
          saveLinks: elements.saveLinks.checked,
          notifications: elements.notifications.checked,
          defaultDatabase: elements.defaultDatabase.value
        }
      });

      elements.testConnection.disabled = true;
      elements.testConnection.textContent = 'テスト中...';
      showConnectionResult('接続をテストしています...', 'info');

      console.log('Sending test connection message to background...');
      const response = await chrome.runtime.sendMessage({ action: 'testConnection' });
      console.log('Connection test response:', response);

      if (response && response.success) {
        const user = response.user;
        showConnectionResult(`接続成功！ユーザー: ${user.name || user.id}`, 'success');
        
        // 接続成功後にデータベース一覧を更新
        setTimeout(() => {
          loadDatabases();
        }, 1000);
      } else {
        const errorMsg = response?.error || '接続に失敗しました';
        showConnectionResult(`接続失敗: ${errorMsg}`, 'error');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      showConnectionResult(`エラー: ${error.message}`, 'error');
    } finally {
      elements.testConnection.disabled = false;
      elements.testConnection.textContent = '接続テスト';
    }
  }

  // 接続結果の表示
  function showConnectionResult(message, type) {
    elements.connectionResult.textContent = message;
    elements.connectionResult.className = `connection-result ${type}`;
    console.log(`Connection result: ${message} (${type})`);
  }

  // 設定の保存
  async function saveSettings() {
    try {
      const settings = {
        apiKey: elements.apiKey.value.trim(),
        saveImages: elements.saveImages.checked,
        saveLinks: elements.saveLinks.checked,
        notifications: elements.notifications.checked,
        defaultDatabase: elements.defaultDatabase.value
      };

      await chrome.storage.sync.set({ settings });
      showNotification('設定を保存しました', 'success');
      console.log('Settings saved:', settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
      showNotification('設定の保存に失敗しました', 'error');
    }
  }

  // 設定のエクスポート
  async function exportSettings() {
    try {
      const result = await chrome.storage.sync.get(['settings']);
      const settings = result.settings || {};
      
      // APIキーを除外
      const exportData = { ...settings };
      delete exportData.apiKey;
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `libecity-to-notion-settings-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      showNotification('設定をエクスポートしました', 'success');
    } catch (error) {
      console.error('Failed to export settings:', error);
      showNotification('エクスポートに失敗しました', 'error');
    }
  }

  // 設定のインポート
  async function importSettings(file) {
    try {
      const text = await file.text();
      const importedSettings = JSON.parse(text);
      
      const currentResult = await chrome.storage.sync.get(['settings']);
      const currentSettings = currentResult.settings || {};
      
      // APIキーは保持
      const newSettings = {
        ...currentSettings,
        ...importedSettings,
        apiKey: currentSettings.apiKey
      };
      
      await chrome.storage.sync.set({ settings: newSettings });
      await loadSettings();
      
      showNotification('設定をインポートしました', 'success');
    } catch (error) {
      console.error('Failed to import settings:', error);
      showNotification('インポートに失敗しました', 'error');
    }
  }

  // 履歴のクリア
  async function clearHistory() {
    try {
      await chrome.storage.local.clear();
      await loadStats();
      showNotification('履歴をクリアしました', 'success');
    } catch (error) {
      console.error('Failed to clear history:', error);
      showNotification('履歴のクリアに失敗しました', 'error');
    }
  }

  // 設定のリセット
  async function resetSettings() {
    try {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      await loadSettings();
      await loadStats();
      elements.defaultDatabase.innerHTML = '<option value="">選択してください...</option>';
      showNotification('設定をリセットしました', 'success');
    } catch (error) {
      console.error('Failed to reset settings:', error);
      showNotification('設定のリセットに失敗しました', 'error');
    }
  }

  // 通知の表示
  // Notion認証ページを開く
  async function openNotionAuth() {
    try {
      elements.openNotionAuth.disabled = true;
      elements.openNotionAuth.textContent = '開いています...';
      
      const response = await chrome.runtime.sendMessage({ action: 'openNotionAuth' });
      
      if (response && response.success) {
        showNotification(response.message, 'success');
      } else {
        showNotification(response?.error || 'エラーが発生しました', 'error');
      }
    } catch (error) {
      console.error('Failed to open Notion auth:', error);
      showNotification('認証ページを開けませんでした', 'error');
    } finally {
      elements.openNotionAuth.disabled = false;
      elements.openNotionAuth.textContent = '🔗 Notion認証ページを開く';
    }
  }

  // ワークスペース作成
  async function createWorkspace() {
    try {
      const workspaceName = prompt('ワークスペース名を入力してください:', 'LibeCity Workspace');
      if (!workspaceName) return;
      
      elements.createWorkspace.disabled = true;
      elements.createWorkspace.textContent = '作成中...';
      
      const response = await chrome.runtime.sendMessage({ 
        action: 'createWorkspace',
        workspaceName: workspaceName
      });
      
      if (response && response.success) {
        showNotification(response.message, 'success');
        // データベース一覧を更新
        await loadDatabases();
      } else {
        showNotification(response?.error || 'ワークスペースの作成に失敗しました', 'error');
      }
    } catch (error) {
      console.error('Failed to create workspace:', error);
      showNotification('ワークスペースの作成に失敗しました', 'error');
    } finally {
      elements.createWorkspace.disabled = false;
      elements.createWorkspace.textContent = '🏗️ ワークスペースを作成';
    }
  }

  // 統合招待ガイドを開く
  function openIntegrationGuide() {
    const guideContent = `
📖 Notion統合の招待手順

1. 統合作成完了後の重要なステップ：
   - 作成した統合は、まだどのページにもアクセスできません
   - 使用したいページやデータベースに統合を招待する必要があります

2. 統合を招待する方法：
   - Notionで使用したいページを開く
   - 右上の「共有」ボタンをクリック
   - 「招待」欄に統合名を入力（例：「Snipo」）
   - 統合を選択して招待

3. データベースの場合：
   - データベースページで「共有」→「招待」
   - 統合に「編集」権限を付与

4. 確認方法：
   - 下の「✅ 統合状態を確認」ボタンで接続をテスト
   - 成功すれば統合が正しく設定されています

この手順を完了すると、拡張機能がNotionにアクセスできるようになります。
    `;
    
    alert(guideContent);
  }

  // 統合状態を確認
  async function checkIntegrationStatus() {
    try {
      elements.checkIntegrationStatus.disabled = true;
      elements.checkIntegrationStatus.textContent = '確認中...';
      
      // APIキーが設定されているかチェック
      const apiKey = elements.apiKey.value.trim();
      if (!apiKey) {
        showNotification('APIキーが設定されていません', 'error');
        return;
      }
      
      // 接続テストを実行
      const response = await chrome.runtime.sendMessage({ action: 'testConnection' });
      
      if (response && response.success) {
        // データベース一覧を取得してみる
        const dbResponse = await chrome.runtime.sendMessage({ action: 'getDatabases' });
        
        if (dbResponse && dbResponse.success && dbResponse.databases.length > 0) {
          showNotification(`✅ 統合が正常に動作しています！（${dbResponse.databases.length}個のデータベースにアクセス可能）`, 'success');
        } else {
          showNotification('⚠️ 統合は接続されていますが、アクセス可能なデータベースがありません。統合をページに招待してください。', 'info');
        }
      } else {
        showNotification(`❌ 統合の接続に失敗しました: ${response?.error || '不明なエラー'}`, 'error');
      }
    } catch (error) {
      console.error('Failed to check integration status:', error);
      showNotification('統合状態の確認に失敗しました', 'error');
    } finally {
      elements.checkIntegrationStatus.disabled = false;
      elements.checkIntegrationStatus.textContent = '✅ 統合状態を確認';
    }
  }

  function showNotification(message, type = 'info') {
    const notificationText = elements.notification.querySelector('.notification-text');
    notificationText.textContent = message;
    elements.notification.className = `notification ${type}`;
    elements.notification.style.display = 'block';
    
    // 3秒後に自動で閉じる
    setTimeout(() => {
      elements.notification.style.display = 'none';
    }, 3000);
    
    console.log(`Notification: ${message} (${type})`);
  }
}); 