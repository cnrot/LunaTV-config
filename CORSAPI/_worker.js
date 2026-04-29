// 统一入口：兼容 Cloudflare Workers 和 Pages Functions
export default {
  async fetch(request, env, ctx) {
    // Pages Functions 中 KV 需要从 env 中获取
    if (env && env.KV && typeof globalThis.KV === 'undefined') {
      globalThis.KV = env.KV
    }
    
    return handleRequest(request)
  }
}

// 常量配置（避免重复创建）
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

const EXCLUDE_HEADERS = new Set([
  'content-encoding', 'content-length', 'transfer-encoding',
  'connection', 'keep-alive', 'set-cookie', 'set-cookie2'
])

const JSON_SOURCES = {
  'jin18': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jin18.json',
  'jingjian': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jingjian.json',
  'full': 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/LunaTV-config.json'
}

const FORMAT_CONFIG = {
  '0': { proxy: false, base58: false },
  'raw': { proxy: false, base58: false },
  '1': { proxy: true, base58: false },
  'proxy': { proxy: true, base58: false },
  '2': { proxy: false, base58: true },
  'base58': { proxy: false, base58: true },
  '3': { proxy: true, base58: true },
  'proxy-base58': { proxy: true, base58: true },
  'tvbox': { tvbox: true, base58: false },
  'tvbox-base58': { tvbox: true, base58: true }
}

// Base58 编码函数
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58Encode(obj) {
  const str = JSON.stringify(obj)
  const bytes = new TextEncoder().encode(str)

  let intVal = 0n
  for (let b of bytes) {
    intVal = (intVal << 8n) + BigInt(b)
  }

  let result = ''
  while (intVal > 0n) {
    const mod = intVal % 58n
    result = BASE58_ALPHABET[Number(mod)] + result
    intVal = intVal / 58n
  }

  for (let b of bytes) {
    if (b === 0) result = BASE58_ALPHABET[0] + result
    else break
  }

  return result
}

// JSON api 字段前缀替换
function addOrReplacePrefix(obj, newPrefix) {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(item => addOrReplacePrefix(item, newPrefix))
  const newObj = {}
  for (const key in obj) {
    if (key === 'api' && typeof obj[key] === 'string') {
      let apiUrl = obj[key]
      const urlIndex = apiUrl.indexOf('?url=')
      if (urlIndex !== -1) apiUrl = apiUrl.slice(urlIndex + 5)
      if (!apiUrl.startsWith(newPrefix)) apiUrl = newPrefix + apiUrl
      newObj[key] = apiUrl
    } else {
      newObj[key] = addOrReplacePrefix(obj[key], newPrefix)
    }
  }
  return newObj
}

