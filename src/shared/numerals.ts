/**
 * 籤號的國字寫法 —— 籤筒上的「第廿三籤」、籤紙上的「第十七签」共用這一個。
 * 純函式，瀏覽器與 worker 都能用。
 */

const HAN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1..36 写成签筒上那种汉字签号：十八、廿三、卅六。 */
export function hanNumber(n: number): string {
  if (n < 10) return HAN_DIGITS[n];
  if (n === 10) return '十';
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const head = tens === 1 ? '十' : tens === 2 ? '廿' : tens === 3 ? '卅' : HAN_DIGITS[tens] + '十';
  return ones === 0 ? head : head + HAN_DIGITS[ones];
}

/**
 * 日文签号：第二十三番。日本的御神签用的是普通的汉数字，不用签筒上的廿、卅 ——
 * 那两个字日文读者认得，但印在签纸上像古文。
 */
export function kanjiNumber(n: number): string {
  if (n < 10) return HAN_DIGITS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens === 1 ? '' : HAN_DIGITS[tens]}十${ones === 0 ? '' : HAN_DIGITS[ones]}`;
}
