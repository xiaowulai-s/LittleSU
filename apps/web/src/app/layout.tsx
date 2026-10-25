import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: {
    default: 'LittleSU TV - 免费在线视频搜索与观看平台',
    template: '%s - LittleSU TV',
  },
  description:
    'LittleSU TV 是一个免费的在线视频搜索平台，无广告、安全，提供来自多个视频源的内容搜索与观看服务，无需注册即可使用。',
  manifest: '/manifest.webmanifest',
  // 图标与门户站同一套：同一张 artwork 导出的多尺寸 + 根目录 favicon.ico 兜底。
  // 只声明单张 512 时，抓取端只能拿大图缩放，小尺寸下易糊、看起来「没填满」。
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0b101a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 旧 WebView polyfill：在所有应用脚本之前补齐缺失的现代 API，
            否则旧系统 WebView 会在模块初始化时直接抛 TypeError 白屏 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){if(typeof Promise!=='undefined'&&!Promise.withResolvers){Promise.withResolvers=function(){var o={};o.promise=new Promise(function(r,j){o.resolve=r;o.reject=j});return o}}if(!Object.hasOwn){Object.hasOwn=function(o,k){return Object.prototype.hasOwnProperty.call(o,k)}}if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='undefined'&&typeof crypto.getRandomValues==='function'){crypto.randomUUID=function(){return('10000000-1000-4000-8000-100000000000').replace(/[018]/g,function(c){var v=Number(c);return(v^crypto.getRandomValues(new Uint8Array(1))[0]&15>>v/4).toString(16)})}}})();",
          }}
        />
        {/* 首屏前同步主题，避免亮暗闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('littlesu-theme')||'dark';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})()",
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
