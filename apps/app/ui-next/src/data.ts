import type { CSSProperties } from 'react';

export type TitleType = '电影' | '剧集' | '纪录片' | '综艺' | '动画';

export interface Episode {
  name: string;
  url: string;
}

export interface Title {
  id: string;
  name: string;
  en?: string;
  year: number;
  rating: number;
  type: TitleType;
  region: string;
  genres: string[];
  synopsis: string;
  episodes: number;
  duration: string;
  hue: number;
  source: string;
  quality: string;
  badge?: string;
  /** 真实数据补充字段（mock 数据可缺省） */
  key?: string;
  poster?: string;
  sourceKey?: string;
  vodId?: string;
  sources?: string[];
  episodesList?: Episode[];
  /** 同一源内的多线路（vod_play_from + vod_play_url 的 $$$ 分组） */
  playLines?: { name: string; episodes: Episode[] }[];
  /** 从详情页进入播放页时指定的线路下标 */
  playLineIndex?: number;
  playUrl?: string;
  progress?: number;
  note?: string;
  /** 同片多源变体，用于播放地址回退 */
  variants?: { sourceKey: string; sourceName: string; vodId: string; playable: number }[];
  playable?: number;
}

export type SourceStatus = 'ok' | 'backup' | 'experimental';

export interface SourceItem {
  key: string;
  name: string;
  host: string;
  status: SourceStatus;
  latency: number;
  note?: string;
}

export interface Channel {
  id: string;
  name: string;
  group: string;
  hue: number;
  source: string;
}

export interface HistoryItem {
  titleId: string;
  progress: number;
  episode: string;
  watchedAt: string;
}

