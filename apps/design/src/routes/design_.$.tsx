import { DesignProviders } from "@pochical/prototype/components/design-providers";
import { pageMeta } from "@pochical/showcase/lib/page-meta";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { Suspense, use } from "react";
import type { ComponentProps } from "react";

import { DocsThemeSwitch } from "../components/docs-theme-switch";
import { useMDXComponents } from "../components/mdx";
import { docs, source } from "../lib/source";

import docsStylesheet from "../docs.css?url";

// The /design documents written in MDX (content/design), in Fumadocs UI's
// docs layout: its sidebar, search and table of contents. The other
// /design pages are routes of their own, which take precedence over this
// one.
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
export const Route = createFileRoute("/design_/$")({
  // The loader on its own chunk too, as the page is: it reaches the
  // documents' content, which no other page should download.
  codeSplitGroupings: [["loader"], ["component"]],
  component: DocumentPage,
  loader: async ({ params }) => {
    const data = await loadPage({ data: params._splat?.split("/") ?? [] });
    await docs.getPage(data.path)?.preload();
    return data;
  },
  head: ({ loaderData }) => ({
    links: [{ href: docsStylesheet, rel: "stylesheet" }],
    ...(loaderData && pageMeta(loaderData.title, loaderData.description)),
  }),
});

function Content({ path }: { path: string }) {
  const page = docs.getPage(path);
  if (!page) {
    throw new Error(`No document at ${path}, which the loader found`);
  }
  const { toc } = use(page.load());
  const Body = page.body;
  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <DocsBody>
        {/* Its own providers, as every page has, below where it waits for
            its content: the pieces come to life in the light or dark the
            server drew them in, however late they arrive. */}
        <DesignProviders>
          <Body components={useMDXComponents()} />
        </DesignProviders>
      </DocsBody>
    </DocsPage>
  );
}

// TanStack Router hands a route's stylesheets to React, which keeps a
// stylesheet once it has inserted it: docs.css, Tailwind's preflight
// included, would stay on the pages visited after the documents. So the
// documents are a document of their own: a link out of them loads its page
// anew (as a link into them does, design.index.tsx), and one between
// documents stays in the app.
function DocsLink({
  children,
  href = "",
  prefetch = true,
  ...props
}: ComponentProps<"a"> & { prefetch?: boolean }) {
  const found = href.startsWith("#") ? undefined : source.getPageByHref(href);
  if (found === undefined) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link
      hash={found.hash}
      preload={prefetch ? "intent" : false}
      to={found.page.url}
      {...props}
    >
      {children}
    </Link>
  );
}

function DocumentPage() {
  const { path, pageTree } = useFumadocsLoader(Route.useLoaderData());
  return (
    // Light and dark follow the prototype's 外観 (__root.tsx), not
    // next-themes.
    <RootProvider components={{ Link: DocsLink }} theme={{ enabled: false }}>
      <DocsLayout
        nav={{ title: "デザイン資料", url: "/" }}
        slots={{ themeSwitch: DocsThemeSwitch }}
        tree={pageTree}
      >
        <Suspense>
          <Content path={path} />
        </Suspense>
      </DocsLayout>
    </RootProvider>
  );
}
