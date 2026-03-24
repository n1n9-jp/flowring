# Flowring

[English](./README.md)

方向付きアーク、矢印、ランク付きラベルによるSVGフロー可視化ライブラリ。任意の地図ライブラリや2D座標空間で動作します。

![Flowring](https://raw.githubusercontent.com/vuski/flowring/main/image/flowring.png)

**[ライブデモ](https://vuski.github.io/flowring)**

## インストール

```bash
npm install flowring
```

## クイックスタート

```js
import { flowring } from "flowring";

const ring = flowring(document.getElementById("container"), {
  topN: 12,
  direction: "inbound",
  subtitle: "Net Migration Rank",
});

ring.update(
  { id: "seoul", label: "Seoul", coord: [400, 300] },
  [
    { id: "busan", label: "Busan", coord: [700, 400], value: 1200 },
    { id: "daegu", label: "Daegu", coord: [600, 350], value: 800 },
    { id: "incheon", label: "Incheon", coord: [350, 250], value: 650 },
  ]
);
```

## デモ

![デモ — ホバー操作による点滅アニメーションと地図塗りつぶしの同期](https://raw.githubusercontent.com/vuski/flowring/main/image/moving.gif)

## 全オプション例

```js
import { flowring } from "flowring";

const ring = flowring(document.getElementById("container"), {
  // データ表示
  topN: 10,
  total: 50000,
  direction: "outbound",
  subtitle: "Outbound Transfer Rank",

  // 外観
  radiusFraction: 0.25,
  arcThickness: 16,
  colors: {
    arc: "rgb(30, 120, 220)",
    stroke: "white",
    buffer: "black",
    dim: "#aaaaaa",
    arcByRank: (rank) => (rank < 3 ? "rgb(255, 80, 40)" : "rgb(30, 120, 220)"),
  },

  // アニメーション
  animate: true,
  blinkCount: 3,
  blinkInterval: 150,

  // 投影変換（地図使用時）
  projection: (coord) => {
    const p = map.project(coord);
    return { x: p.x, y: p.y };
  },

  // コールバック
  formatLabel: (datum, rank) => `#${rank} ${datum.label} (${datum.value.toLocaleString()})`,
  formatTitle: (source, subtitle) => [source.label, subtitle],
  onRender: (time) => console.log("rendered at", time),
  onBlink: (opacities) => {
    // 外部要素の点滅状態を同期
    opacities.forEach((opacity, i) => {
      document.querySelector(`.rank-${i}`)?.style.setProperty("opacity", String(opacity));
    });
  },
});

// source: 中心となる地域
const source = { id: "seoul", label: "Seoul", coord: [126.978, 37.566] };

// data: ランク付けされた対象地域（配列順 = ランク順）
const data = [
  { id: "suwon", label: "Suwon", coord: [127.0, 37.27], value: 1200 },
  { id: "incheon", label: "Incheon", coord: [126.7, 37.45], value: 980 },
  { id: "goyang", label: "Goyang", coord: [126.83, 37.65], value: 750 },
  // ...topN件まで
];

ring.update(source, data);
map.on("move", () => ring.render());
```

## ユースケース

### Vanilla JS + スクリーン座標

地図不要。座標は `[x, y]` のスクリーンピクセルです。

```js
import { flowring } from "flowring";

const ring = flowring(document.getElementById("diagram"), {
  topN: 8,
  direction: "outbound",
  subtitle: "Transfer Volume",
  formatLabel: (d, rank) => `${d.label}: ${d.value}%`,
});

ring.update(
  { id: "hq", label: "Headquarters", coord: [400, 300] },
  [
    { id: "east", label: "East Region", coord: [700, 200], value: 340 },
    { id: "west", label: "West Region", coord: [100, 200], value: 280 },
    { id: "south", label: "South Region", coord: [400, 550], value: 150 },
  ]
);
```

### Vanilla JS + MapLibre

`projection` コールバックを指定して `[lon, lat]` をスクリーンピクセルに変換します。

```js
import { flowring } from "flowring";

// map: MapLibre GL のインスタンス
// overlayDiv: 地図上に配置されたdiv要素
const ring = flowring(overlayDiv, {
  projection: (coord) => {
    const p = map.project(coord);
    return { x: p.x, y: p.y };
  },
  direction: "inbound",
  animate: true,
  blinkCount: 3,
});

// 地図移動時に再描画
map.on("move", () => ring.render());

// ホバー時にデータを更新
ring.update(
  { id: "seoul", label: "Seoul", coord: [126.978, 37.566] },
  [
    { id: "suwon", label: "Suwon", coord: [127.0, 37.27], value: 1200 },
    { id: "incheon", label: "Incheon", coord: [126.7, 37.45], value: 980 },
  ]
);

// クリーンアップ
ring.destroy();
```

### React + MapLibre

`FlowringIndicator` コンポーネントと `useFlowring` フックを使用します。

```tsx
import { FlowringIndicator, useFlowring } from "flowring/react";

function MyMap() {
  const mapRef = useRef(null);
  const { blinkTime, resetBlink } = useFlowring();

  // selectedRegion: アプリの状態から取得（例：ホバー時）
  // allData: データソースからの全ランクデータ配列
  // filteredData: 表示する上位N件

  useEffect(() => {
    resetBlink();
  }, [selectedRegion, resetBlink]);

  return (
    <Map ref={mapRef}>
      {selectedRegion && (
        <FlowringIndicator
          mapRef={mapRef}
          source={{
            id: selectedRegion.code,
            label: selectedRegion.name,
            coord: [selectedRegion.lon, selectedRegion.lat],
          }}
          data={filteredData.map((r) => ({
            id: r.id,
            label: r.name,
            coord: [r.lon, r.lat] as [number, number],
            value: r.count,
          }))}
          blinkTime={blinkTime}
          total={allData.reduce((s, r) => s + r.count, 0)}
          direction="inbound"
          subtitle="Net Migration Rank"
          animate={true}
          blinkCount={3}
          formatLabel={(d, rank) => `${d.label} ${d.value.toLocaleString()}`}
        />
      )}
    </Map>
  );
}
```

### 地図上でランク付き地域をハイライト（deck.gl）

Flowring は SVG オーバーレイを描画しますが、地図上の地域の着色はアプリケーション側で行います。
以下は deck.gl の GeoJsonLayer を使って上位ランクの地域をハイライトする例です：

```js
// geojson: 地域境界の FeatureCollection
// selectedRegionCode: ホバー中のソース地域のコード
// rankMap: flowring データから構築した Map<code, rankIndex>
new GeoJsonLayer({
  id: "region-highlight",
  data: geojson,
  filled: true,
  stroked: false,
  pickable: true,
  getFillColor: (d) => {
    const code = Number(d.properties.code);
    // ホバー中のソース地域を緑で表示
    if (code === selectedRegionCode) return [23, 115, 58, 255];
    // ランク付き対象地域を黄緑で表示
    if (rankMap.has(code)) return [174, 242, 2, 180];
    // その他は透明
    return [0, 0, 0, 0];
  },
  updateTriggers: { getFillColor: [selectedRegionCode, rankMap] },
});
```

### 点滅アニメーションと地図レイヤーの同期

`animate: true` を設定すると、SVG オーバーレイで上位ランクが点滅します。
`getBlinkOpacity` を使用して、地図の塗りつぶし色を同じタイミングで同期させることができます：

```js
import { getBlinkOpacity } from "flowring";

// blinkTime: useFlowring() フックまたは createBlinkTimer() から取得
new GeoJsonLayer({
  id: "region-highlight",
  data: geojson,
  filled: true,
  getFillColor: (d) => {
    const code = Number(d.properties.code);
    if (code === selectedRegionCode) return [23, 115, 58, 255];
    const rankIdx = rankMap.get(code);
    if (rankIdx !== undefined) {
      // 上位3件がSVGオーバーレイと同期して点滅
      const opacity = rankIdx < 3 ? getBlinkOpacity(blinkTime, rankIdx) : 1;
      return [174, 242, 2, 180 * opacity];
    }
    return [0, 0, 0, 0];
  },
  updateTriggers: { getFillColor: [selectedRegionCode, rankMap, blinkTime] },
});
```

## API リファレンス

### `flowring(container, options?)`

flowring インスタンスを作成します。

**戻り値:** `FlowringInstance`

### `FlowringOptions`

| オプション | 型 | デフォルト | 説明 |
|--------|------|---------|-------------|
| `topN` | `number` | `12` | 表示するランク付きアイテムの最大数 |
| `blinkCount` | `number` | `3` | 点滅する上位ランクの数 |
| `direction` | `"inbound" \| "outbound"` | `"inbound"` | 矢印の方向 |
| `subtitle` | `string` | `""` | タイトルの2行目 |
| `colors` | `FlowringColors` | 下記参照 | 色のオーバーライド |
| `projection` | `ProjectionFn` | `undefined` | 座標→ピクセル変換関数 |
| `radiusFraction` | `number` | `0.3` | ビューポートに対するドーナツ半径の比率 |
| `arcThickness` | `number` | `20` | アークの太さ（px） |
| `total` | `number` | データの合計 | 比率計算用の総計（アークが360°を埋めるのを防止） |
| `animate` | `boolean` | `false` | 点滅アニメーションの有効化 |
| `blinkInterval` | `number` | `150` | 点滅の間隔（ms） |
| `formatLabel` | `(datum, rank) => string` | `"label value"` | カスタムラベルフォーマッター |
| `formatTitle` | `(source, subtitle) => string[]` | 自動 | カスタムタイトルフォーマッター |
| `onRender` | `(time) => void` | - | 各描画後に呼ばれるコールバック |
| `onBlink` | `(opacities) => void` | - | 点滅時に呼ばれるコールバック |

### `FlowringColors`

| キー | デフォルト | 説明 |
|-----|---------|-------------|
| `arc` | `"rgb(242, 45, 10)"` | ドーナツアークの塗りつぶし色 |
| `stroke` | `"black"` | 線、矢印、ランク円 |
| `buffer` | `"white"` | テキストの縁取り |
| `dim` | `"#666666"` | 引き出し線 |
| `arcByRank` | - | `(rankIndex) => string` ランクごとの色オーバーライド |

### `FlowringInstance`

| メソッド | 説明 |
|--------|-------------|
| `update(source, data)` | ソースとデータを設定し、描画を実行 |
| `setOptions(opts)` | オプションを部分的にマージし、描画を実行 |
| `render()` | 手動描画（地図のパン/ズーム時） |
| `renderAt(time)` | 指定した点滅タイミングで描画 |
| `svg()` | SVG要素を取得 |
| `resize()` | SVGをコンテナサイズにリサイズ |
| `destroy()` | タイマーを停止し、SVGを削除 |

### `FlowringSource`

```ts
{ id: string | number; label: string; coord: [number, number] }
```

### `FlowringDatum`

```ts
{ id: string | number; label: string; coord: [number, number]; value: number }
```

## 点滅アニメーション

点滅はデフォルトで**無効**です。`animate: true` で有効化します。

有効にすると、上位 `blinkCount` 件（デフォルト3件）のランクが6秒周期で同期した点滅+バウンスアニメーションを行います。

外部との同期（例：deck.gl の塗りつぶし色）には、`getBlinkOpacity` をインポートして使用します：

```js
import { getBlinkOpacity, BLINK_CYCLE, BLINK_DELAYS } from "flowring";

// 0 または 1 を返す
const opacity = getBlinkOpacity(elapsedSeconds, rankIndex);
```

## デモをローカルで実行

`examples/demo-map/` ディレクトリには、MapLibre、deck.gl、flowring を使用して韓国の人口移動データを可視化する完全なデモが含まれています。

```bash
# 1. リポジトリをクローン
git clone https://github.com/vuski/flowring.git
cd flowring

# 2. ライブラリの依存関係をインストールしてビルド
npm install
npm run build

# 3. デモアプリの依存関係をインストール
cd examples/demo-map
npm install

# 4. 開発サーバーを起動
npm run dev
```

http://localhost:3000 を開き、地図上をホバーすると可視化を確認できます。

または **[ライブデモ](https://vuski.github.io/flowring)** に直接アクセスできます。

## ライセンス

MIT
