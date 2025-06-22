// LibeCity to Notion - Content Script
// libecity.com専用のコンテンツ抽出機能

console.log('LibeCity to Notion Content Script loaded');

// libecity.com専用のセレクタ定義
const SELECTORS = {
  // 投稿関連
  postContainer: '.log_detail',
  postText: '.post_text',
  postTime: '.post_time, .time',
  postAuthor: '.user_name, .author',
  postAvatar: '.user_proficon img, .avatar img',
  
  // 画像関連（libecity.com固有のセレクタを追加）
  postImages: 'img.fr-fic.fr-dib.popup, .post_image img, .attachment img, img[src*="libecity"], img[src*="firebasestorage"], .fr-img, .fr-fic.fr-dib, img.popup',
  
  // リンク関連
  postLinks: '.post_text a, .link_preview',
  
  // メンション関連
  mentions: '.mention, [data-user-id]',
  
  // その他
  reactions: '.reaction, .like_count',
  replies: '.reply, .comment'
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

// セレクタの検証
function validateSelectors() {
  console.log('Validating selectors...');
  Object.entries(SELECTORS).forEach(([key, selector]) => {
    if (!isValidSelector(selector)) {
      console.warn(`Invalid selector for ${key}: ${selector}`);
    }
  });
}

// 状態管理
let isSelectionMode = false;
let selectedElement = null;
let highlightOverlay = null;

// 初期化
function initialize() {
  console.log('Initializing LibeCity content script...');
  
  // ページの読み込み完了を待つ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupContentScript);
  } else {
    setupContentScript();
  }
}

// コンテンツスクリプトのセットアップ
function setupContentScript() {
  console.log('Setting up content script for libecity.com');
  
  // セレクタの検証
  validateSelectors();
  
  // DOM変更の監視を開始
  setupDOMObserver();
  
  // メッセージリスナーの設定
  setupMessageListeners();
  
  // ページ情報の初期取得
  detectPageType();
}

// DOM変更の監視
function setupDOMObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        // 新しい投稿が追加された場合の処理
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            try {
              const posts = node.querySelectorAll(SELECTORS.postContainer);
              if (posts.length > 0) {
                console.log(`New posts detected: ${posts.length}`);
              }
            } catch (error) {
              console.error('Failed to query posts in new nodes:', error);
            }
          }
        });
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// メッセージリスナーの設定
function setupMessageListeners() {
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
        sendResponse({ status: 'active' });
        break;
        
      default:
        console.warn('Unknown action:', request.action);
        sendResponse({ error: 'Unknown action' });
    }
  });
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

// 要素からのコンテンツ抽出
async function extractElementContent(element) {
  const content = {
    type: 'post',
    timestamp: new Date().toISOString(),
    url: window.location.href,
    title: document.title,
    content: {},
    metadata: {}
  };
  
  // 投稿テキストと構造の抽出
  try {
    let textElement = null;
    const textSelectors = [SELECTORS.postText, '.post_text', '.message_text', '.content_text'];
    
    for (const selector of textSelectors) {
      try {
        textElement = element.querySelector(selector);
        if (textElement) break;
      } catch (error) {
        console.warn(`Text selector failed: ${selector}`, error);
      }
    }
    
    textElement = textElement || element;
    
    if (textElement) {
      const extractedText = textElement.innerText || textElement.textContent || '';
      const extractedHtml = textElement.innerHTML || '';
      
      content.content.text = cleanText(extractedText);
      content.content.html = extractedHtml;
      
      // HTML構造を解析してコンテンツの順序を抽出
      content.content.structuredContent = extractStructuredContent(textElement);
      
      console.log('Extracted text:', content.content.text.substring(0, 100) + '...');
      console.log('Structured content blocks:', content.content.structuredContent?.length || 0);
    }
  } catch (error) {
    console.error('Failed to extract text:', error);
    const fallbackText = element.innerText || element.textContent || '';
    content.content.text = cleanText(fallbackText);
    console.log('Fallback text:', content.content.text.substring(0, 100) + '...');
  }
  
  // 作者情報の抽出
  try {
    const authorElement = element.querySelector(SELECTORS.postAuthor);
    if (authorElement) {
      content.metadata.author = cleanText(authorElement.textContent);
    }
  } catch (error) {
    console.error('Failed to extract author:', error);
  }
  
  // 投稿時間の抽出
  try {
    const timeElement = element.querySelector(SELECTORS.postTime);
    if (timeElement) {
      content.metadata.postTime = extractTime(timeElement);
    }
  } catch (error) {
    console.error('Failed to extract time:', error);
  }
  
  // 画像の抽出
  try {
    const images = element.querySelectorAll(SELECTORS.postImages);
    if (images.length > 0) {
      content.content.images = Array.from(images).map(img => ({
        src: img.src,
        alt: img.alt || '',
        title: img.title || ''
      }));
    }
  } catch (error) {
    console.error('Failed to extract images:', error);
  }
  
  // リンクの抽出
  try {
    const links = element.querySelectorAll(SELECTORS.postLinks);
    if (links.length > 0) {
      content.content.links = Array.from(links).map(link => ({
        url: link.href,
        text: cleanText(link.textContent),
        title: link.title || ''
      }));
    }
  } catch (error) {
    console.error('Failed to extract links:', error);
  }
  
  // メンションの抽出
  try {
    const mentions = element.querySelectorAll(SELECTORS.mentions);
    if (mentions.length > 0) {
      content.content.mentions = Array.from(mentions).map(mention => ({
        text: cleanText(mention.textContent),
        userId: mention.dataset.userId || null
      }));
    }
  } catch (error) {
    console.error('Failed to extract mentions:', error);
  }
  
  return content;
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
  const timeText = timeElement.textContent || timeElement.innerText;
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
  const structuredContent = [];
  
  try {
    // より簡潔なアプローチ: 直接子要素を順番に処理
    const processNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          return {
            type: 'text',
            content: text
          };
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        if (tagName === 'img') {
          return {
            type: 'image',
            src: node.src,
            alt: node.alt && node.alt.trim() ? node.alt.trim() : null,
            title: node.title && node.title.trim() ? node.title.trim() : null
          };
        } else if (tagName === 'br') {
          return {
            type: 'linebreak'
          };
        } else if (['p', 'div', 'span'].includes(tagName)) {
          // 段落要素の場合、子要素を再帰的に処理
          const childResults = [];
          for (const child of node.childNodes) {
            const result = processNode(child);
            if (result) {
              if (Array.isArray(result)) {
                childResults.push(...result);
              } else {
                childResults.push(result);
              }
            }
          }
          
          if (childResults.length > 0) {
            if (tagName === 'p' || tagName === 'div') {
              return [...childResults, { type: 'paragraph_break' }];
            } else {
              return childResults;
            }
          }
        }
      }
      return null;
    };
    
    // 要素の子ノードを順番に処理
    for (const child of element.childNodes) {
      const result = processNode(child);
      if (result) {
        if (Array.isArray(result)) {
          structuredContent.push(...result);
        } else {
          structuredContent.push(result);
        }
      }
    }
    
    
    console.log('Extracted structured content:', structuredContent);
    return structuredContent;
    
  } catch (error) {
    console.error('Failed to extract structured content:', error);
    return [];
  }
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

// 初期化の実行
initialize(); 