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
  Chat: {
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
  try {
    switch (request.action) {
      case 'ping':
        return { status: 'active', timestamp: Date.now() };
        
      case 'testConnection':
        return await testNotionConnection(request.apiKey);
        
      case 'getDatabases':
        return await getDatabases();
        
      case 'createDefaultDatabase':
        return await createDefaultDatabase(request.pageTitle);
        
      case 'createStandardDatabase':
        return await createStandardDatabase();
        
      case 'saveToNotion':
        console.log('=== saveToNotion request received ===');
        console.log('Database ID:', request.databaseId);
        console.log('Content summary:', {
          hasText: !!request.content?.text,
          hasUrl: !!request.content?.url,
          url: request.content?.url,
          textLength: request.content?.text?.length || 0
        });
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
  } catch (error) {
    console.error('Error in handleMessage:', error);
    console.error('Error stack:', error.stack);
    return { success: false, error: error.message };
  }
}

// Notion API接続テスト
async function testNotionConnection(testApiKey = null) {
  try {
    const settings = await getSettings();
    const apiKey = testApiKey || settings.apiKey;
    
    if (!apiKey) {
      return { success: false, error: 'APIキーが設定されていません' };
    }
    
    // 一時的にAPIキーを使用してテスト
    const response = await fetch(`${NOTION_API.BASE_URL}/users/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': NOTION_API.VERSION,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const user = await response.json();
      return { success: true, user: user };
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
    console.log('getDatabases - Settings check:', {
      hasApiKey: !!settings.apiKey,
      apiKeyLength: settings.apiKey?.length || 0,
      settingsObject: Object.keys(settings)
    });
    
    if (!settings.apiKey) {
      console.error('getDatabases - No API key found in settings');
      return { success: false, error: 'APIキーが設定されていません' };
    }
    
    console.log('getDatabases - Making Notion API request...');
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
    
    console.log('getDatabases - Notion API response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('getDatabases - Response data:', {
        resultsCount: data.results?.length || 0,
        hasResults: !!data.results
      });
      
      const databases = data.results.map(db => ({
        id: db.id,
        title: getPlainText(db.title),
        url: db.url,
        lastEdited: db.last_edited_time
      }));
      
      console.log('getDatabases - Processed databases:', databases.length);
      return { success: true, databases };
    } else {
      const error = await response.json();
      console.error('getDatabases - API error:', error);
      return { success: false, error: error.message || 'データベースの取得に失敗しました' };
    }
  } catch (error) {
    console.error('Failed to get databases:', error);
    console.error('Error stack:', error.stack);
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
  let imageFailures = []; // 画像保存失敗を記録
  
  try {
    console.log('=== saveToNotion started ===');
    console.log('Received parameters:', {
      databaseIdType: typeof databaseId,
      databaseId: databaseId,
      contentType: typeof content,
      contentKeys: content ? Object.keys(content) : 'null'
    });
    
    // 入力パラメータの検証
    if (!databaseId) {
      console.error('VALIDATION ERROR: Database ID is missing');
      throw new Error('Database ID is required');
    }
    if (!content) {
      console.error('VALIDATION ERROR: Content is missing');
      throw new Error('Content is required');
    }
    
    // databaseIdの形式チェック
    if (typeof databaseId !== 'string' || databaseId.length < 30) {
      console.error('VALIDATION ERROR: Invalid database ID format:', databaseId);
      throw new Error('Invalid database ID format');
    }
    
    console.log('Input validation passed');
    
    // デバッグ用に簡略化したログを出力（巨大なJSONを避ける）
    console.log('=== BACKGROUND: DETAILED CONTENT ANALYSIS ===');
    console.log('Content summary:', {
      hasText: !!content.text,
      textLength: content.text?.length || 0,
      textPreview: content.text ? content.text.substring(0, 100) + '...' : 'No text',
      hasImages: !!(content.images && content.images.length > 0),
      imageCount: content.images?.length || 0,
      hasLinks: !!(content.links && content.links.length > 0),
      linkCount: content.links?.length || 0,
      hasStructuredContent: !!(content.structuredContent && content.structuredContent.length > 0),
      structuredContentCount: content.structuredContent?.length || 0,
      hasAuthor: !!content.author,
      hasTimestamp: !!content.timestamp,
      hasUrl: !!content.url,
      hasChatRoomName: !!content.chatRoomName
    });
    
    // 必須フィールドのチェック
    if (!content.text || content.text.trim() === '') {
      console.warn('WARNING: No text content found');
    }
    if (!content.author) {
      console.warn('WARNING: No author found');
    }
    if (!content.url) {
      console.warn('WARNING: No URL found');
    }
    
    if (content.structuredContent && content.structuredContent.length > 0) {
      console.log('Structured content breakdown:');
      const breakdown = content.structuredContent.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {});
      console.log(breakdown);
    }
    
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
    const url = content.url || 'https://libecity.com';
    
    console.log('Extracted URL for Notion:', {
      contentUrl: content.url,
      finalUrl: url,
      isPostSpecific: url && url !== '' && url.includes('libecity.com')
    });
    
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
    
    // URLの検証とフォールバック処理
    let finalUrl = url;
    if (!finalUrl || finalUrl.trim() === '') {
      finalUrl = 'https://libecity.com';
      console.warn('URL is empty, using fallback URL:', finalUrl);
    } else if (!finalUrl.startsWith('http')) {
      finalUrl = `https://libecity.com${finalUrl}`;
      console.log('Converted relative URL to absolute:', finalUrl);
    }
    
    console.log('Final URL for Notion:', finalUrl);
    
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
          url: finalUrl
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
          rich_text: createRichTextBlocks(text)
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
    
    // 画像検出の統計を追跡
    let totalImagesDetected = 0;
    let validImagesProcessed = 0;
    
    // 長文処理の情報を追跡
    let longTextProcessingInfo = null;
    
    // 子要素（構造化されたブロック生成）
    const children = [];
    
    // 構造化コンテンツがある場合はそれを優先使用
    const structuredContent = content.structuredContent || content.content?.structuredContent || [];
    
    console.log('=== BACKGROUND: STRUCTURED CONTENT DEBUG ===');
    console.log('content.structuredContent:', content.structuredContent);
    console.log('content.content?.structuredContent:', content.content?.structuredContent);
    console.log('Final structuredContent:', structuredContent);
    console.log('structuredContent.length:', structuredContent.length);
    
    if (structuredContent.length > 0) {
      console.log(`=== BACKGROUND: PROCESSING STRUCTURED CONTENT ===`);
      console.log(`Processing ${structuredContent.length} structured content blocks`);
      
      // 構造化コンテンツの詳細分析
      const contentAnalysis = structuredContent.reduce((acc, item, index) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push({
          index,
          content: item.type === 'rich_text' ? item.content?.substring(0, 50) + '...' : 
                   item.type === 'image' ? item.src?.substring(0, 50) + '...' :
                   item.type === 'link' ? item.url?.substring(0, 50) + '...' : 'N/A'
        });
        return acc;
      }, {});
      console.log('Structured content analysis:', contentAnalysis);
      
      // 構造化コンテンツ全体のテキストを結合して長文判定
      const allText = structuredContent
        .filter(block => block.type === 'paragraph' && block.rich_text)
        .map(block => {
          return block.rich_text
            .filter(rt => rt.type === 'text' && rt.text && rt.text.content)
            .map(rt => rt.text.content)
            .join('');
        })
        .join('\n');
      
      console.log(`Total structured text length: ${allText.length} characters`);
      
      // 長文の場合はスマート分割を適用（閾値を1000文字に下げる）
      if (allText.length >= 1000) {
        console.log(`Long structured content detected (${allText.length} chars), applying smart splitting...`);
        
        const smartBlocks = createSmartTextBlocks(allText);
        if (smartBlocks.length > 1) {
          console.log(`Smart splitting successful: ${smartBlocks.length} semantic blocks created for structured content`);
          
                       // 長文処理情報を記録
             longTextProcessingInfo = {
               originalLength: allText.length,
               processingMethod: 'smart_split'
             };
          
          // スマート分割されたブロックを段落として追加
          smartBlocks.forEach(block => {
            children.push({
              object: 'block',
              type: 'paragraph',
              paragraph: { rich_text: [block] }
            });
          });
          
          // 画像のみを別途処理
          structuredContent.forEach((block, index) => {
            if (block.type === 'image') {
              totalImagesDetected++;
              console.log(`Processing image ${totalImagesDetected}: ${block.src}`);
              
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
                validImagesProcessed++;
                console.log(`Valid image added: ${validImagesProcessed}/${totalImagesDetected}`);
              } else {
                console.warn('Invalid image URL skipped:', block.src);
                imageFailures.push({
                  url: block.src,
                  alt: block.alt || '画像',
                  reason: '無効なURL形式（構造化コンテンツ）'
                });
              }
            }
          });
          
          console.log(`Generated ${children.length} Notion blocks from smart-split structured content`);
          
        } else {
          console.log('Smart splitting failed for structured content, using default processing');
          
          // 長文（1000文字以上）の場合のみ処理情報を記録
          if (allText.length >= 1000) {
            longTextProcessingInfo = {
              originalLength: allText.length,
              processingMethod: 'structured_optimized'
            };
          }
          
          // スマート分割失敗時は最適化された処理を使用
          processStructuredContentOptimized();
        }
      } else {
        console.log('Structured content is not long enough for smart splitting, using default processing');
        // 短いコンテンツは従来の処理
        processStructuredContentDefault();
      }
      
      function processStructuredContentOptimized() {
        console.log('Processing structured content with optimized method (reducing block count)');
        
        // 長文構造化コンテンツの場合、ブロック数を大幅に削減
        let currentParagraph = [];
        let consecutiveEmptyLines = 0;
        const maxEmptyLines = 2; // 連続する空行は最大2つまで
        
        structuredContent.forEach((block, index) => {
          switch (block.type) {
            case 'text':
            case 'rich_text':
              consecutiveEmptyLines = 0; // 空行カウンターをリセット
              
              // テキストを現在の段落に追加
              const richTextItem = {
                type: 'text',
                text: { content: block.content }
              };
              
              // リンクがある場合は追加
              if (block.link && block.link.url) {
                richTextItem.text.link = { url: block.link.url };
              }
              
              // 文字修飾がある場合は追加
              if (block.annotations && Object.keys(block.annotations).length > 0) {
                richTextItem.annotations = { ...block.annotations };
              }
              
              currentParagraph.push(richTextItem);
              break;
              
            case 'link':
              consecutiveEmptyLines = 0; // 空行カウンターをリセット
              
              // リンクを現在の段落に追加
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
              consecutiveEmptyLines = 0; // 空行カウンターをリセット
              
              // 画像の前に蓄積された段落を追加
              if (currentParagraph.length > 0) {
                children.push({
                  object: 'block',
                  type: 'paragraph',
                  paragraph: { rich_text: currentParagraph }
                });
                currentParagraph = [];
              }
              
              // 画像統計を更新
              totalImagesDetected++;
              console.log(`Processing image ${totalImagesDetected}: ${block.src}`);
              
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
                validImagesProcessed++;
                console.log(`Valid image added: ${validImagesProcessed}/${totalImagesDetected}`);
              } else {
                console.warn('Invalid image URL skipped:', block.src);
                imageFailures.push({
                  url: block.src,
                  alt: block.alt || '画像',
                  reason: '無効なURL形式（構造化コンテンツ）'
                });
              }
              break;
              
            case 'linebreak':
              // 改行の場合、段落内に改行を追加（新しい段落は作らない）
              if (currentParagraph.length > 0) {
                // 最後の要素に改行を追加
                const lastItem = currentParagraph[currentParagraph.length - 1];
                if (lastItem && lastItem.text && lastItem.text.content) {
                  lastItem.text.content += '\n';
                }
              }
              break;
              
            case 'empty_line':
              consecutiveEmptyLines++;
              
              // 連続する空行が制限を超えた場合はスキップ
              if (consecutiveEmptyLines > maxEmptyLines) {
                console.log(`Skipping excessive empty line (${consecutiveEmptyLines})`);
                break;
              }
              
              // 現在の段落を完成させてから空行を追加
              if (currentParagraph.length > 0) {
                children.push({
                  object: 'block',
                  type: 'paragraph',
                  paragraph: { rich_text: currentParagraph }
                });
                currentParagraph = [];
              }
              
              // 空行を段落として追加（制限内の場合のみ）
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { 
                  rich_text: [
                    {
                      type: 'text',
                      text: { content: ' ' }
                    }
                  ]
                }
              });
              break;
          }
          
          // 段落が長くなりすぎた場合は分割
          if (currentParagraph.length > 0) {
            const totalLength = currentParagraph.reduce((sum, item) => 
              sum + (item.text?.content?.length || 0), 0);
              
            if (totalLength > 1800) { // 1800文字で分割
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: currentParagraph }
              });
              currentParagraph = [];
            }
          }
          
          // 最後のブロックの場合、残った段落を追加
          if (index === structuredContent.length - 1 && currentParagraph.length > 0) {
            children.push({
              object: 'block',
              type: 'paragraph',
              paragraph: { rich_text: currentParagraph }
            });
          }
        });
        
        console.log(`Generated ${children.length} optimized Notion blocks from structured content (reduced from potential ${structuredContent.length})`);
      }
      
      function processStructuredContentDefault() {
        console.log('Processing structured content with default method');
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
            
          case 'paragraph':
            // 最適化された段落ブロック（複数のテキスト要素を含む）
            if (currentParagraph.length > 0) {
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: currentParagraph }
              });
              currentParagraph = [];
            }
            
            // 最適化された段落をそのまま追加
            children.push({
              object: 'block',
              type: 'paragraph',
              paragraph: { rich_text: block.rich_text || [] }
            });
            break;
            
          case 'callout':
            // 省略メッセージなどのコールアウトブロック
            if (currentParagraph.length > 0) {
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: currentParagraph }
              });
              currentParagraph = [];
            }
            
            children.push({
              object: 'block',
              type: 'callout',
              callout: {
                icon: {
                  type: 'emoji',
                  emoji: block.emoji || '📄'
                },
                color: block.color || 'gray',
                rich_text: [
                  {
                    type: 'text',
                    text: { content: block.content || '' },
                    annotations: { bold: true }
                  }
                ]
              }
            });
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
            
            // 画像統計を更新
            totalImagesDetected++;
            console.log(`Processing image ${totalImagesDetected}: ${block.src}`);
            
            // 画像ブロックを追加（事前検証を強化）
            if (isValidNotionImageUrl(block.src) && isNotionCompatibleImageUrl(block.src)) {
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
              validImagesProcessed++;
              console.log(`Valid image added: ${validImagesProcessed}/${totalImagesDetected}`);
            } else {
              console.warn('Invalid or incompatible image URL skipped:', block.src);
              imageFailures.push({
                url: block.src,
                alt: block.alt || '画像',
                reason: 'Notion APIと互換性のないURL形式'
              });
              
              // 画像の代わりにテキストリンクとして追加
              if (block.alt || block.src) {
                currentParagraph.push({
                  type: 'text',
                  text: { 
                    content: `[画像: ${block.alt || '画像'}]`,
                    link: { url: block.src }
                  },
                  annotations: { color: 'gray' }
                });
              }
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
      } // processStructuredContentDefaultの終了
      
      // 構造化コンテンツの品質チェック
      const structuredTextContent = structuredContent
        .filter(block => block.type === 'paragraph' && block.rich_text)
        .map(block => {
          return block.rich_text
            .filter(rt => rt.type === 'text' && rt.text && rt.text.content)
            .map(rt => rt.text.content)
            .join('');
        })
        .join('');
      
      console.log('Structured content quality check:', {
        structuredTextLength: structuredTextContent.length,
        mainTextLength: text.length,
        childrenCount: children.length
      });
      
      // 構造化コンテンツの文字数に基づいて重複防止判定
      if (structuredTextContent.length > 100) {
        console.log(`Sufficient structured content found (${structuredTextContent.length} chars), using structured content only to avoid duplication`);
      } else {
        console.log(`Insufficient structured content (${structuredTextContent.length} chars), adding main text to ensure content availability`);
        
        // 構造化コンテンツが少ない場合はメインテキストも追加
        if (text && text.trim() && text.trim() !== '（構造化コンテンツ）' && text.trim() !== '（構造化コンテンツのみ使用）') {
          console.log('Adding main text content to supplement structured content...');
          
          // メインテキストを段落として追加
          const mainTextBlocks = createRichTextBlocks(text);
          mainTextBlocks.forEach(block => {
            children.push({
              object: 'block',
              type: 'paragraph',
              paragraph: { rich_text: [block] }
            });
          });
          
          console.log(`Added ${mainTextBlocks.length} main text blocks to supplement structured content`);
        }
      }
      
    } else {
      console.log('Step 6b: No structured content found, processing text and images separately...');
      
      // テキストを行ごとに処理
      if (text && text.trim() && text.trim() !== '（構造化コンテンツのみ使用）') {
        console.log('Processing text content line by line...');
        console.log(`Original text length: ${text.length} characters`);
        
        // 長文の場合の処理情報を記録
        if (text.length >= 2000) {
          console.log(`Long text detected (${text.length} chars), applying smart splitting...`);
          
          const smartBlocks = createSmartTextBlocks(text);
          if (smartBlocks.length > 1) {
            console.log(`Smart splitting successful: ${smartBlocks.length} semantic blocks created for regular text`);
            
                         // 長文処理情報を記録
             longTextProcessingInfo = {
               originalLength: text.length,
               processingMethod: 'smart_split_text'
             };
            
            // スマート分割されたブロックを段落として追加
            smartBlocks.forEach(block => {
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: { rich_text: [block] }
              });
            });
            
            console.log(`Generated ${children.length} Notion blocks from smart-split text`);
            
                     } else {
             console.log('Smart splitting failed for regular text, using paragraph-based processing');
             
                           // 長文（2000文字以上）の場合のみ処理情報を記録
              if (text.length >= 2000) {
                longTextProcessingInfo = {
                  originalLength: text.length,
                  processingMethod: 'paragraph_based'
                };
              }
             
             processTextByParagraphs();
           }
        } else {
          console.log('Text is not long enough for smart splitting, using paragraph-based processing');
          processTextByParagraphs();
        }
        
        function processTextByParagraphs() {
          // 段落ベースでテキストを分割（ブロック数を抑制）
          console.log('Processing text by paragraphs to minimize block count...');
          
          // まず、大きな区切り（見出しやセクション）で分割を試す
          const sectionSeparators = [
            /▼[^\n]+/g,     // ▼で始まる見出し
            /【[^】]+】/g,   // 【】で囲まれた見出し
            /〜[^〜]+〜/g,   // 〜で囲まれた見出し
            /^\d+\./gm,     // 数字で始まる項目
            /^[・•]/gm      // 箇条書き
          ];
          
          let sections = [text]; // 初期状態では全体を1つのセクションとする
          
          // 各区切りパターンで分割を試行
          for (const separator of sectionSeparators) {
            const matches = [...text.matchAll(separator)];
            if (matches.length >= 2) { // 2つ以上の区切りがある場合のみ分割
              console.log(`Found ${matches.length} sections with pattern: ${separator}`);
              sections = [];
              let lastIndex = 0;
              
              matches.forEach((match, index) => {
                if (index === 0 && match.index > 0) {
                  // 最初の区切りより前の部分
                  sections.push(text.substring(0, match.index).trim());
                }
                
                if (index < matches.length - 1) {
                  // 現在の区切りから次の区切りまで
                  const nextMatch = matches[index + 1];
                  sections.push(text.substring(match.index, nextMatch.index).trim());
                } else {
                  // 最後の区切りから終端まで
                  sections.push(text.substring(match.index).trim());
                }
              });
              
              // 空のセクションを除去
              sections = sections.filter(section => section.length > 0);
              break; // 最初に見つかったパターンで分割
            }
          }
          
          console.log(`Split text into ${sections.length} sections`);
          
          // 各セクションを処理
          sections.forEach((section, sectionIndex) => {
            if (section.length === 0) return;
            
            // セクションが長すぎる場合は段落で再分割
            if (section.length > 2000) {
              console.log(`Section ${sectionIndex + 1} is long (${section.length} chars), splitting by paragraphs...`);
              
              // 段落で分割（空行で区切られた部分）
              const paragraphs = section
                .split(/\n\s*\n/)  // 空行で分割
                .map(p => p.trim())
                .filter(p => p.length > 0);
              
              console.log(`Split section ${sectionIndex + 1} into ${paragraphs.length} paragraphs`);
              
              paragraphs.forEach(paragraph => {
                if (paragraph.length > 2000) {
                  // 段落も長すぎる場合は文単位で分割
                  const sentences = paragraph
                    .split(/(?<=[。！？])\s*/)
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                  
                  let combinedText = '';
                  sentences.forEach(sentence => {
                    // 個別の文が長すぎる場合は分割
                    if (sentence.length > 1900) {
                      console.warn(`Single sentence is too long (${sentence.length} chars), splitting...`);
                      const chunks = [];
                      for (let i = 0; i < sentence.length; i += 1800) {
                        chunks.push(sentence.substring(i, i + 1800));
                      }
                      chunks.forEach(chunk => {
                        children.push(createParagraphBlock(chunk));
                      });
                      return;
                    }
                    
                    if (combinedText.length + sentence.length > 1800) {
                      // 現在の組み合わせが長くなりすぎる場合、現在のテキストを追加
                      if (combinedText.length > 0) {
                        children.push(createParagraphBlock(combinedText));
                        combinedText = sentence;
                      } else {
                        // 1文が非常に長い場合はそのまま追加
                        children.push(createParagraphBlock(sentence));
                      }
                    } else {
                      combinedText += (combinedText.length > 0 ? '\n' : '') + sentence;
                    }
                  });
                  
                  if (combinedText.length > 0) {
                    children.push(createParagraphBlock(combinedText));
                  }
                } else {
                  // 段落がちょうど良いサイズの場合はそのまま追加
                  children.push(createParagraphBlock(paragraph));
                }
              });
            } else {
              // セクションが適度なサイズの場合はそのまま追加
              children.push(createParagraphBlock(section));
            }
          });
          
          console.log(`Added ${children.length} paragraph blocks (optimized for block count)`);
        }
        
        function createParagraphBlock(text) {
          // 2000文字制限を確実に守る
          if (text.length > 1900) {
            console.warn(`Text block is too long (${text.length} chars), truncating to 1900 chars`);
            text = text.substring(0, 1900) + '...';
          }
          
          // テキスト内のリンクを検出して適切に処理
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const urlMatches = text.match(urlRegex);
          
          if (urlMatches) {
            const richText = [];
            let lastIndex = 0;
            
            urlMatches.forEach(url => {
              const urlIndex = text.indexOf(url, lastIndex);
              
              // リンク前のテキスト
              if (urlIndex > lastIndex) {
                const beforeText = text.substring(lastIndex, urlIndex);
                if (beforeText.trim()) {
                  richText.push({
                    type: 'text',
                    text: { content: beforeText }
                  });
                }
              }
              
              // リンク部分
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
            if (lastIndex < text.length) {
              const afterText = text.substring(lastIndex);
              if (afterText.trim()) {
                richText.push({
                  type: 'text',
                  text: { content: afterText }
                });
              }
            }
            
            return {
              object: 'block',
              type: 'paragraph',
              paragraph: { rich_text: richText }
            };
          } else {
            // リンクがない場合は通常のテキスト
            return {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: { content: text }
                  }
                ]
              }
            };
          }
        }
        
        function processTextLineByLine() {
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
        } // processTextLineByLine関数の終了
      }
      
          // 画像の追加（構造化コンテンツがない場合のみ）
    const images = content.content?.images || content.images || [];
    console.log('=== BACKGROUND: IMAGE PROCESSING DEBUG ===');
    console.log('content.content?.images:', content.content?.images);
    console.log('content.images:', content.images);
    console.log('Final images array:', images);
    console.log('images.length:', images.length);
    console.log('structuredContent.length:', structuredContent.length);
    console.log('Will process images:', images.length > 0 && structuredContent.length === 0);
    
    if (images.length > 0 && structuredContent.length === 0) {
      console.log(`Processing ${images.length} separate images for Notion`);
        
        // 有効な画像のみを処理
        const validImages = images.filter(image => {
          totalImagesDetected++;
          
          // 画像URLを取得（src または url のどちらかを使用）
          const imageUrl = image.src || image.url;
          console.log(`Processing separate image ${totalImagesDetected}: ${imageUrl || 'No URL'}`);
          console.log(`Image object structure:`, { src: image.src, url: image.url, alt: image.alt });
          
          if (!imageUrl) {
            imageFailures.push({
              url: imageUrl || 'URLなし',
              alt: image.alt || '画像',
              reason: 'URLが空です（別画像処理）'
            });
            return false;
          }
          const isValid = isValidNotionImageUrl(imageUrl);
          console.log(`Image validation: ${imageUrl.substring(0, 50)}... -> ${isValid}`);
          if (!isValid) {
            imageFailures.push({
              url: imageUrl,
              alt: image.alt || '画像',
              reason: '無効なURL形式（別画像処理）'
            });
            return false;
          }
          
          // 画像オブジェクトを正規化（srcプロパティを確実に設定）
          image.src = imageUrl;
          return true;
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
          
          // 各画像を追加（最大10個まで）
          validImages.slice(0, 10).forEach((image, index) => {
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
            
            validImagesProcessed++;
            console.log(`Added separate image ${index + 1}: ${image.src.substring(0, 50)}... (${validImagesProcessed}/${totalImagesDetected} total)`);
          });
          
          if (validImages.length > 10) {
            console.log(`Note: Only first 10 images added (${validImages.length} total found)`);
          }
        } else {
          console.log('No valid images found after filtering');
        }
      } else {
        console.log('No separate images found in content');
      }
    }
    
    console.log('Step 9: Final validation and cleanup of blocks...');
    console.log(`Image processing summary: ${totalImagesDetected} detected, ${validImagesProcessed} valid, ${imageFailures.length} failed`);
    
    // 最終的なブロック検証とクリーンアップ関数
    function validateAndCleanBlock(block) {
      if (block.type === 'image') {
        const imageUrl = block.image?.external?.url;
        if (imageUrl && isValidNotionImageUrl(imageUrl)) {
          return { isValid: true, block: block };
        } else {
          return { 
            isValid: false, 
            reason: '最終検証で無効と判定',
            url: imageUrl || 'Unknown URL',
            alt: block.image?.caption?.[0]?.text?.content || '画像'
          };
        }
      } else if (block.type === 'paragraph') {
        // パラグラフブロックの文字数チェック
        const richText = block.paragraph?.rich_text || [];
        let totalLength = 0;
        
        for (const item of richText) {
          if (item.text?.content) {
            totalLength += item.text.content.length;
          }
        }
        
        if (totalLength > 2000) {
          console.warn(`Paragraph block is too long (${totalLength} chars), truncating...`);
          // 文字数を制限
          let currentLength = 0;
          const truncatedRichText = [];
          
          for (const item of richText) {
            if (item.text?.content) {
              const remainingSpace = 1900 - currentLength;
              if (remainingSpace <= 0) break;
              
              if (item.text.content.length <= remainingSpace) {
                truncatedRichText.push(item);
                currentLength += item.text.content.length;
              } else {
                // 部分的に追加
                const truncatedItem = {
                  ...item,
                  text: {
                    ...item.text,
                    content: item.text.content.substring(0, remainingSpace - 3) + '...'
                  }
                };
                truncatedRichText.push(truncatedItem);
                break;
              }
            } else {
              truncatedRichText.push(item);
            }
          }
          
          return {
            isValid: true,
            block: {
              ...block,
              paragraph: {
                ...block.paragraph,
                rich_text: truncatedRichText
              }
            }
          };
        }
        
        return { isValid: true, block: block };
      } else {
        // その他のブロックタイプ
        return { isValid: true, block: block };
      }
    }
    
    // 全ブロックの検証とクリーンアップ
    const cleanedChildren = [];
    let removedImageBlocks = 0;
    let truncatedTextBlocks = 0;
    const finalImageFailures = []; // 最終検証での失敗のみ記録
    
    for (const block of children) {
      const validation = validateAndCleanBlock(block);
      
      if (validation.isValid) {
        cleanedChildren.push(validation.block);
        if (validation.block !== block && block.type === 'paragraph') {
          truncatedTextBlocks++;
        }
      } else {
        if (block.type === 'image') {
          console.warn('Removing invalid image block during final validation:', validation.url);
          removedImageBlocks++;
          finalImageFailures.push({
            url: validation.url,
            alt: validation.alt,
            reason: validation.reason
          });
        }
      }
    }
    
    // 最終検証での失敗を追加（重複を避けるため）
    if (finalImageFailures.length > 0) {
      imageFailures.push(...finalImageFailures);
      console.log(`Added ${finalImageFailures.length} final validation failures to imageFailures`);
    }
    
    if (removedImageBlocks > 0) {
      console.log(`Removed ${removedImageBlocks} invalid image blocks during final validation`);
    }
    
    if (truncatedTextBlocks > 0) {
      console.log(`Truncated ${truncatedTextBlocks} text blocks to meet 2000-character limit`);
    }
    
    console.log('Step 10: Finalizing page data...');
    console.log(`Total blocks after cleanup: ${cleanedChildren.length} (removed ${removedImageBlocks} invalid images, truncated ${truncatedTextBlocks} text blocks)`);
    console.log(`Final image statistics: ${totalImagesDetected} detected, ${validImagesProcessed} successfully processed, ${imageFailures.length} total failures`);
    
    // 長いコンテンツの最終チェック（構造化コンテンツで最適化済みの場合は基本的に不要）
    const maxBlocksPerPage = 95; // 安全マージンを設けて95ブロックまで
    
    if (cleanedChildren.length > maxBlocksPerPage) {
      console.log(`Large content still detected after optimization: ${cleanedChildren.length} blocks. Applying final truncation.`);
      
      // 最初の94ブロックのみ使用し、残りは省略メッセージに置き換え
      const truncatedChildren = cleanedChildren.slice(0, maxBlocksPerPage - 1);
      
      // 省略メッセージを追加
      const truncationNotice = {
        object: 'block',
        type: 'callout',
        callout: {
          icon: {
            type: 'emoji',
            emoji: '📄'
          },
          color: 'orange',
          rich_text: [
            {
              type: 'text',
              text: {
                content: `極めて長い投稿のため、最初の${maxBlocksPerPage - 1}ブロックのみ表示しています。`
              },
              annotations: {
                bold: true
              }
            },
            {
              type: 'text',
              text: {
                content: `\n\n元の投稿には合計${cleanedChildren.length}ブロックが含まれていました。完全な内容を確認するには、元の投稿URLをご覧ください。`
              }
            }
          ]
        }
      };
      
      pageData.children = [...truncatedChildren, truncationNotice];
      console.log(`Content finally truncated to ${pageData.children.length} blocks (including final truncation notice)`);
    } else {
      pageData.children = cleanedChildren;
      console.log(`All ${cleanedChildren.length} blocks will be included (optimization successful)`);
    }
    
    // 画像保存失敗がある場合、Notionページの最上部にコールアウトを追加
    if (totalImagesDetected > 0 && validImagesProcessed < totalImagesDetected) {
      const failedImageCount = totalImagesDetected - validImagesProcessed;
      console.log(`Adding image failure callout to Notion page (${failedImageCount} of ${totalImagesDetected} images failed)`);
      
      const calloutBlock = {
        object: 'block',
        type: 'callout',
        callout: {
          icon: {
            type: 'emoji',
            emoji: '⚠️'
          },
          color: 'orange',
          rich_text: [
            {
              type: 'text',
              text: {
                content: `画像保存エラー: ${totalImagesDetected}個中${failedImageCount}個の画像が保存できませんでした`
              },
              annotations: {
                bold: true
              }
            },
            {
              type: 'text',
              text: {
                content: validImagesProcessed > 0 
                  ? `\n\n${validImagesProcessed}個の画像は正常に保存されました。テキストと他の要素も正常に保存されています。`
                  : '\n\nテキストと他の要素は正常に保存されています。画像が必要な場合は、手動でアップロードしてください。'
              }
            }
          ]
        }
      };
      
      // 画像エラーコールアウトを最上部に挿入
      pageData.children.unshift(calloutBlock);
      console.log('Added image failure callout block to page');
      
      // コールアウト追加後に再度長さをチェック
      if (pageData.children.length > maxBlocksPerPage) {
        console.log(`After adding callout, content exceeds limit. Removing last block to make room.`);
        pageData.children = pageData.children.slice(0, maxBlocksPerPage);
      }
    }
    
    // 長文処理がある場合、Notionページの上部にコールアウトを追加
    if (longTextProcessingInfo) {
      console.log(`Adding long text processing callout to Notion page`);
      
      const longTextCallout = createLongTextProcessingCallout(longTextProcessingInfo);
      if (longTextCallout) {
        // 長文処理コールアウトを画像エラーコールアウトの後（または最上部）に挿入
        const insertIndex = pageData.children.some(block => 
          block.type === 'callout' && 
          block.callout?.rich_text?.[0]?.text?.content?.includes('画像保存エラー')
        ) ? 1 : 0;
        
        pageData.children.splice(insertIndex, 0, longTextCallout);
        console.log('Added long text processing callout block to page');
        
        // コールアウト追加後に再度長さをチェック
        if (pageData.children.length > maxBlocksPerPage) {
          console.log(`After adding long text callout, content exceeds limit. Removing last block to make room.`);
          pageData.children = pageData.children.slice(0, maxBlocksPerPage);
        }
      }
    }
    
    // データベースのスキーマを確認してプロパティを調整
    const adjustedPageData = await adjustPropertiesForDatabase(databaseId, pageData);
    
    console.log('Step 11: Making API call to Notion...');
    // ページを作成（ログを簡素化）
    console.log('Creating Notion page with data summary:', {
      hasTitle: !!adjustedPageData.properties?.Title,
      hasAuthor: !!adjustedPageData.properties?.Author,
      hasChat: !!adjustedPageData.properties?.Chat,
      hasUrl: !!adjustedPageData.properties?.URL,
      hasDate: !!adjustedPageData.properties?.Date,
      childrenCount: adjustedPageData.children?.length || 0
    });
    
    // デバッグ: 実際に送信されるデータの構造を確認
    console.log('=== NOTION API REQUEST DEBUG ===');
    console.log('Database ID in parent:', adjustedPageData.parent?.database_id);
    console.log('Parent structure:', adjustedPageData.parent);
    console.log('Properties keys:', Object.keys(adjustedPageData.properties || {}));
    console.log('Request payload size:', JSON.stringify(adjustedPageData).length, 'characters');
    console.log('================================');
    
    const response = await makeNotionRequest('/pages', 'POST', adjustedPageData);
    
    if (response.ok) {
      const page = await response.json();
      
      // 単一リクエストで完了（追加送信なし）
      console.log(`Page created successfully with ${pageData.children.length} blocks`);
      
      // 統計情報を更新
      await updateStats({ 
        totalSaved: 1,
        lastSaved: Date.now()
      });
      
      return {
        success: true,
        pageId: page.id,
        pageUrl: page.url,
        totalBlocks: pageData.children.length,
        imageFailures: totalImagesDetected > validImagesProcessed ? {
          detected: totalImagesDetected,
          successful: validImagesProcessed,
          failed: totalImagesDetected - validImagesProcessed,
          details: imageFailures
        } : null
      };
    } else {
      const error = await response.json();
      // エラー統計のみ更新（ログ出力なし）
      await updateStats({ errors: 1 });
      
      // ユーザーフレンドリーなエラーメッセージを提供
      let errorMessage = 'ページの作成に失敗しました';
      if (error.message) {
        // 文字数制限エラーの場合
        if (error.message.includes('should be ≤')) {
          errorMessage = 'テキストが長すぎます。文字数制限(2000文字)を超えています。';
        }
        // プロパティエラーの場合
        else if (error.message.includes('body failed validation')) {
          errorMessage = 'データベースのプロパティ設定に問題があります。新しいデータベースを作成してください。';
        }
        // 画像URLエラーの場合（改善されたエラー処理）
        else if (error.message.includes('Invalid image url')) {
          errorMessage = '画像の保存に失敗しました。テキストと他の要素は保存されました。';
          
          // 画像なしで再試行
           try {
             console.log('Retrying without image blocks...');
             const nonImagePageData = { ...adjustedPageData };
             if (nonImagePageData.children) {
               nonImagePageData.children = nonImagePageData.children.filter(block => block.type !== 'image');
               
               // 画像ブロックをカウント
               const imageBlockCount = adjustedPageData.children.length - nonImagePageData.children.length;
               if (imageBlockCount > 0) {
                 imageFailures.push({
                   url: 'Multiple image URLs',
                   alt: '複数の画像',
                   reason: 'Notion APIで拒否されました'
                 });
               }
               
               // リトライ時もコールアウトを追加
               const failedImageCount = totalImagesDetected - validImagesProcessed;
               const calloutBlock = {
                 object: 'block',
                 type: 'callout',
                 callout: {
                   icon: {
                     type: 'emoji',
                     emoji: '⚠️'
                   },
                   color: 'orange',
                   rich_text: [
                     {
                       type: 'text',
                       text: {
                         content: `画像保存エラー: ${totalImagesDetected}個中${failedImageCount}個の画像が保存できませんでした`
                       },
                       annotations: {
                         bold: true
                       }
                     },
                     {
                       type: 'text',
                       text: {
                         content: validImagesProcessed > 0 
                           ? `\n\n${validImagesProcessed}個の画像は正常に保存されました。テキストと他の要素も正常に保存されています。`
                           : '\n\nテキストと他の要素は正常に保存されています。画像が必要な場合は、手動でアップロードしてください。'
                       }
                     }
                   ]
                 }
               };
               
               // コールアウトをページの最上部に挿入
               nonImagePageData.children.unshift(calloutBlock);
               
               // 長文処理コールアウトが既に含まれているかチェックして重複を防ぐ
               const hasLongTextCallout = nonImagePageData.children.some(block => 
                 block.type === 'callout' && 
                 block.callout?.rich_text?.[0]?.text?.content?.includes('長文投稿の処理について')
               );
               
               // 長文処理コールアウトが含まれていない場合のみ追加
               if (longTextProcessingInfo && !hasLongTextCallout) {
                 const longTextCallout = createLongTextProcessingCallout(longTextProcessingInfo);
                 if (longTextCallout) {
                   nonImagePageData.children.splice(1, 0, longTextCallout); // 画像エラーコールアウトの後に挿入
                 }
               }
               
               const retryResponse = await makeNotionRequest('/pages', 'POST', nonImagePageData);
               if (retryResponse.ok) {
                 const retryPage = await retryResponse.json();
                 console.log('Retry without images successful');
                 
                 await updateStats({ 
                   totalSaved: 1,
                   lastSaved: Date.now()
                 });
                 
                 return {
                   success: true,
                   pageId: retryPage.id,
                   pageUrl: retryPage.url,
                   totalBlocks: nonImagePageData.children.length,
                   imageFailures: totalImagesDetected > 0 ? {
                     detected: totalImagesDetected,
                     successful: 0, // 画像なしでリトライしたので0
                     failed: totalImagesDetected,
                     details: imageFailures
                   } : null
                 };
               }
             }
           } catch (retryError) {
             // 再試行失敗時もログ出力なし
           }
        }
        // その他のエラーの場合
        else {
          errorMessage = '保存中にエラーが発生しました。しばらく時間をおいて再試行してください。';
        }
      }
      
      return { 
        success: false, 
        error: errorMessage,
        details: {
          errorMessage: errorMessage,
          timestamp: new Date().toISOString(),
          context: 'saveToNotion general error'
        }
      };
    }
  } catch (error) {
    // エラー統計のみ更新（ログ出力なし）
    await updateStats({ errors: 1 });
    
    // デバッグのために詳細なエラー情報を出力
    console.error('=== DETAILED ERROR INFORMATION ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Full error object:', error);
    console.error('=====================================');
    
    // 実際のエラー原因を含むメッセージを返す（デバッグ用）
    let debugErrorMessage = '保存中にエラーが発生しました。';
    if (error.message) {
      debugErrorMessage += ` 詳細: ${error.message}`;
    }
    
    return { 
      success: false, 
      error: debugErrorMessage,
      details: {
        originalError: error.message,
        errorStack: error.stack,
        errorName: error.name
      }
    };
  }
}

