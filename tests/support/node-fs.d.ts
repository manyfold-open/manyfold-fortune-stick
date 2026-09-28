// 测试跑在 workers 的 tsconfig 下，没有 @types/node：这里只声明测试用到的那一个 node:fs 函数。
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
}
