// Gmail2Notion Chrome Extension - Content Script
// Gmail画面に注入されるスクリプト

console.log('Gmail2Notion Content Script loaded');

// 拡張機能の状態管理
let isInitialized = false;
let saveButton = null;
let currentEmailData = null;
let savedEmails = new Set(); // 保存済みメールのIDを記録

// 初期化
function initializeExtension() {
  if (isInitialized) return;
  
  console.log('Initializing Gmail2Notion extension');
  
  // 既存のボタンを削除（画面右側のボタンなど）
  removeExistingButtons();
  
  // 保存済みメールの履歴を読み込み
  loadSavedEmailHistory();
  
  // Gmail画面の変更を監視
  observeGmailChanges();
  
  isInitialized = true;
}

// 既存のボタンを削除
function removeExistingButtons() {
  try {
    // 既存の保存ボタンを削除
    const existingButtons = document.querySelectorAll('.gmail2notion-save-button');
    existingButtons.forEach(button => {
      if (button.parentElement) {
        button.parentElement.removeChild(button);
      }
    });
    
    // グローバル変数をリセット
    saveButton = null;
    currentEmailData = null;
    
    console.log('Removed existing buttons:', existingButtons.length);
  } catch (error) {
    console.error('Error removing existing buttons:', error);
  }
}

// 保存済みメールの履歴を読み込み
async function loadSavedEmailHistory() {
  try {
    const result = await chrome.storage.local.get(['savedEmails']);
    if (result.savedEmails) {
      savedEmails = new Set(result.savedEmails);
      console.log('Loaded saved email history:', savedEmails.size, 'emails');
    }
  } catch (error) {
    console.error('Error loading saved email history:', error);
  }
}

// 保存済みメールの履歴を保存
async function saveSavedEmailHistory() {
  try {
    await chrome.storage.local.set({
      savedEmails: Array.from(savedEmails)
    });
  } catch (error) {
    console.error('Error saving email history:', error);
  }
}

// メールのユニークIDを生成
function generateEmailId(emailData) {
  // 件名、送信者、送信日時を組み合わせてハッシュ化
  const uniqueString = `${emailData.subject}-${emailData.from}-${emailData.date}`;
  
  // 簡単なハッシュ関数
  let hash = 0;
  for (let i = 0; i < uniqueString.length; i++) {
    const char = uniqueString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit整数に変換
  }
  
  return hash.toString();
}

// Gmail画面の変更を監視（メール一覧の各行にボタン追加対応）
function observeGmailChanges() {
  // パフォーマンスを考慮してスロットリング処理を追加
  let isProcessing = false;
  
  const observer = new MutationObserver((mutations) => {
    if (isProcessing) return;
    
    isProcessing = true;
    
    // 少し遅延を入れて処理を実行
    setTimeout(() => {
      try {
        // メール一覧の各行にボタンを追加
        addButtonsToEmailRows();
        
      } catch (error) {
        console.error('Error in Gmail changes observation:', error);
      } finally {
        isProcessing = false;
      }
    }, 100);
  });
  
  // 監視対象を最小限に絞る
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // 初回チェック（遅延を長くして安全に）
  setTimeout(() => {
    try {
      addButtonsToEmailRows();
    } catch (error) {
      console.error('Error in initial email view check:', error);
    }
  }, 2000);
}



// メール一覧での選択変更を監視（簡素化）- 使用停止
// function checkForListSelectionChanges() {
//   try {
//     // メール一覧でメールが選択されているかチェック
//     const selectedEmail = document.querySelector('tr[aria-selected="true"]') ||
//                          document.querySelector('tr.btb');
//     
//     if (selectedEmail) {
//       // メール一覧上部のツールバーにボタンを追加（既にある場合はスキップ）
//       if (!saveButton || !saveButton.closest('.ar5, .G-Ni, .aeF')) {
//         addListToolbarButton();
//         
//         // 選択されたメールの情報を取得
//         const emailId = selectedEmail.getAttribute('id');
//         if (emailId) {
//           extractEmailDataFromList(selectedEmail);
//         }
//       }
//     }
//   } catch (error) {
//     console.error('Error in checkForListSelectionChanges:', error);
//   }
// }

// メール一覧の各行にNotionへ保存ボタンを追加
function addButtonsToEmailRows() {
  try {
    // メール一覧の各行を取得
    const emailRows = document.querySelectorAll('tr.zA');
    
    emailRows.forEach((row) => {
      // 既にボタンが追加されているかチェック
      if (row.querySelector('.gmail2notion-row-button')) {
        return;
      }
      
      // 重要マークの要素を探す
      const importantMarkCell = row.querySelector('.WA.xY');
      if (!importantMarkCell) {
        return;
      }
      
      // 重要マークの後に新しいセルを追加
      const buttonCell = document.createElement('td');
      buttonCell.className = 'xY gmail2notion-cell';
      buttonCell.style.cssText = `
        width: 32px;
        padding: 0 4px;
        text-align: center;
        vertical-align: middle;
      `;
      
      // ボタンを作成
      const button = createRowSaveButton(row);
      buttonCell.appendChild(button);
      
      // 重要マークセルの後に挿入
      importantMarkCell.insertAdjacentElement('afterend', buttonCell);
      
      console.log('Added save button to email row:', row.id);
    });
  } catch (error) {
    console.error('Error in addButtonsToEmailRows:', error);
  }
}



// メール詳細画面の表示をチェック（記事の知見を活用して改善）- 使用停止
// function checkForEmailView() {
//   // Gmail新UIのメール詳細画面とプレビュー画面のセレクタ（aria-label属性を活用）
//   const emailContainer = findEmailContainer();
//   
//   if (emailContainer) {
//     // 現在のメールIDを取得
//     const currentMessageId = getMessageId(emailContainer);
//     
//     // 新しいメールが表示された場合のみ処理
//     if (!currentEmailData || currentEmailData.messageId !== currentMessageId) {
//       console.log('New email detected:', currentMessageId);
//       
//       // 保存ボタンがない場合は追加
//       if (!saveButton) {
//         addSaveButton();
//       }
//       
//       // メールデータを抽出して状態を更新
//       extractEmailData(currentMessageId);
//     } else if (!saveButton) {
//       // 同じメールだがボタンがない場合は追加
//       console.log('Same email but no button, adding button');
//       addSaveButton();
//       // 既存データがあるので状態チェックのみ
//       await checkEmailSavedStatus();
//     }
//   } else if (saveButton) {
//     console.log('Email view closed, removing save button');
//     removeSaveButton();
//     currentEmailData = null;
//   }
// }

// メールコンテナを見つける（プレビュー画面対応を追加）
function findEmailContainer() {
  const selectors = [
    // プレビュー画面のセレクタ（新規追加）
    '[role="complementary"] [data-message-id]', // プレビューペイン内のメッセージ
    '[role="complementary"] .ii.gt', // プレビューペイン内のメール本体
    '[role="complementary"] [aria-label*="メッセージ本文"]', // プレビューペイン内のメッセージ本文
    '.aeJ [data-message-id]', // プレビューエリア内のメッセージ
    '.aeJ .ii.gt', // プレビューエリア内のメール本体
    
    // aria-label属性を活用したセレクタ（記事の知見）
    '[aria-label*="メッセージ本文"]',
    '[aria-label*="メッセージ"]',
    '[aria-label*="会話"]',
    
    // data-message-id属性を持つ要素
    '[role="main"] [data-message-id]',
    '[data-message-id]',
    
    // 従来のセレクタ（フォールバック）
    '[role="main"] .ii.gt',
    '.ii.gt',
    '[role="listitem"][jslog*="20277"]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log(`Email container found with selector: ${selector}`);
      
      // プレビュー画面かどうかを判定
      const isPreview = element.closest('[role="complementary"]') || element.closest('.aeJ');
      if (isPreview) {
        console.log('Preview mode detected');
      }
      
      return element;
    }
  }
  
  console.log('Email container not found');
  return null;
}

// メッセージIDを取得
function getMessageId(container) {
  // data-message-id属性から取得
  let messageId = container.getAttribute('data-message-id');
  
  if (!messageId) {
    // 親要素から検索
    const parentWithMessageId = container.closest('[data-message-id]');
    if (parentWithMessageId) {
      messageId = parentWithMessageId.getAttribute('data-message-id');
    }
  }
  
  if (!messageId) {
    // 子要素から検索
    const childWithMessageId = container.querySelector('[data-message-id]');
    if (childWithMessageId) {
      messageId = childWithMessageId.getAttribute('data-message-id');
    }
  }
  
  // メッセージIDが見つからない場合はURLから生成
  if (!messageId) {
    const urlParams = new URLSearchParams(window.location.search);
    messageId = urlParams.get('th') || Date.now().toString();
  }
  
  return messageId;
}

