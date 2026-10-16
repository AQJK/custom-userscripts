// ==UserScript==
// @name         YouTube Mobile Lite: Simplified Home & Native Player (Custom Fork: History + Watch Later)
// @name:zh-CN   YouTube 移动版精简：首页与原生播放器
// @name:zh-TW   YouTube 行動版精簡：首頁與原生播放器
// @name:ja      YouTube Mobile Lite：シンプルホーム＆ネイティブプレーヤー
// @namespace    https://github.com/AQJK/youtube-mobile-lite
// @version      0.2.1
// @description  Rebuilds YouTube mobile with an iOS-style pure video feed (Recommended & Subscriptions), creator profiles, native comments, high-quality DASH/HLS playback, background audio, search, and playlists—with zero Shorts.
// @description:zh-CN 将 YouTube 移动版重构为无 Shorts 的 iOS 风格纯视频流（推荐与订阅）、创作者主页与原生评论区，支持高画质 DASH/HLS、后台音频、搜索与播放列表。
// @description:zh-TW 將 YouTube 行動版重構為無 Shorts 的 iOS 風格純影片流（推薦與訂閱）、創作者主頁與原生留言區，支援高畫質 DASH/HLS、背景音訊、搜尋與播放清單。
// @description:ja YouTubeモバイルをショート動画なしのiOS風動画フィード（おすすめ＆登録チャンネル）、チャンネルページ、ネイティブコメント欄に再構築し、高画質DASH/HLS、バックグラウンド音声、検索、再生リストに対応します。
// @author       hxueh
// @license      MIT
// @match        https://m.youtube.com/*
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/shaka-player@5.2.13/dist/shaka-player.dash.js#sha256=ohlgTlLfNJuagFCE7Zi6AI5JfGzEnCZKyEHLrBLx7SE=
// @grant        unsafeWindow
// @noframes
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9IiNmZjAwMDAiLz48cGF0aCBkPSJNMjUgMjAgTDQ1IDMyIEwyNSA0NCBaIiBmaWxsPSIjZmZmIi8+PC9zdmc+Cg==
// @downloadURL https://raw.githubusercontent.com/AQJK/custom-userscripts/main/youtube-mobile-lite.user.js
// @updateURL   https://raw.githubusercontent.com/AQJK/custom-userscripts/main/youtube-mobile-lite.user.js
// ==/UserScript==

