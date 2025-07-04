// Content Script for ebayCPaSS2GoogleSheets
// ebayCPaSSサイトでの配送情報抽出

console.log('ebayCPaSS2GoogleSheets content script loaded');

// 設定とセレクター情報
let selectorConfig = null;
let extractionSettings = null;

// 初期化
async function initialize() {
  try {
    // 設定を取得
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response.success) {
      selectorConfig = response.settings.selectorConfig;
      extractionSettings = response.settings.extractionSettings;
    }
    
    // ebayCPaSSサイトかどうかを確認
    if (window.location.hostname.includes('ebaycpass.com')) {
      console.log('ebayCPaSS site detected');
      
      // 自動抽出が有効な場合は実行
      if (extractionSettings?.autoExtract) {
        setTimeout(extractData, 2000); // 2秒後に実行
      }
      
      // ページ変更の監視
      observePageChanges();
    }
  } catch (error) {
    console.error('Content script initialization error:', error);
  }
}

// ページ変更の監視
function observePageChanges() {
  const observer = new MutationObserver((mutations) => {
    // DOMの変更を監視して、必要に応じて再抽出
    let shouldReextract = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // 新しいノードが追加された場合
        for (let node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 配送情報関連の要素が追加されたかチェック
            if (node.querySelector && (
              node.querySelector('span.value') ||
              node.querySelector('span.bold') ||
              node.querySelector('a[href*="tracking"]')
            )) {
              shouldReextract = true;
              break;
            }
          }
        }
      }
    });
    
    if (shouldReextract && extractionSettings?.autoExtract) {
      console.log('Page content changed, re-extracting data...');
      setTimeout(extractData, 1000);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// データ抽出のメイン関数
async function extractData() {
  try {
    console.log('Starting data extraction...');
    
    const extractedData = {
      estimatedCost: null,
      trackingNumber: null,
      lastMileNumber: null,
      extractionTime: new Date().toISOString(),
      pageUrl: window.location.href
    };
    
    // 推定送料の抽出
    extractedData.estimatedCost = extractEstimatedCost();
    
    // 追跡番号の抽出
    extractedData.trackingNumber = extractTrackingNumber();
    
    // ラストマイル追跡番号の抽出
    extractedData.lastMileNumber = extractLastMileNumber();
    
    console.log('Extracted data:', extractedData);
    
    // 抽出成功の判定
    const hasAnyData = extractedData.estimatedCost || 
                      extractedData.trackingNumber || 
                      extractedData.lastMileNumber;
    
    if (hasAnyData) {
      // Background scriptに送信
      const response = await chrome.runtime.sendMessage({
        action: 'extractData',
        data: extractedData
      });
      
      if (response.success) {
        console.log('Data extraction completed successfully');
        highlightExtractedElements();
      } else {
        console.error('Data extraction failed:', response.error);
      }
    } else {
      console.log('No data extracted');
    }
    
    return extractedData;
  } catch (error) {
    console.error('Data extraction error:', error);
    return null;
  }
}

// 推定送料の抽出
function extractEstimatedCost() {
  const patterns = selectorConfig?.estimatedCost?.patterns || [
    { selector: 'div span.value', priority: 1 },
    { selector: '.cost-display .amount', priority: 2 },
    { selector: '[data-cost] .price', priority: 3 }
  ];
  
  // 優先度順にセレクターを試行
  for (const pattern of patterns.sort((a, b) => a.priority - b.priority)) {
    try {
      const elements = document.querySelectorAll(pattern.selector);
      
      for (const element of elements) {
        const text = element.textContent?.trim();
        
        // 金額らしいテキストかチェック
        if (text && (text.includes('JPY') || text.includes('¥') || /\d+[\.,]\d+/.test(text))) {
          console.log(`Found estimated cost with selector "${pattern.selector}":`, text);
          return text;
        }
      }
    } catch (error) {
      console.warn(`Selector "${pattern.selector}" failed:`, error);
    }
  }
  
  // フォールバック: より広範囲な検索
  const allElements = document.querySelectorAll('*');
  for (const element of allElements) {
    const text = element.textContent?.trim();
    if (text && text.length < 50 && 
        (text.includes('JPY') || text.includes('¥')) &&
        /\d+[\.,]\d+/.test(text)) {
      console.log('Found estimated cost with fallback search:', text);
      return text;
    }
  }
  
  return null;
}

// 追跡番号の抽出
function extractTrackingNumber() {
  const patterns = selectorConfig?.trackingNumber?.patterns || [
    { selector: 'a span:empty', priority: 1 },
    { selector: '.tracking-info a', priority: 2 },
    { selector: 'a[href*="tracking"]', priority: 3 }
  ];
  
  // 優先度順にセレクターを試行
  for (const pattern of patterns.sort((a, b) => a.priority - b.priority)) {
    try {
      const elements = document.querySelectorAll(pattern.selector);
      
      for (const element of elements) {
        // 空のspanの場合は親要素のテキストを取得
        if (element.tagName === 'SPAN' && !element.textContent?.trim()) {
          const parentText = element.parentElement?.textContent?.trim();
          if (parentText && isValidTrackingNumber(parentText)) {
            console.log(`Found tracking number with selector "${pattern.selector}":`, parentText);
            return parentText;
          }
        } else {
          const text = element.textContent?.trim();
          if (text && isValidTrackingNumber(text)) {
            console.log(`Found tracking number with selector "${pattern.selector}":`, text);
            return text;
          }
        }
      }
    } catch (error) {
      console.warn(`Selector "${pattern.selector}" failed:`, error);
    }
  }
  
  // フォールバック: 追跡番号らしいパターンを検索
  const allElements = document.querySelectorAll('*');
  for (const element of allElements) {
    const text = element.textContent?.trim();
    if (text && isValidTrackingNumber(text)) {
      console.log('Found tracking number with fallback search:', text);
      return text;
    }
  }
  
  return null;
}

// ラストマイル追跡番号の抽出
function extractLastMileNumber() {
  const patterns = selectorConfig?.lastMileNumber?.patterns || [
    { selector: 'span.bold', priority: 1 },
    { selector: '.last-mile-tracking', priority: 2 },
    { selector: '.tracking-number', priority: 3 }
  ];
  
  // 優先度順にセレクターを試行
  for (const pattern of patterns.sort((a, b) => a.priority - b.priority)) {
    try {
      const elements = document.querySelectorAll(pattern.selector);
      
      for (const element of elements) {
        const text = element.textContent?.trim();
        if (text && isValidLastMileNumber(text)) {
          console.log(`Found last mile number with selector "${pattern.selector}":`, text);
          return text;
        }
      }
    } catch (error) {
      console.warn(`Selector "${pattern.selector}" failed:`, error);
    }
  }
  
  // フォールバック: 数字のみのパターンを検索
  const allElements = document.querySelectorAll('*');
  for (const element of allElements) {
    const text = element.textContent?.trim();
    if (text && isValidLastMileNumber(text)) {
      console.log('Found last mile number with fallback search:', text);
      return text;
    }
  }
  
  return null;
}

// 追跡番号の検証
function isValidTrackingNumber(text) {
  // 一般的な追跡番号のパターン
  const patterns = [
    /^[A-Z]{2}\d{9}[A-Z]{2}$/,  // 国際郵便（例：EM1013071241398FE）
    /^[A-Z]{2}\d{9,13}[A-Z]{2}$/, // 国際郵便（長いバージョン）
    /^\d{13}$/,                  // 13桁の数字
    /^[A-Z0-9]{10,30}$/         // 10-30文字の英数字
  ];
  
  return patterns.some(pattern => pattern.test(text)) && 
         text.length >= 10 && 
         text.length <= 30;
}

// ラストマイル追跡番号の検証
function isValidLastMileNumber(text) {
  // 数字のみ、10-15桁
  return /^\d{10,15}$/.test(text) && 
         text.length >= 10 && 
         text.length <= 15;
}

// 抽出された要素のハイライト
function highlightExtractedElements() {
  // 既存のハイライトを削除
  document.querySelectorAll('.ebaycpass-extracted').forEach(el => {
    el.classList.remove('ebaycpass-extracted');
  });
  
  // 新しいハイライトを追加
  const estimatedCost = extractEstimatedCost();
  const trackingNumber = extractTrackingNumber();
  const lastMileNumber = extractLastMileNumber();
  
  if (estimatedCost) {
    highlightElementWithText(estimatedCost, 'estimated-cost');
  }
  
  if (trackingNumber) {
    highlightElementWithText(trackingNumber, 'tracking-number');
  }
  
  if (lastMileNumber) {
    highlightElementWithText(lastMileNumber, 'last-mile-number');
  }
}

// テキストを含む要素をハイライト
function highlightElementWithText(text, className) {
  const elements = document.querySelectorAll('*');
  
  for (const element of elements) {
    if (element.textContent?.trim() === text) {
      element.classList.add('ebaycpass-extracted', className);
      break;
    }
  }
}

// Background scriptからのメッセージ処理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  switch (request.action) {
    case 'extractData':
      extractData().then(sendResponse);
      break;
      
    case 'testSelector':
      testSelector(request.selector).then(sendResponse);
      break;
      
    case 'highlightElements':
      highlightExtractedElements();
      sendResponse({ success: true });
      break;
      
    case 'clearHighlights':
      document.querySelectorAll('.ebaycpass-extracted').forEach(el => {
        el.classList.remove('ebaycpass-extracted');
      });
      sendResponse({ success: true });
      break;
      
    default:
      console.warn('Unknown action:', request.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true; // 非同期レスポンスを示す
});

// セレクターのテスト
async function testSelector(selector) {
  try {
    const elements = document.querySelectorAll(selector);
    const results = [];
    
    for (let i = 0; i < Math.min(elements.length, 5); i++) {
      const element = elements[i];
      results.push({
        index: i,
        tagName: element.tagName,
        textContent: element.textContent?.trim() || '',
        innerHTML: element.innerHTML?.substring(0, 100) || '',
        className: element.className || '',
        id: element.id || ''
      });
    }
    
    return {
      success: true,
      selector: selector,
      matchCount: elements.length,
      results: results
    };
  } catch (error) {
    return {
      success: false,
      selector: selector,
      error: error.message
    };
  }
}

// 初期化を実行
initialize();

// ページロード完了後にも実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
} 