// Notionに保存ボタンを追加
function addSaveButton() {
  try {
    // ツールバーを探す
    const toolbar = findToolbar();
    if (!toolbar) {
      console.log('Toolbar not found, retrying...');
      setTimeout(addSaveButton, 500);
      return;
    }
    
    // 既存のボタンがあれば削除
    removeSaveButton();
    
    // 保存ボタンを作成
    saveButton = createSaveButton();
    
    // ツールバーに追加
    toolbar.appendChild(saveButton);
    
    console.log('Save button added to Gmail toolbar');
    console.log('Button element:', saveButton);
    console.log('Button parent:', saveButton.parentElement);
  } catch (error) {
    console.error('Error adding save button:', error);
  }
}

// メール一覧上部のツールバーにボタンを追加
function addListToolbarButton() {
  try {
    // メール一覧上部のツールバーを探す（シンプル化）
    const listToolbar = document.querySelector('.ar5 [role="toolbar"]') ||
                       document.querySelector('.ar5 .ar9') ||
                       document.querySelector('.G-Ni [role="toolbar"]');
    
    if (!listToolbar) {
      // フォールバック: 通常のツールバーを使用
      addSaveButton();
      return;
    }
    
    // 既存のボタンがあれば削除
    removeSaveButton();
    
    // 保存ボタンを作成
    saveButton = createSaveButton();
    
    // ツールバーに追加
    listToolbar.appendChild(saveButton);
    
    console.log('Save button added to list toolbar');
  } catch (error) {
    console.error('Error adding save button to list toolbar:', error);
    // エラーが発生した場合は通常のツールバーを使用
    addSaveButton();
  }
}

// メール一覧から選択されたメールの情報を抽出（簡素化）
async function extractEmailDataFromList(selectedEmailRow) {
  try {
    // メールIDを取得
    const emailId = selectedEmailRow.getAttribute('id') || Date.now().toString();
    
    // 件名を取得（シンプル化）
    const subjectElement = selectedEmailRow.querySelector('b') || 
                          selectedEmailRow.querySelector('.bog');
    const subject = subjectElement ? subjectElement.textContent.trim() : 'No Subject';
    
    // 送信者を取得（シンプル化）
    const fromElement = selectedEmailRow.querySelector('.yW');
    const from = fromElement ? fromElement.textContent.trim() : 'Unknown Sender';
    
    // メールデータを設定（最小限）
    currentEmailData = {
      id: generateEmailId({ subject, from, date: new Date().toISOString() }),
      messageId: emailId,
      subject: subject,
      from: from,
      to: 'Me',
      date: new Date().toLocaleString(),
      body: 'メール本文は詳細画面で確認してください',
      url: window.location.href,
      images: []
    };
    
    // 保存済み状態をチェック
    await checkEmailSavedStatus();
    
  } catch (error) {
    console.error('Error extracting email data from list:', error);
  }
}

// ツールバーを見つける（li要素のアイコン並び対応）
function findToolbar() {
  // li要素のアイコン並び（アーカイブ、削除等のボタンがある場所）を優先的に探す
  const selectors = [
    // アーカイブボタンと同じ構造のul要素を探す
    'li[data-tooltip="アーカイブ"]',
    'li[data-tooltip="削除"]',
    'li[data-tooltip="返信"]',
    'li[data-tooltip="転送"]',
    'li[data-tooltip="印刷"]',
    'li[data-tooltip="スヌーズ"]',
    'li[data-tooltip="移動"]',
    
    // li要素のクラス名で探す
    'li.bqX.brq',
    
    // スレッド詳細画面のメインツールバー
    '[role="main"] [role="toolbar"]',
    '[role="main"] .ar9',
    '[role="main"] .amn',
    
    // aria-label属性でボタンを特定
    '[aria-label*="アーカイブ"]',
    '[aria-label*="削除"]', 
    '[aria-label*="返信"]',
    '[aria-label*="転送"]',
    '[aria-label*="印刷"]',
    '[aria-label*="スヌーズ"]',
    '[aria-label*="移動"]',
    
    // data-tooltip属性でボタンを特定
    '[data-tooltip*="アーカイブ"]',
    '[data-tooltip*="削除"]',
    '[data-tooltip*="返信"]',
    '[data-tooltip*="転送"]',
    '[data-tooltip*="印刷"]',
    
    // メール一覧上部のツールバー（フォールバック）
    '.ar5 [role="toolbar"]',
    '.ar5 .ar9',
    '.ar5 .amn',
    '.G-Ni [role="toolbar"]',
    '.G-Ni .ar9', 
    '.G-Ni .amn',
    '.aeF [role="toolbar"]',
    '.aeF .ar9',
    '.aeF .amn',
    
    // プレビュー画面のツールバー（フォールバック）
    '[role="complementary"] [role="toolbar"]',
    '[role="complementary"] .ar9',
    '[role="complementary"] .amn',
    '.aeJ [role="toolbar"]',
    '.aeJ .ar9',
    '.aeJ .amn',
    
    // 汎用ツールバー（最終フォールバック）
    '[role="toolbar"]',
    '.ar9',
    '.amn'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log(`Toolbar element found with selector: ${selector}`);
      
      // li要素が見つかった場合は親のul要素を返す
      if (element.tagName === 'LI') {
        const parentUl = element.parentElement;
        if (parentUl && parentUl.tagName === 'UL') {
          console.log('Found li element, returning parent ul:', parentUl);
          return parentUl;
        }
      }
      
      // ツールバーの種類を判定
      const isPreview = element.closest('[role="complementary"]') || element.closest('.aeJ');
      const isListToolbar = element.closest('.ar5') || element.closest('.G-Ni') || element.closest('.aeF');
      
      if (isPreview) {
        console.log('Preview toolbar detected');
      } else if (isListToolbar) {
        console.log('Mail list toolbar detected');
      } else {
        console.log('Detail view toolbar detected');
      }
      
      // aria-label属性またはdata-tooltip属性でボタンを見つけた場合は親要素を探す
      if ((selector.includes('aria-label') || selector.includes('data-tooltip')) && 
          !selector.includes('toolbar') && !selector.includes('ツールバー')) {
        // ボタンの親要素（ツールバー）を見つける
        const toolbar = element.closest('[role="toolbar"]') || 
                       element.closest('.ar9') || 
                       element.closest('.amn') ||
                       element.parentElement;
        
        if (toolbar) {
          console.log('Found toolbar as parent of button');
          return toolbar;
        }
      }
      
      // ツールバー要素の場合はそのまま返す
      if (element.getAttribute('role') === 'toolbar' || 
          element.classList.contains('ar9') || 
          element.classList.contains('amn') ||
          element.getAttribute('aria-label')?.includes('ツールバー') ||
          element.getAttribute('aria-label')?.includes('toolbar')) {
        return element;
      }
      
      // その他の場合は親要素を返す
      return element.parentElement;
    }
  }
  
  console.log('Toolbar not found with any selector');
  return null;
}

// 保存ボタンを作成（Gmailアイコンスタイルに合わせて）
function createSaveButton() {
  // li要素として作成（Gmailのアイコンと同じ構造）
  const button = document.createElement('li');
  button.className = 'bqX brq gmail2notion-save-button';
  button.setAttribute('data-tooltip', 'Notionへ保存');
  button.setAttribute('role', 'button');
  button.setAttribute('tabindex', '0');
  button.setAttribute('aria-label', 'Notionへ保存');
  button.setAttribute('jsaction', 'click:gmail2notion.save');
  
  // Gmailのアイコンボタンスタイルに合わせる
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    margin: 0;
    padding: 0;
    border-radius: 50%;
    cursor: pointer;
    background-color: transparent;
    border: none;
    color: #5f6368;
    font-size: 14px;
    font-family: 'Google Sans', Roboto, Arial, sans-serif;
    transition: background-color 0.2s ease;
    user-select: none;
    position: relative;
    outline: none;
    box-sizing: border-box;
    list-style: none;
  `;
  
  // ボタンの内容（Notionアイコン）
  button.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
      <svg width="20" height="20" viewBox="0 0 16 16" style="flex-shrink: 0;">
        <path fill="currentColor" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v7A2.5 2.5 0 0 0 4.5 14h7a2.5 2.5 0 0 0 2.5-2.5v-7A2.5 2.5 0 0 0 11.5 2h-7zM3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7z"/>
        <path fill="currentColor" d="M4.5 5.5A.5.5 0 0 1 5 5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zM5 7a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zM4.5 9.5A.5.5 0 0 1 5 9h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
      </svg>
    </div>
  `;
  
  // ホバー効果（Gmailスタイル）
  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = 'rgba(60, 64, 67, 0.08)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = 'transparent';
  });
  
  // フォーカス効果
  button.addEventListener('focus', () => {
    button.style.backgroundColor = 'rgba(60, 64, 67, 0.08)';
  });
  
  button.addEventListener('blur', () => {
    button.style.backgroundColor = 'transparent';
  });
  
  // クリックイベント
  button.addEventListener('click', handleSaveButtonClick);
  
  return button;
}

