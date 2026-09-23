/**
 * 应用的挂载路径（不带结尾斜杠）：部署在域名根目录时是 ''，挂在
 * app.manyfold.ai/fortune-stick 下时是 '/fortune-stick'。页面只有 /、/privacy、/settings
 * 三个，把地址末尾的页面名去掉就是挂载点。页面之间不做 pushState，所以加载时算一次就够。
 */
export const BASE = location.pathname.replace(/\/(privacy|settings)?\/*$/, '');

/** 把应用内的绝对路径（'/api/state'、'/privacy'）接到挂载点下面。 */
export const appUrl = (path: string): string => BASE + path;
