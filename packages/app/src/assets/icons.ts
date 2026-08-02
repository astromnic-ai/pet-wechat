/**
 * SVG 图标资源 - base64 data URI 格式
 * 用于 Taro Image 组件（小程序不支持内联 SVG）
 *
 * 设计稿来源: pencil-new.pen
 * 设计宽度: 1284px (2x 微信小程序标准)
 */

function svg(content: string, size = 100): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${content}</svg>`)}`;
}

// 猫爪 logo (Splash 页) - 对应 image-import-24.png / TY49r
export const ICON_PAW = svg(
  `<g fill="#444">
    <ellipse cx="50" cy="62" rx="22" ry="20"/>
    <ellipse cx="28" cy="38" rx="10" ry="12"/>
    <ellipse cx="50" cy="30" rx="10" ry="12"/>
    <ellipse cx="72" cy="38" rx="10" ry="12"/>
  </g>`
);

// 项圈图标 - 对应 image-import-5.png / qXsf5
export const ICON_COLLAR = svg(
  `<g fill="none" stroke="#444" stroke-width="4">
    <ellipse cx="50" cy="50" rx="35" ry="30"/>
    <circle cx="50" cy="80" r="6" fill="#444"/>
    <line x1="50" y1="80" x2="50" y2="92"/>
  </g>`
);

// 水晶球/桌面端图标 - 对应 image-import-11.png / 6PwaY
export const ICON_DESKTOP = svg(
  `<g fill="none" stroke="#444" stroke-width="3">
    <circle cx="50" cy="42" r="28"/>
    <ellipse cx="50" cy="42" rx="14" ry="10" fill="#ddd" opacity="0.5"/>
    <path d="M 35 70 Q 50 85 65 70" stroke-width="4"/>
    <line x1="50" y1="70" x2="50" y2="82"/>
    <line x1="35" y1="82" x2="65" y2="82"/>
  </g>`
);

// 电量图标 - 对应 image-import-7.png / 7lLpI
export const ICON_BATTERY = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <rect x="15" y="30" width="60" height="40" rx="4"/>
    <rect x="75" y="40" width="8" height="20" rx="2" fill="#666"/>
    <rect x="20" y="35" width="35" height="30" rx="2" fill="#86f066"/>
  </g>`
);

// 网络/信号图标 - 对应 image-import-6.png / TR2pH
export const ICON_SIGNAL = svg(
  `<g fill="#666">
    <rect x="15" y="70" width="12" height="20" rx="2"/>
    <rect x="33" y="55" width="12" height="35" rx="2"/>
    <rect x="51" y="40" width="12" height="50" rx="2"/>
    <rect x="69" y="20" width="12" height="70" rx="2"/>
  </g>`
);

// 蓝牙图标 - 对应 image-import-28.png / 0v4qa
export const ICON_BLUETOOTH = svg(
  `<g fill="none" stroke="#4a90d9" stroke-width="4" stroke-linecap="round">
    <path d="M 35 30 L 60 50 L 35 70"/>
    <path d="M 60 50 L 50 20 L 50 80 L 60 50"/>
  </g>`
);

// 设置图标（齿轮）- 对应 image-import-14.png / QZCI0
export const ICON_SETTINGS = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <circle cx="50" cy="50" r="15"/>
    <path d="M 50 10 L 50 20 M 50 80 L 50 90 M 10 50 L 20 50 M 80 50 L 90 50
             M 22 22 L 29 29 M 71 71 L 78 78 M 78 22 L 71 29 M 29 71 L 22 78"/>
  </g>`
);

// 用户图标 - 对应 image-import-16.png / awFfM
export const ICON_USER = svg(
  `<g fill="#666">
    <circle cx="50" cy="35" r="16"/>
    <path d="M 20 85 Q 20 60 50 60 Q 80 60 80 85 Z"/>
  </g>`
);

// 数据/活动图标 - 对应 image-import-41.png / o9Jhj
export const ICON_DATA = svg(
  `<g fill="none" stroke="#666" stroke-width="3" stroke-linecap="round">
    <polyline points="15,75 35,45 55,60 85,25"/>
    <rect x="15" y="80" width="70" height="2" fill="#666"/>
  </g>`
);

// 绿色对勾图标 - 对应 image-import-20.png / 3bTzL
export const ICON_CHECK_GREEN = svg(
  `<circle cx="50" cy="50" r="40" fill="#86f066"/>
  <polyline points="30,50 45,65 72,35" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`
);

// 红色错误图标 - 对应 image-import-26.png / OOHj5
export const ICON_ERROR_RED = svg(
  `<circle cx="50" cy="50" r="40" fill="#ff4444"/>
  <line x1="35" y1="35" x2="65" y2="65" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
  <line x1="65" y1="35" x2="35" y2="65" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`
);