// データベースのスキーマに合わせてプロパティを調整
async function adjustPropertiesForDatabase(databaseId, pageData) {
  try {
    console.log('=== DATABASE SCHEMA VALIDATION ===');
    console.log('Checking database schema for ID:', databaseId);
    
    // データベースの詳細を取得
    const dbResponse = await makeNotionRequest(`/databases/${databaseId}`, 'GET');
    
    if (!dbResponse.ok) {
      console.error('Failed to fetch database schema:', {
        status: dbResponse.status,
        statusText: dbResponse.statusText
      });
      
      try {
        const errorBody = await dbResponse.json();
        console.error('Database fetch error details:', errorBody);
      } catch (parseError) {
        console.error('Could not parse database error response');
      }
      
      console.warn('Could not fetch database schema, using original properties');
      return pageData;
    }
    
    const database = await dbResponse.json();
    const dbProperties = database.properties || {};
    
    console.log('Database properties found:', Object.keys(dbProperties));
    console.log('Page data properties to validate:', Object.keys(pageData.properties));
    
    // プロパティマッピング定義（柔軟な対応）
    const propertyMappings = {
      // タイトル系
      'Title': ['Title', 'タイトル', 'title', 'ToDo', 'TODO', 'Task', 'タスク', 'Name', '名前'],
      // URL系
      'URL': ['URL', 'url', 'Link', 'リンク', 'Source', 'ソース'],
      // 作成者系
      'Author': ['Author', '作成者', '担当者', 'Creator', 'User', 'ユーザー'],
      // テキスト・チャット系
      'Chat': ['Chat', 'チャット', 'Content', 'コンテンツ', '内容', 'Text', 'テキスト', 'Description', '説明'],
      // 日付系
      'Date': ['Date', '日付', '作成日時', '実行日', 'Created', 'Timestamp', 'タイムスタンプ'],
      // ステータス系
      'Status': ['Status', 'ステータス', '状態', 'State', 'Done', '完了'],
      // タグ系
      'Tags': ['Tags', 'タグ', 'Category', 'カテゴリ', '分類', 'Label', 'ラベル']
    };
    
    // 動的プロパティマッピング
    const mappedProperties = {};
    const unmappedOriginalProps = [];
    
    Object.entries(pageData.properties).forEach(([originalProp, value]) => {
      const candidates = propertyMappings[originalProp] || [originalProp];
      let mapped = false;
      
      for (const candidate of candidates) {
        if (dbProperties[candidate]) {
          const dbProp = dbProperties[candidate];
          const pageType = Object.keys(value)[0];
          
          console.log(`Checking mapping: ${originalProp} -> ${candidate} (${dbProp.type})`);
          
          // 型の互換性チェックと変換
          if (pageType === dbProp.type) {
            // 完全一致
            mappedProperties[candidate] = value;
            console.log(`✓ Direct mapping: ${originalProp} -> ${candidate} (${dbProp.type})`);
            mapped = true;
            break;
          } else if (dbProp.type === 'title' && pageType === 'rich_text') {
            // rich_text -> title 変換
            mappedProperties[candidate] = {
              title: value.rich_text
            };
            console.log(`✓ Converted mapping: ${originalProp} -> ${candidate} (rich_text -> title)`);
            mapped = true;
            break;
          } else if (dbProp.type === 'rich_text' && pageType === 'title') {
            // title -> rich_text 変換
            mappedProperties[candidate] = {
              rich_text: value.title
            };
            console.log(`✓ Converted mapping: ${originalProp} -> ${candidate} (title -> rich_text)`);
            mapped = true;
            break;
          } else if (dbProp.type === 'select' && pageType === 'select') {
            // select型の値を検証
            const selectValue = value.select?.name;
            const availableOptions = dbProp.select?.options || [];
            const validOption = availableOptions.find(opt => opt.name === selectValue);
            
            if (validOption) {
              mappedProperties[candidate] = value;
              console.log(`✓ Select mapping: ${originalProp} -> ${candidate} (${selectValue})`);
              mapped = true;
              break;
            } else {
              // デフォルト値を使用
              if (availableOptions.length > 0) {
                mappedProperties[candidate] = {
                  select: { name: availableOptions[0].name }
                };
                console.log(`✓ Select mapping with default: ${originalProp} -> ${candidate} (${availableOptions[0].name})`);
                mapped = true;
                break;
              }
            }
          }
        }
      }
      
      if (!mapped) {
        unmappedOriginalProps.push(originalProp);
        console.warn(`✗ Could not map property: ${originalProp}`);
      }
    });
    
    // 必須プロパティ（Title）の確保
    const titleProps = ['Title', 'タイトル', 'title', 'ToDo', 'TODO', 'Task', 'タスク', 'Name', '名前'];
    let titleMapped = false;
    
    // 既にマッピングされたタイトルプロパティがあるかチェック
    for (const titleProp of titleProps) {
      if (mappedProperties[titleProp]) {
        console.log(`✓ Title property already mapped: ${titleProp}`);
        titleMapped = true;
        break;
      }
    }
    
    // タイトルプロパティがまだマッピングされていない場合の緊急処理
    if (!titleMapped) {
      for (const titleProp of titleProps) {
        if (dbProperties[titleProp]) {
          const dbType = dbProperties[titleProp].type;
          let titleContent = pageData.properties.Title?.title?.[0]?.text?.content || 
                            pageData.properties.Chat?.rich_text?.[0]?.text?.content || 
                            'LibeCity投稿';
          
          if (dbType === 'title') {
            mappedProperties[titleProp] = {
              title: [{
                type: 'text',
                text: { content: titleContent.substring(0, 100) } // タイトルは100文字まで
              }]
            };
          } else if (dbType === 'rich_text') {
            mappedProperties[titleProp] = {
              rich_text: [{
                type: 'text',
                text: { content: titleContent }
              }]
            };
          }
          
          console.log(`✓ Emergency title mapping: ${titleProp} (${dbType})`);
          titleMapped = true;
          break;
        }
      }
    }
    
    if (!titleMapped) {
      console.error('No suitable title property found in database');
      console.error('Available database properties:', Object.keys(dbProperties));
      console.error('Looking for title properties:', titleProps);
      throw new Error('データベースにタイトル用のプロパティが見つかりません');
    }
    
    console.log(`Mapping summary: ${Object.keys(mappedProperties).length} mapped, ${unmappedOriginalProps.length} unmapped`);
    console.log('Mapped properties:', Object.keys(mappedProperties));
    if (unmappedOriginalProps.length > 0) {
      console.log('Unmapped properties:', unmappedOriginalProps);
    }
    console.log('==================================');
    
    const adjustedPageData = {
      ...pageData,
      properties: mappedProperties
    };
    
    return adjustedPageData;
  } catch (error) {
    console.error('=== DATABASE SCHEMA ADJUSTMENT ERROR ===');
    console.error('Error during schema adjustment:', error);
    console.error('Database ID:', databaseId);
    console.error('Original page data keys:', Object.keys(pageData.properties));
    console.error('========================================');
    
    // エラー時は元のデータを返すが、警告を出力
    console.warn('Falling back to original page data due to schema adjustment error');
    return pageData;
  }
}

