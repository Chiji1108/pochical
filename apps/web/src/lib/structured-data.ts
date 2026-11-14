import { site } from "@pochical/prototype/lib/brand";

// What the top page tells search about itself in schema.org's words: the
// site by its name, and the app with the stores it is on. It says no price
// and no rating, so search draws nothing from it that the page does not say.
export const structuredData = (
  origin: string,
  stores: readonly (string | undefined)[]
): string =>
  JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${origin}/#site`,
        "@type": "WebSite",
        inLanguage: "ja",
        name: site.name,
        url: `${origin}/`,
      },
      {
        "@id": `${origin}/#app`,
        "@type": "SoftwareApplication",
        applicationCategory: "UtilitiesApplication",
        description: site.description,
        inLanguage: "ja",
        name: site.name,
        operatingSystem: "iOS, Android",
        sameAs: stores.filter((url) => url !== undefined),
        url: `${origin}/`,
      },
    ],
    // A script's text ends at the first "</", so none is written.
  }).replaceAll("<", String.raw`\u003c`);
