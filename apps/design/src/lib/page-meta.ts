import shareImage from "@pochical/prototype/assets/share.png?url";
import { designUrl, SHARE_IMAGE, site } from "@pochical/prototype/lib/brand";

// A page's title and description, and the card a link to it shows where it
// is shared: the site's picture (apps/web's too) under the page's own
// words. Every page is kept out of search (routes/__root.tsx), so none has
// a canonical link.
export const pageMeta = (title: string, description: string) => {
  const fullTitle = `${title} | ${site.name}`;
  return {
    meta: [
      { title: fullTitle },
      { content: description, name: "description" },
      { content: fullTitle, property: "og:title" },
      { content: description, property: "og:description" },
      { content: "website", property: "og:type" },
      { content: "ja_JP", property: "og:locale" },
      { content: site.name, property: "og:site_name" },
      { content: `${designUrl}${shareImage}`, property: "og:image" },
      { content: String(SHARE_IMAGE.width), property: "og:image:width" },
      { content: String(SHARE_IMAGE.height), property: "og:image:height" },
      { content: SHARE_IMAGE.alt, property: "og:image:alt" },
      { content: "summary_large_image", name: "twitter:card" },
    ],
  };
};