// 統計情報の取得
async function getStats() {
  try {
    const result = await chrome.storage.local.get('stats');
    return { success: true, stats: result.stats || stats };
  } catch (error) {
    // エラー時はデフォルト値を返す（ログ出力なし）
    return { success: false, error: '統計情報を取得できませんでした' };
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
    // 統計更新失敗時もログ出力なし
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
    
    // POSTリクエストの詳細ログ
    if (method === 'POST' && endpoint === '/pages') {
      console.log('=== POST REQUEST DETAILS ===');
      console.log('Database ID:', body.parent?.database_id);
      console.log('Properties count:', Object.keys(body.properties || {}).length);
      console.log('Children blocks count:', body.children?.length || 0);
      console.log('Request body size:', options.body.length, 'characters');
      console.log('============================');
    }
  }
  
  const url = `${NOTION_API.BASE_URL}${endpoint}`;
  console.log(`Making Notion API request: ${method} ${url}`);
  
  try {
    const response = await fetch(url, options);
    
    // レスポンスが失敗の場合、詳細なエラー情報を出力
    if (!response.ok) {
      console.error('=== NOTION API ERROR ===');
      console.error('Status:', response.status);
      console.error('Status Text:', response.statusText);
      console.error('URL:', url);
      console.error('Method:', method);
      
      try {
        const errorBody = await response.clone().json();
        console.error('Error Response Body:', errorBody);
        
        // 404エラーの場合の詳細診断
        if (response.status === 404 && method === 'POST' && endpoint === '/pages') {
          console.error('=== DATABASE PERMISSION DIAGNOSTIC ===');
          console.error('This 404 error during page creation suggests:');
          console.error('1. Database exists (GET request succeeded)');
          console.error('2. Integration has READ permission');
          console.error('3. Integration lacks WRITE permission');
          console.error('');
          console.error('SOLUTION:');
          console.error('1. Open the database in Notion');
          console.error('2. Click "Share" button');
          console.error('3. Find your integration');
          console.error('4. Change permission from "Can view" to "Can edit"');
          console.error('5. Or create a new database using the extension');
          console.error('==========================================');
        }
      } catch (parseError) {
        console.error('Could not parse error response as JSON');
        const errorText = await response.clone().text();
        console.error('Error Response Text:', errorText);
      }
      console.error('========================');
    }
    
    return response;
  } catch (fetchError) {
    console.error('=== FETCH ERROR ===');
    console.error('Fetch error:', fetchError);
    console.error('URL:', url);
    console.error('Method:', method);
    console.error('==================');
    throw fetchError;
  }
}