function toTvboxConfig(data, origin) {
  const buildEmptyConfig = () => ({
    spider: '',
    wallpaper: '',
    sites: [],
    parses: [],
    lives: [],
    logo: '',
    proxy: [],
    rules: [],
    doh: [
      { name: 'Google', url: 'https://dns.google/dns-query' },
      { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' }
    ],
    ijk: [
      { group: '软解码', options: [
        { category: 4, name: 'opensles', value: 0 },
        { category: 4, name: 'overlay-format', value: 'fcc-_es2' },
        { category: 4, name: 'framedrop', value: 1 },
        { category: 4, name: 'start-on-prepared', value: 1 },
        { category: 1, name: 'http-detect-range-support', value: 0 },
        { category: 1, name: 'fflags', value: 'fastseek' },
        { category: 2, name: 'skip_loop_filter', value: 48 }
      ] },
      { group: '硬解码', options: [
        { category: 4, name: 'mediacodec', value: 1 },
        { category: 4, name: 'mediacodec-auto-rotate', value: 1 },
        { category: 4, name: 'mediacodec-handle-resolution-change', value: 1 },
        { category: 4, name: 'opensles', value: 0 },
        { category: 4, name: 'framedrop', value: 1 },
        { category: 4, name: 'start-on-prepared', value: 1 },
        { category: 1, name: 'http-detect-range-support', value: 0 },
        { category: 1, name: 'fflags', value: 'fastseek' },
        { category: 2, name: 'skip_loop_filter', value: 48 }
      ] }
    ],
    ads: [
      'mimg.0c1q0l.cn',
      'www.googletagmanager.com',
      'www.google-analytics.com',
      'mc.usihnbcq.cn',
      'mg.g1mm3d.cn',
      'mscs.svaeuzh.cn',
      'cnzz.hhttm.top',
      'tp.vinuxhome.com',
      'cnzz.mmstat.com',
      'www.dmtavern.com'
    ]
  })

  const baseConfig = buildEmptyConfig()
  const tvboxApi = `${origin}/?tvbox_agg=1`

  const sites = [
    {
      key: 'hot-aggregator',
      name: '🔥热门聚合',
      type: 3,
      api: tvboxApi,
      searchable: 1,
      quickSearch: 1,
      changeable: 0,
      filterable: 1,
      playerType: 1
    }
  ]

  if (data && typeof data === 'object' && data.api_site && typeof data.api_site === 'object') {
    const hiddenPoolSites = Object.entries(data.api_site)
      .filter(([, item]) => item && typeof item === 'object' && typeof item.api === 'string' && item.api)
      .map(([key, item]) => ({
        key: `pool-${key}`,
        name: `🧩${typeof item.name === 'string' ? item.name : key}`,
        type: 1,
        api: typeof item.api === 'string' ? item.api : '',
        ext: typeof item.detail === 'string' ? item.detail : '',
        searchable: 0,
        changeable: 1,
        quickSearch: 0,
        filterable: 1,
        playerType: 1
      }))
      .filter(site => site.api)

    sites.push(...hiddenPoolSites)
  }

  return {
    ...baseConfig,
    sites
  }
}

// ---------- 安全版：KV 缓存 ----------
async function getCachedJSON(url) {
  const kvAvailable = typeof KV !== 'undefined' && KV && typeof KV.get === 'function'

  if (kvAvailable) {
    const cacheKey = 'CACHE_' + url
    const cached = await KV.get(cacheKey)
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch (e) {
        await KV.delete(cacheKey)
      }
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    const data = await res.json()
    await KV.put(cacheKey, JSON.stringify(data), { expirationTtl: 1800 })   // 缓存十分钟
    return data
  } else {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    return await res.json()
  }
}

// ---------- 安全版：错误日志 ----------
async function logError(type, info) {
  // 保留错误输出，便于调试
  console.error('[ERROR]', type, info)

  // 禁止写入 KV
  return
}

const TVBOX_CLASS_MAP = [
  { type_id: '1', type_name: '热门影视', alias: ['movie', '热门影视'], keywords: ['电影', 'movie', '动作', '喜剧', '剧情'] },
  { type_id: '2', type_name: '热门剧集', alias: ['tv', '热门剧集'], keywords: ['剧', '连续剧', 'tv', '国产', '韩剧', '美剧'] },
  { type_id: '3', type_name: '热门综艺', alias: ['variety', 'show', '热门综艺'], keywords: ['综艺', 'show'] },
  { type_id: '4', type_name: '热门动漫', alias: ['anime', '热门动漫'], keywords: ['动漫', '动画', 'anime'] },
  { type_id: '5', type_name: '热门短剧', alias: ['short', '热门短剧'], keywords: ['短剧', '微短剧', '短片'] }
]

function normalizeText(text) {
  if (!text || typeof text !== 'string') return ''
  return text
    .toLowerCase()
    .replace(/[\s\-_.·]/g, '')
    .replace(/[【】\[\]()（）]/g, '')
    .replace(/高清|国语|中字|蓝光|超清/g, '')
}

function encodeAggPayload(payload) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  } catch {
    return ''
  }
}

