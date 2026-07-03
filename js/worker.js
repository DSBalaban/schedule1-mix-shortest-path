/**
 * Web Worker wrapper around the search engine, so long explorations never block the UI
 * thread. The incremental exploration CACHE in mixing.js lives here, in the worker's
 * scope, and persists across queries for the lifetime of the page.
 */
importScripts('data.js', 'mixing.js');

onmessage = (e) => {
  const { id, startState, targets } = e.data;
  postMessage({ id, result: search(startState, targets) });
};
