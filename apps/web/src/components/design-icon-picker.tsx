import { useState } from "react";
import type { ReactNode } from "react";
import { css } from "styled-system/css";

import { pickerStyle } from "./design-picker-style";
import { Sheet, SheetHeading } from "./design-sheet";
import type { MarkIcon } from "./shift-mark";

// Every icon a mark can take, beyond the ones offered first: ほかのアイコン
// for a shift pattern or a group, in the same sheet as every emoji. Only
// icons that stay clear at calendar size are here, not all of Phosphor,
// since every phone has to draw whichever one someone picks.

export const iconNames: Record<MarkIcon, string> = {
  alarm: "目覚まし時計",
  ambulance: "救急車",
  baby: "赤ちゃん",
  babyCarriage: "ベビーカー",
  backpack: "リュック",
  balloon: "風船",
  bandaids: "ばんそうこう",
  bank: "銀行",
  baseball: "野球",
  basket: "かご",
  basketball: "バスケットボール",
  bath: "お風呂",
  bed: "ベッド",
  beer: "ビール",
  bell: "ベル",
  bicycle: "自転車",
  bird: "鳥",
  boat: "船",
  book: "本",
  books: "本棚",
  bread: "パン",
  briefcase: "かばん",
  broom: "ほうき",
  building: "ビル",
  bus: "バス",
  cake: "ケーキ",
  calculator: "電卓",
  calendarCheck: "予定",
  calendarHeart: "記念日",
  camera: "カメラ",
  car: "車",
  cashRegister: "レジ",
  cat: "猫",
  chart: "グラフ",
  chefHat: "コック帽",
  clock: "時計",
  cloud: "雲",
  cloudMoon: "夜空",
  cloudSun: "晴れ",
  code: "コード",
  coffee: "コーヒー",
  coins: "お金",
  cookingPot: "鍋",
  couch: "ソファ",
  desktop: "デスクトップ",
  dog: "犬",
  dumbbell: "運動",
  envelope: "封筒",
  eyeglasses: "めがね",
  factory: "工場",
  film: "映画",
  fireExtinguisher: "消火器",
  fireTruck: "消防車",
  firstAid: "救急箱",
  fish: "魚",
  flower: "花",
  folder: "フォルダ",
  game: "ゲーム",
  gasPump: "給油",
  gift: "プレゼント",
  graduationCap: "学位帽",
  guitar: "ギター",
  hammer: "ハンマー",
  handHeart: "手とハート",
  handshake: "握手",
  hardHat: "ヘルメット",
  headset: "ヘッドセット",
  heart: "ハート",
  heartbeat: "心拍",
  hospital: "病院",
  hourglass: "砂時計",
  house: "家",
  iceCream: "アイス",
  idBadge: "社員証",
  island: "島",
  laptop: "パソコン",
  leaf: "葉っぱ",
  letter: "文字アイコン",
  lightbulb: "電球",
  lightning: "雷",
  mapPin: "地図のピン",
  megaphone: "メガホン",
  microphone: "マイク",
  microscope: "顕微鏡",
  moon: "月",
  moonStar: "月と星",
  motorcycle: "バイク",
  mountains: "山",
  music: "音楽",
  needle: "針",
  notebook: "ノート",
  package: "荷物",
  paintBrush: "筆",
  palette: "パレット",
  partyPopper: "お祝い",
  pawPrint: "足あと",
  pen: "ペン",
  pencil: "鉛筆",
  phone: "電話",
  pill: "薬",
  plane: "飛行機",
  policeCar: "パトカー",
  popcorn: "ポップコーン",
  pottedPlant: "観葉植物",
  presentation: "プレゼン",
  printer: "プリンター",
  rabbit: "うさぎ",
  rain: "雨",
  rainbow: "虹",
  run: "ランニング",
  scales: "天びん",
  scissors: "はさみ",
  shield: "盾",
  shieldCheck: "安全",
  shoppingBag: "買い物",
  shoppingCart: "カート",
  siren: "サイレン",
  smiley: "笑顔",
  sneaker: "スニーカー",
  snow: "雪",
  soccer: "サッカー",
  star: "星",
  stethoscope: "聴診器",
  storefront: "お店",
  subway: "地下鉄",
  suitcase: "スーツケース",
  sun: "太陽",
  sunHorizon: "地平線の太陽",
  sunglasses: "サングラス",
  swim: "水泳",
  syringe: "注射器",
  tShirt: "Tシャツ",
  taxi: "タクシー",
  teacher: "先生",
  tennis: "テニス",
  tent: "テント",
  ticket: "チケット",
  timer: "タイマー",
  tooth: "歯",
  tractor: "トラクター",
  train: "電車",
  translate: "語学",
  tree: "木",
  treePalm: "ヤシの木",
  trophy: "トロフィー",
  truck: "トラック",
  users: "人たち",
  utensils: "食事",
  van: "ワゴン車",
  videoCamera: "ビデオカメラ",
  warehouse: "倉庫",
  washingMachine: "洗濯機",
  wheelchair: "車いす",
  wine: "ワイン",
  wrench: "工具",
};

