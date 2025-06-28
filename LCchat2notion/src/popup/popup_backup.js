// LibeCity to Notion - Popup Script
console.log("Popup script loaded");

document.addEventListener("DOMContentLoaded", async function() {
  console.log("DOM Content Loaded");
  
  // DOM要素の取得
  const elements = {
    apiKey: document.getElementById("apiKey"),
    toggleApiKey: document.getElementById("toggleApiKey"),
    testConnection: document.getElementById("testConnection"),
    connectionResult: document.getElementById("connectionResult"),
    step1Status: document.getElementById("step1Status"),
    step2Status: document.getElementById("step2Status"),
    step3Status: document.getElementById("step3Status"),
    step4Status: document.getElementById("step4Status"),
    pageStatusText: document.getElementById("pageStatusText"),
    checkPages: document.getElementById("checkPages"),
    pageCheckResult: document.getElementById("pageCheckResult"),
    createDatabase: document.getElementById("createDatabase"),
    databaseCreateResult: document.getElementById("databaseCreateResult"),
    databaseSelect: document.getElementById("databaseSelect"),
    refreshDatabases: document.getElementById("refreshDatabases"),
    saveSettings: document.getElementById("saveSettings"),
    saveImages: document.getElementById("saveImages"),
    saveLinks: document.getElementById("saveLinks"),
    notifications: document.getElementById("notifications"),
    completionMessage: document.getElementById("completionMessage")
  };

  // DOM要素の存在確認
  console.log("Elements found:", {
    apiKey: !!elements.apiKey,
    testConnection: !!elements.testConnection,
    toggleApiKey: !!elements.toggleApiKey
  });

  // 初期化
  await initializePopup();
  setupEventListeners();

  async function initializePopup() {
    console.log("Initializing popup...");
    try {
      // 接続テストボタンを初期状態で有効にする
      if (elements.testConnection) {
        elements.testConnection.disabled = false;
        console.log("Test connection button enabled initially");
      }
      
      await checkCurrentPage();
      await loadSettings();
      await updateStepStates();
      await loadDatabases();
    } catch (error) {
      console.error("Initialization error:", error);
    }
  }

  function setupEventListeners() {
    console.log("Setting up event listeners...");
    
    if (elements.toggleApiKey) {
      elements.toggleApiKey.addEventListener("click", toggleApiKeyVisibility);
      console.log("Toggle API key listener added");
    } else {
      console.log("Toggle API key element not found");
    }
    
    if (elements.testConnection) {
      elements.testConnection.addEventListener("click", testNotionConnection);
      console.log("Test connection listener added");
    } else {
      console.log("Test connection element not found");
    }
    
    if (elements.apiKey) {
      elements.apiKey.addEventListener("input", onApiKeyInput);
      console.log("API key input listener added");
    } else {
      console.log("API key element not found");
    }

    if (elements.checkPages) {
      elements.checkPages.addEventListener("click", checkNotionPages);
      console.log("Check pages listener added");
    }

    if (elements.createDatabase) {
      elements.createDatabase.addEventListener("click", createNotionDatabase);
      console.log("Create database listener added");
    }

    if (elements.refreshDatabases) {
      elements.refreshDatabases.addEventListener("click", loadDatabases);
      console.log("Refresh databases listener added");
    }

    if (elements.databaseSelect) {
      elements.databaseSelect.addEventListener("change", onDatabaseSelect);
      console.log("Database select listener added");
    }

    if (elements.saveSettings) {
      elements.saveSettings.addEventListener("click", saveAdvancedSettings);
      console.log("Save settings listener added");
    }
    
    console.log("Event listeners setup completed");
  }

  async function checkCurrentPage() {
    console.log("Checking current page...");
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      if (currentTab && currentTab.url) {
        if (currentTab.url.includes("libecity.com")) {
          if (elements.pageStatusText) {
            elements.pageStatusText.textContent = "LibeCity ページ検出";
          }
        } else {
          if (elements.pageStatusText) {
            elements.pageStatusText.textContent = "他のページ（LibeCityで使用推奨）";
          }
        }
      }
    } catch (error) {
      console.error("Page check error:", error);
      if (elements.pageStatusText) {
        elements.pageStatusText.textContent = "ページ状態不明";
      }
    }
  }

  async function loadSettings() {
    console.log("Loading settings...");
    try {
      const result = await chrome.storage.sync.get([
        "notionApiKey", 
        "notionDatabaseId", 
        "saveImages", 
        "saveLinks", 
        "notifications"
      ]);
      
      console.log("Loaded settings:", result);
      
      if (result.notionApiKey && elements.apiKey) {
        elements.apiKey.value = result.notionApiKey;
        console.log("API key loaded from storage");
        
        // APIキーが既に保存されている場合、接続テストボタンを有効にする
        if (elements.testConnection) {
          elements.testConnection.disabled = false;
          console.log("Test connection button enabled (existing API key)");
        }
      }
      
      if (result.notionDatabaseId && elements.databaseSelect) {
        elements.databaseSelect.value = result.notionDatabaseId;
      }
      
      if (elements.saveImages) elements.saveImages.checked = result.saveImages !== false;
      if (elements.saveLinks) elements.saveLinks.checked = result.saveLinks !== false;
      if (elements.notifications) elements.notifications.checked = result.notifications !== false;
      
    } catch (error) {
      console.error("Settings load error:", error);
    }
  }

  async function updateStepStates() {
    console.log("Updating step states...");
    try {
      const result = await chrome.storage.sync.get(["notionApiKey", "notionDatabaseId"]);
      
      // Step 1: API Key
      if (result.notionApiKey) {
        updateStepStatus("step1Status", "完了", "complete");
        enableStep(2);
      } else {
        updateStepStatus("step1Status", "未設定", "pending");
        disableStep(2);
        disableStep(3);
        disableStep(4);
        return;
      }
      
      // Step 4: Database Selection
      if (result.notionDatabaseId) {
        updateStepStatus("step4Status", "完了", "complete");
        if (elements.completionMessage) {
          elements.completionMessage.style.display = "block";
        }
      } else {
        updateStepStatus("step4Status", "待機中", "pending");
        if (elements.completionMessage) {
          elements.completionMessage.style.display = "none";
        }
      }
      
    } catch (error) {
      console.error("Step state update error:", error);
    }
  }

  function toggleApiKeyVisibility() {
    console.log("Toggling API key visibility");
    const input = elements.apiKey;
    if (input.type === "password") {
      input.type = "text";
      elements.toggleApiKey.textContent = "🙈";
    } else {
      input.type = "password";
      elements.toggleApiKey.textContent = "👁️";
    }
  }

  function onApiKeyInput() {
    console.log("API key input detected");
    const apiKey = elements.apiKey.value.trim();
    console.log("API key length:", apiKey.length);
    console.log("Test connection button element:", elements.testConnection);
    
    if (apiKey && elements.testConnection) {
      elements.testConnection.disabled = false;
      updateStepStatus("step1Status", "入力済み", "active");
      console.log("Test connection button enabled (input detected)");
    } else if (elements.testConnection) {
      elements.testConnection.disabled = false; // 常に有効にする
      updateStepStatus("step1Status", "未設定", "pending");
      console.log("Test connection button kept enabled");
    }
  }

  async function testNotionConnection() {
    console.log("Test connection button clicked");
    const apiKey = elements.apiKey.value.trim();
    console.log("API key for test:", apiKey ? "Present" : "Missing");
    
    if (!apiKey) {
      showConnectionResult("APIキーを入力してください", "error");
      return;
    }

    try {
      elements.testConnection.disabled = true;
      elements.testConnection.textContent = "テスト中...";
      showConnectionResult("接続を確認中...", "info");

      console.log("Making API request to Notion...");
      const response = await fetch("https://api.notion.com/v1/users/me", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28"
        }
      });

      console.log("API response status:", response.status);

      if (response.ok) {
        const userData = await response.json();
        await chrome.storage.sync.set({ notionApiKey: apiKey });
        showConnectionResult("接続成功！", "success");
        updateStepStatus("step1Status", "完了", "complete");
        enableStep(2);
        await loadDatabases();
        console.log("Connection successful:", userData);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "API接続に失敗しました");
      }

    } catch (error) {
      console.error("Connection test error:", error);
      showConnectionResult(`接続エラー: ${error.message}`, "error");
      updateStepStatus("step1Status", "エラー", "error");
    } finally {
      elements.testConnection.disabled = false;
      elements.testConnection.textContent = "接続テスト";
      console.log("Test connection button re-enabled");
    }
  }

  async function checkNotionPages() {
    console.log("Checking Notion pages...");
    const result = await chrome.storage.sync.get(["notionApiKey"]);
    const apiKey = result.notionApiKey;
    
    if (!apiKey) {
      showPageCheckResult("先にAPIキーを設定してください", "error");
      return;
    }

    try {
      elements.checkPages.disabled = true;
      elements.checkPages.textContent = "確認中...";
      showPageCheckResult("アクセス可能なページを確認中...", "info");

      const response = await fetch("https://api.notion.com/v1/search", {
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
          page_size: 10
        })
      });

      if (response.ok) {
        const data = await response.json();
        const pageCount = data.results.length;
        
        if (pageCount > 0) {
          showPageCheckResult(`✅ ${pageCount}個のページにアクセス可能です`, "success");
          updateStepStatus("step2Status", "完了", "complete");
          enableStep(3);
        } else {
          showPageCheckResult("⚠️ アクセス可能なページがありません。統合を招待してください", "warning");
          updateStepStatus("step2Status", "要設定", "warning");
        }
      } else {
        throw new Error("ページの確認に失敗しました");
      }

    } catch (error) {
      console.error("Page check error:", error);
      showPageCheckResult(`エラー: ${error.message}`, "error");
      updateStepStatus("step2Status", "エラー", "error");
    } finally {
      elements.checkPages.disabled = false;
      elements.checkPages.textContent = "ページを確認";
    }
  }

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
        await chrome.storage.sync.set({ notionDatabaseId: database.id });
        showDatabaseCreateResult("✅ データベースが作成されました", "success");
        updateStepStatus("step3Status", "完了", "complete");
        enableStep(4);
        await loadDatabases();
      } else {
        const errorData = await createResponse.json();
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

  async function loadDatabases() {
    console.log("Loading databases...");
    const result = await chrome.storage.sync.get(["notionApiKey"]);
    const apiKey = result.notionApiKey;
    
    if (!apiKey || !elements.databaseSelect) {
      return;
    }

    try {
      if (elements.refreshDatabases) {
        elements.refreshDatabases.disabled = true;
      }

      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          filter: {
            value: "database",
            property: "object"
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const databases = data.results;
        
        // セレクトボックスをクリア
        elements.databaseSelect.innerHTML = '<option value="">データベースを選択してください...</option>';
        
        // データベースを追加
        databases.forEach(db => {
          const option = document.createElement("option");
          option.value = db.id;
          option.textContent = db.title[0]?.plain_text || "無題のデータベース";
          elements.databaseSelect.appendChild(option);
        });

        // 保存されているデータベースIDがあれば選択
        const savedResult = await chrome.storage.sync.get(["notionDatabaseId"]);
        if (savedResult.notionDatabaseId) {
          elements.databaseSelect.value = savedResult.notionDatabaseId;
        }

      } else {
        console.error("Failed to load databases");
      }

    } catch (error) {
      console.error("Database loading error:", error);
    } finally {
      if (elements.refreshDatabases) {
        elements.refreshDatabases.disabled = false;
      }
    }
  }

  async function onDatabaseSelect() {
    const databaseId = elements.databaseSelect.value;
    
    if (databaseId) {
      await chrome.storage.sync.set({ notionDatabaseId: databaseId });
      updateStepStatus("step4Status", "完了", "complete");
      if (elements.completionMessage) {
        elements.completionMessage.style.display = "block";
      }
    } else {
      updateStepStatus("step4Status", "待機中", "pending");
      if (elements.completionMessage) {
        elements.completionMessage.style.display = "none";
      }
    }
  }

  async function saveAdvancedSettings() {
    try {
      await chrome.storage.sync.set({
        saveImages: elements.saveImages?.checked !== false,
        saveLinks: elements.saveLinks?.checked !== false,
        notifications: elements.notifications?.checked !== false
      });
      
      // 一時的に成功メッセージを表示
      const originalText = elements.saveSettings.textContent;
      elements.saveSettings.textContent = "保存しました";
      elements.saveSettings.style.backgroundColor = "#4CAF50";
      
      setTimeout(() => {
        elements.saveSettings.textContent = originalText;
        elements.saveSettings.style.backgroundColor = "";
      }, 2000);
      
    } catch (error) {
      console.error("Settings save error:", error);
    }
  }

  function showConnectionResult(message, type) {
    console.log("Connection result:", message, type);
    if (elements.connectionResult) {
      elements.connectionResult.textContent = message;
      elements.connectionResult.className = `connection-result ${type}`;
    }
  }

  function showPageCheckResult(message, type) {
    if (elements.pageCheckResult) {
      elements.pageCheckResult.textContent = message;
      elements.pageCheckResult.className = `check-result ${type}`;
    }
  }

  function showDatabaseCreateResult(message, type) {
    if (elements.databaseCreateResult) {
      elements.databaseCreateResult.textContent = message;
      elements.databaseCreateResult.className = `check-result ${type}`;
    }
  }

  function updateStepStatus(elementId, text, status) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = text;
      element.className = `step-status ${status}`;
    }
  }

  function enableStep(stepNumber) {
    const stepElement = document.getElementById(`step${stepNumber}`);
    if (stepElement) {
      stepElement.classList.remove("disabled");
    }
  }

  function disableStep(stepNumber) {
    const stepElement = document.getElementById(`step${stepNumber}`);
    if (stepElement) {
      stepElement.classList.add("disabled");
    }
  }
});