(() => {
  "use strict";

  if (window.top !== window.self || location.hostname !== "m.youtube.com") {
    return;
  }

  installPageGuards();

  // Runs inside the page before YouTube's own scripts so it can block:
  //   - YouTube's heavy mobile player and Polymer app bundles on taken-over routes;
  //   - telemetry, QoE, ad-tracking, and log_event beacons.
  function installPageGuards() {
    const config = {
      dropScripts: [
        "/s/player/",
        "player-plasma-ias-phone",
        "/pagead/",
        "doubleclick\\.net",
      ],
      dropRequests: [
        "/youtubei/v1/log_event",
        "/api/stats/atr",
        "/api/stats/qoe",
        "/api/stats/watchtime",
        "/ptracking",
        "/pagead/",
        "/pcs/activeview",
      ],
      dropPrefetch: [
        "/s/player/",
        "\\.map(\\?|$)",
      ],
    };

    const pageWindow = typeof unsafeWindow === "object" && unsafeWindow ? unsafeWindow : window;
    try {
      // Calling the guard directly avoids injecting a script string, which is
      // rejected by YouTube's Trusted Types policy in Safari and other browsers.
      pageGuard(config, pageWindow);
    } catch (error) {
      console.warn("[youtube-mobile-lite] unable to install page guards", error);
    }
  }

  function pageGuard(config, targetWindow = window) {
    const { document, location, Node, Element, HTMLScriptElement, HTMLLinkElement,
      XMLHttpRequest, Response, URL, Event, ProgressEvent, MutationObserver, navigator } = targetWindow;
    if (targetWindow.__ymNativePageGuard) return;
    targetWindow.__ymNativePageGuard = true;

    const toRules = (list) => (list || []).map((source) => new RegExp(source, "i"));
    const dropScriptRules = toRules(config.dropScripts);
    const dropRequestRules = toRules(config.dropRequests);
    const dropPrefetchRules = toRules(config.dropPrefetch);
    const matches = (url, rules) => Boolean(url) && rules.some((rule) => rule.test(String(url)));
    const absolute = (url) => {
      try {
        return new URL(String(url), location.href).href;
      } catch {
        return String(url || "");
      }
    };

    function decide(node) {
      if (node instanceof HTMLScriptElement) {
        const src = node.src || node.getAttribute("src") || "";
        if (src && matches(src, dropScriptRules)) return "drop";
      } else if (node instanceof HTMLLinkElement) {
        const rel = String(node.rel || "").toLowerCase();
        if ((rel === "prefetch" || rel === "preload" || rel === "modulepreload") && matches(node.href, dropPrefetchRules)) {
          return "drop";
        }
      }
      return "";
    }

    function intercept(node) {
      const action = node instanceof Node ? decide(node) : "";
      if (action === "drop" && node instanceof HTMLScriptElement) {
        node.type = "javascript/blocked";
        setTimeout(() => node.dispatchEvent(new Event("error")), 0);
      }
      return action;
    }

    const nativeAppendChild = Node.prototype.appendChild;
    const nativeInsertBefore = Node.prototype.insertBefore;
    Node.prototype.appendChild = function appendChild(node) {
      if (intercept(node)) return node;
      return nativeAppendChild.call(this, node);
    };
    Node.prototype.insertBefore = function insertBefore(node, reference) {
      if (intercept(node)) return node;
      return nativeInsertBefore.call(this, node, reference);
    };
    for (const name of ["append", "prepend"]) {
      const native = Element.prototype[name];
      if (typeof native !== "function") continue;
      Element.prototype[name] = function (...nodes) {
        return native.apply(this, nodes.filter((node) => !intercept(node)));
      };
    }

    const parserObserver = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (decide(node) !== "drop") continue;
          if (node instanceof HTMLScriptElement) node.type = "javascript/blocked";
          node.remove();
        }
      }
    });
    parserObserver.observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => parserObserver.disconnect(), { once: true });

    const fakeBody = "{}";
    const nativeFetch = targetWindow.fetch;
    if (typeof nativeFetch === "function") {
      targetWindow.fetch = function fetch(input) {
        const url = absolute(typeof input === "string" || input instanceof URL ? input : input && input.url);
        if (matches(url, dropRequestRules)) {
          return Promise.resolve(new Response(fakeBody, { status: 200, headers: { "content-type": "application/json" } }));
        }
        return nativeFetch.apply(this, arguments);
      };
    }

    const xhrTargets = new WeakMap();
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function open(method, url) {
      xhrTargets.set(this, absolute(url));
      return nativeOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function send() {
      if (!matches(xhrTargets.get(this), dropRequestRules)) return nativeSend.apply(this, arguments);
      const xhr = this;
      const define = (key, value) => {
        try {
          Object.defineProperty(xhr, key, { configurable: true, value });
        } catch {
        }
      };
      define("readyState", 4);
      define("status", 200);
      define("statusText", "OK");
      define("responseText", fakeBody);
      define("response", xhr.responseType === "json" ? {} : fakeBody);
      setTimeout(() => {
        for (const type of ["readystatechange", "load", "loadend"]) xhr.dispatchEvent(new ProgressEvent(type));
      }, 0);
    };

    if (typeof navigator.sendBeacon === "function") {
      const nativeBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function sendBeacon(url) {
        if (matches(absolute(url), dropRequestRules)) return true;
        return nativeBeacon.apply(this, arguments);
      };
    }
  }

  const PAGE_WINDOW = typeof unsafeWindow === "object" && unsafeWindow ? unsafeWindow : window;
  const PAGE_NAVIGATOR = PAGE_WINDOW.navigator || navigator;
  const PAGE_MEDIA_METADATA = PAGE_WINDOW.MediaMetadata || globalThis.MediaMetadata;

  const SCRIPT_PREFIX = "ym-native";
  const STYLE_ID = `${SCRIPT_PREFIX}-style`;
  const ROUTE_EVENT = `${SCRIPT_PREFIX}-locationchange`;
  const HISTORY_HOOK_FLAG = `__${SCRIPT_PREFIX}Wrapped`;
  const LOG_PREFIX = "[youtube-mobile-lite]";
  const API_TIMEOUT_MS = 20_000;

  const HOME_ACTIVE_CLASS = `${SCRIPT_PREFIX}-home-active`;
  const SEARCH_ACTIVE_CLASS = `${SCRIPT_PREFIX}-search-active`;
  const PROFILE_ACTIVE_CLASS = `${SCRIPT_PREFIX}-profile-active`;
  const WATCH_ACTIVE_CLASS = `${SCRIPT_PREFIX}-watch-active`;

  const MEDIA_SESSION_POSITION_INTERVAL_MS = 1_000;
  const BACKGROUND_PAUSE_GRACE_MS = 2_500;
  const MAX_CONSECUTIVE_EMPTY_PAGES = 3;
  const HOME_MAX_PAGES = 80;
  const SEARCH_MAX_PAGES = 80;
  const PROFILE_MAX_PAGES = 80;
  const PLAYLIST_MAX_PAGES = 80;
  const COMMENT_MAX_PAGES = 80;
  const MEDIA_CAPABILITIES_MAX_CONCURRENCY = 3;
  const VIDEO_CAPABILITY_CACHE_LIMIT = 128;
  const TRACK_PREFETCH_TTL_MS = 25 * 60_000;
  const VIDEO_PREFETCH_LEAD_SECONDS = 30;

  const TAKEOVER_PENDING_KEY = "ym-native-takeover-pending";
  const TAKEOVER_DISABLED_KEY = "ym-native-takeover-disabled";
  // Autoplay is a lasting preference, so it lives in localStorage rather than
  // sessionStorage. A missing value means the default, which is on.
  const AUTOPLAY_STORAGE_KEY = "ym-native-autoplay";

  // Protobuf search filter params for pure videos:
  // Relevance (Videos only): EgIQAQ%3D%3D
  // YouTube no longer honours a bare upload-date sort (CAISAhAB returns the
  // relevance order), so "Newest" sorts by date within this week's uploads.
  // View count (Videos only): CAMSAhAB
  const SEARCH_SORT_PARAMS = Object.freeze({
    relevance: "EgIQAQ==",
    viewCount: "CAMSAhAB",
    uploadDate: "CAISBAgDEAE=",
  });

  // Channel "Videos" tab params (excludes Shorts & Live tabs)
  const CHANNEL_VIDEOS_TAB_PARAMS = "EgZ2aWRlb3PyBgQKAjoA";

  const UI_MESSAGES = Object.freeze({
    "zh-CN": Object.freeze({
      youtube: "YouTube",
      homeRecommended: "推荐",
      homeSubscriptions: "订阅",
      homeAria: "YouTube 移动版首页",
      refreshFeed: "刷新列表",
      recommendedVideos: "视频列表",
      homeEnd: "已经到底了",
      loadingMore: "正在加载更多",
      findingMoreContent: "正在过滤 Shorts 并查找更多视频",
      feedLoadFailed: "无法加载视频列表",
      subscriptionsSignInHint: "请先登录 YouTube 账号以查看订阅内容",
      signIn: "登录",
      reload: "重新加载",
      retry: "重试",
      searchAria: "YouTube 搜索",
      backToHome: "返回首页",
      searchTitle: "搜索",
      searchPlaceholder: "搜索 YouTube 视频",
      clearSearch: "清除搜索内容",
      searchSort: "搜索排序",
      sortRelevance: "综合",
      sortMostViewed: "最多观看",
      sortLatest: "最新发布",
      searchPrompt: "输入关键词查找视频",
      allResultsShown: "已显示全部结果",
      noResults: "没有找到相关视频",
      findingMoreResults: "正在查找更多视频",
      searchLoadFailed: "无法加载搜索结果",
      searchHint: "输入创作者、主题或视频标题进行搜索",
      back: "返回",
      playlistTitle: "播放列表",
      episodeMetaOne: "共 {count} 个视频",
      episodeMetaOther: "共 {count} 个视频",
      nativePlayerAria: "原生 HTML5 媒体播放器",
      audioOnlyPlayer: "仅音频播放器",
      audioOnlyMode: "仅音频模式",
      audioOnlySubtitle: "切换 App 或锁屏后可继续后台播放",
      playAudio: "播放音频",
      pauseAudio: "暂停音频",
      audioProgress: "音频播放进度",
      loadingVideo: "正在加载视频",
      loadingAudio: "正在加载音频",
      loadingHighQualityDash: "正在加载高画质 DASH",
      nativePlayer: "原生播放器",
      selectPlaylistVideo: "选择播放列表视频",
      selectVideoQuality: "选择视频清晰度",
      subtitlesLoading: "正在加载字幕…",
      subtitlesFailed: "字幕加载失败，请重新选择语言重试。",
      audioOnly: "仅音频",
      switchAudioMode: "切换到仅音频模式",
      switchVideoMode: "切换回视频模式",
      watchVideo: "看视频",
      audioBackground: "仅音频 · 后台播放",
      fullscreen: "全屏",
      enterFullscreen: "进入全屏",
      playbackFailed: "无法提取该视频的原生播放源。",
      allMediaFailed: "所有原生媒体地址均加载失败。",
      highQuality: "高画质",
      qualityAuto: "自动",
      qualityHighest: "最高",
      autoDash: "自动 DASH",
      coverLoadFailed: "封面加载失败",
      openCreatorProfile: "查看 {name} 的频道",
      profileAria: "{name} 的频道主页",
      profileTitle: "频道主页",
      profileVideos: "视频",
      profileLoading: "正在加载频道主页",
      profileLoadFailed: "无法加载频道主页",
      profileVideosLoadFailed: "无法加载频道视频",
      profileNoVideos: "暂未发布长视频",
      profileEnd: "已显示全部视频",
      profileVerified: "已验证",
      profileSubscribe: "订阅",
      profileSubscribed: "已订阅",
      profileSubLoading: "处理中",
      profileSubscribeCreator: "订阅 {name}",
      profileUnsubscribeCreator: "取消订阅 {name}",
      profileSubscribeFailed: "订阅操作失败，请重试",
      commentsAria: "视频评论",
      commentsTitle: "评论",
      commentsTop: "最热",
      commentsNewest: "最新",
      commentsSort: "评论排序",
      commentsLoading: "正在加载评论",
      commentsLoadFailed: "无法加载评论",
      commentsNoComments: "还没有评论",
      commentsClosed: "评论区已关闭",
      commentsEnd: "已显示全部评论",
      commentsPinned: "置顶",
      commentsCreator: "创作者",
      commentsReplyCountOne: "{count} 条回复",
      commentsReplyCountOther: "{count} 条回复",
      commentsAnonymous: "匿名用户",
      audioAlbum: "YouTube · 仅音频",
      audioGeneric: "音频",
      bitrateReported: "{bitrate} kbps",
      bitrateUnavailable: "码率未知",
      highestAvailable: "最高音质",
      pageLoadFailed: "页面加载失败",
      pageLoadFailedHint: "请检查网络后重试。",
      previousTrack: "上一个",
      nextTrack: "下一个",
      autoplay: "自动播放",
      autoplayOn: "自动播放已开启",
      autoplayOff: "自动播放已关闭",
      playAll: "全部播放",
      playlistLoading: "正在加载播放列表",
      playlistLoadFailed: "无法加载播放列表",
      playlistEmpty: "此播放列表没有可播放的视频",
      playlistEnd: "已显示全部视频",
      openPlaylist: "打开播放列表",
    }),
    "zh-TW": Object.freeze({
      youtube: "YouTube",
      homeRecommended: "推薦",
      homeSubscriptions: "訂閱內容",
      homeAria: "YouTube 行動版首頁",
      refreshFeed: "重新整理",
      recommendedVideos: "影片列表",
      homeEnd: "已經到底了",
      loadingMore: "正在載入更多",
      findingMoreContent: "正在過濾 Shorts 並尋找更多影片",
      feedLoadFailed: "無法載入影片列表",
      subscriptionsSignInHint: "請先登入 YouTube 帳號以檢視訂閱內容",
      signIn: "登入",
      reload: "重新載入",
      retry: "重試",
      searchAria: "YouTube 搜尋",
      backToHome: "返回首頁",
      searchTitle: "搜尋",
      searchPlaceholder: "搜尋 YouTube 影片",
      clearSearch: "清除搜尋內容",
      searchSort: "搜尋排序",
      sortRelevance: "關聯性",
      sortMostViewed: "觀看次數",
      sortLatest: "上傳日期",
      searchPrompt: "輸入關鍵字尋找影片",
      allResultsShown: "已顯示所有結果",
      noResults: "沒有找到相關影片",
      findingMoreResults: "正在尋找更多影片",
      searchLoadFailed: "無法載入搜尋結果",
      searchHint: "輸入創作者、主題或影片標題進行搜尋",
      back: "返回",
      playlistTitle: "播放清單",
      episodeMetaOne: "共 {count} 部影片",
      episodeMetaOther: "共 {count} 部影片",
      nativePlayerAria: "原生 HTML5 媒體播放器",
      audioOnlyPlayer: "僅音訊播放器",
      audioOnlyMode: "僅音訊模式",
      audioOnlySubtitle: "切換 App 或鎖定螢幕後可繼續背景播放",
      playAudio: "播放音訊",
      pauseAudio: "暫停音訊",
      audioProgress: "音訊播放進度",
      loadingVideo: "正在載入影片",
      loadingAudio: "正在載入音訊",
      loadingHighQualityDash: "正在載入高畫質 DASH",
      nativePlayer: "原生播放器",
      selectPlaylistVideo: "選擇播放清單影片",
      selectVideoQuality: "選擇影片畫質",
      subtitlesLoading: "正在載入字幕…",
      subtitlesFailed: "字幕載入失敗，請重新選擇語言重試。",
      audioOnly: "僅音訊",
      switchAudioMode: "切換到僅音訊模式",
      switchVideoMode: "切換回影片模式",
      watchVideo: "看影片",
      audioBackground: "僅音訊 · 背景播放",
      fullscreen: "全螢幕",
      enterFullscreen: "進入全螢幕",
      playbackFailed: "無法取得此影片的原生播放來源。",
      allMediaFailed: "所有原生媒體網址均載入失敗。",
      highQuality: "高畫質",
      qualityAuto: "自動",
      qualityHighest: "最高",
      autoDash: "自動 DASH",
      coverLoadFailed: "封面載入失敗",
      openCreatorProfile: "檢視 {name} 的頻道",
      profileAria: "{name} 的頻道主頁",
      profileTitle: "頻道主頁",
      profileVideos: "影片",
      profileLoading: "正在載入頻道主頁",
      profileLoadFailed: "無法載入頻道主頁",
      profileVideosLoadFailed: "無法載入頻道影片",
      profileNoVideos: "尚未發布長影片",
      profileEnd: "已顯示所有影片",
      profileVerified: "已驗證",
      profileSubscribe: "訂閱",
      profileSubscribed: "已訂閱",
      profileSubLoading: "處理中",
      profileSubscribeCreator: "訂閱 {name}",
      profileUnsubscribeCreator: "取消訂閱 {name}",
      profileSubscribeFailed: "訂閱操作失敗，請再試一次",
      commentsAria: "影片留言",
      commentsTitle: "留言",
      commentsTop: "熱門",
      commentsNewest: "最新",
      commentsSort: "留言排序",
      commentsLoading: "正在載入留言",
      commentsLoadFailed: "無法載入留言",
      commentsNoComments: "尚無留言",
      commentsClosed: "留言功能已關閉",
      commentsEnd: "已顯示所有留言",
      commentsPinned: "置頂",
      commentsCreator: "創作者",
      commentsReplyCountOne: "{count} 則回覆",
      commentsReplyCountOther: "{count} 則回覆",
      commentsAnonymous: "匿名使用者",
      audioAlbum: "YouTube · 僅音訊",
      audioGeneric: "音訊",
      bitrateReported: "{bitrate} kbps",
      bitrateUnavailable: "位元率未知",
      highestAvailable: "最高音質",
      pageLoadFailed: "頁面載入失敗",
      pageLoadFailedHint: "請檢查網路後重試。",
      previousTrack: "上一個",
      nextTrack: "下一個",
      autoplay: "自動播放",
      autoplayOn: "自動播放已開啟",
      autoplayOff: "自動播放已關閉",
      playAll: "全部播放",
      playlistLoading: "正在載入播放清單",
      playlistLoadFailed: "無法載入播放清單",
      playlistEmpty: "此播放清單沒有可播放的影片",
      playlistEnd: "已顯示全部影片",
      openPlaylist: "開啟播放清單",
    }),
    en: Object.freeze({
      youtube: "YouTube",
      homeRecommended: "Recommended",
      homeSubscriptions: "Subscriptions",
      homeHistory: "History",
      homeWatchLater: "Watch Later",
      homeAria: "YouTube mobile home",
      refreshFeed: "Refresh videos",
      recommendedVideos: "Videos",
      homeEnd: "You’re all caught up",
      loadingMore: "Loading more",
      findingMoreContent: "Filtering Shorts and finding more videos",
      feedLoadFailed: "Couldn’t load videos",
      subscriptionsSignInHint: "Sign in to your YouTube account to view your subscriptions.",
      signInRequired: "Sign in to your YouTube account to view this tab.",
      historyEmpty: "Your watch history is empty",
      watchLaterEmpty: "Your Watch Later list is empty",
      signIn: "Sign in",
      reload: "Reload",
      retry: "Retry",
      searchAria: "YouTube search",
      backToHome: "Back to home",
      searchTitle: "Search",
      searchPlaceholder: "Search YouTube videos",
      clearSearch: "Clear search",
      searchSort: "Search sort order",
      sortRelevance: "Relevance",
      sortMostViewed: "Most viewed",
      sortLatest: "Newest",
      searchPrompt: "Enter keywords to find videos",
      allResultsShown: "All results shown",
      noResults: "No videos found",
      findingMoreResults: "Looking for more videos",
      searchLoadFailed: "Couldn’t load search results",
      searchHint: "Search creators, topics, or video titles",
      back: "Back",
      playlistTitle: "Playlist",
      episodeMetaOne: "{count} video",
      episodeMetaOther: "{count} videos",
      nativePlayerAria: "Native HTML5 media player",
      audioOnlyPlayer: "Audio-only player",
      audioOnlyMode: "Audio-only mode",
      audioOnlySubtitle: "Keep playing when switching apps or locking the screen",
      playAudio: "Play audio",
      pauseAudio: "Pause audio",
      audioProgress: "Audio playback position",
      loadingVideo: "Loading video",
      loadingAudio: "Loading audio",
      loadingHighQualityDash: "Loading high-quality DASH",
      nativePlayer: "Native player",
      selectPlaylistVideo: "Select playlist video",
      selectVideoQuality: "Select video quality",
      subtitlesLoading: "Loading subtitles…",
      subtitlesFailed: "Unable to load subtitles. Select a language to retry.",
      audioOnly: "Audio only",
      switchAudioMode: "Switch to audio-only mode",
      switchVideoMode: "Switch back to video",
      watchVideo: "Watch video",
      audioBackground: "Audio only · Background playback",
      fullscreen: "Fullscreen",
      enterFullscreen: "Enter fullscreen",
      playbackFailed: "Unable to extract a playable native stream for this video.",
      allMediaFailed: "All native media URLs failed to load.",
      highQuality: "High quality",
      qualityAuto: "Auto",
      qualityHighest: "Highest",
      autoDash: "Auto DASH",
      coverLoadFailed: "Thumbnail unavailable",
      openCreatorProfile: "Open {name}'s channel",
      profileAria: "{name}'s channel",
      profileTitle: "Channel",
      profileVideos: "Videos",
      profileLoading: "Loading channel",
      profileLoadFailed: "Unable to load this channel",
      profileVideosLoadFailed: "Unable to load videos",
      profileNoVideos: "No full-length videos published yet",
      profileEnd: "All videos shown",
      profileVerified: "Verified",
      profileSubscribe: "Subscribe",
      profileSubscribed: "Subscribed",
      profileSubLoading: "Working…",
      profileSubscribeCreator: "Subscribe to {name}",
      profileUnsubscribeCreator: "Unsubscribe from {name}",
      profileSubscribeFailed: "Couldn’t update subscription. Try again.",
      commentsAria: "Video comments",
      commentsTitle: "Comments",
      commentsTop: "Top",
      commentsNewest: "Newest",
      commentsSort: "Comment sort order",
      commentsLoading: "Loading comments",
      commentsLoadFailed: "Unable to load comments",
      commentsNoComments: "No comments yet",
      commentsClosed: "Comments are turned off",
      commentsEnd: "All comments shown",
      commentsPinned: "Pinned",
      commentsCreator: "Creator",
      commentsReplyCountOne: "{count} reply",
      commentsReplyCountOther: "{count} replies",
      commentsAnonymous: "Anonymous",
      audioAlbum: "YouTube · Audio only",
      audioGeneric: "Audio",
      bitrateReported: "{bitrate} kbps",
      bitrateUnavailable: "bitrate unavailable",
      highestAvailable: "highest available",
      pageLoadFailed: "This page couldn’t load",
      pageLoadFailedHint: "Check your connection and retry.",
      previousTrack: "Previous",
      nextTrack: "Next",
      autoplay: "Autoplay",
      autoplayOn: "Autoplay is on",
      autoplayOff: "Autoplay is off",
      playAll: "Play all",
      playlistLoading: "Loading playlist",
      playlistLoadFailed: "Unable to load this playlist",
      playlistEmpty: "This playlist has no playable videos",
      playlistEnd: "All videos shown",
      openPlaylist: "Open playlist",
    }),
    ja: Object.freeze({
      youtube: "YouTube",
      homeRecommended: "おすすめ",
      homeSubscriptions: "登録チャンネル",
      homeAria: "YouTubeモバイルホーム",
      refreshFeed: "フィードを更新",
      recommendedVideos: "動画一覧",
      homeEnd: "すべて表示しました",
      loadingMore: "さらに読み込み中",
      findingMoreContent: "ショート動画を除外して動画を探しています",
      feedLoadFailed: "動画を読み込めませんでした",
      subscriptionsSignInHint: "登録チャンネルを表示するにはログインしてください。",
      signIn: "ログイン",
      reload: "再読み込み",
      retry: "再試行",
      searchAria: "YouTube検索",
      backToHome: "ホームに戻る",
      searchTitle: "検索",
      searchPlaceholder: "YouTube動画を検索",
      clearSearch: "検索内容をクリア",
      searchSort: "検索結果の並び順",
      sortRelevance: "関連度順",
      sortMostViewed: "視聴回数順",
      sortLatest: "アップロード日順",
      searchPrompt: "キーワードを入力して動画を検索",
      allResultsShown: "すべての結果を表示しました",
      noResults: "該当する動画がありません",
      findingMoreResults: "さらに動画を探しています",
      searchLoadFailed: "検索結果を読み込めませんでした",
      searchHint: "チャンネル、トピック、動画タイトルを入力",
      back: "戻る",
      playlistTitle: "再生リスト",
      episodeMetaOne: "全{count}本",
      episodeMetaOther: "全{count}本",
      nativePlayerAria: "ネイティブHTML5メディアプレーヤー",
      audioOnlyPlayer: "音声のみプレーヤー",
      audioOnlyMode: "音声のみモード",
      audioOnlySubtitle: "Appを切り替えたり画面をロックした後も再生できます",
      playAudio: "音声を再生",
      pauseAudio: "音声を一時停止",
      audioProgress: "音声の再生位置",
      loadingVideo: "動画を読み込み中",
      loadingAudio: "音声を読み込み中",
      loadingHighQualityDash: "高画質DASHを読み込み中",
      nativePlayer: "ネイティブプレーヤー",
      selectPlaylistVideo: "再生リストの動画を選択",
      selectVideoQuality: "画質を選択",
      subtitlesLoading: "字幕を読み込み中…",
      subtitlesFailed: "字幕を読み込めません。言語を選び直してください。",
      audioOnly: "音声のみ",
      switchAudioMode: "音声のみモードに切り替え",
      switchVideoMode: "動画モードに戻る",
      watchVideo: "動画を見る",
      audioBackground: "音声のみ · バックグラウンド再生",
      fullscreen: "全画面",
      enterFullscreen: "全画面表示",
      playbackFailed: "この動画のネイティブ再生ソースを取得できませんでした。",
      allMediaFailed: "すべてのネイティブメディアURLを読み込めませんでした。",
      highQuality: "高画質",
      qualityAuto: "自動",
      qualityHighest: "最高",
      autoDash: "自動DASH",
      coverLoadFailed: "サムネイルを読み込めませんでした",
      openCreatorProfile: "{name}のチャンネルを開く",
      profileAria: "{name}のチャンネル",
      profileTitle: "チャンネル",
      profileVideos: "動画",
      profileLoading: "チャンネルを読み込み中",
      profileLoadFailed: "チャンネルを読み込めませんでした",
      profileVideosLoadFailed: "動画を読み込めませんでした",
      profileNoVideos: "動画はまだありません",
      profileEnd: "すべての動画を表示しました",
      profileVerified: "確認済み",
      profileSubscribe: "登録",
      profileSubscribed: "登録済み",
      profileSubLoading: "処理中…",
      profileSubscribeCreator: "{name}をチャンネル登録",
      profileUnsubscribeCreator: "{name}のチャンネル登録を解除",
      profileSubscribeFailed: "登録を更新できませんでした。もう一度お試しください。",
      commentsAria: "動画のコメント",
      commentsTitle: "コメント",
      commentsTop: "人気順",
      commentsNewest: "新しい順",
      commentsSort: "コメントの並び順",
      commentsLoading: "コメントを読み込み中",
      commentsLoadFailed: "コメントを読み込めませんでした",
      commentsNoComments: "コメントはまだありません",
      commentsClosed: "コメントはオフになっています",
      commentsEnd: "すべてのコメントを表示しました",
      commentsPinned: "固定",
      commentsCreator: "作成者",
      commentsReplyCountOne: "{count}件の返信",
      commentsReplyCountOther: "{count}件の返信",
      commentsAnonymous: "匿名ユーザー",
      audioAlbum: "YouTube · 音声のみ",
      audioGeneric: "音声",
      bitrateReported: "{bitrate} kbps",
      bitrateUnavailable: "ビットレート不明",
      highestAvailable: "最高音質",
      pageLoadFailed: "ページを読み込めませんでした",
      pageLoadFailedHint: "接続を確認して再試行してください。",
      previousTrack: "前へ",
      nextTrack: "次へ",
      autoplay: "自動再生",
      autoplayOn: "自動再生：オン",
      autoplayOff: "自動再生：オフ",
      playAll: "すべて再生",
      playlistLoading: "再生リストを読み込み中",
      playlistLoadFailed: "再生リストを読み込めませんでした",
      playlistEmpty: "再生できる動画がありません",
      playlistEnd: "すべての動画を表示しました",
      openPlaylist: "再生リストを開く",
    }),
  });

  const UI_LOCALE = detectUILocale();
  const UI_LANGUAGE_TAG = UI_LOCALE;

  function detectUILocale() {
    const candidates = [
      ...(Array.isArray(PAGE_NAVIGATOR.languages) ? PAGE_NAVIGATOR.languages : []),
      PAGE_NAVIGATOR.language,
    ];
    for (const candidate of candidates) {
      const language = String(candidate || "").trim().replaceAll("_", "-").toLowerCase();
      if (!language) continue;
      if (language === "ja" || language.startsWith("ja-")) return "ja";
      if (language === "zh" || language.startsWith("zh-")) {
        return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(language) ? "zh-TW" : "zh-CN";
      }
      if (language === "en" || language.startsWith("en-")) return "en";
    }
    return "en";
  }

  function t(key, values = null) {
    const template = String(UI_MESSAGES[UI_LOCALE]?.[key] ?? UI_MESSAGES.en[key] ?? key);
    if (!values) return template;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) =>
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : `{${name}}`,
    );
  }

  function applyUILanguage(element) {
    if (element instanceof HTMLElement) element.lang = UI_LANGUAGE_TAG;
    return element;
  }

  function readSession(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeSession(key, value) {
    try {
      if (value == null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
    }
  }

  function isAutoplayEnabled() {
    try {
      return localStorage.getItem(AUTOPLAY_STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  }

  function setAutoplayEnabled(enabled) {
    try {
      localStorage.setItem(AUTOPLAY_STORAGE_KEY, enabled ? "on" : "off");
    } catch {
    }
  }

  function markTakeoverRendered() {
    if (readSession(TAKEOVER_PENDING_KEY) === location.pathname) {
      writeSession(TAKEOVER_PENDING_KEY, null);
    }
  }

  // Home hosts three feed tabs; each one owns a stable path so deep links and
  // reloads land on the same tab. `/feed/history` and `/feed/watch-later` are
  // ours: they route to the home shell instead of YouTube's own pages. The old
  // `/feed/subscriptions` path stays owned as an alias for Recommended.
  const HOME_TAB_DEFS = [
    { id: "recommended", path: "/", labelKey: "homeRecommended" },
    { id: "history", path: "/feed/history", labelKey: "homeHistory" },
    { id: "watchLater", path: "/feed/watch-later", labelKey: "homeWatchLater" },
  ];

  function homeTabForPath(pathname) {
    return HOME_TAB_DEFS.find((tab) => tab.path === pathname)?.id || "recommended";
  }

  function isHomePath(pathname) {
    return HOME_TAB_DEFS.some((tab) => tab.path === pathname) ||
      pathname === "/index.html" ||
      pathname === "/feed/subscriptions";
  }

  function isSearchPath(pathname) {
    return pathname === "/results" || pathname === "/search";
  }

  function isChannelPath(pathname) {
    return /^\/(?:@[^/?#]+|channel\/UC[\w-]+|c\/[^/?#]+|user\/[^/?#]+)(?:\/|$)/i.test(pathname);
  }

  function isWatchPath(pathname) {
    return /^\/watch\/?$/i.test(pathname);
  }

  function isPlaylistPath(pathname) {
    return /^\/playlist\/?$/i.test(pathname);
  }

  function isShortsPath(pathname) {
    return /^\/shorts\/([\w-]{11})/i.test(pathname);
  }

  function isOwnedPath(pathname) {
    return (
      isHomePath(pathname) ||
      isSearchPath(pathname) ||
      isChannelPath(pathname) ||
      isWatchPath(pathname) ||
      isPlaylistPath(pathname)
    );
  }

  // Capture any ytcfg visitorData or API key before taking over the document.
  let cachedVisitorData = "";
  let cachedInnertubeApiKey = "";
  let cachedInnertubeClient = null;
  let cachedAuthUser = "0";
  let configBootstrapped = false;

  function cacheInnertubeConfig(config) {
    cachedVisitorData = String(config.VISITOR_DATA || cachedVisitorData);
    cachedInnertubeApiKey = String(config.INNERTUBE_API_KEY || cachedInnertubeApiKey);
    if (config.INNERTUBE_CONTEXT?.client) cachedInnertubeClient = config.INNERTUBE_CONTEXT.client;
    if (config.SESSION_INDEX != null) cachedAuthUser = String(config.SESSION_INDEX);
  }

  async function ensureInnertubeConfig(signal) {
    harvestInitialPageConfig();
    if (configBootstrapped || cachedInnertubeClient) return;
    try {
      // Document takeover removes YouTube's startup scripts. Read their JSON
      // configuration without executing them so requests still use a current client.
      const html = await youtubePageRequest("GET", `${location.origin}/`, { signal, responseType: "text" });
      const configs = html.matchAll(/ytcfg\.set\s*\(\s*(\{[\s\S]*?\})\s*\)\s*;/g);
      for (const match of configs) {
        try {
          cacheInnertubeConfig(JSON.parse(match[1]));
        } catch {
          // Skip non-JSON script fragments; never evaluate downloaded JavaScript.
        }
      }
      configBootstrapped = Boolean(cachedInnertubeClient);
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.debug(`${LOG_PREFIX} configuration bootstrap failed; using fallback client`, error);
    }
  }
  function harvestInitialPageConfig() {
    try {
      const ytcfg = PAGE_WINDOW.ytcfg;
      if (ytcfg && typeof ytcfg.get === "function") {
        cacheInnertubeConfig({
          VISITOR_DATA: ytcfg.get("VISITOR_DATA"),
          INNERTUBE_API_KEY: ytcfg.get("INNERTUBE_API_KEY"),
          INNERTUBE_CONTEXT: ytcfg.get("INNERTUBE_CONTEXT"),
          SESSION_INDEX: ytcfg.get("SESSION_INDEX"),
        });
      }
    } catch {
    }
  }

  function takeOverDocumentIfOwned() {
    harvestInitialPageConfig();
    if (document.readyState !== "loading" || !isOwnedPath(location.pathname)) {
      return false;
    }
    if (readSession(TAKEOVER_DISABLED_KEY)) return false;
    if (readSession(TAKEOVER_PENDING_KEY) === location.pathname) {
      writeSession(TAKEOVER_PENDING_KEY, null);
      writeSession(TAKEOVER_DISABLED_KEY, "1");
      return false;
    }
    writeSession(TAKEOVER_PENDING_KEY, location.pathname);
    let built = tryBuildOwnedDocument();
    try {
      window.stop();
    } catch {
    }
    if (!built || !ownedDocumentIsIntact()) built = tryBuildOwnedDocument();
    if (!built) {
      writeSession(TAKEOVER_PENDING_KEY, null);
      return false;
    }
    return true;
  }

  function tryBuildOwnedDocument() {
    try {
      // Build nodes rather than writing an HTML string. Besides respecting
      // Trusted Types, this avoids clearing the document before a failed write.
      const root = document.createElement("html");
      root.lang = UI_LANGUAGE_TAG;
      root.className = `${SCRIPT_PREFIX}-takeover`;
      const head = document.createElement("head");
      for (const attributes of [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "color-scheme", content: "light dark" },
        { name: "referrer", content: "origin-when-cross-origin" },
      ]) {
        const meta = document.createElement("meta");
        for (const [key, value] of Object.entries(attributes)) meta.setAttribute(key, value);
        head.appendChild(meta);
      }
      const title = document.createElement("title");
      title.textContent = t("youtube");
      const icon = document.createElement("link");
      icon.rel = "icon";
      icon.href = "https://www.youtube.com/favicon.ico";
      head.append(title, icon);
      const body = document.createElement("body");
      const app = document.createElement("div");
      app.id = "app";
      body.appendChild(app);
      root.append(head, body);
      // Preserve the existing doctype. Replacing a whole Document with a
      // fragment containing a new doctype can fail before removing its old root.
      const currentRoot = document.documentElement;
      if (currentRoot) currentRoot.replaceWith(root);
      else document.appendChild(root);
    } catch (error) {
      console.warn(`${LOG_PREFIX} unable to build the page`, error);
    }
    return ownedDocumentIsIntact();
  }

  function ownedDocumentIsIntact() {
    const root = document.documentElement;
    const app = document.getElementById("app");
    return Boolean(root?.classList.contains(`${SCRIPT_PREFIX}-takeover`) && document.body && app?.isConnected);
  }

  function setPageTitle(title) {
    const value = String(title || "").trim();
    document.title = value ? `${value} - ${t("youtube")}` : t("youtube");
  }

  function showTakeoverFailure() {
    if (!document.body) return;
    markTakeoverRendered();
    const shell = createElement("main", "ym-takeover-failure");
    applyUILanguage(shell);
    shell.setAttribute("role", "alert");
    const title = createElement("h1", "ym-takeover-failure-title");
    title.textContent = t("pageLoadFailed");
    const hint = createElement("p", "ym-takeover-failure-hint");
    hint.textContent = t("pageLoadFailedHint");
    const actions = createElement("div", "ym-takeover-failure-actions");
    const retry = createElement("button", "ym-button");
    retry.type = "button";
    retry.textContent = t("retry");
    retry.addEventListener("click", () => location.reload());
    actions.append(retry);
    shell.append(title, hint, actions);
    document.querySelectorAll(".ym-takeover-failure").forEach((node) => node.remove());
    document.body.appendChild(shell);
  }

  if (isShortsPath(location.pathname) && document.readyState === "loading") {
    // Shorts are not supported; leave before YouTube's Shorts player boots.
    location.replace("/");
    return;
  }

  const TAKEOVER_ACTIVE = takeOverDocumentIfOwned();
  injectStyle();

  let routeCleanup = () => {};
  let routeAbortController = null;
  let routeGeneration = 0;
  let routeKey = "";
  let routeInitKey = "";
  let dashPlaybackSupportedCache;
  let shakaPolyfillsInstalled = false;
  let suppressedRouteNotifications = 0;
  let pendingPlayerHandoff = null;
  const videoDecodingCapabilityCache = new Map();
  const mediaCapabilityQueue = [];
  let activeMediaCapabilityProbes = 0;
  const audioTypeSupportCache = new Map();
  let audioSupportProbe = null;
  let compactCountFormatter = null;
  let compactCountFormatterInitialized = false;

  installHistoryHooks();
  window.addEventListener("popstate", notifyLocationChange);
  // These page events provide a fallback if the manager cannot wrap page history.
  document.addEventListener("yt-navigate-finish", notifyLocationChange);
  document.addEventListener("yt-page-data-updated", notifyLocationChange);
  window.addEventListener(ROUTE_EVENT, () => void runRoute());
  document.addEventListener("DOMContentLoaded", () => void runRoute(), { once: true });
  window.addEventListener("load", () => void runRoute(), { once: true });
  void runRoute();

  async function runRoute(force = false) {
    harvestInitialPageConfig();
    if (isShortsPath(location.pathname)) {
      history.replaceState(history.state, "", "/");
    }

    const nextRouteKey = `${location.pathname}${location.search}`;
    if (!force && (nextRouteKey === routeKey || routeInitKey === nextRouteKey)) return;
    routeKey = nextRouteKey;
    routeInitKey = nextRouteKey;

    const generation = ++routeGeneration;
    document.querySelectorAll(".ym-takeover-failure").forEach((node) => node.remove());
    // The takeover document is up; clear the crash marker now so a reload or
    // navigation during a slow network fetch does not disable the takeover.
    if (TAKEOVER_ACTIVE && ownedDocumentIsIntact()) markTakeoverRendered();
    routeAbortController?.abort();
    routeAbortController = null;
    safeCleanup(routeCleanup);
    routeCleanup = () => {};

    const controller = new AbortController();
    routeAbortController = controller;
    const routeContext = createRouteContext(generation, controller.signal);

    let nextCleanup = () => {};
    try {
      if (isHomePath(location.pathname)) {
        nextCleanup = await initHomePage(routeContext);
      } else if (isSearchPath(location.pathname)) {
        nextCleanup = await initSearchPage(routeContext);
      } else if (isChannelPath(location.pathname)) {
        nextCleanup = await initProfilePage(routeContext);
      } else if (isWatchPath(location.pathname)) {
        nextCleanup = await initWatchPage(routeContext);
      } else if (isPlaylistPath(location.pathname)) {
        nextCleanup = await initPlaylistPage(routeContext);
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error(`${LOG_PREFIX} route initialization failed`, error);
        if (routeContext.isCurrent()) {
          routeKey = "";
          showTakeoverFailure();
        }
      }
    } finally {
      if (generation === routeGeneration && routeInitKey === nextRouteKey) routeInitKey = "";
    }

    if (!routeContext.isCurrent()) {
      safeCleanup(nextCleanup);
      return;
    }
    if (TAKEOVER_ACTIVE) markTakeoverRendered();

    routeCleanup = () => {
      controller.abort();
      safeCleanup(nextCleanup);
      if (routeAbortController === controller) routeAbortController = null;
    };
  }

  function ensureAppContainer() {
    let app = document.getElementById("app");
    if (app instanceof HTMLElement) return app;
    if (!document.body) return null;
    app = createElement("div");
    app.id = "app";
    document.body.prepend(app);
    return app;
  }

  function installHistoryHooks() {
    // Observe YouTube's history object, including navigation initiated by its
    // page scripts when the userscript manager uses an isolated JavaScript world.
    const pageHistory = PAGE_WINDOW.history || history;
    for (const method of ["pushState", "replaceState"]) {
      const original = pageHistory[method];
      if (original?.[HISTORY_HOOK_FLAG]) continue;

      const wrapped = function (...args) {
        const result = Reflect.apply(original, this, args);
        notifyLocationChange();
        return result;
      };
      Object.defineProperty(wrapped, HISTORY_HOOK_FLAG, { value: true });

      try {
        pageHistory[method] = wrapped;
      } catch (error) {
        console.warn(`${LOG_PREFIX} unable to observe history.${method}`, error);
      }
    }

    // Intercept internal link clicks for fast SPA transitions
    document.addEventListener(
      "click",
      (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
        if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
        try {
          const url = new URL(anchor.href, location.href);
          if (url.origin !== location.origin) return;
          if (isOwnedPath(url.pathname)) {
            event.preventDefault();
            history.pushState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
            window.scrollTo({ top: 0, behavior: "instant" });
          }
        } catch {
        }
      },
      true,
    );
  }

  function notifyLocationChange() {
    if (suppressedRouteNotifications > 0) return;
    window.dispatchEvent(new Event(ROUTE_EVENT));
  }

  function recordLocationWithoutRoute(url) {
    suppressedRouteNotifications += 1;
    try {
      history.pushState(history.state, "", url);
    } finally {
      suppressedRouteNotifications -= 1;
    }
    routeKey = `${location.pathname}${location.search}`;
  }

  function rebuildRouteWithHandoff(handoff) {
    pendingPlayerHandoff = handoff ? { ...handoff, createdAt: Date.now() } : null;
    routeKey = "";
    void runRoute(true);
  }

  function takePlayerHandoff(key) {
    const handoff = pendingPlayerHandoff;
    pendingPlayerHandoff = null;
    if (!handoff || handoff.key !== key || Date.now() - handoff.createdAt > 60_000) return null;
    return handoff;
  }

  function createRouteContext(generation, signal) {
    return {
      signal,
      isCurrent() {
        return generation === routeGeneration && !signal.aborted;
      },
      assertCurrent() {
        throwIfAborted(signal);
        if (generation !== routeGeneration) throw createAbortError();
      },
    };
  }

  function safeCleanup(cleanup) {
    try {
      cleanup?.();
    } catch (error) {
      console.warn(`${LOG_PREFIX} cleanup failed`, error);
    }
  }

  function createAbortError() {
    if (typeof DOMException === "function") {
      return new DOMException("Operation aborted", "AbortError");
    }
    const error = new Error("Operation aborted");
    error.name = "AbortError";
    return error;
  }

  function isAbortError(error) {
    return Boolean(error && typeof error === "object" && error.name === "AbortError");
  }

  function throwIfAborted(signal) {
    if (signal?.aborted) throw createAbortError();
  }

  // === module: pages ===
  async function initHomePage(routeContext) {
    const { signal } = routeContext;
    await waitForBody(signal);
    routeContext.assertCurrent();

    const app = ensureAppContainer();
    if (!(app instanceof HTMLElement)) return () => {};

    app.querySelectorAll(".ym-home-shell").forEach((node) => node.remove());
    document.documentElement?.classList.add(HOME_ACTIVE_CLASS);

    let activeTab = homeTabForPath(location.pathname);
    function tabLabelKey(tabId) {
      return HOME_TAB_DEFS.find((tab) => tab.id === tabId)?.labelKey || "homeRecommended";
    }
    setPageTitle(t(tabLabelKey(activeTab)));

    const homeShell = createElement("section", "ym-home-shell");
    homeShell.setAttribute("aria-label", t("homeAria"));
    applyUILanguage(homeShell);

    const header = createElement("header", "ym-home-header");
    const brandIcon = createElement("span", "ym-home-brand");
    brandIcon.setAttribute("aria-hidden", "true");
    brandIcon.replaceChildren(createSvgIcon([["rect", {"x": "2", "y": "4.5", "width": "20", "height": "15", "rx": "4.5", "fill": "currentColor"}], ["path", {"d": "m10 9 5.5 3-5.5 3z", "fill": "#fff"}]], "0 0 24 24"));

    const tabBar = createElement("div", "ym-segmented-control ym-home-tabs");
    tabBar.setAttribute("role", "tablist");
    const tabButtons = new Map();
    for (const tab of HOME_TAB_DEFS) {
      const button = createElement("button", "ym-segmented-option");
      button.type = "button";
      button.dataset.tab = tab.id;
      button.textContent = t(tab.labelKey);
      button.addEventListener("click", () => switchTab(tab.id));
      tabButtons.set(tab.id, button);
      tabBar.appendChild(button);
    }

    const searchLink = createElement("a", "ym-nav-icon-button");
    searchLink.href = "/results";
    searchLink.setAttribute("aria-label", t("searchTitle"));
    searchLink.replaceChildren(createSvgIcon([["circle", {"cx": "11", "cy": "11", "r": "6.5"}], ["path", {"d": "m16 16 4.2 4.2"}]], "0 0 24 24"));

    header.append(brandIcon, searchLink);

    const view = createElement("main", "ym-recommend-view");
    view.setAttribute("aria-label", t("recommendedVideos"));
    const grid = createElement("div", "ym-recommend-grid");
    const status = createElement("div", "ym-recommend-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const sentinel = createElement("div", "ym-recommend-sentinel");
    view.append(grid, status, sentinel);

    const refreshButton = createElement("button", "ym-recommend-fab");
    refreshButton.type = "button";
    refreshButton.title = t("refreshFeed");
    refreshButton.setAttribute("aria-label", t("refreshFeed"));
    refreshButton.replaceChildren(createSvgIcon([["rect", {"x": "3.5", "y": "5.5", "width": "15", "height": "13", "rx": "4"}], ["path", {"d": "m9.5 9 5 3-5 3z"}], ["path", {"d": "M19.5 2.75v4M17.5 4.75h4"}]], "0 0 24 24"));

    // The tab bar sits in its own sticky row below the header: segments do not
    // fit between the brand and search icons on a phone-width header.
    const tabBarWrap = createElement("div", "ym-home-tabs-bar");
    tabBarWrap.appendChild(tabBar);
    homeShell.append(header, tabBarWrap, view);
    app.appendChild(homeShell);
    document.body.appendChild(refreshButton);

    let page = 0;
    let continuationToken = "";
    let loading = false;
    let stopped = false;
    let disposed = false;
    let consecutiveEmptyPages = 0;
    let prefetchFrame = 0;
    let feedGeneration = 0;
    const seen = new Set();

    function syncTabUI() {
      for (const tab of HOME_TAB_DEFS) {
        const button = tabButtons.get(tab.id);
        const isActive = tab.id === activeTab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      }
      setPageTitle(t(tabLabelKey(activeTab)));
    }

    function switchTab(nextTab) {
      if (disposed || nextTab === activeTab) return;
      activeTab = nextTab;
      const targetPath = HOME_TAB_DEFS.find((tab) => tab.id === activeTab)?.path || "/";
      if (location.pathname !== targetPath) {
        recordLocationWithoutRoute(targetPath);
      }
      syncTabUI();
      resetAndLoad();
    }

    syncTabUI();

    function showInitialSkeletons() {
      if (page !== 0 || grid.childElementCount > 0) return;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 6; index += 1) {
        fragment.appendChild(createVideoSkeletonCard());
      }
      grid.appendChild(fragment);
    }

    function clearInitialSkeletons() {
      grid.querySelectorAll(".ym-recommend-skeleton").forEach((node) => node.remove());
    }

    function scheduleUnderfillCheck() {
      if (prefetchFrame || disposed || loading || stopped) return;
      prefetchFrame = window.requestAnimationFrame(() => {
        prefetchFrame = 0;
        if (disposed || loading || stopped || signal.aborted) return;
        if (sentinel.getBoundingClientRect().top <= window.innerHeight + 700) void loadMore();
      });
    }

    async function loadMore() {
      if (disposed || signal.aborted || loading || stopped) return;
      if (activeTab !== "recommended" && !isLoggedIn()) {
        stopped = true;
        clearInitialSkeletons();
        status.replaceChildren();
        status.dataset.state = "error";
        const message = createElement("span", "ym-status-message");
        message.textContent = t("signInRequired");
        const loginLink = createElement("a", "ym-button");
        loginLink.href = createYouTubeLoginUrl();
        loginLink.textContent = t("signIn");
        status.append(message, loginLink);
        return;
      }

      if (page >= HOME_MAX_PAGES) {
        stopped = true;
        status.dataset.state = "done";
        status.textContent = t("homeEnd");
        return;
      }

      loading = true;
      const currentGen = feedGeneration;
      status.replaceChildren();

      if (page === 0) {
        status.dataset.state = "initial";
        showInitialSkeletons();
      } else {
        status.dataset.state = "loading";
        status.textContent = t("loadingMore");
      }

      let shouldCheckUnderfill = false;
      try {
        // History rides the same browse feed endpoint as the other tabs; Watch
        // Later is a playlist (VLWL) and paginates through getPlaylistPage.
        const browseIdByTab = { recommended: "FEwhat_to_watch", subscriptions: "FEsubscriptions", history: "FEhistory" };
        const result =
          activeTab === "watchLater"
            ? await getPlaylistPage("WL", continuationToken, signal)
            : await getHomeFeedPage(browseIdByTab[activeTab] || "FEwhat_to_watch", continuationToken, signal);
        if (disposed || signal.aborted || !routeContext.isCurrent() || currentGen !== feedGeneration) return;

        const freshItems = result.items.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        clearInitialSkeletons();
        const fragment = document.createDocumentFragment();
        for (const item of freshItems) {
          // Watch Later cards open the WL queue in the watch page, so the
          // player can walk the list and autoplay the next entry.
          const cardItem = activeTab === "watchLater" ? { ...item, url: createWatchHref(item.id, "WL") } : item;
          fragment.appendChild(createVideoCard(cardItem));
        }
        grid.appendChild(fragment);

        page += 1;
        continuationToken = result.nextContinuation || "";
        consecutiveEmptyPages = freshItems.length === 0 ? consecutiveEmptyPages + 1 : 0;

        if (!continuationToken || consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES || page >= HOME_MAX_PAGES) {
          stopped = true;
          status.dataset.state = "done";
          if (grid.childElementCount > 0) {
            status.textContent = t("homeEnd");
          } else {
            // Signed-out visitors without watch history get an empty home feed.
            status.dataset.state = "error";
            const message = createElement("span", "ym-status-message");
            const emptyKey = { history: "historyEmpty", watchLater: "watchLaterEmpty" }[activeTab];
            message.textContent = emptyKey ? t(emptyKey) : t("noResults");
            status.append(message);
            if (!emptyKey) {
              const hint = createElement("span", "ym-status-message");
              hint.textContent = t("searchHint");
              status.append(hint);
            }
            const searchButton = createElement("a", "ym-button");
            searchButton.href = "/results";
            searchButton.textContent = t("searchTitle");
            status.append(searchButton);
          }
        } else if (freshItems.length === 0) {
          status.dataset.state = "loading";
          status.textContent = t("findingMoreContent");
        } else {
          delete status.dataset.state;
          status.textContent = "";
        }
        shouldCheckUnderfill = true;
      } catch (error) {
        if (disposed || isAbortError(error) || currentGen !== feedGeneration) return;
        clearInitialSkeletons();
        console.error(`${LOG_PREFIX} home feed failed`, error);
        status.replaceChildren();
        status.dataset.state = "error";

        const message = createElement("span", "ym-status-message");
        // Show the request failure so HTTP and browser-network errors can be
        // distinguished from a feed that genuinely contains no videos.
        message.textContent = `${t("feedLoadFailed")} (${String(error.message || "Unknown error").slice(0, 160)})`;
        const retry = createElement("button", "ym-button");
        retry.type = "button";
        retry.textContent = t("reload");
        retry.addEventListener("click", () => void loadMore(), { once: true });
        status.append(message, retry);
      } finally {
        if (currentGen === feedGeneration) {
          loading = false;
          if (shouldCheckUnderfill) scheduleUnderfillCheck();
        }
      }
    }

    function resetAndLoad() {
      feedGeneration += 1;
      page = 0;
      continuationToken = "";
      loading = false;
      stopped = false;
      consecutiveEmptyPages = 0;
      seen.clear();
      grid.replaceChildren();
      status.replaceChildren();
      window.scrollTo({ top: 0, behavior: "smooth" });
      void loadMore();
    }

    const refreshFeed = async () => {
      if (disposed || loading) return;
      refreshButton.disabled = true;
      refreshButton.classList.add("is-refreshing");
      resetAndLoad();
      window.setTimeout(() => {
        refreshButton.disabled = false;
        refreshButton.classList.remove("is-refreshing");
      }, 450);
    };
    refreshButton.addEventListener("click", refreshFeed);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(sentinel);
    void loadMore();

    return () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      if (prefetchFrame) window.cancelAnimationFrame(prefetchFrame);
      refreshButton.removeEventListener("click", refreshFeed);
      refreshButton.remove();
      homeShell.remove();
      if (!document.querySelector(".ym-home-shell")) {
        document.documentElement?.classList.remove(HOME_ACTIVE_CLASS);
      }
    };
  }

  async function initSearchPage(routeContext) {
    const { signal } = routeContext;
    await waitForBody(signal);
    routeContext.assertCurrent();

    const app = ensureAppContainer();
    if (!(app instanceof HTMLElement)) return () => {};

    app.querySelectorAll(".ym-search-shell").forEach((node) => node.remove());
    document.documentElement?.classList.add(SEARCH_ACTIVE_CLASS);

    const queryParams = new URLSearchParams(location.search);
    const keyword = (queryParams.get("search_query") || queryParams.get("q") || queryParams.get("keyword") || "").trim();
    const requestedOrder = queryParams.get("sort") || "relevance";
    const order = ["relevance", "viewCount", "uploadDate"].includes(requestedOrder)
      ? requestedOrder
      : "relevance";

    setPageTitle(keyword ? `${keyword} - ${t("searchTitle")}` : t("searchTitle"));

    const shell = createElement("section", "ym-search-shell");
    shell.setAttribute("aria-label", t("searchAria"));
    shell.classList.toggle("is-empty", !keyword);
    applyUILanguage(shell);

    const header = createElement("header", "ym-search-header");
    const backButton = createElement("a", "ym-search-back");
    backButton.href = "/";
    backButton.setAttribute("aria-label", t("backToHome"));
    backButton.replaceChildren(createSvgIcon([["path", {"d": "m14.5 5-7 7 7 7"}]], "0 0 24 24"));

    const form = createElement("form", "ym-search-form");
    form.setAttribute("role", "search");

    const searchIcon = createElement("span", "ym-search-icon");
    searchIcon.setAttribute("aria-hidden", "true");
    searchIcon.replaceChildren(createSvgIcon([["circle", {"cx": "11", "cy": "11", "r": "6.5"}], ["path", {"d": "m16 16 4 4"}]], "0 0 24 24"));

    const input = createElement("input", "ym-search-input");
    input.type = "search";
    input.name = "search_query";
    input.value = keyword;
    input.placeholder = t("searchPlaceholder");
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.enterKeyHint = "search";
    input.setAttribute("aria-label", t("searchPlaceholder"));

    const clearButton = createElement("button", "ym-search-clear");
    clearButton.type = "button";
    clearButton.setAttribute("aria-label", t("clearSearch"));
    clearButton.replaceChildren(createSvgIcon([["circle", {"cx": "10", "cy": "10", "r": "8"}], ["path", {"d": "m7.4 7.4 5.2 5.2m0-5.2-5.2 5.2"}]], "0 0 20 20"));

    const submitButton = createElement("button", "ym-search-submit");
    submitButton.type = "submit";
    submitButton.textContent = t("searchTitle");

    const syncClearButton = () => {
      clearButton.hidden = input.value.length === 0;
      submitButton.disabled = input.value.trim().length === 0;
    };
    input.addEventListener("input", syncClearButton);
    clearButton.addEventListener("click", () => {
      input.value = "";
      syncClearButton();
      input.focus();
    });
    syncClearButton();

    form.append(searchIcon, input, clearButton, submitButton);

    const sortBar = createElement("nav", "ym-segmented-control ym-search-sort");
    sortBar.setAttribute("aria-label", t("searchSort"));
    for (const [value, label] of [
      ["relevance", t("sortRelevance")],
      ["viewCount", t("sortMostViewed")],
      ["uploadDate", t("sortLatest")],
    ]) {
      const option = createElement("button", `ym-segmented-option${order === value ? " is-active" : ""}`);
      option.type = "button";
      option.dataset.order = value;
      option.textContent = label;
      option.setAttribute("aria-pressed", order === value ? "true" : "false");
      option.addEventListener("click", () => {
        if (!keyword || value === order) return;
        const url = new URL(location.href);
        url.pathname = "/results";
        url.search = "";
        url.searchParams.set("search_query", keyword);
        if (value !== "relevance") url.searchParams.set("sort", value);
        history.pushState(history.state, "", url);
      });
      sortBar.appendChild(option);
    }

    header.append(backButton, form, sortBar);

    const content = createElement("main", "ym-search-content");
    const summary = createElement("div", "ym-search-summary");
    const summaryTitle = createElement("div", "ym-search-summary-title");
    summaryTitle.textContent = keyword ? `“${keyword}”` : t("searchPrompt");
    summary.append(summaryTitle);

    const grid = createElement("div", "ym-recommend-grid ym-search-grid");
    const status = createElement("div", "ym-recommend-status ym-search-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const sentinel = createElement("div", "ym-recommend-sentinel ym-search-sentinel");
    content.append(summary, grid, status, sentinel);
    shell.append(header, content);
    app.appendChild(shell);

    let page = 0;
    let continuationToken = "";
    let loading = false;
    let stopped = false;
    let disposed = false;
    let consecutiveEmptyPages = 0;
    let prefetchFrame = 0;
    const seen = new Set();

    const showInitialSkeletons = () => {
      if (page !== 0 || grid.childElementCount > 0) return;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 6; index += 1) {
        fragment.appendChild(createVideoSkeletonCard());
      }
      grid.appendChild(fragment);
    };

    const clearInitialSkeletons = () => {
      grid.querySelectorAll(".ym-recommend-skeleton").forEach((node) => node.remove());
    };

    function scheduleUnderfillCheck() {
      if (prefetchFrame || disposed || loading || stopped || !keyword) return;
      prefetchFrame = window.requestAnimationFrame(() => {
        prefetchFrame = 0;
        if (disposed || loading || stopped || signal.aborted || !keyword) return;
        if (sentinel.getBoundingClientRect().top <= window.innerHeight + 800) void loadMore();
      });
    }

    async function loadMore() {
      if (!keyword || disposed || signal.aborted || loading || stopped || page >= SEARCH_MAX_PAGES) return;
      loading = true;
      status.replaceChildren();

      if (page === 0) {
        status.dataset.state = "initial";
        showInitialSkeletons();
      } else {
        status.dataset.state = "loading";
        status.textContent = t("loadingMore");
      }

      let shouldCheckUnderfill = false;
      try {
        const result = await getSearchResultsPage(keyword, order, continuationToken, signal);
        if (disposed || signal.aborted || !routeContext.isCurrent()) return;

        const freshItems = result.items.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        clearInitialSkeletons();
        const fragment = document.createDocumentFragment();
        for (const item of freshItems) fragment.appendChild(createVideoCard(item));
        grid.appendChild(fragment);

        page += 1;
        continuationToken = result.nextContinuation || "";
        consecutiveEmptyPages = freshItems.length === 0 ? consecutiveEmptyPages + 1 : 0;

        if (!continuationToken || consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES || page >= SEARCH_MAX_PAGES) {
          stopped = true;
          status.dataset.state = "done";
          status.textContent = grid.childElementCount > 0 ? t("allResultsShown") : t("noResults");
        } else if (freshItems.length === 0) {
          status.dataset.state = "loading";
          status.textContent = t("findingMoreResults");
        } else {
          delete status.dataset.state;
          status.textContent = "";
        }
        shouldCheckUnderfill = true;
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        clearInitialSkeletons();
        console.error(`${LOG_PREFIX} search failed`, error);
        status.replaceChildren();
        status.dataset.state = "error";

        const message = createElement("span", "ym-status-message");
        message.textContent = t("searchLoadFailed");
        const retry = createElement("button", "ym-button");
        retry.type = "button";
        retry.textContent = t("reload");
        retry.addEventListener("click", () => void loadMore(), { once: true });
        status.append(message, retry);
      } finally {
        loading = false;
        if (shouldCheckUnderfill) scheduleUnderfillCheck();
      }
    }

    const onSubmit = (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      const url = new URL(location.href);
      url.pathname = "/results";
      url.search = "";
      url.searchParams.set("search_query", value);
      if (order !== "relevance") url.searchParams.set("sort", order);
      history.pushState(history.state, "", url);
    };
    form.addEventListener("submit", onSubmit);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);

    if (keyword) {
      void loadMore();
    } else {
      status.dataset.state = "empty";
      status.textContent = t("searchHint");
      window.requestAnimationFrame(() => input.focus());
    }

    return () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      if (prefetchFrame) window.cancelAnimationFrame(prefetchFrame);
      form.removeEventListener("submit", onSubmit);
      input.removeEventListener("input", syncClearButton);
      shell.remove();
      if (!document.querySelector(".ym-search-shell")) {
        document.documentElement?.classList.remove(SEARCH_ACTIVE_CLASS);
      }
    };
  }

  async function initProfilePage(routeContext) {
    const { signal } = routeContext;
    await waitForBody(signal);
    routeContext.assertCurrent();

    const app = ensureAppContainer();
    if (!(app instanceof HTMLElement)) return () => {};

    app.querySelectorAll(".ym-profile-shell").forEach((node) => node.remove());
    document.documentElement?.classList.add(PROFILE_ACTIVE_CLASS);

    const shell = createElement("section", "ym-profile-shell");
    shell.setAttribute("aria-label", t("profileAria", { name: t("profileTitle") }));
    applyUILanguage(shell);

    const nav = createElement("header", "ym-profile-nav");
    const backButton = createElement("button", "ym-search-back ym-profile-back");
    backButton.type = "button";
    backButton.setAttribute("aria-label", t("back"));
    backButton.replaceChildren(createSvgIcon([["path", {"d": "m14.5 5-7 7 7 7"}]], "0 0 24 24"));

    const navHeading = createElement("div", "ym-profile-nav-heading");
    const navTitle = createElement("div", "ym-profile-nav-title");
    navTitle.textContent = t("profileTitle");
    navHeading.append(navTitle);

    const homeButton = createElement("a", "ym-search-back ym-profile-home");
    homeButton.href = "/";
    homeButton.setAttribute("aria-label", t("backToHome"));
    homeButton.replaceChildren(createSvgIcon([["path", {"d": "M4.5 10.5 12 4l7.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4v-5h-4v5H6a1.5 1.5 0 0 1-1.5-1.5z"}]], "0 0 24 24"));
    nav.append(backButton, navHeading, homeButton);

    const hero = createElement("section", "ym-profile-hero is-loading");
    const heroCover = createElement("div", "ym-profile-cover");
    const heroCoverImage = document.createElement("img");
    heroCoverImage.alt = "";
    heroCoverImage.decoding = "async";
    heroCoverImage.hidden = true;
    heroCover.appendChild(heroCoverImage);

    const heroContent = createElement("div", "ym-profile-hero-content");
    const avatarFrame = createElement("div", "ym-profile-avatar-frame");
    const avatar = document.createElement("img");
    avatar.alt = "";
    avatar.decoding = "async";
    avatarFrame.appendChild(avatar);

    const identity = createElement("div", "ym-profile-identity");
    const nameRow = createElement("div", "ym-profile-name-row");
    const name = createElement("h1", "ym-profile-name");
    name.textContent = t("profileLoading");
    const verifiedBadge = createElement("span", "ym-profile-verified");
    verifiedBadge.hidden = true;
    verifiedBadge.textContent = t("profileVerified");
    nameRow.append(name, verifiedBadge);

    const signature = createElement("p", "ym-profile-signature");
    signature.hidden = true;

    const profileMeta = createElement("div", "ym-profile-meta");
    const handlePill = createElement("span", "ym-profile-meta-pill");
    handlePill.hidden = true;
    const subscriberPill = createElement("span", "ym-profile-meta-pill");
    subscriberPill.hidden = true;
    const videoPill = createElement("span", "ym-profile-meta-pill");
    videoPill.hidden = true;
    profileMeta.append(handlePill, subscriberPill, videoPill);

    const profileActions = createElement("div", "ym-profile-actions");
    const subButton = createElement("button", "ym-profile-follow");
    subButton.type = "button";
    subButton.hidden = true;
    const subLabel = createElement("span", "ym-profile-follow-label");
    subButton.append(subLabel);
    const subMessage = createElement("span", "ym-profile-follow-message");
    subMessage.hidden = true;
    profileActions.append(subButton, subMessage);

    identity.append(nameRow, signature, profileMeta, profileActions);
    heroContent.append(avatarFrame, identity);
    hero.append(heroCover, heroContent);

    const content = createElement("main", "ym-profile-content");
    const sectionHeader = createElement("div", "ym-profile-section-header");
    const sectionTitle = createElement("h2", "ym-profile-section-title");
    sectionTitle.textContent = t("profileVideos");
    sectionHeader.append(sectionTitle);

    const grid = createElement("div", "ym-recommend-grid ym-profile-grid");
    const status = createElement("div", "ym-recommend-status ym-profile-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const sentinel = createElement("div", "ym-recommend-sentinel ym-profile-sentinel");
    content.append(sectionHeader, grid, status, sentinel);
    shell.append(nav, hero, content);
    app.appendChild(shell);

    let channelId = "";
    let channelName = t("profileTitle");
    let subscribed = false;
    let subBusy = false;
    let page = 0;
    let continuationToken = "";
    let loading = false;
    let stopped = false;
    let disposed = false;
    let prefetchFrame = 0;
    let consecutiveEmptyPages = 0;
    const seen = new Set();

    const onBack = () => {
      if (history.length > 1) history.back();
      else location.assign("/");
    };
    backButton.addEventListener("click", onBack);

    function renderSubButton() {
      if (!channelId) {
        subButton.hidden = true;
        return;
      }
      subButton.hidden = false;
      subButton.disabled = subBusy;
      subButton.classList.toggle("is-following", subscribed);
      subButton.setAttribute("aria-pressed", String(subscribed));
      subButton.setAttribute(
        "aria-label",
        t(subscribed ? "profileUnsubscribeCreator" : "profileSubscribeCreator", { name: channelName }),
      );
      subLabel.textContent = subBusy
        ? t("profileSubLoading")
        : subscribed
          ? t("profileSubscribed")
          : t("profileSubscribe");
    }

    async function onSubClick() {
      if (disposed || subBusy || !channelId) return;
      if (!isLoggedIn()) {
        location.assign(createYouTubeLoginUrl());
        return;
      }
      subBusy = true;
      subMessage.hidden = true;
      renderSubButton();
      const targetState = !subscribed;
      try {
        await modifyChannelSubscription(channelId, targetState, signal);
        if (disposed || signal.aborted) return;
        subscribed = targetState;
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        console.warn(`${LOG_PREFIX} subscription update failed`, error);
        subMessage.textContent = t("profileSubscribeFailed");
        subMessage.hidden = false;
      } finally {
        subBusy = false;
        if (!disposed) renderSubButton();
      }
    }
    subButton.addEventListener("click", onSubClick);

    function showInitialSkeletons() {
      if (page !== 0 || grid.childElementCount > 0) return;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 6; index += 1) {
        fragment.appendChild(createVideoSkeletonCard());
      }
      grid.appendChild(fragment);
    }

    function clearInitialSkeletons() {
      grid.querySelectorAll(".ym-recommend-skeleton").forEach((node) => node.remove());
    }

    function scheduleUnderfillCheck() {
      if (prefetchFrame || disposed || loading || stopped) return;
      prefetchFrame = window.requestAnimationFrame(() => {
        prefetchFrame = 0;
        if (disposed || loading || stopped || signal.aborted) return;
        if (sentinel.getBoundingClientRect().top <= window.innerHeight + 800) void loadMore();
      });
    }

    async function loadMore() {
      if (disposed || signal.aborted || loading || stopped || page >= PROFILE_MAX_PAGES) return;
      loading = true;
      status.replaceChildren();

      if (page === 0) {
        status.dataset.state = "initial";
        showInitialSkeletons();
      } else {
        status.dataset.state = "loading";
        status.textContent = t("loadingMore");
      }

      let shouldCheckUnderfill = false;
      try {
        if (!channelId) {
          channelId = await resolveChannelBrowseId(location.pathname, signal);
        }
        const result = await getChannelVideosPage(channelId, continuationToken, signal);
        if (disposed || signal.aborted || !routeContext.isCurrent()) return;

        if (result.profile && page === 0) {
          const prof = result.profile;
          channelName = prof.name || channelName;
          setPageTitle(channelName);
          name.textContent = channelName;
          navTitle.textContent = channelName;
          shell.setAttribute("aria-label", t("profileAria", { name: channelName }));
          verifiedBadge.hidden = !prof.verified;
          if (prof.avatar) avatar.src = prof.avatar;
          if (prof.banner) {
            heroCoverImage.src = prof.banner;
            heroCoverImage.hidden = false;
          }
          if (prof.description) {
            signature.textContent = prof.description;
            signature.hidden = false;
          }
          if (prof.handle) {
            handlePill.textContent = prof.handle;
            handlePill.hidden = false;
          }
          if (prof.subscribersText) {
            subscriberPill.textContent = prof.subscribersText;
            subscriberPill.hidden = false;
          }
          if (prof.videosCountText) {
            videoPill.textContent = prof.videosCountText;
            videoPill.hidden = false;
          }
          subscribed = Boolean(prof.subscribed);
          hero.classList.remove("is-loading", "is-error");
          renderSubButton();
        }

        const freshItems = result.items.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        clearInitialSkeletons();
        const fragment = document.createDocumentFragment();
        for (const item of freshItems) {
          fragment.appendChild(
            createVideoCard({
              ...item,
              creatorName: item.creatorName || channelName,
              creatorUrl: `/channel/${channelId}`,
            }),
          );
        }
        grid.appendChild(fragment);

        page += 1;
        continuationToken = result.nextContinuation || "";
        consecutiveEmptyPages = freshItems.length === 0 ? consecutiveEmptyPages + 1 : 0;

        if (page === 1 && grid.childElementCount === 0 && !continuationToken) {
          stopped = true;
          status.dataset.state = "empty";
          status.textContent = t("profileNoVideos");
        } else if (!continuationToken || consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES || page >= PROFILE_MAX_PAGES) {
          stopped = true;
          status.dataset.state = "done";
          status.textContent = t("profileEnd");
        } else if (freshItems.length === 0) {
          status.dataset.state = "loading";
          status.textContent = t("findingMoreContent");
        } else {
          delete status.dataset.state;
          status.textContent = "";
        }
        shouldCheckUnderfill = true;
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        clearInitialSkeletons();
        console.error(`${LOG_PREFIX} channel profile load failed`, error);
        hero.classList.remove("is-loading");
        hero.classList.add("is-error");
        name.textContent = t("profileLoadFailed");
        status.replaceChildren();
        status.dataset.state = "error";
        const message = createElement("span", "ym-status-message");
        message.textContent = t("profileVideosLoadFailed");
        const retry = createElement("button", "ym-button");
        retry.type = "button";
        retry.textContent = t("retry");
        retry.addEventListener("click", () => void loadMore(), { once: true });
        status.append(message, retry);
      } finally {
        loading = false;
        if (shouldCheckUnderfill) scheduleUnderfillCheck();
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);
    void loadMore();

    return () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      if (prefetchFrame) window.cancelAnimationFrame(prefetchFrame);
      backButton.removeEventListener("click", onBack);
      subButton.removeEventListener("click", onSubClick);
      shell.remove();
      if (!document.querySelector(".ym-profile-shell")) {
        document.documentElement?.classList.remove(PROFILE_ACTIVE_CLASS);
      }
    };
  }

  function createWatchHref(videoId, listId = "") {
    const query = `v=${encodeURIComponent(videoId)}`;
    return listId ? `/watch?${query}&list=${encodeURIComponent(listId)}` : `/watch?${query}`;
  }

  function parseStartSeconds(value) {
    // YouTube `t` formats: plain seconds, `95s`, or `1h2m3s`.
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) return Number(raw);
    const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match || (!match[1] && !match[2] && !match[3])) return 0;
    return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  }

  async function initPlaylistPage(routeContext) {
    const { signal } = routeContext;
    const listId = String(new URLSearchParams(location.search).get("list") || "").trim();
    await waitForBody(signal);
    routeContext.assertCurrent();

    const app = ensureAppContainer();
    if (!(app instanceof HTMLElement)) return () => {};

    // The playlist page shares the channel page's shell class, so the existing
    // takeover CSS hides YouTube's own UI and lays out the video grid the same way.
    app.querySelectorAll(".ym-profile-shell").forEach((node) => node.remove());
    document.documentElement?.classList.add(PROFILE_ACTIVE_CLASS);

    const shell = createElement("section", "ym-profile-shell ym-playlist-shell");
    shell.setAttribute("aria-label", t("playlistTitle"));
    applyUILanguage(shell);

    const nav = createElement("header", "ym-profile-nav");
    const backButton = createElement("button", "ym-search-back ym-profile-back");
    backButton.type = "button";
    backButton.setAttribute("aria-label", t("back"));
    backButton.replaceChildren(createSvgIcon([["path", {"d": "m14.5 5-7 7 7 7"}]], "0 0 24 24"));

    const navHeading = createElement("div", "ym-profile-nav-heading");
    const navTitle = createElement("div", "ym-profile-nav-title");
    navTitle.textContent = t("playlistTitle");
    navHeading.append(navTitle);

    const homeButton = createElement("a", "ym-search-back ym-profile-home");
    homeButton.href = "/";
    homeButton.setAttribute("aria-label", t("backToHome"));
    homeButton.replaceChildren(createSvgIcon([["path", {"d": "M4.5 10.5 12 4l7.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4v-5h-4v5H6a1.5 1.5 0 0 1-1.5-1.5z"}]], "0 0 24 24"));
    nav.append(backButton, navHeading, homeButton);

    const hero = createElement("section", "ym-playlist-hero is-loading");
    const heroCover = createElement("div", "ym-playlist-cover");
    const heroCoverImage = document.createElement("img");
    heroCoverImage.alt = "";
    heroCoverImage.decoding = "async";
    heroCoverImage.hidden = true;
    heroCover.appendChild(heroCoverImage);

    const heroCopy = createElement("div", "ym-playlist-copy");
    const heading = createElement("h1", "ym-playlist-name");
    heading.textContent = t("playlistLoading");
    const ownerLink = createElement("a", "ym-playlist-owner");
    ownerLink.hidden = true;
    const details = createElement("p", "ym-playlist-details");
    details.hidden = true;
    // An anchor rather than a button, so the shared click interceptor turns it
    // into an in-app navigation and a long press still offers "open in new tab".
    const playAllLink = createElement("a", "ym-profile-follow ym-playlist-play");
    playAllLink.textContent = t("playAll");
    playAllLink.hidden = true;
    heroCopy.append(heading, ownerLink, details, playAllLink);
    hero.append(heroCover, heroCopy);

    const content = createElement("main", "ym-profile-content");
    const grid = createElement("div", "ym-recommend-grid ym-profile-grid");
    const status = createElement("div", "ym-recommend-status ym-profile-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const sentinel = createElement("div", "ym-recommend-sentinel ym-profile-sentinel");
    content.append(grid, status, sentinel);
    shell.append(nav, hero, content);
    app.appendChild(shell);

    let page = 0;
    let continuationToken = "";
    let loading = false;
    let stopped = false;
    let disposed = false;
    let prefetchFrame = 0;
    let consecutiveEmptyPages = 0;
    const seen = new Set();

    const onBack = () => {
      if (history.length > 1) history.back();
      else location.assign("/");
    };
    backButton.addEventListener("click", onBack);

    function showFailure() {
      hero.classList.remove("is-loading");
      heading.textContent = t("playlistLoadFailed");
      status.replaceChildren();
      status.dataset.state = "error";
      const message = createElement("span", "ym-status-message");
      message.textContent = t("playlistLoadFailed");
      status.appendChild(message);
      if (!listId) return;
      const retry = createElement("button", "ym-button");
      retry.type = "button";
      retry.textContent = t("retry");
      retry.addEventListener("click", () => void loadMore(), { once: true });
      status.appendChild(retry);
    }

    function applyHeader(header) {
      const title = header.title || t("playlistTitle");
      setPageTitle(title);
      heading.textContent = title;
      navTitle.textContent = title;
      shell.setAttribute("aria-label", title);
      if (header.ownerName) {
        ownerLink.textContent = header.ownerName;
        if (header.ownerUrl) ownerLink.href = header.ownerUrl;
        ownerLink.hidden = false;
      }
      if (header.details.length > 0) {
        details.textContent = header.details.join(" · ");
        details.hidden = false;
      }
      if (header.cover) {
        heroCoverImage.src = header.cover;
        heroCoverImage.hidden = false;
      }
      hero.classList.remove("is-loading");
    }

    function scheduleUnderfillCheck() {
      if (prefetchFrame || disposed || loading || stopped) return;
      prefetchFrame = window.requestAnimationFrame(() => {
        prefetchFrame = 0;
        if (disposed || loading || stopped || signal.aborted) return;
        if (sentinel.getBoundingClientRect().top <= window.innerHeight + 800) void loadMore();
      });
    }

    async function loadMore() {
      if (disposed || signal.aborted || loading || stopped || page >= PLAYLIST_MAX_PAGES) return;
      if (!listId) {
        stopped = true;
        showFailure();
        return;
      }
      loading = true;
      status.replaceChildren();

      if (page === 0) {
        status.dataset.state = "initial";
        if (grid.childElementCount === 0) {
          const fragment = document.createDocumentFragment();
          for (let index = 0; index < 6; index += 1) fragment.appendChild(createVideoSkeletonCard());
          grid.appendChild(fragment);
        }
      } else {
        status.dataset.state = "loading";
        status.textContent = t("loadingMore");
      }

      let shouldCheckUnderfill = false;
      try {
        const result = await getPlaylistPage(listId, continuationToken, signal);
        if (disposed || signal.aborted || !routeContext.isCurrent()) return;
        if (result.header) applyHeader(result.header);

        const freshItems = result.items.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        grid.querySelectorAll(".ym-recommend-skeleton").forEach((node) => node.remove());
        const fragment = document.createDocumentFragment();
        for (const item of freshItems) {
          // Every card carries the list id, so opening any video plays the rest
          // of the playlist after it.
          fragment.appendChild(createVideoCard({ ...item, url: createWatchHref(item.id, listId) }));
        }
        grid.appendChild(fragment);
        if (playAllLink.hidden && grid.querySelector(".ym-recommend-card")) {
          playAllLink.href = createWatchHref(seen.values().next().value, listId);
          playAllLink.hidden = false;
        }

        page += 1;
        continuationToken = result.nextContinuation || "";
        consecutiveEmptyPages = freshItems.length === 0 ? consecutiveEmptyPages + 1 : 0;

        if (page === 1 && grid.childElementCount === 0 && !continuationToken) {
          stopped = true;
          status.dataset.state = "empty";
          status.textContent = t("playlistEmpty");
        } else if (!continuationToken || consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES || page >= PLAYLIST_MAX_PAGES) {
          stopped = true;
          status.dataset.state = "done";
          status.textContent = t("playlistEnd");
        } else {
          delete status.dataset.state;
          status.textContent = "";
        }
        shouldCheckUnderfill = true;
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        grid.querySelectorAll(".ym-recommend-skeleton").forEach((node) => node.remove());
        console.error(`${LOG_PREFIX} playlist load failed`, error);
        showFailure();
      } finally {
        loading = false;
        if (shouldCheckUnderfill) scheduleUnderfillCheck();
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);
    void loadMore();

    return () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      if (prefetchFrame) window.cancelAnimationFrame(prefetchFrame);
      backButton.removeEventListener("click", onBack);
      shell.remove();
      if (!document.querySelector(".ym-profile-shell")) {
        document.documentElement?.classList.remove(PROFILE_ACTIVE_CLASS);
      }
    };
  }

  async function initWatchPage(routeContext) {
    const { signal } = routeContext;
    const initialParams = new URLSearchParams(location.search);
    if (!initialParams.get("v")) {
      // A bare /watch?list=… link starts at the playlist's first video. The
      // replaceState goes through the history hook, which runs the route again.
      const listId = String(initialParams.get("list") || "").trim();
      if (listId) {
        const details = await getWatchNextDetails("", listId, signal);
        routeContext.assertCurrent();
        const first = details.playlist?.items?.[0];
        if (first) history.replaceState(history.state, "", createWatchHref(first.videoId, listId));
      }
      return () => {};
    }
    await waitForBody(signal);
    routeContext.assertCurrent();
    const app = ensureAppContainer();
    document.documentElement.classList.add(WATCH_ACTIVE_CLASS);

    // Replace the visible page before any network requests finish. Otherwise a
    // slow or failed source lookup leaves YouTube's original player on screen.
    const pending = createElement("main", "ym-watch-shell");
    pending.setAttribute("aria-label", t("nativePlayerAria"));
    const status = createElement("div", "ym-recommend-status");
    status.dataset.state = "loading";
    status.setAttribute("role", "status");
    status.textContent = t("loadingVideo");
    pending.append(status);
    app.append(pending);

    const pauseOriginal = (media) => {
      if (!(media instanceof HTMLMediaElement) || media.closest(".ym-native-player, .ym-background-audio-host")) return;
      media.pause();
    };
    const onOriginalPlay = (event) => pauseOriginal(event.target);
    document.querySelectorAll("video, audio").forEach(pauseOriginal);
    document.addEventListener("play", onOriginalPlay, true);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      pending.remove();
      document.removeEventListener("play", onOriginalPlay, true);
      if (!document.querySelector(".ym-watch-shell")) document.documentElement.classList.remove(WATCH_ACTIVE_CLASS);
    };
    // Navigation must release the placeholder even while source extraction is pending.
    signal.addEventListener("abort", release, { once: true });
    try {
      const cleanup = await buildWatchPage(routeContext);
      pending.remove();
      return () => {
        safeCleanup(cleanup);
        signal.removeEventListener("abort", release);
        release();
      };
    } catch (error) {
      if (isAbortError(error) || !routeContext.isCurrent()) {
        signal.removeEventListener("abort", release);
        release();
        throw error;
      }
      // A failed lookup still belongs to the replacement player. Keep the native
      // player hidden and paused, and offer a retry within the same watch shell.
      console.error(`${LOG_PREFIX} watch source failed`, error);
      app.querySelectorAll(".ym-watch-shell").forEach((node) => {
        if (node !== pending) node.remove();
      });
      if (!pending.isConnected) app.append(pending);
      document.documentElement.classList.add(WATCH_ACTIVE_CLASS);
      status.dataset.state = "error";
      const message = createElement("span", "ym-status-message");
      message.textContent = error.playbackDetails
        ? `${t("playbackFailed")} (${error.playbackDetails.slice(0, 320)})`
        : t("playbackFailed");
      const retry = createElement("button", "ym-button");
      retry.type = "button";
      retry.textContent = t("retry");
      retry.addEventListener("click", () => void runRoute(true), { once: true });
      status.replaceChildren(message, retry);
      return () => {
        signal.removeEventListener("abort", release);
        release();
      };
    }
  }

  async function buildWatchPage(routeContext) {
    const { signal } = routeContext;
    const params = new URLSearchParams(location.search);
    const videoId = String(params.get("v") || "").trim();
    const listId = String(params.get("list") || "").trim();
    // Continue-watching links carry `t=`; the player seeks there on load.
    const startSeconds = parseStartSeconds(params.get("t"));
    if (!videoId) return () => {};

    await waitForBody(signal);
    routeContext.assertCurrent();

    const [source, watchNext] = await Promise.all([
      getYouTubePlaySource(videoId, signal),
      getWatchNextDetails(videoId, listId, signal).catch((error) => {
        if (isAbortError(error)) throw error;
        console.warn(`${LOG_PREFIX} watch next metadata failed`, error);
        return null;
      }),
    ]);
    routeContext.assertCurrent();

    const app = ensureAppContainer();
    if (!(app instanceof HTMLElement)) return () => {};
    app.querySelectorAll(".ym-watch-shell").forEach((node) => node.remove());
    document.documentElement?.classList.add(WATCH_ACTIVE_CLASS);

    const videoTitle = watchNext?.title || source.videoDetails?.title || t("youtube");
    const authorName = watchNext?.author || source.videoDetails?.author || t("youtube");
    const channelId = watchNext?.channelId || source.videoDetails?.channelId || "";
    const creatorUrl = channelId ? `/channel/${channelId}` : "";
    const creatorAvatar = watchNext?.avatar || "";
    const poster = getBestThumbnail(source.videoDetails?.thumbnail?.thumbnails) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    setPageTitle(videoTitle);

    const watchShell = createElement("main", "ym-watch-shell");
    applyUILanguage(watchShell);

    const header = createElement("header", "ym-profile-nav ym-watch-header");
    const backButton = createElement("button", "ym-search-back");
    backButton.type = "button";
    backButton.setAttribute("aria-label", t("back"));
    backButton.replaceChildren(createSvgIcon([["path", {"d": "m14.5 5-7 7 7 7"}]], "0 0 24 24"));
    backButton.addEventListener("click", () => {
      if (history.length > 1) history.back();
      else location.assign("/");
    });

    const headerHeading = createElement("div", "ym-profile-nav-heading");
    const headerTitle = createElement("div", "ym-profile-nav-title");
    headerTitle.textContent = videoTitle;
    headerHeading.appendChild(headerTitle);

    const homeButton = createElement("a", "ym-search-back ym-profile-home");
    homeButton.href = "/";
    homeButton.setAttribute("aria-label", t("backToHome"));
    homeButton.replaceChildren(createSvgIcon([["path", {"d": "M4.5 10.5 12 4l7.5 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-4v-5h-4v5H6a1.5 1.5 0 0 1-1.5-1.5z"}]], "0 0 24 24"));
    header.append(backButton, headerHeading, homeButton);

    const content = createElement("section", "ym-watch-content");
    const playerHost = createElement("div", "ym-watch-player-host");
    content.appendChild(playerHost);

    // Every watch page gets a play queue that the player walks through in place.
    // With ?list= it holds the playlist window from the watch-next response;
    // otherwise it holds the current video followed by YouTube's autoplay pick.
    // The player reads `items` live and adds `play`, `refresh` and `setCreator`
    // to this object, so the page can drive it without rebuilding the route.
    const playlistItems = Array.isArray(watchNext?.playlist?.items) ? watchNext.playlist.items : [];
    const currentPlaylistIndex = playlistItems.findIndex((item) => item.videoId === videoId);
    const isPlaylist = Boolean(listId) && playlistItems.length > 1 && currentPlaylistIndex >= 0;
    let playlistTotal = isPlaylist ? Number(watchNext.playlist.totalCount) || playlistItems.length : 0;
    let disposed = false;
    let trackAbort = null;

    const toQueueItem = (item, { autoplay = false } = {}) => ({
      value: item.videoId,
      videoId: item.videoId,
      title: item.title || "",
      indexText: item.indexText || "",
      artist: item.author || "",
      creatorUrl: item.channelId ? `/channel/${item.channelId}` : item.creatorUrl || "",
      // Autoplay picks leave the playlist, so their URL drops the list id.
      href: createWatchHref(item.videoId, isPlaylist && !autoplay ? listId : ""),
      poster: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
      autoplay,
    });

    const queue = {
      kind: isPlaylist ? "playlist" : "autoplay",
      items: isPlaylist
        ? playlistItems.map((item) => toQueueItem(item))
        : [toQueueItem({ videoId, title: videoTitle, author: authorName, channelId, thumbnail: poster })],
      index: isPlaylist ? currentPlaylistIndex : 0,
      loadSource: (item, trackSignal) => getYouTubePlaySource(item.videoId, trackSignal),
      onTrackChange: (item, index) => void onTrackChange(item, index),
    };
    if (!isPlaylist) queueAutoplayCandidate(watchNext?.autoplayCandidates, 0);

    let rail = null;
    let playlistCount = null;
    if (isPlaylist) {
      const playlistSection = createElement("section", "ym-playlist-section");
      const playlistHeader = createElement("div", "ym-playlist-header");
      const playlistHeading = createElement("h2", "ym-playlist-title");
      const playlistLink = createElement("a", "ym-playlist-title-link");
      playlistLink.href = `/playlist?list=${encodeURIComponent(listId)}`;
      playlistLink.textContent = watchNext.playlist.title || t("playlistTitle");
      playlistLink.setAttribute("aria-label", t("openPlaylist"));
      playlistHeading.appendChild(playlistLink);
      playlistCount = createElement("span", "ym-playlist-count");
      playlistHeader.append(playlistHeading, playlistCount);
      rail = createElement("div", "ym-playlist-rail");
      playlistSection.append(playlistHeader, rail);
      content.appendChild(playlistSection);
      renderPlaylistRail(currentPlaylistIndex);
    }

    function renderPlaylistRail(activeIndex) {
      if (!rail) return;
      playlistCount.textContent = t(playlistTotal === 1 ? "episodeMetaOne" : "episodeMetaOther", { count: playlistTotal });
      const buttons = queue.items.map((item, idx) => {
        const button = createElement("button", "ym-playlist-item-button");
        button.type = "button";
        button.textContent = `${item.indexText || idx + 1}. ${item.title}`;
        button.title = item.title;
        if (idx === activeIndex) {
          button.classList.add("is-current");
          button.setAttribute("aria-current", "page");
        }
        button.addEventListener("click", () => {
          if (idx === activeIndex) return;
          // Switching inside the player keeps fullscreen and the play state.
          if (queue.play) queue.play(idx);
          else history.pushState(history.state, "", item.href);
        });
        return button;
      });
      rail.replaceChildren(...buttons);
      requestAnimationFrame(() => {
        rail?.querySelector(".ym-playlist-item-button.is-current")?.scrollIntoView({
          behavior: "auto",
          block: "nearest",
          inline: "center",
        });
      });
    }

    // Replace whatever follows the current video with the first candidate that
    // has not been queued yet, so autoplay never bounces between two videos.
    function queueAutoplayCandidate(candidates, index) {
      if (!Array.isArray(candidates)) return;
      const queued = new Set(queue.items.slice(0, index + 1).map((item) => item.videoId));
      const pick = candidates.find((candidate) => !queued.has(candidate.videoId));
      if (!pick) return;
      queue.items.splice(index + 1, queue.items.length, toQueueItem(pick, { autoplay: true }));
    }

    // The watch-next panel only carries a window of a long playlist. Each new
    // window starts near the current video, so append its tail when it reaches
    // further than what is already queued.
    function mergePlaylistWindow(nextPlaylist, index) {
      const windowItems = Array.isArray(nextPlaylist?.items) ? nextPlaylist.items : [];
      const position = windowItems.findIndex((item) => item.videoId === queue.items[index]?.videoId);
      if (position < 0) return;
      playlistTotal = Math.max(playlistTotal, Number(nextPlaylist.totalCount) || 0);
      const tail = windowItems.slice(position + 1);
      if (tail.length <= queue.items.length - index - 1) return;
      queue.items.splice(index + 1, queue.items.length, ...tail.map((item) => toQueueItem(item)));
    }

    let comments = createVideoCommentsSection({
      topToken: watchNext?.comments?.topToken || "",
      newestToken: watchNext?.comments?.newestToken || "",
      initialCountText: watchNext?.comments?.countText || "",
      signal,
    });

    function replaceComments(details) {
      const nextComments = createVideoCommentsSection({
        topToken: details?.topToken || "",
        newestToken: details?.newestToken || "",
        initialCountText: details?.countText || "",
        signal,
      });
      comments.element.replaceWith(nextComments.element);
      comments.cleanup();
      comments = nextComments;
      comments.start();
    }

    // The player has already swapped the media and pushed the new URL. Bring
    // the rest of the page up to date for the video that is now playing.
    async function onTrackChange(item, index) {
      if (disposed) return;
      if (item.title) {
        headerTitle.textContent = item.title;
        setPageTitle(item.title);
      }
      renderPlaylistRail(index);
      trackAbort?.abort();
      const controller = new AbortController();
      trackAbort = controller;
      const onRouteAbort = () => controller.abort();
      signal.addEventListener("abort", onRouteAbort, { once: true });
      try {
        const next = await getWatchNextDetails(item.videoId, isPlaylist ? listId : "", controller.signal);
        if (disposed || controller.signal.aborted) return;
        const title = next.title || item.title;
        if (title) {
          item.title = title;
          headerTitle.textContent = title;
          setPageTitle(title);
        }
        queue.setCreator?.({
          name: next.author,
          url: next.channelId ? `/channel/${next.channelId}` : "",
          avatar: next.avatar,
        });
        replaceComments(next.comments);
        if (isPlaylist) {
          mergePlaylistWindow(next.playlist, index);
          renderPlaylistRail(index);
        } else {
          queueAutoplayCandidate(next.autoplayCandidates, index);
        }
        queue.refresh?.();
      } catch (error) {
        if (!isAbortError(error)) console.warn(`${LOG_PREFIX} watch next metadata failed`, error);
      } finally {
        signal.removeEventListener("abort", onRouteAbort);
        if (trackAbort === controller) trackAbort = null;
      }
    }

    watchShell.append(header, content);
    app.appendChild(watchShell);

    let nativeCleanup = () => {};
    try {
      nativeCleanup = renderNativePlayer({
        mount: { host: playerHost, before: playerHost.firstChild, originals: [] },
        title: videoTitle,
        artist: authorName,
        creatorUrl,
        creatorAvatar,
        poster,
        source,
        startSeconds,
        playlist: queue,
        supplementalContent: comments.element,
        handoffKey: videoId,
        onOptionChange(selectedVideoId) {
          const url = new URL(location.href);
          url.searchParams.set("v", selectedVideoId);
          history.pushState(history.state, "", url);
        },
      });
      comments.start();
    } catch (error) {
      comments.cleanup();
      throw error;
    }

    return () => {
      if (disposed) return;
      disposed = true;
      trackAbort?.abort();
      comments.cleanup();
      safeCleanup(nativeCleanup);
      watchShell.remove();
      if (!document.querySelector(".ym-watch-shell")) {
        document.documentElement?.classList.remove(WATCH_ACTIVE_CLASS);
      }
    };
  }

  // === module: player ===
  function renderNativePlayer({
    mount,
    title,
    artist = t("youtube"),
    creatorUrl = "",
    creatorAvatar = "",
    poster,
    source,
    startSeconds = 0,
    supplementalContent = null,
    options = [],
    onOptionChange,
    playlist = null,
    handoffKey = "",
  }) {
    let candidates = Array.isArray(source?.candidates) ? [...source.candidates] : [];
    let audioCandidates = Array.isArray(source?.audioCandidates) ? source.audioCandidates : [];
    let currentTitle = title;
    let currentArtist = artist;
    let currentVideoId = source?.videoId || source?.videoDetails?.videoId || "";
    let sourceRefreshPromise = null;
    let sourceRefreshAttempts = [];
    let currentPoster = poster || "";
    if (candidates.length === 0) throw new Error(t("playbackFailed"));

    const shell = createElement("section", `${SCRIPT_PREFIX}-player`);
    shell.setAttribute("aria-label", t("nativePlayerAria"));
    applyUILanguage(shell);

    const videoBox = createElement("div", "ym-native-video-box");
    const video = document.createElement("video");
    video.className = "ym-native-video";
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.poster = currentPoster;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("x-webkit-airplay", "allow");

    const audioView = createElement("div", "ym-audio-only-view");
    audioView.hidden = true;
    audioView.setAttribute("aria-label", t("audioOnlyPlayer"));

    const audioArtwork = document.createElement("img");
    audioArtwork.className = "ym-audio-only-artwork";
    audioArtwork.alt = "";
    audioArtwork.decoding = "async";
    if (currentPoster) audioArtwork.src = currentPoster;
    audioArtwork.hidden = !currentPoster;
    audioView.appendChild(audioArtwork);

    const audioScrim = createElement("div", "ym-audio-only-scrim");
    const audioPanel = createElement("div", "ym-audio-only-panel");
    const audioCopy = createElement("div", "ym-audio-only-copy");
    const audioTitle = createElement("strong", "ym-audio-only-title");
    audioTitle.textContent = t("audioOnlyMode");
    const audioSubtitle = createElement("span", "ym-audio-only-subtitle");
    audioSubtitle.textContent = t("audioOnlySubtitle");
    audioCopy.append(audioTitle, audioSubtitle);

    // Detached audio element outside #app so iOS Safari never kills background playback on lock screen.
    const backgroundAudioHost = createElement("div", "ym-background-audio-host");
    const audio = document.createElement("audio");
    audio.className = "ym-native-audio";
    audio.controls = false;
    audio.preload = "auto";
    audio.playsInline = true;
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.setAttribute("x-webkit-airplay", "allow");
    backgroundAudioHost.appendChild(audio);

    const audioTransport = createElement("div", "ym-audio-transport");
    const audioPlayButton = createElement("button", "ym-audio-play-button");
    audioPlayButton.type = "button";
    audioPlayButton.setAttribute("aria-label", t("playAudio"));
    audioPlayButton.replaceChildren(createSvgIcon([["path", {"class": "ym-audio-play-glyph", "d": "M8 5.5v13l10-6.5z"}], ["path", {"class": "ym-audio-pause-glyph", "d": "M8 5.5h3v13H8zM14 5.5h3v13h-3z"}]], "0 0 24 24"));
    const audioTimeline = document.createElement("input");
    audioTimeline.className = "ym-audio-timeline";
    audioTimeline.type = "range";
    audioTimeline.min = "0";
    audioTimeline.max = "1";
    audioTimeline.step = "0.1";
    audioTimeline.value = "0";
    audioTimeline.setAttribute("aria-label", t("audioProgress"));
    const audioTime = createElement("span", "ym-audio-time");
    audioTime.textContent = "0:00 / 0:00";

    const createSkipButton = (className, label, path) => {
      const button = createElement("button", `ym-audio-skip-button ${className}`);
      button.type = "button";
      button.title = label;
      button.setAttribute("aria-label", label);
      button.replaceChildren(createSvgIcon([["path", {"d": path}]], "0 0 24 24"));
      button.hidden = !playlist;
      return button;
    };
    const audioPreviousButton = createSkipButton("is-previous", t("previousTrack"), "M7 6v12M18 6.5v11l-8.5-5.5z");
    const audioNextButton = createSkipButton("is-next", t("nextTrack"), "M17 6v12M6 6.5v11l8.5-5.5z");
    audioTransport.append(audioPreviousButton, audioPlayButton, audioNextButton, audioTimeline, audioTime);

    audioPanel.append(audioCopy, audioTransport);
    audioView.append(audioScrim, audioPanel);

    const playerLoading = createElement("div", "ym-player-loading");
    playerLoading.setAttribute("role", "status");
    playerLoading.setAttribute("aria-live", "polite");
    const playerSpinner = createElement("span", "ym-player-spinner");
    playerSpinner.setAttribute("aria-hidden", "true");
    const playerLoadingText = createElement("span");
    playerLoadingText.textContent = t("loadingVideo");
    playerLoading.append(playerSpinner, playerLoadingText);

    videoBox.append(video, audioView, playerLoading);

    const meta = createElement("div", "ym-native-player-meta");
    const playerInfo = createElement("div", "ym-native-player-info");
    const playerKicker = createElement("div", "ym-native-player-kicker");
    playerKicker.textContent = t("nativePlayer");
    const playerTitleRow = createElement("div", "ym-native-player-title-row");
    const titleNode = createElement("div", "ym-native-player-title");
    const qualityNode = createElement("span", "ym-native-quality");
    qualityNode.hidden = true;
    playerTitleRow.append(titleNode, qualityNode);
    playerInfo.append(playerKicker, playerTitleRow);

    // The creator row is kept even without a channel URL, because an in-place
    // track change can move to a video whose channel is known.
    const creatorLink = createElement("a", "ym-native-player-creator");
    const creatorImage = document.createElement("img");
    creatorImage.className = "ym-native-player-creator-avatar";
    creatorImage.alt = "";
    creatorImage.loading = "eager";
    creatorImage.decoding = "async";
    const creatorName = createElement("span", "ym-native-player-creator-name");
    const creatorDisclosure = createElement("span", "ym-native-player-creator-disclosure");
    creatorDisclosure.setAttribute("aria-hidden", "true");
    creatorDisclosure.textContent = "›";
    creatorLink.append(creatorImage, creatorName, creatorDisclosure);
    playerInfo.appendChild(creatorLink);

    let currentCreatorUrl = "";
    let currentCreatorAvatar = "";

    // By default only the non-empty fields are applied, because details arrive
    // in pieces: the queue item, then the player response, then watch-next.
    // `replace` starts over for a new track, so nothing from the last one stays.
    function setCreator({ name = "", url = "", avatar = "" } = {}, { replace = false } = {}) {
      if (replace) {
        currentArtist = name || "";
        currentCreatorUrl = url || "";
        currentCreatorAvatar = avatar || "";
      } else {
        if (name) currentArtist = name;
        if (url) currentCreatorUrl = url;
        if (avatar) currentCreatorAvatar = avatar;
      }
      creatorName.textContent = currentArtist;
      if (currentCreatorUrl) {
        creatorLink.href = currentCreatorUrl;
        creatorLink.setAttribute("aria-label", t("openCreatorProfile", { name: currentArtist }));
      } else {
        creatorLink.removeAttribute("href");
        creatorLink.removeAttribute("aria-label");
      }
      creatorDisclosure.hidden = !currentCreatorUrl;
      if (currentCreatorAvatar) creatorImage.src = currentCreatorAvatar;
      else creatorImage.removeAttribute("src");
      creatorImage.hidden = !currentCreatorAvatar;
      creatorLink.hidden = !currentArtist;
    }
    setCreator({ name: artist, url: creatorUrl, avatar: creatorAvatar }, { replace: true });

    const playerActions = createElement("div", "ym-native-player-actions");
    let selector = null;
    // A playlist queue fills the picker itself, since later watch-next windows
    // can extend it. The autoplay queue has no picker.
    const usesPlaylistPicker = playlist?.kind === "playlist";
    if (usesPlaylistPicker ? playlist.items.length > 1 : options.length > 1) {
      selector = createElement("select", "ym-native-selector");
      selector.setAttribute("aria-label", t("selectPlaylistVideo"));
      selector.addEventListener("change", () => {
        const nextIdx = playlist ? playlist.items.findIndex((it) => it.value === selector.value) : -1;
        if (nextIdx >= 0) {
          void changeTrack(nextIdx);
          return;
        }
        onOptionChange?.(selector.value);
      });
      playerActions.appendChild(selector);
    }

    function renderSelectorOptions() {
      if (!selector) return;
      const entries = usesPlaylistPicker
        ? playlist.items.map((item, idx) => ({
            value: item.value,
            label: `${item.indexText || idx + 1} · ${item.title}`,
            selected: idx === playlistIndex,
          }))
        : options;
      selector.replaceChildren(
        ...entries.map((item) => {
          const option = document.createElement("option");
          option.value = item.value;
          option.textContent = item.label;
          option.selected = item.selected;
          return option;
        }),
      );
    }

    const autoplayButton = createElement("button", "ym-audio-mode-button ym-autoplay-button");
    autoplayButton.type = "button";
    autoplayButton.title = t("autoplay");
    // Playlists always continue to their next video, as on YouTube. The switch
    // only decides whether a single video continues to the recommended one.
    autoplayButton.hidden = playlist?.kind !== "autoplay";
    autoplayButton.replaceChildren(createSvgIcon([["path", {"d": "M4 7.5v9l7-4.5z"}], ["path", {"d": "M12 7.5v9l7-4.5z"}]], "0 0 24 24"), createTextElement("span", t("autoplay")));
    playerActions.appendChild(autoplayButton);

    function updateAutoplayButton() {
      const enabled = isAutoplayEnabled();
      autoplayButton.classList.toggle("is-active", enabled);
      autoplayButton.setAttribute("aria-pressed", String(enabled));
      autoplayButton.setAttribute("aria-label", enabled ? t("autoplayOn") : t("autoplayOff"));
    }

    const qualitySelector = createElement("select", "ym-native-quality-selector");
    qualitySelector.setAttribute("aria-label", t("selectVideoQuality"));
    qualitySelector.hidden = true;
    playerActions.appendChild(qualitySelector);

    const subtitleStatus = createElement("span", "ym-subtitle-status");
    subtitleStatus.setAttribute("role", "status");
    subtitleStatus.hidden = true;
    playerInfo.appendChild(subtitleStatus);

    const audioModeButton = createElement("button", "ym-audio-mode-button");
    audioModeButton.type = "button";
    audioModeButton.title = t("audioOnly");
    audioModeButton.setAttribute("aria-label", t("switchAudioMode"));
    audioModeButton.setAttribute("aria-pressed", "false");
    audioModeButton.disabled = audioCandidates.length === 0;
    audioModeButton.hidden = audioCandidates.length === 0;
    audioModeButton.replaceChildren(createSvgIcon([["path", {"d": "M5 14v-2a7 7 0 0 1 14 0v2"}], ["path", {"d": "M5 14H3.8A1.8 1.8 0 0 0 2 15.8v2.4A1.8 1.8 0 0 0 3.8 20H5z"}], ["path", {"d": "M19 14h1.2a1.8 1.8 0 0 1 1.8 1.8v2.4a1.8 1.8 0 0 1-1.8 1.8H19z"}]], "0 0 24 24"), createTextElement("span", t("audioOnly")));
    playerActions.appendChild(audioModeButton);

    const fullscreenButton = createElement("button", "ym-fullscreen-button");
    fullscreenButton.type = "button";
    fullscreenButton.title = t("fullscreen");
    fullscreenButton.setAttribute("aria-label", t("enterFullscreen"));
    fullscreenButton.disabled = true;
    fullscreenButton.replaceChildren(createSvgIcon([["path", {"d": "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"}]], "0 0 24 24"), createTextElement("span", t("fullscreen")));
    playerActions.appendChild(fullscreenButton);
    meta.append(playerInfo, playerActions);

    const errorBox = createElement("div", "ym-player-error");
    errorBox.hidden = true;
    errorBox.setAttribute("role", "alert");
    shell.append(videoBox, meta, errorBox);
    if (supplementalContent instanceof Node) shell.appendChild(supplementalContent);

    let sourceIndex = 0;
    let audioSourceIndex = 0;
    let audioLoadedIndex = -1;
    let mode = "video";
    let disposed = false;
    let pendingAudioTime = 0;
    let pendingAudioPlaybackRate = 1;
    let resumeAudioAfterLoad = false;
    let backgroundPlaybackExpected = false;
    let hiddenAt = 0;
    let wasPlayingBeforeHidden = false;
    let backgroundResumeConsumed = false;
    let backgroundResumeTimer = 0;
    let lastExplicitAudioAction = "pause";
    let lastAudioPlayingAt = 0;
    let videoPlaybackExpected = false;
    let lastMediaPositionUpdateAt = 0;
    let dashPlayer = null;
    let dashManifestUrl = "";
    let currentDashCandidate = null;
    let selectedQualityMode = "auto";
    let videoFallbackPromise = null;
    let pendingVideoRestore = null;
    let videoLoadToken = 0;
    let videoSourcesStale = false;
    let playbackStallTimer = 0;
    let videoSeekState = null;
    let playlistIndex = playlist ? playlist.index : -1;
    let trackChangeToken = 0;
    let trackStale = false;
    const trackSourceCache = new Map();
    const playerAbort = new AbortController();
    let subtitleTracks = [];
    let selectedSubtitleId = "";
    let subtitleTextTrack = null;
    // Programmatic TextTracks cannot be removed from a <video>, so they are pooled
    // by language and label and reused when a later playlist item offers the same
    // caption. This keeps the iOS fullscreen menu from growing duplicates.
    const nativeSubtitleTracks = new Map();
    // Maps each pooled TextTrack to the caption id it stands for in the current video.
    const subtitleIdByTextTrack = new Map();
    let subtitleRequest = null;

    function clearSubtitles() {
      subtitleRequest?.abort();
      subtitleRequest = null;
      if (subtitleTextTrack) {
        subtitleTextTrack.mode = "hidden";
        for (const cue of Array.from(subtitleTextTrack.cues || [])) subtitleTextTrack.removeCue(cue);
        subtitleTextTrack.mode = "disabled";
        subtitleTextTrack = null;
      }
      subtitleStatus.hidden = true;
    }

    function applySubtitleVisibility() {
      if (!subtitleTextTrack) return;
      subtitleTextTrack.mode = mode === "video" ? "showing" : "disabled";
    }

    // The iOS fullscreen player only lists TextTracks that already exist on the
    // <video>, so every caption language gets an empty track up front. Cues are
    // fetched later, when a language is actually picked.
    function syncNativeSubtitleTracks(tracks) {
      subtitleIdByTextTrack.clear();
      for (const item of tracks) {
        const key = `${item.languageCode}\n${item.label}`;
        let textTrack = nativeSubtitleTracks.get(key);
        if (!textTrack) {
          // A <track> without a src enters its error state asynchronously and
          // clears cues added by script. Programmatic TextTracks have no loader.
          textTrack = video.addTextTrack("subtitles", item.label, item.languageCode);
          textTrack.mode = "disabled";
          nativeSubtitleTracks.set(key, textTrack);
        }
        if (!subtitleIdByTextTrack.has(textTrack)) subtitleIdByTextTrack.set(textTrack, item.id);
      }
    }

    function textTrackForSubtitle(id) {
      for (const [textTrack, subtitleId] of subtitleIdByTextTrack) {
        if (subtitleId === id) return textTrack;
      }
      return null;
    }

    function restoreNativeSubtitleModes() {
      for (const textTrack of nativeSubtitleTracks.values()) {
        const wanted = textTrack === subtitleTextTrack && mode === "video" ? "showing" : "disabled";
        if (textTrack.mode !== wanted) textTrack.mode = wanted;
      }
    }

    // The player's own subtitle menu is the only language picker. Choosing an
    // entry there only flips TextTrack.mode, so read the choice back and fetch
    // the cues. Programmatic mode changes also fire "change", but they always
    // leave the showing track equal to selectedSubtitleId, so they are no-ops.
    function onNativeSubtitleChange() {
      if (disposed || mode !== "video") return;
      let showing = null;
      for (const textTrack of nativeSubtitleTracks.values()) {
        if (textTrack.mode === "showing") {
          showing = textTrack;
          break;
        }
      }
      const nativeId = showing ? subtitleIdByTextTrack.get(showing) || "" : "";
      if (nativeId === selectedSubtitleId && (!showing || showing === subtitleTextTrack)) return;
      // A pooled track left over from an earlier playlist item has no captions
      // for this video, so fall back to the previous choice.
      if (showing && !nativeId) {
        restoreNativeSubtitleModes();
        return;
      }
      selectedSubtitleId = nativeId;
      void loadSelectedSubtitle();
    }

    async function loadSelectedSubtitle() {
      clearSubtitles();
      const selected = subtitleTracks.find((item) => item.id === selectedSubtitleId);
      if (!selected || disposed) return;
      const textTrack = textTrackForSubtitle(selected.id);
      if (!textTrack) return;
      // Show the empty track right away so the fullscreen menu marks this
      // language as selected while its cues are still downloading.
      subtitleTextTrack = textTrack;
      applySubtitleVisibility();
      const controller = new AbortController();
      subtitleRequest = controller;
      const onAbort = () => controller.abort();
      playerAbort.signal.addEventListener("abort", onAbort, { once: true });
      subtitleStatus.textContent = t("subtitlesLoading");
      subtitleStatus.hidden = false;
      try {
        const cues = await getYouTubeCaptionCues(selected, controller.signal);
        if (disposed || controller.signal.aborted || subtitleRequest !== controller) return;
        for (const cue of Array.from(textTrack.cues || [])) textTrack.removeCue(cue);
        const Cue = globalThis.VTTCue || PAGE_WINDOW.VTTCue;
        for (const cue of cues) {
          // WebVTT supports a smaller set of entities than XML; quotes should
          // stay literal, while cue markup and ampersands must be escaped.
          const text = cue.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
          textTrack.addCue(new Cue(cue.start, cue.end, text));
        }
        applySubtitleVisibility();
        subtitleStatus.hidden = true;
      } catch (error) {
        if (disposed || controller.signal.aborted || subtitleRequest !== controller) return;
        clearSubtitles();
        selectedSubtitleId = "";
        subtitleStatus.textContent = t("subtitlesFailed");
        subtitleStatus.hidden = false;
        console.warn(`${LOG_PREFIX} subtitles failed`, error);
      } finally {
        playerAbort.signal.removeEventListener("abort", onAbort);
        if (subtitleRequest === controller) subtitleRequest = null;
      }
    }

    function configureSubtitles(tracks = []) {
      subtitleTracks = tracks;
      if (!tracks.some((item) => item.id === selectedSubtitleId)) selectedSubtitleId = "";
      syncNativeSubtitleTracks(tracks);
      void loadSelectedSubtitle();
    }

    const initialHandoff = handoffKey ? takePlayerHandoff(handoffKey) : null;
    if (initialHandoff) {
      pendingVideoRestore = {
        token: 1,
        state: {
          currentTime: Number(initialHandoff.time) || 0,
          playbackRate: 1,
          shouldPlay: Boolean(initialHandoff.shouldPlay),
        },
      };
    } else {
      // Autoplay: every fresh load starts playing; `?t=` resume points seek
      // to their saved position first.
      pendingVideoRestore = {
        token: 1,
        state: {
          currentTime: Number(startSeconds) || 0,
          playbackRate: 1,
          shouldPlay: true,
        },
      };
    }

    function activeMedia() {
      return mode === "audio" ? audio : video;
    }

    function updateSourceLabel(candidate) {
      titleNode.textContent = currentTitle;
      qualityNode.textContent = candidate?.qualityLabel || "";
      qualityNode.hidden = !candidate?.qualityLabel;
    }

    function showPlayerLoading(message) {
      playerLoadingText.textContent = message || (mode === "audio" ? t("loadingAudio") : t("loadingVideo"));
      playerLoading.hidden = false;
    }

    function hidePlayerLoading() {
      playerLoading.hidden = true;
    }

    function configureAudioSession() {
      try {
        if (PAGE_NAVIGATOR.audioSession && "type" in PAGE_NAVIGATOR.audioSession) {
          PAGE_NAVIGATOR.audioSession.type = "playback";
        }
      } catch {
      }
    }

    function clearBackgroundResumeTimer() {
      if (!backgroundResumeTimer) return;
      window.clearTimeout(backgroundResumeTimer);
      backgroundResumeTimer = 0;
    }

    function playAudio({ explicit = false } = {}) {
      configureAudioSession();
      if (explicit) lastExplicitAudioAction = "play";
      backgroundPlaybackExpected = true;
      return audio.play();
    }

    function pauseAudio({ explicit = true } = {}) {
      if (explicit) lastExplicitAudioAction = "pause";
      backgroundPlaybackExpected = false;
      wasPlayingBeforeHidden = false;
      clearBackgroundResumeTimer();
      audio.pause();
    }

    function updateMediaSessionMetadata() {
      if (!("mediaSession" in PAGE_NAVIGATOR) || typeof PAGE_MEDIA_METADATA !== "function") return;
      try {
        PAGE_NAVIGATOR.mediaSession.metadata = new PAGE_MEDIA_METADATA({
          title: currentTitle,
          artist: currentArtist,
          album: mode === "audio" ? t("audioAlbum") : t("youtube"),
          artwork: currentPoster ? [{ src: currentPoster, sizes: "512x512" }] : [],
        });
      } catch {
      }
    }

    function updateMediaSessionState({ forcePosition = false } = {}) {
      if (!("mediaSession" in PAGE_NAVIGATOR)) return;
      const media = activeMedia();
      try {
        PAGE_NAVIGATOR.mediaSession.playbackState = media.paused ? "paused" : "playing";
      } catch {
      }
      if (typeof PAGE_NAVIGATOR.mediaSession.setPositionState !== "function") return;
      if (!Number.isFinite(media.duration) || media.duration <= 0 || !Number.isFinite(media.currentTime)) return;
      const now = performance.now();
      if (!forcePosition && now - lastMediaPositionUpdateAt < MEDIA_SESSION_POSITION_INTERVAL_MS) return;
      lastMediaPositionUpdateAt = now;
      try {
        PAGE_NAVIGATOR.mediaSession.setPositionState({
          duration: media.duration,
          playbackRate: media.playbackRate || 1,
          position: Math.min(Math.max(media.currentTime, 0), media.duration),
        });
      } catch {
      }
    }

    function seekActiveMedia(seconds) {
      const media = activeMedia();
      if (!Number.isFinite(media.duration)) return;
      media.currentTime = Math.min(Math.max(media.currentTime + seconds, 0), media.duration);
      updateMediaSessionState({ forcePosition: true });
    }

    function installMediaSessionHandlers() {
      if (!("mediaSession" in PAGE_NAVIGATOR) || typeof PAGE_NAVIGATOR.mediaSession.setActionHandler !== "function") return;
      const handlers = {
        play: () => {
          if (mode === "audio") playAudio({ explicit: true }).catch(() => {});
          else video.play().catch(() => {});
        },
        pause: () => {
          if (mode === "audio") pauseAudio({ explicit: true });
          else video.pause();
        },
        stop: () => {
          if (mode === "audio") pauseAudio({ explicit: true });
          else video.pause();
        },
        seekbackward: (details) => seekActiveMedia(-(details.seekOffset || 15)),
        seekforward: (details) => seekActiveMedia(details.seekOffset || 15),
        seekto: (details) => {
          if (!Number.isFinite(details.seekTime)) return;
          activeMedia().currentTime = details.seekTime;
          updateMediaSessionState({ forcePosition: true });
        },
      };
      for (const [action, handler] of Object.entries(handlers)) {
        try {
          PAGE_NAVIGATOR.mediaSession.setActionHandler(action, handler);
        } catch {
        }
      }
    }

    function clearMediaSessionHandlers() {
      if (!("mediaSession" in PAGE_NAVIGATOR) || typeof PAGE_NAVIGATOR.mediaSession.setActionHandler !== "function") return;
      for (const action of ["play", "pause", "stop", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"]) {
        try {
          PAGE_NAVIGATOR.mediaSession.setActionHandler(action, null);
        } catch {
        }
      }
    }

    function hasTrack(delta) {
      const index = playlistIndex + delta;
      return Boolean(playlist) && index >= 0 && index < playlist.items.length;
    }

    function updateTrackControls() {
      const hasPrevious = hasTrack(-1);
      const hasNext = hasTrack(1);
      audioPreviousButton.disabled = !hasPrevious;
      audioNextButton.disabled = !hasNext;
      if (!("mediaSession" in PAGE_NAVIGATOR) || typeof PAGE_NAVIGATOR.mediaSession.setActionHandler !== "function") return;
      for (const [action, available, delta] of [["previoustrack", hasPrevious, -1], ["nexttrack", hasNext, 1]]) {
        try {
          PAGE_NAVIGATOR.mediaSession.setActionHandler(action, available ? () => skipTrack(delta) : null);
        } catch {
        }
      }
    }

    function setCurrentPoster(url) {
      currentPoster = String(url || "");
      video.poster = currentPoster;
      if (currentPoster) audioArtwork.src = currentPoster;
      else audioArtwork.removeAttribute("src");
      audioArtwork.hidden = !currentPoster;
    }

    function loadTrackSource(index) {
      const item = playlist.items[index];
      const now = Date.now();
      for (const [key, cachedEntry] of trackSourceCache) {
        if (now - cachedEntry.at >= TRACK_PREFETCH_TTL_MS) trackSourceCache.delete(key);
      }
      const cached = trackSourceCache.get(item.value);
      if (cached) return cached.promise;
      const entry = {
        at: now,
        promise: Promise.resolve().then(() => playlist.loadSource(item, playerAbort.signal)),
      };
      entry.promise.catch(() => {
        if (trackSourceCache.get(item.value) === entry) trackSourceCache.delete(item.value);
      });
      trackSourceCache.set(item.value, entry);
      return entry.promise;
    }

    // An autoplay pick only plays by itself while the Autoplay switch is on.
    // The next/previous controls still reach it either way.
    function canAutoAdvance() {
      if (!hasTrack(1)) return false;
      return !playlist.items[playlistIndex + 1].autoplay || isAutoplayEnabled();
    }

    // Audio mode fetches the next source right away, since a locked phone may
    // throttle the network later. Video mode waits until the current video is
    // close to its end, so watching one video does not cost a second lookup.
    function prefetchNextTrack({ force = false } = {}) {
      if (!playlist || disposed || (mode !== "audio" && !force) || !canAutoAdvance()) return;
      loadTrackSource(playlistIndex + 1).catch(() => {});
    }

    function skipTrack(delta) {
      if (!hasTrack(delta)) return;
      if (delta < 0 && (activeMedia().currentTime || 0) > 3) {
        setMediaTime(activeMedia(), 0);
        updateAudioControls();
        updateMediaSessionState({ forcePosition: true });
        return;
      }
      void changeTrack(playlistIndex + delta);
    }

    // Loads another queue item into the same media elements in both modes.
    // Reusing the <video> keeps iOS fullscreen, and lets the next video start
    // after "ended" without a new tap, which a freshly built player would need.
    async function changeTrack(index) {
      if (!playlist || disposed || index === playlistIndex || index < 0 || index >= playlist.items.length) return;
      const item = playlist.items[index];
      const audioMode = mode === "audio";

      const token = ++trackChangeToken;
      playlistIndex = index;
      currentTitle = item.title || currentTitle;
      setCreator({ name: item.artist, url: item.creatorUrl }, { replace: true });
      setCurrentPoster(item.poster || currentPoster);
      if (selector) selector.value = item.value;
      updateSourceLabel(null);
      updateTrackControls();
      updateMediaSessionMetadata();
      showPlayerLoading(audioMode ? t("loadingAudio") : t("loadingVideo"));
      if (audioMode) {
        backgroundPlaybackExpected = true;
        lastExplicitAudioAction = "play";
      } else {
        // Silence the old video while the next source resolves. The new load
        // carries its own play intent, so this pause does not cancel it.
        videoSeekState = null;
        video.pause();
      }

      try {
        const nextSource = await loadTrackSource(index);
        if (disposed || token !== trackChangeToken) return;
        const nextCandidates = Array.isArray(nextSource?.candidates) ? nextSource.candidates : [];
        const nextAudioCandidates = Array.isArray(nextSource?.audioCandidates) ? nextSource.audioCandidates : [];
        if (audioMode ? nextAudioCandidates.length === 0 : nextCandidates.length === 0) {
          throw new Error(audioMode ? "No audio stream" : "No video stream");
        }
        candidates = [...nextCandidates];
        audioCandidates = nextAudioCandidates;
        currentVideoId = nextSource.videoId || item.value;
        // Autoplay picks from MWEB may lack a title or channel until the
        // player response arrives.
        const details = nextSource.videoDetails || {};
        if (!item.title && details.title) {
          item.title = String(details.title);
          currentTitle = item.title;
          updateSourceLabel(null);
        }
        setCreator({ name: details.author, url: details.channelId ? `/channel/${details.channelId}` : "" });
        updateMediaSessionMetadata();
        configureSubtitles(nextSource.captionTracks);
        sourceRefreshAttempts = [];
        sourceIndex = 0;
        audioSourceIndex = 0;
        audioLoadedIndex = -1;
        audioModeButton.disabled = audioCandidates.length === 0;
        audioModeButton.hidden = audioCandidates.length === 0;
        recordLocationWithoutRoute(item.href);

        if (audioMode) {
          videoLoadToken += 1;
          void destroyDashPlayback();
          video.removeAttribute("src");
          video.load();
          // With a page hook the page follows along, so switching back to video
          // only has to reload the stream. Without one, rebuild the route then.
          if (playlist.onTrackChange) videoSourcesStale = true;
          else trackStale = true;
          loadCurrentAudioSource(0, true);
        } else {
          // The audio element keeps the previous track until audio mode is
          // entered again; audioLoadedIndex = -1 forces that reload.
          const playbackRate = Number.isFinite(video.playbackRate) && video.playbackRate > 0 ? video.playbackRate : 1;
          void loadCurrentSource({ currentTime: 0, playbackRate, shouldPlay: true });
        }
        playlist.onTrackChange?.(item, index);
        prefetchNextTrack();
      } catch (error) {
        if (isAbortError(error) || disposed || token !== trackChangeToken) return;
        console.warn(`${LOG_PREFIX} track change failed`, error);
        // A full page load of the item shows its own error and retry button.
        if (!document.hidden) history.pushState(history.state, "", item.href);
      }
    }

    function updateFullscreenAvailability() {
      if (mode === "audio") {
        fullscreenButton.hidden = true;
        fullscreenButton.disabled = true;
        return;
      }
      const webkitVideoFullscreen =
        typeof video.webkitEnterFullscreen === "function" && video.webkitSupportsFullscreen !== false;
      const elementFullscreen =
        typeof video.requestFullscreen === "function" || typeof video.webkitRequestFullscreen === "function";
      const supported = webkitVideoFullscreen || elementFullscreen;
      fullscreenButton.hidden = !supported;
      fullscreenButton.disabled = !supported || video.readyState < HTMLMediaElement.HAVE_METADATA;
    }

    function enterFullscreen() {
      if (fullscreenButton.disabled || mode !== "video") return;
      try {
        if (typeof video.webkitEnterFullscreen === "function" && video.webkitSupportsFullscreen !== false) {
          video.webkitEnterFullscreen();
          return;
        }
        if (typeof video.requestFullscreen === "function") {
          video.requestFullscreen().catch(() => {});
          return;
        }
        if (typeof video.webkitRequestFullscreen === "function") {
          video.webkitRequestFullscreen();
        }
      } catch {
      }
    }

    function isCurrentlyFullscreen() {
      return Boolean(document.fullscreenElement || video.webkitDisplayingFullscreen);
    }

    // Auto-fullscreen: jump straight into fullscreen when playback starts.
    // Mobile Safari can refuse without a user gesture, so the first tap on the
    // player also plays and enters fullscreen in one gesture.
    function autoEnterFullscreen() {
      if (disposed || mode !== "video" || isCurrentlyFullscreen()) return;
      enterFullscreen();
    }

    function setMediaTime(media, time) {
      if (!Number.isFinite(time) || time < 0 || media.readyState < HTMLMediaElement.HAVE_METADATA) return;
      try {
        media.currentTime = Math.min(time, Number.isFinite(media.duration) ? media.duration : time);
      } catch {
      }
    }

    function loadCurrentAudioSource(time = pendingAudioTime, shouldPlay = resumeAudioAfterLoad, playbackRate = audio.playbackRate) {
      const candidate = audioCandidates[audioSourceIndex];
      if (!candidate?.url) {
        switchToVideo(false);
        audioModeButton.disabled = true;
        audioModeButton.hidden = true;
        return;
      }
      pendingAudioTime = Number.isFinite(time) ? time : 0;
      pendingAudioPlaybackRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
      resumeAudioAfterLoad = Boolean(shouldPlay);
      audioLoadedIndex = audioSourceIndex;
      showPlayerLoading(t("loadingAudio"));
      updateSourceLabel(candidate);
      audio.src = candidate.url;
      audio.load();
      setMediaTime(audio, pendingAudioTime);
      if (resumeAudioAfterLoad) {
        playAudio().catch(() => {});
      }
    }

    function updateModeButton() {
      const audioActive = mode === "audio";
      applySubtitleVisibility();
      audioModeButton.classList.toggle("is-active", audioActive);
      audioModeButton.setAttribute("aria-pressed", String(audioActive));
      audioModeButton.title = audioActive ? t("watchVideo") : t("audioOnly");
      audioModeButton.setAttribute("aria-label", audioActive ? t("switchVideoMode") : t("switchAudioMode"));
      audioModeButton.querySelector("span").textContent = audioActive ? t("watchVideo") : t("audioOnly");
      playerKicker.textContent = audioActive ? t("audioBackground") : t("nativePlayer");
      shell.classList.toggle("is-audio-mode", audioActive);
    }

    function switchToAudio() {
      if (mode === "audio" || audioCandidates.length === 0) return;
      const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const shouldPlay = !video.paused && !video.ended;
      configureAudioSession();
      video.pause();
      mode = "audio";
      lastExplicitAudioAction = shouldPlay ? "play" : "pause";
      backgroundPlaybackExpected = shouldPlay;
      video.hidden = true;
      audioView.hidden = false;
      updateModeButton();
      updateFullscreenAvailability();
      updateMediaSessionMetadata();
      if (audioLoadedIndex !== audioSourceIndex || !audio.src) {
        loadCurrentAudioSource(time, shouldPlay);
      } else {
        setMediaTime(audio, time);
        updateSourceLabel(audioCandidates[audioSourceIndex]);
        if (shouldPlay) playAudio().catch(() => {});
      }
      updateMediaSessionState();
      prefetchNextTrack();
    }

    function switchToVideo(transferPlayback = true) {
      if (mode === "video") return;
      const time = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const shouldPlay = transferPlayback && !audio.paused && !audio.ended;
      if (trackStale && playlist?.items[playlistIndex]) {
        pauseAudio();
        rebuildRouteWithHandoff({
          key: playlist.items[playlistIndex].value,
          time,
          shouldPlay,
        });
        return;
      }
      resumeAudioAfterLoad = false;
      pauseAudio();
      mode = "video";
      audioView.hidden = true;
      video.hidden = false;
      if (videoSourcesStale) {
        videoSourcesStale = false;
        void loadCurrentSource({ currentTime: time, playbackRate: audio.playbackRate, shouldPlay });
      }
      setMediaTime(video, time);
      updateSourceLabel(candidates[sourceIndex]);
      if (dashPlayer) updateDashQualityLabel(dashPlayer);
      updateModeButton();
      updateFullscreenAvailability();
      updateMediaSessionMetadata();
      if (shouldPlay) video.play().catch(() => {});
      hidePlayerLoading();
      updateMediaSessionState();
    }

    function toggleAudioMode() {
      if (mode === "audio") switchToVideo(true);
      else switchToAudio();
    }

    async function destroyDashPlayback() {
      const player = dashPlayer;
      dashPlayer = null;
      if (player) {
        try {
          await player.destroy();
        } catch {
        }
      }
      if (dashManifestUrl) {
        URL.revokeObjectURL(dashManifestUrl);
        dashManifestUrl = "";
      }
      try {
        video.disableRemotePlayback = false;
      } catch {
      }
    }

    function configureQualitySelector(candidate) {
      qualitySelector.replaceChildren();
      const opts = Array.isArray(candidate?.qualityOptions) ? candidate.qualityOptions : [];
      if (candidate?.kind !== "dash" || opts.length === 0) {
        qualitySelector.hidden = true;
        return;
      }
      if (!opts.some((item) => item.value === selectedQualityMode)) selectedQualityMode = "auto";
      for (const item of opts) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        option.selected = item.value === selectedQualityMode;
        qualitySelector.appendChild(option);
      }
      qualitySelector.hidden = false;
    }

    function applyQualitySelection(player = dashPlayer) {
      if (!player) return;
      const auto = selectedQualityMode === "auto";
      player.configure({ abr: { enabled: auto } });
      if (!auto) {
        const track = chooseQualityTrack(player.getVariantTracks(), selectedQualityMode);
        if (track) player.selectVariantTrack(track, true, 0);
      }
      window.setTimeout(() => updateDashQualityLabel(player), 0);
    }

    function onQualitySelectionChange() {
      selectedQualityMode = qualitySelector.value || "auto";
      applyQualitySelection();
    }

    function updateDashQualityLabel(player = dashPlayer) {
      if (!player || mode !== "video") return;
      try {
        const active = player.getVariantTracks().find((track) => track.active);
        if (!active) return;
        const parts = [];
        if (active.height) parts.push(`${active.height}P`);
        if (Number(active.frameRate) > 30) parts.push(`${Math.round(active.frameRate)}fps`);
        if (currentDashCandidate?.audioLabel) parts.push(currentDashCandidate.audioLabel);
        parts.push(selectedQualityMode === "auto" ? t("autoDash") : "DASH");
        qualityNode.textContent = parts.join(" · ");
        qualityNode.hidden = false;
      } catch {
      }
    }

    function captureVideoPlaybackState() {
      const pending = pendingVideoRestore?.state;
      const seek = videoSeekState;
      const currentTime = seek ? seek.currentTime : Number.isFinite(video.currentTime) && video.currentTime > 0
        ? video.currentTime
        : Number(pending?.currentTime || 0);
      const playbackRate = Number.isFinite(video.playbackRate) && video.playbackRate > 0
        ? video.playbackRate
        : Number(pending?.playbackRate || 1);
      return {
        currentTime,
        playbackRate,
        shouldPlay: seek ? seek.shouldPlay : Boolean(pending?.shouldPlay || (mode === "video" && videoPlaybackExpected && !video.ended)),
      };
    }

    function onVideoSeeking() {
      if (disposed || mode !== "video" || pendingVideoRestore) return;
      videoSeekState = {
        currentTime: video.currentTime,
        shouldPlay: videoPlaybackExpected && !video.paused,
      };
      // A second scrub must replace the previous target and its stall timer.
      window.clearTimeout(playbackStallTimer);
      playbackStallTimer = 0;
      onActiveMediaWaiting({ currentTarget: video });
    }

    function restoreVideoPlaybackState(state, token = videoLoadToken) {
      if (!state || disposed || token !== videoLoadToken || video.readyState < HTMLMediaElement.HAVE_METADATA) {
        return false;
      }
      if (pendingVideoRestore?.token === token) pendingVideoRestore = null;
      setMediaTime(video, Number(state.currentTime));
      if (Number.isFinite(state.playbackRate) && state.playbackRate > 0) {
        try {
          video.playbackRate = state.playbackRate;
        } catch {
        }
      }
      if (state.shouldPlay && mode === "video") {
        video.play().catch(() => {});
      }
      return true;
    }

    function onVideoLoadedMetadata() {
      updateFullscreenAvailability();
      applySubtitleVisibility();
      const pending = pendingVideoRestore;
      if (pending) restoreVideoPlaybackState(pending.state, pending.token);
    }

    async function refreshPlaybackSources() {
      if (disposed || !currentVideoId) return false;
      if (sourceRefreshPromise) return sourceRefreshPromise;
      // Signed URLs can expire or be rejected mid-playback. Re-query the player,
      // but cap retries so a blocked video cannot cause an endless request loop.
      const now = Date.now();
      sourceRefreshAttempts = sourceRefreshAttempts.filter((at) => now - at < 60_000);
      if (sourceRefreshAttempts.length >= 2) return false;
      sourceRefreshAttempts.push(now);
      const videoId = currentVideoId;
      const trackToken = trackChangeToken;
      const task = (async () => {
        try {
          const fresh = await getYouTubePlaySource(videoId, playerAbort.signal);
          if (disposed || trackToken !== trackChangeToken || videoId !== currentVideoId) return false;
          candidates = [...fresh.candidates];
          audioCandidates = fresh.audioCandidates || [];
          configureSubtitles(fresh.captionTracks);
          sourceIndex = 0;
          audioSourceIndex = 0;
          audioLoadedIndex = -1;
          // The inactive media element still has the old URLs. Reload it when
          // switching modes rather than resuming an expired resource.
          if (mode === "audio") videoSourcesStale = true;
          audioModeButton.disabled = audioCandidates.length === 0;
          audioModeButton.hidden = audioCandidates.length === 0;
          return true;
        } catch (error) {
          if (!disposed && !isAbortError(error)) {
            console.warn(`${LOG_PREFIX} unable to refresh playback URLs`, error);
          }
          return false;
        }
      })();
      const shared = task.finally(() => {
        if (sourceRefreshPromise === shared) sourceRefreshPromise = null;
      });
      sourceRefreshPromise = shared;
      return shared;
    }

    function advanceVideoSource(error, restoreState = captureVideoPlaybackState()) {
      if (disposed) return Promise.resolve(false);
      if (videoFallbackPromise) return videoFallbackPromise;

      const failedIndex = sourceIndex;
      const trackToken = trackChangeToken;
      const task = (async () => {
        console.warn(`${LOG_PREFIX} video source failed; trying fallback`, error?.code ? `code=${error.code}, category=${error.category}` : error);
        if (sourceIndex === failedIndex) sourceIndex = failedIndex + 1;
        if (sourceIndex < candidates.length) {
          void loadCurrentSource(restoreState);
          return true;
        }
        if (mode === "video") {
          showPlayerLoading();
          const refreshed = await refreshPlaybackSources();
          if (disposed || trackToken !== trackChangeToken) return false;
          if (refreshed) {
            void loadCurrentSource(videoSeekState ? captureVideoPlaybackState() : restoreState);
            return true;
          }
        }
        if (mode !== "audio") {
          showPlayerFailure(t("playbackFailed"));
        }
        return false;
      })();

      const sharedFallback = task.finally(() => {
        if (videoFallbackPromise === sharedFallback) videoFallbackPromise = null;
      });
      videoFallbackPromise = sharedFallback;
      return sharedFallback;
    }

    async function loadCurrentSource(restoreState = null) {
      const candidate = candidates[sourceIndex];
      if (!candidate || (candidate.kind !== "dash" && !candidate.url)) {
        showPlayerFailure(t("allMediaFailed"));
        return;
      }

      const token = ++videoLoadToken;
      clearDecodeRecovery();
      videoSourcesStale = false;
      window.clearTimeout(playbackStallTimer);
      playbackStallTimer = 0;
      if (restoreState) pendingVideoRestore = { token, state: restoreState };
      videoBox.hidden = false;
      meta.hidden = false;
      errorBox.hidden = true;
      if (mode === "video") {
        showPlayerLoading(candidate.kind === "dash" ? t("loadingHighQualityDash") : t("loadingVideo"));
      }
      updateSourceLabel(mode === "audio" ? audioCandidates[audioSourceIndex] : candidate);
      configureQualitySelector(candidate);

      await destroyDashPlayback();
      if (disposed || token !== videoLoadToken || candidate !== candidates[sourceIndex]) return;

      if (candidate.kind !== "dash") {
        currentDashCandidate = null;
        video.src = candidate.url;
        video.load();
        updateFullscreenAvailability();
        return;
      }

      currentDashCandidate = candidate;
      if (!isDashPlaybackSupported()) {
        void advanceVideoSource(new Error("DASH not supported"), restoreState);
        return;
      }

      try {
        ensureShakaPolyfills();
        video.removeAttribute("src");
        video.load();
        video.disableRemotePlayback = true;

        const player = new (getShaka().Player)();
        dashPlayer = player;
        player.getNetworkingEngine().registerRequestFilter((type, request) => {
          if (type === getShaka().net.NetworkingEngine.RequestType.SEGMENT) {
            applyYouTubeByteRange(request);
          }
        });
        const retryParameters = {
          maxAttempts: 3,
          baseDelay: 500,
          backoffFactor: 2,
          fuzzFactor: 0.3,
          timeout: 20_000,
        };
        player.configure({
          abr: {
            enabled: selectedQualityMode === "auto",
            defaultBandwidthEstimate: 12_000_000,
          },
          manifest: { retryParameters },
          streaming: {
            bufferingGoal: 18,
            rebufferingGoal: 2,
            bufferBehind: 12,
            retryParameters,
          },
        });
        player.addEventListener("adaptation", () => updateDashQualityLabel(player));
        player.addEventListener("variantchanged", () => updateDashQualityLabel(player));
        player.addEventListener("mediasourcerecovered", () => {
          if (player === dashPlayer) onDashMediaSourceRecovered();
        });
        player.addEventListener("error", (event) => {
          const detail = event?.detail;
          const critical =
            detail?.severity == null || detail.severity === getShaka()?.util?.Error?.Severity?.CRITICAL;
          if (critical && player === dashPlayer && token === videoLoadToken) {
            void advanceVideoSource(detail || new Error("DASH playback failed"));
          }
        });

        await player.attach(video);
        if (disposed || token !== videoLoadToken || player !== dashPlayer) {
          await player.destroy().catch(() => {});
          return;
        }
        dashManifestUrl = URL.createObjectURL(new Blob([candidate.manifest], { type: "application/dash+xml" }));
        const startTime =
          Number.isFinite(restoreState?.currentTime) && restoreState.currentTime > 0
            ? restoreState.currentTime
            : null;
        await player.load(dashManifestUrl, startTime, "application/dash+xml");
        if (disposed || token !== videoLoadToken || player !== dashPlayer) return;
        applyQualitySelection(player);
        applySubtitleVisibility();
        restoreVideoPlaybackState(restoreState, token);
        updateDashQualityLabel(player);
        updateFullscreenAvailability();
      } catch (error) {
        if (disposed || token !== videoLoadToken) return;
        const fallbackState = captureVideoPlaybackState();
        await destroyDashPlayback();
        if (token !== videoLoadToken) return;
        void advanceVideoSource(error, fallbackState);
      }
    }

    // A decode error (e.g. while ABR switches renditions during a seek) makes
    // Shaka rebuild its MediaSource, which resumes at Shaka's own position and
    // paused; on WebKit Shaka ignores the error entirely and playback freezes.
    // Remember where playback was going and put it back either way.
    let decodeRecovery = null;
    let decodeRestoreState = null;
    let decodeReloadAttempts = [];

    let lastDecodeError = null;

    function handleDashMediaError() {
      if (decodeRecovery) return;
      let state = captureVideoPlaybackState();
      // A frame the decoder rejects stays bad, and every reload decodes from the
      // keyframe before it. On repeats near the same spot, step past it; if that
      // keeps failing, move on to the next source.
      const now = Date.now();
      const repeat = lastDecodeError && now - lastDecodeError.at < 30_000 &&
        Math.abs(state.currentTime - lastDecodeError.time) < 3 + 2 * lastDecodeError.count;
      const count = repeat ? lastDecodeError.count + 1 : 1;
      lastDecodeError = { time: repeat ? lastDecodeError.time : state.currentTime, count, at: now };
      if (count > 3) {
        lastDecodeError = null;
        void advanceVideoSource(video.error || new Error("Repeated media decode errors"), state);
        return;
      }
      // Shaka's reload leaves the element paused, so a repeat error would read
      // "paused" from that intermediate state. Keep the original play intent.
      const carried = decodeRestoreState || (repeat ? lastDecodeError.state : null);
      if (carried?.shouldPlay) state = { ...state, shouldPlay: true };
      lastDecodeError.state = state;
      if (count > 1) state = { ...state, currentTime: lastDecodeError.time + 2 * (count - 1) };
      const token = videoLoadToken;
      decodeRecovery = {
        state,
        token,
        timer: window.setTimeout(() => {
          const pending = decodeRecovery;
          decodeRecovery = null;
          if (!pending || disposed || pending.token !== videoLoadToken) return;
          // Shaka did not recover by itself; reload the source at the same spot.
          const now = Date.now();
          decodeReloadAttempts = decodeReloadAttempts.filter((at) => now - at < 60_000);
          if (decodeReloadAttempts.length >= 2) {
            void advanceVideoSource(video.error || new Error("Repeated media decode errors"), pending.state);
            return;
          }
          decodeReloadAttempts.push(now);
          void loadCurrentSource(pending.state);
        }, 4_000),
      };
    }

    function onDashMediaSourceRecovered() {
      const pending = decodeRecovery;
      if (!pending || pending.token !== videoLoadToken) return;
      window.clearTimeout(pending.timer);
      decodeRecovery = null;
      decodeRestoreState = pending.state;
    }

    function applyDecodeRestore() {
      const state = decodeRestoreState;
      if (!state || disposed || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
      decodeRestoreState = null;
      videoSeekState = null;
      if (Math.abs(video.currentTime - state.currentTime) > 0.5) setMediaTime(video, state.currentTime);
      if (state.shouldPlay && mode === "video" && video.paused) video.play().catch(() => {});
    }

    function clearDecodeRecovery() {
      if (decodeRecovery) window.clearTimeout(decodeRecovery.timer);
      decodeRecovery = null;
      decodeRestoreState = null;
    }

    function onVideoError() {
      if (disposed) return;
      if (dashPlayer) {
        handleDashMediaError();
        return;
      }
      if (candidates[sourceIndex]?.kind === "dash") return;
      if (mode === "video") hidePlayerLoading();
      void advanceVideoSource(video.error || new Error("HTML5 video playback failed"));
    }

    async function onAudioError() {
      if (disposed || mode !== "audio") return;
      if (sourceRefreshPromise) return;
      const time = Number.isFinite(audio.currentTime) ? audio.currentTime : pendingAudioTime;
      const shouldPlay = resumeAudioAfterLoad || backgroundPlaybackExpected || !audio.paused;
      const playbackRate = audio.playbackRate;
      const trackToken = trackChangeToken;
      audioSourceIndex += 1;
      if (audioSourceIndex < audioCandidates.length) {
        loadCurrentAudioSource(time, shouldPlay);
      } else {
        const refreshed = await refreshPlaybackSources();
        if (disposed || mode !== "audio" || trackToken !== trackChangeToken) return;
        if (refreshed && audioCandidates.length) {
          loadCurrentAudioSource(time, shouldPlay, playbackRate);
        } else {
          showPlayerFailure(t("playbackFailed"));
        }
      }
    }

    function onAudioMetadata() {
      if (mode !== "audio") return;
      audio.playbackRate = pendingAudioPlaybackRate;
      setMediaTime(audio, pendingAudioTime);
      if (resumeAudioAfterLoad && audio.paused) playAudio({ explicit: false }).catch(() => {});
      updateAudioControls();
      updateMediaSessionState({ forcePosition: true });
    }

    function onActiveMediaReady(event) {
      if (event.currentTarget !== activeMedia()) return;
      // Some browsers emit seeked/canplay before the requested segment arrives.
      // Keep recovery armed until the target is actually decoded.
      if (event.currentTarget === video && videoSeekState) {
        if (video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            Math.abs(video.currentTime - videoSeekState.currentTime) > 1) return;
        videoSeekState = null;
      }
      window.clearTimeout(playbackStallTimer);
      playbackStallTimer = 0;
      if (event.currentTarget === audio) resumeAudioAfterLoad = false;
      hidePlayerLoading();
      updateMediaSessionState({ forcePosition: true });
    }

    function onActiveMediaWaiting(event) {
      if (event.currentTarget !== activeMedia()) return;
      showPlayerLoading();
      if (playbackStallTimer) return;
      const media = event.currentTarget;
      const time = media.currentTime;
      const trackToken = trackChangeToken;
      playbackStallTimer = window.setTimeout(() => {
        playbackStallTimer = 0;
        const pendingSeek = media === video && videoSeekState;
        if (disposed || trackToken !== trackChangeToken || media !== activeMedia() || (media.paused && !pendingSeek) || media.ended) return;
        if (Math.abs(media.currentTime - time) > 0.5) return;
        // Native HLS and recoverable DASH network errors can stall without an
        // HTMLMediaElement error. Give normal buffering 30 seconds first.
        if (media === audio) void onAudioError();
        else void advanceVideoSource(new Error("Playback stalled for 30 seconds"));
      }, 30_000);
    }

    function formatMediaTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
      const total = Math.floor(seconds);
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const remaining = total % 60;
      return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
        : `${minutes}:${String(remaining).padStart(2, "0")}`;
    }

    function updateAudioControls() {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const current = Number.isFinite(audio.currentTime) ? Math.min(audio.currentTime, duration || audio.currentTime) : 0;
      audioTimeline.max = String(duration || 1);
      if (!audioTimeline.matches(":active")) audioTimeline.value = String(current);
      audioTime.textContent = `${formatMediaTime(current)} / ${formatMediaTime(duration)}`;
      const playing = !audio.paused && !audio.ended;
      audioPlayButton.classList.toggle("is-playing", playing);
      audioPlayButton.setAttribute("aria-label", playing ? t("pauseAudio") : t("playAudio"));
    }

    function toggleAudioPlayback() {
      if (audio.paused || audio.ended) playAudio({ explicit: true }).catch(() => {});
      else pauseAudio({ explicit: true });
    }

    function seekAudioFromControl() {
      const target = Number(audioTimeline.value);
      if (!Number.isFinite(target)) return;
      setMediaTime(audio, target);
      updateAudioControls();
      updateMediaSessionState({ forcePosition: true });
    }

    function scheduleBackgroundResume() {
      if (
        disposed ||
        mode !== "audio" ||
        !document.hidden ||
        !backgroundPlaybackExpected ||
        !wasPlayingBeforeHidden ||
        backgroundResumeConsumed ||
        audio.ended ||
        Date.now() - hiddenAt > BACKGROUND_PAUSE_GRACE_MS ||
        lastExplicitAudioAction === "pause"
      ) {
        return;
      }
      backgroundResumeConsumed = true;
      clearBackgroundResumeTimer();
      backgroundResumeTimer = window.setTimeout(() => {
        backgroundResumeTimer = 0;
        if (!audio.paused || audio.ended || !document.hidden || !backgroundPlaybackExpected) return;
        configureAudioSession();
        playAudio({ explicit: false }).catch(() => {});
      }, 350);
    }

    function onDocumentVisibilityChange() {
      if (document.hidden) {
        hiddenAt = Date.now();
        wasPlayingBeforeHidden =
          mode === "audio" && !audio.ended && (!audio.paused || Date.now() - lastAudioPlayingAt < 1_000);
        backgroundResumeConsumed = false;
        configureAudioSession();
        updateMediaSessionMetadata();
        updateMediaSessionState({ forcePosition: true });
        if (audio.paused) scheduleBackgroundResume();
        return;
      }
      hiddenAt = 0;
      wasPlayingBeforeHidden = false;
      backgroundResumeConsumed = false;
      clearBackgroundResumeTimer();
    }

    function onVideoEnded() {
      if (mode !== "video" || disposed) return;
      if (canAutoAdvance()) void changeTrack(playlistIndex + 1);
    }

    function onVideoProgress() {
      if (mode !== "video" || disposed || !Number.isFinite(video.duration)) return;
      if (video.duration - video.currentTime <= VIDEO_PREFETCH_LEAD_SECONDS) prefetchNextTrack({ force: true });
    }

    function toggleAutoplay() {
      setAutoplayEnabled(!isAutoplayEnabled());
      updateAutoplayButton();
      updateTrackControls();
    }

    function onAudioEnded() {
      if (mode !== "audio" || disposed) return;
      if (canAutoAdvance()) {
        void changeTrack(playlistIndex + 1);
        return;
      }
      backgroundPlaybackExpected = false;
      wasPlayingBeforeHidden = false;
      updateAudioControls();
      updateMediaSessionState({ forcePosition: true });
    }

    function onMediaStateChange(event) {
      if (event.currentTarget !== activeMedia()) return;
      if (event.currentTarget === video) {
        if (event.type === "play") videoPlaybackExpected = true;
        else if (event.type === "pause" && !video.error && !pendingVideoRestore && !videoFallbackPromise) videoPlaybackExpected = false;
        if (videoSeekState && (event.type === "play" || event.type === "pause") && !pendingVideoRestore && !videoFallbackPromise) {
          videoSeekState.shouldPlay = event.type === "play";
        }
      }
      if (event.currentTarget === audio) {
        if (!audio.paused && !audio.ended) {
          configureAudioSession();
          backgroundPlaybackExpected = true;
          lastAudioPlayingAt = Date.now();
          if (!document.hidden) lastExplicitAudioAction = "play";
        } else if (event.type === "pause") {
          scheduleBackgroundResume();
        }
        updateAudioControls();
      }
      updateMediaSessionState({ forcePosition: event.type !== "timeupdate" });
    }

    function showPlayerFailure(message) {
      window.clearTimeout(playbackStallTimer);
      playbackStallTimer = 0;
      videoSeekState = null;
      pendingVideoRestore = null;
      videoPlaybackExpected = false;
      videoBox.hidden = true;
      meta.hidden = true;
      errorBox.hidden = false;
      errorBox.replaceChildren();
      const messageNode = createElement("div");
      messageNode.textContent = message;
      const retry = createElement("button", "ym-button");
      retry.type = "button";
      retry.textContent = t("retry");
      retry.addEventListener("click", () => location.reload(), { once: true });
      errorBox.append(messageNode, retry);
    }

    mount.host.insertBefore(shell, mount.before || null);
    document.documentElement.appendChild(backgroundAudioHost);
    configureAudioSession();
    installMediaSessionHandlers();
    updateMediaSessionMetadata();

    video.addEventListener("error", onVideoError);
    video.addEventListener("seeking", onVideoSeeking);
    video.addEventListener("loadedmetadata", onVideoLoadedMetadata);
    audio.addEventListener("error", onAudioError);
    audio.addEventListener("loadedmetadata", onAudioMetadata);
    audio.addEventListener("ended", onAudioEnded);
    video.addEventListener("ended", onVideoEnded);
    video.addEventListener("timeupdate", onVideoProgress);
    document.addEventListener("visibilitychange", onDocumentVisibilityChange, true);

    for (const media of [video, audio]) {
      media.addEventListener("loadstart", onActiveMediaWaiting);
      media.addEventListener("waiting", onActiveMediaWaiting);
      media.addEventListener("stalled", onActiveMediaWaiting);
      media.addEventListener("seeking", onActiveMediaWaiting);
      media.addEventListener("canplay", onActiveMediaReady);
      if (media === video) {
        media.addEventListener("canplay", applyDecodeRestore);
        media.addEventListener("seeked", applyDecodeRestore);
      }
      media.addEventListener("playing", onActiveMediaReady);
      media.addEventListener("seeked", onActiveMediaReady);
      media.addEventListener("play", onMediaStateChange);
      media.addEventListener("pause", onMediaStateChange);
      media.addEventListener("durationchange", onMediaStateChange);
      media.addEventListener("ratechange", onMediaStateChange);
      media.addEventListener("timeupdate", onMediaStateChange);
    }

    qualitySelector.addEventListener("change", onQualitySelectionChange);
    // Removed on dispose through playerAbort, since the TextTrackList outlives this player.
    video.textTracks.addEventListener("change", onNativeSubtitleChange, { signal: playerAbort.signal });
    audioModeButton.addEventListener("click", toggleAudioMode);
    audioPlayButton.addEventListener("click", toggleAudioPlayback);
    audioTimeline.addEventListener("input", seekAudioFromControl);
    fullscreenButton.addEventListener("click", enterFullscreen);
    // Playback starting (autoplay, resume, or a track change) seeks fullscreen.
    video.addEventListener("play", autoEnterFullscreen, { signal: playerAbort.signal });
    let firstGestureUsed = false;
    const onPlayerGesture = () => {
      if (firstGestureUsed || isCurrentlyFullscreen()) return;
      firstGestureUsed = true;
      if (video.paused) video.play().catch(() => {});
      autoEnterFullscreen();
    };
    videoBox.addEventListener("click", onPlayerGesture, { signal: playerAbort.signal });
    videoBox.addEventListener("touchend", onPlayerGesture, { passive: true, signal: playerAbort.signal });
    audioPreviousButton.addEventListener("click", () => skipTrack(-1));
    audioNextButton.addEventListener("click", () => skipTrack(1));
    autoplayButton.addEventListener("click", toggleAutoplay);

    configureSubtitles(source?.captionTracks);
    updateModeButton();
    updateFullscreenAvailability();
    updateTrackControls();
    renderSelectorOptions();
    updateAutoplayButton();
    if (playlist) {
      // Let the page drive this player: the playlist rail plays an item in
      // place, and watch-next details fill in the creator and the queue.
      playlist.play = (index) => void changeTrack(index);
      playlist.setCreator = (details) => setCreator(details);
      playlist.refresh = () => {
        renderSelectorOptions();
        updateTrackControls();
        prefetchNextTrack();
      };
    }
    void loadCurrentSource(pendingVideoRestore?.state || null);

    return () => {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(playbackStallTimer);
      playerAbort.abort();
      clearDecodeRecovery();
      clearSubtitles();
      trackChangeToken += 1;
      trackSourceCache.clear();
      videoLoadToken += 1;
      pendingVideoRestore = null;
      videoSeekState = null;
      videoFallbackPromise = null;
      void destroyDashPlayback();
      clearMediaSessionHandlers();
      document.removeEventListener("visibilitychange", onDocumentVisibilityChange, true);
      for (const media of [video, audio]) {
        media.pause();
        media.removeAttribute("src");
        media.load();
      }
      clearBackgroundResumeTimer();
      backgroundAudioHost.remove();
      shell.remove();
    };
  }

  // === module: comments ===
  function createVideoCommentsSection({ topToken = "", newestToken = "", initialCountText = "", signal }) {
    const section = createElement("section", "ym-video-comments");
    section.setAttribute("aria-label", t("commentsAria"));

    const header = createElement("header", "ym-comments-header");
    const heading = createElement("div", "ym-comments-heading");
    const titleRow = createElement("div", "ym-comments-title-row");
    const title = createElement("h2", "ym-comments-title");
    title.textContent = t("commentsTitle");
    const countBadge = createElement("span", "ym-comments-count");
    if (initialCountText) {
      countBadge.textContent = initialCountText;
      countBadge.hidden = false;
    } else {
      countBadge.hidden = true;
    }
    titleRow.append(title, countBadge);
    heading.appendChild(titleRow);

    const sortGroup = createElement("div", "ym-segmented-control ym-comments-sort");
    sortGroup.setAttribute("role", "group");
    sortGroup.setAttribute("aria-label", t("commentsSort"));
    const topButton = createElement("button", "ym-segmented-option");
    topButton.type = "button";
    topButton.dataset.mode = "top";
    topButton.textContent = t("commentsTop");
    const newestButton = createElement("button", "ym-segmented-option");
    newestButton.type = "button";
    newestButton.dataset.mode = "newest";
    newestButton.textContent = t("commentsNewest");
    sortGroup.append(topButton, newestButton);
    header.append(heading, sortGroup);

    const list = createElement("div", "ym-comments-list");
    const status = createElement("div", "ym-comments-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const sentinel = createElement("div", "ym-comments-sentinel");
    sentinel.setAttribute("aria-hidden", "true");
    section.append(header, list, status, sentinel);

    let sortMode = "top";
    let continuation = topToken || newestToken || "";
    let loading = false;
    let ended = false;
    let disposed = false;
    let page = 0;
    let requestGeneration = 0;
    const seen = new Set();

    function updateSortButtons() {
      for (const button of [topButton, newestButton]) {
        const active = button.dataset.mode === sortMode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      }
      // Sorting needs both tokens; MWEB responses usually omit the sort menu.
      sortGroup.hidden = !topToken || !newestToken;
    }

    function showSkeletons() {
      if (list.childElementCount > 0) return;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < 3; index += 1) {
        fragment.appendChild(createCommentSkeleton());
      }
      list.appendChild(fragment);
    }

    function clearSkeletons() {
      list.querySelectorAll(".ym-comment-skeleton").forEach((node) => node.remove());
    }

    function setStatus(message = "", state = "") {
      status.replaceChildren();
      status.textContent = message;
      if (state) status.dataset.state = state;
      else delete status.dataset.state;
    }

    async function loadMore() {
      if (disposed || signal?.aborted || loading || ended || page >= COMMENT_MAX_PAGES) return;
      if (!continuation) {
        ended = true;
        setStatus(page === 0 ? t("commentsClosed") : t("commentsEnd"), "done");
        return;
      }

      loading = true;
      const generation = requestGeneration;
      if (page === 0) {
        showSkeletons();
        setStatus(t("commentsLoading"), "loading");
      } else {
        setStatus(t("loadingMore"), "loading");
      }

      try {
        const result = await getVideoCommentsPage(continuation, signal);
        if (disposed || signal?.aborted || generation !== requestGeneration) return;

        if (result.topToken && !topToken) topToken = result.topToken;
        if (result.newestToken && !newestToken) newestToken = result.newestToken;
        if (result.countText && countBadge.hidden) {
          countBadge.textContent = result.countText;
          countBadge.hidden = false;
        }
        updateSortButtons();

        const fresh = result.comments.filter((comment) => {
          if (seen.has(comment.id)) return false;
          seen.add(comment.id);
          return true;
        });

        clearSkeletons();
        const fragment = document.createDocumentFragment();
        for (const comment of fresh) fragment.appendChild(createVideoCommentCard(comment));
        list.appendChild(fragment);

        page += 1;
        continuation = result.nextContinuation || "";
        ended = !continuation || page >= COMMENT_MAX_PAGES;

        if (list.childElementCount === 0 && !continuation) {
          ended = true;
          setStatus(t("commentsNoComments"), "done");
        } else if (ended) {
          setStatus(t("commentsEnd"), "done");
        } else {
          setStatus();
        }
      } catch (error) {
        if (disposed || isAbortError(error) || generation !== requestGeneration) return;
        clearSkeletons();
        console.warn(`${LOG_PREFIX} video comments failed`, error);
        status.replaceChildren();
        status.dataset.state = "error";
        const message = createElement("span", "ym-status-message");
        message.textContent = t("commentsLoadFailed");
        const retry = createElement("button", "ym-button ym-comments-retry");
        retry.type = "button";
        retry.textContent = t("retry");
        retry.addEventListener("click", () => void loadMore(), { once: true });
        status.append(message, retry);
      } finally {
        if (generation === requestGeneration) loading = false;
      }
    }

    function reset(nextMode) {
      if (disposed || sortMode === nextMode) return;
      const targetToken = nextMode === "newest" ? newestToken : topToken;
      if (!targetToken) return;
      sortMode = nextMode;
      requestGeneration += 1;
      continuation = targetToken;
      page = 0;
      loading = false;
      ended = false;
      seen.clear();
      list.replaceChildren();
      updateSortButtons();
      void loadMore();
    }

    topButton.addEventListener("click", () => reset("top"));
    newestButton.addEventListener("click", () => reset("newest"));
    updateSortButtons();

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(sentinel);

    return {
      element: section,
      start() {
        void loadMore();
      },
      cleanup() {
        if (disposed) return;
        disposed = true;
        requestGeneration += 1;
        observer.disconnect();
      },
    };
  }

  function createVideoCommentCard(comment) {
    const article = createElement("article", "ym-comment-card");
    article.dataset.commentId = comment.id;

    const avatarLink = comment.creatorUrl
      ? createElement("a", "ym-comment-avatar-link")
      : createElement("span", "ym-comment-avatar-link");
    if (comment.creatorUrl) {
      avatarLink.href = comment.creatorUrl;
      avatarLink.setAttribute("aria-label", t("openCreatorProfile", { name: comment.name }));
    }
    const avatar = document.createElement("img");
    avatar.className = "ym-comment-avatar";
    avatar.alt = "";
    avatar.loading = "lazy";
    avatar.decoding = "async";
    if (comment.avatar) avatar.src = comment.avatar;
    avatarLink.appendChild(avatar);

    const content = createElement("div", "ym-comment-content");
    const top = createElement("div", "ym-comment-top");
    const authorRow = createElement("div", "ym-comment-author-row");
    const author = comment.creatorUrl
      ? createElement("a", "ym-comment-author")
      : createElement("span", "ym-comment-author");
    if (comment.creatorUrl) author.href = comment.creatorUrl;
    author.textContent = comment.name;
    authorRow.appendChild(author);

    if (comment.isCreator) {
      const uploader = createElement("span", "ym-comment-badge is-uploader");
      uploader.textContent = t("commentsCreator");
      authorRow.appendChild(uploader);
    }
    if (comment.pinned) {
      const pinned = createElement("span", "ym-comment-badge");
      pinned.textContent = t("commentsPinned");
      authorRow.appendChild(pinned);
    }

    const time = createElement("div", "ym-comment-time");
    time.textContent = comment.publishedTime;
    top.append(authorRow, time);

    const message = createElement("div", "ym-comment-message");
    message.textContent = comment.message;
    content.append(top, message);

    const actions = createElement("div", "ym-comment-actions");
    if (comment.likesText) {
      const likes = createElement("span", "ym-comment-action");
      likes.replaceChildren(createSvgIcon([["path", {"d": "M7.5 10.5 11 3.8c.5-1 2-.7 2 .5V9h4.8a2.2 2.2 0 0 1 2.1 2.8l-1.5 5.5a2.3 2.3 0 0 1-2.2 1.7H7.5zM3.5 10.5h4v8.5h-4z"}]], "0 0 24 24"));
      const label = createElement("span");
      label.textContent = comment.likesText;
      likes.appendChild(label);
      actions.appendChild(likes);
    }
    if (comment.replyCountText) {
      const replies = createElement("span", "ym-comment-action");
      replies.replaceChildren(createSvgIcon([["path", {"d": "M5 5.5h14v10H9l-4 3z"}]], "0 0 24 24"));
      const label = createElement("span");
      label.textContent = comment.replyCountText;
      replies.appendChild(label);
      actions.appendChild(replies);
    }
    if (actions.childElementCount > 0) content.appendChild(actions);

    article.append(avatarLink, content);
    return article;
  }

  function createCommentSkeleton() {
    const card = createElement("div", "ym-comment-card ym-comment-skeleton");
    card.setAttribute("aria-hidden", "true");
    const avatar = createElement("div", "ym-comment-avatar ym-skeleton-block");
    const content = createElement("div", "ym-comment-content");
    const author = createElement("div", "ym-skeleton-line is-comment-author");
    const line = createElement("div", "ym-skeleton-line is-comment-line");
    const shortLine = createElement("div", "ym-skeleton-line is-comment-short");
    content.append(author, line, shortLine);
    card.append(avatar, content);
    return card;
  }

  // === module: media-api (InnerTube Player & Shaka DASH) ===
  // Queries unciphered InnerTube clients to obtain native HLS (.m3u8),
  // adaptive DASH streams (with SegmentBase ranges), and direct audio-only streams.
  // Order matters: candidates are tried in this order during playback.
  const INNERTUBE_PLAYER_CLIENTS = Object.freeze([
    {
      // googlevideo now enforces a proof-of-origin (PO) token for IOS and
      // ANDROID_VR stream URLs: without one, any byte range past ~1 MiB returns
      // 403, so playback stops after about a minute. VISIONOS is not subject to
      // that check and needs no signature deciphering, so it goes first.
      name: "VISIONOS",
      clientId: "101",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      context: {
        client: {
          clientName: "VISIONOS",
          clientVersion: "1.02",
          deviceMake: "Apple",
          deviceModel: "RealityDevice17,1",
          osName: "visionOS",
          osVersion: "26.5.23O471",
        },
      },
    },
    {
      // Fallback for videos VISIONOS refuses (e.g. "made for kids"). PO-token
      // enforcement here is selective, so some videos still play in full.
      // ANDROID_VR was removed: since August 2026 all of its formats return 403.
      name: "IOS",
      clientId: "5",
      userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X;)",
      context: {
        client: {
          clientName: "IOS",
          clientVersion: "20.10.4",
          deviceMake: "Apple",
          deviceModel: "iPhone16,2",
          osName: "iPhone",
          osVersion: "18.3.1.22D72",
        },
      },
    },
  ]);

  async function getYouTubePlaySource(videoId, signal) {
    const hl = UI_LANGUAGE_TAG;
    let mergedVideoDetails = null;
    const candidates = [];
    const audioCandidates = [];
    const seenAudioUrls = new Set();
    const captionTracks = new Map();
    const failures = [];

    // YouTube's bot check refuses anonymous player requests that carry no
    // visitor ID ("Sign in to confirm you're not a bot"), so make sure the page
    // configuration (which holds it) has loaded before asking for streams.
    await ensureInnertubeConfig(signal);
    throwIfAborted(signal);

    // Query every client at once; results are still merged in priority order.
    const requestPlayer = (clientProfile) => {
        const payload = {
          videoId,
          racyCheckOk: true,
          contentCheckOk: true,
          context: {
            client: {
              ...clientProfile.context.client,
              userAgent: clientProfile.userAgent,
              hl,
              gl: "US",
               ...(cachedVisitorData ? { visitorData: cachedVisitorData } : {}),
            },
          },
        };

        // Safari extension requests cannot reliably override User-Agent. The
        // page's fetch supplies browser headers; app identity belongs in JSON.
        const response = youtubePageRequest(
          "POST",
          `${location.origin}/youtubei/v1/player?prettyPrint=false`,
          {
            headers: {
              "Content-Type": "application/json",
              "X-YouTube-Client-Name": clientProfile.clientId,
              "X-YouTube-Client-Version": clientProfile.context.client.clientVersion,
              ...(cachedVisitorData ? { "X-Goog-Visitor-Id": cachedVisitorData } : {}),
            },
            data: JSON.stringify(payload),
            signal,
            credentials: "omit",
          },
        );
        return response;
    };
    const sentWithVisitorData = Boolean(cachedVisitorData);
    const pendingResponses = INNERTUBE_PLAYER_CLIENTS.map((clientProfile) =>
      requestPlayer(clientProfile).then((response) => ({ response }), (error) => ({ error })),
    );

    for (const [clientIndex, clientProfile] of INNERTUBE_PLAYER_CLIENTS.entries()) {
      try {
        const settled = await pendingResponses[clientIndex];
        if (settled.error) throw settled.error;
        let response = settled.response;
        // Without a visitor ID the bot check refuses the request, but the
        // refusal itself issues one. Adopt it and retry this client once.
        const issuedVisitorData = String(response?.responseContext?.visitorData || "");
        if (response?.playabilityStatus?.status !== "OK" && issuedVisitorData && !sentWithVisitorData) {
          cachedVisitorData ||= issuedVisitorData;
          response = await requestPlayer(clientProfile);
        }

        for (const track of normalizeYouTubeCaptionTracks(response)) {
          if (!captionTracks.has(track.id)) captionTracks.set(track.id, track);
        }
        if (response?.playabilityStatus?.status !== "OK" || !response?.streamingData) {
          const reason = readText(response?.playabilityStatus?.reason) ||
            response?.error?.message || response?.playabilityStatus?.status || "No streaming data";
          failures.push(`${clientProfile.name}: ${reason}`);
          continue;
        }

        mergedVideoDetails ||= response.videoDetails || null;
        const streamingData = response.streamingData;

        const candidateCount = candidates.length;
        // 1. Collect Audio-Only streams
        for (const item of normalizeYouTubeAudioSource(streamingData)) {
          if (seenAudioUrls.has(item.url)) continue;
          seenAudioUrls.add(item.url);
          audioCandidates.push(item);
        }

        // 2. Build Shaka DASH candidate if adaptiveFormats with ranges are present
        if (isDashPlaybackSupported()) {
          const dashCandidate = await normalizeYouTubeDashSource(streamingData, response.videoDetails);
          if (dashCandidate) {
            candidates.push(dashCandidate);
          }
        }

        // 3. Collect native HLS (.m3u8) for Safari
        if (streamingData.hlsManifestUrl && canPlayHlsNatively()) {
          candidates.push({
            kind: "hls",
            url: streamingData.hlsManifestUrl,
            quality: 1080,
            qualityLabel: "HLS · Auto",
          });
        }

        if (candidates.length === candidateCount) {
          const reason = !getShaka()
            ? "DASH library did not load"
            : !isDashPlaybackSupported()
              ? "DASH is unsupported on this browser; no native HLS source"
              : "No compatible video and audio tracks";
          failures.push(`${clientProfile.name}: ${reason}`);
        }
        // Keep independent client fallbacks: an OK player response does not
        // guarantee that its CDN URLs will keep working for the full video.
      } catch (error) {
        if (isAbortError(error)) throw error;
        failures.push(`${clientProfile.name}: ${String(error.message || error).slice(0, 160)}`);
        console.debug(`${LOG_PREFIX} player client ${clientProfile.name} failed`, error);
      }
    }

    if (candidates.length === 0) {
      const error = new Error(t("playbackFailed"));
      error.playbackDetails = failures.join("; ");
      throw error;
    }

    return {
      videoId,
      captionTracks: [...captionTracks.values()],
      videoDetails: mergedVideoDetails,
      candidates,
      audioCandidates,
    };
  }

  function normalizeYouTubeCaptionTracks(response) {
    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks)) return [];
    return tracks.flatMap((track) => {
      if (!track?.baseUrl || !track.languageCode) return [];
      try {
        const url = new URL(track.baseUrl);
        if (url.protocol !== "https:" || !["www.youtube.com", "m.youtube.com"].includes(url.hostname) || url.pathname !== "/api/timedtext") return [];
        return [{
          id: track.vssId || `${track.languageCode}:${track.kind || "manual"}:${readText(track.name)}`,
          languageCode: track.languageCode,
          label: readText(track.name) || track.languageCode,
          autoGenerated: track.kind === "asr",
          url: url.href,
        }];
      } catch {
        return [];
      }
    });
  }

  function parseYouTubeCaptionCues(data) {
    if (!Array.isArray(data?.events)) throw new Error("Invalid subtitle response");
    const cues = [];
    for (const event of data.events) {
      if (!Array.isArray(event?.segs)) continue;
      const start = Number(event.tStartMs) / 1000;
      const duration = Number(event.dDurationMs) / 1000;
      const text = event.segs.map((segment) => String(segment.utf8 || "")).join("").replace(/\r\n?/g, "\n").trim();
      if (!text || !Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0) continue;
      cues.push({ start, end: start + duration, text });
    }
    if (!cues.length) throw new Error("No subtitle cues returned");
    return cues;
  }

  async function getYouTubeCaptionCues(track, signal) {
    const url = new URL(track.url);
    url.searchParams.set("fmt", "json3");
    // The player returns www.youtube.com caption URLs, but m.youtube.com serves
    // the same signed /api/timedtext path. Requesting it same-origin avoids
    // cross-origin extension requests (and Tampermonkey permission prompts).
    url.protocol = location.protocol;
    url.host = location.host;
    const data = await youtubePageRequest("GET", url.href, { signal });
    throwIfAborted(signal);
    return parseYouTubeCaptionCues(data);
  }

  function canPlayHlsNatively() {
    try {
      const probe = document.createElement("video");
      return Boolean(
        probe.canPlayType("application/vnd.apple.mpegurl") ||
        probe.canPlayType("audio/mpegurl"),
      );
    } catch {
      return false;
    }
  }

  async function normalizeYouTubeDashSource(streamingData, videoDetails) {
    const adaptive = Array.isArray(streamingData?.adaptiveFormats) ? streamingData.adaptiveFormats : [];
    if (adaptive.length === 0) return null;

    const rawVideos = [];
    const rawAudios = [];

    adaptive.forEach((entry, index) => {
      const rep = normalizeYouTubeDashRepresentation(entry, index);
      if (!rep) return;
      if (rep.contentType === "video") rawVideos.push(rep);
      else if (rep.contentType === "audio") rawAudios.push(rep);
    });

    const videoRepresentations = await filterCompatibleVideoRepresentations(rawVideos);
    const sortedAudios = rawAudios
      .filter(isDashRepresentationSupported)
      .sort((a, b) => b.bandwidth - a.bandwidth);

    const highestAudio = sortedAudios[0];
    if (videoRepresentations.length === 0 || !highestAudio) return null;

    const durationMs = Number(
      videoDetails?.lengthSeconds
        ? Number(videoDetails.lengthSeconds) * 1000
        : adaptive[0]?.approxDurationMs || 0,
    );
    const duration = durationMs / 1000;
    if (!Number.isFinite(duration) || duration <= 0) return null;

    const highestVideo = [...videoRepresentations].sort(compareVideoRepresentations)[0];
    const qualityLabel = highestVideo.height ? `${highestVideo.height}P` : t("highQuality");
    const audioLabel = formatReportedAudioLabel(highestAudio, true);
    const heights = [...new Set(videoRepresentations.map((item) => item.height).filter((h) => h > 0))]
      .sort((a, b) => b - a);

    return {
      kind: "dash",
      quality: highestVideo.height || 1080,
      qualityLabel: `${qualityLabel} · ${audioLabel} · DASH`,
      audioBandwidth: highestAudio.bandwidth,
      audioLabel,
      qualityOptions: [
        { value: "auto", label: t("qualityAuto") },
        { value: "highest", label: t("qualityHighest") },
        ...heights.map((height) => ({ value: `height:${height}`, label: `${height}P` })),
      ],
      manifest: buildDashManifest(videoRepresentations, [highestAudio], duration, 1.5),
    };
  }

  function applyYouTubeByteRange(request) {
    const key = Object.keys(request.headers || {}).find((name) => name.toLowerCase() === "range");
    const match = key && /^bytes=(\d+)-(\d*)$/i.exec(request.headers[key]);
    if (!match || !request.uris?.length) return;
    let urls;
    try {
      urls = request.uris.map((uri) => new URL(uri));
    } catch {
      return;
    }
    if (!urls.every((url) => url.hostname === "googlevideo.com" || url.hostname.endsWith(".googlevideo.com"))) return;
    // googlevideo supports byte ranges in the URL. Using that endpoint avoids
    // CDN/proxy handling of Range headers when fetching unbuffered seek data.
    request.uris = urls.map((url) => {
      url.searchParams.set("range", `${match[1]}-${match[2]}`);
      return url.href;
    });
    delete request.headers[key];
  }

  function normalizeYouTubeDashRepresentation(entry, index) {
    if (!entry?.url || !entry?.mimeType) return null;
    const initRange = entry.initRange;
    const indexRange = entry.indexRange;
    if ([initRange?.start, initRange?.end, indexRange?.start, indexRange?.end].some((value) =>
      value == null || !Number.isSafeInteger(Number(value)) || Number(value) < 0) ||
      Number(initRange.start) > Number(initRange.end) || Number(indexRange.start) > Number(indexRange.end)) {
      return null;
    }

    const [rawMime, ...params] = String(entry.mimeType).split(";");
    const mimeType = rawMime.trim();
    const codecsMatch = params.join(";").match(/codecs="([^"]+)"/i);
    const codecs = (codecsMatch?.[1] || "").trim();
    if (!codecs) return null;

    const isVideo = mimeType.startsWith("video/");
    const isAudio = mimeType.startsWith("audio/");
    if (!isVideo && !isAudio) return null;

    return {
      id: `${isVideo ? "v" : "a"}-${entry.itag || index}-${index}`,
      contentType: isVideo ? "video" : "audio",
      quality: Number(entry.height || entry.itag || 0),
      bandwidth: Math.max(1, Number(entry.bitrate || entry.averageBitrate || 1)),
      mimeType,
      codecs,
      codecFamily: isVideo ? classifyCodec(codecs) : classifyAudioCodec(codecs),
      dynamicRange: /vp9\.2|av01\.0\.(?:0[9]|1\d)\./i.test(codecs) ? "HDR10" : "SDR",
      urls: [entry.url],
      initialization: `${initRange.start}-${initRange.end}`,
      indexRange: `${indexRange.start}-${indexRange.end}`,
      width: Math.max(0, Number(entry.width || 0)),
      height: Math.max(0, Number(entry.height || 0)),
      frameRate: String(entry.fps || "").trim(),
      audioSamplingRate: Math.max(0, Number(entry.audioSampleRate || 0)),
      audioChannels: Math.max(1, Number(entry.audioChannels || 2)),
      startWithSAP: 1,
    };
  }

  function normalizeYouTubeAudioSource(streamingData) {
    const adaptive = Array.isArray(streamingData?.adaptiveFormats) ? streamingData.adaptiveFormats : [];
    const audioEntries = adaptive.filter(
      (item) => item?.url && String(item.mimeType || "").startsWith("audio/"),
    );

    const sorted = audioEntries
      .map((entry) => {
        const [rawMime, ...params] = String(entry.mimeType).split(";");
        const mimeType = rawMime.trim();
        const codecs = (params.join(";").match(/codecs="([^"]+)"/i)?.[1] || "").trim();
        const fullType = codecs ? `${mimeType}; codecs="${codecs}"` : mimeType;
        let supported = audioTypeSupportCache.get(fullType);
        if (supported === undefined) {
          try {
            audioSupportProbe ||= document.createElement("audio");
            supported = audioSupportProbe.canPlayType(fullType) !== "";
          } catch {
            supported = false;
          }
          audioTypeSupportCache.set(fullType, supported);
        }
        const isM4a = mimeType.includes("mp4");
        const bandwidth = Number(entry.bitrate || entry.averageBitrate || 0);
        return { entry, mimeType, codecs, supported, isM4a, bandwidth };
      })
      .sort((a, b) => {
        if (a.supported !== b.supported) return Number(b.supported) - Number(a.supported);
        // Prefer AAC/MP4 on iOS Safari for reliable hardware lock-screen decoding
        if (a.isM4a !== b.isM4a) return Number(b.isM4a) - Number(a.isM4a);
        return b.bandwidth - a.bandwidth;
      });

    return sorted.map((item, idx) => ({
      url: item.entry.url,
      quality: item.bandwidth,
      qualityLabel: formatReportedAudioLabel(
        { bandwidth: item.bandwidth, codecs: item.codecs },
        idx === 0,
      ),
      bandwidth: item.bandwidth,
      mimeType: item.mimeType,
      codecs: item.codecs,
    }));
  }

  function getShaka() {
    // @require loads in Tampermonkey's sandbox; its window can differ from the
    // page's unsafeWindow, so check both.
    return globalThis.shaka || window.shaka || PAGE_WINDOW.shaka || null;
  }

  function ensureShakaPolyfills() {
    const shaka = getShaka();
    if (shakaPolyfillsInstalled || typeof shaka?.polyfill?.installAll !== "function") return;
    shaka.polyfill.installAll();
    shakaPolyfillsInstalled = true;
  }

  function isDashPlaybackSupported() {
    if (typeof dashPlaybackSupportedCache === "boolean") return dashPlaybackSupportedCache;
    try {
      ensureShakaPolyfills();
      const shaka = getShaka();
      if (!shaka?.Player) return false;
      // Shaka can support native HLS without supporting DASH. Only advertise
      // adaptive DASH when a real MediaSource implementation is available.
      if (!PAGE_WINDOW.ManagedMediaSource && !PAGE_WINDOW.MediaSource &&
          !globalThis.ManagedMediaSource && !globalThis.MediaSource) return false;
      dashPlaybackSupportedCache = Boolean(shaka.Player.isBrowserSupported());
      return dashPlaybackSupportedCache;
    } catch {
      dashPlaybackSupportedCache = false;
      return false;
    }
  }

  async function filterCompatibleVideoRepresentations(representations) {
    const probed = await Promise.all(
      representations.map(async (representation) => ({
        representation,
        capability: await probeVideoDecodingCapability(representation),
      })),
    );

    const compatible = probed.filter(({ representation, capability }) => {
      if (!isDashRepresentationSupported(representation) || !capability.supported) return false;
      if (representation.codecFamily === "av1") {
        return capability.verified && capability.smooth && capability.powerEfficient;
      }
      return true;
    });
    if (compatible.length === 0) return [];

    // Shaka keeps a single codec family per manifest, so choose one. Prefer the
    // newest codec the device decodes smoothly in hardware (AV1, then VP9) at the
    // highest resolution it offers; H.264 is the always-stable baseline. Software
    // decoding drains battery and stutters on phones, so it is only a last resort.
    const CODEC_RANK = { av1: 3, vp9: 2, avc: 1 };
    const isHardwareFriendly = ({ representation, capability }) =>
      representation.codecFamily === "avc" ||
      (capability.smooth && capability.powerEfficient && (capability.verified || representation.codecFamily !== "av1"));
    const preferred = compatible.filter(isHardwareFriendly);
    let pool = preferred.length > 0 ? preferred : compatible;
    // Mixed SDR/HDR ladders make adaptive switching flip tone mapping mid-play.
    const sdr = pool.filter((item) => item.representation.dynamicRange === "SDR");
    if (sdr.length > 0) pool = sdr;

    const familyStats = new Map();
    for (const item of pool) {
      const family = item.representation.codecFamily;
      const stats = familyStats.get(family) || { count: 0, maxHeight: 0 };
      stats.count += 1;
      stats.maxHeight = Math.max(stats.maxHeight, item.representation.height || 0);
      familyStats.set(family, stats);
    }
    const [bestFamily] = [...familyStats.entries()].sort(
      ([familyA, a], [familyB, b]) =>
        b.maxHeight - a.maxHeight ||
        (CODEC_RANK[familyB] || 0) - (CODEC_RANK[familyA] || 0) ||
        b.count - a.count,
    )[0];

    const selectedByFormat = new Map();
    for (const item of pool.filter((entry) => entry.representation.codecFamily === bestFamily)) {
      const representation = { ...item.representation, capability: item.capability };
      const key = [
        representation.width,
        representation.height,
        representation.frameRate,
        representation.dynamicRange,
      ].join(":");
      const previous = selectedByFormat.get(key);
      if (!previous || scoreVideoRepresentation(representation) > scoreVideoRepresentation(previous)) {
        selectedByFormat.set(key, representation);
      }
    }
    return [...selectedByFormat.values()].sort(compareVideoRepresentations);
  }

  function runMediaCapabilityProbe(task) {
    return new Promise((resolve, reject) => {
      const run = () => {
        activeMediaCapabilityProbes += 1;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            activeMediaCapabilityProbes -= 1;
            mediaCapabilityQueue.shift()?.();
          });
      };
      if (activeMediaCapabilityProbes < MEDIA_CAPABILITIES_MAX_CONCURRENCY) run();
      else mediaCapabilityQueue.push(run);
    });
  }

  function probeVideoDecodingCapability(representation) {
    const key = [
      representation.mimeType,
      representation.codecs,
      representation.width,
      representation.height,
      representation.bandwidth,
      representation.frameRate,
    ].join("|");
    const cached = videoDecodingCapabilityCache.get(key);
    if (cached) return cached;

    const probe = runMediaCapabilityProbe(async () => {
      const fallback = {
        supported: isDashRepresentationSupported(representation),
        smooth: true,
        powerEfficient: representation.codecFamily !== "av1",
        verified: false,
      };
      const mediaCapabilities = PAGE_NAVIGATOR.mediaCapabilities;
      if (!mediaCapabilities || typeof mediaCapabilities.decodingInfo !== "function") return fallback;
      try {
        const result = await mediaCapabilities.decodingInfo({
          type: "media-source",
          video: {
            contentType: `${representation.mimeType}; codecs="${representation.codecs}"`,
            width: Math.max(1, representation.width),
            height: Math.max(1, representation.height),
            bitrate: Math.max(1, representation.bandwidth),
            framerate: Math.max(1, Number(representation.frameRate) || 30),
          },
        });
        return {
          supported: Boolean(result.supported),
          smooth: Boolean(result.smooth),
          powerEfficient: Boolean(result.powerEfficient),
          verified: true,
        };
      } catch {
        return fallback;
      }
    });

    videoDecodingCapabilityCache.set(key, probe);
    if (videoDecodingCapabilityCache.size > VIDEO_CAPABILITY_CACHE_LIMIT) {
      videoDecodingCapabilityCache.delete(videoDecodingCapabilityCache.keys().next().value);
    }
    return probe;
  }

  function classifyCodec(codecs) {
    const value = String(codecs || "").toLowerCase();
    if (/^(avc1|avc3)|(^|\.)h264/.test(value)) return "avc";
    if (/^(vp09|vp9)/.test(value)) return "vp9";
    if (/^(av01)|(^|\.)av1/.test(value)) return "av1";
    return "other";
  }

  function classifyAudioCodec(codecs) {
    const value = String(codecs || "").toLowerCase();
    if (value.includes("mp4a")) return "AAC";
    if (value.includes("opus")) return "Opus";
    if (value.includes("ec-3") || value.includes("eac3")) return "Dolby";
    return value ? value.toUpperCase() : t("audioGeneric");
  }

  function formatReportedAudioLabel(representation, highestAvailable = false) {
    const codec = classifyAudioCodec(representation?.codecs || "");
    const bandwidth = Number(representation?.bandwidth || 0);
    const bitrate = bandwidth > 0 ? Math.max(1, Math.round(bandwidth / 1000)) : 0;
    return [
      codec,
      bitrate ? t("bitrateReported", { bitrate }) : t("bitrateUnavailable"),
      highestAvailable ? t("highestAvailable") : "",
    ].filter(Boolean).join(" · ");
  }

  function scoreVideoRepresentation(representation) {
    const capability = representation.capability || {};
    const codecScore = {
      avc: 45,
      vp9: capability.powerEfficient ? 48 : 35,
      av1: capability.smooth && capability.powerEfficient ? 46 : 0,
      other: 10,
    }[representation.codecFamily] || 0;
    return codecScore + (capability.smooth ? 5 : 0) + (capability.powerEfficient ? 5 : 0);
  }

  function compareVideoRepresentations(left, right) {
    const pixelDelta = right.width * right.height - left.width * left.height;
    if (pixelDelta) return pixelDelta;
    const fpsDelta = (Number(right.frameRate) || 30) - (Number(left.frameRate) || 30);
    return fpsDelta || right.bandwidth - left.bandwidth;
  }

  function chooseQualityTrack(tracks, mode) {
    const playable = (Array.isArray(tracks) ? tracks : []).filter((track) => track && track.type === "variant");
    if (playable.length === 0 || mode === "auto") return null;
    const sorted = [...playable].sort((left, right) => {
      const heightDelta = Number(right.height || 0) - Number(left.height || 0);
      const fpsDelta = Number(right.frameRate || 0) - Number(left.frameRate || 0);
      return heightDelta || fpsDelta || Number(right.bandwidth || 0) - Number(left.bandwidth || 0);
    });
    if (mode === "highest") return sorted[0];
    const match = /^height:(\d+)$/.exec(String(mode || ""));
    if (!match) return sorted[0];
    const target = Number(match[1]);
    return (
      sorted.find((track) => Number(track.height || 0) === target) ||
      sorted.find((track) => Number(track.height || 0) < target) ||
      sorted.at(-1)
    );
  }

  function isDashRepresentationSupported(representation) {
    if (!representation?.mimeType || !representation?.codecs) return false;
    const fullType = `${representation.mimeType}; codecs="${representation.codecs}"`;
    const mediaSource =
      PAGE_WINDOW.ManagedMediaSource ||
      PAGE_WINDOW.MediaSource ||
      globalThis.ManagedMediaSource ||
      globalThis.MediaSource;
    try {
      if (mediaSource && typeof mediaSource.isTypeSupported === "function") {
        return mediaSource.isTypeSupported(fullType);
      }
    } catch {
    }
    try {
      const probe = document.createElement(representation.mimeType.startsWith("audio/") ? "audio" : "video");
      return probe.canPlayType(fullType) !== "";
    } catch {
      return false;
    }
  }

  function buildDashManifest(videoRepresentations, audioRepresentations, duration, minBufferTime) {
    const bufferTime = Number.isFinite(minBufferTime) && minBufferTime > 0 ? minBufferTime : 1.5;
    const adaptation = (type, representations) => {
      const rendered = representations
        .map((rep) => {
          const dimensions =
            type === "video"
              ? `${rep.width ? ` width="${rep.width}"` : ""}${rep.height ? ` height="${rep.height}"` : ""}${rep.frameRate ? ` frameRate="${escapeXML(rep.frameRate)}"` : ""}`
              : `${rep.audioSamplingRate ? ` audioSamplingRate="${rep.audioSamplingRate}"` : ""}`;
          const baseURLs = rep.urls
            .map((url, idx) => `<BaseURL serviceLocation="cdn-${idx}">${escapeXML(url)}</BaseURL>`)
            .join("");
          const audioChannels =
            type === "audio"
              ? `<AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="${rep.audioChannels || 2}" />`
              : "";
          return `<Representation id="${escapeXML(rep.id)}" bandwidth="${rep.bandwidth}" mimeType="${escapeXML(rep.mimeType)}" codecs="${escapeXML(rep.codecs)}" startWithSAP="${rep.startWithSAP}"${dimensions}>${baseURLs}<SegmentBase indexRange="${escapeXML(rep.indexRange)}"><Initialization range="${escapeXML(rep.initialization)}" /></SegmentBase>${audioChannels}</Representation>`;
        })
        .join("");
      return `<AdaptationSet id="${type}" contentType="${type}" segmentAlignment="true" subsegmentAlignment="true">${rendered}</AdaptationSet>`;
    };

    return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" mediaPresentationDuration="PT${duration.toFixed(3)}S" minBufferTime="PT${bufferTime}S">
  <Period id="0" start="PT0S">
    ${adaptation("video", videoRepresentations)}
    ${adaptation("audio", audioRepresentations)}
  </Period>
</MPD>`;
  }

  function escapeXML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  // === module: content-api (InnerTube Browse, Search, Next & Auth) ===
  function getCookieValue(name) {
    try {
      const prefix = `${String(name || "")}=`;
      for (const part of String(document.cookie || "").split(";")) {
        const entry = part.trim();
        if (entry.startsWith(prefix)) return entry.slice(prefix.length);
      }
      return "";
    } catch {
      return "";
    }
  }

  function getSapIsidCookie() {
    return getCookieValue("SAPISID") || getCookieValue("__Secure-1PAPISID") || getCookieValue("__Secure-3PAPISID") || "";
  }

  function isLoggedIn() {
    return Boolean(getSapIsidCookie());
  }

  function createYouTubeLoginUrl() {
    return `https://accounts.google.com/ServiceLogin?service=youtube&continue=${encodeURIComponent(location.href)}`;
  }

  async function buildSapIsidHashHeader(origin = "https://m.youtube.com") {
    const sapisid = getSapIsidCookie();
    const subtle = globalThis.crypto?.subtle;
    if (!sapisid || !subtle) return "";
    const timestamp = Math.floor(Date.now() / 1000);
    const input = `${timestamp} ${sapisid} ${origin}`;
    const digest = await subtle.digest("SHA-1", new TextEncoder().encode(input));
    const hashHex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `SAPISIDHASH ${timestamp}_${hashHex}`;
  }

  async function youtubePageRequest(method, url, { headers = {}, data = null, signal, responseType = "json", credentials = "same-origin" } = {}) {
    throwIfAborted(signal);
    // Browse and subscription requests must originate in YouTube's page context.
    // Extension requests can lose Safari's HttpOnly/partitioned session cookies,
    // leaving the authorization hash detached from the actual signed-in session.
    const target = new URL(url, location.href);
    if (target.origin !== location.origin) throw new Error("YouTube request must be same-origin");
    const Controller = PAGE_WINDOW.AbortController || AbortController;
    const controller = new Controller();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, API_TIMEOUT_MS);
    try {
      const response = await PAGE_WINDOW.fetch.call(PAGE_WINDOW, target.href, {
        method,
        headers,
        body: data == null ? undefined : data,
        credentials,
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      if (responseType === "text") return await response.text();
      try {
        return await response.json();
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw new Error("YouTube returned a non-JSON response");
      }
    } catch (error) {
      if (signal?.aborted) throw createAbortError();
      if (timedOut) throw new Error("YouTube request timed out");
      throw error;
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async function innertubePost(endpoint, body, signal) {
    await ensureInnertubeConfig(signal);
    throwIfAborted(signal);
    const client = {
      clientName: "WEB",
      clientVersion: "2.20260201.00.00",
      gl: "US",
      ...cachedInnertubeClient,
      hl: UI_LANGUAGE_TAG,
      ...(cachedVisitorData ? { visitorData: cachedVisitorData } : {}),
      ...(body.context?.client || {}),
    };
    const authHeader = await buildSapIsidHashHeader("https://m.youtube.com");
    const headers = {
      "Content-Type": "application/json",
      "X-Origin": "https://m.youtube.com",
      "X-YouTube-Client-Name": client.clientName === "MWEB" ? "2" : "1",
      "X-YouTube-Client-Version": client.clientVersion,
      ...(authHeader ? { "X-Goog-AuthUser": cachedAuthUser } : {}),
      ...(cachedVisitorData ? { "X-Goog-Visitor-Id": cachedVisitorData } : {}),
      ...(authHeader ? { Authorization: authHeader } : {}),
    };

    const payload = {
      ...body,
      context: {
        ...(body.context || {}),
        client,
      },
    };

    const keyQuery = cachedInnertubeApiKey ? `?key=${encodeURIComponent(cachedInnertubeApiKey)}&prettyPrint=false` : "?prettyPrint=false";
    const response = await youtubePageRequest(
      "POST",
      `${location.origin}/youtubei/v1/${endpoint}${keyQuery}`,
      {
        headers,
        data: JSON.stringify(payload),
        signal,
      },
    );

    // Some API failures arrive with HTTP 200; surface them as retryable errors
    // instead of reporting an empty feed or a successful subscription change.
    if (!response || typeof response !== "object" || response.error) {
      throw new Error(response?.error?.message || "Invalid YouTube API response");
    }
    const newVisitor = response?.responseContext?.visitorData;
    if (newVisitor && !cachedVisitorData) {
      cachedVisitorData = String(newVisitor);
    }
    return response;
  }

  async function getHomeFeedPage(browseId, continuation, signal) {
    const body = continuation ? { continuation } : { browseId };
    const data = await innertubePost("browse", body, signal);
    return extractVideosAndContinuation(data);
  }

  async function getSearchResultsPage(query, sortOrder, continuation, signal) {
    const body = continuation
      ? { continuation }
      : {
          query,
          params: SEARCH_SORT_PARAMS[sortOrder] || SEARCH_SORT_PARAMS.relevance,
        };
    const data = await innertubePost("search", body, signal);
    return extractVideosAndContinuation(data);
  }

  async function resolveChannelBrowseId(pathname, signal) {
    const directMatch = /^\/channel\/(UC[\w-]+)/i.exec(pathname);
    if (directMatch) return directMatch[1];

    const url = `https://www.youtube.com${pathname}`;
    const resolved = await innertubePost("navigation/resolve_url", { url }, signal);
    const browseId =
      resolved?.endpoint?.browseEndpoint?.browseId ||
      resolved?. endpoint?.commandMetadata?.webCommandMetadata?.url?.match(/\/channel\/(UC[\w-]+)/)?.[1] ||
      "";
    if (!browseId) throw new Error(`Unable to resolve channel ID for ${pathname}`);
    return browseId;
  }

  async function getChannelVideosPage(browseId, continuation, signal) {
    const body = continuation
      ? { continuation }
      : { browseId, params: CHANNEL_VIDEOS_TAB_PARAMS };
    const data = await innertubePost("browse", body, signal);
    const extracted = extractVideosAndContinuation(data);
    const profile = continuation ? null : extractChannelProfile(data, browseId);
    return {
      profile,
      items: extracted.items,
      nextContinuation: extracted.nextContinuation,
    };
  }

  async function modifyChannelSubscription(channelId, shouldSubscribe, signal) {
    const endpoint = shouldSubscribe ? "subscription/subscribe" : "subscription/unsubscribe";
    return innertubePost(endpoint, { channelIds: [channelId] }, signal);
  }

  async function getWatchNextDetails(videoId, playlistId, signal) {
    const body = { videoId };
    if (playlistId) body.playlistId = playlistId;
    const data = await innertubePost("next", body, signal);

    let title = "";
    let author = "";
    let channelId = "";
    let avatar = "";
    let topToken = "";
    let newestToken = "";
    let countText = "";
    let playlist = null;
    let autoplayVideoId = "";

    walkObject(data, (node) => {
      // WEB responses name the video YouTube would autoplay next. The first set
      // is the normal order; later sets cover shuffle and loop.
      const autoplaySets = node.autoplay?.autoplay?.sets;
      if (Array.isArray(autoplaySets) && !autoplayVideoId) {
        autoplayVideoId = String(autoplaySets[0]?.autoplayVideo?.watchEndpoint?.videoId || "");
      }
      if (node.videoPrimaryInfoRenderer && !title) {
        title = readText(node.videoPrimaryInfoRenderer.title);
      }
      if (node.videoSecondaryInfoRenderer && !author) {
        const owner = node.videoSecondaryInfoRenderer.owner?.videoOwnerRenderer;
        if (owner) {
          author = readText(owner.title);
          channelId = owner.navigationEndpoint?.browseEndpoint?.browseId || "";
          avatar = getBestThumbnail(owner.thumbnail?.thumbnails);
        }
      }
      if (node.playlist?.playlist && !playlist) {
        const pl = node.playlist.playlist;
        const items = (Array.isArray(pl.contents) ? pl.contents : [])
          .map((entry) => entry?.playlistPanelVideoRenderer)
          .filter((v) => v?.videoId)
          .map((v) => ({
            videoId: String(v.videoId),
            title: readText(v.title) || String(v.videoId),
            indexText: readText(v.indexText),
            thumbnail: getBestThumbnail(v.thumbnail?.thumbnails),
            author: readText(v.longBylineText?.runs?.[0] || v.shortBylineText?.runs?.[0]),
            channelId: String(
              (v.longBylineText || v.shortBylineText)?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "",
            ),
          }));
        if (items.length > 0) {
          playlist = {
            title: pl.title || readText(pl.titleText) || t("playlistTitle"),
            // The panel only carries a window of the playlist around the current video.
            totalCount: Math.max(items.length, Number(pl.totalVideos) || 0),
            items,
          };
        }
      }
      if (node.sortFilterSubMenuRenderer?.subMenuItems) {
        const items = node.sortFilterSubMenuRenderer.subMenuItems;
        for (const sub of items) {
          const token =
            sub?.serviceEndpoint?.continuationCommand?.token ||
            sub?.continuation?.reloadContinuationData?.continuation ||
            "";
          if (!token) continue;
          if (!topToken) topToken = token;
          else if (!newestToken) newestToken = token;
        }
      }
      if (node.commentsHeaderRenderer && !countText) {
        countText = readText(node.commentsHeaderRenderer.countText);
      }
      // MWEB puts the comment count in the comments engagement-panel header.
      const commentsPanel = node.engagementPanelSectionListRenderer;
      if (commentsPanel?.panelIdentifier === "engagement-panel-comments-section" && !countText) {
        countText = readText(commentsPanel.header?.engagementPanelTitleHeaderRenderer?.contextualInfo);
      }
      if (
        node.itemSectionRenderer?.sectionIdentifier === "comment-item-section" &&
        !topToken
      ) {
        const contents = node.itemSectionRenderer.contents || [];
        for (const item of contents) {
          const token = item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
          if (token) topToken = token;
        }
      }
    });

    return {
      title,
      author,
      channelId,
      avatar,
      playlist,
      comments: { topToken, newestToken, countText },
      autoplayCandidates: pickAutoplayCandidates(data, videoId, autoplayVideoId, playlist),
    };
  }

  // Candidates for the video to play after this one, best first. WEB responses
  // name YouTube's own pick; MWEB responses do not, so related videos follow it.
  // Shorts are already filtered out, and playlist entries never count.
  function pickAutoplayCandidates(data, currentVideoId, preferredVideoId, playlist) {
    const excluded = new Set([currentVideoId]);
    for (const item of playlist?.items || []) excluded.add(item.videoId);
    const related = extractVideosAndContinuation(data).items.filter((item) => !excluded.has(item.id));
    if (preferredVideoId && !excluded.has(preferredVideoId)) {
      const index = related.findIndex((item) => item.id === preferredVideoId);
      const preferred = index >= 0 ? related.splice(index, 1)[0] : { id: preferredVideoId };
      related.unshift(preferred);
    }
    return related.slice(0, 10).map((item) => ({
      videoId: item.id,
      title: item.title || "",
      thumbnail: item.cover || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
      author: item.creatorName || "",
      creatorUrl: item.creatorUrl || "",
    }));
  }

  async function getPlaylistPage(listId, continuation, signal) {
    const body = continuation ? { continuation } : { browseId: `VL${listId}` };
    const data = await innertubePost("browse", body, signal);
    const extracted = extractVideosAndContinuation(data);
    let nextContinuation = extracted.nextContinuation;
    // Playlist pages paginate with continuationItemViewModel, which the feed
    // parser does not read. The first one in document order belongs to the list.
    if (!nextContinuation) {
      walkObject(data, (node) => {
        const token = node.continuationItemViewModel?.continuationCommand?.innertubeCommand?.continuationCommand?.token;
        if (token && !nextContinuation) nextContinuation = String(token);
      });
    }
    return {
      header: continuation ? null : extractPlaylistHeader(data),
      items: extracted.items,
      nextContinuation,
    };
  }

  function extractPlaylistHeader(data) {
    const header = { title: "", ownerName: "", ownerUrl: "", details: [], cover: "" };
    walkObject(data?.header, (node) => {
      const view = node.pageHeaderViewModel;
      if (view) {
        header.title = readText(view.title?.dynamicTextViewModel?.text) || header.title;
        const rows = view.metadata?.contentMetadataViewModel?.metadataRows || [];
        for (const part of rows.flatMap((row) => row.metadataParts || [])) {
          const textNode = part.text || part.avatarStack?.avatarStackViewModel?.text;
          const text = readText(textNode);
          if (!text) continue;
          // The owner is the only part that links to a channel.
          let endpoint = null;
          walkObject(textNode?.commandRuns, (run) => {
            if (!endpoint && run.browseEndpoint?.browseId) endpoint = run.browseEndpoint;
          });
          if (endpoint && !header.ownerUrl) {
            header.ownerName = text;
            header.ownerUrl = `/channel/${endpoint.browseId}`;
          } else {
            header.details.push(text);
          }
        }
        header.cover = getBestThumbnail(view.heroImage?.contentPreviewImageViewModel?.image?.sources) || header.cover;
        return "skip";
      }
      // Older responses still use the classic playlist header.
      const legacy = node.playlistHeaderRenderer;
      if (legacy) {
        header.title = readText(legacy.title) || header.title;
        header.ownerName = readText(legacy.ownerText) || header.ownerName;
        const ownerId = legacy.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId;
        if (ownerId) header.ownerUrl = `/channel/${ownerId}`;
        const count = readText(legacy.numVideosText);
        if (count) header.details.push(count);
        return "skip";
      }
    });
    if (!header.title) header.title = String(data?.metadata?.playlistMetadataRenderer?.title || "");
    return header;
  }

  async function getVideoCommentsPage(continuation, signal) {
    const data = await innertubePost("next", { continuation }, signal);
    const comments = [];
    let nextContinuation = "";
    let topToken = "";
    let newestToken = "";
    let countText = "";

    // Map FrameworkUpdates mutations for newer YouTube comment payloads
    const commentEntities = new Map();
    const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations || [];
    for (const mut of mutations) {
      const payload = mut?.payload?.commentEntityPayload;
      if (payload?.properties?.commentId) {
        commentEntities.set(payload.properties.commentId, payload);
      }
    }

    walkObject(data, (node) => {
      if (node.sortFilterSubMenuRenderer?.subMenuItems) {
        const items = node.sortFilterSubMenuRenderer.subMenuItems;
        if (items[0]?.serviceEndpoint?.continuationCommand?.token) {
          topToken = items[0].serviceEndpoint.continuationCommand.token;
        }
        if (items[1]?.serviceEndpoint?.continuationCommand?.token) {
          newestToken = items[1].serviceEndpoint.continuationCommand.token;
        }
      }
      if (node.commentsHeaderRenderer?.countText && !countText) {
        countText = readText(node.commentsHeaderRenderer.countText);
      }
      if (node.commentThreadRenderer) {
        const parsed = normalizeCommentThread(node.commentThreadRenderer, commentEntities);
        if (parsed) comments.push(parsed);
        // Reply threads carry their own continuation tokens; never treat those
        // as the next page of top-level comments.
        return "skip";
      }
      if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
        const token = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
        if (token !== continuation) nextContinuation = token;
      }
    });

    return { comments, nextContinuation, topToken, newestToken, countText };
  }

  function normalizeCommentThread(thread, commentEntities) {
    const renderer = thread.comment?.commentRenderer;
    const viewModel = thread.commentViewModel?.commentViewModel;

    if (renderer) {
      const id = String(renderer.commentId || "").trim();
      if (!id) return null;
      const channelId = renderer.authorEndpoint?.browseEndpoint?.browseId || "";
      const replyCount = Number(renderer.replyCount || 0);
      return {
        id,
        name: readText(renderer.authorText) || t("commentsAnonymous"),
        creatorUrl: channelId ? `/channel/${channelId}` : "",
        avatar: getBestThumbnail(renderer.authorThumbnail?.thumbnails),
        message: readText(renderer.contentText),
        publishedTime: readText(renderer.publishedTimeText),
        likesText: readText(renderer.voteCount),
        replyCountText:
          replyCount > 0
            ? t(replyCount === 1 ? "commentsReplyCountOne" : "commentsReplyCountOther", {
                count: formatCount(replyCount),
              })
            : "",
        pinned: Boolean(renderer.pinnedCommentBadge),
        isCreator: Boolean(renderer.authorIsChannelOwner),
      };
    }

    if (viewModel) {
      const id = String(viewModel.commentId || "").trim();
      const entity = commentEntities.get(id);
      if (!id || !entity) return null;
      const props = entity.properties || {};
      const author = entity.author || {};
      const toolbar = entity.toolbar || {};
      const channelId = author.channelId || "";
      return {
        id,
        name: String(author.displayName || t("commentsAnonymous")),
        creatorUrl: channelId ? `/channel/${channelId}` : "",
        avatar: String(author.avatarThumbnailUrl || ""),
        message: String(props.content?.content || ""),
        publishedTime: String(props.publishedTime || ""),
        likesText: String(toolbar.likeCountNotliked || toolbar.likeCountLiked || "").trim(),
        replyCountText: toolbar.replyCount
          ? t(String(toolbar.replyCount).trim() === "1" ? "commentsReplyCountOne" : "commentsReplyCountOther", {
              count: toolbar.replyCount,
            })
          : "",
        pinned: Boolean(viewModel.pinnedText),
        isCreator: Boolean(author.isCreator),
      };
    }

    return null;
  }

  // Strictly extracts only regular, full-length videos (completely excluding Shorts, Shelves, Live without duration, Mixes, and Posts)
  function extractVideosAndContinuation(data) {
    const items = [];
    const seenIds = new Set();
    let nextContinuation = "";

    walkObject(data, (node) => {
      // Ignore Shorts and promoted cards before walking their nested video data.
      if (node.reelShelfRenderer || node.richShelfRenderer?.isShorts || node.shortsLockupViewModel ||
          node.adSlotRenderer || node.promotedSparklesWebRenderer || node.promotedVideoRenderer) {
        return "skip";
      }

      // Only the selected tab belongs to the current feed. Other tabs can carry
      // unrelated videos or pagination tokens in the same response.
      if (node.tabRenderer?.selected === false || node.expandableTabRenderer?.selected === false) return "skip";
      if (node.lockupViewModel) {
        const normalized = normalizeYouTubeLockupViewModel(node.lockupViewModel);
        if (normalized && !seenIds.has(normalized.id)) {
          seenIds.add(normalized.id);
          items.push(normalized);
        }
        return "skip";
      }

      const videoCandidate =
        node.videoRenderer ||
        node.gridVideoRenderer ||
        node.videoWithContextRenderer ||
        node.compactVideoRenderer ||
        node.playlistVideoRenderer;

      if (videoCandidate) {
        const normalized = normalizeYouTubeVideoRenderer(videoCandidate);
        if (normalized && !seenIds.has(normalized.id)) {
          seenIds.add(normalized.id);
          items.push(normalized);
        }
        return "skip";
      }

      if (node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token && !nextContinuation) {
        nextContinuation = node.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
      } else if (node.nextContinuationData?.continuation && !nextContinuation) {
        nextContinuation = node.nextContinuationData.continuation;
      }
    });

    return { items, nextContinuation };
  }

  function normalizeYouTubeLockupViewModel(v) {
    // Home, subscriptions, and related videos now use view models rather than
    // videoRenderer. Translate their attributed text and badges into our card shape.
    if (v.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;
    const metadata = v.metadata?.lockupMetadataViewModel;
    const thumbnail = v.contentImage?.thumbnailViewModel;
    if (!metadata || !thumbnail) return null;
    let durationText = "";
    let isShort = false;
    walkObject(thumbnail.overlays, (node) => {
      const badge = node.thumbnailBadgeViewModel;
      if (!badge) return;
      const icon = badge.icon?.sources?.[0]?.clientResource?.imageName || "";
      if (/SHORTS/i.test(icon) || /^shorts$/i.test(readText(badge.text))) isShort = true;
      if (isVideoDuration(readText(badge.text))) durationText = readText(badge.text);
    });
    if (isShort) return null;

    const rows = metadata.metadata?.contentMetadataViewModel?.metadataRows || [];
    const parts = rows.flatMap((row) => row.metadataParts || []);
    let creatorPart = null;
    let creatorEndpoint = null;
    for (const part of parts) {
      walkObject(part.text?.commandRuns, (node) => {
        if (!creatorEndpoint && node.browseEndpoint) {
          creatorPart = part;
          creatorEndpoint = node;
        }
      });
    }
    const info = parts.filter((part) => part !== creatorPart).map((part) => readText(part.text)).filter(Boolean);
    const endpoint = v.rendererContext?.commandContext?.onTap || {};
    return normalizeYouTubeVideoRenderer({
      videoId: v.contentId,
      title: metadata.title,
      navigationEndpoint: endpoint.innertubeCommand || endpoint,
      lengthText: durationText,
      thumbnail: { thumbnails: thumbnail.image?.sources },
      // Forward overlays so resume-progress data survives the translation.
      thumbnailOverlays: thumbnail.overlays,
      ownerText: { runs: [{ text: readText(creatorPart?.text), navigationEndpoint: creatorEndpoint }] },
      shortViewCountText: info[0] || "",
      publishedTimeText: info.slice(1).join(" · "),
    });
  }

  function isVideoDuration(value) {
    // A LIVE or UPCOMING badge is not a playable duration. Accept localized
    // digits as well as ASCII so long videos survive non-English UI settings.
    return /^[0-9٠-٩۰-۹０-９]+(?::[0-9٠-٩۰-۹０-９]{2}){1,2}$/.test(value);
  }

  function normalizeYouTubeVideoRenderer(v) {
    if (!v || typeof v !== "object") return null;
    const videoId = String(v.videoId || "").trim();
    if (!videoId || videoId.length !== 11) return null;

    // Filter out YouTube Shorts by checking navigationEndpoint, badges, and title
    const navEndpoint = v.navigationEndpoint;
    const webUrl = String(navEndpoint?.commandMetadata?.webCommandMetadata?.url || "");
    if (
      navEndpoint?.reelWatchEndpoint ||
      webUrl.startsWith("/shorts/") ||
      v.thumbnailOverlays?.some(
        (ov) => ov?.thumbnailOverlayTimeStatusRenderer?.style === "SHORTS",
      )
    ) {
      return null;
    }

    const title = readText(v.title || v.headline);
    if (!title || /(?:^|\s)#shorts(?:\s|$)/i.test(title)) return null;

    // Require a valid duration (filters out upcoming premieres, 24/7 streams, and non-video promos)
    const durationText =
      readText(v.lengthText) ||
      readText(
        v.thumbnailOverlays?.find((ov) => ov?.thumbnailOverlayTimeStatusRenderer)
          ?.thumbnailOverlayTimeStatusRenderer?.text,
      );
    if (!isVideoDuration(durationText)) return null;

    const ownerRun =
      v.ownerText?.runs?.[0] ||
      v.longBylineText?.runs?.[0] ||
      v.shortBylineText?.runs?.[0];
    const creatorName = ownerRun?.text || readText(v.ownerText || v.longBylineText || v.shortBylineText);
    const browseId =
      ownerRun?.navigationEndpoint?.browseEndpoint?.browseId ||
      v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint?.browseEndpoint?.browseId ||
      "";
    const canonicalBase =
      ownerRun?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || "";
    const creatorUrl = browseId
      ? `/channel/${browseId}`
      : canonicalBase.startsWith("/")
        ? canonicalBase
        : "";

    const viewText = readText(v.shortViewCountText || v.viewCountText);
    const publishedText = readText(v.publishedTimeText);
    const cover =
      getBestThumbnail(v.thumbnail?.thumbnails) ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // Continue-watching data. History entries carry a resume point on the
    // watch endpoint plus a watched-progress overlay on the thumbnail.
    const startSeconds = Number(navEndpoint?.watchEndpoint?.startTimeSeconds) || 0;
    let percentWatched = 0;
    walkObject(v.thumbnailOverlays || [], (node) => {
      if (node && typeof node === "object" && Number.isFinite(Number(node.percentDurationWatched))) {
        percentWatched = Math.min(100, Math.max(0, Number(node.percentDurationWatched)));
      }
    });
    const resume = startSeconds > 0 || percentWatched > 0 ? { startSeconds, percentWatched } : null;

    return {
      id: videoId,
      url:
        startSeconds > 0
          ? `/watch?v=${encodeURIComponent(videoId)}&t=${Math.floor(startSeconds)}s`
          : `/watch?v=${encodeURIComponent(videoId)}`,
      cover,
      title,
      author: [creatorName, publishedText].filter(Boolean).join(" · "),
      creatorName,
      creatorMeta: publishedText,
      creatorUrl,
      playText: viewText,
      durationText,
      resume,
    };
  }

  function extractChannelProfile(data, fallbackId) {
    const meta = data?.metadata?.channelMetadataRenderer || {};
    const c4 = data?.header?.c4TabbedHeaderRenderer || {};
    const pageHeader = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel || {};

    const name =
      meta.title ||
      c4.title ||
      pageHeader.title?.dynamicTextViewModel?.text?.content ||
      t("profileTitle");
    const avatar =
      getBestThumbnail(c4.avatar?.thumbnails) ||
      getBestThumbnail(meta.avatar?.thumbnails) ||
      getBestThumbnail(
        pageHeader.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources,
      );
    const banner =
      getBestThumbnail(c4.banner?.thumbnails) ||
      getBestThumbnail(pageHeader.banner?.imageBannerViewModel?.image?.sources);
    const description = meta.description || readText(c4.channelHandleText) || "";

    let handle = readText(c4.channelHandleText);
    let subscribersText = readText(c4.subscriberCountText);
    let videosCountText = readText(c4.videosCountText);

    const metadataRows = pageHeader.metadata?.contentMetadataViewModel?.metadataRows || [];
    for (const row of metadataRows) {
      for (const part of row.metadataParts || []) {
        const text = String(part?.text?.content || "").trim();
        if (!text) continue;
        if (text.startsWith("@") && !handle) handle = text;
        else if (!subscribersText) subscribersText = text;
        else if (!videosCountText) videosCountText = text;
      }
    }

    // Current channel pages use pageHeaderViewModel: the verified check (or the
    // official-artist note) is an attachment on the title, and subscription
    // state lives in entity mutations.
    const verified =
      Boolean(
        c4.badges?.some((b) =>
          String(b?.metadataBadgeRenderer?.style || "").includes("VERIFIED"),
        ),
      ) || /CHECK_CIRCLE|VERIFIED|AUDIO_BADGE/i.test(JSON.stringify(pageHeader.title || {}));

    let subscribed = Boolean(c4.subscribeButton?.subscribeButtonRenderer?.subscribed);
    if (!subscribed) {
      let stateKey = "";
      let rendererState = null;
      walkObject(data?.header, (node) => {
        if (node.subscribeButtonViewModel?.stateEntityStoreKey && !stateKey) {
          stateKey = node.subscribeButtonViewModel.stateEntityStoreKey;
        }
        if (typeof node.subscribeButtonRenderer?.subscribed === "boolean" && rendererState === null) {
          rendererState = node.subscribeButtonRenderer.subscribed;
        }
      });
      const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations || [];
      const states = mutations
        .map((mutation) => ({ key: mutation?.entityKey, state: mutation?.payload?.subscriptionStateEntity }))
        .filter((entry) => entry.state && typeof entry.state.subscribed === "boolean");
      const match =
        states.find((entry) => stateKey && (entry.key === stateKey || entry.state.key === stateKey)) ||
        (states.length === 1 ? states[0] : null);
      if (match) subscribed = match.state.subscribed;
      else if (rendererState !== null) subscribed = rendererState;
    }

    return {
      id: c4.channelId || meta.externalId || fallbackId,
      name,
      avatar,
      banner,
      description,
      handle,
      subscribersText,
      videosCountText,
      verified,
      subscribed,
    };
  }

  function walkObject(root, visitor) {
    if (!root || typeof root !== "object") return;
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== "object") continue;
      if (Array.isArray(current)) {
        for (let i = current.length - 1; i >= 0; i -= 1) {
          stack.push(current[i]);
        }
        continue;
      }
      const action = visitor(current);
      if (action === "skip") continue;
      const values = Object.values(current);
      for (let i = values.length - 1; i >= 0; i -= 1) {
        if (values[i] && typeof values[i] === "object") stack.push(values[i]);
      }
    }
  }

  function readText(node) {
    if (!node) return "";
    if (typeof node === "string") return node.trim();
    if (typeof node.simpleText === "string") return node.simpleText.trim();
    if (typeof node.content === "string") return node.content.trim();
    if (Array.isArray(node.runs)) {
      return node.runs.map((run) => run?.text || "").join("").trim();
    }
    return "";
  }

  function getBestThumbnail(thumbnails) {
    if (!Array.isArray(thumbnails) || thumbnails.length === 0) return "";
    const sorted = [...thumbnails]
      .filter((t) => t?.url)
      .sort((a, b) => Number(b.width || 0) - Number(a.width || 0));
    const chosen = sorted.find((t) => Number(t.width || 0) <= 720) || sorted[0];
    const url = String(chosen?.url || "");
    return url.startsWith("//") ? `https:${url}` : url;
  }

  // === module: cards & platform-utils ===
  function createVideoCard(item) {
    const card = createElement("article", "ym-recommend-card is-image-loading");
    card.dataset.coverError = t("coverLoadFailed");

    const cover = createElement("div", "ym-recommend-cover");
    const image = document.createElement("img");
    image.src = item.cover;
    image.alt = item.title || "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("load", () => card.classList.remove("is-image-loading"), { once: true });
    image.addEventListener(
      "error",
      () => {
        card.classList.remove("is-image-loading");
        card.classList.add("is-image-error");
      },
      { once: true },
    );
    cover.appendChild(image);

    // Watched-progress bar for partially watched (continue-watching) entries.
    if (item.resume?.percentWatched > 0 && item.resume.percentWatched < 100) {
      const progress = createElement("div", "ym-recommend-progress");
      progress.setAttribute("aria-hidden", "true");
      const progressBar = createElement("span", "ym-recommend-progress-bar");
      progressBar.style.width = `${Math.round(item.resume.percentWatched)}%`;
      progress.appendChild(progressBar);
      cover.appendChild(progress);
    }

    const overlay = createElement("div", "ym-recommend-overlay");
    const stats = createElement("span", "ym-recommend-stats");
    if (item.playText) {
      const stat = createElement("span", "ym-recommend-stat");
      stat.dataset.kind = "view";
      stat.textContent = item.playText;
      stats.appendChild(stat);
    }

    const duration = createElement("span", "ym-recommend-duration");
    duration.textContent = item.durationText || "";
    overlay.append(stats, duration);
    cover.appendChild(overlay);

    const body = createElement("div", "ym-recommend-body");
    const title = createElement("div", "ym-recommend-title");
    title.textContent = item.title;

    const meta = createElement("div", "ym-recommend-meta");
    const author = createElement("div", "ym-recommend-author");
    if (item.creatorUrl && (item.creatorName || item.author)) {
      const creatorLink = createElement("a", "ym-recommend-author-link");
      const creatorName = item.creatorName || item.author;
      creatorLink.href = item.creatorUrl;
      creatorLink.textContent = creatorName;
      creatorLink.setAttribute("aria-label", t("openCreatorProfile", { name: creatorName }));
      author.appendChild(creatorLink);
      if (item.creatorMeta) {
        const creatorMeta = createElement("span", "ym-recommend-author-meta");
        creatorMeta.textContent = `· ${item.creatorMeta}`;
        author.appendChild(creatorMeta);
      }
    } else if (item.author) {
      const authorText = createElement("span", "ym-recommend-author-text");
      authorText.textContent = item.author;
      author.appendChild(authorText);
    }
    meta.append(author);
    body.append(title, meta);

    const cardLink = createElement("a", "ym-recommend-card-link");
    cardLink.href = item.url;
    cardLink.setAttribute("aria-label", item.title || t("recommendedVideos"));
    card.append(cover, body, cardLink);
    return card;
  }

  function createVideoSkeletonCard() {
    const card = createElement("div", "ym-recommend-card ym-recommend-skeleton");
    card.setAttribute("aria-hidden", "true");
    const cover = createElement("div", "ym-recommend-cover ym-skeleton-block");
    const body = createElement("div", "ym-recommend-body");
    const titleLine = createElement("div", "ym-skeleton-line is-title");
    const titleLineShort = createElement("div", "ym-skeleton-line is-title-short");
    const authorLine = createElement("div", "ym-skeleton-line is-author");
    body.append(titleLine, titleLineShort, authorLine);
    card.append(cover, body);
    return card;
  }

  function waitForBody(signal) {
    throwIfAborted(signal);
    if (document.body) return Promise.resolve(document.body);
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (!document.body) return;
        observer.disconnect();
        signal?.removeEventListener("abort", onAbort);
        resolve(document.body);
      });
      const onAbort = () => {
        observer.disconnect();
        reject(createAbortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      observer.observe(document, { childList: true, subtree: true });
    });
  }

  function createSvgIcon(children, viewBox = "0 0 24 24") {
    // SVG nodes need their namespace, but no HTML parsing or TrustedHTML policy.
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("aria-hidden", "true");
    for (const [tagName, attributes] of children) {
      const child = document.createElementNS(namespace, tagName);
      for (const [name, value] of Object.entries(attributes)) child.setAttribute(name, value);
      svg.appendChild(child);
    }
    return svg;
  }

  function createTextElement(tagName, text) {
    const node = document.createElement(tagName);
    node.textContent = text;
    return node;
  }

  function createElement(tagName, className = "") {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    return element;
  }

  function formatCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count)) return "";
    try {
      if (!compactCountFormatterInitialized) {
        compactCountFormatterInitialized = true;
        compactCountFormatter = new Intl.NumberFormat(UI_LANGUAGE_TAG, {
          notation: "compact",
          maximumFractionDigits: 1,
        });
      }
      return compactCountFormatter?.format(count) || String(count);
    } catch {
      return String(count);
    }
  }

  // === module: styles ===
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* ===== Tokens: iOS grouped surfaces with YouTube crimson accent ===== */
      html.ym-native-home-active,
      html.ym-native-search-active,
      html.ym-native-profile-active,
      html.ym-native-watch-active,
      html.ym-native-takeover {
        --ym-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "PingFang TC", "Hiragino Sans", "Helvetica Neue", sans-serif;
        --ym-brand: #ff0033;
        --ym-accent: #e11d48;
        --ym-accent-text: #d91642;
        --ym-accent-soft: rgb(255 0 51 / 12%);
        --ym-label: #000;
        --ym-secondary: rgb(60 60 67 / 62%);
        --ym-tertiary: rgb(60 60 67 / 45%);
        --ym-page: #f2f2f7;
        --ym-surface: #fff;
        --ym-surface-2: #f2f2f7;
        --ym-fill: rgb(118 118 128 / 12%);
        --ym-fill-strong: rgb(118 118 128 / 20%);
        --ym-separator: rgb(60 60 67 / 22%);
        --ym-bar: rgb(249 249 249 / 82%);
        --ym-thumb: #fff;
        --ym-thumb-shadow: 0 3px 8px rgb(0 0 0 / 12%), 0 3px 1px rgb(0 0 0 / 4%);
        --ym-float-shadow: 0 6px 18px rgb(0 0 0 / 12%), 0 1px 3px rgb(0 0 0 / 8%);
        --ym-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='m3 4.5 3 3 3-3' fill='none' stroke='%233c3c43' stroke-opacity='.6' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        --ym-radius-card: 10px;
        --ym-radius-group: 12px;
        --ym-hairline: 0.5px;
        color-scheme: light;
      }

      @media (prefers-color-scheme: dark) {
        html.ym-native-home-active,
        html.ym-native-search-active,
        html.ym-native-profile-active,
        html.ym-native-watch-active,
        html.ym-native-takeover {
          --ym-accent: #e11d48;
          --ym-accent-text: #ff4d6d;
          --ym-accent-soft: rgb(255 0 51 / 20%);
          --ym-label: #fff;
          --ym-secondary: rgb(235 235 245 / 60%);
          --ym-tertiary: rgb(235 235 245 / 42%);
          --ym-page: #000;
          --ym-surface: #1c1c1e;
          --ym-surface-2: #2c2c2e;
          --ym-fill: rgb(118 118 128 / 24%);
          --ym-fill-strong: rgb(118 118 128 / 36%);
          --ym-separator: rgb(84 84 88 / 60%);
          --ym-bar: rgb(22 22 24 / 82%);
          --ym-thumb: #636366;
          --ym-thumb-shadow: 0 3px 8px rgb(0 0 0 / 24%);
          --ym-float-shadow: 0 6px 18px rgb(0 0 0 / 50%);
          --ym-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='m3 4.5 3 3 3-3' fill='none' stroke='%23ebebf5' stroke-opacity='.6' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          color-scheme: dark;
        }
      }

      html.ym-native-home-active *,
      html.ym-native-search-active *,
      html.ym-native-profile-active *,
      html.ym-native-watch-active * {
        -webkit-tap-highlight-color: transparent;
      }

      html.ym-native-home-active body > :not(#app, .ym-recommend-fab, .ym-background-audio-host, .ym-takeover-failure),
      html.ym-native-search-active body > :not(#app, .ym-background-audio-host, .ym-takeover-failure),
      html.ym-native-profile-active body > :not(#app, .ym-background-audio-host, .ym-takeover-failure),
      html.ym-native-watch-active body > :not(#app, .ym-background-audio-host, .ym-takeover-failure) {
        display: none !important;
      }

      html.ym-native-home-active #app > :not(.ym-home-shell),
      html.ym-native-search-active #app > :not(.ym-search-shell),
      html.ym-native-profile-active #app > :not(.ym-profile-shell),
      html.ym-native-watch-active #app > :not(.ym-watch-shell) {
        display: none !important;
      }

      html.ym-native-home-active,
      html.ym-native-home-active body,
      html.ym-native-search-active,
      html.ym-native-search-active body,
      html.ym-native-profile-active,
      html.ym-native-profile-active body,
      html.ym-native-watch-active,
      html.ym-native-watch-active body,
      html.ym-native-takeover,
      html.ym-native-takeover body {
        min-height: 100vh;
        margin: 0 !important;
        color: var(--ym-label);
        background: var(--ym-page) !important;
        font-family: var(--ym-font);
        -webkit-font-smoothing: antialiased;
        -webkit-text-size-adjust: 100%;
      }

      .ym-button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
        padding: 0 16px;
        border: 0;
        border-radius: 999px;
        color: #fff;
        background: var(--ym-accent);
        font: inherit;
        font-size: 15px;
        font-weight: 600;
        text-decoration: none;
        touch-action: manipulation;
      }

      .ym-button:active { opacity: 0.7; }

      .ym-takeover-failure {
        display: grid;
        justify-items: center;
        gap: 10px;
        padding: calc(48px + env(safe-area-inset-top)) 24px 32px;
        color: var(--ym-label, #000);
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
        text-align: center;
      }
      .ym-takeover-failure-title { margin: 0; font-size: 20px; font-weight: 700; }
      .ym-takeover-failure-hint { margin: 0; color: var(--ym-secondary, #666); font-size: 15px; }

      /* ===== Navigation & Segmented Controls ===== */
      .ym-home-header,
      .ym-profile-nav {
        position: sticky;
        top: 0;
        z-index: 40;
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) 44px;
        align-items: center;
        gap: 6px;
        min-height: 44px;
        padding: env(safe-area-inset-top) max(6px, env(safe-area-inset-right)) 0 max(6px, env(safe-area-inset-left));
        border-bottom: var(--ym-hairline) solid var(--ym-separator);
        color: var(--ym-label);
        background: var(--ym-bar);
        -webkit-backdrop-filter: saturate(180%) blur(20px);
        backdrop-filter: saturate(180%) blur(20px);
      }

      .ym-home-brand {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        color: var(--ym-brand);
      }

      .ym-home-brand svg { width: 26px; height: 26px; }

      .ym-nav-icon-button,
      .ym-search-back {
        appearance: none;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        padding: 0;
        border: 0;
        color: var(--ym-accent-text);
        background: transparent;
        text-decoration: none;
        touch-action: manipulation;
      }

      .ym-nav-icon-button svg,
      .ym-search-back svg {
        width: 22px;
        height: 22px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .ym-segmented-control {
        display: grid;
        grid-auto-columns: minmax(0, 1fr);
        grid-auto-flow: column;
        gap: 2px;
        padding: 2px;
        border-radius: 9px;
        background: var(--ym-fill);
      }

      .ym-home-header {
        /* The tab bar moved to its own row; keep brand + search balanced. */
        grid-template-columns: 44px minmax(0, 1fr);
      }

      .ym-home-header .ym-nav-icon-button {
        justify-self: end;
      }

      .ym-home-tabs-bar {
        /* Sticky tab row under the header, sized for thumbs on mobile. */
        position: sticky;
        top: calc(44px + env(safe-area-inset-top));
        z-index: 39;
        padding: 8px max(8px, env(safe-area-inset-right)) 8px max(8px, env(safe-area-inset-left));
        background: var(--ym-bar);
        -webkit-backdrop-filter: saturate(180%) blur(20px);
        backdrop-filter: saturate(180%) blur(20px);
      }

      .ym-home-tabs {
        max-width: 1320px;
        margin: 0 auto;
      }

      .ym-home-tabs .ym-segmented-option {
        height: 38px;
        padding: 0 6px;
        font-size: 15px;
      }

      .ym-segmented-option {
        appearance: none;
        min-width: 0;
        height: 28px;
        padding: 0 10px;
        border: 0;
        border-radius: 7px;
        color: var(--ym-label);
        background: transparent;
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        touch-action: manipulation;
      }

      .ym-segmented-option.is-active {
        background: var(--ym-thumb);
        box-shadow: var(--ym-thumb-shadow);
        font-weight: 600;
      }

      /* ===== Video Grid ===== */
      .ym-recommend-view {
        min-height: 100vh;
        padding: 8px max(8px, env(safe-area-inset-right)) calc(88px + env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
        box-sizing: border-box;
      }

      .ym-recommend-grid,
      .ym-recommend-status,
      .ym-recommend-sentinel {
        width: 100%;
        max-width: 1320px;
        margin-inline: auto;
        box-sizing: border-box;
      }

      .ym-recommend-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .ym-recommend-card {
        position: relative;
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow: hidden;
        border-radius: var(--ym-radius-card);
        color: var(--ym-label);
        background: var(--ym-surface);
        text-decoration: none;
        transform: translateZ(0);
      }

      .ym-recommend-card-link {
        position: absolute;
        z-index: 1;
        inset: 0;
        border-radius: inherit;
      }

      .ym-recommend-card:active { opacity: 0.72; }

      .ym-recommend-cover {
        position: relative;
        overflow: hidden;
        width: 100%;
        aspect-ratio: 16 / 9;
        background: var(--ym-fill);
      }

      .ym-recommend-cover img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: opacity 220ms ease;
      }

      .ym-recommend-progress {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 3px;
        background: rgba(255, 255, 255, 0.35);
        z-index: 1;
      }

      .ym-recommend-progress-bar {
        display: block;
        height: 100%;
        background: var(--ym-brand, #ff0000);
      }

      .ym-recommend-card.is-image-loading .ym-recommend-cover img { opacity: 0; }
      .ym-recommend-card.is-image-error .ym-recommend-cover img { visibility: hidden; }

      .ym-recommend-card.is-image-loading .ym-recommend-cover::after,
      .ym-skeleton-block::after,
      .ym-skeleton-line::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(105deg, transparent 20%, rgb(255 255 255 / 28%) 44%, transparent 67%);
        transform: translateX(-120%);
        animation: ym-shimmer 1.4s ease-in-out infinite;
      }

      .ym-recommend-overlay {
        position: absolute;
        inset: auto 0 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 18px 7px 5px;
        color: #fff;
        font-size: 11px;
        line-height: 14px;
        font-variant-numeric: tabular-nums;
        background: linear-gradient(transparent, rgb(0 0 0 / 65%));
      }

      .ym-recommend-stats,
      .ym-recommend-duration {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .ym-recommend-body {
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        justify-content: space-between;
        gap: 6px;
        padding: 7px 8px 9px;
      }

      .ym-recommend-title {
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        min-height: 38px;
        color: var(--ym-label);
        font-size: 14px;
        line-height: 19px;
        overflow-wrap: anywhere;
      }

      .ym-recommend-author {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
        overflow: hidden;
        color: var(--ym-secondary);
        font-size: 12px;
        line-height: 16px;
        white-space: nowrap;
      }

      .ym-recommend-author-link {
        position: relative;
        z-index: 2;
        overflow: hidden;
        text-overflow: ellipsis;
        color: inherit;
        text-decoration: none;
      }

      .ym-recommend-author-link:active { color: var(--ym-accent-text); }
      .ym-recommend-author-meta { color: var(--ym-tertiary); overflow: hidden; text-overflow: ellipsis; }

      .ym-skeleton-block,
      .ym-skeleton-line {
        position: relative;
        overflow: hidden;
        background: var(--ym-fill);
      }

      .ym-skeleton-line { height: 12px; border-radius: 4px; }
      .ym-skeleton-line + .ym-skeleton-line { margin-top: 7px; }
      .ym-skeleton-line.is-title { width: 92%; }
      .ym-skeleton-line.is-title-short { width: 64%; }
      .ym-skeleton-line.is-author { width: 42%; height: 10px; margin-top: 12px; }

      .ym-recommend-status {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 10px;
        min-height: 64px;
        padding: 12px 16px;
        color: var(--ym-secondary);
        font-size: 13px;
        text-align: center;
      }

      .ym-recommend-status[data-state="loading"]::before {
        content: "";
        width: 16px;
        height: 16px;
        border: 2px solid var(--ym-fill-strong);
        border-top-color: var(--ym-secondary);
        border-radius: 50%;
        animation: ym-spin 760ms linear infinite;
      }

      .ym-recommend-status[data-state="error"] { flex-direction: column; min-height: 160px; }

      .ym-recommend-fab {
        appearance: none;
        position: fixed;
        right: max(16px, env(safe-area-inset-right));
        bottom: calc(20px + env(safe-area-inset-bottom));
        z-index: 1000;
        display: grid;
        place-items: center;
        width: 50px;
        height: 50px;
        padding: 0;
        border: var(--ym-hairline) solid var(--ym-separator);
        border-radius: 50%;
        color: var(--ym-accent-text);
        background: var(--ym-bar);
        box-shadow: var(--ym-float-shadow);
        -webkit-backdrop-filter: saturate(180%) blur(20px);
        backdrop-filter: saturate(180%) blur(20px);
      }

      .ym-recommend-fab svg {
        width: 24px;
        height: 24px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .ym-recommend-fab svg path:nth-of-type(1) { fill: currentColor; stroke: none; }
      .ym-recommend-fab.is-refreshing svg { animation: ym-spin 900ms ease-in-out infinite; }

      /* ===== Search ===== */
      .ym-search-header {
        position: sticky;
        top: 0;
        z-index: 30;
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr);
        align-items: center;
        gap: 8px 4px;
        padding: calc(6px + env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 10px max(4px, env(safe-area-inset-left));
        border-bottom: var(--ym-hairline) solid var(--ym-separator);
        background: var(--ym-bar);
        -webkit-backdrop-filter: saturate(180%) blur(20px);
        backdrop-filter: saturate(180%) blur(20px);
      }

      .ym-search-form {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        align-items: center;
        height: 36px;
      }

      .ym-search-icon,
      .ym-search-input,
      .ym-search-clear { background: var(--ym-fill) !important; }
      .ym-search-icon {
        display: grid;
        place-items: center;
        height: 36px;
        width: 30px;
        padding-left: 4px;
        border-radius: 10px 0 0 10px;
        color: var(--ym-secondary);
      }

      .ym-search-icon svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2; }

      .ym-search-input {
        appearance: none;
        width: 100%;
        height: 36px;
        padding: 0;
        border: 0;
        outline: 0;
        color: var(--ym-label);
        font: inherit;
        font-size: 17px;
      }

      .ym-search-input::-webkit-search-cancel-button { display: none; }

      .ym-search-clear {
        appearance: none;
        display: grid;
        place-items: center;
        width: 30px;
        height: 36px;
        padding: 0;
        border: 0;
        border-radius: 0 10px 10px 0;
        color: var(--ym-tertiary);
      }

      .ym-search-clear[hidden] { display: grid !important; pointer-events: none; }
      .ym-search-clear[hidden] svg { visibility: hidden; }
      .ym-search-clear svg { width: 17px; height: 17px; fill: currentColor; stroke: var(--ym-surface); stroke-width: 1.6; }

      .ym-search-submit {
        appearance: none;
        height: 36px;
        padding: 0 0 0 12px;
        border: 0;
        color: var(--ym-accent-text);
        background: transparent;
        font: inherit;
        font-size: 17px;
        font-weight: 500;
      }

      .ym-search-submit:disabled { color: var(--ym-tertiary); }
      .ym-search-sort { grid-column: 1 / -1; margin-left: 8px; }
      .ym-search-shell.is-empty .ym-search-summary { display: none; }

      .ym-search-summary {
        max-width: 1320px;
        margin: 0 auto;
        padding: 16px max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left));
      }

      .ym-search-summary-title { font-size: 20px; font-weight: 700; }
      .ym-search-grid { width: auto; margin-inline: max(8px, env(safe-area-inset-left)); }

      /* ===== Creator Profile ===== */
      .ym-profile-nav-heading { min-width: 0; text-align: center; }
      .ym-profile-nav-title {
        overflow: hidden;
        font-size: 17px;
        font-weight: 600;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .ym-profile-hero { position: relative; padding-bottom: 16px; background: var(--ym-surface); }
      .ym-profile-cover {
        height: clamp(88px, 26vw, 180px);
        overflow: hidden;
        background: linear-gradient(135deg, color-mix(in srgb, var(--ym-brand) 30%, var(--ym-surface)), color-mix(in srgb, #6366f1 25%, var(--ym-surface)));
      }
      .ym-profile-cover img { width: 100%; height: 100%; object-fit: cover; }
      .ym-profile-hero-content {
        position: relative;
        max-width: 1320px;
        margin: 0 auto;
        padding: 0 max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left));
      }
      .ym-profile-avatar-frame {
        width: 76px;
        height: 76px;
        margin-top: -38px;
        padding: 3px;
        border-radius: 50%;
        background: var(--ym-surface);
        box-sizing: border-box;
      }
      .ym-profile-avatar-frame img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: var(--ym-fill); }
      .ym-profile-identity { margin-top: 10px; }
      .ym-profile-name-row { display: flex; align-items: baseline; gap: 8px; }
      .ym-profile-name { margin: 0; font-size: 22px; font-weight: 700; }
      .ym-profile-verified { color: var(--ym-accent-text); font-size: 12px; font-weight: 600; }
      .ym-profile-signature { margin: 6px 0 0; color: var(--ym-secondary); font-size: 14px; line-height: 20px; }
      .ym-profile-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; color: var(--ym-secondary); font-size: 13px; }
      .ym-profile-actions { position: absolute; top: 12px; right: max(16px, env(safe-area-inset-right)); }
      .ym-profile-follow {
        appearance: none;
        min-width: 92px;
        height: 32px;
        padding: 0 14px;
        border: 0;
        border-radius: 999px;
        color: #fff;
        background: var(--ym-accent);
        font: inherit;
        font-size: 14px;
        font-weight: 600;
      }
      .ym-profile-follow.is-following { color: var(--ym-secondary); background: var(--ym-fill); }
      .ym-profile-section-header { max-width: 1320px; margin: 0 auto; padding: 18px 16px 10px; }
      .ym-profile-section-title { margin: 0; font-size: 20px; font-weight: 700; }
      .ym-profile-grid { width: auto; margin-inline: max(8px, env(safe-area-inset-left)); }

      /* Explicit component display rules override the browser's hidden style.
         Keep inactive audio overlays, spinners, and errors out of the video view. */
      .ym-native-player [hidden] { display: none !important; }

      /* ===== Watch Page, Player & Playlist Rail ===== */
      .ym-watch-content { width: 100%; max-width: 960px; margin: 0 auto; }
      .ym-native-video-box {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        min-height: 180px;
        overflow: hidden;
        background: #000;
      }
      .ym-native-video { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
      .ym-native-player-meta {
        display: grid;
        gap: 12px;
        padding: 12px max(16px, env(safe-area-inset-right)) 14px max(16px, env(safe-area-inset-left));
        background: var(--ym-surface);
      }
      .ym-native-player-kicker { display: none; color: var(--ym-accent-text); font-size: 13px; font-weight: 600; }
      .ym-native-player.is-audio-mode .ym-native-player-kicker { display: block; }
      .ym-native-player-title { font-size: 17px; font-weight: 600; line-height: 22px; }
      .ym-native-quality { color: var(--ym-secondary); font-size: 12px; }
      .ym-native-player-creator {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
        color: var(--ym-label);
        font-size: 15px;
        font-weight: 500;
        text-decoration: none;
      }
      .ym-native-player-creator-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
      /* Wrap rather than scroll: the row can be wider than a phone screen, and a
         hidden scrollbar hides the audio/fullscreen buttons. */
      .ym-native-player-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      .ym-native-selector,
      .ym-native-quality-selector,
      .ym-audio-mode-button,
      .ym-fullscreen-button {
        appearance: none;
        flex: 0 0 auto;
        height: 32px;
        border: 0;
        border-radius: 999px;
        color: var(--ym-label);
        background-color: var(--ym-fill);
        font: inherit;
        font-size: 14px;
        font-weight: 500;
      }
      .ym-native-selector,
      .ym-native-quality-selector {
        max-width: 46vw;
        padding: 0 28px 0 13px;
        background-image: var(--ym-chevron);
        background-repeat: no-repeat;
        background-position: right 10px center;
        background-size: 12px;
      }
      .ym-subtitle-status { color: var(--ym-secondary); font-size: 13px; }
      .ym-audio-mode-button,
      .ym-fullscreen-button { display: inline-flex; align-items: center; gap: 5px; padding: 0 13px 0 11px; }
      .ym-audio-mode-button svg,
      .ym-fullscreen-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; }
      .ym-audio-mode-button.is-active { color: var(--ym-accent-text); background-color: var(--ym-accent-soft); font-weight: 600; }

      .ym-playlist-section {
        margin: 8px 0 0;
        padding: 12px 0;
        background: var(--ym-surface);
      }
      .ym-playlist-header { display: flex; align-items: baseline; justify-content: space-between; padding: 0 16px 10px; }
      .ym-playlist-title { margin: 0; font-size: 16px; font-weight: 600; }
      .ym-playlist-count { color: var(--ym-secondary); font-size: 13px; }
      .ym-playlist-title-link { color: inherit; text-decoration: none; }
      .ym-playlist-title-link::after { content: " ›"; color: var(--ym-secondary); }

      /* ===== Playlist Page ===== */
      .ym-playlist-hero {
        display: flex;
        flex-wrap: wrap;
        gap: 14px 16px;
        max-width: 1320px;
        margin: 0 auto;
        padding: 16px max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left));
        box-sizing: border-box;
      }
      .ym-playlist-cover {
        flex: 0 0 auto;
        width: min(100%, 360px);
        aspect-ratio: 16 / 9;
        overflow: hidden;
        border-radius: var(--ym-radius-card);
        background: var(--ym-fill);
      }
      .ym-playlist-cover img { width: 100%; height: 100%; object-fit: cover; }
      .ym-playlist-copy { display: flex; flex: 1 1 240px; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
      .ym-playlist-name { margin: 0; font-size: 22px; font-weight: 700; line-height: 28px; overflow-wrap: anywhere; }
      .ym-playlist-hero.is-loading .ym-playlist-name { color: var(--ym-secondary); }
      .ym-playlist-owner { color: var(--ym-label); font-size: 15px; font-weight: 500; text-decoration: none; }
      .ym-playlist-details { margin: 0; color: var(--ym-secondary); font-size: 13px; }
      .ym-playlist-play {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: 6px;
        box-sizing: border-box;
        text-decoration: none;
      }
      .ym-playlist-shell [hidden] { display: none !important; }
      .ym-playlist-rail { display: flex; gap: 8px; overflow-x: auto; padding: 0 16px; scrollbar-width: none; }
      .ym-playlist-item-button {
        appearance: none;
        flex: 0 0 auto;
        max-width: 220px;
        height: 36px;
        padding: 0 12px;
        border: 0;
        border-radius: 8px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: var(--ym-label);
        background: var(--ym-fill);
        font: inherit;
        font-size: 13px;
      }
      .ym-playlist-item-button.is-current { color: #fff; background: var(--ym-accent); font-weight: 600; }

      /* Audio-Only View */
      .ym-audio-only-view {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: grid;
        align-content: center;
        overflow: hidden;
        padding: 16px 20px;
        background: #111;
      }
      .ym-audio-only-artwork {
        position: absolute;
        inset: -20%;
        width: 140%;
        height: 140%;
        object-fit: cover;
        filter: blur(36px) saturate(160%);
        opacity: 0.7;
      }
      .ym-audio-only-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgb(0 0 0 / 18%), rgb(0 0 0 / 55%)); }
      .ym-audio-only-panel { position: relative; z-index: 1; display: grid; justify-items: center; gap: 14px; color: #fff; }
      .ym-audio-only-copy { display: grid; justify-items: center; gap: 2px; text-align: center; }
      .ym-audio-only-title { font-size: 17px; font-weight: 600; }
      .ym-audio-only-subtitle { color: rgb(255 255 255 / 68%); font-size: 13px; }
      .ym-audio-transport {
        display: grid;
        grid-template-columns: 1fr auto auto auto 1fr;
        grid-template-areas:
          "timeline timeline timeline timeline timeline"
          ". previous play next time";
        align-items: center;
        gap: 6px 22px;
        width: 100%;
      }
      .ym-audio-timeline { grid-area: timeline; width: 100%; height: 4px; accent-color: #fff; }
      .ym-audio-skip-button.is-previous { grid-area: previous; }
      .ym-audio-play-button {
        grid-area: play;
        appearance: none;
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        border: 0;
        border-radius: 50%;
        color: #111;
        background: #fff;
      }
      .ym-audio-play-button svg { width: 22px; height: 22px; fill: currentColor; }
      .ym-audio-play-button .ym-audio-pause-glyph { display: none; }
      .ym-audio-play-button.is-playing .ym-audio-play-glyph { display: none; }
      .ym-audio-play-button.is-playing .ym-audio-pause-glyph { display: block; }
      .ym-audio-skip-button {
        appearance: none;
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 50%;
        color: #fff;
        background: transparent;
      }
      .ym-audio-skip-button.is-next { grid-area: next; }
      .ym-audio-skip-button svg { width: 22px; height: 22px; fill: currentColor; stroke: currentColor; stroke-width: 2; }
      .ym-audio-time { grid-area: time; justify-self: end; color: rgb(255 255 255 / 68%); font-size: 11px; }

      .ym-background-audio-host {
        position: fixed;
        left: 0;
        bottom: 0;
        z-index: -2147483647;
        width: 1px;
        height: 1px;
        overflow: hidden;
        opacity: 0.001;
        pointer-events: none;
      }

      .ym-player-loading {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 10px;
        color: rgb(255 255 255 / 80%);
        background: rgb(0 0 0 / 45%);
        font-size: 13px;
        pointer-events: none;
      }
      .ym-player-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid rgb(255 255 255 / 24%);
        border-top-color: #fff;
        border-radius: 50%;
        animation: ym-spin 760ms linear infinite;
      }
      .ym-player-error {
        min-height: 220px;
        display: grid;
        place-items: center;
        align-content: center;
        gap: 14px;
        padding: 32px 24px;
        color: #fff;
        background: #111;
        text-align: center;
      }

      /* ===== Comments ===== */
      .ym-video-comments {
        margin-top: 8px;
        padding: 14px max(16px, env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
        background: var(--ym-surface);
      }
      .ym-comments-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
      .ym-comments-title-row { display: flex; align-items: baseline; gap: 8px; }
      .ym-comments-title { margin: 0; font-size: 17px; font-weight: 600; }
      .ym-comments-count { color: var(--ym-secondary); font-size: 14px; }
      .ym-comment-card { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; padding: 12px 0; }
      .ym-comment-card + .ym-comment-card { border-top: var(--ym-hairline) solid var(--ym-separator); }
      .ym-comment-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; background: var(--ym-fill); }
      .ym-comment-content { display: grid; gap: 6px; min-width: 0; }
      .ym-comment-author-row { display: flex; align-items: center; gap: 5px; }
      .ym-comment-author { color: var(--ym-secondary); font-size: 13px; font-weight: 600; text-decoration: none; }
      .ym-comment-badge { padding: 0 4px; border-radius: 3px; color: var(--ym-accent-text); background: var(--ym-accent-soft); font-size: 10px; font-weight: 600; }
      .ym-comment-badge.is-uploader { color: #fff; background: var(--ym-accent); }
      .ym-comment-time { color: var(--ym-tertiary); font-size: 12px; }
      .ym-comment-message { color: var(--ym-label); font-size: 15px; line-height: 22px; overflow-wrap: anywhere; white-space: pre-wrap; }
      .ym-comment-actions { display: flex; align-items: center; gap: 18px; }
      .ym-comment-action { display: inline-flex; align-items: center; gap: 4px; color: var(--ym-secondary); font-size: 12px; }
      .ym-comment-action svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; }
      .ym-comments-status { min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--ym-secondary); font-size: 13px; }

      @media (min-width: 600px) {
        .ym-recommend-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      }
      @media (min-width: 900px) {
        .ym-recommend-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }

      @keyframes ym-spin { to { transform: rotate(360deg); } }
      @keyframes ym-shimmer { to { transform: translateX(120%); } }
    `;

    const appendStyle = () => {
      if (style.isConnected || document.getElementById(STYLE_ID)) return true;
      const mount = document.head || document.documentElement;
      if (!mount) return false;
      mount.appendChild(style);
      return true;
    };

    if (appendStyle()) return;
    const observer = new MutationObserver(() => {
      if (!appendStyle()) return;
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }
})();
