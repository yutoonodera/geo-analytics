# Customer Geocoding & Spatial Analysis Platform

## 概要

本リポジトリは、  
**住所を含む CSV データを非同期でジオコーディングし、空間分析・可視化まで行うための Web アプリケーション**です。

- 大量の住所データを安全に処理する
- 外部ジオコーディング API の遅延・失敗を UI に影響させない
- GIS / 空間分析（クラスタ・メッシュ・高密度エリア抽出）を即座に可視化する

という目的で設計されています。

---

## 主な機能

### CSV アップロード

- `address / birth / sex` を含む CSV をアップロード
- 1ユーザーあたり **月200件まで**の制限
- 制限は **クライアント + サーバー両方で強制**

### 非同期ジオコーディング処理

- アップロードされた行は即時処理せず、**ジョブキューに登録**
- Worker が 1 件ずつ処理
- 外部 API（Nominatim）のレート制限に配慮

### 空間可視化・分析

- Leaflet による地図表示
- Marker Cluster（性別 × 年代で色分け）
- H3 メッシュによる密度可視化
- 上位 N 件の高密度エリア（ポリゴン）抽出

---

## 全体アーキテクチャ

```text
[ Browser ]
    |
    | CSV Upload
    v
[ Nuxt 3 (API) ]
    |
    | INSERT
    v
[ customer_jobs ]  <-- キュー
    |
    | Worker (polling)
    v
[ Geocoding API (Nominatim) ]
    |
    | 成功
    v
[ customer ]
```

## データモデル

本システムでは **「未処理データ」と「正規化済みデータ」を明確に分離**しています。

---

### customer_jobs（ジョブキュー）

CSV アップロード直後のデータは、必ずこのテーブルに格納されます。  
外部 API を呼び出す前段の **キュー兼監査ログ** の役割を持ちます。

| column       | type        | description |
|--------------|-------------|-------------|
| id           | bigint      | ジョブID |
| user_id      | uuid        | ユーザーID |
| address      | text        | 入力された住所 |
| birth        | date        | 生年月日（任意） |
| sex          | text        | 性別（male / female / null） |
| status       | text        | queued / processing / done / failed |
| attempts     | integer     | 処理試行回数 |
| last_error   | text        | 失敗時のエラー内容 |
| created_at   | timestamptz | 作成日時 |
| updated_at   | timestamptz | 更新日時 |

#### 設計意図

- 外部 API 失敗を前提とした設計
- 再処理・失敗分析が可能
- 処理途中状態を UI に反映できる

---

### customer（正規化済みデータ）

ジオコーディングに成功したデータのみが格納されます。  
**分析・可視化は必ずこのテーブルのみを参照**します。

| column  | type        | description |
|--------|-------------|-------------|
| id     | bigint      | 顧客ID |
| user_id | uuid       | ユーザーID |
| address | text       | 正規化された住所 |
| birth | date        | 生年月日 |
| sex   | text        | 性別 |
| ido   | double      | 緯度 |
| keido | double      | 経度 |
| created_at | timestamptz | 作成日時 |

#### 設計意図

- 不正・失敗データを完全に排除
- 空間分析の前提をクリーンに保つ
- customer_jobs との責務分離

---

## ジョブ処理フロー

```text
CSV Upload
   ↓
customer_jobs (queued)
   ↓
customer_jobs (processing)
   ↓
┌───────────────┐
│ Geocoding API │
└───────────────┘
   ↓
成功 → customer に INSERT → job: done
失敗 → job: failed + error
```
