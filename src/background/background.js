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
    console.log('Saving content to Notion:', JSON.stringify(content, null, 2));
    
    // コンテンツ構造に応じてデータを準備（詳細ログ付き）
    let title = '無題の投稿';
    if (content.title) {
      title = content.title;
    } else if (content.content?.title) {
      title = content.content.title;
    } else if (content.content?.text) {
      title = content.content.text.substring(0, 100) + (content.content.text.length > 100 ? '...' : '');
    }
    console.log('Extracted title:', title);
    
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
    console.log('Extracted text preview:', text.substring(0, 200) + '...');
    
    const author = content.metadata?.author || content.author?.name || content.author || 'Unknown';
    const url = content.url || '';
    const date = content.metadata?.postTime?.timestamp || content.timestamp || new Date().toISOString();
    
    console.log('Processed data:', { title, textLength: text.length, author, url, date });
    
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
        Date: {
          date: date ? {
            start: new Date(date).toISOString().split('T')[0]
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
    
    // 子要素（チャット本文、画像、リンクなど）の追加
    const children = [];
    
    // 構造化されたコンテンツがある場合はそれを使用
    if (content.content?.structuredContent && content.content.structuredContent.length > 0) {
      console.log('Adding structured content as page blocks...');
      
      for (const block of content.content.structuredContent) {
        switch (block.type) {
          case 'text':
            if (block.content && block.content.trim()) {
              // テキストを2000文字以内に分割
              const textContent = block.content.trim();
              if (textContent.length <= 2000) {
                children.push({
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [
                      {
                        type: 'text',
                        text: {
                          content: textContent
                        }
                      }
                    ]
                  }
                });
              } else {
                // 2000文字を超える場合は分割
                for (let i = 0; i < textContent.length; i += 2000) {
                  const chunk = textContent.substring(i, i + 2000);
                  children.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                      rich_text: [
                        {
                          type: 'text',
                          text: {
                            content: chunk
                          }
                        }
                      ]
                    }
                  });
                }
              }
            }
            break;
            
          case 'linebreak':
            // 改行は空の段落として追加
            children.push({
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: []
              }
            });
            break;
            
          case 'paragraph_break':
            // 段落区切りも空の段落として追加
            children.push({
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: []
              }
            });
            break;
            
          case 'image':
            // 画像ブロックを追加
            if (block.src) {
              const imageBlock = {
                object: 'block',
                type: 'image',
                image: {
                  type: 'external',
                  external: {
                    url: block.src
                  }
                }
              };
              
              // captionは空でない場合のみ追加
              if (block.alt && block.alt.trim()) {
                imageBlock.image.caption = [
                  {
                    type: 'text',
                    text: {
                      content: block.alt.trim()
                    }
                  }
                ];
              }
              
              children.push(imageBlock);
            }
            break;
        }
      }
    } else if (text && text.trim()) {
      // フォールバック: 構造化されていないテキストの処理
      console.log('Adding chat content as page blocks...');
      
      // 長いテキストを段落に分割（改行で分割）
      const paragraphs = text.split('\n').filter(p => p.trim());
      
      if (paragraphs.length === 0) {
        // 改行がない場合は全体を一つの段落として追加
        // Notion APIの制限: 1つのrich_textは2000文字まで
        const textContent = text.trim();
        if (textContent.length <= 2000) {
          children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: textContent
                  }
                }
              ]
            }
          });
        } else {
          // 2000文字を超える場合は分割
          const chunks = [];
          for (let i = 0; i < textContent.length; i += 2000) {
            chunks.push(textContent.substring(i, i + 2000));
          }
          
          chunks.forEach(chunk => {
            children.push({
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: chunk
                    }
                  }
                ]
              }
            });
          });
        }
      } else {
        // 改行で分割された各段落を追加
        paragraphs.forEach(paragraph => {
          const trimmedParagraph = paragraph.trim();
          if (trimmedParagraph) {
            // 各段落も2000文字制限をチェック
            if (trimmedParagraph.length <= 2000) {
              children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [
                    {
                      type: 'text',
                      text: {
                        content: trimmedParagraph
                      }
                    }
                  ]
                }
              });
            } else {
              // 長い段落は分割
              const chunks = [];
              for (let i = 0; i < trimmedParagraph.length; i += 2000) {
                chunks.push(trimmedParagraph.substring(i, i + 2000));
              }
              
              chunks.forEach(chunk => {
                children.push({
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [
                      {
                        type: 'text',
                        text: {
                          content: chunk
                        }
                      }
                    ]
                  }
                });
              });
            }
          }
        });
      }
      
      console.log(`Added ${children.length} paragraph blocks for chat content`);
    }
    
    // リンクの追加（構造化コンテンツに含まれていない場合のフォールバック）
    const links = content.content?.links || content.links || [];
    if (links.length > 0 && (!content.content?.structuredContent || content.content.structuredContent.length === 0)) {
      links.forEach(link => {
        children.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: link.text || link.url
                },
                annotations: {
                  underline: true
                },
                href: link.url
              }
            ]
          }
        });
      });
    }
    
    // 子要素が存在する場合のみ追加
    if (children.length > 0) {
      pageData.children = children;
    }
    
    // データベースのスキーマを確認してプロパティを調整
    const adjustedPageData = await adjustPropertiesForDatabase(databaseId, pageData);
    
    // ページを作成
    console.log('Creating Notion page with data:', JSON.stringify(adjustedPageData, null, 2));
    const response = await makeNotionRequest('/pages', 'POST', adjustedPageData);
    
    if (response.ok) {
      const page = await response.json();
      
      // 統計情報を更新
      await updateStats({ 
        totalSaved: 1,
        lastSaved: Date.now()
      });
      
      return {
        success: true,
        pageId: page.id,
        pageUrl: page.url
      };
    } else {
      const error = await response.json();
      console.error('Notion API Error:', error);
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
      }
      
      return { 
        success: false, 
        error: errorMessage,
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

console.log('Background script setup complete'); 