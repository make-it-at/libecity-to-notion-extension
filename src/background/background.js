// Background Script for ebayCPaSS2GoogleSheets
// Chrome Extension Manifest V3 Service Worker

// 拡張機能のインストール時の処理
chrome.runtime.onInstalled.addListener((details) => {
  console.log('ebayCPaSS2GoogleSheets installed:', details.reason);
  
  // 初期設定
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      extractionSettings: {
        autoExtract: false,
        showNotifications: true,
        csvAutoDownload: false
      },
      selectorConfig: {
        estimatedCost: {
          patterns: [
            { selector: 'div span.value', priority: 1, successRate: 0.95 },
            { selector: '.cost-display .amount', priority: 2, successRate: 0.80 },
            { selector: '[data-cost] .price', priority: 3, successRate: 0.70 }
          ],
          userCustom: []
        },
        trackingNumber: {
          patterns: [
            { selector: 'a span:empty', priority: 1, successRate: 0.90 },
            { selector: '.tracking-info a', priority: 2, successRate: 0.85 }
          ],
          userCustom: []
        },
        lastMileNumber: {
          patterns: [
            { selector: 'span.bold', priority: 1, successRate: 0.88 },
            { selector: '.last-mile-tracking', priority: 2, successRate: 0.75 }
          ],
          userCustom: []
        }
      }
    });
  }
});

// Content scriptからのメッセージ処理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  switch (request.action) {
    case 'extractData':
      handleDataExtraction(request.data, sender, sendResponse);
      break;
    
    case 'saveData':
      handleDataSave(request.data, sender, sendResponse);
      break;
    
    case 'getSettings':
      handleGetSettings(sendResponse);
      break;
    
    case 'updateSettings':
      handleUpdateSettings(request.settings, sendResponse);
      break;
    
    case 'testSelector':
      handleTestSelector(request.selector, sender, sendResponse);
      break;
    
    default:
      console.warn('Unknown action:', request.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true; // 非同期レスポンスを示す
});

// データ抽出処理
async function handleDataExtraction(data, sender, sendResponse) {
  try {
    // 抽出データの検証
    const validatedData = validateExtractedData(data);
    
    // ローカルストレージに保存
    const timestamp = new Date().toISOString();
    const extractionRecord = {
      ...validatedData,
      timestamp,
      pageUrl: sender.tab.url,
      tabId: sender.tab.id
    };
    
    // 既存データを取得
    const result = await chrome.storage.local.get(['extractedData']);
    const existingData = result.extractedData || [];
    
    // 重複チェック
    const isDuplicate = existingData.some(record => 
      record.pageUrl === extractionRecord.pageUrl &&
      record.trackingNumber === extractionRecord.trackingNumber &&
      Math.abs(new Date(record.timestamp) - new Date(timestamp)) < 60000 // 1分以内
    );
    
    if (!isDuplicate) {
      existingData.push(extractionRecord);
      await chrome.storage.local.set({ extractedData: existingData });
      
      // 通知表示
      const settings = await chrome.storage.sync.get(['extractionSettings']);
      if (settings.extractionSettings?.showNotifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'assets/icons/icon48.png',
          title: 'データ抽出完了',
          message: `推定送料: ${extractionRecord.estimatedCost || 'N/A'}\n追跡番号: ${extractionRecord.trackingNumber || 'N/A'}`
        });
      }
      
      sendResponse({ success: true, data: extractionRecord });
    } else {
      sendResponse({ success: false, error: 'Duplicate data' });
    }
  } catch (error) {
    console.error('Data extraction error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// データ保存処理
async function handleDataSave(data, sender, sendResponse) {
  try {
    // Google Sheets連携は後で実装
    // 現在はローカルストレージに保存
    const result = await chrome.storage.local.get(['savedData']);
    const savedData = result.savedData || [];
    
    savedData.push({
      ...data,
      savedAt: new Date().toISOString()
    });
    
    await chrome.storage.local.set({ savedData });
    sendResponse({ success: true });
  } catch (error) {
    console.error('Data save error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 設定取得処理
async function handleGetSettings(sendResponse) {
  try {
    const result = await chrome.storage.sync.get(['extractionSettings', 'selectorConfig']);
    sendResponse({ success: true, settings: result });
  } catch (error) {
    console.error('Get settings error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 設定更新処理
async function handleUpdateSettings(settings, sendResponse) {
  try {
    await chrome.storage.sync.set(settings);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Update settings error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// セレクターテスト処理
async function handleTestSelector(selector, sender, sendResponse) {
  try {
    // Content scriptにセレクターテストを依頼
    const response = await chrome.tabs.sendMessage(sender.tab.id, {
      action: 'testSelector',
      selector: selector
    });
    
    sendResponse(response);
  } catch (error) {
    console.error('Test selector error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 抽出データの検証
function validateExtractedData(data) {
  const validated = {};
  
  // 推定送料の検証
  if (data.estimatedCost) {
    const costMatch = data.estimatedCost.match(/[\d,]+\.?\d*/);
    const currencyMatch = data.estimatedCost.match(/[A-Z]{3}/);
    
    validated.estimatedCost = {
      raw: data.estimatedCost,
      amount: costMatch ? parseFloat(costMatch[0].replace(/,/g, '')) : null,
      currency: currencyMatch ? currencyMatch[0] : 'JPY'
    };
  }
  
  // 追跡番号の検証
  if (data.trackingNumber) {
    validated.trackingNumber = data.trackingNumber.trim();
  }
  
  // ラストマイル追跡番号の検証
  if (data.lastMileNumber) {
    validated.lastMileNumber = data.lastMileNumber.trim();
  }
  
  // 抽出ステータス
  validated.extractionStatus = {
    estimatedCost: !!validated.estimatedCost?.amount,
    trackingNumber: !!validated.trackingNumber,
    lastMileNumber: !!validated.lastMileNumber
  };
  
  return validated;
}

// タブ更新時の処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('ebaycpass.com')) {
    // ebayCPaSSサイトが読み込まれた時の処理
    console.log('ebayCPaSS site loaded:', tab.url);
  }
});

// 拡張機能アイコンクリック時の処理
chrome.action.onClicked.addListener((tab) => {
  // ポップアップが設定されている場合は自動的に開かれるため、ここでは特別な処理は不要
  console.log('Extension icon clicked on tab:', tab.url);
}); 