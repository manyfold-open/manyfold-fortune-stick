// 测试跑在 workers 的 tsconfig 下，没有 @types/node：这里只声明测试用到的最小 Node 文件读取能力。
interface ImportMeta {
  readonly url: string;
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string): Uint8Array;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