// メール一覧の各行用の保存ボタンを作成
function createRowSaveButton(emailRow) {
  // 添付ファイルの有無をチェック
  const hasAttachments = checkForAttachmentsInRow(emailRow);
  
  const button = document.createElement('div');
  button.className = 'gmail2notion-row-button';
  button.setAttribute('role', 'button');
  button.setAttribute('tabindex', '0');
  button.setAttribute('data-tooltip', hasAttachments ? 'Notionへ保存（添付ファイル有り）' : 'Notionへ保存');
  button.setAttribute('aria-label', hasAttachments ? 'Notionへ保存（添付ファイル有り）' : 'Notionへ保存');
  button.setAttribute('data-email-row-id', emailRow.id);
  button.setAttribute('data-has-attachments', hasAttachments.toString());
  
  // 小さなアイコンボタンスタイル（添付ファイルがある場合は色を変更）
  const buttonColor = hasAttachments ? '#dc2626' : '#5f6368';
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin: 0;
    padding: 0;
    border-radius: 50%;
    cursor: pointer;
    background-color: transparent;
    border: none;
    color: ${buttonColor};
    font-size: 12px;
    font-family: 'Google Sans', Roboto, Arial, sans-serif;
    transition: background-color 0.2s ease;
    user-select: none;
    position: relative;
    outline: none;
    box-sizing: border-box;
  `;
  
  // ボタンの内容（添付ファイルがある場合はクリップアイコンを追加）
  if (hasAttachments) {
    button.innerHTML = `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <svg width="16" height="16" viewBox="0 0 16 16" style="flex-shrink: 0;">
          <path fill="currentColor" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v7A2.5 2.5 0 0 0 4.5 14h7a2.5 2.5 0 0 0 2.5-2.5v-7A2.5 2.5 0 0 0 11.5 2h-7zM3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7z"/>
          <path fill="currentColor" d="M4.5 5.5A.5.5 0 0 1 5 5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zM5 7a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zM4.5 9.5A.5.5 0 0 1 5 9h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
        </svg>
        <div style="position: absolute; top: -2px; right: -2px; width: 8px; height: 8px; background: #dc2626; border-radius: 50%; border: 1px solid white;">
          <svg width="6" height="6" viewBox="0 0 16 16" style="position: absolute; top: 0; left: 0;">
            <path fill="white" d="M4.5 3A1.5 1.5 0 0 0 3 4.5v6A1.5 1.5 0 0 0 4.5 12h6a1.5 1.5 0 0 0 1.5-1.5V7.914a.5.5 0 0 0-.146-.353L9.146 4.854A.5.5 0 0 0 8.793 4.5H4.5z"/>
          </svg>
        </div>
      </div>
    `;
  } else {
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" style="flex-shrink: 0;">
        <path fill="currentColor" d="M4.5 2A2.5 2.5 0 0 0 2 4.5v7A2.5 2.5 0 0 0 4.5 14h7a2.5 2.5 0 0 0 2.5-2.5v-7A2.5 2.5 0 0 0 11.5 2h-7zM3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7z"/>
        <path fill="currentColor" d="M4.5 5.5A.5.5 0 0 1 5 5h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zM5 7a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zM4.5 9.5A.5.5 0 0 1 5 9h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
      </svg>
    `;
  }
  
  // ホバー効果
  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = 'rgba(60, 64, 67, 0.08)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = 'transparent';
  });
  
  // フォーカス効果
  button.addEventListener('focus', () => {
    button.style.backgroundColor = 'rgba(60, 64, 67, 0.08)';
  });
  
  button.addEventListener('blur', () => {
    button.style.backgroundColor = 'transparent';
  });
  
  // クリックイベント
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleRowButtonClick(button, emailRow);
  });
  
  // 保存済み状態をチェック
  checkRowButtonSavedStatus(button, emailRow);
  
  return button;
}

// 保存ボタンのクリック処理
async function handleSaveButtonClick(event) {
  event.preventDefault();
  event.stopPropagation();
  
  if (!currentEmailData) {
    showNotification('メール情報を取得できませんでした', 'error');
    return;
  }
  
  // 重複保存防止設定を確認
  const settings = await new Promise((resolve) => {
    chrome.storage.sync.get(['preventDuplicates'], resolve);
  });
  
  // 重複保存防止が有効で、既に保存済みのメールかチェック
  if (settings.preventDuplicates !== false && savedEmails.has(currentEmailData.id)) {
    showNotification('このメールは既に保存済みです（重複保存防止が有効）', 'info');
    return;
  }
  
  try {
    // ボタンの状態を保存中に変更
    setSaveButtonState('saving');
    
    // バックグラウンドスクリプトにメール保存を依頼
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'saveEmailToNotion',
        emailData: currentEmailData
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    if (response.success) {
      // 保存成功時に履歴に追加
      savedEmails.add(currentEmailData.id);
      await saveSavedEmailHistory();
      
      setSaveButtonState('success');
      showNotification('メールをNotionに保存しました', 'success');
      
      // 3秒後に保存済み状態に変更
      setTimeout(() => {
        setSaveButtonState('already-saved');
      }, 3000);
    } else {
      console.error('Save failed with response:', response);
      setSaveButtonState('error');
      showNotification(`保存に失敗しました: ${response.error}`, 'error');
      
      // スタック情報がある場合はコンソールに出力
      if (response.stack) {
        console.error('Error stack:', response.stack);
      }
      
      // 3秒後にボタンの状態をリセット
      setTimeout(() => {
        setSaveButtonState('normal');
      }, 3000);
    }
  } catch (error) {
    console.error('Error saving email:', error);
    setSaveButtonState('error');
    showNotification(`保存に失敗しました: ${error.message}`, 'error');
    
    // 3秒後にボタンの状態をリセット
    setTimeout(() => {
      setSaveButtonState('normal');
    }, 3000);
  }
}

// メール一覧の行ボタンのクリック処理
async function handleRowButtonClick(button, emailRow) {
  try {
    // メール情報を抽出
    const emailData = extractEmailDataFromRow(emailRow);
    if (!emailData) {
      showNotification('メール情報を取得できませんでした', 'error');
      return;
    }
    
    // 重複保存防止設定を確認
    const settings = await new Promise((resolve) => {
      chrome.storage.sync.get(['preventDuplicates'], resolve);
    });
    
    // 重複保存防止が有効で、既に保存済みのメールかチェック
    if (settings.preventDuplicates !== false && savedEmails.has(emailData.id)) {
      showNotification('このメールは既に保存済みです（重複保存防止が有効）', 'info');
      return;
    }
    
    // ボタンの状態を保存中に変更
    setRowButtonState(button, 'saving');
    
    // 添付ファイルがある場合は詳細情報を取得
    if (emailData.hasAttachments) {
      try {
        const detailedEmailData = await getDetailedEmailData(emailData.messageId);
        if (detailedEmailData) {
          emailData.attachments = detailedEmailData.attachments;
          emailData.body = detailedEmailData.body || emailData.body;
        }
      } catch (error) {
        console.warn('Failed to get detailed email data with attachments:', error);
        // 添付ファイル取得に失敗しても、メール本体は保存を続行
      }
    }
    
    // バックグラウンドスクリプトにメール保存を依頼
    console.log('Sending email data to background script:', emailData);
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'saveEmailToNotion',
        emailData: emailData
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('Response from background script:', response);
          resolve(response);
        }
      });
    });
    
    if (response.success) {
      // 保存成功時に履歴に追加
      savedEmails.add(emailData.id);
      await saveSavedEmailHistory();
      
      setRowButtonState(button, 'success');
      showNotification('メールをNotionに保存しました', 'success');
      
      // 3秒後に保存済み状態に変更
      setTimeout(() => {
        setRowButtonState(button, 'already-saved');
      }, 3000);
    } else {
      console.error('Save failed with response:', response);
      setRowButtonState(button, 'error');
      showNotification(`保存に失敗しました: ${response.error}`, 'error');
      
      // スタック情報がある場合はコンソールに出力
      if (response.stack) {
        console.error('Error stack:', response.stack);
      }
      
      // 3秒後にボタンの状態をリセット
      setTimeout(() => {
        setRowButtonState(button, 'normal');
      }, 3000);
    }
  } catch (error) {
    console.error('Error saving email from row:', error);
    setRowButtonState(button, 'error');
    showNotification(`保存に失敗しました: ${error.message}`, 'error');
    
    // 3秒後にボタンの状態をリセット
    setTimeout(() => {
      setRowButtonState(button, 'normal');
    }, 3000);
  }
}

