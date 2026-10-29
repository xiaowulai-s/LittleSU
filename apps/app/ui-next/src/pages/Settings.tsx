import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FormEvent, ReactNode } from 'react';
import { SOURCES, customDefs } from '../lib/sources';
import type { SourceDef } from '../lib/sources';
import { clearAppCaches } from '../lib/cache';
import { KEYS } from '../lib/storage';
import { APP_VERSION } from '../lib/version';
import { openExternal } from '../lib/window';
import { Icon } from '../icons';
import type { IconName } from '../icons';
import { useApp } from '../store';
import { Button, Chip, SourceBadge, StatusDot, Switch } from '../ui';

type Section = 'appearance' | 'playback' | 'sources' | 'data' | 'about';

const sections: { key: Section; label: string; icon: IconName }[] = [
  { key: 'appearance', label: '外观', icon: 'sun' },
  { key: 'playback', label: '播放', icon: 'play' },
  { key: 'sources', label: '数据源', icon: 'wifi' },
  { key: 'data', label: '数据', icon: 'download' },
  { key: 'about', label: '关于', icon: 'sparkles' },
];

const recommended = SOURCES.filter((source) => source.status === 'ok');
const backup = SOURCES.filter((source) => source.status === 'backup');
const experimental = SOURCES.filter((source) => source.status === 'experimental');
const ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

function SettingCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="setting-card">
      <div className="setting-card-head">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

function statusLabelOf(source: SourceDef) {
  if (source.custom) return '自定义';
  return source.status === 'ok' ? '可用' : source.status === 'backup' ? '备用' : 'HTML 实验';
}

function SourceRow({ source }: { source: SourceDef }) {
  const { sourceState, toggleSource, health, checkingSources } = useApp();
  const enabled = source.custom ? true : !!sourceState[source.key];
  const probe = health[source.key];
  const dotStatus = probe?.status === 'fail' ? 'experimental' as const : probe?.status === 'ok' ? 'ok' as const : source.status;
  const latencyText = checkingSources
    ? '测活中…'
    : probe
      ? probe.status === 'ok' ? `${probe.latency}ms` : '测活失败'
      : source.latency > 0 ? `${source.latency}ms` : '未测活';
  return (
    <div className={`source-row ${enabled ? 'is-enabled' : ''}`}>
      <StatusDot status={dotStatus} />
      <div className="source-row-main">
        <div className="source-row-title">
          <strong>{source.name}</strong>
          <span className={`source-status source-status-${dotStatus}`}>{statusLabelOf(source)}</span>
          {probe?.status === 'fail' ? <span className="source-note">最近测活失败</span> : source.note ? <span className="source-note">{source.note}</span> : null}
        </div>
        <div className="source-row-meta">
          <span>{source.host}</span>
          <span>·</span>
          <span>{latencyText}</span>
        </div>
      </div>
      <Switch
        checked={enabled}
        disabled={source.custom}
        onChange={() => { if (!source.custom) toggleSource(source.key); }}
        label={source.name}
      />
    </div>
  );
}