// 設定の取得
async function getSettings() {
  try {
    console.log('getSettings - Attempting to get settings from chrome.storage.sync...');
    const result = await chrome.storage.sync.get('settings');
    console.log('getSettings - Raw storage result:', result);
    
    // 新しい形式（直接保存）もチェック - popup.jsで使用されているキー名も含める
    const directResult = await chrome.storage.sync.get(['apiKey', 'notionApiKey', 'saveImages', 'saveLinks', 'notifications']);
    console.log('getSettings - Direct storage result:', {
      hasApiKey: !!directResult.apiKey,
      hasNotionApiKey: !!directResult.notionApiKey,
      apiKeyLength: directResult.apiKey?.length || 0,
      notionApiKeyLength: directResult.notionApiKey?.length || 0,
      saveImages: directResult.saveImages,
      saveLinks: directResult.saveLinks,
      notifications: directResult.notifications
    });
    
    // 直接保存形式を優先（popup.jsで使用されているnotionApiKeyを優先）
    const finalApiKey = directResult.notionApiKey || directResult.apiKey;
    if (finalApiKey) {
      console.log('getSettings - Using direct storage format with API key:', finalApiKey.substring(0, 10) + '...');
      return {
        apiKey: finalApiKey,
        saveImages: directResult.saveImages !== false,
        saveLinks: directResult.saveLinks !== false,
        notifications: directResult.notifications !== false
      };
    }
    
    // 従来の settings オブジェクト形式
    if (result.settings) {
      console.log('getSettings - Using legacy settings object format');
      return result.settings;
    }
    
    console.log('getSettings - No settings found, returning empty object');
    return {};
  } catch (error) {
    console.error('getSettings - Error getting settings:', error);
    // 設定取得失敗時はデフォルト値を返す
    return {};
  }
}

