import { createFileRoute } from "@tanstack/react-router";

// The tools beside the documents, each a full page of its own outside
// Fumadocs UI's docs layout: /demo, and the share image that
// scripts/share-image.ts photographs. They draw from what only the
// browser knows (the saved settings, the device's light or dark, the
// phone stood in for), so they draw in the browser alone. Their <html>
// leaves out the documents' 外観 (__root.tsx).
export const Route = createFileRoute("/_tool")({ ssr: false });