// 编辑/铅笔图标 - 对应 image-import-46.png
export const ICON_EDIT = svg(
  `<g fill="none" stroke="#666" stroke-width="3" stroke-linecap="round">
    <path d="M 25 75 L 25 85 L 35 85"/>
    <path d="M 30 80 L 70 20 L 80 30 L 40 90 Z" fill="#f0f0f0"/>
  </g>`
);

// 分享图标 - 对应 image-import-18.png
export const ICON_SHARE = svg(
  `<g fill="none" stroke="#666" stroke-width="3" stroke-linecap="round">
    <circle cx="70" cy="25" r="10" fill="#666"/>
    <circle cx="25" cy="50" r="10" fill="#666"/>
    <circle cx="70" cy="75" r="10" fill="#666"/>
    <line x1="35" y1="45" x2="60" y2="30"/>
    <line x1="35" y1="55" x2="60" y2="70"/>
  </g>`
);

// 解除绑定图标 - 对应 image-import-22.png
export const ICON_UNBIND = svg(
  `<g fill="none" stroke="#e53935" stroke-width="3" stroke-linecap="round">
    <path d="M 30 40 Q 30 20 50 20 Q 70 20 70 40"/>
    <path d="M 30 60 Q 30 80 50 80 Q 70 80 70 60"/>
    <line x1="20" y1="50" x2="80" y2="50" stroke-dasharray="8,4"/>
  </g>`
);

// 删除图标 - 对应 image-import-34.png
export const ICON_DELETE = svg(
  `<g fill="none" stroke="#e53935" stroke-width="3" stroke-linecap="round">
    <path d="M 25 30 L 75 30"/>
    <path d="M 30 30 L 35 80 L 65 80 L 70 30"/>
    <path d="M 40 20 L 60 20"/>
    <line x1="42" y1="40" x2="42" y2="70"/>
    <line x1="58" y1="40" x2="58" y2="70"/>
  </g>`
);

// 加号图标 - 对应 image-import-25.png
export const ICON_PLUS = svg(
  `<g fill="none" stroke="#666" stroke-width="4" stroke-linecap="round">
    <line x1="50" y1="20" x2="50" y2="80"/>
    <line x1="20" y1="50" x2="80" y2="50"/>
  </g>`
);

// 左箭头 - 对应 image-import-35.png
export const ICON_ARROW_LEFT = svg(
  `<polyline points="65,20 35,50 65,80" fill="none" stroke="#666" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
);

// 右箭头
export const ICON_ARROW_RIGHT = svg(
  `<polyline points="35,20 65,50 35,80" fill="none" stroke="#666" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
);

// 首页设备管理入口：使用带横杆的右向箭头，与顶部返回箭头明确区分。
export const ICON_DEVICE_ENTRY = svg(
  `<g fill="none" stroke="#e7b93f" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <line x1="24" y1="50" x2="72" y2="50"/>
    <polyline points="56,32 74,50 56,68"/>
  </g>`
);

// 切换箭头 - 对应 image-import-33.png
export const ICON_SWITCH = svg(
  `<g fill="none" stroke="#666" stroke-width="3" stroke-linecap="round">
    <polyline points="25,40 50,20 75,40"/>
    <polyline points="25,60 50,80 75,60"/>
  </g>`
);

// 消息/通知铃铛 - 对应 image-import-50.png
export const ICON_BELL = svg(
  `<g fill="#666">
    <path d="M 50 15 Q 50 10 50 15 L 50 20"/>
    <path d="M 30 55 Q 25 40 30 30 Q 35 20 50 20 Q 65 20 70 30 Q 75 40 70 55 L 30 55 Z"/>
    <rect x="25" y="55" width="50" height="8" rx="4"/>
    <circle cx="50" cy="70" r="6"/>
  </g>`
);

// 猫爪小图标（消息用）- 对应 image-import-48.png
export const ICON_PAW_SMALL = svg(
  `<g fill="#666">
    <ellipse cx="50" cy="62" rx="18" ry="16"/>
    <circle cx="30" cy="42" r="8"/>
    <circle cx="50" cy="34" r="8"/>
    <circle cx="70" cy="42" r="8"/>
  </g>`
);

// 猫图标（宠物录入用）- 来自设计稿 image-import-17.png / Jk3FN
import catImage from "./images/cat.png";
export const ICON_CAT = catImage;

// 狗图标（宠物录入用）- 来自设计稿 image-import-10.png / E0V0d
import dogImage from "./images/dog.png";
export const ICON_DOG = dogImage;

// 日历图标 - 对应 image-import-27.png
export const ICON_CALENDAR = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <rect x="20" y="25" width="60" height="55" rx="6"/>
    <line x1="20" y1="42" x2="80" y2="42"/>
    <line x1="35" y1="15" x2="35" y2="32"/>
    <line x1="65" y1="15" x2="65" y2="32"/>
    <circle cx="38" cy="56" r="3" fill="#666"/>
    <circle cx="50" cy="56" r="3" fill="#666"/>
    <circle cx="62" cy="56" r="3" fill="#666"/>
  </g>`
);

// 体重/调整图标 - 对应 image-import-44.png
export const ICON_WEIGHT = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <path d="M 20 70 Q 50 10 80 70"/>
    <line x1="20" y1="70" x2="80" y2="70"/>
    <circle cx="50" cy="55" r="5" fill="#666"/>
  </g>`
);

