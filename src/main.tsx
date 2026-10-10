import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles.css";
import { supabase, publicAccess } from "./api";
import { restoreDeviceAccess } from "./device-access";
const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: 30000,
    },
  },
});
async function start() {
  // Public access needs no saved credentials. Clean any old private link.
  if (
    publicAccess &&
    /caie_(?:access|refresh)_token=/.test(window.location.hash)
  )
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  const accessError = publicAccess
    ? null
    : await restoreDeviceAccess(supabase.auth, window);
  const router = createHashRouter([
    { path: "*", element: <App accessError={accessError} /> },
  ]);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
void start();
