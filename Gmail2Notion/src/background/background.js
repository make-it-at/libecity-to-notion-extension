// Gmail2Notion Chrome Extension - Background Script
// バックグラウンドで動作するサービスワーカー

console.log('Gmail2Notion Background Script loaded');

// 拡張機能のインストール時の処理
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Gmail2Notion Extension installed:', details);
  
  // 初回インストール時のみ初期設定値を設定
  if (details.reason === 'install') {
    console.log('First install - setting default values');
    chrome.storage.sync.set({
      notionApiKey: '',
      notionDatabaseId: '',
      autoSave: false,
      showNotifications: true,
      saveImages: true
    });
  } else if (details.reason === 'update') {
    console.log('Extension updated - preserving existing settings');
    // 更新時は既存の設定を保持し、不足している設定のみ追加
    chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId', 'autoSave', 'showNotifications', 'saveImages'], (result) => {
      const defaultSettings = {
        notionApiKey: '',
        notionDatabaseId: '',
        autoSave: false,
        showNotifications: true,
        saveImages: true
      };
      
      // 既存の設定がない項目のみデフォルト値を設定
      const updatedSettings = {};
      Object.keys(defaultSettings).forEach(key => {
        if (result[key] === undefined) {
          updatedSettings[key] = defaultSettings[key];
        }
      });
      
      if (Object.keys(updatedSettings).length > 0) {
        chrome.storage.sync.set(updatedSettings);
        console.log('Added missing settings:', updatedSettings);
      }
    });
  }
});

// コンテンツスクリプトからのメッセージを受信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  console.log('Email data received:', request.emailData);
  
  switch (request.action) {
    case 'ping':
      sendResponse({ success: true, message: 'pong' });
      return true;
      
    case 'saveEmailToNotion':
      handleSaveEmailToNotion(request.emailData)
        .then(result => {
          console.log('Email save completed successfully:', result);
          sendResponse({ success: true, data: result });
        })
        .catch(error => {
          console.error('Email save failed:', error);
          console.error('Error stack:', error.stack);
          sendResponse({ success: false, error: error.message, stack: error.stack });
        });
      return true; // 非同期レスポンスを示す
      
    case 'getSettings':
      chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId', 'autoSave', 'showNotifications', 'saveImages'], (result) => {
        sendResponse(result);
      });
      return true;
      
    case 'testNotionConnection':
      testNotionConnection(request.apiKey, request.databaseId)
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    default:
      console.log('Unknown action:', request.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// Notionにメールデータを保存する関数
async function handleSaveEmailToNotion(emailData) {
  try {
    // 設定を取得
    const settings = await new Promise((resolve) => {
      chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId', 'saveImages', 'saveAsHtml'], resolve);
    });
    
    if (!settings.notionApiKey || !settings.notionDatabaseId) {
      throw new Error('Notion APIキーまたはデータベースIDが設定されていません');
    }
    
    // Notion APIにページを作成
    const response = await createNotionPage(
      settings.notionApiKey,
      settings.notionDatabaseId,
      emailData,
      settings.saveImages,
      settings.saveAsHtml
    );
    
    // 通知を表示
    if (settings.showNotifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icons/icon48.png',
        title: 'Gmail2Notion',
        message: 'メールをNotionに保存しました'
      });
    }
    
    return response;
  } catch (error) {
    console.error('Error saving email to Notion:', error);
    
    // エラー通知を表示
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icons/icon48.png',
      title: 'Gmail2Notion - エラー',
      message: `保存に失敗しました: ${error.message}`
    });
    
    throw error;
  }
}

// HTMLコンテンツをNotionブロックに変換する関数
function createHtmlBlocks(htmlContent) {
  const blocks = [];
  
  try {
    if (htmlContent && htmlContent.trim().length > 0) {
      // HTMLの長さをチェック（Notionの制限に合わせる）
      if (htmlContent.length > 20000) {
        console.log('HTML content too long, falling back to plain text extraction');
        // 長すぎるHTMLは直接プレーンテキストに変換
        const plainText = htmlContent
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
        
        blocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📧 HTML形式のメール内容（テキスト抽出）'
                }
              }
            ]
          }
        });
        
        blocks.push(...splitTextIntoBlocks(plainText || 'HTMLコンテンツの抽出に失敗しました'));
        return blocks;
      }
      
      // HTMLをパースしてNotionブロックに変換
      const parsedBlocks = parseHtmlToNotionBlocks(htmlContent);
      blocks.push(...parsedBlocks);
      
    } else {
      // HTMLコンテンツが空の場合
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: 'HTMLコンテンツを取得できませんでした'
              }
            }
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error processing HTML content:', error);
    // エラーの場合はプレーンテキストにフォールバック
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: 'HTMLコンテンツの処理中にエラーが発生しました'
            }
          }
        ]
      }
    });
  }
  
  return blocks;
}

