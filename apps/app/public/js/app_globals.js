// 全局变量
let selectedAPIs = JSON.parse(localStorage.getItem('selectedAPIs') || '["lzi","ffzy","ffzyapi","bfzy","zy360","dyttzy","jisu","zuid","tyyszy","lovedan"]'); // 默认选中实测可用的 10 个源
let customAPIs = JSON.parse(localStorage.getItem('customAPIs') || '[]'); // 存储自定义API列表

// 添加当前播放的集数索引
let currentEpisodeIndex = 0;
// 添加当前视频的所有集数
let currentEpisodes = [];
// 添加当前视频的标题
let currentVideoTitle = '';
// 全局变量用于倒序状态
let episodesReversed = false;

// Note: window.currentDetailContext was removed as per previous comments in the original app.js
// If any other global variables are identified as needed during further refactoring, they can be added here.
