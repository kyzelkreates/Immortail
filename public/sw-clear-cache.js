/**
 * Immortail™ — SW cache-clear extension
 * Appended to the generated Workbox SW via importScripts.
 * Handles the CLEAR_CACHE message from SettingsPage.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => {
      event.source?.postMessage({ type: 'CACHE_CLEARED' });
    });
  }
});