function decodeAggPayload(token) {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4)
    const raw = decodeURIComponent(escape(atob(base64)))
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function tvboxJsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json;charset=UTF-8', ...CORS_HEADERS }
  })
}

async function fetchSourceJson(url) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 9000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchSourceList(source, pg) {
  const base = source.api
  const joiner = base.includes('?') ? '&' : '?'
  const candidates = [
    `${base}${joiner}ac=videolist&pg=${pg}`,
    `${base}${joiner}ac=list&pg=${pg}`,
    `${base}${joiner}pg=${pg}`
  ]

  for (const url of candidates) {
    const res = await fetchSourceJson(url)
    if (res && Array.isArray(res.list) && res.list.length) {
      return res.list
    }
  }

  return []
}

async function fetchSourceSearchList(source, wd, pg) {
  const base = source.api
  const joiner = base.includes('?') ? '&' : '?'
  const keyword = encodeURIComponent(wd)
  const candidates = [
    `${base}${joiner}ac=videolist&wd=${keyword}&pg=${pg}`,
    `${base}${joiner}ac=list&wd=${keyword}&pg=${pg}`,
    `${base}${joiner}wd=${keyword}&pg=${pg}`
  ]

  for (const url of candidates) {
    const res = await fetchSourceJson(url)
    if (res && Array.isArray(res.list) && res.list.length) {
      return res.list
    }
  }

  return []
}

function getSourcePoolFromData(data) {
  if (!data || typeof data !== 'object' || !data.api_site || typeof data.api_site !== 'object') return []
  return Object.entries(data.api_site)
    .filter(([, item]) => item && typeof item === 'object' && typeof item.api === 'string' && item.api)
    .map(([key, item]) => ({
      key,
      name: typeof item.name === 'string' ? item.name : key,
      api: item.api
    }))
}

function classifyVod(vod) {
  const text = `${vod.type_name || ''} ${vod.vod_class || ''} ${vod.vod_name || ''}`.toLowerCase()
  for (const cls of TVBOX_CLASS_MAP) {
    if (cls.keywords.some(k => text.includes(k))) return cls.type_id
  }
  return '1'
}

function normalizeClassId(raw) {
  const text = String(raw || '').trim().toLowerCase()
  if (!text) return '1'
  const byId = TVBOX_CLASS_MAP.find(c => c.type_id === text)
  if (byId) return byId.type_id
  const byAlias = TVBOX_CLASS_MAP.find(c => c.alias.some(a => a.toLowerCase() === text))
  if (byAlias) return byAlias.type_id
  const byName = TVBOX_CLASS_MAP.find(c => c.type_name === raw)
  if (byName) return byName.type_id
  if (text.includes('剧')) return '2'
  if (text.includes('综艺')) return '3'
  if (text.includes('动漫') || text.includes('动画')) return '4'
  if (text.includes('短剧')) return '5'
  return '1'
}

function toAggListItem(vod, sourceKey) {
  const payload = {
    sourceKey,
    id: String(vod.vod_id || ''),
    name: vod.vod_name || '',
    type: classifyVod(vod),
    ts: Date.now()
  }
  return {
    vod_id: encodeAggPayload(payload),
    vod_name: vod.vod_name || '未知标题',
    vod_pic: vod.vod_pic || '',
    vod_remarks: vod.vod_remarks || vod.type_name || '',
    vod_year: vod.vod_year || '',
    vod_score: vod.vod_score || ''
  }
}

async function buildPoolCandidates(data) {
  const pool = getSourcePoolFromData(data)
  return pool.slice(0, 30)
}

