// LibeCity to Notion - Content Script
// libecity.com専用のコンテンツ抽出機能

console.log('LibeCity to Notion Content Script loaded');

// libecity.com専用のセレクタ定義
const SELECTORS = {
  // 投稿関連（article[data-id]を最優先に、つぶやき投稿も含む）
  postContainer: 'article[data-id], .originalTweetArea, .tweetArea, [class*="tweet"], .post_container',
  postText: '.post_text, .post_text > div, .tweet_text, .originalTweetArea .post_text, .editbox .post_text, .tweetArea .post_text',
  postTime: '.post_time, .time, time',
  postAuthor: 'a.username, .username, .user_name, .author',
  postAvatar: '.user_proficon img, .avatar img',
  
  // 画像関連（libecity.com固有のセレクタを追加）
  postImages: 'img.fr-fic.fr-dib.popup, .post_image img, .attachment img, img[src*="libecity"], img[src*="firebasestorage"], .fr-img, .fr-fic.fr-dib, img.popup',
  
  // リンク関連
  postLinks: '.post_text a, .link_preview',
  
  // メンション関連
  mentions: '.mention, [data-user-id]',
  
  // その他
  reactions: '.reaction, .like_count',
  replies: '.reply, .comment',
  
  // ユーザー情報（後方互換性のため）
  userInfo: 'a.username, .username, .user_name, .author'
};

// セレクタの有効性をチェックする関数
function isValidSelector(selector) {
  try {
    document.querySelector(selector);
    return true;
  } catch (error) {
    console.error(`Invalid selector: ${selector}`, error);
    return false;
  }
}

// セレクタの検証（軽量化版）
function validateSelectors() {
  // 基本的なセレクタのみ検証（パフォーマンス優先）
  const criticalSelectors = ['postContainer'];
  
  criticalSelectors.forEach(key => {
    const selector = SELECTORS[key];
    if (selector && !isValidSelector(selector)) {
      console.warn(`Critical selector invalid for ${key}: ${selector}`);
    }
  });
}

// 状態管理
let isSelectionMode = false;
let selectedElement = null;
let highlightOverlay = null;

// URL変更検知用の変数
let currentUrl = window.location.href;

// 初期化（高速化版）
function initialize() {
  console.log('Initializing LibeCity content script...');
  
  // 即座に基本機能をセットアップ
  setupMessageListeners();
  
  // URL変更の監視を開始
  setupUrlChangeDetection();
  
  // ページの読み込み状態に関係なく、可能な限り早期に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupContentScript);
    // DOMContentLoadedを待たずに可能な部分は先に実行
    setupEarlyFeatures();
  } else {
    setupContentScript();
  }
}

// URL変更検知の設定
function setupUrlChangeDetection() {
  console.log('Setting up URL change detection...');
  
  // pushState/replaceStateのオーバーライド
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    handleUrlChange();
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    handleUrlChange();
  };
  
  // popstateイベントの監視
  window.addEventListener('popstate', handleUrlChange);
  
  // 定期的なURL変更チェック（フォールバック）
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      console.log('URL change detected via polling');
      handleUrlChange();
    }
  }, 1000);
}

// URL変更時の処理
function handleUrlChange() {
  const newUrl = window.location.href;
  if (newUrl !== currentUrl) {
    console.log(`URL changed: ${currentUrl} -> ${newUrl}`);
    currentUrl = newUrl;
    
    // ページ遷移後の処理を遅延実行
    setTimeout(() => {
      console.log('Reinitializing after URL change...');
      reinitializeAfterUrlChange();
    }, 100);
  }
}

// URL変更後の再初期化
function reinitializeAfterUrlChange() {
  // 処理済み投稿の記録をクリア（新しいページなので）
  processedPostIds.clear();
  // WeakSetはクリアできないが、新しいページのDOM要素なので自動的に無効になる
  
  // フラグをリセットして再初期化を可能にする
  window.libecityChatMonitoringSetup = false;
  window.libecityObserverSetup = false;
  
  // コンテンツスクリプトを再セットアップ
  setupContentScript();
}

// 早期セットアップ（DOM完了前でも実行可能な機能）
function setupEarlyFeatures() {
  console.log('Setting up early features...');
  
  // DOM変更の監視を開始（bodyが存在すれば実行可能）
  if (document.body) {
    setupDOMObserver();
    
    // 既存投稿があれば即座にアイコン追加を試行
    requestAnimationFrame(() => {
      setupChatPostMonitoring();
    });
  } else {
    // bodyがまだない場合は少し待って再試行
    setTimeout(setupEarlyFeatures, 10);
  }
}

// コンテンツスクリプトのセットアップ（高速化版）
function setupContentScript() {
  console.log('Setting up content script for libecity.com');
  
  // 重要でない処理は非同期で実行
  requestAnimationFrame(() => {
    // セレクタの検証（重要度低）
    validateSelectors();
    
    // ページ情報の初期取得（重要度低）
    detectPageType();
  });
  
  // DOM変更の監視を開始（まだ実行されていない場合）
  if (!window.libecityObserverSetup) {
    setupDOMObserver();
  }
  
  // チャット投稿の監視と保存アイコンの追加（最重要）
  if (!window.libecityChatMonitoringSetup) {
    setupChatPostMonitoring();
  }
}

// DOM変更の監視（高速化版）
function setupDOMObserver() {
  if (window.libecityObserverSetup) return;
  window.libecityObserverSetup = true;
  
  // スロットリング用
  let observerTimeout = null;
  let lastMutationCount = 0;
  
  const observer = new MutationObserver((mutations) => {
    // 頻繁な変更をスロットリング
    if (observerTimeout) return;
    
    observerTimeout = setTimeout(() => {
      observerTimeout = null;
      
      let hasNewPosts = false;
      let hasSignificantChange = false;
      
      // 大幅なDOM変更を検知
      if (mutations.length > 10) {
        console.log(`Significant DOM change detected: ${mutations.length} mutations`);
        hasSignificantChange = true;
      }
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && !hasNewPosts) {
          // 新しい投稿が追加された場合の処理
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE && !hasNewPosts) {
              try {
                const posts = node.querySelectorAll(SELECTORS.postContainer);
                if (posts.length > 0) {
                  console.log(`New posts detected: ${posts.length}`);
                  hasNewPosts = true;
                }
              } catch (error) {
                console.error('Failed to query posts in new nodes:', error);
              }
            }
          });
          
          // 大きなコンテナが追加された場合も検知
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const nodeClassList = node.classList || [];
              const nodeClasses = Array.from(nodeClassList).join(' ');
              if (nodeClasses.includes('main') || 
                  nodeClasses.includes('content') || 
                  nodeClasses.includes('chat') ||
                  nodeClasses.includes('post') ||
                  node.tagName === 'MAIN' ||
                  node.tagName === 'SECTION') {
                console.log(`Large container added: ${node.tagName}.${nodeClasses}`);
                hasSignificantChange = true;
              }
            }
          });
        }
      });
      
      if (hasNewPosts || hasSignificantChange) {
        // 新しい投稿が見つかった場合またはページ構造が大幅に変更された場合
        console.log(`Triggering icon addition: newPosts=${hasNewPosts}, significantChange=${hasSignificantChange}`);
        requestAnimationFrame(() => addNotionIconsToPosts());
      }
      
      lastMutationCount = mutations.length;
    }, 50); // 50msのスロットリング
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false, // パフォーマンス向上のため属性変更は監視しない
    attributeOldValue: false,
    characterData: false,
    characterDataOldValue: false
  });
  
  console.log('DOM observer setup completed');
}

// メッセージリスナーの設定（高速化版）
function setupMessageListeners() {
  if (window.libecityMessageListenerSetup) return;
  window.libecityMessageListenerSetup = true;
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    switch (request.action) {
      case 'extractContent':
        handleExtractContent(request, sendResponse);
        return true; // 非同期レスポンス
        
      case 'startSelection':
        startSelectionMode();
        sendResponse({ success: true });
        break;
        
      case 'stopSelection':
        stopSelectionMode();
        sendResponse({ success: true });
        break;
        
      case 'getPageInfo':
        sendResponse(getPageInfo());
        break;
        
      case 'ping':
        sendResponse({ status: 'active', timestamp: Date.now() });
        break;
        
      default:
        console.warn('Unknown action:', request.action);
        sendResponse({ error: 'Unknown action' });
    }
  });
  
  console.log('Message listeners setup completed');
}

// コンテンツ抽出のメイン処理
async function handleExtractContent(request, sendResponse) {
  try {
    let content;
    
    if (request.elementSelector) {
      // 特定の要素を指定された場合
      content = await extractSpecificContent(request.elementSelector);
    } else if (selectedElement) {
      // 選択された要素がある場合
      content = await extractElementContent(selectedElement);
    } else {
      // ページ全体から自動抽出
      content = await extractPageContent();
    }
    
    sendResponse({ success: true, content });
  } catch (error) {
    console.error('Content extraction failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 特定要素のコンテンツ抽出
async function extractSpecificContent(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  return await extractElementContent(element);
}

// 投稿URLの取得
async function extractPostUrl(postElement) {
  try {
    console.log('Starting post URL extraction...');
    
    // 方法1: データ属性から投稿IDを取得
    const postId = postElement.getAttribute('data-id') || 
                   postElement.getAttribute('data-post-id') ||
                   postElement.getAttribute('data-message-id') ||
                   postElement.getAttribute('id');
    
    if (postId && postId.match(/^[a-zA-Z0-9]+$/)) {
      // libecity.comのcomment_id形式に対応（英数字の組み合わせ）
      const currentUrl = window.location.href;
      let constructedUrl;
      
      if (currentUrl.includes('room_list')) {
        // room_listページの場合、comment_idパラメータを使用
        const urlObj = new URL(currentUrl);
        urlObj.searchParams.set('comment_id', postId);
        constructedUrl = urlObj.toString();
      } else {
        // その他の場合は従来の形式
        constructedUrl = `https://libecity.com/post/${postId}`;
      }
      
      console.log('Constructed URL from data attribute:', constructedUrl);
      return constructedUrl;
    }
    
    // 方法2: 投稿内の既存リンクを探す（直接リンク）
    const existingLinks = postElement.querySelectorAll('a[href*="libecity.com"], a[href*="/post/"]');
    for (const link of existingLinks) {
      const href = link.getAttribute('href');
      if (href && href.includes('/post/')) {
        const fullUrl = href.startsWith('http') ? href : `https://libecity.com${href}`;
        console.log('Found existing post link:', fullUrl);
        return fullUrl;
      }
    }
    
    // 方法3: 投稿内のリンクボタンを探す（複数のセレクタを試行）
    const linkButtonSelectors = [
      '.btn_gray svg[data-icon="link"]',
      '.btn svg[data-icon="link"]', 
      'svg[data-icon="link"]',
      '.fa-link',
      '[class*="link"]',
      '.share-button',
      '[title*="リンク"]',
      '[title*="link"]'
    ];
    
    let linkButton = null;
    for (const selector of linkButtonSelectors) {
      const element = postElement.querySelector(selector);
      if (element) {
        linkButton = element.closest('li') || 
                    element.closest('button') || 
                    element.closest('[class*="btn"]') ||
                    element.closest('[class*="share"]');
        if (linkButton) {
          console.log('Found link button with selector:', selector);
          break;
        }
      }
    }
    
    if (linkButton) {
      // リンクボタンのクリックをシミュレートしてURLを取得
      const urlFromButton = await getUrlFromLinkButton(linkButton, postElement);
      if (urlFromButton && urlFromButton !== window.location.href && urlFromButton.includes('libecity.com')) {
        console.log('Extracted URL from link button:', urlFromButton);
        return urlFromButton;
      }
    }
    
    // 方法4: 投稿内の時刻リンクを探す
    const timeLink = postElement.querySelector('.post_time a, .time a, a[href*="/post/"], time a');
    if (timeLink) {
      const href = timeLink.getAttribute('href');
      if (href) {
        const fullUrl = href.startsWith('http') ? href : `https://libecity.com${href}`;
        console.log('Found time link:', fullUrl);
        return fullUrl;
      }
    }
    
    // 方法5: 投稿の構造から推測（親要素を含む）
    let currentElement = postElement;
    for (let i = 0; i < 3; i++) { // 最大3階層まで遡る
      if (currentElement) {
        const id = currentElement.getAttribute('data-id') || currentElement.getAttribute('id');
        if (id && id.match(/^\d+$/)) {
          const constructedUrl = `https://libecity.com/post/${id}`;
          console.log('Constructed URL from parent element:', constructedUrl);
          return constructedUrl;
        }
        currentElement = currentElement.parentElement;
      }
    }
    
    // 方法6: URLからチャット情報を含む一意のURLを生成
    const currentUrl = window.location.href;
    const timestamp = Date.now();
    const postHash = generatePostHash(postElement);
    
    if (currentUrl.includes('libecity.com')) {
      const uniqueUrl = `${currentUrl}#post-${postHash}-${timestamp}`;
      console.log('Generated unique URL:', uniqueUrl);
      return uniqueUrl;
    }
    
    // 方法7: 現在のページURLを使用（最後の手段）
    console.log('Using current page URL as fallback:', currentUrl);
    return currentUrl;
    
  } catch (error) {
    console.error('Failed to extract post URL:', error);
    return window.location.href;
  }
}

// 投稿のハッシュ値を生成（一意性を高めるため）
function generatePostHash(postElement) {
  try {
    const text = postElement.textContent || '';
    const author = postElement.querySelector('a.username')?.textContent || 
                   postElement.querySelector('.username')?.textContent ||
                   postElement.querySelector('.user_name')?.textContent || '';
    const timestamp = postElement.querySelector('time')?.textContent || '';
    
    const content = `${text}-${author}-${timestamp}`.substring(0, 100);
    
    // 簡単なハッシュ生成
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit整数に変換
    }
    
    return Math.abs(hash).toString(16);
  } catch (error) {
    console.error('Failed to generate post hash:', error);
    return Math.random().toString(16).substring(2, 8);
  }
}

// リンクボタンからURLを取得
function getUrlFromLinkButton(linkButton, postElement) {
  return new Promise((resolve) => {
    try {
      console.log('Attempting to get URL from link button...');
      
      // クリップボードの監視を開始
      let originalClipboard = '';
      
      // 現在のクリップボード内容を保存
      navigator.clipboard.readText().then(text => {
        originalClipboard = text || '';
        console.log('Original clipboard content:', originalClipboard.substring(0, 50) + '...');
      }).catch(() => {
        // クリップボード読み取りに失敗した場合は空文字列
        originalClipboard = '';
        console.log('Failed to read original clipboard, using empty string');
      });
      
      // リンクボタンをクリック
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      console.log('Clicking link button...');
      linkButton.dispatchEvent(clickEvent);
      
      // 少し待ってからクリップボードを確認
      setTimeout(() => {
        navigator.clipboard.readText().then(clipboardText => {
          console.log('Clipboard after click:', clipboardText ? clipboardText.substring(0, 50) + '...' : 'empty');
          
          if (clipboardText && 
              clipboardText !== originalClipboard && 
              clipboardText.includes('libecity.com') &&
              clipboardText.startsWith('http')) {
            console.log('Successfully extracted URL from clipboard:', clipboardText);
            resolve(clipboardText.trim());
          } else {
            console.log('No valid URL found in clipboard, using fallback');
            // フォールバック: 現在のページURL
            resolve(window.location.href);
          }
        }).catch((error) => {
          console.error('Failed to read clipboard after click:', error);
          resolve(window.location.href);
        });
      }, 800); // 待機時間を少し長くする
      
    } catch (error) {
      console.error('Failed to get URL from link button:', error);
      resolve(window.location.href);
    }
  });
}

// ページ全体からのコンテンツ自動抽出
async function extractPageContent() {
  try {
    // libecity.com用の複数のセレクタを試行
    const possibleSelectors = [
      '.log_detail',
      '.post_text',
      '.message',
      '.chat_message',
      '.content',
      '[data-message]',
      'article',
      '.post'
    ];
    
    let posts = [];
    for (const selector of possibleSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          posts = Array.from(elements);
          console.log(`Found ${posts.length} posts with selector: ${selector}`);
          break;
        }
      } catch (error) {
        console.warn(`Selector failed: ${selector}`, error);
      }
    }
    
    if (posts.length === 0) {
      // フォールバック：ページ全体のテキストを抽出
      console.log('No specific posts found, extracting page content');
      return {
        type: 'page',
        timestamp: new Date().toISOString(),
        url: window.location.href,
        title: document.title,
        content: {
          text: document.body.innerText || document.body.textContent || 'コンテンツが見つかりません',
          html: document.body.innerHTML
        },
        metadata: {
          domain: window.location.hostname,
          pathname: window.location.pathname
        }
      };
    }
    
    // 最新の投稿を抽出（通常は最初の要素）
    const latestPost = posts[0];
    return await extractElementContent(latestPost);
  } catch (error) {
    console.error('Failed to extract page content:', error);
    throw new Error('ページからコンテンツを抽出できませんでした: ' + error.message);
  }
}

// 選択モードの開始
function startSelectionMode() {
  if (isSelectionMode) return;
  
  isSelectionMode = true;
  document.body.style.cursor = 'crosshair';
  
  // オーバーレイの作成
  createHighlightOverlay();
  
  // イベントリスナーの追加
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('mouseout', handleMouseOut);
  document.addEventListener('click', handleElementClick);
  
  console.log('Selection mode started');
}

// 選択モードの終了
function stopSelectionMode() {
  if (!isSelectionMode) return;
  
  isSelectionMode = false;
  document.body.style.cursor = '';
  
  // オーバーレイの削除
  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }
  
  // イベントリスナーの削除
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);
  document.removeEventListener('click', handleElementClick);
  
  console.log('Selection mode stopped');
}

