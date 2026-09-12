import { Database, RefreshCw, ShieldCheck, Wifi } from "lucide-react";
import { useState } from "react";
import { useSimulator } from "../simulator-context";

/**
 * Remove the browser runtime layer that can keep an older PWA shell alive.
 * IndexedDB is intentionally untouched: universes, source snapshots, and
 * audit history are application data, not disposable frontend cache.
 */
export async function clearAppRuntimeCache(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ("caches" in globalThis) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }
}

export function SettingsView() {
  const { current, health, refreshData } = useSimulator();
  const [refreshing, setRefreshing] = useState(false);
  const [sourceRefreshing, setSourceRefreshing] = useState(false);

  const refreshApp = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await clearAppRuntimeCache();
    } finally {
      // A cache-busting query makes the action reliable even when this page is
      // being served by a browser that ignores a normal reload request.
      const url = new URL(window.location.href);
      url.searchParams.set("appRefresh", Date.now().toString());
      window.location.replace(url.toString());
    }
  };

  const refreshSource = async () => {
    if (sourceRefreshing) return;
    setSourceRefreshing(true);
    try {
      await refreshData();
    } finally {
      setSourceRefreshing(false);
    }
  };

  return (
    <div className="page-stack settings-page">
      <header className="page-heading"><span>Race control preferences</span><h1>Settings</h1><p>Keep the local simulator responsive, inspect its provider state, and refresh the app shell when a browser cache is holding on to an older build.</p></header>

      <section className="settings-grid">
        <article className="settings-card settings-card--primary">
          <div className="section-heading"><div><span>Frontend maintenance</span><h2>Refresh the app</h2></div><RefreshCw /></div>
          <p>Stops the current service worker, clears cached frontend assets, and reloads the newest local build. Your saved universes and IndexedDB data are preserved.</p>
          <button className="button button--signal" disabled={refreshing} onClick={() => void refreshApp()}><RefreshCw className={refreshing ? "settings-spin" : undefined} />{refreshing ? "Refreshing app…" : "Refresh app"}</button>
        </article>

        <article className="settings-card">
          <div className="section-heading"><div><span>Official data</span><h2>Refresh current source</h2></div><Database /></div>
          <p>Fetch the latest available Jolpica snapshot and cache it locally. Existing universes stay pinned to their own source snapshot.</p>
          <button className="button button--dark" disabled={sourceRefreshing} onClick={() => void refreshSource()}><Database className={sourceRefreshing ? "settings-spin" : undefined} />{sourceRefreshing ? "Refreshing source…" : "Refresh data source"}</button>
        </article>
      </section>

      <section className="settings-status">
        <div className="section-heading"><div><span>Local status</span><h2>Runtime checks</h2></div><ShieldCheck /></div>
        <div className="settings-status-grid">
          <div><Wifi /><span><strong>Local service</strong><small>{health ? "Connected" : "Unavailable — simulation remains offline-capable"}</small></span></div>
          <div><Database /><span><strong>Active save</strong><small>{current ? current.name : "No universe selected"}</small></span></div>
          <div><ShieldCheck /><span><strong>Saved data</strong><small>IndexedDB records are not removed by Refresh app.</small></span></div>
        </div>
      </section>
    </div>
  );
}