async function sha256(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default function Settings() {
  const {
    theme,
    setTheme,
    effectiveTheme,
    sourceState,
    setAllSources,
    setRecommendedSources,
    settings,
    updateSettings,
    customApis,
    setCustomApis,
    clearHistory,
    history,
    updateInfo,
    updateProgress,
    updateInstalling,
    installUpdate,
    checkUpdate,
    checkSources,
    checkingSources,
    toast,
  } = useApp();
  const [params] = useSearchParams();
  const requested = params.get('section') as Section | null;
  const [section, setSection] = useState<Section>(
    requested && ['appearance', 'playback', 'sources', 'data', 'about'].includes(requested) ? requested : 'appearance',
  );
  const [showAll, setShowAll] = useState(false);
  const [editingCustom, setEditingCustom] = useState<number | 'new' | null>(null);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    if (requested && ['appearance', 'playback', 'sources', 'data', 'about'].includes(requested)) {
      setSection(requested);
    }
  }, [requested]);
  const fileRef = useRef<HTMLInputElement>(null);

  const customs = customDefs(customApis);
  const total = SOURCES.length + customs.length;
  const enabledCount = SOURCES.filter((source) => sourceState[source.key]).length + customs.length;

  const exportConfig = async () => {
    try {
      const data: Record<string, string> = {};
      Object.values(KEYS).forEach((key) => {
        const value = localStorage.getItem(key);
        if (value !== null) data[key] = value;
      });
      const payload = {
        name: 'LittleSU TV-Settings',
        time: Date.now().toString(),
        cfgVer: '1.0.0',
        data,
        hash: await sha256(JSON.stringify(data)),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `LittleSU TV-Settings_${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast('已导出配置', 'success');
    } catch {
      toast('导出失败', 'warning');
    }
  };

  const importConfig = async (file: File) => {
    try {
      const text = await file.text();
      const config = JSON.parse(text) as { name?: string; data?: Record<string, string>; hash?: string };
      if (config?.name !== 'LittleSU TV-Settings' || !config.data) throw new Error('配置文件格式不正确');
      if (config.hash) {
        const hash = await sha256(JSON.stringify(config.data));
        if (hash !== config.hash) throw new Error('配置文件哈希不匹配');
      }
      Object.entries(config.data).forEach(([key, value]) => {
        if (typeof value === 'string') localStorage.setItem(key, value);
      });
      toast('导入成功，正在刷新…', 'success');
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      toast(`导入失败：${error instanceof Error ? error.message : '未知错误'}`, 'warning');
    }
  };

  const startAddCustom = () => {
    setEditingCustom('new');
    setCustomName('');
    setCustomUrl('');
  };

  const startEditCustom = (index: number) => {
    setEditingCustom(index);
    setCustomName(customApis[index]?.name ?? '');
    setCustomUrl(customApis[index]?.url ?? '');
  };

  const cancelCustom = () => {
    setEditingCustom(null);
    setCustomName('');
    setCustomUrl('');
  };

  const submitCustom = (event: FormEvent) => {
    event.preventDefault();
    const url = customUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) {
      toast('接口地址需以 http:// 或 https:// 开头', 'warning');
      return;
    }
    let name = customName.trim();
    if (!name) {
      try {
        name = new URL(url).hostname;
      } catch {
        name = url;
      }
    }
    const duplicated = customApis.some((api, index) => api.url.replace(/\/+$/, '') === url && index !== editingCustom);
    if (duplicated) {
      toast('该接口已存在', 'warning');
      return;
    }
    const next = [...customApis];
    if (editingCustom === 'new') next.push({ name, url });
    else if (typeof editingCustom === 'number') next[editingCustom] = { ...next[editingCustom], name, url };
    setCustomApis(next);
    toast(editingCustom === 'new' ? `已添加 ${name}` : `已更新 ${name}`, 'success');
    cancelCustom();
  };

  const removeCustom = (index: number) => {
    const api = customApis[index];
    if (!api) return;
    setCustomApis(customApis.filter((_, itemIndex) => itemIndex !== index));
    if (editingCustom === index) cancelCustom();
    toast(`已删除 ${api.name}`, 'success');
  };

  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <div className="page-kicker">偏好设置</div>
          <h1>设置</h1>
          <p>外观、播放、数据源与本机数据。</p>
        </div>
        <span className="settings-version">v{APP_VERSION}</span>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map((item) => (
            <button
              type="button"
              key={item.key}
              className={section === item.key ? 'is-active' : ''}
              onClick={() => setSection(item.key)}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === 'appearance' && (
            <>
              <SettingCard title="主题" description="深色适合观影，浅色适合白天使用；选择会保存在本机。">
                <div className="theme-cards">
                  {[
                    { key: 'dark' as const, label: '深色', hint: '影院沉浸', icon: 'moon' as IconName },
                    { key: 'light' as const, label: '浅色', hint: '清爽明亮', icon: 'sun' as IconName },
                    { key: 'system' as const, label: '跟随系统', hint: '自动切换', icon: 'monitor' as IconName },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={`theme-card theme-card-${item.key} ${theme === item.key ? 'is-active' : ''}`}
                      onClick={() => setTheme(item.key)}
                    >
                      <span className="theme-preview"><i /><i /><i /></span>
                      <span className="theme-card-label"><Icon name={item.icon} size={16} />{item.label}</span>
                      <small>{item.hint}</small>
                      {theme === item.key && <span className="theme-check"><Icon name="check" size={13} /></span>}
                    </button>
                  ))}
                </div>
                <p className="setting-hint">当前生效：{effectiveTheme === 'dark' ? '深色' : '浅色'}</p>
              </SettingCard>
              <SettingCard title="界面密度" description="影响首页轨道和结果网格的卡片尺寸。">
                <div className="density-row">
                  {[
                    { key: 'comfortable' as const, label: '舒适' },
                    { key: 'compact' as const, label: '紧凑' },
                    { key: 'wide' as const, label: '大屏' },
                  ].map((item) => (
                    <Chip
                      key={item.key}
                      active={settings.density === item.key}
                      onClick={() => updateSettings({ density: item.key })}
                    >
                      {item.label}
                    </Chip>
                  ))}
                </div>
              </SettingCard>
            </>
          )}

          {section === 'playback' && (
            <SettingCard title="播放偏好" description="这些设置会同时应用到 Windows 和 Android。">
              <SettingRow label="自动连播" description="一集结束后自动播放下一集">
                <Switch checked={settings.autoNext} onChange={(value) => updateSettings({ autoNext: value })} />
              </SettingRow>
              <SettingRow label="记忆播放进度" description="下次打开时从上次位置继续">
                <Switch checked={settings.remember} onChange={(value) => updateSettings({ remember: value })} />
              </SettingRow>
              <SettingRow label="广告片段过滤" description="尝试移除 m3u8 中的广告分段">
                <Switch checked={settings.adFilter} onChange={(value) => updateSettings({ adFilter: value })} />
              </SettingRow>
              <SettingRow label="播放失败自动换源" description="当前源播放失败时依次尝试其他源">
                <Switch checked={settings.autoSwitchSource} onChange={(value) => updateSettings({ autoSwitchSource: value })} />
              </SettingRow>
              <SettingRow label="播放时保持屏幕常亮" description="浏览器支持 Wake Lock 时生效">
                <Switch checked={settings.keepAwake} onChange={(value) => updateSettings({ keepAwake: value })} />
              </SettingRow>
              <SettingRow label="默认音量" description={`当前 ${Math.round(settings.volume * 100)}%`}>
                <input
                  className="setting-volume"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(settings.volume * 100)}
                  onChange={(event) => updateSettings({ volume: Number(event.target.value) / 100 })}
                  aria-label="默认音量"
                />
              </SettingRow>
              <SettingRow label="默认清晰度" description="源支持时会优先选择">
                <div className="inline-select">
                  {['自动', '1080P', '4K'].map((item) => (
                    <Chip key={item} active={settings.quality === item} onClick={() => updateSettings({ quality: item })}>{item}</Chip>
                  ))}
                </div>
              </SettingRow>
            </SettingCard>
          )}

          {section === 'sources' && (
            <>
              <div className="source-summary-card">
                <div>
                  <span className="source-summary-kicker">数据源</span>
                  <h3>{enabledCount} / {total} 已启用</h3>
                  <p>推荐源默认开启，其余按需展开；测活失败的已启用源会自动停用，选择保存在本机。</p>
                </div>
                <div className="source-summary-actions">
                  <Button size="sm" variant="ghost" icon="sparkles" onClick={setRecommendedSources}>仅推荐</Button>
                  <Button size="sm" variant="ghost" icon="check" onClick={() => setAllSources(true)}>全选</Button>
                  <Button size="sm" variant="secondary" icon="refresh" disabled={checkingSources} onClick={checkSources}>
                    {checkingSources ? '测活中…' : '测活'}
                  </Button>
                </div>
              </div>

              <SettingCard title="推荐源" description="实测可用的 10 个源，默认全部启用。">
                <div className="source-list">
                  {recommended.map((source) => <SourceRow key={source.key} source={source} />)}
                </div>
              </SettingCard>

              <SettingCard title="自定义源" description="苹果 CMS 兼容接口，保存后立即参与搜索与详情。">
                <div className="source-list">
                  {customApis.map((api, index) => (
                    <div className="source-row is-enabled" key={`${api.url}-${index}`}>
                      <StatusDot status="ok" />
                      <div className="source-row-main">
                        <div className="source-row-title">
                          <strong>{api.name}</strong>
                          <span className="source-status source-status-ok">自定义</span>
                        </div>
                        <div className="source-row-meta"><span>{api.url}</span></div>
                      </div>
                      <div className="custom-source-actions">
                        <button type="button" className="icon-btn" onClick={() => startEditCustom(index)} aria-label={`编辑 ${api.name}`}>
                          <Icon name="edit" size={16} />
                        </button>
                        <button type="button" className="icon-btn" onClick={() => removeCustom(index)} aria-label={`删除 ${api.name}`}>
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!customApis.length && editingCustom === null && (
                    <p className="setting-hint">还没有自定义源，添加一个苹果 CMS 接口即可参与搜索。</p>
                  )}
                </div>
                {editingCustom !== null ? (
                  <form className="custom-source-form" onSubmit={submitCustom}>
                    <input
                      value={customName}
                      onChange={(event) => setCustomName(event.target.value)}
                      placeholder="名称（留空自动取域名）"
                      aria-label="自定义源名称"
                    />
                    <input
                      value={customUrl}
                      onChange={(event) => setCustomUrl(event.target.value)}
                      placeholder="https://example.com/api.php/provide/vod/"
                      aria-label="自定义源接口地址"
                    />
                    <div className="custom-source-form-actions">
                      <Button size="sm" variant="ghost" onClick={cancelCustom}>取消</Button>
                      <Button size="sm" variant="primary" type="submit" icon="check">
                        {editingCustom === 'new' ? '添加' : '保存'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button size="sm" variant="secondary" icon="plus" onClick={startAddCustom}>新增自定义源</Button>
                )}
              </SettingCard>

              {!showAll ? (
                <button type="button" className="show-all-sources" onClick={() => setShowAll(true)}>
                  <Icon name="chevronDown" size={17} />
                  显示全部 {total} 个源（备用 {backup.length} · HTML 实验 {experimental.length}）
                </button>
              ) : (
                <>
                  <SettingCard title="备用源" description="当前不可用或与推荐源同源，失效时自动跳过。">
                    <div className="source-list">
                      {backup.map((source) => <SourceRow key={source.key} source={source} />)}
                    </div>
                  </SettingCard>
                  <SettingCard title="HTML 实验源" description="接口返回网页而非 JSON，当前无法搜索；保留占位。">
                    <div className="source-list">
                      {experimental.map((source) => <SourceRow key={source.key} source={source} />)}
                    </div>
                  </SettingCard>
                  <button type="button" className="show-all-sources" onClick={() => setShowAll(false)}>
                    <Icon name="chevronDown" size={17} style={{ transform: 'rotate(180deg)' }} />
                    收起备用与实验源
                  </button>
                </>
              )}

              <div className="source-warning">
                <Icon name="wifi" size={16} />
                <p>成人内容源未内置。源站可用性与内容合法性由第三方负责；可在每行单独停用。</p>
              </div>
            </>
          )}

          {section === 'data' && (
            <>
              <SettingCard title="本机数据" description="历史、收藏、源选择与设置保存于当前设备。">
                <SettingRow label="导出配置" description="生成含设置、源选择、历史与收藏的 JSON">
                  <Button size="sm" variant="secondary" icon="download" onClick={exportConfig}>导出</Button>
                </SettingRow>
                <SettingRow label="导入配置" description="支持本应用与旧版 LittleSU TV-Settings.json">
                  <Button size="sm" variant="secondary" icon="upload" onClick={() => fileRef.current?.click()}>导入</Button>
                </SettingRow>
                <SettingRow label="清除观看历史" description={`当前 ${history.length} 条记录，不影响收藏与设置`}>
                  <Button
                    size="sm"
                    variant="danger"
                    icon="trash"
                    disabled={!history.length}
                    onClick={() => { clearHistory(); toast('已清除历史', 'success'); }}
                  >
                    清除
                  </Button>
                </SettingRow>
              </SettingCard>
              <SettingCard title="缓存" description="豆瓣、节目单与详情的内存缓存，以及浏览器缓存分区。">
                <SettingRow label="清理缓存" description="不会影响历史、收藏与设置">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const { partitions } = await clearAppCaches();
                      toast(partitions ? `已清理缓存（${partitions} 个缓存分区）` : '已清理内存缓存', 'success');
                    }}
                  >
                    清理
                  </Button>
                </SettingRow>
              </SettingCard>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) importConfig(file);
                  event.target.value = '';
                }}
              />
            </>
          )}

          {section === 'about' && (
            <>
              <SettingCard title="LittleSU TV" description="免费在线视频搜索与观看平台 · 独立客户端">
                <div className="about-row"><span>版本</span><strong>{APP_VERSION}</strong></div>
                <div className="about-row"><span>前端</span><strong>Lightframe · React</strong></div>
                <div className="about-row"><span>仓库</span><button type="button" className="text-link" onClick={() => openExternal('https://github.com/xiaowulai-s/LittleSU')}>github.com/xiaowulai-s/LittleSU</button></div>
                <div className="about-row"><span>许可证</span><strong>Apache-2.0</strong></div>
              </SettingCard>
              <SettingCard title="更新" description="检查 GitHub 上的最新版本。">
                {updateInfo?.hasUpdate && (
                  <div className="update-banner">
                    <Icon name="sparkles" size={16} />
                    <p>发现新版本 <strong>v{updateInfo.latest}</strong>，当前 v{APP_VERSION}</p>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={updateInstalling}
                      onClick={() => {
                        if (ANDROID) void openExternal(updateInfo.url);
                        else void installUpdate();
                      }}
                    >
                      {ANDROID ? '前往下载' : updateInstalling ? `更新中 ${updateProgress ?? 0}%` : '下载并安装'}
                    </Button>
                  </div>
                )}
                {updateInstalling && (
                  <div className="progress update-progress"><span style={{ width: `${updateProgress ?? 0}%` }} /></div>
                )}
                <SettingRow label="检查更新" description={`当前版本 ${APP_VERSION}`}>
                  <Button
                    size="sm"
                    variant="primary"
                    icon="refresh"
                    onClick={async () => {
                      const info = await checkUpdate();
                      if (!info) toast('检查更新失败，请稍后再试', 'warning');
                      else if (info.hasUpdate) toast(`发现新版本 v${info.latest}`, 'success');
                      else toast(`已是最新版本 v${APP_VERSION}`, 'success');
                    }}
                  >
                    检查更新
                  </Button>
                </SettingRow>
              </SettingCard>
              <div className="about-note">
                <SourceBadge name="第三方源" />
                <p>本应用不托管、不制作任何视频内容，仅提供第三方公开接口的聚合与播放能力。</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}