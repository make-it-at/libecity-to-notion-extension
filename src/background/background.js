// LibeCity to Notion - Background Script (Service Worker)

console.log('LibeCity to Notion Background Script loaded');

// Service Worker自体のエラーハンドリング
self.addEventListener('error', (event) => {
  console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

// Notion API設定
const NOTION_API = {
  BASE_URL: 'https://api.notion.com/v1',
  VERSION: '2022-06-28'
};

// デフォルトデータベーススキーマ
const DEFAULT_DATABASE_SCHEMA = {
  Title: {
    type: 'title',
    title: {}
  },
  URL: {
    type: 'url',
    url: {}
  },
  Author: {
    type: 'rich_text',
    rich_text: {}
  },
  Date: {
    type: 'date',
    date: {}
  },
  Tags: {
    type: 'multi_select',
    multi_select: {
      options: [
        { name: 'LibeCity', color: 'blue' },
        { name: '投稿', color: 'green' },
        { name: '重要', color: 'red' }
      ]
    }
  },
  Status: {
    type: 'select',
    select: {
      options: [
        { name: '未読', color: 'gray' },
        { name: '確認済み', color: 'green' },
        { name: '対応中', color: 'yellow' },
        { name: '完了', color: 'blue' }
      ]
    }
  }
};

// 統計情報
let stats = {
  totalSaved: 0,
  lastSaved: null,
  errors: 0
};

// 初期化
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details);
  
  if (details.reason === 'install') {
    // 初回インストール時の処理
    initializeExtension().catch(error => {
      console.error('Failed to initialize extension:', error);
      logError('initialization', error);
    });
  } else if (details.reason === 'update') {
    // アップデート時の処理
    handleUpdate(details.previousVersion).catch(error => {
      console.error('Failed to handle update:', error);
      logError('update', error);
    });
  }
});

// 拡張機能の初期化
async function initializeExtension() {
  try {
    // デフォルト設定の作成
    const defaultSettings = {
      apiKey: '',
      autoSave: false,
      defaultDatabase: '',
      saveImages: true,
      saveLinks: true,
      notifications: true
    };
    
    await chrome.storage.sync.set({ settings: defaultSettings });
    
    // 統計情報の初期化
    await chrome.storage.local.set({ stats: stats });
    
    console.log('Extension initialized with default settings');
  } catch (error) {
    console.error('Failed to initialize extension:', error);
  }
}

// アップデート処理
async function handleUpdate(previousVersion) {
  console.log(`Extension updated from ${previousVersion} to ${chrome.runtime.getManifest().version}`);
  
  // バージョン固有のマイグレーション処理があればここに追加
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  // 非同期処理のため、trueを返す
  handleMessage(request, sender).then(sendResponse).catch(error => {
    console.error('Message handling failed:', error);
    sendResponse({ success: false, error: error.message });
  });
  
  return true; // 非同期レスポンスを示す
});