// Other words someone may look an icon up by: the shifts, jobs and days it
// stands for.
const iconWords: Partial<Record<MarkIcon, string>> = {
  alarm: "早起き 朝",
  ambulance: "救急 救命",
  baby: "保育 育児 子ども",
  babyCarriage: "保育 育児 散歩",
  backpack: "通学 遠足 学校",
  balloon: "お祝い イベント 誕生日",
  bandaids: "けが 処置",
  bank: "金融 窓口",
  baseball: "部活",
  basket: "スーパー 品出し 買い物",
  basketball: "部活",
  bath: "温泉 銭湯",
  bed: "非番 睡眠 寝る",
  beer: "飲み会 居酒屋 お酒",
  bell: "ナースコール 呼び出し",
  bicycle: "配達 通勤",
  boat: "フェリー 釣り",
  book: "研修 勉強 講習",
  books: "図書館 読書 勉強",
  bread: "パン屋 ベーカリー",
  briefcase: "仕事 出勤 出張",
  broom: "清掃 掃除",
  building: "会社 オフィス 事務所",
  bus: "通勤 送迎",
  cake: "誕生日 記念日 お祝い",
  calculator: "経理 会計 計算",
  calendarCheck: "用事",
  calendarHeart: "デート",
  camera: "写真 撮影",
  car: "運転 ドライブ 外回り",
  cashRegister: "会計 販売",
  cat: "ペット",
  chart: "営業 分析 数字",
  chefHat: "調理 料理人 キッチン 厨房",
  clock: "残業 時短 時間",
  cloud: "曇り",
  cloudMoon: "遅番 準夜 夕方 夜",
  cloudSun: "早番 朝",
  code: "エンジニア プログラミング 開発",
  coffee: "休憩 カフェ 喫茶",
  coins: "給料 経理",
  cookingPot: "調理 料理 給食",
  couch: "休み のんびり",
  desktop: "事務 デスクワーク",
  dog: "ペット 散歩",
  dumbbell: "ジム 筋トレ",
  envelope: "メール 郵便 手紙",
  eyeglasses: "眼科",
  factory: "製造 ライン",
  film: "動画",
  fireExtinguisher: "防災 訓練",
  fireTruck: "消防 消防士",
  firstAid: "救急 保健室",
  fish: "釣り 水族館",
  flower: "有休 有給 年休",
  folder: "書類 事務",
  game: "遊び",
  gasPump: "ガソリンスタンド",
  gift: "誕生日",
  graduationCap: "学校 卒業 大学",
  guitar: "バンド 楽器",
  hammer: "大工 建設 工事",
  handHeart: "介護 ケア 福祉 ボランティア",
  handshake: "商談 営業 契約 面接",
  hardHat: "建設 工事 現場",
  headset: "コールセンター 窓口 受付",
  heart: "デート 好き",
  heartbeat: "心電図 モニター",
  hospital: "病棟 看護 クリニック",
  hourglass: "待ち時間",
  house: "在宅 自宅",
  iceCream: "おやつ デザート",
  idBadge: "受付 出勤",
  island: "旅行",
  laptop: "在宅 リモート テレワーク",
  leaf: "休み 公休",
  lightbulb: "企画 アイデア",
  lightning: "いなずま",
  mapPin: "お出かけ 外出 場所",
  megaphone: "宣伝 広報 イベント",
  microphone: "カラオケ 歌 ライブ",
  microscope: "研究 検査 実験",
  moon: "夜勤 夜",
  moonStar: "深夜 夜",
  motorcycle: "配達",
  mountains: "登山 ハイキング",
  music: "ライブ 習い事",
  needle: "裁縫 縫製",
  notebook: "授業 勉強",
  package: "倉庫 仕分け 発送",
  paintBrush: "美術 塗装 デザイン",
  palette: "絵 美術 習い事",
  partyPopper: "パーティー イベント 飲み会",
  pawPrint: "ペット 動物",
  pen: "書類 記録",
  pencil: "勉強 宿題 試験",
  phone: "待機 オンコール 電話番",
  pill: "薬局 薬剤師 服薬",
  plane: "出張 旅行 空港",
  policeCar: "警察 警察官 パトロール",
  popcorn: "映画",
  pottedPlant: "植物",
  presentation: "発表 会議",
  printer: "印刷 事務",
  rabbit: "ペット",
  rain: "天気",
  run: "マラソン ジョギング 運動",
  scales: "法律 弁護士 裁判",
  scissors: "美容 美容師 理容 カット",
  shield: "警備 警察 守衛",
  shieldCheck: "警備 セキュリティ",
  shoppingBag: "ショッピング",
  shoppingCart: "買い物 スーパー",
  siren: "当番 当直 緊急 消防",
  smiley: "楽しい",
  sneaker: "散歩 ウォーキング",
  snow: "冬",
  soccer: "部活",
  stethoscope: "医師 看護 診察",
  storefront: "店 店舗 販売 コンビニ",
  subway: "通勤",
  suitcase: "旅行 帰省 出張",
  sun: "日勤 昼",
  sunHorizon: "明け 夕勤 朝 夕方 日の出 夕日",
  sunglasses: "夏 海",
  swim: "プール",
  syringe: "注射 ワクチン 採血",
  tShirt: "アパレル 服 洋服",
  taxi: "運転",
  teacher: "教師 講師 塾 学校",
  tennis: "部活",
  tent: "キャンプ アウトドア",
  ticket: "ライブ コンサート 観劇",
  timer: "時間",
  tooth: "歯科 歯医者",
  tractor: "農業 畑",
  train: "鉄道 通勤 駅",
  translate: "英語 英会話",
  tree: "公園 自然",
  treePalm: "旅行 休暇 バカンス",
  trophy: "大会 試合 優勝",
  truck: "配送 配達 物流 運送",
  users: "会議 ミーティング 打ち合わせ",
  utensils: "飲食 レストラン ランチ ごはん",
  van: "送迎 配達",
  videoCamera: "オンライン会議 撮影 配信",
  warehouse: "物流 ピッキング",
  washingMachine: "洗濯 家事",
  wheelchair: "介助 介護",
  wine: "飲み会 ディナー お酒",
  wrench: "整備 修理 工場",
};