async function handleTvboxAggRequest(reqUrl) {
  const sourceParam = reqUrl.searchParams.get('source')
  const selectedSource = JSON_SOURCES[sourceParam] || JSON_SOURCES.full
  const data = await getCachedJSON(selectedSource)
  const sourcePool = await buildPoolCandidates(data)

  const ac = reqUrl.searchParams.get('ac') || ''
  if (reqUrl.searchParams.get('debug') === '1') {
    return tvboxJsonResponse({
      sourcePoolCount: sourcePool.length,
      sourcePoolSample: sourcePool.slice(0, 5).map(s => ({ key: s.key, name: s.name, api: s.api })),
      classMap: TVBOX_CLASS_MAP.map(c => ({ type_id: c.type_id, type_name: c.type_name }))
    })
  }
  const t = reqUrl.searchParams.get('t') || ''
  const wd = reqUrl.searchParams.get('wd') || ''
  const pg = Math.max(1, Number(reqUrl.searchParams.get('pg') || '1'))
  const ids = reqUrl.searchParams.get('ids') || ''
  const playId = reqUrl.searchParams.get('id') || ''

  if (!ac || ac === 'home') {
    return tvboxJsonResponse({
      class: TVBOX_CLASS_MAP.map(({ type_id, type_name }) => ({ type_id, type_name })),
      list: []
    })
  }

  if ((ac === 'videolist' || ac === 'list' || ac === 'category') && t) {
    const normalizedType = normalizeClassId(t)
    const results = []
    for (const source of sourcePool) {
      const listData = await fetchSourceList(source, pg)
      for (const vod of listData) {
        if (classifyVod(vod) === normalizedType) results.push(toAggListItem(vod, source.key))
      }
    }
    const dedupMap = new Map()
    for (const item of results) {
      const k = `${normalizeText(item.vod_name)}|${item.vod_year}|${item.vod_pic}`
      if (!dedupMap.has(k)) dedupMap.set(k, item)
    }
    let list = Array.from(dedupMap.values())

    if (!list.length) {
      const fallback = []
      for (const source of sourcePool) {
        const listData = await fetchSourceList(source, pg)
        for (const vod of listData.slice(0, 20)) fallback.push(toAggListItem(vod, source.key))
      }
      const fbMap = new Map()
      for (const item of fallback) {
        const k = `${normalizeText(item.vod_name)}|${item.vod_year}|${item.vod_pic}`
        if (!fbMap.has(k)) fbMap.set(k, item)
      }
      list = Array.from(fbMap.values())
    }

    list = list.slice(0, 80)
    return tvboxJsonResponse({ page: pg, pagecount: 999, limit: list.length, total: list.length, list })
  }

  if ((ac === 'videolist' || ac === 'search') && wd) {
    const all = []
    for (const source of sourcePool) {
      const listData = await fetchSourceSearchList(source, wd, pg)
      for (const vod of listData) all.push(toAggListItem(vod, source.key))
    }
    const dedupMap = new Map()
    for (const item of all) {
      const k = `${normalizeText(item.vod_name)}|${item.vod_year}|${item.vod_pic}`
      if (!dedupMap.has(k)) dedupMap.set(k, item)
    }
    const list = Array.from(dedupMap.values()).slice(0, 120)
    return tvboxJsonResponse({ page: pg, pagecount: 999, limit: list.length, total: list.length, list })
  }

  if (ac === 'detail' && ids) {
    const payload = decodeAggPayload(ids)
    if (!payload || !payload.sourceKey || !payload.id) return tvboxJsonResponse({ list: [] })
    const source = sourcePool.find(s => s.key === payload.sourceKey)
    if (!source) return tvboxJsonResponse({ list: [] })

    const detailRes = await fetchSourceJson(`${source.api}${source.api.includes('?') ? '&' : '?'}ac=detail&ids=${encodeURIComponent(payload.id)}`)
    const vod = detailRes && Array.isArray(detailRes.list) ? detailRes.list[0] : null
    if (!vod) return tvboxJsonResponse({ list: [] })

    const playFrom = String(vod.vod_play_from || '')
    const playUrl = String(vod.vod_play_url || '')
    if (playFrom && playUrl) {
      const groups = playUrl.split('$$$').map(group => group.split('#').map((ep) => {
        const i = ep.indexOf('$')
        if (i === -1) return ep
        const epName = ep.slice(0, i)
        const rawPlay = ep.slice(i + 1)
        const playToken = encodeAggPayload({ sourceKey: source.key, play: rawPlay, ts: Date.now() })
        return `${epName}$aggplay:${playToken}`
      }).join('#'))
      vod.vod_play_url = groups.join('$$$')
    }

    return tvboxJsonResponse({ list: [vod] })
  }

  if (ac === 'play' && playId.startsWith('aggplay:')) {
    const token = playId.slice('aggplay:'.length)
    const payload = decodeAggPayload(token)
    if (!payload || !payload.play) {
      return tvboxJsonResponse({ parse: 1, url: playId, header: '' })
    }
    const url = String(payload.play)
    const direct = /^https?:\/\/.+\.(m3u8|mp4)(\?.*)?$/i.test(url)
    return tvboxJsonResponse({ parse: direct ? 0 : 1, url, header: '' })
  }

  return tvboxJsonResponse({ list: [] })
}

