export function retryDelay(value, attempt, now = Date.now()) {
  const seconds = value && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : null;
  const dated = seconds === null && value ? Date.parse(value) : NaN;
  const requested = seconds !== null ? seconds * 1000 : Number.isFinite(dated) ? dated - now : 0;
  return Math.max(3000, requested, Math.min(30000, 3000 * 2 ** attempt));
}

export async function submitReceipt(url, options, { request, wait, onRejected, onSubmitting = async () => {} }) {
  for (let attempt = 0; attempt < 9; attempt++) {
    await onSubmitting();
    const response = await request(url, options);
    if (response.status !== 429) return response;
    const delay = retryDelay(response.headers.get("retry-after"), attempt);
    await onRejected(delay);
    if (delay > 60000 || attempt === 8) throw new Error("Azure rejected the upload; resume after the rate limit clears");
    await wait(delay);
  }
}

export async function pollReceipt(operation, { request, key, wait, initialDelay = 3000 }) {
  let delay = initialDelay;
  let throttled = 0;
  for (let poll = 0; poll < 60; poll++) {
    if (delay > 60000) throw new Error("Azure requested a long wait; resume this operation later");
    await wait(delay);
    const response = await request(operation, { headers: { "Ocp-Apim-Subscription-Key": key } });
    if (response.status === 429 || response.status === 503) {
      if (++throttled > 8) throw new Error("Azure remains unavailable; resume this operation later");
      delay = retryDelay(response.headers.get("retry-after"), throttled - 1);
      continue;
    }
    if (!response.ok) throw new Error(`Azure polling failed (HTTP ${response.status})`);
    const body = await response.json();
    if (body.status === "failed") throw new Error("Azure analysis failed");
    if (body.status === "succeeded") {
      if (!Array.isArray(body.analyzeResult?.documents) || typeof body.analyzeResult?.content !== "string") throw new Error("Azure returned an invalid analysis result");
      return body.analyzeResult;
    }
    delay = retryDelay(response.headers.get("retry-after"), 0);
  }
  throw new Error("Azure analysis timed out; resume this operation later");
}