// ハイライトオーバーレイの作成
function createHighlightOverlay() {
  highlightOverlay = document.createElement('div');
  highlightOverlay.style.cssText = `
    position: absolute;
    pointer-events: none;
    border: 2px solid #007bff;
    background-color: rgba(0, 123, 255, 0.1);
    z-index: 10000;
    display: none;
  `;
  document.body.appendChild(highlightOverlay);
}

// マウスオーバー処理
function handleMouseOver(event) {
  if (!isSelectionMode) return;
  
  const target = event.target;
  const rect = target.getBoundingClientRect();
  
  highlightOverlay.style.display = 'block';
  highlightOverlay.style.left = rect.left + window.scrollX + 'px';
  highlightOverlay.style.top = rect.top + window.scrollY + 'px';
  highlightOverlay.style.width = rect.width + 'px';
  highlightOverlay.style.height = rect.height + 'px';
}

// マウスアウト処理
function handleMouseOut(event) {
  if (!isSelectionMode) return;
  highlightOverlay.style.display = 'none';
}

// 要素クリック処理
function handleElementClick(event) {
  if (!isSelectionMode) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  selectedElement = event.target;
  stopSelectionMode();
  
  // 選択完了をポップアップに通知
  try {
    chrome.runtime.sendMessage({
      action: 'elementSelected',
      element: {
        tagName: selectedElement.tagName,
        className: selectedElement.className,
        textContent: selectedElement.textContent.substring(0, 100) + '...',
        selector: generateSelector(selectedElement)
      }
    });
  } catch (error) {
    console.error('Failed to send element selection message:', error);
  }
  
  console.log('Element selected:', selectedElement);
}

// ページ情報の取得
function getPageInfo() {
  let postCount = 0;
  let hasContent = false;
  
  try {
    postCount = document.querySelectorAll(SELECTORS.postContainer).length;
  } catch (error) {
    console.error('Failed to count posts:', error);
  }
  
  try {
    hasContent = document.querySelectorAll(SELECTORS.postText).length > 0;
  } catch (error) {
    console.error('Failed to check content:', error);
  }
  
  return {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname,
    pathname: window.location.pathname,
    isLibeCity: window.location.hostname.includes('libecity.com'),
    postCount: postCount,
    hasContent: hasContent
  };
}

// ページタイプの検出
function detectPageType() {
  const pathname = window.location.pathname;
  const pageInfo = getPageInfo();
  
  console.log('Page info:', pageInfo);
  
  // ページタイプに応じた初期化
  if (pageInfo.isLibeCity) {
    console.log('LibeCity page detected');
    // LibeCity固有の初期化処理
  }
}

// 時間情報の抽出
function extractTime(timeElement) {
  let timeText = timeElement.textContent || timeElement.innerText;
  
  // Notionアイコンのテキストを除去
  timeText = timeText
    .replace(/Notionに保存/g, '')
    .replace(/保存中\.\.\./g, '')
    .replace(/保存中/g, '')
    .replace(/保存完了!/g, '')
    .replace(/保存済み/g, '')
    .replace(/保存エラー/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const timeAttr = timeElement.getAttribute('datetime') || 
                   timeElement.getAttribute('data-time') ||
                   timeElement.getAttribute('title');
  
  return {
    text: cleanText(timeText),
    datetime: timeAttr,
    timestamp: timeAttr ? new Date(timeAttr).toISOString() : new Date().toISOString()
  };
}

// HTML構造を解析してコンテンツの順序を抽出
function extractStructuredContent(element) {
  console.log('Starting structured content extraction...');
  const structuredContent = [];
  
  // 現在の文字修飾スタックを管理
  const formatStack = [];
  
  const walkNodes = (node, currentFormats = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent;
      if (text) {
        // Notionアイコンのテキストを除去
        text = text
          .replace(/Notionに保存/g, '')
          .replace(/保存中\.\.\./g, '')
          .replace(/保存中/g, '')
          .replace(/保存完了!/g, '')
          .replace(/保存済み/g, '')
          .replace(/保存エラー/g, '');
        
        // クリーンアップ後にテキストが空になった場合はスキップ
        if (!text.trim()) {
          return;
        }
        
        // テキストを改行で分割し、空白行も含めて忠実に反映
        const lines = text.split(/\n/);
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmedLine = line.trim();
          
          if (trimmedLine) {
            // 内容のある行の場合
            // テキスト内のURLを検出してリンク化
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urlMatches = trimmedLine.match(urlRegex);
            
            if (urlMatches) {
              // URLを含むテキストの場合、テキストとリンクを分離
              let lastIndex = 0;
              urlMatches.forEach(url => {
                const urlIndex = trimmedLine.indexOf(url, lastIndex);
                
                // URL前のテキスト
                if (urlIndex > lastIndex) {
                  const beforeText = trimmedLine.substring(lastIndex, urlIndex).trim();
                  if (beforeText) {
                    structuredContent.push({
                      type: 'rich_text',
                      content: beforeText,
                      annotations: { ...currentFormats }
                    });
                  }
                }
                
                // URLをリンクとして追加
                structuredContent.push({
                  type: 'rich_text',
                  content: url,
                  annotations: { 
                    ...currentFormats,
                    underline: true,
                    color: 'blue'
                  },
                  link: { url: url }
                });
                
                lastIndex = urlIndex + url.length;
              });
              
              // URL後のテキスト
              if (lastIndex < trimmedLine.length) {
                const afterText = trimmedLine.substring(lastIndex).trim();
                if (afterText) {
                  structuredContent.push({
                    type: 'rich_text',
                    content: afterText,
                    annotations: { ...currentFormats }
                  });
                }
              }
            } else {
              // 通常のテキスト
              structuredContent.push({
                type: 'rich_text',
                content: trimmedLine,
                annotations: { ...currentFormats }
              });
            }
          } else if (!trimmedLine) {
            // 空白行の場合（空白文字のみの行も空白行として扱う）
            structuredContent.push({
              type: 'empty_line'
            });
            console.log(`Added empty line at position ${i}`);
          }
          
          // 行の終わりに改行を追加（最後の行以外）
          if (i < lines.length - 1) {
            structuredContent.push({
              type: 'linebreak'
            });
          }
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      
      // 除外すべき要素をスキップ
      if (node.classList.contains('action_area') || 
          node.classList.contains('reactionbox') || 
          node.classList.contains('editbox') ||
          node.classList.contains('notion-save-icon')) {
        return;
      }
      
      // Notionアイコンのテキストを含む要素をスキップ
      const nodeText = node.textContent || '';
      if (nodeText.includes('Notionに保存') || 
          nodeText.includes('保存中') || 
          nodeText.includes('保存完了') || 
          nodeText.includes('保存済み') || 
          nodeText.includes('保存エラー')) {
        return;
      }
      
      // 文字修飾タグの処理
      let newFormats = { ...currentFormats };
      
      switch (tagName) {
        case 'strong':
        case 'b':
          newFormats.bold = true;
          break;
        case 'em':
        case 'i':
          newFormats.italic = true;
          break;
        case 'u':
          newFormats.underline = true;
          break;
        case 's':
        case 'strike':
        case 'del':
          newFormats.strikethrough = true;
          break;
        case 'code':
          newFormats.code = true;
          break;
        case 'mark':
          newFormats.color = 'yellow_background';
          break;
      }
      
      if (tagName === 'img') {
        // 画像要素を処理
        const src = node.src;
        if (src) {
          const validatedUrl = isValidImageUrl(src);
          if (validatedUrl) {
            console.log(`Found image in structured content: ${src.substring(0, 50)}...`);
            structuredContent.push({
              type: 'image',
              src: typeof validatedUrl === 'string' ? validatedUrl : src,
              alt: node.alt && node.alt.trim() ? node.alt.trim() : '',
              title: node.title && node.title.trim() ? node.title.trim() : '',
              width: node.naturalWidth || node.width || 0,
              height: node.naturalHeight || node.height || 0
            });
          } else {
            console.warn('Invalid image URL skipped in structured content:', src);
          }
        }
      } else if (tagName === 'br') {
        // 改行要素を明示的に処理
        structuredContent.push({
          type: 'linebreak'
        });
      } else if (tagName === 'p' || tagName === 'div') {
        // ブロック要素の場合、子ノードを処理してから改行を追加
        const hasContent = structuredContent.length > 0;
        Array.from(node.childNodes).forEach(child => walkNodes(child, newFormats));
        
        // ブロック要素の後に改行を追加（内容がある場合のみ）
        if (hasContent && structuredContent.length > 0) {
          const lastItem = structuredContent[structuredContent.length - 1];
          if (lastItem.type !== 'linebreak') {
            structuredContent.push({
              type: 'linebreak'
            });
          }
        }
      } else if (tagName === 'a' && node.href) {
        // リンク要素を処理
        const linkText = node.textContent.trim();
        const linkUrl = node.href;
        
        if (linkUrl && !linkUrl.startsWith('javascript:') && !linkUrl.startsWith('#')) {
          // リンク内に画像がある場合
          const linkImages = node.querySelectorAll('img');
          if (linkImages.length > 0) {
            linkImages.forEach(img => {
              if (img.src) {
                const validatedUrl = isValidImageUrl(img.src);
                if (validatedUrl) {
                  console.log(`Found linked image in structured content: ${img.src.substring(0, 50)}...`);
                  structuredContent.push({
                    type: 'image',
                    src: typeof validatedUrl === 'string' ? validatedUrl : img.src,
                    alt: img.alt || linkText || '',
                    title: img.title || linkText || '',
                    isLinked: true,
                    linkUrl: linkUrl
                  });
                } else {
                  console.warn('Invalid linked image URL skipped:', img.src);
                }
              }
            });
          } else if (linkText) {
            // テキストリンクの場合
            structuredContent.push({
              type: 'rich_text',
              content: linkText,
              annotations: { 
                ...newFormats,
                underline: true,
                color: 'blue'
              },
              link: { url: linkUrl }
            });
          }
        }
      } else {
        // その他の要素は子ノードを再帰的に処理（文字修飾を継承）
        Array.from(node.childNodes).forEach(child => walkNodes(child, newFormats));
      }
    }
  };

  // libecity.com特有の構造に対応
  // .post_textクラスがある場合はそれを優先的に処理
  const postTextElement = element.querySelector('.post_text');
  if (postTextElement) {
    console.log('Found .post_text element, processing it specifically');
    
    // まず全体のテキスト量を確認
    const fullText = postTextElement.textContent.trim();
    console.log(`Post text element total content length: ${fullText.length}`);
    console.log(`Post text preview: "${fullText.substring(0, 100)}..."`);
    
    // libecity.comの特殊な構造に対応：<p></p>や<p><br></p>を空白行として検出
    const paragraphs = postTextElement.querySelectorAll('p');
    console.log(`Found ${paragraphs.length} paragraph elements in .post_text`);
    
    // 段落が存在する場合は段落ベースで処理
    if (paragraphs.length > 0) {
      paragraphs.forEach((p, index) => {
        const textContent = p.textContent.trim();
        const hasOnlyBr = p.innerHTML.trim() === '<br>' || p.innerHTML.trim() === '';
        
        console.log(`Paragraph ${index}: text="${textContent.substring(0, 50)}..." (${textContent.length} chars), HTML="${p.innerHTML.trim().substring(0, 50)}..."`);
        
        // 画像が含まれているかチェック
        const hasImages = p.querySelectorAll('img').length > 0;
        
        // テキストも画像もない場合のみ空白行として処理
        if ((!textContent || hasOnlyBr) && !hasImages) {
          // 空白行として処理
          structuredContent.push({
            type: 'empty_line'
          });
          console.log(`Added empty line from <p> tag at index ${index} (HTML: "${p.innerHTML.trim()}")`);
        } else {
          // 通常の段落として処理（文字修飾と画像を含む）
          console.log(`Processing paragraph ${index} with content: text=${!!textContent}, images=${hasImages}`);
          
          // 段落内のテキストと画像を処理（walkNodes関数を使用して重複を防ぐ）
          console.log(`Processing paragraph ${index} with walkNodes to avoid duplication`);
          
          // 子ノードをwalkNodes関数で処理（テキスト、画像、リンクすべてを統一的に処理）
          Array.from(p.childNodes).forEach(child => walkNodes(child, {}));
        }
        
        // 各段落の後に改行を追加（最後の段落以外）
        if (index < paragraphs.length - 1) {
          structuredContent.push({
            type: 'linebreak'
          });
        }
      });
    } else {
      // 段落がない場合は、.post_text要素全体を処理
      console.log('No paragraphs found, processing entire .post_text element');
      Array.from(postTextElement.childNodes).forEach(child => walkNodes(child, {}));
    }
    
    // 段落処理後に抽出されたテキスト量を確認
    const extractedTextLength = structuredContent
      .filter(item => item.type === 'rich_text' || item.type === 'text')
      .reduce((total, item) => total + (item.content?.length || 0), 0);
    
    console.log(`Extracted ${extractedTextLength} characters from paragraphs (original: ${fullText.length})`);
    
    // 抽出されたテキストが元のテキストより大幅に少ない場合は、フォールバック処理
    if (extractedTextLength < fullText.length * 0.5 && fullText.length > 100) {
      console.warn('Paragraph extraction seems incomplete, using fallback method');
      
      // 既存の構造化コンテンツをクリア
      structuredContent.length = 0;
      
      // .post_text要素全体を通常の方法で処理
      Array.from(postTextElement.childNodes).forEach(child => walkNodes(child, {}));
      
      const fallbackTextLength = structuredContent
        .filter(item => item.type === 'rich_text' || item.type === 'text')
        .reduce((total, item) => total + (item.content?.length || 0), 0);
      
      console.log(`Fallback extraction: ${fallbackTextLength} characters`);
    }
    
    // リンクプレビューも処理
    const linkPreviews = element.querySelectorAll('.link_preview');
    linkPreviews.forEach(preview => {
      const linkUrl = preview.href;
      const titleElement = preview.querySelector('.preview_title span');
      const linkText = titleElement ? titleElement.textContent.trim() : linkUrl;
      
      if (linkUrl) {
        structuredContent.push({
          type: 'rich_text',
          content: linkText,
          annotations: { 
            underline: true,
            color: 'blue'
          },
          link: { url: linkUrl }
        });
      }
    });
    
    // .tweetImageArea内の画像も処理（libecity.comの投稿画像）
    const tweetImageArea = element.querySelector('.tweetImageArea');
    if (tweetImageArea) {
      console.log('Found .tweetImageArea, processing tweet images');
      const tweetImages = tweetImageArea.querySelectorAll('.tweetImage img');
      console.log(`Found ${tweetImages.length} tweet images`);
      
      tweetImages.forEach((img, index) => {
        if (img.src) {
          const validatedUrl = isValidImageUrl(img.src);
          if (validatedUrl) {
            console.log(`Found tweet image ${index + 1}: ${img.src.substring(0, 50)}...`);
            structuredContent.push({
              type: 'image',
              src: typeof validatedUrl === 'string' ? validatedUrl : img.src,
              alt: img.alt && img.alt.trim() ? img.alt.trim() : '',
              title: img.title && img.title.trim() ? img.title.trim() : '',
              width: img.naturalWidth || img.width || 0,
              height: img.naturalHeight || img.height || 0
            });
          } else {
            console.warn('Invalid tweet image URL skipped:', img.src);
          }
        }
      });
    }
  } else {
    // 通常の要素処理
    Array.from(element.childNodes).forEach(child => walkNodes(child, {}));
  }

  // 連続する改行や空白行をクリーンアップ
  const cleanedContent = [];
  let lastType = null;
  
  // 長文の場合は空白行を除去するかどうかを判定
  const textLengthForCleaning = structuredContent
    .filter(item => item.type === 'rich_text')
    .reduce((total, item) => total + (item.content?.length || 0), 0);
  
  const isLongText = textLengthForCleaning > 100; // 長文判定
  
  structuredContent.forEach((item, index) => {
    // 長文の場合は空白行を除去
    if (isLongText && item.type === 'empty_line') {
      console.log('Removing empty line for long text optimization');
      return;
    }
    
    // 連続する改行を防ぐ
    if (item.type === 'linebreak' && lastType === 'linebreak') {
      return;
    }
    
    // 最初や最後の改行のみ除去
    if ((index === 0 || index === structuredContent.length - 1) && item.type === 'linebreak') {
      return;
    }
    
    // 短文の場合のみempty_lineを保持
    cleanedContent.push(item);
    lastType = item.type;
  });

  console.log(`Extracted ${structuredContent.length} raw items, cleaned to ${cleanedContent.length} items`);
  
  // デバッグ用：クリーンアップ前後の詳細ログ
  if (structuredContent.length !== cleanedContent.length) {
    console.log('Items removed during cleanup:');
    const removedItems = structuredContent.length - cleanedContent.length;
    console.log(`  Removed ${removedItems} items`);
  }
  
  // 最初の数個の要素をログ出力（デバッグ用）
  console.log('First 5 cleaned content items:');
  cleanedContent.slice(0, 5).forEach((item, index) => {
    if (item.type === 'rich_text') {
      console.log(`  ${index}: ${item.type} - "${item.content?.substring(0, 50)}..."`);
    } else if (item.type === 'empty_line') {
      console.log(`  ${index}: ${item.type} - (空白行)`);
    } else {
      console.log(`  ${index}: ${item.type}`);
    }
  });
  
  // テキスト長による分割戦略の決定
  const totalTextLength = cleanedContent
    .filter(item => item.type === 'rich_text')
    .reduce((total, item) => total + (item.content?.length || 0), 0);
  
  console.log(`Total text length in structured content: ${totalTextLength} characters`);
  
  let optimizedContent;
  if (totalTextLength > 2000) {
    console.log('Long text detected - applying smart chunking strategy');
    // 長文の場合：文字数制限を考慮した分割
    optimizedContent = optimizeStructuredContentForLongText(cleanedContent, 30); // より少ないブロック数
  } else {
    console.log('Normal text length - applying standard optimization');
    // 通常の場合：標準最適化
    optimizedContent = optimizeStructuredContentForLongText(cleanedContent, 95);
  }
  
  // デバッグ用：抽出された内容の概要をログ出力
  const summary = optimizedContent.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});
  console.log('Final content structure summary:', summary);
  
  // 画像の詳細ログ
  const images = optimizedContent.filter(item => item.type === 'image');
  if (images.length > 0) {
    console.log(`Found ${images.length} images in structured content:`);
    images.forEach((img, index) => {
      console.log(`  Image ${index + 1}: ${img.src.substring(0, 80)}...`);
      console.log(`    Alt: "${img.alt}", Title: "${img.title}"`);
      console.log(`    Dimensions: ${img.width}x${img.height}`);
    });
  } else {
    // 構造化コンテンツで画像が見つからない場合、元要素から直接画像を抽出
    const allImages = element.querySelectorAll('img');
    console.log(`Original element contains ${allImages.length} img tags:`);
    
    if (allImages.length > 0) {
      console.log('Attempting to extract images from original element...');
      allImages.forEach((img, index) => {
        console.log(`  Original img ${index + 1}: ${img.src.substring(0, 80)}...`);
        console.log(`    Classes: "${img.className}"`);
        console.log(`    Parent tag: ${img.parentElement?.tagName}`);
        
        // プロフィール画像やアイコンではない画像のみを抽出
        const isProfileImage = img.className.includes('user_proficon') || 
                             img.className.includes('profile') ||
                             img.className.includes('avatar') ||
                             img.closest('.user_info, .profile, .avatar');
        
        const isNotionIcon = img.className.includes('notion') || 
                           img.closest('.notion-save-icon');
        
        if (!isProfileImage && !isNotionIcon && img.src) {
          const validatedUrl = isValidImageUrl(img.src);
          if (validatedUrl) {
            console.log(`Adding image from original element: ${img.src.substring(0, 50)}...`);
            optimizedContent.push({
              type: 'image',
              src: typeof validatedUrl === 'string' ? validatedUrl : img.src,
              alt: img.alt && img.alt.trim() ? img.alt.trim() : '',
              title: img.title && img.title.trim() ? img.title.trim() : '',
              width: img.naturalWidth || img.width || 0,
              height: img.naturalHeight || img.height || 0
            });
          }
        }
      });
      
      // 追加された画像の数を確認
      const addedImages = optimizedContent.filter(item => item.type === 'image').length;
      if (addedImages > 0) {
        console.log(`Successfully added ${addedImages} images from original element to structured content`);
             } else {
         console.log('No content images found (profile images and icons were excluded)');
       }
    } else {
      console.log('No images found in original element either');
    }
  }
  
  return optimizedContent;
}

