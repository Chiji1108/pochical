import { ArrowUpRight, Smartphone } from "lucide-react";

import { storeLink } from "../lib/site";

export function StoreLinks() {
  const stores = [
    {
      name: "App Store",
      url: storeLink(import.meta.env.VITE_APP_STORE_URL, "apps.apple.com"),
    },
    {
      name: "Google Play",
      url: storeLink(import.meta.env.VITE_GOOGLE_PLAY_URL, "play.google.com"),
    },
  ];
  return (
    <div className="store-links">
      {stores.map((store) =>
        store.url ? (
          <a
            className="store-link"
            href={store.url}
            key={store.name}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Smartphone aria-hidden="true" size={22} />
            <span>
              <small>ダウンロード</small>
              <strong>{store.name}</strong>
            </span>
            <ArrowUpRight aria-hidden="true" size={16} />
          </a>
        ) : (
          <div className="store-link coming-soon" key={store.name}>
            <Smartphone aria-hidden="true" size={22} />
            <span>
              <small>公開準備中</small>
              <strong>{store.name}</strong>
            </span>
          </div>
        )
      )}
    </div>
  );
}
