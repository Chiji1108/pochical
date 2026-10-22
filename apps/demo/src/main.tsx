import { useSettings } from "@pochical/prototype/lib/design-settings-store";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { router } from "./router";

// The store waits to load the saved settings for pages drawn on a server
// first. Nothing is drawn before this script, so they load before the
// first render, which then draws the saved テーマ and 外観.
void useSettings.persist.rehydrate();

const root = document.querySelector("#root");
if (!root) {
  throw new Error("index.html has no #root");
}
createRoot(root).render(<RouterProvider router={router} />);
