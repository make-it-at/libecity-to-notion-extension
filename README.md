# LibeCity Chat to Notion Chrome Extension

会員制Webサイト（libecity.com等）から手動選択したコンテンツを自動取得し、Notion データベースに転記するChrome拡張機能

## 🚀 機能概要

- **ワンクリック保存**: libecity.comの投稿をNotionに即座に転記
- **スマート選択**: 投稿内容の自動認識と範囲選択
- **リッチコンテンツ対応**: 画像、YouTube リンク、@ALL タグの完全サポート
- **自動データベース作成**: 専用スキーマでNotionデータベースを自動生成

## 📁 プロジェクト構成

```
LCchat2notion/
├── src/
│   ├── background/          # Service Worker
│   ├── content/            # Content Scripts
│   ├── popup/              # 拡張機能ポップアップUI
│   ├── options/            # 設定画面
│   └── utils/              # 共通ユーティリティ
├── assets/
│   ├── icons/              # 拡張機能アイコン
│   └── images/             # UI用画像
├── docs/                   # ドキュメント
├── tests/                  # テストファイル
├── manifest.json           # Chrome拡張機能設定
└── 要求仕様書.md           # 詳細仕様書
```

## 🛠 技術スタック

- **Chrome Extension Manifest V3**
- **Notion API v1**
- **JavaScript ES2022**
- **HTML5 / CSS3**
- **Firebase Authentication**

## 📋 開発フェーズ

### Phase 1: MVP（4週間）
- [x] 要求仕様書作成
- [ ] 基本的なコンテンツ選択機能
- [ ] テキスト抽出とNotion転記
- [ ] 基本UI実装

### Phase 2: 拡張機能（3週間）
- [ ] 画像処理機能
- [ ] 自動範囲判定
- [ ] 設定画面実装

### Phase 3: 最適化（2週間）
- [ ] パフォーマンス改善
- [ ] エラーハンドリング強化
- [ ] ユーザビリティ向上

## 🔧 開発環境セットアップ

### 必要な準備
1. **Notion API キー**の取得
2. **Chrome開発者モード**の有効化
3. **libecity.com**のアカウント

### インストール手順
```bash
# リポジトリのクローン
git clone [リポジトリURL]
cd LCchat2notion

# 開発用サーバーの起動（必要に応じて）
# 今後の開発で追加予定
```

### Chrome拡張機能の読み込み
1. Chrome の `chrome://extensions/` にアクセス
2. 「開発者モード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. プロジェクトフォルダを選択

## 📖 使用方法

### 初回設定
1. 拡張機能アイコンをクリック
2. 「設定」からNotion API キーを入力
3. データベースを選択または新規作成

### 日常使用
1. libecity.com で保存したい投稿を表示
2. 拡張機能アイコンをクリック
3. 「Notionに保存」ボタンをクリック
4. 保存完了通知とNotionページリンクを確認

## 🎯 対応サイト

- **libecity.com** (メイン対応)
- その他会員制サイト（今後対応予定）

## 🔒 セキュリティ・プライバシー

- Notion APIキーの暗号化保存
- 取得データの一時的保存のみ
- 既存セッションの活用（新規ログイン不要）

## 🐛 トラブルシューティング

詳細なトラブルシューティングは[要求仕様書.md](./要求仕様書.md)を参照してください。

## 📄 ライセンス

MIT License

## 🤝 コントリビューション

1. フォークしてください
2. フィーチャーブランチを作成してください (`git checkout -b feature/AmazingFeature`)
3. コミットしてください (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュしてください (`git push origin feature/AmazingFeature`)
5. プルリクエストを開いてください

---

**開発状況**: Phase 1 - 要求仕様書完成 ✅ 