export const titles: Title[] = [
  {
    id: 'qingyu-nian-2',
    name: '庆余年 第二季',
    en: 'Joy of Life S2',
    year: 2024,
    rating: 8.9,
    type: '剧集',
    region: '中国大陆',
    genres: ['古装', '权谋', '剧情'],
    synopsis: '范闲重返京都，在朝堂与江湖之间继续追查身世真相。新的对手与旧的盟约同时逼近，每一步都牵动庆国格局。',
    episodes: 36,
    duration: '45 分钟/集',
    hue: 266,
    source: '量子资源',
    quality: '4K',
    badge: '本周精选',
  },
  {
    id: 'wandering-earth-2',
    name: '流浪地球 2',
    en: 'The Wandering Earth II',
    year: 2023,
    rating: 8.3,
    type: '电影',
    region: '中国大陆',
    genres: ['科幻', '灾难', '冒险'],
    synopsis: '太阳危机迫近，人类在分歧与牺牲中搭建行星发动机。一次跨越数十年的选择，决定了地球能否启程。',
    episodes: 1,
    duration: '173 分钟',
    hue: 204,
    source: '非凡影视',
    quality: '4K',
    badge: '编辑推荐',
  },
  {
    id: 'blossoms-shanghai',
    name: '繁花',
    en: 'Blossoms Shanghai',
    year: 2023,
    rating: 8.7,
    type: '剧集',
    region: '中国大陆',
    genres: ['剧情', '年代', '都市'],
    synopsis: '九十年代的上海，阿宝在黄河路的灯火与生意场之间沉浮。时代向前，人的选择被留在霓虹与雨夜里。',
    episodes: 30,
    duration: '46 分钟/集',
    hue: 32,
    source: '暴风资源',
    quality: '1080P',
  },
  {
    id: 'three-body',
    name: '三体',
    en: 'Three-Body',
    year: 2023,
    rating: 8.7,
    type: '剧集',
    region: '中国大陆',
    genres: ['科幻', '悬疑', '剧情'],
    synopsis: '纳米科学家汪淼被卷入一连串反常事件，倒计时、三体游戏与红岸基地的旧档案逐渐拼出文明接触的真相。',
    episodes: 30,
    duration: '44 分钟/集',
    hue: 188,
    source: '电影天堂',
    quality: '4K',
  },
  {
    id: 'long-season',
    name: '漫长的季节',
    en: 'The Long Season',
    year: 2023,
    rating: 9.4,
    type: '剧集',
    region: '中国大陆',
    genres: ['悬疑', '犯罪', '年代'],
    synopsis: '一桩旧案把三个下岗工人重新拉回九十年代的东北。时间像一列慢车，载着未说出口的告别。',
    episodes: 12,
    duration: '50 分钟/集',
    hue: 46,
    source: '极速资源',
    quality: '1080P',
    badge: '口碑佳作',
  },
  {
    id: 'knockout',
    name: '狂飙',
    en: 'The Knockout',
    year: 2023,
    rating: 8.5,
    type: '剧集',
    region: '中国大陆',
    genres: ['犯罪', '剧情', '悬疑'],
    synopsis: '一名基层刑警与一个鱼贩出身的商人，在二十年里反复交锋。黑白之间的界线，被时代与欲望不断改写。',
    episodes: 39,
    duration: '45 分钟/集',
    hue: 2,
    source: '360资源',
    quality: '1080P',
  },
  {
    id: 'nirvana-in-fire',
    name: '琅琊榜',
    en: 'Nirvana in Fire',
    year: 2015,
    rating: 9.4,
    type: '剧集',
    region: '中国大陆',
    genres: ['古装', '权谋', '剧情'],
    synopsis: '梅长苏以病弱之身重返金陵，扶持新君、洗雪旧冤。江左盟的棋局里，每一步都指向十二年前的赤焰案。',
    episodes: 54,
    duration: '45 分钟/集',
    hue: 218,
    source: '最大资源',
    quality: '1080P',
  },
  {
    id: 'let-bullets-fly',
    name: '让子弹飞',
    en: 'Let the Bullets Fly',
    year: 2010,
    rating: 9.0,
    type: '电影',
    region: '中国大陆',
    genres: ['喜剧', '动作', '剧情'],
    synopsis: '土匪、县长与地方豪强在鹅城相遇，一场关于权力、金钱与尊严的博弈，在枪声和笑声里不断翻盘。',
    episodes: 1,
    duration: '132 分钟',
    hue: 14,
    source: '天涯资源',
    quality: '4K',
  },
  {
    id: 'interstellar',
    name: '星际穿越',
    en: 'Interstellar',
    year: 2014,
    rating: 9.4,
    type: '电影',
    region: '美国',
    genres: ['科幻', '冒险', '剧情'],
    synopsis: '地球环境恶化，一群宇航员穿越虫洞寻找新家园。时间在不同星球上以不同速度流逝，爱成为唯一的坐标。',
    episodes: 1,
    duration: '169 分钟',
    hue: 210,
    source: '艾旦资源',
    quality: '4K',
  },
  {
    id: 'oppenheimer',
    name: '奥本海默',
    en: 'Oppenheimer',
    year: 2023,
    rating: 8.9,
    type: '电影',
    region: '美国',
    genres: ['传记', '历史', '剧情'],
    synopsis: '原子弹之父在科学与政治之间被推上历史舞台。爆炸的光照亮世界，也把一个人的后半生留在阴影里。',
    episodes: 1,
    duration: '180 分钟',
    hue: 36,
    source: '非凡资源',
    quality: '4K',
  },
  {
    id: 'spider-verse',
    name: '蜘蛛侠：纵横宇宙',
    en: 'Spider-Man: Across the Spider-Verse',
    year: 2023,
    rating: 8.5,
    type: '动画',
    region: '美国',
    genres: ['动画', '科幻', '动作'],
    synopsis: '迈尔斯穿越多元宇宙，与来自不同时空的蜘蛛侠并肩作战。拯救世界的代价，可能是失去最想守护的人。',
    episodes: 1,
    duration: '140 分钟',
    hue: 302,
    source: '量子资源',
    quality: '4K',
  },
  {
    id: 'zhenhuan',
    name: '甄嬛传',
    en: 'Empresses in the Palace',
    year: 2011,
    rating: 9.4,
    type: '剧集',
    region: '中国大陆',
    genres: ['古装', '宫斗', '剧情'],
    synopsis: '甄嬛从天真少女走到深宫权力中心。每一次选择都伴随失去，最终留下的，是无人能懂的孤独。',
    episodes: 76,
    duration: '45 分钟/集',
    hue: 330,
    source: '最大资源',
    quality: '1080P',
  },
  {
    id: 'planet-earth-3',
    name: '地球脉动 第三季',
    en: 'Planet Earth III',
    year: 2023,
    rating: 9.8,
    type: '纪录片',
    region: '英国',
    genres: ['自然', '纪录片'],
    synopsis: '从海岸到雨林，从沙漠到冰原，镜头记录动物在变化环境中的生存策略，也记录人类与自然的关系。',
    episodes: 8,
    duration: '58 分钟/集',
    hue: 158,
    source: '电影天堂',
    quality: '4K',
    badge: '高分纪录片',
  },
  {
    id: 'the-last-of-us',
    name: '最后生还者',
    en: 'The Last of Us',
    year: 2023,
    rating: 8.8,
    type: '剧集',
    region: '美国',
    genres: ['剧情', '科幻', '冒险'],
    synopsis: '文明崩塌二十年后，乔尔护送艾莉穿越美国。两个陌生人被迫互相依靠，在废墟里重新理解“活着”。',
    episodes: 9,
    duration: '55 分钟/集',
    hue: 100,
    source: '非凡影视',
    quality: '4K',
  },
];