type IconSection = { title: string; icons: readonly MarkIcon[] };

// Passes the sections through only when every icon but the letter is in
// one, so a new icon cannot be left out of the sheet.
function everyIcon<const T extends readonly IconSection[]>(
  sections: T &
    ([Exclude<MarkIcon, "letter" | T[number]["icons"][number]>] extends [never]
      ? unknown
      : never)
): T {
  return sections;
}

// The sheet's kinds, each starting with the icons offered first.
const iconSections = everyIcon([
  {
    icons: [
      "sunHorizon",
      "cloudSun",
      "sun",
      "cloudMoon",
      "moon",
      "moonStar",
      "star",
      "clock",
      "cloud",
      "rain",
      "snow",
      "rainbow",
      "lightning",
      "alarm",
      "hourglass",
      "timer",
    ],
    title: "空と時間",
  },
  {
    icons: [
      "leaf",
      "flower",
      "bed",
      "couch",
      "coffee",
      "treePalm",
      "heart",
      "bath",
      "tent",
      "mountains",
      "island",
      "suitcase",
      "camera",
      "film",
      "ticket",
      "popcorn",
      "tree",
      "pottedPlant",
      "sunglasses",
      "mapPin",
      "iceCream",
      "sneaker",
      "smiley",
    ],
    title: "休み・お出かけ",
  },
  {
    icons: [
      "briefcase",
      "laptop",
      "building",
      "house",
      "users",
      "phone",
      "book",
      "desktop",
      "headset",
      "presentation",
      "chart",
      "envelope",
      "printer",
      "calculator",
      "folder",
      "handshake",
      "idBadge",
      "videoCamera",
      "pen",
      "bank",
      "coins",
      "scales",
      "megaphone",
      "lightbulb",
    ],
    title: "仕事",
  },
  {
    icons: [
      "storefront",
      "utensils",
      "scissors",
      "wrench",
      "truck",
      "teacher",
      "chefHat",
      "cookingPot",
      "cashRegister",
      "basket",
      "bread",
      "package",
      "warehouse",
      "factory",
      "hardHat",
      "hammer",
      "broom",
      "paintBrush",
      "tShirt",
      "tractor",
      "gasPump",
      "microscope",
      "code",
      "needle",
    ],
    title: "職種",
  },
  {
    icons: [
      "hospital",
      "stethoscope",
      "syringe",
      "ambulance",
      "siren",
      "shield",
      "handHeart",
      "baby",
      "pill",
      "firstAid",
      "heartbeat",
      "tooth",
      "eyeglasses",
      "bandaids",
      "wheelchair",
      "babyCarriage",
      "fireTruck",
      "policeCar",
      "fireExtinguisher",
      "shieldCheck",
      "bell",
    ],
    title: "医療・ケア",
  },
  {
    icons: [
      "graduationCap",
      "music",
      "dumbbell",
      "backpack",
      "pencil",
      "books",
      "notebook",
      "soccer",
      "basketball",
      "baseball",
      "tennis",
      "run",
      "swim",
      "game",
      "microphone",
      "guitar",
      "palette",
      "translate",
      "trophy",
    ],
    title: "学び・趣味",
  },
  {
    icons: [
      "pawPrint",
      "shoppingBag",
      "gift",
      "partyPopper",
      "calendarCheck",
      "cake",
      "wine",
      "beer",
      "shoppingCart",
      "calendarHeart",
      "washingMachine",
      "balloon",
      "cat",
      "dog",
      "rabbit",
      "bird",
      "fish",
    ],
    title: "暮らし",
  },
  {
    icons: [
      "car",
      "train",
      "plane",
      "bus",
      "subway",
      "taxi",
      "van",
      "bicycle",
      "motorcycle",
      "boat",
    ],
    title: "乗り物",
  },
]);