// テキストのクリーニング（改行を保持）
function cleanText(text) {
  if (!text) return '';
  
  return text
    .replace(/\r\n/g, '\n')  // Windows改行を統一
    .replace(/\r/g, '\n')    // Mac改行を統一
    .replace(/[ \t]+/g, ' ') // 複数のスペース・タブを1つに
    .replace(/\n[ \t]+/g, '\n') // 行頭の空白を削除
    .replace(/[ \t]+\n/g, '\n') // 行末の空白を削除
    .replace(/\n{3,}/g, '\n\n') // 3つ以上の連続改行を2つに
    .trim();
}

// テキストの類似度を計算する関数（Jaccard類似度）
function calculateTextSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  if (text1 === text2) return 1;
  
  // 文字単位での比較（日本語対応）
  const chars1 = new Set(text1.split(''));
  const chars2 = new Set(text2.split(''));
  
  // 共通文字の数
  const intersection = new Set([...chars1].filter(char => chars2.has(char)));
  
  // 全体の文字の数（重複除去）
  const union = new Set([...chars1, ...chars2]);
  
  // Jaccard類似度 = 共通部分 / 全体
  const similarity = intersection.size / union.size;
  
  return similarity;
}

// 要素のセレクタを生成
function generateSelector(element) {
  if (!element) return '';
  
  // IDがある場合
  if (element.id) {
    return `#${element.id}`;
  }
  
  // クラスがある場合
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.split(' ').filter(c => c.trim());
    if (classes.length > 0) {
      return `.${classes[0]}`;
    }
  }
  
  // タグ名を使用
  return element.tagName.toLowerCase();
}

// チャット投稿の監視とNotionアイコンの追加
function setupChatPostMonitoring() {
  if (window.libecityChatMonitoringSetup) return;
  window.libecityChatMonitoringSetup = true;
  
  console.log('Setting up chat post monitoring...');
  
  // DOM読み込み完了を待ってから投稿検出を開始
  const startMonitoring = () => {
    console.log('Starting post monitoring...');
    
    // 複数のタイミングでアイコン追加を試行（確実性向上）
    setTimeout(() => {
      console.log('First icon addition attempt (500ms delay)');
      addNotionIconsToPosts();
    }, 500);
    
    setTimeout(() => {
      console.log('Second icon addition attempt (1000ms delay)');
      addNotionIconsToPosts();
    }, 1000);
    
    // その後は即座に実行
    requestAnimationFrame(() => {
      console.log('Immediate icon addition attempt');
      addNotionIconsToPosts();
    });
  };
  
  if (document.readyState === 'complete') {
    startMonitoring();
  } else {
    window.addEventListener('load', startMonitoring);
    
    // DOMContentLoadedでも試行（SPAでの確実性向上）
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded - attempting icon addition');
        setTimeout(() => addNotionIconsToPosts(), 100);
      });
    }
  }
  
  console.log('Chat post monitoring setup completed');
}

// つぶやき投稿専用の検出と監視
// グローバルな処理済み投稿追跡システム
const processedPostIds = new Set();
const processedElements = new WeakSet(); // DOM要素自体を追跡

function addNotionIconsToPosts() {
  try {
    // 既存のアイコンがある投稿は処理をスキップ
    const existingIcons = document.querySelectorAll('.notion-save-icon');
    const postsWithIcons = new Set();
    existingIcons.forEach(icon => {
      const post = icon.closest('.log_detail, .originalTweetArea, .tweetArea, article[data-id]');
      if (post) {
        postsWithIcons.add(post);
        processedElements.add(post); // DOM要素も追跡
        // 処理済みとしてマーク
        const dataId = post.getAttribute('data-id');
        if (dataId) {
          processedPostIds.add(dataId);
        }
      }
    });
    
    // つぶやき投稿を優先的に検出
    let tweetPosts = [];
    
         // 1. つぶやきページかどうかを確認
     const isOnTweetPage = window.location.pathname.includes('/tweet');
    
    if (isOnTweetPage) {
      // つぶやきページでは.log_detailを使用
      console.log('Processing tweet posts (on tweet page)');
      const allPosts = document.querySelectorAll('.log_detail');
      tweetPosts = Array.from(allPosts).filter(post => {
        // 既にアイコンがある投稿は除外
        if (postsWithIcons.has(post)) return false;
        
        // つぶやき投稿かどうかを判定
        const isTweet = isTweetPost(post);
        console.log(`Post check: isTweet=${isTweet}, hasIcon=${postsWithIcons.has(post)}`);
        return isTweet;
      });
      
             if (tweetPosts.length > 0) {
         console.log(`Found ${allPosts.length} total posts, ${tweetPosts.length} are valid tweets (${allPosts.length - tweetPosts.length} already have icons)`);
       }
    } else {
      // 通常のチャット投稿を処理
      console.log('Processing regular chat posts (not on tweet page)');
      // より簡潔で確実なアプローチ：data-idを最優先、他は補完的
      const postSelectors = [
        'article[data-id]',  // data-idがある要素を最優先（メイン）
        '.log_detail:not(article[data-id])',  // article[data-id]以外の.log_detail
        '.post-item:not(article[data-id])',   // article[data-id]以外の.post-item
        '.chat-item:not(article[data-id])'    // article[data-id]以外の.chat-item
      ];
      
      // 全ての投稿要素を収集（重複なし）
      const allFoundElements = new Set();
      const uniquePostsMap = new Map(); // data-id -> element
      const processedElementsInThisRun = new Set(); // この実行で処理済みの要素
      
      // 優先順位に従ってセレクタを処理
      for (const selector of postSelectors) {
        const foundPosts = document.querySelectorAll(selector);
        console.log(`Selector "${selector}" found ${foundPosts.length} elements`);
        
        // DOM構造をデバッグ（最初の要素のみ）
        if (foundPosts.length > 0 && selector === 'article[data-id]') {
          const firstPost = foundPosts[0];
          console.log('First article[data-id] element:', firstPost);
          console.log('- tagName:', firstPost.tagName);
          console.log('- className:', firstPost.className);
          console.log('- data-id:', firstPost.getAttribute('data-id'));
          console.log('- contains .log_detail:', !!firstPost.querySelector('.log_detail'));
          console.log('- is .log_detail:', firstPost.classList.contains('log_detail'));
        }
        
        if (foundPosts.length > 0 && selector === '.log_detail:not(article[data-id])') {
          const firstPost = foundPosts[0];
          console.log('First .log_detail:not(article[data-id]) element:', firstPost);
          console.log('- tagName:', firstPost.tagName);
          console.log('- className:', firstPost.className);
          console.log('- data-id:', firstPost.getAttribute('data-id'));
          console.log('- parent tagName:', firstPost.parentElement?.tagName);
          console.log('- parent className:', firstPost.parentElement?.className);
          console.log('- parent data-id:', firstPost.parentElement?.getAttribute('data-id'));
        }
        
        foundPosts.forEach(post => {
          // 既に処理済みの要素はスキップ
          if (processedElements.has(post) || allFoundElements.has(post) || processedElementsInThisRun.has(post)) {
            return;
          }
          
          // article[data-id]以外のセレクタの場合、article[data-id]の子要素または関連要素でないかチェック
          if (selector !== 'article[data-id]') {
            let isRelatedToArticleDataId = false;
            
            // この要素がarticle[data-id]の子要素かチェック
            const parentArticle = post.closest('article[data-id]');
            if (parentArticle) {
              isRelatedToArticleDataId = true;
              console.log(`Skipping element inside article[data-id]: ${parentArticle.getAttribute('data-id')}`);
            }
            
            // 既に追加されたarticle[data-id]要素との関係をチェック
            if (!isRelatedToArticleDataId) {
              for (const existingPost of allFoundElements) {
                if (existingPost.tagName === 'ARTICLE' && existingPost.getAttribute('data-id')) {
                  // 同じ要素、親子関係、または同じdata-idを持つ要素かチェック
                  if (post === existingPost || 
                      post.contains(existingPost) || 
                      existingPost.contains(post) ||
                      (post.getAttribute('data-id') && post.getAttribute('data-id') === existingPost.getAttribute('data-id'))) {
                    isRelatedToArticleDataId = true;
                    console.log(`Skipping element related to article[data-id]: ${existingPost.getAttribute('data-id')}`);
                    break;
                  }
                }
              }
            }
            
            if (isRelatedToArticleDataId) {
              return;
            }
          }
          
          // 重複チェック：既に追加された要素と同じかチェック
          let isDuplicate = false;
          for (const existingPost of allFoundElements) {
            // 同じ要素かチェック
            if (post === existingPost) {
              isDuplicate = true;
              console.log(`Skipping duplicate element`);
              break;
            }
            // 親子関係チェック
            if (post.contains(existingPost) || existingPost.contains(post)) {
              isDuplicate = true;
              console.log(`Skipping element due to parent-child relationship with existing element`);
              break;
            }
          }
          
          if (isDuplicate) {
            return;
          }
          
          const dataId = post.getAttribute('data-id');
          if (dataId) {
            // 既に処理済みの投稿はスキップ
            if (processedPostIds.has(dataId) || uniquePostsMap.has(dataId)) {
              console.log(`Skipping already processed data-id: ${dataId}`);
              return;
            }
            // data-idがある場合は、最初に見つかった要素のみを保持
            uniquePostsMap.set(dataId, post);
            allFoundElements.add(post);
            processedElementsInThisRun.add(post); // この実行で処理済みとしてマーク
            console.log(`Added post with data-id: ${dataId} from selector: ${selector}`);
          } else {
            // data-idがない場合も重複チェック
            allFoundElements.add(post);
            processedElementsInThisRun.add(post); // この実行で処理済みとしてマーク
            console.log(`Added post without data-id from selector: ${selector}`);
          }
        });
      }
      
      // 重複除去後の投稿リストを作成
      const allFoundPosts = Array.from(allFoundElements);
      const postsWithDataId = allFoundPosts.filter(post => post.getAttribute('data-id')).length;
      const postsWithoutDataId = allFoundPosts.length - postsWithDataId;
      
      console.log(`Found ${allFoundPosts.length} unique posts (${postsWithDataId} with data-id, ${postsWithoutDataId} without data-id)`);
      
      // フィルタリング処理
      const regularPosts = allFoundPosts.filter((post, index) => {
        const dataId = post.getAttribute('data-id');
        
        // 既にアイコンがある投稿は除外
        if (postsWithIcons.has(post)) {
          return false;
        }
        
        // DOM要素内に既にNotionアイコンがないかチェック
        if (post.querySelector('.notion-save-icon')) {
          return false;
        }
        
        // data-idで既存アイコンをチェック
        if (dataId && document.querySelector(`[data-post-id="${dataId}"]`)) {
          console.log(`Icon already exists for data-id ${dataId}, skipping...`);
          return false;
        }
        
        // つぶやき投稿は除外（通常のチャット投稿のみ処理）
        const isTweet = isTweetPost(post);
        if (isTweet) {
          console.log(`Skipping tweet post with data-id: ${dataId}`);
          return false;
        }
        
        // 有効な投稿かチェック
        const isValid = isValidPost(post);
        return isValid;
      });
      
      if (regularPosts.length > 0) {
        const finalPostsWithDataId = regularPosts.filter(post => post.getAttribute('data-id')).length;
        console.log(`Adding Notion icons to ${regularPosts.length} new regular posts (${finalPostsWithDataId} with data-id)`);
        
        // 各通常投稿にアイコンを追加
        regularPosts.forEach((post, index) => {
          if (post && !post.querySelector('.notion-save-icon')) {
            // 処理済みとしてマーク
            processedElements.add(post); // DOM要素を追跡
            const dataId = post.getAttribute('data-id');
            if (dataId) {
              processedPostIds.add(dataId);
            }
            requestAnimationFrame(() => addNotionIconToRegularPost(post, index));
          }
        });
      }
    }
    
    if (tweetPosts.length > 0) {
      console.log(`Adding Notion icons to ${tweetPosts.length} new tweet posts`);
      
      // 各つぶやき投稿にアイコンを追加
      tweetPosts.forEach((post, index) => {
        if (post && !post.querySelector('.notion-save-icon')) {
          requestAnimationFrame(() => addNotionIconToTweetPost(post, index));
        }
      });
    }
    
  } catch (error) {
    console.error('Failed to add Notion icons to tweet posts:', error);
  }
}

