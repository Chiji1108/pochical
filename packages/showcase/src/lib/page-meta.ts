import { site } from "@pochical/prototype/lib/brand";

// A page's title and description. Every page of apps/design and apps/demo
// is kept out of search (each one's __root.tsx), so none has a canonical
// link or share card.
export const pageMeta = (title: string, description: string) => ({
  meta: [
    { title: `${title} | ${site.name}` },
    { content: description, name: "description" },
  ],
});