// Notion用画像URL検証関数（改良版）
// 長文を意味のある区切りで複数ブロックに分割する関数（スマート分割）
function createRichTextBlocks(text) {
  const MAX_RICH_TEXT_LENGTH = 2000; // NotionのRich Textブロックの制限
  const MIN_LONG_TEXT_LENGTH = 1000; // 長文と判定する閾値（1000文字に下げる）
  
  if (!text || text.length <= MAX_RICH_TEXT_LENGTH) {
    return [
      {
        type: 'text',
        text: {
          content: text || ''
        }
      }
    ];
  }
  
  console.log(`Long text detected (${text.length} chars), analyzing for smart splitting...`);
  
  // 長文の場合、意味のある区切りを探す
  if (text.length >= MIN_LONG_TEXT_LENGTH) {
    const smartBlocks = createSmartTextBlocks(text);
    if (smartBlocks.length > 1) {
      console.log(`Smart splitting successful: ${smartBlocks.length} semantic blocks created`);
      return smartBlocks;
    }
  }
  
  // スマート分割ができない場合は従来の方法
  console.log(`Falling back to character-based splitting`);
  return createCharacterBasedBlocks(text);
}

// 意味のある区切りでテキストを分割する関数
function createSmartTextBlocks(text) {
  const MAX_RICH_TEXT_LENGTH = 1900; // 安全マージンを含めた制限
  const blocks = [];
  
  // 重要な区切りパターン（優先度順）
  const sectionPatterns = [
    // 1. 大見出し（【】で囲まれた見出し）
    /【[^】]+】/g,
    // 2. 概要・内容などの区切り
    /▼[^\n]+/g,
    // 3. 小見出し（〜で囲まれた見出し）
    /〜[^〜]+〜/g,
    // 4. 話者の変更（絵文字＋コロン）
    /[🦁👨👩🔸🌀✅️][：:]/g,
    // 5. リスト項目
    /^[・•]\s/gm,
    // 6. 番号付きリスト
    /^[①②③④⑤⑥⑦⑧⑨⑩]\s/gm
  ];
  
  // 最も適切な区切りパターンを見つける
  let bestSplits = null;
  let bestPattern = null;
  
  for (const pattern of sectionPatterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length >= 2) { // 最低2つの区切りが必要
      bestSplits = matches;
      bestPattern = pattern;
      console.log(`Found ${matches.length} sections using pattern: ${pattern}`);
      break;
    }
  }
  
  if (!bestSplits || bestSplits.length < 2) {
    console.log('No suitable section patterns found, using character-based splitting');
    // パターンが見つからない場合は文字数ベースで分割
    return createCharacterBasedBlocks(text);
  }
  
  // 区切り位置でテキストを分割
  const sections = [];
  let lastIndex = 0;
  
  bestSplits.forEach((match, index) => {
    if (index === 0 && match.index > 0) {
      // 最初の区切りより前にテキストがある場合
      sections.push(text.substring(0, match.index).trim());
    }
    
    if (index < bestSplits.length - 1) {
      // 現在の区切りから次の区切りまで
      const nextMatch = bestSplits[index + 1];
      sections.push(text.substring(match.index, nextMatch.index).trim());
    } else {
      // 最後の区切りから終端まで
      sections.push(text.substring(match.index).trim());
    }
  });
  
  // 各セクションをNotionブロックに変換
  sections.forEach((section, index) => {
    if (section.length === 0) return;
    
    if (section.length <= MAX_RICH_TEXT_LENGTH) {
      // そのまま1ブロックとして追加
      blocks.push({
        type: 'text',
        text: {
          content: section
        }
      });
    } else {
      // セクションが長い場合は文字数ベースで分割
      const subBlocks = createCharacterBasedBlocks(section, `セクション${index + 1}`);
      blocks.push(...subBlocks);
    }
  });
  
  console.log(`Created ${blocks.length} blocks from ${sections.length} sections`);
  return blocks;
}