export const recommendedSources: SourceItem[] = [
  { key: 'lzi', name: '量子资源', host: 'cj.lziapi.com', status: 'ok', latency: 320 },
  { key: 'ffzy', name: '非凡影视', host: 'ffzy5.tv', status: 'ok', latency: 410 },
  { key: 'ffzyapi', name: '非凡资源', host: 'cj.ffzyapi.com', status: 'ok', latency: 380 },
  { key: 'bfzy', name: '暴风资源', host: 'bfzyapi.com', status: 'ok', latency: 520 },
  { key: 'zy360', name: '360资源', host: '360zy.com', status: 'ok', latency: 610 },
  { key: 'dyttzy', name: '电影天堂', host: 'caiji.dyttzyapi.com', status: 'ok', latency: 450 },
  { key: 'jisu', name: '极速资源', host: 'jszyapi.com', status: 'ok', latency: 560 },
  { key: 'zuid', name: '最大资源', host: 'api.zuidapi.com', status: 'ok', latency: 700 },
  { key: 'tyyszy', name: '天涯资源', host: 'tyyszy.com', status: 'ok', latency: 840 },
  { key: 'lovedan', name: '艾旦资源', host: 'lovedan.net', status: 'ok', latency: 920 },
];

export const backupSources: SourceItem[] = [
  { key: 'xiaomaomi', name: '小猫咪资源', host: 'zy.xiaomaomi.cc', status: 'backup', latency: -1, note: '当前 502' },
  { key: 'ruyi', name: '如意资源', host: 'cj.rycjapi.com', status: 'backup', latency: -1, note: '当前不可达' },
  { key: 'dbzy', name: '豆瓣资源', host: 'dbzy.com', status: 'backup', latency: -1, note: '当前超时' },
  { key: 'mozhua', name: '魔爪资源', host: 'mozhuazy.com', status: 'backup', latency: -1, note: '当前不可达' },
  { key: 'yinghua', name: '樱花资源', host: 'm3u8.apiyhzy.com', status: 'backup', latency: -1, note: '当前 403' },
  { key: 'wwzy', name: '旺旺短剧', host: 'wwzy.tv', status: 'backup', latency: -1, note: '当前超时' },
  { key: 'ikun', name: 'iKun资源', host: 'ikunzyapi.com', status: 'backup', latency: -1, note: '当前不可达' },
  { key: 'zuidazy', name: '最大资源2', host: 'zuidazy.me', status: 'backup', latency: 1100, note: '与最大资源同源' },
  { key: 'ffzy2', name: '非凡2', host: 'ffzy.tv', status: 'backup', latency: 760, note: '与非凡资源同源' },
  { key: 'hongniu', name: '红牛资源', host: 'hongniuzy2.com', status: 'backup', latency: 860, note: '详情接口异常' },
  { key: 'subocj', name: '速播资源', host: 'subocj.com', status: 'backup', latency: -1, note: '当前超时' },
  { key: 'modu', name: '魔都资源', host: 'caiji.moduapi.cc', status: 'backup', latency: -1, note: '当前超时' },
];