// メール一覧の行からメール情報を抽出
function extractEmailDataFromRow(emailRow) {
  try {
    // メールIDを取得
    const emailId = emailRow.getAttribute('id') || Date.now().toString();
    
    // 件名を取得
    const subjectElement = emailRow.querySelector('.bog span') || 
                          emailRow.querySelector('.bog');
    const subject = subjectElement ? subjectElement.textContent.trim() : 'No Subject';
    
    // 送信者を取得
    const fromElement = emailRow.querySelector('.yW .bA4 .yP') ||
                       emailRow.querySelector('.yW span');
    const from = fromElement ? fromElement.textContent.trim() : 'Unknown Sender';
    
    // 日時を取得
    const dateElement = emailRow.querySelector('[title*="年"] span') ||
                       emailRow.querySelector('.xW span');
    const date = dateElement ? dateElement.textContent.trim() : new Date().toLocaleString();
    
    // メール本文のプレビューを取得
    const bodyElement = emailRow.querySelector('.y2');
    const bodyPreview = bodyElement ? bodyElement.textContent.trim() : '';
    
    // 添付ファイルの有無をチェック
    const hasAttachments = checkForAttachmentsInRow(emailRow);
    
    // メールデータを作成
    const emailData = {
      id: generateEmailId({ subject, from, date }),
      messageId: emailId,
      subject: subject,
      from: from,
      to: 'Me',
      date: date,
      body: bodyPreview || 'メール本文は詳細画面で確認してください',
      url: `${window.location.origin}${window.location.pathname}#inbox/${emailId}`,
      images: [],
      hasAttachments: hasAttachments,
      attachments: [] // 詳細画面で取得する
    };
    
    console.log('Extracted email data from row:', emailData);
    return emailData;
    
  } catch (error) {
    console.error('Error extracting email data from row:', error);
    return null;
  }
}

// メール一覧の行で添付ファイルの有無をチェック
function checkForAttachmentsInRow(emailRow) {
  try {
    console.log('Checking for attachments in email row...');
    
    // メール一覧での添付ファイル表示アイコンを探す
    const attachmentSelectors = [
      // Gmail標準の添付ファイルアイコン
      '[title*="添付ファイル"]',
      '[aria-label*="添付ファイル"]',
      '[data-tooltip*="添付ファイル"]',
      '[title*="attachment"]',
      '[aria-label*="attachment"]',
      '[data-tooltip*="attachment"]',
      
      // クリップアイコン（添付ファイルを示す）
      'img[src*="attachment"]',
      'img[src*="clip"]',
      '.aZo:not(.gmail2notion-row-button)', // Gmail添付ファイルクラス（拡張機能ボタン除外）
      '.aQy:not(.gmail2notion-row-button)', // Gmail添付ファイル関連クラス
      '.aQH:not(.gmail2notion-row-button)', // Gmail添付ファイルコンテナ
      
      // SVGアイコン
      'svg[aria-label*="添付"]',
      'svg[aria-label*="attachment"]',
      
      // メール一覧特有のアイコン
      '.yW span[title*="添付"]',
      '.yW span[aria-label*="添付"]'
    ];
    
    for (const selector of attachmentSelectors) {
      const attachmentElements = emailRow.querySelectorAll(selector);
      console.log(`Selector "${selector}" found ${attachmentElements.length} elements in row`);
      
      for (const element of attachmentElements) {
        // 拡張機能自身のボタンを除外
        if (element.classList.contains('gmail2notion-row-button') ||
            element.classList.contains('gmail2notion-save-button') ||
            element.closest('.gmail2notion-row-button') ||
            element.closest('.gmail2notion-save-button')) {
          console.log('Skipping extension button in attachment check');
          continue;
        }
        
        console.log(`Found valid attachment indicator:`, {
          tagName: element.tagName,
          className: element.className,
          title: element.title,
          'aria-label': element.getAttribute('aria-label')
        });
        return true;
      }
    }
    
    console.log('No attachment indicators found in email row');
    return false;
  } catch (error) {
    console.error('Error checking for attachments in row:', error);
    return false;
  }
}

// メール詳細画面から詳細なメール情報（添付ファイル含む）を取得
async function getDetailedEmailData(messageId) {
  try {
    console.log('Getting detailed email data for message:', messageId);
    
    // 現在メールが開かれているかチェック
    const isEmailOpen = window.location.href.includes(messageId) || 
                       document.querySelector(`[data-message-id="${messageId}"]`) ||
                       document.querySelector('.ii.gt'); // メール本文が表示されているか
    
    if (isEmailOpen) {
      console.log('Email is already open, extracting data directly');
      return extractDetailedEmailData();
    } else {
      console.log('Email is not open, attempting to open it');
      
      return new Promise((resolve, reject) => {
        // メール行をクリックして開く方法
        const emailRow = document.querySelector(`[id="${messageId}"]`) ||
                        document.querySelector(`tr[id*="${messageId}"]`) ||
                        document.querySelector(`[data-legacy-thread-id="${messageId}"]`);
        
        if (emailRow) {
          console.log('Found email row, clicking to open');
          
          // ページ変更を監視
          const observer = new MutationObserver((mutations) => {
            // メール本文が表示されたかチェック
            const emailBodyExists = document.querySelector('.ii.gt .a3s.aiL') || 
                                   document.querySelector('.ii.gt div[dir]') ||
                                   document.querySelector('.a3s.aiL') ||
                                   document.querySelector('.ii.gt');
            
            if (emailBodyExists) {
              console.log('Email content loaded after click, extracting data');
              observer.disconnect();
              
              // 少し待ってから抽出（内容の完全読み込みを待つ）
              setTimeout(() => {
                try {
                  const detailedData = extractDetailedEmailData();
                  resolve(detailedData);
                } catch (error) {
                  reject(error);
                }
              }, 1000);
            }
          });
          
          // DOM変更を監視開始
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
          
          // メール行をクリック
          emailRow.click();
          
          // タイムアウト設定（8秒）
          setTimeout(() => {
            observer.disconnect();
            console.log('Click method timeout, trying URL navigation');
            
            // フォールバック: URL変更による方法
            const emailUrl = `${window.location.origin}${window.location.pathname}#inbox/${messageId}`;
            console.log('Navigating to email URL:', emailUrl);
            window.location.href = emailUrl;
            
            // さらに待つ
            setTimeout(() => {
              try {
                const detailedData = extractDetailedEmailData();
                resolve(detailedData);
              } catch (error) {
                reject(new Error('Timeout: Could not load email content'));
              }
            }, 3000);
          }, 8000);
          
        } else {
          console.log('Email row not found, using URL navigation');
          
          // フォールバック: URL変更による方法
          const emailUrl = `${window.location.origin}${window.location.pathname}#inbox/${messageId}`;
          
          // ページ変更を監視
          const observer = new MutationObserver((mutations) => {
            // メール本文が表示されたかチェック
            const emailBodyExists = document.querySelector('.ii.gt .a3s.aiL') || 
                                   document.querySelector('.ii.gt div[dir]') ||
                                   document.querySelector('.a3s.aiL') ||
                                   document.querySelector('.ii.gt');
            
            if (emailBodyExists) {
              console.log('Email content loaded after URL navigation, extracting data');
              observer.disconnect();
              
              // 少し待ってから抽出
              setTimeout(() => {
                try {
                  const detailedData = extractDetailedEmailData();
                  resolve(detailedData);
                } catch (error) {
                  reject(error);
                }
              }, 1000);
            }
          });
          
          // DOM変更を監視開始
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
          
          // メール詳細画面に移動
          console.log('Navigating to email URL:', emailUrl);
          window.location.href = emailUrl;
          
          // タイムアウト設定（10秒）
          setTimeout(() => {
            observer.disconnect();
            console.log('URL navigation timeout, attempting to extract data anyway');
            
            try {
              const detailedData = extractDetailedEmailData();
              resolve(detailedData);
            } catch (error) {
              reject(new Error('Timeout: Could not load email content'));
            }
          }, 10000);
        }
      });
    }
    
  } catch (error) {
    console.error('Error getting detailed email data:', error);
    return {
      attachments: [],
      body: 'メール本文を取得できませんでした'
    };
  }
}