// 文字数ベースでテキストを分割する関数
function createCharacterBasedBlocks(text, prefix = '') {
  const MAX_RICH_TEXT_LENGTH = 1900; // 安全マージンを含めた制限
  const blocks = [];
  let remainingText = text;
  let chunkIndex = 1;
  
  while (remainingText.length > 0) {
    let chunk = remainingText.substring(0, MAX_RICH_TEXT_LENGTH);
    
    // 文章の途中で切れないように、適切な区切り位置を探す
    if (remainingText.length > MAX_RICH_TEXT_LENGTH) {
      // 改行、句読点、スペースなどで区切る
      const breakPoints = ['\n\n', '\n', '。', '！', '？', '、', ' ', '　'];
      let bestBreakPoint = -1;
      
      // 後ろから100文字以内で適切な区切り位置を探す
      for (let i = chunk.length - 1; i >= Math.max(0, chunk.length - 100); i--) {
        if (breakPoints.includes(chunk[i])) {
          bestBreakPoint = i + 1; // 区切り文字の次の位置
          break;
        }
      }
      
      if (bestBreakPoint > 0) {
        chunk = remainingText.substring(0, bestBreakPoint);
      }
    }
    
    // 継続表示の追加
    let content = chunk;
    if (chunkIndex > 1) {
      const continueLabel = prefix ? `(${prefix} 続き${chunkIndex})` : `(続き ${chunkIndex})`;
      content = `${continueLabel}\n\n${chunk}`;
      
      // 継続ラベルを追加した結果が制限を超える場合は調整
      if (content.length > MAX_RICH_TEXT_LENGTH) {
        const labelLength = continueLabel.length + 2; // \n\n分
        const availableLength = MAX_RICH_TEXT_LENGTH - labelLength;
        chunk = chunk.substring(0, availableLength);
        content = `${continueLabel}\n\n${chunk}`;
      }
    }
    
    // 最終的な文字数チェック
    if (content.length > MAX_RICH_TEXT_LENGTH) {
      console.warn(`Block content is still too long (${content.length} chars), truncating...`);
      content = content.substring(0, MAX_RICH_TEXT_LENGTH - 3) + '...';
    }
    
    blocks.push({
      type: 'text',
      text: {
        content: content
      }
    });
    
    remainingText = remainingText.substring(chunk.length);
    chunkIndex++;
  }
  
  return blocks;
}