// ---------- 主逻辑 ----------
async function handleRequest(request) {
  // 快速处理 OPTIONS 请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const reqUrl = new URL(request.url)
  const pathname = reqUrl.pathname
  const targetUrlParam = reqUrl.searchParams.get('url')
  const formatParam = reqUrl.searchParams.get('format')
  const prefixParam = reqUrl.searchParams.get('prefix')
  const sourceParam = reqUrl.searchParams.get('source')
  const tvboxAggParam = reqUrl.searchParams.get('tvbox_agg')

  const currentOrigin = reqUrl.origin
  const defaultPrefix = currentOrigin + '/?url='

  // 🩺 健康检查（最常见的性能检查，提前处理）
  if (pathname === '/health') {
    return new Response('OK', { status: 200, headers: CORS_HEADERS })
  }

  if (tvboxAggParam === '1') {
    return handleTvboxAggRequest(reqUrl)
  }

  // 通用代理请求处理
  if (targetUrlParam) {
    return handleProxyRequest(request, targetUrlParam, currentOrigin)
  }

  // JSON 格式输出处理
  if (formatParam !== null) {
    return handleFormatRequest(formatParam, sourceParam, prefixParam, defaultPrefix, currentOrigin)
  }

  // 返回首页文档
  return handleHomePage(currentOrigin, defaultPrefix)
}

// ---------- 代理请求处理子模块 ----------
async function handleProxyRequest(request, targetUrlParam, currentOrigin) {
  // 🚨 防止递归调用自身
  if (targetUrlParam.startsWith(currentOrigin)) {
    return errorResponse('Loop detected: self-fetch blocked', { url: targetUrlParam }, 400)
  }

  // 🚨 防止无效 URL
  if (!/^https?:\/\//i.test(targetUrlParam)) {
    return errorResponse('Invalid target URL', { url: targetUrlParam }, 400)
  }

  let fullTargetUrl = targetUrlParam
  const urlMatch = request.url.match(/[?&]url=([^&]+(?:&.*)?)/)
  if (urlMatch) fullTargetUrl = decodeURIComponent(urlMatch[1])

  let targetURL
  try {
    targetURL = new URL(fullTargetUrl)
  } catch {
    await logError('proxy', { message: 'Invalid URL', url: fullTargetUrl })
    return errorResponse('Invalid URL', { url: fullTargetUrl }, 400)
  }

  try {
    const proxyRequest = new Request(targetURL.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : undefined,
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 9000)
    const response = await fetch(proxyRequest, { signal: controller.signal })
    clearTimeout(timeoutId)

    const responseHeaders = new Headers(CORS_HEADERS)
    for (const [key, value] of response.headers) {
      if (!EXCLUDE_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value)
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
  } catch (err) {
    await logError('proxy', { message: err.message || '代理请求失败', url: fullTargetUrl })
    return errorResponse('Proxy Error', {
      message: err.message || '代理请求失败',
      target: fullTargetUrl,
      timestamp: new Date().toISOString()
    }, 502)
  }
}

// ---------- JSON 格式输出处理子模块 ----------
async function handleFormatRequest(formatParam, sourceParam, prefixParam, defaultPrefix, currentOrigin) {
  try {
    const config = FORMAT_CONFIG[formatParam]
    if (!config) {
      return errorResponse('Invalid format parameter', { format: formatParam }, 400)
    }

    const selectedSource = JSON_SOURCES[sourceParam] || JSON_SOURCES['full']
    const data = await getCachedJSON(selectedSource)
    
    const newData = config.proxy
      ? addOrReplacePrefix(data, prefixParam || defaultPrefix)
      : data

    if (config.tvbox) {
      const tvboxData = toTvboxConfig(data, currentOrigin)
      if (config.base58) {
        const encoded = base58Encode(tvboxData)
        return new Response(encoded, {
          headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...CORS_HEADERS },
        })
      }
      return new Response(JSON.stringify(tvboxData), {
        headers: { 'Content-Type': 'application/json;charset=UTF-8', ...CORS_HEADERS },
      })
    }

    if (config.base58) {
      const encoded = base58Encode(newData)
      return new Response(encoded, {
        headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...CORS_HEADERS },
      })
    } else {
      return new Response(JSON.stringify(newData), {
        headers: { 'Content-Type': 'application/json;charset=UTF-8', ...CORS_HEADERS },
      })
    }
  } catch (err) {
    await logError('json', { message: err.message })
    return errorResponse(err.message, {}, 500)
  }
}

