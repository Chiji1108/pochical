import { PageHeader } from "@pochical/prototype/components/design-header";
import {
  MenuItem,
  MenuPicker,
  MenuSeparator,
  PullDownMenu,
} from "@pochical/prototype/components/design-menu";
import { Phone } from "@pochical/prototype/components/design-phone";
import { PhotoViewer } from "@pochical/prototype/components/design-photo-viewer";
import {
  ConfirmDialog,
  DecideHeading,
  PhoneContext,
  Sheet,
  SheetHeading,
  SheetPicture,
  SystemAlert,
} from "@pochical/prototype/components/design-sheet";
import { toastLook } from "@pochical/prototype/components/design-toast";
import {
  Button,
  Screen,
  ScreenScroll,
} from "@pochical/prototype/components/design-ui";
import { sampleRosterPhoto } from "@pochical/prototype/lib/design-sample-photos";
import { css } from "@pochical/styled-system/css";
import { Check, CircleAlert, Info } from "lucide-react";
import { useRef, useState } from "react";

import { Item, Items } from "./item";

// The two kinds of toast, one above the other.
const toastKinds = css({
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
});

export function Overlays() {
  return (
    <Items>
      <Item
        android="Scaffold ＋ LazyColumn、ModalBottomSheet、AlertDialog、全画面の Dialog。SystemAlert は OS が出す（POST_NOTIFICATIONS の許可など）"
        ios="NavigationStack の画面 ＋ ScrollView、.sheet、.alert、.fullScreenCover。SystemAlert は OS が出す（requestAuthorization、アイコン変更）"
        name="Screen + ScreenScroll / Sheet / ConfirmDialog / SystemAlert / PhotoViewer"
        where="すべての画面、内訳などのシート、確かめる質問、OS の確認（通知の許可など）、写真を大きく"
        wide
      >
        <OverlaySample />
      </Item>
    </Items>
  );
}

function OverlaySample() {
  const phone = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<
    "sheet" | "confirm" | "system" | "photo" | null
  >(null);
  const [photo] = useState(sampleRosterPhoto);
  const close = () => {
    setOpen(null);
  };
  return (
    <Phone ref={phone}>
      <PhoneContext value={phone}>
        <Screen>
          <PageHeader title="重なり" />
          <ScreenScroll>
            <Button
              onClick={() => {
                setOpen("sheet");
              }}
              variant="quiet"
            >
              シートを開く
            </Button>
            <Button
              onClick={() => {
                setOpen("confirm");
              }}
              variant="quiet"
            >
              確かめる質問を出す
            </Button>
            <Button
              onClick={() => {
                setOpen("system");
              }}
              variant="quiet"
            >
              OS の確認を出す
            </Button>
            <Button
              onClick={() => {
                setOpen("photo");
              }}
              variant="quiet"
            >
              写真を大きく見る
            </Button>
          </ScreenScroll>
        </Screen>
        <Sheet
          label="今月の内訳"
          onOpenChange={(next) => {
            if (!next) {
              close();
            }
          }}
          open={open === "sheet"}
        >
          <SheetHeading onClose={close} title="今月の内訳" />
        </Sheet>
        {open === "confirm" && (
          <ConfirmDialog
            action="抜ける"
            message="シフトの共有とチャットが見られなくなります。"
            onCancel={close}
            onConfirm={close}
            title="「家族」を抜けますか？"
          />
        )}
        {open === "system" && (
          <SystemAlert
            buttons={[{ label: "許可しない" }, { label: "許可" }]}
            onClose={close}
            title="“ポチカル”は通知を送信します。よろしいですか？"
          />
        )}
        <PhotoViewer
          onOpenChange={(next) => {
            if (!next) {
              close();
            }
          }}
          open={open === "photo"}
          photos={[{ label: "勤務表の写真", src: photo.src }]}
          whole
        />
      </PhoneContext>
    </Phone>
  );
}

function MenuSample() {
  const [layout, setLayout] = useState<"days" | "weeks">("days");
  return (
    <PullDownMenu label={layout === "days" ? "一覧" : "週ごと"}>
      <MenuPicker
        onValueChange={setLayout}
        options={[
          { label: "一覧", value: "days" },
          { label: "週ごと", value: "weeks" },
        ]}
        value={layout}
      />
      <MenuSeparator />
      <MenuItem
        icon={<Info aria-hidden="true" size={16} />}
        onSelect={() => undefined}
        value="legend"
      >
        シフトパターン
      </MenuItem>
    </PullDownMenu>
  );
}

export function Sheets() {
  return (
    <Items>
      <Item
        name="SheetHeading（SheetPicture の中）"
        ios=".sheet の中の .navigationTitle ＋ ✕（.cancellationAction）"
        android="ModalBottomSheet の見出し行"
        where="見るだけのシート(内訳、空いた日、保存、日のシートなど)"
        wide
      >
        <SheetPicture>
          <SheetHeading
            eyebrow="2026年9月"
            onClose={() => undefined}
            title="今月の内訳"
          />
        </SheetPicture>
      </Item>
      <Item
        name="DecideHeading"
        ios=".sheet の中の .cancellationAction ＋ .confirmationAction"
        android="ModalBottomSheet の見出し行（キャンセル・決定）"
        where="決めるシート(日にちを共有)"
        wide
      >
        <SheetPicture handle={false}>
          <DecideHeading
            action="送る"
            onAction={() => undefined}
            onCancel={() => undefined}
            title="日にちを共有"
          />
        </SheetPicture>
      </Item>
      <Item
        name="Toast"
        wide
        ios="標準はないので、画面の下に独自に重ねる"
        android="Snackbar"
        where="入力・保存のあとの一言(Ark UI の Toast)。できたことはチェック、できなかったことは丸に「!」(kind: problem)"
      >
        <div className={toastKinds}>
          <p className={toastLook}>
            <Check aria-hidden="true" size={16} />
            10月のシフトを入れました
          </p>
          <p className={toastLook}>
            <CircleAlert aria-hidden="true" size={16} />
            この招待リンクは使えません
          </p>
        </div>
      </Item>
      <Item
        name="PullDownMenu + MenuPicker / MenuItem / MenuSeparator"
        ios="Menu"
        android="DropdownMenu"
        where="グループのシフト表(一覧・週ごと・1人ずつ)"
      >
        <MenuSample />
      </Item>
    </Items>
  );
}