function isValidNotionImageUrl(url) {
  try {
    // 基本的なURL形式チェック
    if (!url || typeof url !== 'string') {
      console.log('Invalid URL: not a string or empty');
      return false;
    }
    
    // 詳細ログ出力
    console.log('Validating image URL:', url);
    
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
    
    // HTTP/HTTPSで始まる必要がある
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.log('Invalid URL: not HTTP/HTTPS');
      return false;
    }
    
    // URLの長さ制限（Notionの制限を考慮）
    if (url.length > 2000) {
      console.log('Invalid URL: too long');
      return false;
    }
    
    // 問題のあるパターンを除外（より厳密に）
    const problematicPatterns = [
      'emojione',
      'emoji.png',
      'emoji.gif',
      'favicon.ico',
      'favicon.png',
      '.svg'  // SVGは一般的に問題を起こしやすい
    ];
    
    if (problematicPatterns.some(pattern => url.toLowerCase().includes(pattern.toLowerCase()))) {
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
    
    // 信頼できる画像プロキシサービスをチェック
    const trustedImageProxies = [
      'images.weserv.nl',
      'cdn.jsdelivr.net',
      'i.imgur.com',
      'media.giphy.com',
      'lh3.googleusercontent.com',
      'lh4.googleusercontent.com',
      'lh5.googleusercontent.com',
      'lh6.googleusercontent.com',
      'lh7.googleusercontent.com'
    ];
    
    const isTrustedProxy = trustedImageProxies.some(proxy => 
      url.toLowerCase().includes(proxy)
    );
    
    // 画像拡張子のチェック（より柔軟に）
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const hasImageExtension = imageExtensions.some(ext => 
      url.toLowerCase().includes(ext)
    );
    
    // 信頼できるプロキシの場合は拡張子チェックをスキップ
    if (!isTrustedProxy && !hasImageExtension) {
      console.warn('URL may not be an image (no image extension):', url);
      // 但し、明らかに画像でないURLは除外
      if (url.includes('.html') || url.includes('.js') || url.includes('.css') || url.includes('.xml')) {
        console.log('Invalid URL: non-image file extension');
        return false;
      }
    }
    
    console.log('URL validation passed:', url);
    return true;
    
  } catch (error) {
    console.warn('URL validation error:', error.message, 'URL:', url);
    return false;
  }
}

