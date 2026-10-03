interface DisposableFeature {
  dispose(): void;
}
interface DeferredMountOptions<T> {
  load(): Promise<T>;
  mount(value: T): DisposableFeature;
  onLoading?(): void;
  onError?(error: unknown): void;
}

/** Optional screens may arrive after their dialog has closed or been replaced. */
export function createDeferredMount<T>(options: DeferredMountOptions<T>) {
  let disposed = false;
  let mounted: DisposableFeature | undefined;
  let pending: Promise<void> | undefined;
  function start(): Promise<void> {
    if (disposed || mounted) return Promise.resolve();
    if (pending) return pending;
    options.onLoading?.();
    pending = Promise.resolve()
      .then(() => options.load())
      .then(value => {
        if (disposed) return;
        const feature = options.mount(value);
        if (disposed) feature.dispose();
        else mounted = feature;
      })
      .catch((error: unknown) => {
        if (!disposed) options.onError?.(error);
      })
      .finally(() => { pending = undefined; });
    return pending;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    mounted?.dispose();
    mounted = undefined;
  }
  return { start, dispose };
}
