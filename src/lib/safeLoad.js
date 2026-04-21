// Runs the list of thunks in parallel and returns one array per thunk.
// A rejected thunk resolves to the provided fallback for its slot (default [])
// instead of making the whole batch fail — that way a single permission
// error on one entity doesn't leave a page stuck on the loading spinner.
export async function safeParallel(thunks, fallbacks) {
  const results = await Promise.allSettled(thunks.map(fn => fn()));
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // eslint-disable-next-line no-console
    console.error(`[safeParallel] entry ${i} failed:`, r.reason);
    return fallbacks ? fallbacks[i] : [];
  });
}
