export class RequestTimeout extends Error {}

export async function retryingRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; onRetry?: () => void; timeoutMs?: number } = {},
): Promise<T> {
  const { signal, onRetry, timeoutMs = 12000 } = options;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    let timedOut = false;
    let rejectStop: (reason: Error) => void = () => {};
    const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
    const onAbort = () => {
      controller.abort();
      rejectStop(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      rejectStop(new RequestTimeout('資料載入逾時。'));
    }, timeoutMs);
    try {
      return await Promise.race([request(controller.signal), stopped]);
    } catch (cause) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!timedOut) throw cause;
      if (attempt === 1) throw new RequestTimeout('資料連續兩次載入逾時，請檢查網路或稍後按「重新載入」。');
      onRetry?.();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw new RequestTimeout('資料載入逾時。');
}