// HTMLをパースしてNotionブロックに変換する関数
function parseHtmlToNotionBlocks(htmlContent) {
  const blocks = [];
  
  try {
    // 見出しを追加
    blocks.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: '📧 HTML形式のメール内容'
            }
          }
        ]
      }
    });
    
    // HTMLをパースして構造化されたブロックに変換
    const cleanedHtml = cleanGmailHtml(htmlContent);
    const textBlocks = extractTextFromHtml(cleanedHtml);
    
    if (textBlocks.length > 0) {
      blocks.push(...textBlocks);
    } else {
      // パースに失敗した場合はプレーンテキストとして表示
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: 'HTMLコンテンツをテキストに変換できませんでした'
              }
            }
          ]
        }
      });
    }
    
  } catch (error) {
    console.error('Error parsing HTML to blocks:', error);
    // エラーの場合は元のHTMLをプレーンテキストとして表示
    const plainText = htmlContent.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    blocks.push(...splitTextIntoBlocks(plainText || 'HTMLパースエラー'));
  }
  
  return blocks;
}

// HTMLからテキストコンテンツを抽出してNotionブロックに変換
function extractTextFromHtml(html) {
  const blocks = [];
  const maxBlocks = 80; // HTMLパースで生成するブロックの最大数を制限
  
  try {
    console.log('Starting HTML text extraction...');
    
    // まずHTMLを清理
    let cleanedHtml = html
      .replace(/<script[^>]*>.*?<\/script>/gis, '') // スクリプトタグを除去
      .replace(/<style[^>]*>.*?<\/style>/gis, '') // スタイルタグを除去
      .replace(/<!--.*?-->/gs, ''); // コメントを除去
    
    // 正規表現を使用してHTMLからテキストを抽出
    let textContent = cleanedHtml;
    
    // ブロック要素を改行に置換
    textContent = textContent
      .replace(/<\/?(div|p|h[1-6]|tr|td|th|li|br)[^>]*>/gi, '\n')
      .replace(/<\/?(table|tbody|thead|ul|ol)[^>]*>/gi, '\n\n');
    
    // 残りのHTMLタグをすべて除去
    textContent = textContent.replace(/<[^>]*>/g, ' ');
    
    // HTMLエンティティをデコード
    const fullText = textContent
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&copy;/g, '©')
      .replace(/&reg;/g, '®')
      .replace(/&trade;/g, '™')
      // 複数の空白や改行を正規化
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    
    console.log(`Extracted text length: ${fullText.length} characters`);
    
    if (!fullText) {
      console.log('No meaningful text found in HTML');
      return [{
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: 'HTMLからテキストを抽出できませんでした'
              }
            }
          ]
        }
      }];
    }
    
    // 改行で段落を分割
    const paragraphs = fullText
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .slice(0, maxBlocks);
    
    console.log(`Created ${paragraphs.length} paragraphs from extracted text`);
    
    for (const paragraph of paragraphs) {
      if (paragraph.length > 1900) {
        // 長い段落は分割
        const textBlocks = splitTextIntoBlocks(paragraph);
        blocks.push(...textBlocks);
      } else {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: paragraph
                }
              }
            ]
          }
        });
      }
    }
    
  } catch (error) {
    console.error('Error extracting text from HTML:', error);
    
    // フォールバック: 単純なHTMLタグ除去
    try {
      const fallbackText = html
        .replace(/<[^>]*>/g, ' ') // HTMLタグをスペースに置換
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      
      if (fallbackText) {
        console.log('Using fallback text extraction');
        blocks.push(...splitTextIntoBlocks(fallbackText));
      } else {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'HTMLコンテンツの処理中にエラーが発生しました'
                }
              }
            ]
          }
        });
      }
    } catch (fallbackError) {
      console.error('Fallback text extraction also failed:', fallbackError);
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: 'HTMLコンテンツの処理中にエラーが発生しました'
              }
            }
          ]
        }
      });
    }
  }
  
  return blocks;
}

