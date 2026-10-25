import { sourceUrl } from "@pochical/prototype/lib/brand";
import { tryUrl } from "@pochical/prototype/lib/try-url";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { Smartphone, TabletSmartphone } from "lucide-react";
import { Suspense, use } from "react";

import { DocsThemeSwitch } from "../components/docs-theme-switch";
import { useMDXComponents } from "../components/mdx";
import { pageMeta } from "../lib/page-meta";
import { docs, source } from "../lib/source";

// Every page of the design documents: an MDX page of content/, in
// Fumadocs UI's docs layout with its sidebar, search and table of
// contents.
const loadPage = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    if (
      !(
        Array.isArray(input) &&
        input.every((slug): slug is string => typeof slug === "string")
      )
    ) {
      throw new TypeError("A document is asked for by its slugs");
    }
    return input;
  })
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) {
      // TanStack Router shows its not-found page for what notFound() returns.
      // oxlint-disable-next-line typescript/only-throw-error
      throw notFound();
    }
    return {
      description: page.data.description ?? "",
      pageTree: await source.serializePageTree(source.getPageTree()),
      path: page.path,
      title: page.data.title,
    };
  });

// The loader comes before head, whose loaderData TypeScript types from
// what the loader returns.
// oxlint-disable-next-line sort-keys
export const Route = createFileRoute("/$")({
  component: DocumentPage,
  loader: async ({ params }) => {
    const slugs = (params._splat ?? "").split("/").filter(Boolean);
    const data = await loadPage({ data: slugs });
    await docs.getPage(data.path)?.preload();
    return data;
  },
  head: ({ loaderData }) =>
    loaderData ? pageMeta(loaderData.title, loaderData.description) : {},
  // A page's content and the sidebar change only with a new build, so a
  // page once loaded is not asked for again, as when the widgets'
  // switches change its search.
  staleTime: Number.POSITIVE_INFINITY,
});

// /demo and the app to try, beside the documents in the sidebar.
const apps = [
  {
    icon: <TabletSmartphone />,
    text: "デモ",
    type: "main",
    url: "/demo",
  },
  {
    icon: <Smartphone />,
    text: "自分のスマホで試す",
    type: "main",
    url: tryUrl,
  },
] as const;

function Content({ path }: { path: string }) {
  const page = docs.getPage(path);
  if (!page) {
    throw new Error(`No document at ${path}, which the loader found`);
  }
  const { toc } = use(page.load());
  const Body = page.body;
  return (
    <DocsPage full={page.full} toc={toc}>
      {/* In a span, as Fumadocs UI's own JSX does not break Japanese
          between phrases and ours does for an element's text
          (@pochical/jsx). */}
      <DocsTitle>
        <span>{page.title}</span>
      </DocsTitle>
      <DocsDescription>
        <span>{page.description}</span>
      </DocsDescription>
      <DocsBody>
        <Body components={useMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

function DocumentPage() {
  const { path, pageTree } = useFumadocsLoader(Route.useLoaderData());
  return (
    <DocsLayout
      githubUrl={sourceUrl}
      links={[...apps]}
      nav={{ title: "デザイン資料", url: "/" }}
      slots={{ themeSwitch: DocsThemeSwitch }}
      tree={pageTree}
    >
      <Suspense>
        <Content path={path} />
      </Suspense>
    </DocsLayout>
  );
}