// メール詳細画面から添付ファイル情報を抽出
function extractDetailedEmailData() {
  try {
    console.log('Starting detailed email data extraction...');
    
    const emailData = {
      attachments: [],
      body: 'メール本文を取得できませんでした'
    };
    
    // メール本文を取得（優先順位で複数の方法を試行）
    console.log('Attempting to extract email body...');
    
    // 方法1: getEmailBody()関数を使用
    const bodyData = getEmailBody();
    if (bodyData && bodyData.plain && bodyData.plain.length > 10) {
      emailData.body = bodyData.plain;
      console.log(`Email body extracted successfully (method 1): ${bodyData.plain.length} characters`);
    } else {
      console.log('Method 1 failed, trying method 2...');
      
      // 方法2: extractDetailedEmailBody()関数を使用
      const detailedBody = extractDetailedEmailBody();
      if (detailedBody && detailedBody !== 'メール本文を取得できませんでした' && detailedBody.length > 10) {
        emailData.body = detailedBody;
        console.log(`Email body extracted successfully (method 2): ${detailedBody.length} characters`);
      } else {
        console.log('Method 2 failed, trying method 3...');
        
        // 方法3: 直接DOM検索
        const directBody = extractBodyDirectly();
        if (directBody && directBody.length > 10) {
          emailData.body = directBody;
          console.log(`Email body extracted successfully (method 3): ${directBody.length} characters`);
        } else {
          console.log('All methods failed to extract email body');
        }
      }
    }
    
    // 添付ファイルを取得
    const attachments = extractAttachments();
    emailData.attachments = attachments;
    
    console.log('Extracted detailed email data:', emailData);
    return emailData;
    
  } catch (error) {
    console.error('Error extracting detailed email data:', error);
    return {
      attachments: [],
      body: 'メール本文を取得できませんでした'
    };
  }
}

// 直接DOM検索でメール本文を取得する関数
function extractBodyDirectly() {
  console.log('Attempting direct DOM search for email body...');
  
  const bodySelectors = [
    // 最新のGmail構造に対応したセレクタ
    '.nH.if [role="main"] .ii.gt .a3s.aiL',
    '.nH.if [role="main"] .ii.gt div[dir]',
    '.nH.if [role="main"] .a3s.aiL',
    '.nH.if [role="main"] .ii.gt',
    
    // メッセージコンテナ
    '.nH.if .ii.gt .a3s.aiL',
    '.nH.if .ii.gt div[dir]',
    '.nH.if .a3s.aiL',
    '.nH.if .ii.gt',
    
    // 詳細表示画面での本文セレクタ
    '[role="main"] .ii.gt .a3s.aiL',
    '[role="main"] .ii.gt div[dir="ltr"]',
    '[role="main"] .ii.gt div[dir="auto"]',
    '[role="main"] .a3s.aiL',
    '[role="main"] .ii.gt',
    
    // 一般的なセレクタ
    '.ii.gt .a3s.aiL',
    '.ii.gt div[dir="ltr"]',
    '.ii.gt div[dir="auto"]',
    '.a3s.aiL',
    '.ii.gt',
    
    // より広範囲な検索
    '[role="listitem"] .a3s',
    'div[data-message-id] .a3s',
    '.Am.Al.editable',
    
    // 新しいGmail構造
    '.nH .ii.gt .a3s',
    '.nH .ii.gt div',
    '.nH .a3s',
    
    // 最後の手段
    'div[aria-label*="メッセージ"]',
    'div[aria-label*="Message"]',
    '.adn.ads div[dir]',
    '.adn.ads .a3s'
  ];
  
  for (const selector of bodySelectors) {
    console.log(`Trying direct selector: ${selector}`);
    const elements = document.querySelectorAll(selector);
    console.log(`Found ${elements.length} elements`);
    
    for (const element of elements) {
      const text = element.textContent?.trim() || '';
      console.log(`Element text preview: "${text.substring(0, 100)}..."`);
      
      if (text.length >= 10) {
        console.log(`Valid body found with direct selector: ${selector}`);
        return text;
      }
    }
  }
  
  console.log('Direct DOM search failed');
  return '';
}