// Gmail固有のHTMLを清理する関数（改良版）
function cleanGmailHtml(html) {
  if (!html) return '';
  
  // Gmail固有のクラスやスタイルを除去
  let cleaned = html
    // Gmail固有のクラスを除去
    .replace(/class="[^"]*"/g, '')
    // Gmail固有のdata属性を除去
    .replace(/data-[^=]*="[^"]*"/g, '')
    // Gmail固有のstyleを一部除去（色やフォントは保持）
    .replace(/style="[^"]*font-family:[^;"]*;?/g, 'style="')
    .replace(/style="[^"]*margin:[^;"]*;?/g, 'style="')
    .replace(/style="[^"]*padding:[^;"]*;?/g, 'style="')
    // 空のstyle属性を除去
    .replace(/style=""\s*/g, '')
    .replace(/style="\s*"\s*/g, '')
    // 複数の空白を正規化
    .replace(/\s+/g, ' ')
    .trim();
  
  return cleaned;
}

// テキストを2000文字以内の複数ブロックに分割する関数
function splitTextIntoBlocks(text, maxLength = 1900) {
  if (!text || text.length <= maxLength) {
    return [{
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: text || 'テキストがありません'
            }
          }
        ]
      }
    }];
  }
  
  const blocks = [];
  let currentIndex = 0;
  
  while (currentIndex < text.length) {
    let endIndex = Math.min(currentIndex + maxLength, text.length);
    
    // 文字の途中で切れないように、空白や改行で区切る
    if (endIndex < text.length) {
      const lastSpace = text.lastIndexOf(' ', endIndex);
      const lastNewline = text.lastIndexOf('\n', endIndex);
      const cutPoint = Math.max(lastSpace, lastNewline);
      
      if (cutPoint > currentIndex) {
        endIndex = cutPoint;
      }
    }
    
    const chunk = text.substring(currentIndex, endIndex).trim();
    if (chunk) {
      blocks.push({
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
    
    currentIndex = endIndex;
  }
  
  return blocks;
}

// 画像ブロックを作成する関数
function createImageBlocks(images) {
  const blocks = [];
  
  if (!images || images.length === 0) {
    console.log('No images to process');
    return blocks;
  }
  
  // 有効な画像のみをフィルタリング
  const validImages = images.filter(image => {
    // 基本的な存在チェック
    if (!image || !image.url) {
      console.log('Filtering out image: missing URL');
      return false;
    }
    
    // プロトコルチェック
    if (!image.url.startsWith('https://')) {
      console.log(`Filtering out image: invalid protocol - ${image.url}`);
      return false;
    }
    
    // Base64画像の除外
    if (image.url.includes('data:image/')) {
      console.log('Filtering out image: base64 data URL');
      return false;
    }
    
    // Gmail内部URLや相対URLの除外
    if (image.url.startsWith('/') || image.url.includes('blob:') || image.url.includes('cid:')) {
      console.log(`Filtering out image: internal/relative URL - ${image.url}`);
      return false;
    }
    
    // URL形式の検証
    try {
      const url = new URL(image.url);
      // ホスト名の検証
      if (!url.hostname || url.hostname.length < 3) {
        console.log(`Filtering out image: invalid hostname - ${image.url}`);
        return false;
      }
      return true;
    } catch (error) {
      console.log(`Filtering out image: malformed URL - ${image.url}`, error.message);
      return false;
    }
  });
  
  console.log(`Filtered ${images.length} images down to ${validImages.length} valid images`);
  
  if (validImages.length === 0) {
    console.log('No valid images found after filtering - returning empty blocks');
    return blocks;
  }
  
  // 画像数を制限（Notionのブロック制限を考慮）
  const maxImages = 5; // より保守的な制限に変更
  const limitedImages = validImages.slice(0, maxImages);
  
  if (validImages.length > maxImages) {
    console.log(`Limiting images from ${validImages.length} to ${maxImages} due to Notion block limits`);
  }
  
  console.log(`Processing ${limitedImages.length} images for Notion blocks`);
  
  // 実際に処理可能な画像があるかチェック
  const processableImages = [];
  
  limitedImages.forEach((image, index) => {
    try {
      // 最終的なURL検証
      const url = new URL(image.url);
      if (url.protocol === 'https:' && url.hostname && url.hostname.length >= 3) {
        processableImages.push(image);
        console.log(`Image ${index + 1} passed final validation: ${image.url}`);
      } else {
        console.log(`Image ${index + 1} failed final validation: ${image.url}`);
      }
    } catch (error) {
      console.log(`Image ${index + 1} failed final URL check: ${image.url}`, error.message);
    }
  });
  
  if (processableImages.length === 0) {
    console.log('No images passed final validation - returning empty blocks');
    return blocks;
  }
  
  // 画像セクションの見出しを追加
  blocks.push({
    object: 'block',
    type: 'heading_3',
    heading_3: {
      rich_text: [
        {
          type: 'text',
          text: {
            content: `📷 メール内の画像 (${processableImages.length})`
          }
        }
      ]
    }
  });
  
  let successfulImages = 0;
  
  processableImages.forEach((image, index) => {
    try {
      console.log(`Creating Notion block for image ${index + 1}:`, {
        url: image.url,
        alt: image.alt,
        title: image.title
      });
      
      // キャプションの長さを制限（2000文字制限対応）
      const caption = (image.alt || image.title || `画像 ${index + 1}`).substring(0, 1900);
      
      // 画像ブロックを追加
      blocks.push({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: {
            url: image.url
          },
          caption: caption ? [
            {
              type: 'text',
              text: {
                content: caption
              }
            }
          ] : []
        }
      });
      
      successfulImages++;
      console.log(`Successfully created image block ${index + 1}`);
    } catch (error) {
      console.error(`Error creating image block ${index + 1}:`, error);
      console.log(`Skipping image ${index + 1} due to error`);
    }
  });
  
  console.log(`Successfully created ${successfulImages} out of ${processableImages.length} image blocks`);
  
  return blocks;
}

// Notion APIでページを作成する関数
async function createNotionPage(apiKey, databaseId, emailData, saveImages = true, saveAsHtml = true) {
  console.log('Starting createNotionPage with data:', {
    subject: emailData.subject,
    from: emailData.from,
    hasAttachments: emailData.attachments?.length > 0,
    attachmentCount: emailData.attachments?.length || 0,
    bodyType: typeof emailData.body,
    apiKeyLength: apiKey?.length,
    databaseId: databaseId
  });
  
  const url = 'https://api.notion.com/v1/pages';
  
  // メール本文の処理（HTMLまたはプレーンテキスト）
  let bodyBlocks = [];
  
  if (emailData.body && typeof emailData.body === 'object') {
    // 新しい形式（HTMLとプレーンテキスト両方）
    if (saveAsHtml && emailData.body.hasHtml && emailData.body.html) {
      console.log('Processing HTML email content (saveAsHtml enabled)');
      bodyBlocks = createHtmlBlocks(emailData.body.html);
    } else {
      console.log('Processing plain text email content (saveAsHtml disabled or no HTML)');
      bodyBlocks = splitTextIntoBlocks(emailData.body.plain || 'メール本文を取得できませんでした');
    }
  } else {
    // 旧形式（プレーンテキストのみ）
    console.log('Processing legacy plain text format');
    bodyBlocks = splitTextIntoBlocks(emailData.body || 'メール本文を取得できませんでした');
  }
  
  // 画像ブロックを作成（一時的に無効化）
  let imageBlocks = [];
  console.log('Image saving temporarily disabled to prevent API errors');
  
  // TODO: 画像保存機能は一時的に無効化中
  // if (saveImages && emailData.images && emailData.images.length > 0) {
  //   try {
  //     imageBlocks = createImageBlocks(emailData.images);
  //     console.log(`Successfully created ${imageBlocks.length} image blocks`);
  //   } catch (error) {
  //     console.error('Error creating image blocks, proceeding without images:', error);
  //     imageBlocks = []; // エラーが発生した場合は画像なしで続行
  //   }
  // } else {
  //   console.log('Image saving disabled or no images found');
  // }
  
  // 添付ファイルブロックを作成（先に作成してブロック数を計算するため）
  let attachmentBlocks = [];
  if (emailData.attachments && emailData.attachments.length > 0) {
    console.log(`Processing ${emailData.attachments.length} attachments`);
    
    // 添付ファイル見出し
    attachmentBlocks.push({
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: '📎 添付ファイル'
            }
          }
        ]
      }
    });
    
    // 各添付ファイルの情報（簡略版でブロック数を抑制）
    emailData.attachments.forEach((attachment, index) => {
      const fileDetails = [];
      if (attachment.fileName) {
        fileDetails.push(`📄 ${attachment.fileName}`);
      }
      if (attachment.size) {
        fileDetails.push(`(${attachment.size})`);
      }
      if (attachment.type) {
        fileDetails.push(`[${attachment.type}]`);
      }
      
      attachmentBlocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: fileDetails.join(' ') || `添付ファイル${index + 1}`
              },
              annotations: {
                bold: true
              }
            }
          ]
        }
      });
    });
    
    // 添付ファイルセクションの後に区切り線
    attachmentBlocks.push({
      object: 'block',
      type: 'divider',
      divider: {}
    });
  }

  // Notionの制限（100ブロック）を考慮してブロック数を制限
  const baseBlocks = 5; // 基本情報（4ブロック）+ 区切り線（1ブロック）
  const maxTotalBlocks = 95;
  const usedBlocks = baseBlocks + attachmentBlocks.length + imageBlocks.length;
  const availableBlocks = Math.max(1, maxTotalBlocks - usedBlocks);
  
  // 本文ブロックを制限
  const limitedBodyBlocks = bodyBlocks.slice(0, availableBlocks);
  
  if (bodyBlocks.length > limitedBodyBlocks.length) {
    console.log(`Body blocks limited from ${bodyBlocks.length} to ${limitedBodyBlocks.length} due to Notion 100-block limit`);
    // 制限により省略されたことを示すブロックを追加
    if (limitedBodyBlocks.length > 0) {
      limitedBodyBlocks[limitedBodyBlocks.length - 1] = {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: `...(残り${bodyBlocks.length - limitedBodyBlocks.length + 1}ブロックは文字数制限により省略されました)`
              }
            }
          ]
        }
      };
    }
  }
  
  const totalBlocks = baseBlocks + attachmentBlocks.length + limitedBodyBlocks.length + imageBlocks.length;
  console.log(`Creating Notion page with ${attachmentBlocks.length} attachment blocks, ${limitedBodyBlocks.length} body blocks and ${imageBlocks.length} image blocks (total: ${totalBlocks})`);
  console.log(`Original body blocks: ${bodyBlocks.length}, limited to: ${limitedBodyBlocks.length}`);
  


  const payload = {
    parent: {
      database_id: databaseId
    },
    properties: {
      title: {
        title: [
          {
            text: {
              content: (emailData.subject || '件名なし').substring(0, 2000)
            }
          }
        ]
      },
      URL: {
        url: emailData.url || ''
      }
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: `送信者: ${(emailData.from || '不明').substring(0, 1900)}`
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
                content: `受信者: ${(emailData.to || '不明').substring(0, 1900)}`
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
                content: `送信日時: ${(emailData.date || '不明').substring(0, 1900)}`
              }
            }
          ]
        }
      },
      {
        object: 'block',
        type: 'divider',
        divider: {}
      },
      // 添付ファイルブロックを追加
      ...attachmentBlocks,
      // メール本文ブロックを追加（制限付き）
      ...limitedBodyBlocks,
      // 画像ブロックを追加
      ...imageBlocks
    ]
  };
  
  console.log('Sending request to Notion API...');
  console.log('Payload summary:', {
    propertiesCount: Object.keys(payload.properties).length,
    childrenCount: payload.children.length,
    payloadSize: JSON.stringify(payload).length
  });
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify(payload)
  });
  
  console.log('Notion API response status:', response.status);
  
  if (!response.ok) {
    const error = await response.json();
    console.error('Notion API Error Details:', error);
    
    // より詳細なエラーメッセージを作成
    let errorMessage = `Notion API Error: ${error.message || response.statusText}`;
    if (error.code) {
      errorMessage += ` (Code: ${error.code})`;
    }
    if (error.details) {
      errorMessage += ` - Details: ${JSON.stringify(error.details)}`;
    }
    
    throw new Error(errorMessage);
  }
  
  return await response.json();
}

// Notion接続をテストする関数
async function testNotionConnection(apiKey, databaseId) {
  try {
    const url = `https://api.notion.com/v1/databases/${databaseId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28'
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`接続テスト失敗: ${error.message || response.statusText}`);
    }
    
    const database = await response.json();
    return {
      title: database.title[0]?.plain_text || 'タイトルなし',
      properties: Object.keys(database.properties)
    };
  } catch (error) {
    console.error('Notion connection test failed:', error);
    throw error;
  }
} 