const KATAKANA = /[\u30A1-\u30F6]/gu;
const SPACES = /\s+/u;
const KANA_GAP = 0x60;

// Folds width, case and katakana, so ケア, けあ and ｹｱ find the same.
function folded(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(KATAKANA, (kana) =>
      String.fromCodePoint((kana.codePointAt(0) ?? 0) - KANA_GAP)
    );
}

function matching(query: string): readonly IconSection[] {
  const words = folded(query).split(SPACES).filter(Boolean);
  if (words.length === 0) {
    return iconSections;
  }
  return iconSections
    .map(({ title, icons }) => ({
      icons: icons.filter((icon) => {
        const text = folded(`${iconNames[icon]} ${iconWords[icon] ?? ""}`);
        return words.every((word) => text.includes(word));
      }),
      title,
    }))
    .filter(({ icons }) => icons.length > 0);
}

const sheet = {
  grid: css({
    display: "grid",
    gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
    paddingInline: "2px",
  }),
  // The one picked now, edged like the picked tile in the grid.
  picked: css({
    "&[aria-pressed=true]": {
      boxShadow: "inset 0 0 0 1.5px token(colors.accent.default)",
    },
  }),
};

// The sheet over the phone; picking closes it.
export function IconPickerSheet({
  open,
  onOpenChange,
  picked,
  renderIcon,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  picked?: MarkIcon;
  // How each icon is drawn, in the pattern's or the group's color.
  renderIcon: (icon: MarkIcon) => ReactNode;
  onPick: (icon: MarkIcon) => void;
}) {
  const [query, setQuery] = useState("");
  const setOpen = (next: boolean) => {
    if (!next) {
      setQuery("");
    }
    onOpenChange(next);
  };
  const sections = matching(query);
  return (
    <Sheet label="アイコンを選ぶ" onOpenChange={setOpen} open={open}>
      <SheetHeading
        onClose={() => {
          setOpen(false);
        }}
        title="アイコンを選ぶ"
      />
      <div className={pickerStyle.root}>
        <input
          aria-label="アイコンを検索"
          className={pickerStyle.search}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="検索（例：夜勤、配達）"
          type="search"
          value={query}
        />
        <div className={pickerStyle.viewport}>
          {sections.length === 0 && (
            <p className={pickerStyle.note}>見つかりませんでした</p>
          )}
          {sections.map(({ title, icons }) => (
            <section aria-label={title} key={title}>
              <h3 className={pickerStyle.categoryHeader}>{title}</h3>
              <div className={sheet.grid}>
                {icons.map((icon) => (
                  <button
                    aria-label={iconNames[icon]}
                    aria-pressed={icon === picked}
                    className={`${pickerStyle.choice} ${sheet.picked}`}
                    key={icon}
                    onClick={() => {
                      onPick(icon);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    {renderIcon(icon)}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