// メッセージ処理のメイン関数
async function handleMessage(request, sender) {
  switch (request.action) {
    case 'ping':
      return { status: 'active', timestamp: Date.now() };
      
    case 'testConnection':
      return await testNotionConnection();
      
    case 'getDatabases':
      return await getDatabases();
      
    case 'createDefaultDatabase':
      return await createDefaultDatabase(request.pageTitle);
      
    case 'saveToNotion':
      return await saveToNotion(request.databaseId, request.content);
      
    case 'getStats':
      return await getStats();
      
    case 'elementSelected':
      // Content scriptからの要素選択通知を処理
      console.log('Element selected:', request.element);
      return { success: true };
      
    case 'openNotionAuth':
      return await openNotionAuthPage();
      
    case 'createWorkspace':
      return await createNotionWorkspace(request.workspaceName);
      
    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}

// Notion API接続テスト
async function testNotionConnection() {
  try {
    const settings = await getSettings();
    
    if (!settings.apiKey) {
      return { success: false, error: 'APIキーが設定されていません' };
    }
    
    const response = await makeNotionRequest('/users/me', 'GET');
    
    if (response.ok) {
      return { success: true, user: await response.json() };
    } else {
      const error = await response.json();
      return { success: false, error: error.message || 'API接続に失敗しました' };
    }
  } catch (error) {
    console.error('Connection test failed:', error);
    return { success: false, error: error.message };
  }
}

// データベース一覧の取得
async function getDatabases() {
  try {
    const settings = await getSettings();
    
    if (!settings.apiKey) {
      return { success: false, error: 'APIキーが設定されていません' };
    }
    
    const response = await makeNotionRequest('/search', 'POST', {
      filter: {
        value: 'database',
        property: 'object'
      },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const databases = data.results.map(db => ({
        id: db.id,
        title: getPlainText(db.title),
        url: db.url,
        lastEdited: db.last_edited_time
      }));
      
      return { success: true, databases };
    } else {
      const error = await response.json();
      return { success: false, error: error.message || 'データベースの取得に失敗しました' };
    }
  } catch (error) {
    console.error('Failed to get databases:', error);
    return { success: false, error: error.message };
  }
}

// デフォルトデータベースの作成
async function createDefaultDatabase(pageTitle = 'LibeCity Chat Archive') {
  try {
    // 親ページの取得または作成
    const parentResult = await createParentPage(pageTitle);
    
    if (!parentResult.success) {
      return parentResult;
    }
    
    // タイムスタンプを追加して重複を避ける
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const databaseTitle = `${pageTitle} (${timestamp})`;
    
    const databaseData = {
      parent: {
        type: 'page_id',
        page_id: parentResult.pageId
      },
      title: [
        {
          type: 'text',
          text: {
            content: databaseTitle
          }
        }
      ],
      properties: DEFAULT_DATABASE_SCHEMA
    };
    
    const response = await makeNotionRequest('/databases', 'POST', databaseData);
    
    if (response.ok) {
      const database = await response.json();
      
      // 統計情報を更新
      await updateStats({ databasesCreated: 1 });
      
      return {
        success: true,
        databaseId: database.id,
        databaseUrl: database.url
      };
    } else {
      const error = await response.json();
      await updateStats({ errors: 1 });
      return { success: false, error: error.message || 'データベースの作成に失敗しました' };
    }
  } catch (error) {
    console.error('Failed to create database:', error);
    await updateStats({ errors: 1 });
    return { success: false, error: error.message };
  }
}

// 親ページの作成
async function createParentPage(title) {
  try {
    // まず、利用可能なページを検索
    const searchResponse = await makeNotionRequest('/search', 'POST', {
      filter: {
        value: 'page',
        property: 'object'
      }
    });
    
    let parentPageId = null;
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      if (searchData.results.length > 0) {
        // 最初に見つかったページを親として使用
        parentPageId = searchData.results[0].id;
        return { success: true, pageId: parentPageId };
      }
    }
    
    // 親ページが見つからない場合は、データベースを直接作成
    // （Notion APIでは、ページなしでもデータベースを作成できる場合がある）
    return { success: false, error: '利用可能な親ページが見つかりません。Notionワークスペースにページを作成してから再試行してください。' };
    
  } catch (error) {
    console.error('Failed to create parent page:', error);
    return { success: false, error: error.message };
  }
}

// Notionへの保存
async function saveToNotion(databaseId, content) {
  try {
    console.log('=== saveToNotion started ===');
    
    // デバッグ用に簡略化したログを出力（巨大なJSONを避ける）
    console.log('Saving content to Notion. Content summary:', {
      hasText: !!content.text,
      textLength: content.text?.length || 0,
      hasImages: !!(content.images && content.images.length > 0),
      imageCount: content.images?.length || 0,
      hasAuthor: !!content.author,
      hasTimestamp: !!content.timestamp,
      hasUrl: !!content.url
    });
    
    console.log('Step 1: Processing title (chat room name)...');
    // タイトルはチャットルーム名を使用
    let title = 'libecity チャット';
    if (content.chatRoomName) {
      title = content.chatRoomName;
    } else if (content.title) {
      title = content.title;
    } else if (content.content?.title) {
      title = content.content.title;
    }
    console.log('Extracted chat room name for title:', title);
    
    console.log('Step 2: Processing text content...');
    let text = '';
    if (content.content?.text) {
      text = content.content.text;
    } else if (content.text) {
      text = content.text;
    } else if (content.content?.html) {
      // HTMLからテキストを抽出
      text = content.content.html.replace(/<[^>]*>/g, '').trim();
    }
    console.log('Extracted text length:', text.length);
    if (text.length > 0) {
      console.log('Extracted text preview:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
    }
    
    console.log('Step 3: Processing author and metadata...');
    const author = content.metadata?.author || content.author?.name || content.author || 'Unknown';
    const url = content.url || '';
    
    console.log('Step 4: Processing date with timezone consideration...');
    // 日時の処理を改善（時刻を含む、タイムゾーン考慮）
    let date = null;
    let dateTimeString = null;
    
    if (content.timestampISO) {
      // content.jsで処理済みのUTC時刻ISO形式がある場合
      date = content.timestampISO; // UTC時刻（タイムゾーンなし）
      dateTimeString = content.timestamp; // 表示用（日本時間）
      console.log('Using pre-processed UTC time for Notion API:', { 
        utcISO: date, 
        displayTime: dateTimeString, 
        timezone: content.timezone,
        note: 'UTC time without timezone specification (Notion auto-converts to user timezone)'
      });
    } else if (content.timestamp) {
      try {
        // "2025/06/23 07:00" 形式や "2025-06-22T18:32:00" 形式に対応
        let dateStr = content.timestamp;
        console.log('Original timestamp:', dateStr);
        
        // "2025/06/23 07:00" 形式を ISO 形式に変換（日本時間として扱う）
        if (dateStr.match(/^\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}$/)) {
          // YYYY/MM/DD HH:MM 形式を YYYY-MM-DDTHH:MM:00+09:00 に変換
          const parts = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
          if (parts) {
            const [, year, month, day, hour, minute] = parts;
            // 日本時間として明示的にタイムゾーンを指定
            dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+09:00`;
            dateTimeString = `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute}`;
          }
        }
        
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          date = parsedDate.toISOString();
          if (!dateTimeString) {
            // 元のタイムスタンプをそのまま表示用として使用
            dateTimeString = content.timestamp || 'Unknown time';
          }
        } else {
          console.warn('Invalid date format:', content.timestamp);
          date = new Date().toISOString();
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const hour = String(now.getHours()).padStart(2, '0');
          const minute = String(now.getMinutes()).padStart(2, '0');
          dateTimeString = `${year}/${month}/${day} ${hour}:${minute}`;
        }
      } catch (error) {
        console.error('Date parsing error:', error);
        date = new Date().toISOString();
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        dateTimeString = `${year}/${month}/${day} ${hour}:${minute}`;
      }
    } else if (content.metadata?.postTime?.timestamp) {
      date = content.metadata.postTime.timestamp;
      const metaDate = new Date(date);
      const year = metaDate.getFullYear();
      const month = String(metaDate.getMonth() + 1).padStart(2, '0');
      const day = String(metaDate.getDate()).padStart(2, '0');
      const hour = String(metaDate.getHours()).padStart(2, '0');
      const minute = String(metaDate.getMinutes()).padStart(2, '0');
      dateTimeString = `${year}/${month}/${day} ${hour}:${minute}`;
    } else {
      date = new Date().toISOString();
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      dateTimeString = `${year}/${month}/${day} ${hour}:${minute}`;
    }
    
    console.log('Final date processing result:', { 
      utcDate: date, 
      displayString: dateTimeString, 
      timezoneMode: 'utc_without_timezone_spec',
      originalContent: {
        timestamp: content.timestamp,
        timestampISO: content.timestampISO,
        timezone: content.timezone
      }
    });
    
    console.log('Processed data:', { title, textLength: text.length, author, url, date });
    
    console.log('Step 5: Creating page data structure...');
    const pageData = {
      parent: {
        database_id: databaseId
      },
      properties: {
        Title: {
          title: [
            {
              type: 'text',
              text: {
                content: title
              }
            }
          ]
        },
        URL: {
          url: url || null
        },
        Author: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: author
              }
            }
          ]
        },
        Chat: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: text.length > 2000 ? text.substring(0, 2000) + '...' : text
              }
            }
          ]
        },
        Date: {
          date: date ? {
            start: date
            // time_zone を指定しない（日本時間をそのまま使用）
          } : null
        },
        Tags: {
          multi_select: [
            { name: 'LibeCity' },
            { name: '投稿' }
          ]
        },
        Status: {
          select: {
            name: '未読'
          }
        }
      }
    };
    
    console.log('Step 6: Processing children blocks...');
    
    // Notionに送信される日時データをログ出力
    console.log('Date property that will be sent to Notion:', {
      start: date,
      time_zone: 'none (not specified)',
      expectedDisplay: dateTimeString,
      approach: 'UTC time without timezone - Notion auto-converts to user timezone'
    });
    // 子要素（構造化されたブロック生成）
    const children = [];
    
    // 構造化コンテンツがある場合はそれを優先使用
    const structuredContent = content.structuredContent || content.content?.structuredContent || [];
    
    if (structuredContent.length > 0) {
      console.log(`Step 6a: Processing ${structuredContent.length} structured content blocks`);
      
      // 連続するテキストとリンクを1つの段落に統合
      let currentParagraph = [];
      
      structuredContent.forEach((block, index) => {
        switch (block.type) {
          case 'text':
            // 旧形式のテキストを現在の段落に追加
            currentParagraph.push({
              type: 'text',
              text: { content: block.content }
            });
            break;
            
          case 'rich_text':
            // 新形式のrich_text（文字修飾付き）を現在の段落に追加
            const richTextItem = {
              type: 'text',
              text: { content: block.content }
            };
            
            // リンクがある場合は追加
            if (block.link && block.link.url) {
              richTextItem.text.link = { url: block.link.url };
            }
            
            // 文字修飾（annotations）がある場合は追加
            if (block.annotations && Object.keys(block.annotations).length > 0) {
              richTextItem.annotations = { ...block.annotations };
            }
            
            currentParagraph.push(richTextItem);
            break;
            
          case 'link':
            // 旧形式のリンクを現在の段落に追加（Notion API正式形式）
            currentParagraph.push({
              type: 'text',
              text: { 
                content: block.text || block.content,
                link: { url: block.url }
              },
              annotations: { 
                underline: true,
                color: 'blue'
              }
            });
            break;
            
          case 'image':
            // 画像の前に蓄積された段落を追加
            if (currentParagraph.length > 0) {
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: currentParagraph }
              });
              currentParagraph = [];
            }
            
            // 画像ブロックを追加
            if (isValidNotionImageUrl(block.src)) {
              children.push({
                object: 'block',
                type: 'image',
                image: {
                  type: 'external',
                  external: { url: block.src },
                  caption: block.alt ? [{
                    type: 'text',
                    text: { content: block.alt }
                  }] : []
                }
              });
            } else {
              console.warn('Invalid image URL skipped:', block.src);
            }
            break;
            
          case 'linebreak':
            // 改行の場合、現在の段落を完成させる
            if (currentParagraph.length > 0) {
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: currentParagraph }
              });
              currentParagraph = [];
            }
            break;
            
          case 'empty_line':
            // 空白行の場合、現在の段落を完成させてから空の段落を追加
            if (currentParagraph.length > 0) {
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: currentParagraph }
              });
              currentParagraph = [];
            }
            
            // 空白行を空の段落として追加
            children.push({
              object: 'block',
              type: 'paragraph',
              paragraph: { 
                rich_text: [
                  {
                    type: 'text',
                    text: { content: ' ' } // 完全に空ではなく、スペース1つを入れる
                  }
                ]
              }
            });
            break;
        }
        
        // 最後のブロックの場合、残った段落を追加
        if (index === structuredContent.length - 1 && currentParagraph.length > 0) {
          children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: currentParagraph }
          });
        }
        
        // 進捗ログ（50ブロックごと）
        if ((index + 1) % 50 === 0) {
          console.log(`Processed ${index + 1}/${structuredContent.length} structured blocks`);
        }
      });
      
      console.log(`Generated ${children.length} Notion blocks from structured content`);
      
    } else {
      console.log('Step 6b: No structured content found, processing text and images separately...');
      
      // テキストを行ごとに処理
      if (text && text.trim()) {
        console.log('Processing text content line by line...');
        console.log(`Original text length: ${text.length} characters`);
        
        // 改行で分割（\n, \r\n, <br>タグなど）、空白行も保持
        const lines = text
          .replace(/<br\s*\/?>/gi, '\n')  // <br>タグを改行に変換
          .replace(/\r\n/g, '\n')         // Windows改行を統一
          .replace(/\r/g, '\n')           // Mac改行を統一
          .split('\n')
          .map(line => line.trim()); // 空行は除外しない
        
        console.log(`Split text into ${lines.length} lines`);
        
        // 各行を個別の段落ブロックとして追加（空白行も含む）
        lines.forEach((line, index) => {
          if (line.length > 0) {
            // 行内にリンクが含まれているかチェック
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urlMatches = line.match(urlRegex);
            
            if (urlMatches) {
              // リンクを含む行の処理
              console.log(`Line ${index + 1} contains ${urlMatches.length} links`);
              
              const richText = [];
              let lastIndex = 0;
              
              // リンクを埋め込みテキストとして処理
              urlMatches.forEach(url => {
                const urlIndex = line.indexOf(url, lastIndex);
                
                // リンク前のテキスト
                if (urlIndex > lastIndex) {
                  const beforeText = line.substring(lastIndex, urlIndex);
                  if (beforeText.trim()) {
                    richText.push({
                      type: 'text',
                      text: { content: beforeText }
                    });
                  }
                }
                
                // リンク部分（埋め込み）- Notion API正式形式
                richText.push({
                  type: 'text',
                  text: { 
                    content: url,
                    link: { url: url }
                  },
                  annotations: { 
                    underline: true,
                    color: 'blue'
                  }
                });
                
                lastIndex = urlIndex + url.length;
              });
              
              // リンク後のテキスト
              if (lastIndex < line.length) {
                const afterText = line.substring(lastIndex);
                if (afterText.trim()) {
                  richText.push({
                    type: 'text',
                    text: { content: afterText }
                  });
                }
              }
              
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: richText }
              });
            } else {
              // 通常のテキスト行
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [
                    {
                      type: 'text',
                      text: { content: line }
                    }
                  ]
                }
              });
            }
            
            // 進捗ログ（100行ごと）
            if ((index + 1) % 100 === 0) {
              console.log(`Processed ${index + 1}/${lines.length} lines`);
            }
          } else {
            // 空白行の場合
            children.push({
              object: 'block',
              type: 'paragraph',
              paragraph: { 
                rich_text: [
                  {
                    type: 'text',
                    text: { content: ' ' } // 完全に空ではなく、スペース1つを入れる
                  }
                ]
              }
            });
          }
        });
        
        console.log(`Added ${lines.length} text blocks (one per line)`);
        console.log(`Total blocks so far: ${children.length}`);
      }
      
      // 画像の追加（構造化コンテンツがない場合のみ）
      const images = content.content?.images || content.images || [];
      if (images.length > 0) {
        console.log(`Processing ${images.length} images for Notion`);
        
        // 有効な画像のみを処理
        const validImages = images.filter(image => {
          if (!image.src) return false;
          const isValid = isValidNotionImageUrl(image.src);
          console.log(`Image validation: ${image.src.substring(0, 50)}... -> ${isValid}`);
          return isValid;
        });
        
        if (validImages.length > 0) {
          console.log(`Adding ${validImages.length} valid images to Notion page`);
          
          // 画像セクションのヘッダーを追加
          children.push({
            object: 'block',
            type: 'heading_3',
            heading_3: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: '📸 画像'
                  }
                }
              ]
            }
          });
          
          // 各画像を追加（最大3個まで）
          validImages.slice(0, 3).forEach((image, index) => {
            children.push({
              object: 'block',
              type: 'image',
              image: {
                type: 'external',
                external: {
                  url: image.src
                },
                caption: image.alt ? [
                  {
                    type: 'text',
                    text: {
                      content: image.alt
                    }
                  }
                ] : []
              }
            });
            
            console.log(`Added image ${index + 1}: ${image.src.substring(0, 50)}...`);
          });
          
          if (validImages.length > 3) {
            console.log(`Note: Only first 3 images added (${validImages.length} total found)`);
          }
        } else {
          console.log('No valid images found after filtering');
        }
      } else {
        console.log('No images found in content');
      }
    }
    
    console.log('Step 9: Finalizing page data...');
    console.log(`Total blocks generated: ${children.length}`);
    
    // 子要素が存在する場合のみ追加（制限を緩和）
    if (children.length > 0) {
      // Notion APIの制限: 1回のリクエストで最大100個のブロックまで
      const maxBlocksPerRequest = 100;
      
      if (children.length <= maxBlocksPerRequest) {
        // 制限内の場合はそのまま追加
        pageData.children = children;
        console.log(`Added ${pageData.children.length} children blocks`);
      } else {
        // 制限を超える場合は分割処理
        console.log(`Large content detected: ${children.length} blocks. Using batch processing.`);
        
        // 最初のバッチ（ページ作成時）
        pageData.children = children.slice(0, maxBlocksPerRequest);
        console.log(`Added initial ${pageData.children.length} children blocks (batch 1)`);
        
        // 残りのブロックは後で追加する予定をログに記録
        const remainingBlocks = children.length - maxBlocksPerRequest;
        console.log(`${remainingBlocks} blocks will be added in subsequent requests`);
      }
    } else {
      console.log('No children blocks to add');
    }
    
    // データベースのスキーマを確認してプロパティを調整
    const adjustedPageData = await adjustPropertiesForDatabase(databaseId, pageData);
    
    console.log('Step 10: Making API call to Notion...');
    // ページを作成（ログを簡素化）
    console.log('Creating Notion page with data summary:', {
      hasTitle: !!adjustedPageData.properties?.Title,
      hasAuthor: !!adjustedPageData.properties?.Author,
      hasChat: !!adjustedPageData.properties?.Chat,
      hasUrl: !!adjustedPageData.properties?.URL,
      hasDate: !!adjustedPageData.properties?.Date,
      childrenCount: adjustedPageData.children?.length || 0
    });
    
    const response = await makeNotionRequest('/pages', 'POST', adjustedPageData);
    
    if (response.ok) {
      const page = await response.json();
      
      // 残りのブロックがある場合は追加で送信
      if (children.length > 100) {
        console.log('Adding remaining blocks to the created page...');
        const remainingBlocks = children.slice(100);
        const addBlocksResult = await addBlocksToPage(page.id, remainingBlocks);
        
        if (addBlocksResult.success) {
          console.log(`Successfully added ${addBlocksResult.blocksAdded} additional blocks`);
        } else {
          console.warn('Failed to add some additional blocks:', addBlocksResult.error);
        }
      }
      
      // 統計情報を更新
      await updateStats({ 
        totalSaved: 1,
        lastSaved: Date.now()
      });
      
      return {
        success: true,
        pageId: page.id,
        pageUrl: page.url,
        totalBlocks: children.length
      };
    } else {
      const error = await response.json();
      console.error('Notion API Error:', error);
      console.error('Response status:', response.status);
      console.error('Response headers:', Object.fromEntries(response.headers.entries()));
      console.error('Request data summary:', {
        propertiesCount: Object.keys(adjustedPageData.properties || {}).length,
        childrenCount: adjustedPageData.children?.length || 0,
        hasParent: !!adjustedPageData.parent
      });
      await updateStats({ errors: 1 });
      
      // 詳細なエラー情報を提供
      let errorMessage = 'ページの作成に失敗しました';
      if (error.message) {
        errorMessage = error.message;
        
        // 文字数制限エラーの場合
        if (error.message.includes('should be ≤')) {
          errorMessage = 'テキストが長すぎます。文字数制限(2000文字)を超えています。';
        }
        
        // プロパティエラーの場合
        if (error.message.includes('body failed validation')) {
          errorMessage = 'データベースのプロパティ設定に問題があります。新しいデータベースを作成してください。';
        }
        
        // 画像URLエラーの場合
        if (error.message.includes('Invalid image url')) {
          errorMessage = '無効な画像URLが含まれています。画像を除外して再試行してください。';
        }
      }
      
      return { 
        success: false, 
        error: `${errorMessage} (詳細: ${JSON.stringify(error)})`,
        details: error
      };
    }
  } catch (error) {
    console.error('Failed to save to Notion:', error);
    await updateStats({ errors: 1 });
    return { success: false, error: error.message };
  }
}

// データベースのスキーマに合わせてプロパティを調整
async function adjustPropertiesForDatabase(databaseId, pageData) {
  try {
    // データベースの詳細を取得
    const dbResponse = await makeNotionRequest(`/databases/${databaseId}`, 'GET');
    
    if (!dbResponse.ok) {
      console.warn('Could not fetch database schema, using original properties');
      return pageData;
    }
    
    const database = await dbResponse.json();
    const dbProperties = database.properties || {};
    
    console.log('Database properties:', Object.keys(dbProperties));
    
    // 存在するプロパティのみを保持
    const adjustedProperties = {};
    
    Object.entries(pageData.properties).forEach(([key, value]) => {
      if (dbProperties[key]) {
        adjustedProperties[key] = value;
      } else {
        console.warn(`Property '${key}' does not exist in database, skipping`);
      }
    });
    
    return {
      ...pageData,
      properties: adjustedProperties
    };
  } catch (error) {
    console.error('Failed to adjust properties:', error);
    return pageData; // エラーの場合は元のデータを返す
  }
}

// 統計情報の取得
async function getStats() {
  try {
    const result = await chrome.storage.local.get('stats');
    return { success: true, stats: result.stats || stats };
  } catch (error) {
    console.error('Failed to get stats:', error);
    return { success: false, error: error.message };
  }
}

// 統計情報の更新
async function updateStats(updates) {
  try {
    const result = await chrome.storage.local.get('stats');
    const currentStats = result.stats || stats;
    
    // 統計情報を更新
    if (updates.totalSaved) {
      currentStats.totalSaved = (currentStats.totalSaved || 0) + updates.totalSaved;
    }
    if (updates.lastSaved) {
      currentStats.lastSaved = updates.lastSaved;
    }
    if (updates.errors) {
      currentStats.errors = (currentStats.errors || 0) + updates.errors;
    }
    if (updates.databasesCreated) {
      currentStats.databasesCreated = (currentStats.databasesCreated || 0) + updates.databasesCreated;
    }
    
    await chrome.storage.local.set({ stats: currentStats });
    stats = currentStats;
  } catch (error) {
    console.error('Failed to update stats:', error);
  }
}

// Notion APIリクエストの実行
async function makeNotionRequest(endpoint, method = 'GET', body = null) {
  const settings = await getSettings();
  
  const headers = {
    'Authorization': `Bearer ${settings.apiKey}`,
    'Notion-Version': NOTION_API.VERSION,
    'Content-Type': 'application/json'
  };
  
  const options = {
    method,
    headers
  };
  
  if (body && (method === 'POST' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }
  
  const url = `${NOTION_API.BASE_URL}${endpoint}`;
  console.log(`Making Notion API request: ${method} ${url}`);
  
  return await fetch(url, options);
}

// 設定の取得
async function getSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    return result.settings || {};
  } catch (error) {
    console.error('Failed to get settings:', error);
    return {};
  }
}

// Notion用画像URL検証関数（強化版）
function isValidNotionImageUrl(url) {
  try {
    // 基本的なURL形式チェック
    if (!url || typeof url !== 'string') {
      console.log('Invalid URL: not a string or empty');
      return false;
    }
    
    // data:URLは除外（Notionは外部URLのみサポート）
    if (url.startsWith('data:')) {
      console.log('Invalid URL: data URL');
      return false;
    }
    
    // blob:URLは除外
    if (url.startsWith('blob:')) {
      console.log('Invalid URL: blob URL');
      return false;
    }
    
    // 相対URLは除外
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
      console.log('Invalid URL: relative URL');
      return false;
    }
    
    // HTTPSで始まる必要がある（セキュリティ強化）
    if (!url.startsWith('https://')) {
      console.log('Invalid URL: not HTTPS');
      return false;
    }
    
    // URLの長さ制限（Notionの制限を考慮）
    if (url.length > 2000) {
      console.log('Invalid URL: too long');
      return false;
    }
    
    // 問題のあるパターンを除外
    const problematicPatterns = [
      'emojione',
      'emoji',
      '.svg',
      'icon.png',
      'favicon'
    ];
    
    if (problematicPatterns.some(pattern => url.includes(pattern))) {
      console.log('Invalid URL: contains problematic pattern');
      return false;
    }
    
    // URLオブジェクトで構文チェック
    const urlObj = new URL(url);
    
    // ホスト名が存在する必要がある
    if (!urlObj.hostname) {
      console.log('Invalid URL: no hostname');
      return false;
    }
    
    // 許可されたドメインのみ（セキュリティ強化）
    const allowedDomains = [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      'imgur.com',
      'i.imgur.com',
      'libecity.com',
      'images.weserv.nl'  // プロキシサービス
    ];
    
    const isAllowedDomain = allowedDomains.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );
    
    if (!isAllowedDomain) {
      console.log('Invalid URL: domain not allowed:', urlObj.hostname);
      return false;
    }
    
    // 一般的に問題のあるドメインを除外
    const blockedDomains = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1'
    ];
    
    if (blockedDomains.includes(urlObj.hostname.toLowerCase())) {
      console.log('Invalid URL: blocked domain');
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.warn('URL validation error:', error.message);
    return false;
  }
}

// プレーンテキストの抽出
function getPlainText(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) {
    return '';
  }
  
  return richTextArray
    .map(item => item.plain_text || item.text?.content || '')
    .join('');
}

// エラーログの記録
async function logError(context, error, details = null) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    context,
    error: error.message || error,
    stack: error.stack,
    details
  };
  
  console.error('Error logged:', errorLog);
  
  try {
    const result = await chrome.storage.local.get('errorLogs');
    const logs = result.errorLogs || [];
    
    logs.push(errorLog);
    
    // 最新100件のみ保持
    if (logs.length > 100) {
      logs.splice(0, logs.length - 100);
    }
    
    await chrome.storage.local.set({ errorLogs: logs });
  } catch (storageError) {
    console.error('Failed to store error log:', storageError);
  }
}

// Notion認証ページを開く
async function openNotionAuthPage() {
  try {
    const authUrl = 'https://www.notion.so/my-integrations';
    await chrome.tabs.create({ url: authUrl });
    return { success: true, message: 'Notion認証ページを開きました。Integration Tokenを作成してください。' };
  } catch (error) {
    console.error('Failed to open Notion auth page:', error);
    return { success: false, error: error.message };
  }
}

// Notionワークスペースの作成（親ページとして）
async function createNotionWorkspace(workspaceName) {
  try {
    const settings = await getSettings();
    
    if (!settings.apiKey) {
      return { success: false, error: 'APIキーが設定されていません' };
    }
    
    // まずルートページを検索
    const searchResponse = await makeNotionRequest('/search', 'POST', {
      filter: {
        value: 'page',
        property: 'object'
      },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time'
      }
    });
    
    if (!searchResponse.ok) {
      return { success: false, error: 'ページ検索に失敗しました' };
    }
    
    const searchResults = await searchResponse.json();
    let parentPageId = null;
    
    // 適切な親ページを見つけるか、新しく作成
    if (searchResults.results && searchResults.results.length > 0) {
      parentPageId = searchResults.results[0].id;
    }
    
    // 新しいワークスペースページを作成
    const pageData = {
      parent: parentPageId ? {
        type: 'page_id',
        page_id: parentPageId
      } : {
        type: 'workspace',
        workspace: true
      },
      properties: {
        title: {
          title: [
            {
              type: 'text',
              text: {
                content: workspaceName || 'LibeCity Workspace'
              }
            }
          ]
        }
      },
      children: [
        {
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'LibeCity Chat Archive'
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'このページはLibeCityからの投稿を管理するためのワークスペースです。'
                }
              }
            ]
          }
        }
      ]
    };
    
    const response = await makeNotionRequest('/pages', 'POST', pageData);
    
    if (response.ok) {
      const page = await response.json();
      return {
        success: true,
        pageId: page.id,
        pageUrl: page.url,
        message: 'ワークスペースページが作成されました'
      };
    } else {
      const error = await response.json();
      return { success: false, error: error.message || 'ワークスペースの作成に失敗しました' };
    }
  } catch (error) {
    console.error('Failed to create workspace:', error);
    return { success: false, error: error.message };
  }
}

// ページに追加のブロックを分割して追加する関数
async function addBlocksToPage(pageId, blocks) {
  try {
    const maxBlocksPerRequest = 100;
    let totalAdded = 0;
    let batchNumber = 2; // 最初のバッチは1なので2から開始
    
    // ブロックを分割して順次追加
    for (let i = 0; i < blocks.length; i += maxBlocksPerRequest) {
      const batch = blocks.slice(i, i + maxBlocksPerRequest);
      
      console.log(`Adding batch ${batchNumber}: ${batch.length} blocks (${i + 1}-${i + batch.length})`);
      
      const requestBody = {
        children: batch
      };
      
      try {
        const response = await makeNotionRequest(`/blocks/${pageId}/children`, 'PATCH', requestBody);
        
        if (response.ok) {
          const result = await response.json();
          totalAdded += batch.length;
          console.log(`Batch ${batchNumber} added successfully: ${batch.length} blocks`);
        } else {
          const error = await response.json();
          console.error(`Failed to add batch ${batchNumber}:`, error);
          
          // エラーが発生しても他のバッチは続行
          if (error.message && error.message.includes('Invalid image url')) {
            console.log('Skipping batch due to invalid image URLs');
            continue;
          } else {
            // 他のエラーの場合は中断
            break;
          }
        }
      } catch (batchError) {
        console.error(`Error in batch ${batchNumber}:`, batchError);
        // エラーが発生しても他のバッチは続行
        continue;
      }
      
      batchNumber++;
      
      // API制限を避けるため、バッチ間に少し待機
      if (i + maxBlocksPerRequest < blocks.length) {
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms待機
      }
    }
    
    return {
      success: true,
      blocksAdded: totalAdded,
      totalBatches: batchNumber - 2
    };
    
  } catch (error) {
    console.error('Failed to add blocks to page:', error);
    return {
      success: false,
      error: error.message,
      blocksAdded: 0
    };
  }
}

console.log('Background script setup complete'); 