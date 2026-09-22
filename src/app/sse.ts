/**
 * 追问流的客户端。EventSource 不能 POST 也不能带 header，所以这里用 fetch，
 * 把响应体当 SSE 读：空行分帧，`data:` 行里是 JSON。每个事件按顺序交给调用方，
 * 流关闭时 promise 结束。
 */

import type { ApiErrorBody, FollowUpEvent } from '../shared/types';
import { ApiError, authHeaders } from './api';

export async function streamFollowUp(
  readingId: string,
  message: string,
  onEvent: (event: FollowUpEvent) => void,
): Promise<void> {
  const response = await fetch(`/api/readings/${encodeURIComponent(readingId)}/follow-up`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* not JSON */
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'request_failed',
      body?.error?.message ?? `追问失败（HTTP ${response.status}）。`,
    );
  }
  if (!response.body) throw new ApiError(502, 'no_stream', '追问的响应没有内容。');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) {
          try {
            onEvent(JSON.parse(data) as FollowUpEvent);
          } catch {
            /* skip malformed frame */
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}