// つぶやき投稿専用のNotionアイコン追加
function addNotionIconToTweetPost(tweetElement, index = 0) {
  try {
    // つぶやき投稿の検証
    if (!tweetElement) {
      return;
    }
    
    const isTweet = isTweetPost(tweetElement);
    if (!isTweet) {
      console.log('Element is not a tweet post, skipping icon addition');
      return;
    }
    
    console.log('Adding icon to tweet post (confirmed tweet)');
    
    // 既存のアイコンがないことを確認
    if (tweetElement.querySelector('.notion-save-icon')) {
      return;
    }
    
    // アイコンコンテナを作成
    const iconContainer = document.createElement('div');
    iconContainer.className = 'notion-save-icon';
    iconContainer.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14">
        <path fill="currentColor" d="M4,6H2V20A2,2 0 0,0 4,22H18V20H4V6M20,2H8A2,2 0 0,0 6,4V16A2,2 0 0,0 8,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M20,16H8V4H20V16M16,6H18V8H16V6M16,9H18V11H16V9M16,12H18V14H16V12M11,9H15V11H11V9M11,12H15V14H11V12M11,6H15V8H11V6Z"/>
      </svg>
      <span>Notionに保存</span>
    `;
    
    // ホバー効果のためのイベントリスナー
    iconContainer.addEventListener('mouseenter', () => {
      iconContainer.style.background = '#667eea';
      iconContainer.style.color = 'white';
      iconContainer.style.transform = 'scale(1.05)';
      iconContainer.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.3)';
    });
    
    iconContainer.addEventListener('mouseleave', () => {
      if (iconContainer.dataset.saving !== 'true') {
        iconContainer.style.background = 'rgba(255, 255, 255, 0.9)';
        iconContainer.style.color = '#666';
        iconContainer.style.transform = 'scale(1)';
        iconContainer.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
      }
    });
    
    // クリックイベント（つぶやき専用処理を使用）
    iconContainer.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await handleTweetSave(tweetElement, iconContainer);
    });
    
    // つぶやき投稿専用の配置ロジック
    const timeElement = tweetElement.querySelector('time');
    if (timeElement) {
      // time要素に相対位置を設定
      const computedStyle = window.getComputedStyle(timeElement);
      if (computedStyle.position === 'static') {
        timeElement.style.position = 'relative';
      }
      
      // time要素のすぐ左側に配置
      iconContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: -120px;
        height: 100%;
        padding: 0 8px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
        transition: all 0.2s ease;
        z-index: 1000;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        font-size: 12px;
        white-space: nowrap;
        gap: 4px;
      `;
      
      timeElement.appendChild(iconContainer);
      
    } else {
      // time要素が見つからない場合は投稿要素の右上に配置
      const computedStyle = window.getComputedStyle(tweetElement);
      if (computedStyle.position === 'static') {
        tweetElement.style.position = 'relative';
      }
      
      iconContainer.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        width: 32px;
        height: 32px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
        transition: all 0.2s ease;
        z-index: 1000;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        font-size: 12px;
        white-space: nowrap;
        gap: 4px;
      `;
      
      tweetElement.appendChild(iconContainer);
    }
    
  } catch (error) {
    console.error('Failed to add Notion icon to tweet post:', error);
  }
}

// 通常のチャット投稿専用のNotionアイコン追加
function addNotionIconToRegularPost(postElement, index = 0) {
  try {
    // 通常投稿の検証
    if (!postElement) {
      return;
    }
    
    const isTweet = isTweetPost(postElement);
    if (isTweet) {
      console.log('Skipping tweet post in addNotionIconToRegularPost');
      return;
    }
    
    console.log('Adding icon to regular post (confirmed not tweet)');
    
    // 既存のアイコンがないことを確認（複数の方法でチェック）
    if (postElement.querySelector('.notion-save-icon')) {
      console.log('Icon already exists, skipping...');
      return;
    }
    
    // data-idによる重複チェック
    const dataId = postElement.getAttribute('data-id');
    if (dataId) {
      const existingIcon = document.querySelector(`[data-post-id="${dataId}"] .notion-save-icon`);
      if (existingIcon) {
        console.log(`Icon already exists for data-id ${dataId}, skipping...`);
        return;
      }
    }
    
    // アイコンコンテナを作成
    const iconContainer = document.createElement('div');
    iconContainer.className = 'notion-save-icon';
    iconContainer.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M4,6H2V20A2,2 0 0,0 4,22H18V20H4V6M20,2H8A2,2 0 0,0 6,4V16A2,2 0 0,0 8,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M20,16H8V4H20V16M16,6H18V8H16V6M16,9H18V11H16V9M16,12H18V14H16V12M11,9H15V11H11V9M11,12H15V14H11V12M11,6H15V8H11V6Z"/>
      </svg>
      <span>Notionに保存</span>
    `;
    
    // data-idがある場合は識別子を設定
    if (dataId) {
      iconContainer.setAttribute('data-post-id', dataId);
    }
    
    // ホバー効果のためのイベントリスナー
    iconContainer.addEventListener('mouseenter', () => {
      iconContainer.style.background = '#667eea';
      iconContainer.style.color = 'white';
      iconContainer.style.transform = 'scale(1.05)';
      iconContainer.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.3)';
    });
    
    iconContainer.addEventListener('mouseleave', () => {
      if (iconContainer.dataset.saving !== 'true') {
        iconContainer.style.background = 'rgba(255, 255, 255, 0.9)';
        iconContainer.style.color = '#666';
        iconContainer.style.transform = 'scale(1)';
        iconContainer.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
      }
    });
    
    // クリックイベント（通常投稿用処理を使用）
    iconContainer.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await handleNotionSave(postElement, iconContainer);
    });
    
    // 通常投稿の配置ロジック
    // data-id属性を持つarticle要素の場合
    if (postElement.tagName === 'ARTICLE' && postElement.getAttribute('data-id')) {
      // time要素を優先的に探す
      const timeElement = postElement.querySelector('time');
      
      if (timeElement) {
        // time要素の隣（右側）に配置
        const timeParent = timeElement.parentElement;
        
        // 親要素をrelativeに設定
        const computedStyle = window.getComputedStyle(timeParent);
        if (computedStyle.position === 'static') {
          timeParent.style.position = 'relative';
        }
        
        iconContainer.style.cssText = `
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 12px;
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          cursor: pointer;
          color: #666;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          font-size: 12px;
          white-space: nowrap;
          gap: 4px;
          vertical-align: middle;
        `;
        
        // time要素の直後に挿入
        timeElement.insertAdjacentElement('afterend', iconContainer);
        
      } else {
        // time要素がない場合はフォールバック（右上に配置）
        const computedStyle = window.getComputedStyle(postElement);
        if (computedStyle.position === 'static') {
          postElement.style.position = 'relative';
        }
        
        iconContainer.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          transition: all 0.2s ease;
          z-index: 1000;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          font-size: 13px;
          white-space: nowrap;
          gap: 6px;
        `;
        
        postElement.appendChild(iconContainer);
      }
      
    } else {
      // その他の要素の場合は、適切な位置を探す
      const timeElement = postElement.querySelector('time, .time, [class*="time"]');
      const headerElement = postElement.querySelector('.header, .post-header, [class*="header"]');
      
      if (timeElement) {
        // time要素がある場合は、その親要素の右側に配置（重ならないよう）
        const timeParent = timeElement.parentElement;
        const computedStyle = window.getComputedStyle(timeParent);
        if (computedStyle.position === 'static') {
          timeParent.style.position = 'relative';
        }
        
        // time要素の位置を確認して、右側に配置
        iconContainer.style.cssText = `
          position: absolute;
          top: 50%;
          right: 8px;
          transform: translateY(-50%);
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          transition: all 0.2s ease;
          z-index: 1000;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          font-size: 12px;
          white-space: nowrap;
          gap: 4px;
        `;
        
        timeParent.appendChild(iconContainer);
        
      } else if (headerElement) {
        // ヘッダー要素がある場合はその中に配置（重ならないよう右端に）
        const computedStyle = window.getComputedStyle(headerElement);
        if (computedStyle.position === 'static') {
          headerElement.style.position = 'relative';
        }
        
        iconContainer.style.cssText = `
          position: absolute;
          top: 50%;
          right: 8px;
          transform: translateY(-50%);
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          transition: all 0.2s ease;
          z-index: 1000;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          font-size: 12px;
          white-space: nowrap;
          gap: 4px;
        `;
        
        headerElement.appendChild(iconContainer);
        
      } else {
        // フォールバック: 投稿要素の右上に配置（他の要素と重ならないよう）
        const computedStyle = window.getComputedStyle(postElement);
        if (computedStyle.position === 'static') {
          postElement.style.position = 'relative';
        }
        
        iconContainer.style.cssText = `
          position: absolute;
          top: 12px;
          right: 12px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          transition: all 0.2s ease;
          z-index: 1001;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          font-size: 13px;
          white-space: nowrap;
          gap: 6px;
          max-width: 120px;
        `;
        
        postElement.appendChild(iconContainer);
      }
    }
    
  } catch (error) {
    console.error('Failed to add Notion icon to regular post:', error);
  }
}

// 投稿が有効かチェック
function isValidPost(postElement) {
  // data-idがある場合は有効とみなす（libecity.comの投稿要素）
  if (postElement.getAttribute('data-id')) {
    return true;
  }
  
  // 投稿テキストまたは画像が含まれているかチェック
  const hasText = postElement.querySelector(SELECTORS.postText);
  const hasImages = postElement.querySelector(SELECTORS.postImages);
  const hasContent = postElement.textContent && postElement.textContent.trim().length > 10;
  
  return hasText || hasImages || hasContent;
}

// 画像URLが有効かチェック
function isValidImageUrl(url) {
  try {
    // 基本的なURL形式チェック
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    // data:URLは除外
    if (url.startsWith('data:')) {
      return false;
    }
    
    // blob:URLは除外
    if (url.startsWith('blob:')) {
      return false;
    }
    
    // 相対URLは除外（NotionはフルURLが必要）
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
      return false;
    }
    
    // HTTPSで始まる必要がある（HTTPは除外）
    if (!url.startsWith('https://')) {
      return false;
    }
    
    // URL長さチェック
    if (url.length > 2000) {
      return false;
    }
    
    // 絵文字やアイコンのSVGファイルを除外
    if (url.includes('emojione') || 
        url.includes('emoji') || 
        url.includes('icon') && url.includes('.svg')) {
      console.log('Skipping emoji/icon SVG:', url);
      return false;
    }
    
    // URLオブジェクトで構文チェック
    const urlObj = new URL(url);
    
    // Notionで問題が起きるドメインをプロキシ経由に変換
    const proxyDomains = [
      'img.youtube.com',
      'lh7-rt.googleusercontent.com',
      'googleusercontent.com'
    ];
    
    // プロキシが必要なドメインかチェック
    const needsProxy = proxyDomains.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.includes(domain)
    );
    
    if (needsProxy) {
      console.log('Converting to proxy URL for Notion compatibility:', url);
      // 無料のプロキシサービスを使用（CORSとSSL対応）
      return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=800&q=85`;
    }
    
    // 安全なドメインのみ許可
    const allowedDomains = [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      'imgur.com',
      'i.imgur.com',
      'libecity.com'
    ];
    
    const isAllowedDomain = allowedDomains.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );
    
    if (!isAllowedDomain) {
      console.log('Skipping non-allowed domain:', urlObj.hostname);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.warn('Invalid image URL:', url, error.message);
    return false;
  }
}