// ---------- 首页文档处理 ----------
async function handleHomePage(currentOrigin, defaultPrefix) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API 中转代理服务</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; line-height: 1.6; }
    h1 { color: #333; }
    h2 { color: #555; margin-top: 30px; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    .example { background: #e8f5e9; padding: 15px; border-left: 4px solid #4caf50; margin: 20px 0; }
    .section { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    table td { padding: 8px; border: 1px solid #ddd; }
    table td:first-child { background: #f5f5f5; font-weight: bold; width: 30%; }
  </style>
</head>
<body>
  <h1>🔄 API 中转代理服务</h1>
  <p>通用 API 中转代理，用于访问被墙或限制的接口。</p>
  
  <h2>使用方法</h2>
  <p>中转任意 API：在请求 URL 后添加 <code>?url=目标地址</code> 参数</p>
  <pre>${defaultPrefix}<示例API地址></pre>
  
  <h2>配置订阅参数说明</h2>
  <div class="section">
    <table>
      <tr>
        <td>format</td>
        <td><code>0</code> 或 <code>raw</code> = 原始 JSON<br>
            <code>1</code> 或 <code>proxy</code> = 添加代理前缀<br>
            <code>2</code> 或 <code>base58</code> = 原始 Base58 编码<br>
            <code>3</code> 或 <code>proxy-base58</code> = 代理 Base58 编码<br>
            <code>tvbox</code> = TVBox JSON<br>
            <code>tvbox-base58</code> = TVBox Base58</td>
      </tr>
      <tr>
        <td>source</td>
        <td><code>jin18</code> = 精简版<br>
            <code>jingjian</code> = 精简版+成人<br>
            <code>full</code> = 完整版（默认）</td>
      </tr>
      <tr>
        <td>prefix</td>
        <td>自定义代理前缀（仅在 format=1 或 3 时生效）</td>
      </tr>
    </table>
  </div>
  
  <h2>配置订阅链接示例</h2>
    
  <div class="section">
    <h3>📦 精简版（jin18）</h3>
    <p>原始 JSON：<br><code class="copyable">${currentOrigin}?format=0&source=jin18</code> <button class="copy-btn">复制</button></p>
    <p>中转代理 JSON：<br><code class="copyable">${currentOrigin}?format=1&source=jin18</code> <button class="copy-btn">复制</button></p>
    <p>原始 Base58：<br><code class="copyable">${currentOrigin}?format=2&source=jin18</code> <button class="copy-btn">复制</button></p>
    <p>中转 Base58：<br><code class="copyable">${currentOrigin}?format=3&source=jin18</code> <button class="copy-btn">复制</button></p>
    <p>TVBox JSON：<br><code class="copyable">${currentOrigin}?format=tvbox&source=jin18</code> <button class="copy-btn">复制</button></p>
    <p>TVBox Base58：<br><code class="copyable">${currentOrigin}?format=tvbox-base58&source=jin18</code> <button class="copy-btn">复制</button></p>
  </div>
  
  <div class="section">
    <h3>📦 精简版+成人（jingjian）</h3>
    <p>原始 JSON：<br><code class="copyable">${currentOrigin}?format=0&source=jingjian</code> <button class="copy-btn">复制</button></p>
    <p>中转代理 JSON：<br><code class="copyable">${currentOrigin}?format=1&source=jingjian</code> <button class="copy-btn">复制</button></p>
    <p>原始 Base58：<br><code class="copyable">${currentOrigin}?format=2&source=jingjian</code> <button class="copy-btn">复制</button></p>
    <p>中转 Base58：<br><code class="copyable">${currentOrigin}?format=3&source=jingjian</code> <button class="copy-btn">复制</button></p>
    <p>TVBox JSON：<br><code class="copyable">${currentOrigin}?format=tvbox&source=jingjian</code> <button class="copy-btn">复制</button></p>
    <p>TVBox Base58：<br><code class="copyable">${currentOrigin}?format=tvbox-base58&source=jingjian</code> <button class="copy-btn">复制</button></p>
  </div>
  
  <div class="section">
    <h3>📦 完整版（full，默认）</h3>
    <p>原始 JSON：<br><code class="copyable">${currentOrigin}?format=0&source=full</code> <button class="copy-btn">复制</button></p>
    <p>中转代理 JSON：<br><code class="copyable">${currentOrigin}?format=1&source=full</code> <button class="copy-btn">复制</button></p>
    <p>原始 Base58：<br><code class="copyable">${currentOrigin}?format=2&source=full</code> <button class="copy-btn">复制</button></p>
    <p>中转 Base58：<br><code class="copyable">${currentOrigin}?format=3&source=full</code> <button class="copy-btn">复制</button></p>
    <p>TVBox JSON：<br><code class="copyable">${currentOrigin}?format=tvbox&source=full</code> <button class="copy-btn">复制</button></p>
    <p>TVBox Base58：<br><code class="copyable">${currentOrigin}?format=tvbox-base58&source=full</code> <button class="copy-btn">复制</button></p>
  </div>
  
  <h2>支持的功能</h2>
  <ul>
    <li>✅ 支持 GET、POST、PUT、DELETE 等所有 HTTP 方法</li>
    <li>✅ 自动转发请求头和请求体</li>
    <li>✅ 保留原始响应头（除敏感信息）</li>
    <li>✅ 完整的 CORS 支持</li>
    <li>✅ 超时保护（9 秒）</li>
    <li>✅ 支持多种配置源切换</li>
    <li>✅ 支持 Base58 编码输出</li>
    <li>✅ 支持 TVBox JSON / Base58 输出（format=tvbox / tvbox-base58）</li>
  </ul>
  
  <script>
    document.querySelectorAll('.copy-btn').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const text = document.querySelectorAll('.copyable')[idx].innerText;
        navigator.clipboard.writeText(text).then(() => {
          btn.innerText = '已复制！';
          setTimeout(() => (btn.innerText = '复制'), 1500);
        });
      });
    });
  </script>
</body>
</html>`

  return new Response(html, { 
    status: 200, 
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS } 
  })
}

// ---------- 统一错误响应处理 ----------
function errorResponse(error, data = {}, status = 400) {
  return new Response(JSON.stringify({ error, ...data }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
  })
}