// 添付ファイル情報を抽出
function extractAttachments() {
  console.log('Starting attachment extraction...');
  
  try {
    const attachments = [];
    
    // より包括的な添付ファイル要素の検索
    const attachmentSelectors = [
      // 最新のGmail添付ファイル構造
      '.nH.if .aZo',                            // メイン表示エリアの添付ファイル
      '.nH.if .aQy .aZo',                      // コンテナ内の添付ファイル
      '.nH.if .aQH .aZo',                      // 別コンテナの添付ファイル
      
      // Gmail標準の添付ファイルセレクタ
      '.aZo',
      '.aQy .aZo',
      '.aQH .aZo',
      
      // ダウンロードボタン
      '[data-tooltip*="ダウンロード"]',
      '[data-tooltip*="Download"]',
      'span[role="button"][data-tooltip*="ダウンロード"]',
      'span[role="button"][data-tooltip*="Download"]',
      
      // ファイル名表示要素
      '.aZp',
      '.aZo .aZp',
      '.nH.if .aZp',                            // メイン表示エリアのファイル名
      
      // より汎用的なセレクタ
      '[aria-label*="添付ファイル"]',
      '[aria-label*="attachment"]',
      '[title*="ダウンロード"]',
      '[title*="Download"]',
      
      // 新しい構造
      '.nH [role="button"][aria-label*="ダウンロード"]',
      '.nH [role="button"][aria-label*="Download"]',
      '.ii.gt .aZo',                            // メール本文内の添付ファイル
      '.ii.gt .aQy',                            // メール本文内のコンテナ
      
      // より広範囲な検索
      'div[data-tooltip*="添付"]',
      'div[data-tooltip*="attachment"]',
      'span[title*="添付"]',
      'span[title*="attachment"]'
    ];
    
    console.log('Searching with multiple selectors...');
    
    for (const selector of attachmentSelectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`Selector "${selector}" found ${elements.length} elements`);
      
      elements.forEach((element, index) => {
        try {
          // 拡張機能自身のボタンを除外
          if (element.classList.contains('gmail2notion-row-button') || 
              element.classList.contains('gmail2notion-save-button') ||
              element.closest('.gmail2notion-row-button') ||
              element.closest('.gmail2notion-save-button')) {
            console.log(`Skipping extension button element ${index + 1}`);
            return;
          }
          
          console.log(`Processing element ${index + 1}:`, {
            tagName: element.tagName,
            className: element.className,
            textContent: element.textContent?.trim(),
            'data-tooltip': element.getAttribute('data-tooltip'),
            title: element.title,
            'aria-label': element.getAttribute('aria-label')
          });
          
          // ファイル名を複数の方法で取得
          let fileName = '';
          
          // data-tooltipから取得
          const tooltip = element.getAttribute('data-tooltip');
          if (tooltip) {
            if (tooltip.includes('ダウンロード') || tooltip.includes('Download')) {
              fileName = tooltip.replace(/^.*?(ダウンロード|Download)\s*/, '').trim();
            } else if (tooltip.includes('.')) {
              fileName = tooltip.trim();
            }
          }
          
          // titleから取得
          if (!fileName && element.title) {
            fileName = element.title.replace(/^.*?(ダウンロード|Download)\s*/, '').trim();
          }
          
          // textContentから取得（改善されたファイル名抽出）
          if (!fileName) {
            const text = element.textContent?.trim() || '';
            console.log(`Processing text content: "${text}"`);
            
            // パターン1: "添付ファイル [filename] をプレビュー" の形式
            let match = text.match(/添付ファイル\s+(.+?)\s+をプレビュー/);
            if (match && match[1]) {
              fileName = match[1].trim();
              console.log(`Extracted filename from pattern 1: "${fileName}"`);
            }
            
            // パターン2: "[filename]632 KB" のような形式（ファイル名の後にサイズ）
            if (!fileName) {
              match = text.match(/([^\/\\\:*?"<>|]+\.[a-zA-Z0-9]+)\d+\s*[KMGT]?B/);
              if (match && match[1]) {
                fileName = match[1].trim();
                console.log(`Extracted filename from pattern 2: "${fileName}"`);
              }
            }
            
            // パターン3: 拡張子を含む最初の文字列を探す
            if (!fileName) {
              match = text.match(/([^\/\\\:*?"<>|]+\.[a-zA-Z0-9]+)/);
              if (match && match[1]) {
                // 余分な文字を除去
                fileName = match[1]
                  .replace(/をプレビュー.*$/, '')
                  .replace(/\d+\s*[KMGT]?B.*$/, '')
                  .replace(/ウィルスを.*$/, '')
                  .replace(/ダウンロード.*$/, '')
                  .replace(/ドライブに.*$/, '')
                  .trim();
                console.log(`Extracted filename from pattern 3: "${fileName}"`);
              }
            }
            
            // パターン4: 一般的なファイル名パターンをさらに詳細に
            if (!fileName && text.includes('.')) {
              const words = text.split(/\s+/);
              for (const word of words) {
                if (word.includes('.') && 
                    word.match(/\.[a-zA-Z0-9]+$/) && 
                    !word.includes('をプレビュー') &&
                    !word.includes('ダウンロード') &&
                    word.length > 3) {
                  fileName = word.trim();
                  console.log(`Extracted filename from pattern 4: "${fileName}"`);
                  break;
                }
              }
            }
            
            // 最後の手段：元のロジック
            if (!fileName && (text.includes('.') || text.length > 3)) {
              fileName = text.replace(/^.*?(ダウンロード|Download)\s*/, '').trim();
            }
          }
          
          // 親要素や子要素からファイル名を探す
          if (!fileName) {
            const parent = element.closest('.aZo') || element.closest('.aQy');
            if (parent) {
              const fileNameSpan = parent.querySelector('.aZp') || 
                                  parent.querySelector('span[title]') ||
                                  parent.querySelector('span:not([role="button"])');
              if (fileNameSpan) {
                fileName = fileNameSpan.textContent?.trim() || fileNameSpan.title || '';
              }
            }
          }
          
          console.log(`Extracted fileName: "${fileName}"`);
          
          // ファイル名のクリーンアップ
          if (fileName) {
            // 不要な文字列を除去
            fileName = fileName
              .replace(/^添付ファイル\s+/, '')
              .replace(/\s+をプレビュー.*$/, '')
              .replace(/\s*\d+\s*[KMGT]?B.*$/, '')
              .replace(/\s*ウィルスを.*$/, '')
              .replace(/\s*ダウンロード.*$/, '')
              .replace(/\s*ドライブに.*$/, '')
              .replace(/\s*で編集.*$/, '')
              .replace(/\s+$/, '')
              .trim();
            
            console.log(`Cleaned fileName: "${fileName}"`);
          }
          
          // ファイル名が有効かチェック（改善されたバリデーション）
          const isValidFileName = fileName && 
                                 fileName.length >= 3 && 
                                 fileName.includes('.') &&
                                 fileName.match(/^[^\/\\\:*?"<>|]+\.[a-zA-Z0-9]+$/) &&
                                 !fileName.includes('をプレビュー') &&
                                 !fileName.includes('ダウンロード') &&
                                 !fileName.includes('ドライブに');
          
          if (isValidFileName) {
            // ファイルサイズを取得
            let fileSize = 'Unknown';
            const parent = element.closest('.aZo') || element.closest('.aQy') || element.closest('.aQH');
            if (parent) {
              // サイズ表示要素を探す
              const sizeElement = parent.querySelector('.aZq') || 
                                 parent.querySelector('.aZr') ||
                                 parent.querySelector('[title*="KB"]') ||
                                 parent.querySelector('[title*="MB"]') ||
                                 parent.querySelector('[title*="GB"]');
              if (sizeElement) {
                fileSize = sizeElement.textContent?.trim() || sizeElement.title || 'Unknown';
              }
              
              // 親要素のテキストからサイズを抽出
              if (fileSize === 'Unknown') {
                const parentText = parent.textContent || '';
                const sizeMatch = parentText.match(/(\d+(?:\.\d+)?\s*(?:KB|MB|GB|bytes))/i);
                if (sizeMatch) {
                  fileSize = sizeMatch[1];
                }
              }
            }
            
            // ダウンロードリンクを取得
            const downloadLink = element.getAttribute('href') ||
                                element.closest('a')?.getAttribute('href') ||
                                element.querySelector('a')?.getAttribute('href') ||
                                '';
            
            const mimeType = getFileTypeFromName(fileName);
            const attachmentData = {
              fileName: fileName,
              downloadUrl: downloadLink,
              size: fileSize,
              type: mimeType,
              fileType: mimeType,
              isImage: mimeType.startsWith('image/'),
              isPdf: mimeType === 'application/pdf'
            };
            
            console.log(`Created attachment data:`, attachmentData);
            
            // 重複チェック
            if (!attachments.some(att => att.fileName === attachmentData.fileName)) {
              console.log('Valid attachment found:', attachmentData);
              attachments.push(attachmentData);
            } else {
              console.log('Duplicate attachment skipped:', fileName);
            }
          } else {
            console.log(`Invalid fileName: "${fileName}" - skipping`);
          }
          
        } catch (error) {
          console.error('Error processing attachment element:', error);
        }
      });
    }
    
    console.log(`Final result: ${attachments.length} attachments extracted`, attachments);
    return attachments;
    
  } catch (error) {
    console.error('Error extracting attachments:', error);
    return [];
  }
}

// ファイル名からMIMEタイプを取得
function getFileTypeFromName(fileName) {
  try {
    if (!fileName || typeof fileName !== 'string') {
      return 'application/octet-stream';
    }
    
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    const mimeTypes = {
      // ドキュメント
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'txt': 'text/plain',
      'rtf': 'application/rtf',
      
      // 画像
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'tiff': 'image/tiff',
      'tif': 'image/tiff',
      
      // 音声
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'aac': 'audio/aac',
      'm4a': 'audio/mp4',
      
      // 動画
      'mp4': 'video/mp4',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
      'wmv': 'video/x-ms-wmv',
      'flv': 'video/x-flv',
      'webm': 'video/webm',
      
      // アーカイブ
      'zip': 'application/zip',
      'rar': 'application/vnd.rar',
      '7z': 'application/x-7z-compressed',
      'tar': 'application/x-tar',
      'gz': 'application/gzip',
      
      // その他
      'json': 'application/json',
      'xml': 'application/xml',
      'csv': 'text/csv',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'text/javascript'
    };
    
    return mimeTypes[extension] || 'application/octet-stream';
  } catch (error) {
    console.error('Error determining file type:', error);
    return 'application/octet-stream';
  }
}

// 詳細なメール本文を取得
function extractDetailedEmailBody() {
  try {
    // メール本文の要素を探す
    const bodyElements = document.querySelectorAll('[role="listitem"] .ii.gt') ||
                        document.querySelectorAll('.ii.gt') ||
                        document.querySelectorAll('[aria-label*="メッセージ本文"]');
    
    let fullBody = '';
    
    bodyElements.forEach(element => {
      const bodyText = element.textContent || element.innerText || '';
      if (bodyText.trim()) {
        fullBody += bodyText.trim() + '\n\n';
      }
    });
    
    return fullBody.trim() || 'メール本文を取得できませんでした';
    
  } catch (error) {
    console.error('Error extracting detailed email body:', error);
    return 'メール本文を取得できませんでした';
  }
}

// メール一覧の行ボタンの保存済み状態をチェック
async function checkRowButtonSavedStatus(button, emailRow) {
  try {
    // 重複保存防止設定を確認
    const settings = await new Promise((resolve) => {
      chrome.storage.sync.get(['preventDuplicates'], resolve);
    });
    
    // 重複保存防止が有効な場合のみ保存済み状態を表示
    if (settings.preventDuplicates !== false) {
      const emailData = extractEmailDataFromRow(emailRow);
      if (emailData && savedEmails.has(emailData.id)) {
        setRowButtonState(button, 'already-saved');
      }
    }
  } catch (error) {
    console.error('Error checking row button saved status:', error);
  }
}

// メール一覧の行ボタンの状態を変更
function setRowButtonState(button, state) {
  if (!button) {
    console.log('Cannot set row button state - no button exists');
    return;
  }
  
  const iconSvg = button.querySelector('svg');
  
  switch (state) {
    case 'saving':
      button.style.backgroundColor = '#1a73e8';
      button.style.color = 'white';
      button.style.pointerEvents = 'none';
      button.setAttribute('data-tooltip', '保存中...');
      button.setAttribute('aria-label', '保存中...');
      if (iconSvg) {
        iconSvg.style.animation = 'spin 1s linear infinite';
        // スピンアニメーションのCSSを追加
        if (!document.querySelector('#gmail2notion-spin-style')) {
          const style = document.createElement('style');
          style.id = 'gmail2notion-spin-style';
          style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
          document.head.appendChild(style);
        }
      }
      break;
      
    case 'success':
      button.style.backgroundColor = '#34a853';
      button.style.color = 'white';
      button.setAttribute('data-tooltip', '保存完了');
      button.setAttribute('aria-label', '保存完了');
      if (iconSvg) iconSvg.style.animation = 'none';
      break;
      
    case 'error':
      button.style.backgroundColor = '#ea4335';
      button.style.color = 'white';
      button.setAttribute('data-tooltip', '保存失敗');
      button.setAttribute('aria-label', '保存失敗');
      if (iconSvg) iconSvg.style.animation = 'none';
      break;
      
    case 'already-saved':
      button.style.setProperty('background-color', '#9aa0a6', 'important');
      button.style.setProperty('color', 'white', 'important');
      button.setAttribute('data-tooltip', '保存済み');
      button.setAttribute('aria-label', '保存済み');
      button.style.pointerEvents = 'none';
      button.style.cursor = 'default';
      if (iconSvg) iconSvg.style.animation = 'none';
      break;
      
    case 'normal':
    default:
      button.style.setProperty('background-color', 'transparent', 'important');
      button.style.setProperty('color', '#5f6368', 'important');
      button.setAttribute('data-tooltip', 'Notionへ保存');
      button.setAttribute('aria-label', 'Notionへ保存');
      button.style.pointerEvents = 'auto';
      button.style.cursor = 'pointer';
      if (iconSvg) iconSvg.style.animation = 'none';
      break;
  }
}

// 保存ボタンの状態を変更
function setSaveButtonState(state) {
  if (!saveButton) {
    console.log('Cannot set button state - no button exists');
    return;
  }
  
  console.log('Setting button state to:', state);
  const iconSvg = saveButton.querySelector('svg');
  
  switch (state) {
    case 'saving':
      saveButton.style.backgroundColor = '#1a73e8';
      saveButton.style.color = 'white';
      saveButton.style.pointerEvents = 'none';
      saveButton.setAttribute('data-tooltip', '保存中...');
      saveButton.setAttribute('aria-label', '保存中...');
      if (iconSvg) {
        iconSvg.style.animation = 'spin 1s linear infinite';
        // スピンアニメーションのCSSを追加
        if (!document.querySelector('#gmail2notion-spin-style')) {
          const style = document.createElement('style');
          style.id = 'gmail2notion-spin-style';
          style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
          document.head.appendChild(style);
        }
      }
      break;
      
    case 'success':
      saveButton.style.backgroundColor = '#34a853';
      saveButton.style.color = 'white';
      saveButton.setAttribute('data-tooltip', '保存完了');
      saveButton.setAttribute('aria-label', '保存完了');
      if (iconSvg) iconSvg.style.animation = 'none';
      break;
      
    case 'error':
      saveButton.style.backgroundColor = '#ea4335';
      saveButton.style.color = 'white';
      saveButton.setAttribute('data-tooltip', '保存失敗');
      saveButton.setAttribute('aria-label', '保存失敗');
      if (iconSvg) iconSvg.style.animation = 'none';
      break;
      
    case 'already-saved':
      saveButton.style.setProperty('background-color', '#9aa0a6', 'important');
      saveButton.style.setProperty('color', 'white', 'important');
      saveButton.setAttribute('data-tooltip', '保存済み');
      saveButton.setAttribute('aria-label', '保存済み');
      saveButton.style.pointerEvents = 'none';
      saveButton.style.cursor = 'default';
      if (iconSvg) iconSvg.style.animation = 'none';
      console.log('Button styled as already-saved');
      break;
      
    case 'normal':
    default:
      saveButton.style.setProperty('background-color', 'transparent', 'important');
      saveButton.style.setProperty('color', '#5f6368', 'important');
      saveButton.setAttribute('data-tooltip', 'Notionへ保存');
      saveButton.setAttribute('aria-label', 'Notionへ保存');
      saveButton.style.pointerEvents = 'auto';
      saveButton.style.cursor = 'pointer';
      if (iconSvg) iconSvg.style.animation = 'none';
      console.log('Button styled as normal');
      break;
  }
}

// メール情報を抽出
async function extractEmailData(messageId = null) {
  try {
    const emailData = {
      messageId: messageId,
      subject: getEmailSubject(),
      from: getEmailFrom(),
      to: getEmailTo(),
      date: getEmailDate(),
      body: getEmailBody(),
      images: getEmailImages(),
      url: getEmailUrl()
    };
    
    // メールのユニークIDを生成
    emailData.id = generateEmailId(emailData);
    
    currentEmailData = emailData;
    console.log('Email data extracted:', emailData);
    
    // 保存済みメールかチェックしてボタンの状態を更新
    await checkEmailSavedStatus();
  } catch (error) {
    console.error('Error extracting email data:', error);
    currentEmailData = null;
  }
}

// メールの保存状態をチェック
async function checkEmailSavedStatus() {
  if (!currentEmailData || !saveButton) {
    console.log('Cannot check email status - missing data or button');
    return;
  }
  
  try {
    console.log('Checking email saved status for ID:', currentEmailData.id);
    console.log('Saved emails set:', Array.from(savedEmails));
    
    // 重複保存防止設定を確認
    const settings = await new Promise((resolve) => {
      chrome.storage.sync.get(['preventDuplicates'], resolve);
    });
    
    // 重複保存防止が有効で、既に保存済みの場合
    if (settings.preventDuplicates !== false && savedEmails.has(currentEmailData.id)) {
      console.log('Email already saved and duplicate prevention enabled, setting button to already-saved state');
      setSaveButtonState('already-saved');
    } else {
      console.log('Email not saved yet or duplicate prevention disabled, setting button to normal state');
      setSaveButtonState('normal');
    }
  } catch (error) {
    console.error('Error checking email saved status:', error);
    setSaveButtonState('normal');
  }
}

// メールの件名を取得（プレビュー画面対応を追加）
function getEmailSubject() {
  const selectors = [
    // プレビュー画面のセレクタ（新規追加）
    '[role="complementary"] h2[data-legacy-thread-id]',
    '[role="complementary"] .hP',
    '[role="complementary"] h2',
    '.aeJ h2[data-legacy-thread-id]',
    '.aeJ .hP',
    '.aeJ h2',
    
    // aria-label属性を活用したセレクタ（記事の知見）
    '[aria-label*="件名"]',
    '[aria-label*="Subject"]',
    
    // 従来のセレクタ（優先度順）
    'h2[data-legacy-thread-id]',
    '.hP',
    '[data-thread-perm-id] h2',
    '.bog',
    
    // 追加のセレクタ
    '[role="main"] h2',
    'h2[tabindex]',
    '.ii.gt h2'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const subject = element.textContent.trim();
      if (subject && subject.length > 0) {
        console.log(`Subject found with selector: ${selector}`);
        return subject;
      }
    }
  }
  
  console.log('Subject not found with any selector');
  return '件名を取得できませんでした';
}

// 送信者を取得（プレビュー画面対応を追加）
function getEmailFrom() {
  const selectors = [
    // プレビュー画面のセレクタ（新規追加）
    '[role="complementary"] .go .g2 .gD',
    '[role="complementary"] .gD[email]',
    '[role="complementary"] [email]',
    '.aeJ .go .g2 .gD',
    '.aeJ .gD[email]',
    '.aeJ [email]',
    
    // aria-label属性を活用したセレクタ（記事の知見）
    '[aria-label*="送信者"]',
    '[aria-label*="From"]',
    '[aria-label*="差出人"]',
    
    // email属性を持つ要素
    '.go .g2 .gD',
    '.gD[email]',
    '.go .g2 span[email]',
    '.h7N .g2 .gD',
    
    // 追加のセレクタ
    '[email]',
    '.go .gD',
    '.h7N .gD'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const email = element.getAttribute('email') || element.textContent.trim();
      if (email && email.length > 0) {
        console.log(`From found with selector: ${selector}`);
        return email;
      }
    }
  }
  
  console.log('From not found with any selector');
  return '送信者を取得できませんでした';
}

// 受信者を取得（記事の知見を活用して改善）
function getEmailTo() {
  const selectors = [
    // aria-label属性を活用したセレクタ（記事の知見）
    '[aria-label*="受信者"]',
    '[aria-label*="To"]',
    '[aria-label*="宛先"]',
    // 従来のセレクタ
    '.hb .g2 .gD',
    '.g2 .gD[email]',
    '.hb span[email]',
    // 追加のセレクタ
    '.hb .gD',
    '.hb [email]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const email = element.getAttribute('email') || element.textContent.trim();
      if (email && email.length > 0) {
        console.log(`To found with selector: ${selector}`);
        return email;
      }
    }
  }
  
  console.log('To not found with any selector');
  return '受信者を取得できませんでした';
}

// 送信日時を取得（記事の知見を活用して改善）
function getEmailDate() {
  const selectors = [
    // aria-label属性を活用したセレクタ（記事の知見）
    '[aria-label*="送信日時"]',
    '[aria-label*="Date"]',
    '[aria-label*="日付"]',
    '[aria-label*="時刻"]',
    // title属性を持つ要素
    '[title*="年"]',
    '[title*="月"]',
    '[data-tooltip*="年"]',
    // 従来のセレクタ
    '.g3 .g3',
    '.gH .g3',
    '[data-tooltip*="年"] .g3',
    // 追加のセレクタ
    '.g3',
    '.gH',
    'span[title]'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const date = element.getAttribute('title') || 
                   element.getAttribute('aria-label') ||
                   element.textContent.trim();
      if (date && date.length > 0) {
        console.log(`Date found with selector: ${selector}`);
        return date;
      }
    }
  }
  
  console.log('Date not found with any selector');
  return '送信日時を取得できませんでした';
}

// メール本文を取得（プレビュー画面対応を追加）
function getEmailBody() {
  console.log('Starting email body extraction...');
  
  const selectors = [
    // より具体的なメール本文セレクタ
    '.ii.gt .a3s.aiL',
    '.ii.gt div[dir="ltr"] .a3s.aiL',
    '.ii.gt div[dir="auto"] .a3s.aiL',
    '.ii.gt .a3s',
    'div[data-message-id] .a3s.aiL',
    'div[data-message-id] .a3s',
    
    // メッセージコンテナ内の本文
    '.ii.gt div.a3s',
    '.ii.gt .Am.Al.editable',
    '.ii.gt .Am',
    
    // プレビュー画面のセレクタ（新規追加）
    '[role="complementary"] .ii.gt .a3s.aiL',
    '[role="complementary"] .a3s.aiL',
    '[role="complementary"] .ii.gt',
    '.aeJ .ii.gt .a3s.aiL',
    '.aeJ .a3s.aiL',
    '.aeJ .ii.gt',
    
    // aria-label属性を活用したセレクタ（記事の知見）
    '[aria-label*="メッセージ本文"]',
    '[aria-label*="メール本文"]',
    '[aria-label*="本文"]',
    '[aria-label*="Message body"]',
    
    // 従来のセレクタ（優先度順）
    '.ii.gt div[dir="ltr"]',
    '.a3s.aiL',
    '.ii.gt',
    
    // 追加のセレクタ
    '[role="listitem"] .a3s',
    '.ii .a3s',
    'div[dir="ltr"]'
  ];
  
  for (const selector of selectors) {
    console.log(`Trying selector: ${selector}`);
    const elements = document.querySelectorAll(selector);
    console.log(`Found ${elements.length} elements with selector: ${selector}`);
    
    for (const element of elements) {
      const plainText = element.textContent.trim();
      const htmlContent = element.innerHTML;
      
      console.log(`Element content preview: "${plainText.substring(0, 100)}..."`);
      
      // 本文として有効な内容かチェック（最小10文字以上）
      if (plainText && plainText.length >= 10) {
        console.log(`Valid email body found with selector: ${selector}`);
        console.log(`Content length: ${plainText.length} characters`);
        
        // HTMLコンテンツが意味のある内容を含んでいるかチェック
        const hasHtmlContent = htmlContent && 
                             htmlContent !== plainText && 
                             (htmlContent.includes('<') || htmlContent.includes('&'));
        
        console.log(`Has HTML content: ${hasHtmlContent}`);
        
        return {
          plain: plainText,
          html: hasHtmlContent ? cleanGmailHtml(htmlContent) : null,
          hasHtml: hasHtmlContent
        };
      } else {
        console.log(`Content too short (${plainText.length} chars), trying next element`);
      }
    }
  }
  
  console.log('Email body not found with any selector');
  return {
    plain: 'メール本文を取得できませんでした',
    html: null,
    hasHtml: false
  };
}

// Gmail固有のHTMLを清理する関数（簡易版）
function cleanGmailHtml(html) {
  if (!html) return '';
  
  // Gmail固有のクラスやスタイルを除去
  let cleaned = html
    // Gmail固有のクラスを除去
    .replace(/class="[^"]*"/g, '')
    // Gmail固有のdata属性を除去
    .replace(/data-[^=]*="[^"]*"/g, '')
    // 空のdivやspanを除去
    .replace(/<(div|span)(\s[^>]*)?>(\s*)<\/\1>/g, '')
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

// メール内の画像を取得（記事の知見を活用して改善）
function getEmailImages() {
  const images = [];
  const selectors = [
    // aria-label属性を活用したセレクタ（記事の知見）
    '[aria-label*="メッセージ本文"] img',
    '[aria-label*="メール本文"] img',
    '[aria-label*="本文"] img',
    '[aria-label*="Message body"] img',
    // 従来のセレクタ
    '.ii.gt .a3s.aiL img',
    '.ii.gt div[dir="ltr"] img',
    '.a3s.aiL img',
    '.ii.gt img',
    // 追加のセレクタ
    '[role="listitem"] img',
    '.gmail_quote img',
    '.gmail_default img',
    // より広範囲のセレクタ
    '[role="main"] img',
    'img[src*="googleusercontent.com"]',
    'img[src*="mail.google.com"]'
  ];
  
  console.log('Starting image extraction...');
  
  for (const selector of selectors) {
    const imgElements = document.querySelectorAll(selector);
    console.log(`Found ${imgElements.length} img elements with selector: ${selector}`);
    
    imgElements.forEach((img, index) => {
      console.log(`Processing image ${index + 1} from selector ${selector}:`, {
        src: img.src,
        'data-src': img.getAttribute('data-src'),
        'data-original-src': img.getAttribute('data-original-src'),
        'data-image-url': img.getAttribute('data-image-url'),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      });
      
      // 画像のソースURLを複数の方法で取得を試行
      let src = img.src || 
                img.getAttribute('data-src') || 
                img.getAttribute('data-original-src') ||
                img.getAttribute('data-image-url') ||
                img.getAttribute('src');
      
      // Gmail特有のURLパターンを処理
      if (src) {
        // data:image/ で始まるbase64画像は除外
        if (src.startsWith('data:image/')) {
          console.log('Skipping base64 image');
          return;
        }
        
        // Gmail内部のプロキシURLを処理
        if (src.includes('googleusercontent.com') || src.includes('mail.google.com')) {
          // すでに有効なプロキシURL
          console.log('Valid proxy URL found:', src);
        } else if (src.startsWith('https://ci') && src.includes('googleusercontent.com')) {
          // Gmail内部画像の場合
          console.log('Gmail internal image URL found:', src);
        } else if (!src.startsWith('http')) {
          // 相対URLまたは無効なURLの場合はスキップ
          console.log('Invalid or relative URL, skipping:', src);
          return;
        }
        
        // URL検証
        try {
          new URL(src); // URLの妥当性をチェック
        } catch (error) {
          console.log('Invalid URL format, skipping:', src);
          return;
        }
        
        const imageData = {
          url: src,
          alt: img.alt || '',
          title: img.title || '',
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0
        };
        
        // 重複を避けるため、同じURLの画像は1つだけ追加
        if (!images.some(existingImg => existingImg.url === imageData.url)) {
          console.log('Adding valid image:', imageData);
          images.push(imageData);
        } else {
          console.log('Duplicate image URL, skipping:', src);
        }
      } else {
        console.log('No valid src found for image element');
      }
    });
  }
  
  console.log(`Final result: Found ${images.length} valid images in email:`, images);
  return images;
}

// メールのURLを取得
function getEmailUrl() {
  return window.location.href;
}

// 保存ボタンを削除
function removeSaveButton() {
  if (saveButton) {
    try {
      saveButton.remove();
    } catch (error) {
      console.log('Button already removed or not in DOM');
    }
    saveButton = null;
  }
}

// 通知を表示
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `gmail2notion-notification ${type}`;
  notification.textContent = message;
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 16px;
    border-radius: 4px;
    color: white;
    font-size: 14px;
    font-family: 'Google Sans', Roboto, Arial, sans-serif;
    z-index: 10000;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    transition: all 0.3s ease;
  `;
  
  switch (type) {
    case 'success':
      notification.style.backgroundColor = '#34a853';
      break;
    case 'error':
      notification.style.backgroundColor = '#ea4335';
      break;
    default:
      notification.style.backgroundColor = '#1a73e8';
  }
  
  document.body.appendChild(notification);
  
  // 3秒後に削除
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// DOMが読み込まれたら初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
} 