// 要素からコンテンツを抽出する関数
async function extractElementContent(element) {
  try {
    const content = {
      text: '',
      author: '',
      timestamp: '',
      images: [],
      links: [],
      mentions: [],
      url: window.location.href,
      elementInfo: {
        tagName: element.tagName,
        className: element.className,
        id: element.id
      }
    };

    // 投稿URLの取得
    try {
      const postUrl = await extractPostUrl(element);
      if (postUrl) {
        content.url = postUrl;
        console.log('Post URL extraction result:', {
          extractedUrl: postUrl,
          isUnique: postUrl !== window.location.href,
          currentPageUrl: window.location.href
        });
      } else {
        content.url = window.location.href;
        console.log('No specific post URL found, using current page URL:', content.url);
      }
    } catch (error) {
      console.error('Failed to extract post URL:', error);
      content.url = window.location.href;
    }

    // テキストコンテンツの抽出（改行を保持）
    let textElements = element.querySelectorAll(SELECTORS.postText);
    
    // libecity.comの構造に対応した追加の抽出
    if (textElements.length === 0) {
      // .log_detail内の.post_textを探す
      const logDetail = element.querySelector('.log_detail');
      if (logDetail) {
        textElements = logDetail.querySelectorAll('.post_text');
        console.log(`Found ${textElements.length} text elements in .log_detail`);
      }
    }
    
    // つぶやき投稿の場合の特別処理（改良版）
    if (textElements.length === 0) {
      console.log('No text elements found with standard selectors, trying tweet-specific extraction...');
      
      // つぶやき投稿の可能性がある場合の追加セレクタ（優先順位付き）
      const tweetSelectors = [
        // 最も具体的なセレクタから試行
        '.originalTweetArea .post_text',
        '.tweetArea .post_text',
        '.editbox .post_text',
        'article[data-id] .post_text',
        
        // より広範囲のセレクタ
        '.originalTweetArea',
        '.tweetArea', 
        '.editbox',
        '.log_detail .post_text',
        
        // フォールバック用セレクタ
        '[class*="tweet"] .post_text',
        '[class*="post_text"]',
        '.tweet_content',
        '.post_content'
      ];
      
      for (const selector of tweetSelectors) {
        try {
          const tweetElements = element.querySelectorAll(selector);
          console.log(`Trying selector "${selector}": found ${tweetElements.length} elements`);
          
          if (tweetElements.length > 0) {
            // つぶやき要素内からテキストを探す
            for (const tweetEl of tweetElements) {
              // 直接的なテキスト要素を探す
              let innerTextElements = tweetEl.querySelectorAll('.post_text, .tweet_text, [class*="text"]');
              
              // 見つからない場合は、divやp要素から探す（ただしアクション要素を除外）
              if (innerTextElements.length === 0) {
                innerTextElements = Array.from(tweetEl.querySelectorAll('div, p, span'))
                  .filter(el => {
                    // アクション要素やボタン要素、メタデータ要素を除外
                    const excludeClasses = ['action_area', 'editbox', 'btn', 'button', 'icon', 'meta', 'time', 'user', 'avatar'];
                    const hasExcludeClass = excludeClasses.some(cls => el.classList.contains(cls) || el.className.includes(cls));
                    
                    const hasButton = el.querySelector('button, .btn, input');
                    const hasIcon = el.querySelector('.icon, svg, img[class*="icon"]');
                    const textContent = el.textContent.trim();
                    
                    // Notionアイコンのテキストを除外
                    const isNotionIcon = textContent.includes('Notionに保存') || 
                                        textContent.includes('保存中') || 
                                        textContent.includes('保存完了') ||
                                        textContent.includes('保存済み');
                    
                    return !hasExcludeClass && 
                           !hasButton && 
                           !hasIcon && 
                           !isNotionIcon &&
                           textContent.length > 0 &&
                           textContent.length < 5000; // 異常に長いテキストを除外
                  });
              }
              
              // さらにフィルタリング：最も適切なテキスト要素を選択
              if (innerTextElements.length > 0) {
                // 最も長いテキストを持つ要素を選択（ただし合理的な範囲内）
                innerTextElements = innerTextElements
                  .filter(el => {
                    const text = el.textContent.trim();
                    return text.length > 2 && text.length < 2000; // 2文字以上2000文字以下
                  })
                  .sort((a, b) => b.textContent.trim().length - a.textContent.trim().length);
                
                if (innerTextElements.length > 0) {
                  textElements = innerTextElements.slice(0, 3); // 最大3つまで
                  console.log(`Found tweet text with selector: ${selector} (${textElements.length} elements)`);
                  console.log('Selected text elements:', textElements.map(el => el.textContent.trim().substring(0, 50) + '...'));
                  break;
                }
              }
            }
            if (textElements.length > 0) break;
          }
        } catch (error) {
          console.warn(`Error with selector "${selector}":`, error);
          continue;
        }
      }
    }
    
    if (textElements.length > 0) {
      content.text = Array.from(textElements)
        .map(el => {
          // HTMLの改行要素を実際の改行に変換
          let html = el.innerHTML;
          html = html.replace(/<br\s*\/?>/gi, '\n');
          html = html.replace(/<\/p>/gi, '\n');
          html = html.replace(/<p[^>]*>/gi, '');
          html = html.replace(/<div[^>]*>/gi, '\n');
          html = html.replace(/<\/div>/gi, '');
          
          // HTMLタグを除去してテキストのみ取得
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          let text = tempDiv.textContent || tempDiv.innerText || '';
          
          // Notionアイコンのテキストを除去
          text = text
            .replace(/Notionに保存/g, '')
            .replace(/保存中\.\.\./g, '')
            .replace(/保存中/g, '')
            .replace(/保存完了!/g, '')
            .replace(/保存済み/g, '')
            .replace(/保存エラー/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          
          return text;
        })
        .filter(text => text.length > 0)
        .join('\n\n');
        
      console.log('Extracted text from specific elements:', content.text.substring(0, 100) + '...');
    } else {
      // フォールバック: 投稿全体のテキスト（改行保持）
      console.log('Using fallback text extraction from entire element...');
      
      // 不要な要素を除外してテキストを抽出
      const clonedElement = element.cloneNode(true);
      
      // 除外する要素（ボタン、アイコン、メタデータなど）
      const excludeSelectors = [
        '.notion-save-icon', // Notionアイコン
        'button',
        '.btn',
        '.icon',
        '.avatar',
        '.timestamp',
        '.meta',
        'script',
        'style',
        '.editbox ul', // つぶやきのアクションボタン
        '.action_area',
        '.notion-icon',
        'time', // 時刻要素
        'a.username', // ユーザー名リンク
        '.user_name',
        '.chat_name', // チャット名
        '.chat_icon', // チャットアイコン
        '.user_proficon', // プロフィールアイコン
        '[class*="user"]',
        '[class*="icon"]'
      ];
      
      excludeSelectors.forEach(selector => {
        const elementsToRemove = clonedElement.querySelectorAll(selector);
        elementsToRemove.forEach(el => el.remove());
      });
      
      // 画像とリンクを含む要素は保持しつつ、テキストを抽出
      let html = clonedElement.innerHTML;
      html = html.replace(/<br\s*\/?>/gi, '\n');
      html = html.replace(/<\/p>/gi, '\n');
      html = html.replace(/<p[^>]*>/gi, '');
      html = html.replace(/<div[^>]*>/gi, '\n');
      html = html.replace(/<\/div>/gi, '');
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      let extractedText = (tempDiv.textContent || tempDiv.innerText || '').trim();
      
      // libecity.com特有のテキストを除去し、複数の改行を整理
      extractedText = extractedText
        .replace(/Notionに保存/g, '')
        .replace(/保存中\.\.\./g, '')
        .replace(/保存中/g, '')
        .replace(/保存完了!/g, '')
        .replace(/保存済み/g, '')
        .replace(/保存エラー/g, '')
        .replace(/Re返信元/g, '') // libecity.comの返信表示
        .replace(/\s+/g, ' ')  // 複数の空白を1つに
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      content.text = extractedText;
      console.log('Extracted fallback text:', content.text.substring(0, 100) + '...');
    }
    
    // 最終チェック：テキストが空の場合の緊急フォールバック（つぶやき投稿対応強化）
    if (!content.text || content.text.trim().length === 0) {
      console.warn('No text extracted with normal methods, trying emergency fallback...');
      
      // つぶやき投稿の場合の特別なフォールバック
      const isOriginalTweet = element.classList.contains('originalTweetArea') || 
                             element.querySelector('.originalTweetArea') ||
                             element.classList.contains('tweetArea') ||
                             element.querySelector('.tweetArea');
      
      if (isOriginalTweet) {
        console.log('Attempting tweet-specific emergency text extraction...');
        
        // つぶやき投稿専用のテキスト抽出
        const tweetContainer = element.querySelector('.originalTweetArea') || 
                              element.querySelector('.tweetArea') || 
                              element;
        
        if (tweetContainer) {
          // より詳細なテキスト抽出を試行
          const textCandidates = [];
          
          // 候補1: .post_text要素
          const postTextEl = tweetContainer.querySelector('.post_text');
          if (postTextEl) {
            textCandidates.push(postTextEl.textContent.trim());
          }
          
          // 候補2: div要素（アクション要素を除外）
          const divElements = tweetContainer.querySelectorAll('div');
          for (const div of divElements) {
            if (!div.classList.contains('action_area') && 
                !div.classList.contains('editbox') &&
                !div.querySelector('button') &&
                !div.querySelector('.btn') &&
                !div.querySelector('.icon')) {
              const divText = div.textContent.trim();
              if (divText.length > 2 && divText.length < 1000) {
                textCandidates.push(divText);
              }
            }
          }
          
          // 候補3: 全体のテキスト（最後の手段）
          textCandidates.push(tweetContainer.textContent.trim());
          
          // 最適な候補を選択
          for (const candidate of textCandidates) {
            if (candidate && candidate.length > 0) {
              let cleanedText = candidate
                .replace(/Notionに保存/g, '')
                .replace(/保存中\.\.\./g, '')
                .replace(/保存中/g, '')
                .replace(/保存完了!/g, '')
                .replace(/保存済み/g, '')
                .replace(/保存エラー/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              
              if (cleanedText.length > 2) {
                content.text = cleanedText;
                console.log('Tweet emergency fallback text extracted:', content.text.substring(0, 100) + '...');
                break;
              }
            }
          }
        }
      }
      
      // 通常の投稿または上記で抽出できなかった場合
      if (!content.text || content.text.trim().length === 0) {
        // 最も基本的なテキスト抽出
        const rawText = element.textContent || element.innerText || '';
        if (rawText && rawText.trim().length > 0) {
          // 不要な部分を除去
          let cleanedText = rawText
            .replace(/Notionに保存/g, '') // アイコンのテキストを除去
            .replace(/保存中\.\.\./g, '')
            .replace(/保存中/g, '')
            .replace(/保存完了!/g, '')
            .replace(/保存済み/g, '')
            .replace(/保存エラー/g, '')
            .replace(/\s+/g, ' ') // 複数の空白を1つに
            .trim();
          
          if (cleanedText.length > 0) {
            content.text = cleanedText;
            console.log('General emergency fallback text extracted:', content.text.substring(0, 100) + '...');
          }
        }
      }
    }

    // 投稿者情報の抽出（libecity.com専用セレクタを追加）
    const authorElement = element.querySelector('a.username') ||
                         element.querySelector('.username') ||
                         element.querySelector(SELECTORS.userInfo) || 
                         element.querySelector('.user_name') || 
                         element.querySelector('[class*="user"]') ||
                         element.querySelector('[class*="author"]');
    if (authorElement) {
      content.author = authorElement.textContent.trim();
      console.log('Extracted author:', content.author);
    } else {
      console.log('No author element found');
    }

    // チャットルーム名の抽出（Notionのタイトルプロパティ用）
    // 投稿要素から上位に向かってチャットルーム名を探す
    let chatNameElement = null;
    let currentElement = element;
    
    // 投稿要素内からチャットルーム名を探す
    chatNameElement = element.querySelector('.chat_name') || 
                     element.querySelector('[class*="chat_name"]') ||
                     element.querySelector('[class*="room_name"]') ||
                     element.querySelector('[class*="channel_name"]');
    
    // 投稿要素内にない場合は、親要素を遡って探す
    if (!chatNameElement) {
      while (currentElement && currentElement !== document.body) {
        currentElement = currentElement.parentElement;
        if (currentElement) {
          chatNameElement = currentElement.querySelector('.chat_name') || 
                           currentElement.querySelector('[class*="chat_name"]') ||
                           currentElement.querySelector('[class*="room_name"]') ||
                           currentElement.querySelector('[class*="channel_name"]');
          if (chatNameElement) break;
        }
      }
    }
    
    // 最後にページ全体から探す
    if (!chatNameElement) {
      chatNameElement = document.querySelector('.chat_name') || 
                       document.querySelector('[class*="chat_name"]') ||
                       document.querySelector('[class*="room_name"]') ||
                       document.querySelector('[class*="channel_name"]');
    }
    
    if (chatNameElement) {
      content.chatRoomName = chatNameElement.textContent.trim();
      console.log('Extracted chat room name:', content.chatRoomName);
    } else {
      // フォールバック: ページタイトルから抽出またはURL解析
      let fallbackName = 'libecity チャット';
      
      // ページタイトルからチャット名を抽出を試行
      if (document.title && document.title !== 'libecity') {
        fallbackName = document.title;
      }
      
      // URLからチャット情報を抽出を試行
      const urlMatch = window.location.href.match(/chat[_-]?(\w+)/i);
      if (urlMatch) {
        fallbackName = `${fallbackName} (${urlMatch[1]})`;
      }
      
      content.chatRoomName = fallbackName;
      console.log('Using fallback chat room name:', content.chatRoomName);
    }

    // タイムスタンプの抽出（<time>タグを優先、時刻まで含めて取得、タイムゾーン考慮）
    const timeElement = element.querySelector('time') ||
                       element.querySelector(SELECTORS.timestamp) || 
                       element.querySelector('[class*="time"]') || 
                       element.querySelector('[class*="date"]') ||
                       element.querySelector('[datetime]');
    if (timeElement) {
      // extractTime関数を使用してNotionアイコンのテキストを除去
      const timeInfo = extractTime(timeElement);
      let timestamp = timeInfo.datetime || timeInfo.text;
      
      // 時刻フォーマットを統一（YYYY/MM/DD HH:MM形式）、タイムゾーン考慮
      if (timestamp) {
        // libecity.comの時刻フォーマット（YYYY/MM/DD HH:MM）に対応
        const dateMatch = timestamp.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
        if (dateMatch) {
          const [, year, month, day, hour, minute] = dateMatch;
          
          // 日本時間として表示用文字列を作成
          const localTimeString = `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute}`;
          
          // Notion API用: 日本時間をUTC時刻に変換（Notionが自動でローカル時間として解釈するため）
          const japanDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+09:00`);
          const utcISOString = japanDate.toISOString(); // UTC時刻
          
          // タイムゾーン情報付きで保存
          content.timestamp = localTimeString; // 表示用（日本時間）
          content.timestampISO = utcISOString; // Notion API用（UTC時刻、タイムゾーンなし）
          content.timezone = null; // タイムゾーン指定なし
          
          console.log('Processed libecity timestamp:', {
            original: timestamp,
            local: localTimeString,
            utcISO: utcISOString,
            timezone: content.timezone,
            note: 'Sending UTC time without timezone specification (Notion will display in user timezone)'
          });
        } else {
          // その他のフォーマットの場合
          console.warn('Unexpected timestamp format:', timestamp);
          // クリーンアップされたテキストを使用
          content.timestamp = timeInfo.text;
        }
      }
      console.log('Extracted timestamp:', content.timestamp);
    }

    // 画像の抽出（プロキシ変換対応）
    try {
      console.log('Extracting images with proxy conversion support');
      const imageElements = element.querySelectorAll('img');
      console.log(`Found ${imageElements.length} total images in element`);
      
      content.images = Array.from(imageElements)
        .map((img, index) => {
          if (!img.src) return null;
          
          const validatedUrl = isValidImageUrl(img.src);
          if (!validatedUrl) return null;
          
          console.log(`Image ${index + 1} processed:`, {
            src: img.src.substring(0, 100) + '...',
            className: img.className,
            alt: img.alt,
            finalUrl: typeof validatedUrl === 'string' ? validatedUrl.substring(0, 100) + '...' : 'valid'
          });
          
          return {
            src: typeof validatedUrl === 'string' ? validatedUrl : img.src, // プロキシURLまたは元URL
            alt: img.alt || '',
            title: img.title || '',
            className: img.className || '',
            width: img.naturalWidth || img.width || 0,
            height: img.naturalHeight || img.height || 0
          };
        })
        .filter(img => img !== null)
        .slice(0, 5); // 最大5個まで
      
      console.log(`Successfully extracted ${content.images.length} valid images`);
      
    } catch (imageError) {
      console.error('Failed to extract images:', imageError);
      content.images = []; // エラー時は空配列
    }

    // リンクの抽出（URLリンク付きテキストを含む）
    const links = element.querySelectorAll('a[href]');
    content.links = Array.from(links)
      .filter(link => {
        // javascript:リンクやemptyリンクを除外
        return link.href && 
               !link.href.startsWith('javascript:') && 
               !link.href.startsWith('#') &&
               link.href.length > 0;
      })
      .map(link => {
        const linkText = link.textContent.trim();
        const linkUrl = link.href;
        
        // リンクに含まれる画像も取得
        const linkImages = link.querySelectorAll('img');
        const images = Array.from(linkImages).map(img => ({
          src: img.src,
          alt: img.alt || '',
          title: img.title || ''
        }));
        
        return {
          url: linkUrl,
          text: linkText,
          title: link.title || '',
          target: link.target || '',
          images: images,
          isImageLink: linkImages.length > 0,
          // リンクの種類を判定
          type: linkUrl.includes('youtube.com') || linkUrl.includes('youtu.be') ? 'youtube' :
                linkUrl.includes('twitter.com') || linkUrl.includes('x.com') ? 'twitter' :
                linkUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' :
                'general'
        };
      });
    
    console.log(`Found ${content.links.length} links:`, content.links);

    // メンションの抽出
    const mentions = element.querySelectorAll('[class*="mention"], [data-mention]');
    content.mentions = Array.from(mentions).map(mention => ({
      text: mention.textContent.trim(),
      userId: mention.dataset.userId || '',
      userName: mention.dataset.userName || ''
    }));

    // 構造化コンテンツの生成（テキスト、画像、リンクを統合）
    // つぶやき投稿の場合は構造化コンテンツ処理をスキップ（重複防止）
    const isOriginalTweet = element.classList.contains('originalTweetArea') || 
                           element.querySelector('.originalTweetArea') ||
                           element.classList.contains('tweetArea') ||
                           element.querySelector('.tweetArea');
    
    if (isOriginalTweet) {
      console.log('Skipping structured content extraction for tweet (avoiding duplication)');
      content.structuredContent = [];
    } else {
      try {
        console.log('Extracting structured content...');
        content.structuredContent = extractStructuredContent(element);
        console.log(`Generated ${content.structuredContent.length} structured blocks`);
        
        // 構造化コンテンツが正常に抽出された場合、詳細ログを出力
        if (content.structuredContent.length > 0) {
          const contentSummary = content.structuredContent.reduce((acc, item) => {
            acc[item.type] = (acc[item.type] || 0) + 1;
            return acc;
          }, {});
          console.log('Structured content summary:', contentSummary);
          
          // 構造化コンテンツが存在する場合の重複防止処理
          const structuredTextLength = content.structuredContent
            .filter(item => item.type === 'rich_text' && item.content)
            .reduce((total, item) => total + (item.content ? item.content.length : 0), 0);
          
          console.log('Structured content analysis:', {
            structuredBlocks: content.structuredContent.length,
            structuredTextLength: structuredTextLength,
            mainTextLength: content.text ? content.text.length : 0
          });
          
          // 構造化コンテンツに十分なテキストがある場合のみメインテキストをクリア
          if (structuredTextLength > 100) {
            console.log(`Sufficient structured content found (${structuredTextLength} chars), clearing main text to prevent duplication`);
            content.text = '（構造化コンテンツのみ使用）'; // 特別なマーカーを設定
            content.useStructuredContentOnly = true; // フラグを設定
          } else {
            console.log(`Insufficient structured content (${structuredTextLength} chars), keeping main text to ensure content availability`);
            content.useStructuredContentOnly = false;
          }
          
          // 構造化コンテンツから画像を抽出して、メイン画像配列に統合
          const structuredImages = content.structuredContent
            .filter(item => item.type === 'image' && item.src)
            .map(item => ({
              src: item.src,
              alt: item.alt || '',
              title: item.title || '',
              className: '',
              width: item.width || 0,
              height: item.height || 0
            }));
            
          if (structuredImages.length > 0) {
            console.log(`Found ${structuredImages.length} images in structured content`);
            // 重複を除去して統合
            const existingUrls = new Set(content.images.map(img => img.src));
            const newImages = structuredImages.filter(img => !existingUrls.has(img.src));
            content.images = [...content.images, ...newImages];
            console.log(`Added ${newImages.length} new images from structured content`);
          }
          
          // 構造化コンテンツからリンクを抽出して、メインリンク配列に統合
          const structuredLinks = content.structuredContent
            .filter(item => item.type === 'rich_text' && item.link && item.link.url)
            .map(item => ({
              url: item.link.url,
              text: item.content || '',
              title: '',
              target: '',
              images: [],
              isImageLink: false,
              type: item.link.url.includes('youtube.com') || item.link.url.includes('youtu.be') ? 'youtube' :
                    item.link.url.includes('twitter.com') || item.link.url.includes('x.com') ? 'twitter' :
                    'general'
            }));
            
          if (structuredLinks.length > 0) {
            console.log(`Found ${structuredLinks.length} links in structured content`);
            // 重複を除去して統合
            const existingUrls = new Set(content.links.map(link => link.url));
            const newLinks = structuredLinks.filter(link => !existingUrls.has(link.url));
            content.links = [...content.links, ...newLinks];
            console.log(`Added ${newLinks.length} new links from structured content`);
          }
        } else {
          console.log('No structured content found, using direct extraction');
        }
      } catch (error) {
        console.error('Failed to extract structured content:', error);
        content.structuredContent = [];
      }
    }

    console.log('Extracted content:', content);
    return content;

  } catch (error) {
    console.error('Failed to extract element content:', error);
    throw error;
  }
}

// コンテンツの検証とクリーンアップ（つぶやき投稿対応強化）
function validateAndCleanContent(content) {
  try {
    const cleanedContent = { ...content };
    
    // テキストの検証（構造化コンテンツ考慮）
    if (!cleanedContent.text || typeof cleanedContent.text !== 'string') {
      cleanedContent.text = '';
    }
    
    cleanedContent.text = cleanedContent.text.trim();
    
    // テキストが空の場合、構造化コンテンツがあるかチェック
    if (cleanedContent.text.length === 0) {
      // 構造化コンテンツがある場合は許可
      if (cleanedContent.structuredContent && cleanedContent.structuredContent.length > 0) {
        const structuredTextLength = cleanedContent.structuredContent
          .filter(item => item.type === 'rich_text' && item.content)
          .reduce((total, item) => total + (item.content ? item.content.length : 0), 0);
        
        if (structuredTextLength > 10) {
          console.log('No main text but sufficient structured content found');
          cleanedContent.text = '（構造化コンテンツ）'; // プレースホルダーテキスト
        } else {
          console.error('Empty text content and insufficient structured content');
          throw new Error('テキストコンテンツが空です。この投稿は保存できません。');
        }
      } else {
        console.error('Empty text content after cleaning');
        throw new Error('テキストコンテンツが空です。この投稿は保存できません。');
      }
    }
    
    // 非常に短いテキスト（2文字以下）の場合は警告
    if (cleanedContent.text.length <= 2) {
      console.warn('Very short text content:', cleanedContent.text);
      throw new Error('テキストが短すぎます（2文字以下）。この投稿は保存できません。');
    }
    
    // Notionアイコンのテキストのみの場合はエラー
    const notionOnlyPattern = /^(Notionに保存|保存中|保存完了|保存済み|保存エラー|\.\.\.|[\s\u00A0])*$/;
    if (notionOnlyPattern.test(cleanedContent.text)) {
      console.error('Text contains only Notion icon text:', cleanedContent.text);
      throw new Error('Notionアイコンのテキストのみです。この投稿は保存できません。');
    }
    
    console.log('Text validation passed:', cleanedContent.text.substring(0, 50) + '...');
    
    // 画像配列の安全性チェック
    if (cleanedContent.images && Array.isArray(cleanedContent.images)) {
      // 既に抽出時に検証済みなので、基本的なチェックのみ
      cleanedContent.images = cleanedContent.images.filter(image => {
        return image && image.src && typeof image.src === 'string';
      }).slice(0, 5); // 最大5個まで
      
      console.log(`Cleaned images: ${cleanedContent.images.length} valid`);
    } else {
      cleanedContent.images = [];
    }
    
    // リンク配列の安全性チェック
    if (cleanedContent.links && Array.isArray(cleanedContent.links)) {
      cleanedContent.links = cleanedContent.links.filter(link => {
        return link && link.url && typeof link.url === 'string';
      }).slice(0, 10); // 最大10個まで
      
      console.log(`Cleaned links: ${cleanedContent.links.length} valid`);
    } else {
      cleanedContent.links = [];
    }
    
    // テキストの長さ制限（大幅に緩和）
    if (cleanedContent.text.length > 50000) {
      console.warn('Text extremely long, truncating');
      cleanedContent.text = cleanedContent.text.substring(0, 49500) + '...(truncated)';
    }
    
    // 必須フィールドの確保
    cleanedContent.author = cleanedContent.author || '不明';
    cleanedContent.timestamp = cleanedContent.timestamp || new Date().toISOString();
    cleanedContent.url = cleanedContent.url || window.location.href;
    cleanedContent.chatRoomName = cleanedContent.chatRoomName || 'libecity チャット';
    
    return cleanedContent;
    
  } catch (error) {
    console.error('Error in validateAndCleanContent:', error);
    throw error; // エラーを再スローして上位で処理
  }
}

// 保存済み投稿の追跡
const savedPosts = new Set();

// 投稿の一意性を判定する関数
function getPostUniqueId(postElement) {
  // data-id属性があればそれを使用（最優先）
  const dataId = postElement.getAttribute('data-id') || 
                 postElement.getAttribute('data-post-id') ||
                 postElement.getAttribute('data-message-id');
  if (dataId) {
    return `data-id:${dataId}`;
  }
  
  // つぶやき投稿の特別処理：より安定したID生成
  const isOriginalTweet = postElement.classList.contains('originalTweetArea') || 
                         postElement.querySelector('.originalTweetArea') ||
                         postElement.classList.contains('tweetArea') ||
                         postElement.querySelector('.tweetArea');
  
  // DOM要素の特徴を組み合わせて一意性を高める（つぶやき投稿対応）
  const elementFeatures = {
    tagName: postElement.tagName,
    className: postElement.className,
    childElementCount: postElement.childElementCount,
    firstChildTagName: postElement.firstElementChild?.tagName || '',
    hasImages: postElement.querySelectorAll('img').length > 0,
    hasLinks: postElement.querySelectorAll('a').length > 0,
    isTweet: isOriginalTweet,
    parentClassName: postElement.parentElement?.className || ''
  };
  
  // テキストコンテンツのハッシュを生成（Notionアイコンのテキストを除外）
  let textContent = postElement.textContent || '';
  
  // Notionアイコン関連のテキストを除去
  textContent = textContent
    .replace(/Notionに保存/g, '')
    .replace(/保存中\.\.\./g, '')
    .replace(/保存中/g, '')
    .replace(/保存完了!/g, '')
    .replace(/保存済み/g, '')
    .replace(/保存エラー/g, '');
  
  const cleanText = textContent.replace(/\s+/g, ' ').trim();
  
  // つぶやき投稿の場合は、より厳密なテキスト抽出を行う
  if (isOriginalTweet && cleanText.length > 5) {
    const tweetTextElement = postElement.querySelector('.post_text') || 
                            postElement.querySelector('.originalTweetArea .post_text') ||
                            postElement.querySelector('.tweetArea .post_text');
    
    if (tweetTextElement) {
      let tweetText = tweetTextElement.textContent || '';
      // Notionアイコンのテキストを除去
      tweetText = tweetText
        .replace(/Notionに保存/g, '')
        .replace(/保存中\.\.\./g, '')
        .replace(/保存中/g, '')
        .replace(/保存完了!/g, '')
        .replace(/保存済み/g, '')
        .replace(/保存エラー/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (tweetText.length > 5) {
        // つぶやきテキストのハッシュを生成
        const hashText = tweetText.substring(0, 100);
        try {
          const utf8Bytes = new TextEncoder().encode(hashText);
          if (utf8Bytes.length <= 8000) {
            const binaryString = String.fromCharCode(...utf8Bytes);
            const featuresHash = JSON.stringify(elementFeatures).length.toString(36);
            const tweetId = `tweet-text:${btoa(binaryString).substring(0, 15)}-${featuresHash}`;
            console.log('Generated tweet ID from text:', tweetId);
            return tweetId;
          }
        } catch (error) {
          console.warn('Failed to encode tweet text, using fallback method');
        }
        
        // フォールバック：シンプルハッシュ
        let simpleHash = 0;
        for (let i = 0; i < Math.min(hashText.length, 50); i++) {
          const char = hashText.charCodeAt(i);
          simpleHash = ((simpleHash << 5) - simpleHash) + char;
          simpleHash = simpleHash & simpleHash;
        }
        
        const firstChars = hashText.substring(0, 10).replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '');
        const lengthHash = hashText.length.toString(36);
        const featuresHash = JSON.stringify(elementFeatures).length.toString(36);
        const combinedHash = `${Math.abs(simpleHash).toString(36)}-${lengthHash}-${featuresHash}-${firstChars}`;
        
        const tweetId = `tweet-text:${combinedHash.substring(0, 25)}`;
        console.log('Generated tweet ID from simple hash:', tweetId);
        return tweetId;
      }
    }
  }
  
  // 通常の投稿の場合
  if (cleanText.length > 10) {
    // テキストの最初の100文字をハッシュ化（日本語対応）
    const hashText = cleanText.substring(0, 100);
    try {
      // 方法1: UTF-8文字列を安全にBase64エンコード
      const utf8Bytes = new TextEncoder().encode(hashText);
      if (utf8Bytes.length <= 8000) {
        const binaryString = String.fromCharCode(...utf8Bytes);
        const featuresHash = JSON.stringify(elementFeatures).length.toString(36);
        return `text-hash:${btoa(binaryString).substring(0, 15)}-${featuresHash}`;
      }
    } catch (error) {
      console.warn('Failed to encode text for hash, using simple hash:', error);
    }
    
    // 方法2: 日本語対応のシンプルハッシュ
    let simpleHash = 0;
    for (let i = 0; i < Math.min(hashText.length, 50); i++) {
      const char = hashText.charCodeAt(i);
      simpleHash = ((simpleHash << 5) - simpleHash) + char;
      simpleHash = simpleHash & simpleHash;
    }
    
    // 方法3: 文字列の長さと最初の数文字を組み合わせ（日本語文字も保持）
    const firstChars = hashText.substring(0, 10).replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '');
    const lengthHash = hashText.length.toString(36);
    const featuresHash = JSON.stringify(elementFeatures).length.toString(36);
    const combinedHash = `${Math.abs(simpleHash).toString(36)}-${lengthHash}-${featuresHash}-${firstChars}`;
    
    return `text-hash:${combinedHash.substring(0, 25)}`;
  }
  
  // フォールバック: 要素の位置とクラス名、時刻、要素特徴を組み合わせ
  const rect = postElement.getBoundingClientRect();
  const className = postElement.className || '';
  const timestamp = Date.now();
  const featuresHash = JSON.stringify(elementFeatures).length.toString(36);
  const fallbackId = `position:${Math.round(rect.top)}-${Math.round(rect.left)}-${className.substring(0, 10)}-${timestamp}-${featuresHash}`;
  console.log('Generated fallback ID:', fallbackId);
  return fallbackId;
}

// 汎用Notion保存処理（従来の投稿用）
async function handleNotionSave(postElement, iconElement) {
  try {
    console.log('=== STARTING GENERAL NOTION SAVE PROCESS ===');
    console.log('Post element:', postElement);
    
    // つぶやき投稿の場合は専用処理にリダイレクト
    const isTweet = isTweetPost(postElement);
    console.log(`Tweet post check: ${isTweet}, current page: ${window.location.pathname}`);
    if (isTweet) {
      console.log('Detected tweet post, redirecting to tweet-specific handler');
      return await handleTweetSave(postElement, iconElement);
    }
    
    console.log('Processing as general post (confirmed not tweet)');
    
    // 重複チェック
    const postId = getPostUniqueId(postElement);
    console.log('Generated post ID:', postId);
    console.log('Currently saved posts:', Array.from(savedPosts));
    
    if (savedPosts.has(postId)) {
      console.log('Post already saved, skipping:', postId);
      showAlreadySavedIcon(iconElement);
      return;
    }
    
    // 保存処理中かチェック
    if (iconElement.dataset.saving === 'true') {
      console.log('Post is currently being saved, skipping duplicate request');
      return;
    }
    
    // 保存処理中フラグを設定
    iconElement.dataset.saving = 'true';
    
    // Chrome拡張機能APIの利用可能性をチェック
    if (!chrome || !chrome.storage || !chrome.runtime) {
      throw new Error('Chrome拡張機能APIが利用できません。ページを再読み込みしてください。');
    }
    
    // アイコンの状態を保存中に変更
    showSavingIcon(iconElement);
    

    
    // コンテンツを抽出
    console.log('=== EXTRACTING CONTENT ===');
    const content = await extractElementContent(postElement);
    console.log('Raw extracted content:', content);
    console.log('Content type analysis:', {
      hasText: !!(content.text && content.text.trim()),
      textLength: content.text ? content.text.length : 0,
      hasImages: !!(content.images && content.images.length > 0),
      imageCount: content.images ? content.images.length : 0,
      hasLinks: !!(content.links && content.links.length > 0),
      linkCount: content.links ? content.links.length : 0,
      hasStructuredContent: !!(content.structuredContent && content.structuredContent.length > 0),
      structuredContentCount: content.structuredContent ? content.structuredContent.length : 0
    });
    
    // コンテンツの検証とクリーンアップ
    console.log('=== VALIDATING AND CLEANING CONTENT ===');
    let cleanedContent;
    try {
      cleanedContent = validateAndCleanContent(content);
      console.log('Cleaned content for Notion:', cleanedContent);
      console.log('Cleaned content type analysis:', {
        hasText: !!(cleanedContent.text && cleanedContent.text.trim()),
        textLength: cleanedContent.text ? cleanedContent.text.length : 0,
        hasImages: !!(cleanedContent.images && cleanedContent.images.length > 0),
        imageCount: cleanedContent.images ? cleanedContent.images.length : 0,
        hasLinks: !!(cleanedContent.links && cleanedContent.links.length > 0),
        linkCount: cleanedContent.links ? cleanedContent.links.length : 0
      });
    } catch (validationError) {
      console.error('Content validation failed:', validationError);
      
      // 検証エラーの場合はアイコンの状態を元に戻す
      iconElement.dataset.saving = 'false';
      showErrorIcon(iconElement, validationError.message);
      return;
    }
    
    // 保存先データベースを取得
    let databaseId;
    try {
      const settings = await chrome.storage.sync.get(['notionDatabaseId']);
      databaseId = settings.notionDatabaseId;
      
      // データベースIDの診断情報を表示
      console.log('=== CONTENT SCRIPT DATABASE ID DIAGNOSTIC ===');
      console.log('Retrieved database ID:', databaseId);
      console.log('Database ID type:', typeof databaseId);
      console.log('Database ID length:', databaseId ? databaseId.length : 'undefined');
      console.log('Database ID format valid:', databaseId ? /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(databaseId) : false);
      console.log('Full storage settings:', settings);
      console.log('================================================');
      
    } catch (error) {
      console.error('Failed to get storage settings:', error);
      throw new Error('設定の取得に失敗しました。拡張機能の権限を確認してください。');
    }
    
    if (!databaseId) {
      throw new Error('保存先データベースが選択されていません。拡張機能の設定を確認してください。');
    }
    
    // Notionに保存（クリーンアップされたコンテンツを使用）
    console.log('=== SENDING TO BACKGROUND SCRIPT ===');
    console.log('Database ID:', databaseId);
    console.log('Content being sent:', cleanedContent);
    
    let response;
    try {
      response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'saveToNotion',
          databaseId: databaseId,
          content: cleanedContent
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      console.log('=== BACKGROUND SCRIPT RESPONSE ===');
      console.log('Response:', response);
      console.log('Response details:', JSON.stringify(response, null, 2));
    } catch (error) {
      console.error('Failed to send message to background script:', error);
      throw new Error('バックグラウンドスクリプトとの通信に失敗しました。拡張機能を再読み込みしてください。');
    }
    
    if (response && response.success) {
      // 保存成功時に投稿IDを追跡に追加
      savedPosts.add(postId);
      console.log('Post saved successfully, added to tracking:', postId);
      
      // 保存処理中フラグをクリア
      iconElement.dataset.saving = 'false';
      
      // 画像保存失敗がある場合はコールアウト表示
      if (response.imageFailures && response.imageFailures.length > 0) {
        showImageFailureCallout(response.imageFailures);
      }
      
      // 成功時のアイコン表示
      showSuccessIcon(iconElement);
      
      console.log('Post saved to Notion successfully');
      
    } else {
      // デバッグ用：詳細なエラー情報をログ出力
      console.error('=== DETAILED ERROR FROM BACKGROUND ===');
      console.error('Error message:', response?.error);
      console.error('Error details:', response?.details);
      console.error('Full response:', JSON.stringify(response, null, 2));
      console.error('=====================================');
      
      // ユーザーフレンドリーなエラーメッセージに変換
      let userFriendlyError = '保存に失敗しました';
      const originalError = response?.error || '';
      
      if (originalError.includes('テキストが長すぎます')) {
        userFriendlyError = 'テキストが長すぎます';
      } else if (originalError.includes('データベースのプロパティ設定')) {
        userFriendlyError = 'データベース設定に問題があります';
      } else if (originalError.includes('画像の保存に失敗')) {
        userFriendlyError = '画像の保存に失敗しました';
      } else if (originalError.includes('通信エラー')) {
        userFriendlyError = 'ネットワークエラーが発生しました';
      } else {
        // 詳細なエラー情報も含める（デバッグ用）
        userFriendlyError = `保存に失敗しました: ${originalError}`;
      }
      
      throw new Error(userFriendlyError);
    }
    
  } catch (error) {
    console.error('Failed to save post to Notion:', error);
    
    // 保存処理中フラグをクリア
    iconElement.dataset.saving = 'false';
    
    // エラー時のアイコン表示
    showErrorIcon(iconElement, error.message);
  }
}

// 画像保存失敗時のコールアウト表示
function showImageFailureCallout(imageFailures) {
  // 既存のコールアウトがあれば削除
  const existingCallout = document.getElementById('notion-image-failure-callout');
  if (existingCallout) {
    existingCallout.remove();
  }
  
  // コールアウト要素を作成
  const callout = document.createElement('div');
  callout.id = 'notion-image-failure-callout';
  callout.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #ff6b6b, #feca57);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    max-width: 90%;
    text-align: center;
    animation: slideInFromTop 0.3s ease-out;
    border: 1px solid rgba(255, 255, 255, 0.2);
  `;
  
  // メッセージ内容を作成（新しい構造に対応）
  let message, subMessage;
  
  if (imageFailures.detected && imageFailures.failed) {
    // 新しい構造の場合
    if (imageFailures.successful > 0) {
      message = `⚠️ 投稿は保存されましたが、${imageFailures.detected}個中${imageFailures.failed}個の画像が保存できませんでした`;
      subMessage = `${imageFailures.successful}個の画像は正常に保存されました。テキストと他の要素も正常に保存されています。`;
    } else {
      message = `⚠️ 投稿は保存されましたが、${imageFailures.detected}個の画像が保存できませんでした`;
      subMessage = 'テキストと他の要素は正常に保存されています。画像保存エラー: Notion APIと互換性のないURL形式';
    }
  } else {
    // 古い構造の場合（後方互換性）
    const failureCount = Array.isArray(imageFailures) ? imageFailures.length : (imageFailures.failed || 1);
    message = `⚠️ 投稿は保存されましたが、${failureCount}個の画像が保存できませんでした`;
    subMessage = 'テキストと他の要素は正常に保存されています。画像保存エラー: Notion APIと互換性のないURL形式';
  }
  
  callout.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 15px;">
      <div>
        <div style="font-weight: 600;">${message}</div>
        <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">
          ${subMessage}
        </div>
      </div>
      <button id="notion-callout-close" style="
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: background 0.2s ease;
      " onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'" 
         onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'">×</button>
    </div>
  `;
  
  // ページに追加
  document.body.appendChild(callout);
  
  // 閉じるボタンのイベントリスナー
  const closeButton = document.getElementById('notion-callout-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      callout.style.animation = 'slideOutToTop 0.3s ease-in forwards';
      setTimeout(() => {
        if (callout.parentNode) {
          callout.remove();
        }
      }, 300);
    });
  }
  
  // 8秒後に自動で消す
  setTimeout(() => {
    if (callout.parentNode) {
      callout.style.animation = 'slideOutToTop 0.3s ease-in forwards';
      setTimeout(() => {
        if (callout.parentNode) {
          callout.remove();
        }
      }, 300);
    }
  }, 8000);
  
  // デバッグ情報をコンソールに出力
  console.log('Image failure statistics:', imageFailures);
}

// CSSスタイルを追加
function addNotionIconStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .notion-save-icon {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    

    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    @keyframes slideInFromTop {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    
    @keyframes slideOutToTop {
      from {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      to {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
      }
    }
    
    .notion-save-icon:hover .notion-icon-tooltip {
      display: block !important;
    }
    
    .notion-save-icon svg {
      transition: transform 0.2s ease;
    }
    
    .notion-save-icon:hover svg {
      transform: scale(1.1);
    }
  `;
  document.head.appendChild(style);
}

// 初期化実行（即座に開始）
if (document.readyState === 'loading') {
  // ページがまだ読み込み中の場合も、可能な限り早期に実行
  initialize();
} else {
  // ページが既に読み込み完了している場合は即座に実行
  initialize();
}

// 追加のスタイルを即座に適用
addNotionIconStyles();

// デバッグ用関数（開発者コンソールで使用可能）
window.debugNotionIcons = function() {
  console.log('=== Notion Icons Debug ===');
  
  const articles = document.querySelectorAll('article[data-id]');
  const logDetails = document.querySelectorAll('.log_detail');
  const existingIcons = document.querySelectorAll('.notion-save-icon');
  
  console.log(`Found ${articles.length} article[data-id] elements`);
  console.log(`Found ${logDetails.length} .log_detail elements`);
  console.log(`Found ${existingIcons.length} existing notion icons`);
  
  articles.forEach((article, index) => {
    const dataId = article.getAttribute('data-id');
    const hasIcon = article.querySelector('.notion-save-icon');
    console.log(`Article ${index}: data-id=${dataId}, hasIcon=${!!hasIcon}`);
  });
  
  logDetails.forEach((detail, index) => {
    const hasIcon = detail.querySelector('.notion-save-icon');
    const parentArticle = detail.closest('article[data-id]');
    console.log(`LogDetail ${index}: hasIcon=${!!hasIcon}, parentArticle=${!!parentArticle}`);
  });
  
  console.log('========================');
  
  return {
    articles: articles.length,
    logDetails: logDetails.length,
    existingIcons: existingIcons.length
  };
};

// パフォーマンス測定用デバッグ関数
window.debugPerformance = function() {
  console.log('=== Performance Debug ===');
  
  const startTime = performance.now();
  
  // 初期化状態の確認
  console.log('Setup flags:');
  console.log('- libecityObserverSetup:', window.libecityObserverSetup);
  console.log('- libecityChatMonitoringSetup:', window.libecityChatMonitoringSetup);
  console.log('- libecityMessageListenerSetup:', window.libecityMessageListenerSetup);
  
  // DOM状態の確認
  console.log('DOM state:');
  console.log('- readyState:', document.readyState);
  console.log('- body exists:', !!document.body);
  
  // アイコン追加のパフォーマンステスト
  const iconTestStart = performance.now();
  addNotionIconsToPosts();
  const iconTestEnd = performance.now();
  
  console.log(`Icon addition took: ${(iconTestEnd - iconTestStart).toFixed(2)}ms`);
  
  const endTime = performance.now();
  console.log(`Total debug time: ${(endTime - startTime).toFixed(2)}ms`);
  console.log('========================');
  
  return {
    setupFlags: {
      observer: window.libecityObserverSetup,
      chatMonitoring: window.libecityChatMonitoringSetup,
      messageListener: window.libecityMessageListenerSetup
    },
    timings: {
      iconAddition: iconTestEnd - iconTestStart,
      totalDebug: endTime - startTime
    }
  };
};

// 投稿ID生成のデバッグ関数
window.debugPostId = function(postElement) {
  if (!postElement) {
    console.log('Usage: debugPostId(postElement)');
    console.log('Example: debugPostId(document.querySelector("article[data-id]"))');
    return;
  }
  
  console.log('=== Post ID Generation Debug ===');
  console.log('Post element:', postElement);
  
  try {
    const postId = getPostUniqueId(postElement);
    console.log('Generated post ID:', postId);
    
    // 詳細情報
    const dataId = postElement.getAttribute('data-id');
    const textContent = postElement.textContent || '';
    const cleanText = textContent.replace(/\s+/g, ' ').trim();
    
    console.log('Details:');
    console.log('- data-id:', dataId || 'None');
    console.log('- text length:', cleanText.length);
    console.log('- text preview:', cleanText.substring(0, 100) + '...');
    console.log('- contains Japanese:', /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(cleanText));
    
    console.log('================================');
    return postId;
  } catch (error) {
    console.error('Post ID generation failed:', error);
    return null;
  }
};

// コンテンツ抽出のデバッグ関数
window.debugContentExtraction = async function(postElement) {
  if (!postElement) {
    console.log('Usage: debugContentExtraction(postElement)');
    console.log('Example: debugContentExtraction(document.querySelector("article[data-id]"))');
    console.log('Example: debugContentExtraction(document.querySelector(".log_detail"))');
    
    // 利用可能な投稿要素を表示
    const posts = document.querySelectorAll('article[data-id], .log_detail, .originalTweetArea, .tweetArea');
    console.log(`Found ${posts.length} potential post elements:`, posts);
    return;
  }
  
  console.log('=== Content Extraction Debug ===');
  console.log('Post element:', postElement);
  
  try {
    const content = await extractElementContent(postElement);
    
    console.log('Extracted content:');
    console.log('- Text length:', content.text ? content.text.length : 0);
    console.log('- Text preview:', content.text ? content.text.substring(0, 200) + '...' : 'No text');
    console.log('- Images count:', content.images ? content.images.length : 0);
    console.log('- Links count:', content.links ? content.links.length : 0);
    console.log('- Author:', content.author || 'No author');
    console.log('- Timestamp:', content.timestamp || 'No timestamp');
    console.log('- URL:', content.url);
    console.log('- Structured content blocks:', content.structuredContent ? content.structuredContent.length : 0);
    
    if (content.images && content.images.length > 0) {
      console.log('Images:', content.images.map(img => ({ src: img.src.substring(0, 100) + '...', alt: img.alt })));
    }
    
    if (content.links && content.links.length > 0) {
      console.log('Links:', content.links.map(link => ({ url: link.url, text: link.text, type: link.type })));
    }
    
    console.log('================================');
    return content;
  } catch (error) {
    console.error('Content extraction failed:', error);
    return null;
  }
};

// 保存済み投稿の確認機能
window.debugSavedPosts = function() {
  console.log('=== Saved Posts Debug ===');
  console.log('Saved posts count:', savedPosts.size);
  console.log('Saved post IDs:', Array.from(savedPosts));
  
  // 現在のページの投稿と照合
  const currentPosts = document.querySelectorAll('article[data-id], .log_detail, .originalTweetArea, .tweetArea');
  console.log('Current posts on page:', currentPosts.length);
  
  currentPosts.forEach((post, index) => {
    try {
      const postId = getPostUniqueId(post);
      const isSaved = savedPosts.has(postId);
      console.log(`Post ${index + 1}: ID=${postId}, Saved=${isSaved}`);
    } catch (error) {
      console.error(`Failed to get ID for post ${index + 1}:`, error);
    }
  });
  
  console.log('========================');
  return {
    savedCount: savedPosts.size,
    currentPostsCount: currentPosts.length,
    savedIds: Array.from(savedPosts)
  };
};

// 保存済み投稿をクリアする機能
window.clearSavedPosts = function() {
  const count = savedPosts.size;
  savedPosts.clear();
  console.log(`Cleared ${count} saved post IDs`);
  return count;
};

window.debugExtractPostUrl = async function(postElement) {
  if (!postElement) {
    console.log('Usage: debugExtractPostUrl(postElement)');
    console.log('Example: debugExtractPostUrl(document.querySelector("article[data-id]"))');
    console.log('Example: debugExtractPostUrl(document.querySelector(".log_detail"))');
    
    // 利用可能な投稿要素を表示
    const posts = document.querySelectorAll('article[data-id], .post, .message, [data-id]');
    console.log(`Found ${posts.length} potential post elements:`, posts);
    return;
  }
  
  console.log('=== Post URL Extraction Debug ===');
  console.log('Post element:', postElement);
  console.log('Current page URL:', window.location.href);
  
  // データ属性の詳細確認
  const dataId = postElement.getAttribute('data-id');
  const dataPostId = postElement.getAttribute('data-post-id');
  const dataMessageId = postElement.getAttribute('data-message-id');
  const id = postElement.getAttribute('id');
  
  console.log('Data attributes:');
  console.log('- data-id:', dataId);
  console.log('- data-post-id:', dataPostId);
  console.log('- data-message-id:', dataMessageId);
  console.log('- id:', id);
  
  // 親要素の確認
  let parentElement = postElement.parentElement;
  for (let i = 0; i < 3 && parentElement; i++) {
    const parentDataId = parentElement.getAttribute('data-id');
    if (parentDataId) {
      console.log(`Parent ${i + 1} data-id:`, parentDataId);
    }
    parentElement = parentElement.parentElement;
  }
  
  try {
    const url = await extractPostUrl(postElement);
    console.log('Extracted URL:', url);
    console.log('Is unique URL:', url !== window.location.href);
    console.log('================================');
    return url;
  } catch (error) {
    console.error('Error extracting URL:', error);
    return null;
  }
}; 

// つぶやき投稿専用の処理システム
const TWEET_SYSTEM = {
  // つぶやき投稿の検出セレクタ（優先順位順）
  selectors: [
    '.originalTweetArea',
    '.tweetArea',
    '.log_detail:has(.post_text)',
    '.log_detail'
  ],
  
  // つぶやき投稿の必須要素
  requiredElements: {
    text: ['.post_text', '.tweet-text', '.content'],
    author: ['.post_user_name', '.author', '.username'],
    time: ['time', '.timestamp', '.post-time']
  },
  
  // 除外すべき要素
  excludeElements: [
    '.notion-save-icon',
    '.notification',
    '.action-button',
    '.menu'
  ]
};

// つぶやき投稿かどうかを判定
function isTweetPost(element) {
  if (!element) return false;
  
  // 1. クラス名による判定（確実なつぶやき投稿）
  const classList = element.classList;
  if (classList.contains('originalTweetArea') || classList.contains('tweetArea')) {
    return true;
  }
  
  // 2. URL判定（つぶやきページの場合のみ厳密に判定）
  const isOnTweetPage = window.location.pathname.includes('/tweet');
  
  // つぶやきページでない場合は、つぶやき投稿ではない
  if (!isOnTweetPage) {
    return false;
  }
  
  // 3. つぶやきページでの判定
  if (isOnTweetPage) {
    console.log(`Tweet page detection for element:`, element);
    console.log(`- tagName: ${element.tagName}`);
    console.log(`- classes: ${element.className}`);
    console.log(`- data-id: ${element.getAttribute('data-id')}`);
    
    // つぶやきページでは、article[data-id]またはlog_detailをつぶやき投稿として扱う
    if (element.tagName === 'ARTICLE' && element.getAttribute('data-id')) {
      // article[data-id]要素の場合、つぶやき投稿の構造をチェック
      const hasPostText = element.querySelector('.post_text');
      // つぶやき投稿では様々なユーザー名セレクタを試す
      const hasUserName = element.querySelector('.post_user_name') ||
                         element.querySelector('.user_name') ||
                         element.querySelector('.author') ||
                         element.querySelector('.username') ||
                         element.querySelector('[class*="user"]') ||
                         element.querySelector('[class*="author"]');
      const hasTime = element.querySelector('time');
      
      console.log(`Article tweet detection:`, {hasPostText: !!hasPostText, hasUserName: !!hasUserName, hasTime: !!hasTime});
      
      // つぶやき投稿の場合、テキストと時刻があれば有効とする（ユーザー名は必須ではない）
      if (hasPostText && hasTime) {
        console.log('Identified article as tweet post on tweet page (relaxed criteria)');
        return true;
      }
    } else if (element.classList.contains('log_detail')) {
      // log_detail要素の場合
      const hasPostText = element.querySelector('.post_text');
      // つぶやき投稿では様々なユーザー名セレクタを試す
      const hasUserName = element.querySelector('.post_user_name') ||
                         element.querySelector('.user_name') ||
                         element.querySelector('.author') ||
                         element.querySelector('.username') ||
                         element.querySelector('[class*="user"]') ||
                         element.querySelector('[class*="author"]');
      const hasTime = element.querySelector('time');
      
      console.log(`Log_detail tweet detection:`, {hasPostText: !!hasPostText, hasUserName: !!hasUserName, hasTime: !!hasTime});
      
      // つぶやき投稿の場合、テキストと時刻があれば有効とする（ユーザー名は必須ではない）
      if (hasPostText && hasTime) {
        console.log('Identified log_detail as tweet post on tweet page (relaxed criteria)');
        return true;
      }
    }
    
    console.log('Element does not match tweet post criteria');
  }
  
  return false;
}

// つぶやき投稿専用のコンテンツ抽出
async function extractTweetContent(tweetElement) {
  console.log('=== TWEET-SPECIFIC CONTENT EXTRACTION ===');
  
  try {
    // 基本情報の抽出
    const content = {
      text: '',
      author: '',
      timestamp: '',
      images: [],
      links: [],
      url: '',
      chatRoom: 'つぶやき一覧',
      extractedAt: new Date().toISOString(),
      isTweet: true
    };
    
    // 1. テキスト抽出（つぶやき専用）
    const textElement = tweetElement.querySelector('.post_text');
    if (textElement) {
      // Notionアイコンのテキストを除外してテキストを抽出
      const clonedElement = textElement.cloneNode(true);
      const notionIcons = clonedElement.querySelectorAll('.notion-save-icon');
      notionIcons.forEach(icon => icon.remove());
      
      content.text = clonedElement.textContent?.trim() || '';
      console.log('Extracted tweet text:', content.text.substring(0, 100) + '...');
    }
    
    // 2. 作者名抽出
    const authorElement = tweetElement.querySelector('.post_user_name') || 
                         tweetElement.querySelector('.user_name') ||
                         tweetElement.querySelector('.author') ||
                         tweetElement.querySelector('.username') ||
                         tweetElement.querySelector('[class*="user"]') ||
                         tweetElement.querySelector('[class*="author"]');
    if (authorElement) {
      content.author = authorElement.textContent?.trim() || '';
      console.log('Extracted tweet author:', content.author);
    } else {
      // ユーザー名が見つからない場合のフォールバック
      content.author = 'つぶやき投稿者';
      console.log('No author element found, using fallback:', content.author);
    }
    
    // 3. 時刻抽出（Notionアイコンのテキストを除外）
    const timeElement = tweetElement.querySelector('time') ||
                       tweetElement.querySelector('.timestamp') ||
                       tweetElement.querySelector('.post-time');
    if (timeElement) {
      // time要素をクローンしてNotionアイコンを除去
      const clonedTimeElement = timeElement.cloneNode(true);
      const notionIcons = clonedTimeElement.querySelectorAll('.notion-save-icon');
      notionIcons.forEach(icon => icon.remove());
      
      content.timestamp = clonedTimeElement.textContent?.trim() || 
                         timeElement.getAttribute('datetime') || 
                         timeElement.getAttribute('title') || '';
      console.log('Extracted tweet timestamp:', content.timestamp);
    }
    
    // 4. 画像抽出（つぶやき専用）
    const images = tweetElement.querySelectorAll('img');
    console.log(`=== TWEET IMAGE EXTRACTION ===`);
    console.log(`Found ${images.length} total img elements`);
    
    for (const img of images) {
      console.log(`Checking image: ${img.src}`);
      console.log(`- alt: "${img.alt}"`);
      console.log(`- width: ${img.width}, height: ${img.height}`);
      console.log(`- naturalWidth: ${img.naturalWidth}, naturalHeight: ${img.naturalHeight}`);
      console.log(`- closest notion-save-icon: ${!!img.closest('.notion-save-icon')}`);
      
      // Notionアイコンや装飾画像を除外
      if (img.closest('.notion-save-icon') || 
          img.src.includes('notion') ||
          img.alt?.includes('icon') ||
          img.width < 50 || img.height < 50) {
        console.log(`- EXCLUDED (reason: ${img.closest('.notion-save-icon') ? 'notion-icon' : img.src.includes('notion') ? 'notion-url' : img.alt?.includes('icon') ? 'icon-alt' : 'too-small'})`);
        continue;
      }
      
      const imageData = {
        url: img.src,
        src: img.src,  // Background Scriptとの互換性のため
        alt: img.alt || '',
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height
      };
      
      console.log(`- INCLUDED:`, imageData);
      content.images.push(imageData);
    }
    console.log(`=== EXTRACTED ${content.images.length} TWEET IMAGES ===`);
    
    // 5. リンク抽出
    const links = tweetElement.querySelectorAll('a');
    for (const link of links) {
      // Notionアイコンやナビゲーションリンクを除外
      if (link.closest('.notion-save-icon') ||
          link.href.includes('javascript:') ||
          link.href === window.location.href) {
        continue;
      }
      
      const linkData = {
        url: link.href,
        text: link.textContent?.trim() || '',
        title: link.title || ''
      };
      
      content.links.push(linkData);
    }
    console.log(`Extracted ${content.links.length} tweet links`);
    
    // 6. URL生成（つぶやき専用）
    content.url = await extractPostUrl(tweetElement);
    console.log('Generated tweet URL:', content.url);
    
    // 7. コンテンツ検証
    if (!content.text || content.text.length < 3) {
      throw new Error('つぶやきテキストが短すぎるか空です');
    }
    
    if (content.text.includes('Notionに保存') && content.text.length < 20) {
      throw new Error('Notionアイコンのテキストのみが検出されました');
    }
    
    console.log('Tweet content extraction completed successfully');
    return content;
    
  } catch (error) {
    console.error('Tweet content extraction failed:', error);
    throw error;
  }
}

// つぶやき投稿専用のユニークID生成
function getTweetUniqueId(tweetElement) {
  console.log('=== GENERATING TWEET UNIQUE ID ===');
  
  // 1. data-id属性があればそれを使用
  const dataId = tweetElement.getAttribute('data-id') || 
                 tweetElement.getAttribute('data-post-id');
  if (dataId) {
    const tweetId = `tweet-data:${dataId}`;
    console.log('Generated tweet ID from data attribute:', tweetId);
    return tweetId;
  }
  
  // 2. つぶやきテキストから安定したIDを生成
  const textElement = tweetElement.querySelector('.post_text');
  if (textElement) {
    let tweetText = textElement.textContent || '';
    
    // Notionアイコンのテキストを除去
    tweetText = tweetText
      .replace(/Notionに保存/g, '')
      .replace(/保存中\.*/g, '')
      .replace(/保存完了!?/g, '')
      .replace(/保存済み/g, '')
      .replace(/保存エラー/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (tweetText.length >= 5) {
      // 作者名も含めてより一意性を高める
      const authorElement = tweetElement.querySelector('.post_user_name');
      const authorName = authorElement ? authorElement.textContent?.trim() : '';
      
             // 時刻情報も含める（相対時刻の場合は除く）
       const timeElement = tweetElement.querySelector('time');
       let timeInfo = '';
       if (timeElement) {
         // time要素をクローンしてNotionアイコンを除去
         const clonedTimeElement = timeElement.cloneNode(true);
         const notionIcons = clonedTimeElement.querySelectorAll('.notion-save-icon');
         notionIcons.forEach(icon => icon.remove());
         
         const timeText = clonedTimeElement.textContent?.trim();
         // 絶対時刻のみ使用（「2分」「1時間」などの相対時刻は除外）
         if (timeText && !timeText.match(/^\d+[分時秒日週月年]/)) {
           timeInfo = timeText;
         }
       }
      
      // ハッシュ生成用の文字列を作成
      const hashSource = `${tweetText.substring(0, 100)}|${authorName}|${timeInfo}`;
      
      try {
        // UTF-8エンコードしてBase64化
        const utf8Bytes = new TextEncoder().encode(hashSource);
        const binaryString = String.fromCharCode(...utf8Bytes);
        const base64Hash = btoa(binaryString).substring(0, 16);
        
        const tweetId = `tweet-content:${base64Hash}`;
        console.log('Generated tweet ID from content:', tweetId);
        return tweetId;
        
      } catch (error) {
        console.warn('Failed to encode tweet content, using simple hash');
        
        // フォールバック：シンプルハッシュ
        let simpleHash = 0;
        for (let i = 0; i < Math.min(hashSource.length, 50); i++) {
          const char = hashSource.charCodeAt(i);
          simpleHash = ((simpleHash << 5) - simpleHash) + char;
          simpleHash = simpleHash & simpleHash;
        }
        
        const tweetId = `tweet-simple:${Math.abs(simpleHash).toString(36)}`;
        console.log('Generated tweet ID from simple hash:', tweetId);
        return tweetId;
      }
    }
  }
  
  // 3. フォールバック：要素の位置と特徴
  const rect = tweetElement.getBoundingClientRect();
  const className = tweetElement.className || '';
  const childCount = tweetElement.childElementCount;
  
  const fallbackId = `tweet-fallback:${Math.round(rect.top)}-${Math.round(rect.left)}-${className.substring(0, 8)}-${childCount}`;
  console.log('Generated tweet fallback ID:', fallbackId);
  return fallbackId;
}

// つぶやき投稿専用の保存処理
async function handleTweetSave(tweetElement, iconElement) {
  try {
    console.log('=== STARTING TWEET-SPECIFIC SAVE PROCESS ===');
    
    // つぶやき投稿の検証
    if (!isTweetPost(tweetElement)) {
      throw new Error('つぶやき投稿ではありません');
    }
    
    // 重複チェック（つぶやき専用）
    const tweetId = getTweetUniqueId(tweetElement);
    console.log('Generated tweet ID:', tweetId);
    
    if (savedPosts.has(tweetId)) {
      console.log('Tweet already saved, skipping:', tweetId);
      showAlreadySavedIcon(iconElement);
      return;
    }
    
    // 保存処理中チェック
    if (iconElement.dataset.saving === 'true') {
      console.log('Tweet is currently being saved, skipping');
      return;
    }
    
    // 保存処理開始
    iconElement.dataset.saving = 'true';
    showSavingIcon(iconElement);
    
    // つぶやき専用コンテンツ抽出
    console.log('=== EXTRACTING TWEET CONTENT ===');
    const tweetContent = await extractTweetContent(tweetElement);
    console.log('Extracted tweet content:', tweetContent);
    
    // コンテンツ検証
    if (!tweetContent.text || tweetContent.text.length < 3) {
      throw new Error('つぶやきテキストが短すぎます');
    }
    
    // 保存先データベース取得
    const settings = await chrome.storage.sync.get(['notionDatabaseId']);
    const databaseId = settings.notionDatabaseId;
    
    // データベースIDの診断情報を表示
    console.log('=== TWEET SAVE DATABASE ID DIAGNOSTIC ===');
    console.log('Retrieved database ID:', databaseId);
    console.log('Database ID type:', typeof databaseId);
    console.log('Database ID length:', databaseId ? databaseId.length : 'undefined');
    console.log('Database ID format valid:', databaseId ? /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(databaseId) : false);
    console.log('Full storage settings:', settings);
    console.log('============================================');
    
    if (!databaseId) {
      throw new Error('保存先データベースが選択されていません');
    }
    
    // Notion保存実行
    console.log('=== SAVING TWEET TO NOTION ===');
    console.log('Content being sent to background:', {
      hasText: !!tweetContent.text,
      textLength: tweetContent.text?.length || 0,
      hasImages: !!tweetContent.images && tweetContent.images.length > 0,
      imageCount: tweetContent.images?.length || 0,
      imageDetails: tweetContent.images?.map((img, i) => ({
        index: i,
        url: img.url?.substring(0, 50) + '...',
        alt: img.alt,
        width: img.width,
        height: img.height
      })) || [],
      hasStructuredContent: !!tweetContent.structuredContent && tweetContent.structuredContent.length > 0,
      structuredContentCount: tweetContent.structuredContent?.length || 0
    });
    
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'saveToNotion',
        databaseId: databaseId,
        content: tweetContent
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    console.log('Tweet save response:', response);
    
    if (response && response.success) {
      // 保存成功
      savedPosts.add(tweetId);
      console.log('Tweet saved successfully:', tweetId);
      
      // 画像保存失敗の詳細ログ（構造を確認）
      console.log('=== IMAGE SAVE RESULT ANALYSIS ===');
      console.log('response.imageFailures:', response.imageFailures);
      console.log('Type of imageFailures:', typeof response.imageFailures);
      
      if (response.imageFailures) {
        // imageFailuresがオブジェクト形式の場合
        if (typeof response.imageFailures === 'object' && !Array.isArray(response.imageFailures)) {
          console.error('=== IMAGE SAVE FAILURES (Object Format) ===');
          console.error('Detected images:', response.imageFailures.detected);
          console.error('Successful images:', response.imageFailures.successful);
          console.error('Failed images:', response.imageFailures.failed);
          console.error('Failure details:', response.imageFailures.details);
          
          if (response.imageFailures.details && response.imageFailures.details.length > 0) {
            response.imageFailures.details.forEach((failure, index) => {
              console.error(`Image ${index + 1} failure:`, failure);
            });
            showImageFailureCallout(response.imageFailures.details);
          }
          
          console.error('=== END IMAGE FAILURES ===');
        }
        // imageFailuresが配列形式の場合
        else if (Array.isArray(response.imageFailures) && response.imageFailures.length > 0) {
          console.error('=== IMAGE SAVE FAILURES (Array Format) ===');
          console.error('Number of failed images:', response.imageFailures.length);
          response.imageFailures.forEach((failure, index) => {
            console.error(`Image ${index + 1} failure:`, failure);
          });
          console.error('=== END IMAGE FAILURES ===');
          showImageFailureCallout(response.imageFailures);
        }
        else {
          console.log('imageFailures exists but is empty or invalid format');
        }
      } else {
        console.log('All images saved successfully (if any)');
      }
      
      showSuccessIcon(iconElement);
      
    } else {
      // ユーザーフレンドリーなエラーメッセージに変換
      let userFriendlyError = '保存に失敗しました';
      const originalError = response?.error || '';
      
      if (originalError.includes('テキストが長すぎます')) {
        userFriendlyError = 'テキストが長すぎます';
      } else if (originalError.includes('データベースのプロパティ設定')) {
        userFriendlyError = 'データベース設定に問題があります';
      } else if (originalError.includes('画像の保存に失敗')) {
        userFriendlyError = '画像の保存に失敗しました';
      } else if (originalError.includes('通信エラー')) {
        userFriendlyError = 'ネットワークエラーが発生しました';
      }
      
      throw new Error(userFriendlyError);
    }
    
  } catch (error) {
    console.error('Tweet save failed:', error);
    showErrorIcon(iconElement, error.message);
  } finally {
    // 保存処理中フラグをクリア
    iconElement.dataset.saving = 'false';
  }
}

// アイコン状態管理関数
function showSavingIcon(iconElement) {
  iconElement.style.background = '#ffc107';
  iconElement.style.color = 'white';
  iconElement.innerHTML = `
    <div style="width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite;"></div>
    <span>保存中...</span>
  `;
}

function showSuccessIcon(iconElement) {
  iconElement.style.background = '#28a745';
  iconElement.style.color = 'white';
  iconElement.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="white" d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
    </svg>
    <span>保存完了!</span>
  `;
  
  // 3秒後に元に戻す
  setTimeout(() => resetIcon(iconElement), 3000);
}

function showErrorIcon(iconElement, errorMessage) {
  iconElement.style.background = '#dc3545';
  iconElement.style.color = 'white';
  iconElement.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="white" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
    </svg>
    <span>保存失敗</span>
  `;
  
  // エラーの詳細はコンソールのみに出力（ユーザーには表示しない）
  console.error('Save error details:', errorMessage);
  
  // 5秒後に元に戻す
  setTimeout(() => resetIcon(iconElement), 5000);
}

function showAlreadySavedIcon(iconElement) {
  iconElement.style.background = '#4CAF50';
  iconElement.style.color = 'white';
  iconElement.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="white" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/>
    </svg>
    <span>保存済み</span>
  `;
  
  // 2秒後に元に戻す
  setTimeout(() => resetIcon(iconElement), 2000);
}

function resetIcon(iconElement) {
  iconElement.style.background = 'rgba(255, 255, 255, 0.9)';
  iconElement.style.color = '#666';
  iconElement.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path fill="currentColor" d="M4,6H2V20A2,2 0 0,0 4,22H18V20H4V6M20,2H8A2,2 0 0,0 6,4V16A2,2 0 0,0 8,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M20,16H8V4H20V16M16,6H18V8H16V6M16,9H18V11H16V9M16,12H18V14H16V12M11,9H15V11H11V9M11,12H15V14H11V12M11,6H15V8H11V6Z"/>
    </svg>
    <span>Notionに保存</span>
  `;
}

// 長文投稿のブロック数最適化（文字数制限対応）
function optimizeStructuredContentForLongText(structuredContent, maxBlocks = 95) {
  console.log(`Optimizing structured content: ${structuredContent.length} blocks -> target: ${maxBlocks} blocks`);
  
  if (structuredContent.length <= maxBlocks) {
    console.log('Content is within block limit, no optimization needed');
    return structuredContent;
  }
  
  // 総文字数を計算
  const totalTextLength = structuredContent
    .filter(item => item.type === 'rich_text')
    .reduce((total, item) => total + (item.content?.length || 0), 0);
  
  console.log(`Total text length: ${totalTextLength} characters`);
  
  // 文字数制限を超える場合の特別処理
  if (totalTextLength > 2000) {
    console.log('Text exceeds 2000 character limit - applying aggressive optimization');
    return optimizeForCharacterLimit(structuredContent, 2000);
  }
  
  // Step 1: 空白行を除去
  const withoutEmptyLines = structuredContent.filter(item => item.type !== 'empty_line');
  console.log(`After removing empty lines: ${withoutEmptyLines.length} blocks (removed ${structuredContent.length - withoutEmptyLines.length} empty lines)`);
  
  if (withoutEmptyLines.length <= maxBlocks) {
    console.log('Content fits after removing empty lines');
    return withoutEmptyLines;
  }
  
  // Step 2: 連続する改行を統合
  const withReducedLinebreaks = [];
  let consecutiveLinebreaks = 0;
  
  for (const item of withoutEmptyLines) {
    if (item.type === 'linebreak') {
      consecutiveLinebreaks++;
      if (consecutiveLinebreaks === 1) {
        withReducedLinebreaks.push(item);
      }
      // 2つ目以降の連続する改行は無視
    } else {
      consecutiveLinebreaks = 0;
      withReducedLinebreaks.push(item);
    }
  }
  
  console.log(`After reducing linebreaks: ${withReducedLinebreaks.length} blocks (removed ${withoutEmptyLines.length - withReducedLinebreaks.length} extra linebreaks)`);
  
  if (withReducedLinebreaks.length <= maxBlocks) {
    console.log('Content fits after reducing linebreaks');
    return withReducedLinebreaks;
  }
  
  // Step 3: テキストブロックを段落単位で統合
  const optimizedContent = [];
  let currentParagraph = [];
  let blockCount = 0;
  const maxRichTextPerParagraph = 90; // 段落あたりのrich_text要素制限
  
  for (let i = 0; i < withReducedLinebreaks.length; i++) {
    const item = withReducedLinebreaks[i];
    
    // 画像は常に独立したブロックとして保持
    if (item.type === 'image') {
      // 現在の段落があれば先にコミット
      if (currentParagraph.length > 0) {
        optimizedContent.push(createCombinedTextBlock(currentParagraph));
        currentParagraph = [];
        blockCount++;
      }
      
      optimizedContent.push(item);
      blockCount++;
      continue;
    }
    
    // テキストと改行は段落として蓄積
    if (item.type === 'rich_text' || item.type === 'linebreak') {
      currentParagraph.push(item);
      
      // 段落内のrich_text要素数が制限に近づいたら段落をコミット
      const richTextCount = currentParagraph.filter(p => p.type === 'rich_text').length;
      if (richTextCount >= maxRichTextPerParagraph) {
        optimizedContent.push(createCombinedTextBlock(currentParagraph));
        currentParagraph = [];
        blockCount++;
      }
      
      // ブロック制限に近づいたら、現在の段落をコミット
      if (blockCount >= maxBlocks - 10) { // 安全マージン
        if (currentParagraph.length > 0) {
          optimizedContent.push(createCombinedTextBlock(currentParagraph));
          currentParagraph = [];
          blockCount++;
        }
        
        // 制限に達したら残りを省略メッセージに置き換え
        if (blockCount >= maxBlocks - 1) {
          const remainingItems = withReducedLinebreaks.length - i - 1;
          if (remainingItems > 0) {
            const truncationBlock = {
              type: 'callout',
              content: `[長文のため省略] 残り${remainingItems}個のコンテンツブロックが省略されました。完全な内容は元の投稿をご確認ください。`,
              emoji: '📄',
              color: 'gray'
            };
            optimizedContent.push(truncationBlock);
          }
          break;
        }
      }
    }
  }
  
  // 最後の段落をコミット
  if (currentParagraph.length > 0 && blockCount < maxBlocks) {
    optimizedContent.push(createCombinedTextBlock(currentParagraph));
  }
  
  console.log(`Final optimization result: ${optimizedContent.length} blocks (reduced from ${structuredContent.length})`);
  return optimizedContent;
}

// 文字数制限に対応した最適化処理
function optimizeForCharacterLimit(structuredContent, maxCharacters = 2000) {
  console.log(`Optimizing for character limit: ${maxCharacters} characters`);
  
  const optimizedContent = [];
  let currentCharCount = 0;
  let currentParagraph = [];
  let currentParagraphCharCount = 0;
  const maxParagraphLength = 800; // 1段落あたりの文字数制限
  
  for (let i = 0; i < structuredContent.length; i++) {
    const item = structuredContent[i];
    
    // 画像は文字数にカウントしない
    if (item.type === 'image') {
      // 現在の段落があれば先にコミット
      if (currentParagraph.length > 0) {
        optimizedContent.push(createCombinedTextBlock(currentParagraph));
        currentParagraph = [];
        currentParagraphCharCount = 0;
      }
      
      optimizedContent.push(item);
      continue;
    }
    
    // 空白行と改行は文字数にカウントしない
    if (item.type === 'empty_line' || item.type === 'linebreak') {
      currentParagraph.push(item);
      continue;
    }
    
    // テキストの場合
    if (item.type === 'rich_text') {
      const itemLength = item.content?.length || 0;
      
      // 文字数制限を超える場合
      if (currentCharCount + itemLength > maxCharacters) {
        console.log(`Character limit reached at item ${i}. Current: ${currentCharCount}, Item: ${itemLength}`);
        
        // 現在の段落をコミット
        if (currentParagraph.length > 0) {
          optimizedContent.push(createCombinedTextBlock(currentParagraph));
        }
        
        // 省略メッセージを追加
        const remainingItems = structuredContent.length - i;
        const truncationBlock = {
          type: 'paragraph',
          rich_text: [{
            type: 'text',
            text: { content: `\n[長文のため省略] 残り約${remainingItems}個のコンテンツが省略されました。完全な内容は元の投稿をご確認ください。` },
            annotations: { italic: true, color: 'gray' }
          }]
        };
        optimizedContent.push(truncationBlock);
        break;
      }
      
      // 段落の文字数制限チェック
      if (currentParagraphCharCount + itemLength > maxParagraphLength) {
        // 現在の段落をコミット
        if (currentParagraph.length > 0) {
          optimizedContent.push(createCombinedTextBlock(currentParagraph));
          currentParagraph = [];
          currentParagraphCharCount = 0;
        }
      }
      
      // アイテムを段落に追加
      currentParagraph.push(item);
      currentCharCount += itemLength;
      currentParagraphCharCount += itemLength;
    }
  }
  
  // 最後の段落をコミット
  if (currentParagraph.length > 0) {
    optimizedContent.push(createCombinedTextBlock(currentParagraph));
  }
  
  console.log(`Character limit optimization complete: ${optimizedContent.length} blocks, ~${currentCharCount} characters`);
  return optimizedContent;
}

// 複数のテキスト要素を1つのブロックに統合（Notion制限対応）
function createCombinedTextBlock(textItems) {
  const richTextParts = [];
  const maxRichTextElements = 90; // Notionの制限は100だが安全マージン
  let currentTextContent = '';
  let currentAnnotations = {};
  let currentLink = null;
  
  // 連続する同じ装飾のテキストを結合
  for (const item of textItems) {
    if (item.type === 'rich_text') {
      const sameAnnotations = JSON.stringify(item.annotations || {}) === JSON.stringify(currentAnnotations);
      const sameLink = JSON.stringify(item.link || null) === JSON.stringify(currentLink);
      
      if (sameAnnotations && sameLink && currentTextContent) {
        // 同じ装飾・リンクの場合は結合
        currentTextContent += item.content;
      } else {
        // 異なる装飾・リンクの場合は前の要素を追加して新しい要素を開始
        if (currentTextContent) {
          if (richTextParts.length < maxRichTextElements) {
            richTextParts.push({
              type: 'text',
              text: {
                content: currentTextContent,
                link: currentLink
              },
              annotations: currentAnnotations
            });
          } else {
            // 制限に達した場合、最後の要素に追加
            if (richTextParts.length > 0) {
              const lastPart = richTextParts[richTextParts.length - 1];
              lastPart.text.content += ' ' + currentTextContent;
            }
          }
        }
        
        currentTextContent = item.content;
        currentAnnotations = item.annotations || {};
        currentLink = item.link || null;
      }
    } else if (item.type === 'linebreak') {
      // 改行を現在のテキストに追加
      currentTextContent += '\n';
    }
  }
  
  // 最後の要素を追加
  if (currentTextContent) {
    if (richTextParts.length < maxRichTextElements) {
      richTextParts.push({
        type: 'text',
        text: {
          content: currentTextContent,
          link: currentLink
        },
        annotations: currentAnnotations
      });
    } else if (richTextParts.length > 0) {
      // 制限に達した場合、最後の要素に追加
      const lastPart = richTextParts[richTextParts.length - 1];
      lastPart.text.content += ' ' + currentTextContent;
    }
  }
  
  // rich_text配列が空の場合は空の段落を作成
  if (richTextParts.length === 0) {
    richTextParts.push({
      type: 'text',
      text: { content: ' ' },
      annotations: {}
    });
  }
  
  console.log(`Created optimized text block with ${richTextParts.length} rich_text elements (consolidated from ${textItems.filter(i => i.type === 'rich_text').length} original elements)`);
  
  return {
    type: 'paragraph',
    rich_text: richTextParts
  };
}

// ... existing code ...