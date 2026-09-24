// 测试跑在 workers 的 tsconfig 下，没有 vite/client 的类型：这里只声明测试用到的 ?raw 导入。
declare module '*.css?raw' {
  const source: string;
  export default source;
}