// 链接图标 - 对应 image-import-4.png
export const ICON_LINK = svg(
  `<g fill="none" stroke="#666" stroke-width="4" stroke-linecap="round">
    <path d="M 35 65 Q 20 65 20 50 Q 20 35 35 35 L 45 35"/>
    <path d="M 65 35 Q 80 35 80 50 Q 80 65 65 65 L 55 65"/>
    <line x1="38" y1="50" x2="62" y2="50"/>
  </g>`
);

// 更新图标 - 对应 image-import-2.png
export const ICON_REFRESH = svg(
  `<g fill="none" stroke="#666" stroke-width="4" stroke-linecap="round">
    <path d="M 70 30 A 28 28 0 1 0 75 55"/>
    <polyline points="60,25 70,30 65,42"/>
  </g>`
);

// 图片/相册图标 - 对应 image-import-45.png
export const ICON_PHOTO = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <rect x="15" y="25" width="70" height="50" rx="6"/>
    <circle cx="35" cy="45" r="8" fill="#ddd"/>
    <polyline points="15,70 40,50 55,60 70,45 85,65" fill="#e0e0e0"/>
  </g>`
);

// 打勾/已完成 - 对应 image-import-37.png
export const ICON_DONE = svg(
  `<polyline points="20,50 40,70 80,30" fill="none" stroke="#86f066" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`
);

// 通知图标（设置页用）
export const ICON_NOTIFICATION = svg(
  `<g fill="none" stroke="#666" stroke-width="3" stroke-linecap="round">
    <path d="M 50 18 L 50 24"/>
    <path d="M 30 58 Q 26 42 30 32 Q 36 22 50 22 Q 64 22 70 32 Q 74 42 70 58 L 30 58 Z" fill="#f0f0f0"/>
    <rect x="26" y="58" width="48" height="6" rx="3"/>
    <path d="M 42 66 Q 46 74 50 74 Q 54 74 58 66"/>
  </g>`
);

// 隐私/盾牌图标（设置页用）
export const ICON_SHIELD = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <path d="M 50 15 L 20 30 L 20 55 Q 20 75 50 90 Q 80 75 80 55 L 80 30 Z" fill="#f0f0f0"/>
    <polyline points="37,52 47,62 65,42" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`
);

// 主题/调色板图标（设置页用）
export const ICON_PALETTE = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <path d="M 50 15 Q 15 15 15 50 Q 15 85 50 85 Q 65 85 72 78 Q 78 72 70 68 Q 60 63 65 55 Q 70 47 80 50 Q 90 53 90 42 Q 88 15 50 15 Z" fill="#f0f0f0"/>
    <circle cx="35" cy="40" r="5" fill="#ff6b6b"/>
    <circle cx="50" cy="32" r="5" fill="#ffd93d"/>
    <circle cx="35" cy="60" r="5" fill="#6bcb77"/>
    <circle cx="55" cy="65" r="5" fill="#4d96ff"/>
  </g>`
);

// 语言/地球图标（设置页用）
export const ICON_GLOBE = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <circle cx="50" cy="50" r="32"/>
    <ellipse cx="50" cy="50" rx="16" ry="32"/>
    <line x1="18" y1="50" x2="82" y2="50"/>
    <path d="M 22 35 Q 50 30 78 35"/>
    <path d="M 22 65 Q 50 70 78 65"/>
  </g>`
);

// 信息/关于图标（设置页用）
export const ICON_INFO = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <circle cx="50" cy="50" r="32"/>
    <circle cx="50" cy="35" r="3" fill="#666"/>
    <line x1="50" y1="45" x2="50" y2="70" stroke-width="4" stroke-linecap="round"/>
  </g>`
);

// 帮助/问号图标（设置页用）
export const ICON_HELP = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <circle cx="50" cy="50" r="32"/>
    <path d="M 38 38 Q 38 25 50 25 Q 62 25 62 38 Q 62 48 50 50 L 50 58" stroke-width="4" stroke-linecap="round"/>
    <circle cx="50" cy="68" r="3" fill="#666"/>
  </g>`
);

// 文档/政策图标（设置页用）
export const ICON_DOCUMENT = svg(
  `<g fill="none" stroke="#666" stroke-width="3">
    <path d="M 25 15 L 65 15 L 75 25 L 75 85 L 25 85 Z" fill="#f0f0f0"/>
    <path d="M 65 15 L 65 25 L 75 25"/>
    <line x1="35" y1="40" x2="65" y2="40"/>
    <line x1="35" y1="52" x2="65" y2="52"/>
    <line x1="35" y1="64" x2="55" y2="64"/>
  </g>`
);