// Notion APIとの互換性をチェックする追加関数
function isNotionCompatibleImageUrl(url) {
  try {
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    // 既知の問題のあるパターンを除外
    const problematicPatterns = [
      // Google Docsの動的画像URL（keyパラメータ付き）
      /googleusercontent\.com.*docsz.*key=/i,
      // 非常に長いクエリパラメータ
      /\?[^&]{200,}/,
      // 複雑なエンコードされたURL
      /%[0-9A-F]{2}.*%[0-9A-F]{2}.*%[0-9A-F]{2}/i
    ];
    
    const hasProblematicPattern = problematicPatterns.some(pattern => 
      pattern.test(url)
    );
    
    if (hasProblematicPattern) {
      console.log('Image URL has problematic pattern for Notion API:', url);
      return false;
    }
    
    // URL長制限（Notion APIは非常に長いURLを受け付けない）
    if (url.length > 1000) {
      console.log('Image URL too long for Notion API:', url.length, 'chars');
      return false;
    }
    
    return true;
  } catch (error) {
    console.warn('Error checking Notion compatibility:', error.message);
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



// 長文処理情報のコールアウトを生成する関数
function createLongTextProcessingCallout(longTextInfo) {
  if (!longTextInfo) return null;
  
  const { originalLength } = longTextInfo;
  
  // シンプルな注意書きのみ
  const calloutContent = [
    {
      type: 'text',
      text: { content: '長文投稿の処理について' },
      annotations: { bold: true }
    },
    {
      type: 'text',
      text: { 
        content: '\n\n長文投稿では読みやすさのため、見出しや段落で自動分割されます。Notion側の文字数制限やブロック数制限により、一部の書式設定や改行が調整される場合があります。\n\n画像やリンクは分割後に適切な位置に配置されます。' 
      }
    }
  ];
  
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: calloutContent,
      icon: { emoji: '📝' },
      color: 'blue_background'
    }
  };
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
  
  // エラー記録（ログ出力なし）
  
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
    // エラーログ保存失敗時もログ出力なし
  }
}

// Notion認証ページを開く
async function openNotionAuthPage() {
  try {
    const authUrl = 'https://www.notion.so/my-integrations';
    await chrome.tabs.create({ url: authUrl });
    return { success: true, message: 'Notion認証ページを開きました。Integration Tokenを作成してください。' };
  } catch (error) {
    // 認証ページオープン失敗時もログ出力なし
    return { success: false, error: '認証ページを開けませんでした' };
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
    // ワークスペース作成失敗時もログ出力なし
    return { success: false, error: 'ワークスペースを作成できませんでした' };
  }
}

// ページに追加のブロックを分割して追加する関数
async function addBlocksToPage(pageId, blocks) {
  try {
    const maxBlocksPerRequest = 100;
    let totalAdded = 0;
    let batchNumber = 2; // 最初のバッチは1なので2から開始
    let imageErrors = [];
    
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
          
          // 画像エラーの場合は画像以外のブロックを再試行
          if (error.message && error.message.includes('Invalid image url')) {
            console.log('Retrying batch without image blocks due to invalid image URLs');
            
            // 画像ブロック以外を抽出
            const nonImageBlocks = batch.filter(block => {
              if (block.type === 'image') {
                imageErrors.push({
                  url: block.image?.external?.url || 'Unknown URL',
                  reason: 'Notion API rejected URL'
                });
                return false;
              }
              return true;
            });
            
            if (nonImageBlocks.length > 0) {
              // 画像以外のブロックで再試行
              const retryResponse = await makeNotionRequest(`/blocks/${pageId}/children`, 'PATCH', {
                children: nonImageBlocks
              });
              
              if (retryResponse.ok) {
                totalAdded += nonImageBlocks.length;
                console.log(`Batch ${batchNumber} retry successful: ${nonImageBlocks.length} blocks (${batch.length - nonImageBlocks.length} images skipped)`);
              } else {
                console.error(`Batch ${batchNumber} retry also failed`);
              }
            }
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
      totalBatches: batchNumber - 2,
      imageErrors: imageErrors.length > 0 ? imageErrors : null
    };
    
  } catch (error) {
    console.error('Failed to add blocks to page:', error);
    return {
      success: false,
      error: error.message,
      blocksAdded: 0,
      imageErrors: []
    };
  }
}

console.log('Background script setup complete');

// 標準データベースの作成（LibeCity専用）
async function createStandardDatabase() {
  try {
    console.log('Creating standard LibeCity database...');
    
    // 設定の確認
    const settings = await getSettings();
    if (!settings.apiKey) {
      return { success: false, error: 'APIキーが設定されていません' };
    }
    
    // 利用可能なページを検索
    console.log('Searching for available pages...');
    const searchResponse = await makeNotionRequest('/search', 'POST', {
      filter: {
        value: 'page',
        property: 'object'
      }
    });
    
    let parentPageId = null;
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      console.log(`Found ${searchData.results.length} pages`);
      
      if (searchData.results.length > 0) {
        // 最初に見つかったページを親として使用
        parentPageId = searchData.results[0].id;
        console.log('Using existing page as parent:', searchData.results[0].properties?.title?.title?.[0]?.text?.content || 'Untitled');
      } else {
        return { 
          success: false, 
          error: 'Notionワークスペースに利用可能なページが見つかりません。先にNotionで任意のページを作成してから再試行してください。' 
        };
      }
    } else {
      return { success: false, error: 'ページの検索に失敗しました' };
    }
    
    // データベースの作成
    const timestamp = new Date().toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/\//g, '-');
    
    const databaseTitle = `🗃️ LibeCity チャット投稿データベース (${timestamp})`;
    
    const databaseData = {
      parent: {
        type: 'page_id',
        page_id: parentPageId
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
    
    console.log('Creating database with title:', databaseTitle);
    const response = await makeNotionRequest('/databases', 'POST', databaseData);
    
    if (response.ok) {
      const database = await response.json();
      console.log('Database created successfully:', database.id);
      
      // 統計情報を更新
      await updateStats({ databasesCreated: 1 });
      
      return {
        success: true,
        databaseId: database.id,
        databaseUrl: database.url,
        databaseTitle: databaseTitle
      };
    } else {
      const error = await response.json();
      console.error('Database creation failed:', error);
      await updateStats({ errors: 1 });
      return { 
        success: false, 
        error: error.message || 'データベースの作成に失敗しました',
        details: error
      };
    }
  } catch (error) {
    console.error('Failed to create standard database:', error);
    await updateStats({ errors: 1 });
    return { success: false, error: error.message };
  }
}

 