export const experimentalSources: SourceItem[] = [
  { key: 'heimuer', name: '黑木耳', host: 'json.heimuer.xyz', status: 'experimental', latency: -1, note: '接口返回网页' },
  { key: 'wolong', name: '卧龙资源', host: 'wolongzyw.com', status: 'experimental', latency: -1, note: '接口返回网页' },
  { key: 'hwba', name: '华为吧', host: 'cjhwba.com', status: 'experimental', latency: -1, note: '接口返回网页' },
];

export const allSources: SourceItem[] = [...recommendedSources, ...backupSources, ...experimentalSources];

export const liveSources = [
  { key: 'cn', name: 'IPTV·中国', count: 149, epg: 'https://epg.pw/xmltv/epg_CN.xml', url: 'https://iptv-org.github.io/iptv/countries/cn.m3u' },
  { key: 'hk', name: 'IPTV·香港', count: 17, epg: '', url: 'https://iptv-org.github.io/iptv/countries/hk.m3u' },
  { key: 'movies', name: 'IPTV·电影', count: 776, epg: '', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { key: 'doc', name: 'IPTV·纪录片', count: 253, epg: '', url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u' },
  { key: 'jd', name: '简单TV', count: 67, epg: '', url: 'http://iptv.ruyitv.cc/m3u/tv.txt' },
];

export const channels: Channel[] = [
  { id: 'cctv1', name: 'CCTV-1 综合', group: '央视', hue: 0, source: 'IPTV·中国' },
  { id: 'cctv2', name: 'CCTV-2 财经', group: '央视', hue: 25, source: 'IPTV·中国' },
  { id: 'cctv5', name: 'CCTV-5 体育', group: '央视', hue: 150, source: 'IPTV·中国' },
  { id: 'cctv6', name: 'CCTV-6 电影', group: '央视', hue: 280, source: 'IPTV·中国' },
  { id: 'cctv9', name: 'CCTV-9 纪录', group: '央视', hue: 190, source: 'IPTV·中国' },
  { id: 'cctv13', name: 'CCTV-13 新闻', group: '央视', hue: 210, source: 'IPTV·中国' },
  { id: 'hunan', name: '湖南卫视', group: '卫视', hue: 32, source: 'IPTV·中国' },
  { id: 'zhejiang', name: '浙江卫视', group: '卫视', hue: 200, source: 'IPTV·中国' },
  { id: 'jiangsu', name: '江苏卫视', group: '卫视', hue: 350, source: 'IPTV·中国' },
  { id: 'dragon', name: '东方卫视', group: '卫视', hue: 275, source: 'IPTV·中国' },
  { id: 'beijing', name: '北京卫视', group: '卫视', hue: 15, source: 'IPTV·中国' },
  { id: 'guangdong', name: '广东卫视', group: '卫视', hue: 125, source: 'IPTV·中国' },
  { id: 'phoenix', name: '凤凰中文', group: '港澳', hue: 45, source: 'IPTV·香港' },
  { id: 'jade', name: '翡翠台', group: '港澳', hue: 95, source: 'IPTV·香港' },
  { id: 'cctv6-movie', name: 'CHC 家庭影院', group: '电影', hue: 310, source: 'IPTV·电影' },
  { id: 'doc-human', name: '人文地理', group: '纪录', hue: 170, source: 'IPTV·纪录片' },
];

export const hotSearches = ['庆余年', '流浪地球', '繁花', '三体', '漫长的季节', '狂飙'];

export const historyItems: HistoryItem[] = [
  { titleId: 'qingyu-nian-2', progress: 68, episode: '第 12 集', watchedAt: '今天 21:40' },
  { titleId: 'long-season', progress: 42, episode: '第 5 集', watchedAt: '今天 18:12' },
  { titleId: 'wandering-earth-2', progress: 24, episode: '正片', watchedAt: '昨天 23:05' },
  { titleId: 'three-body', progress: 86, episode: '第 26 集', watchedAt: '昨天 20:18' },
  { titleId: 'blossoms-shanghai', progress: 12, episode: '第 2 集', watchedAt: '10 月 24 日' },
];

export function findTitle(id: string | undefined): Title | undefined {
  return titles.find((t) => t.id === id);
}

export function titleHueStyle(hue: number): CSSProperties {
  return { '--h': hue } as React.CSSProperties;
}
