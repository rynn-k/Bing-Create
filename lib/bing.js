const { URLSearchParams } = require('url');
const { CookieJar } = require('tough-cookie');
const makeFetchCookie = require('fetch-cookie');
const nodeFetch = require('node-fetch');
const crypto = require('crypto');

const BASE_URL = 'https://www.bing.com/images/create';
const BING_ORIGIN = 'https://www.bing.com';
const IMAGE_HOST = 'https://th.bing.com';

const POLL_INTERVAL = 5000;
const POLL_INTERVAL_GPT4O = 3000;

const REJECTION_MARKERS = [
    'girer_center block_icon',
    'data-clarity-tag="BlockedByContentPolicy"',
    'dq-err="',
];

const AUTH_MARKER = 'id="id_a" style="display:none"';
const GPT4O_STREAMING_MARKER = 'imgri-inner-container strm';

const MODEL_MAP = { DALLE: 0, GPT4O: 1, MAI1: 4 };
const ASPECT_MAP = { SQUARE: 1, LANDSCAPE: 2, PORTRAIT: 3 };
const MODEL_BODY_MAP = { 0: 'dalle', 1: 'gpt4o', 4: 'maiimage1' };
const ASPECT_BODY_MAP = { 1: '1:1', 2: '7:4', 3: '4:7' };

const RE_IG = /IG:"([^"]+)"/;
const RE_SALT = /Salt:"([^"]+)"/;
const RE_ID = /id=([^&"]+)/;
const RE_SELCAP = /data-selcap="([^"]+)"/;
const RE_ALT = /<img[^>]*class="image-row-img[^"]*"[^>]*alt="([^"]+)"/;
const RE_SRC_ANY = /src="([^"]+)"/g;
const RE_VIDEO_URL = /ourl="([^"]+)"/;

class AuthCookieError extends Error {}
class PromptRejectedError extends Error {}

class BingCreate {
    // cookieU must be filled in manually by the owner here
    static COOKIE_U = '';
    
    constructor() {
        this.cookieU = BingCreate.COOKIE_U;
        this.IG = null;
        this.salt = null;
        this.jar = new CookieJar();
        this.fetch = makeFetchCookie(nodeFetch, this.jar);
        this.headers = {
            authority: 'www.bing.com',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'content-type': 'application/x-www-form-urlencoded',
            origin: BING_ORIGIN,
            referer: BASE_URL,
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        };
        
        this.videoTasks = new Map();
    }
    
    // ─── Auth ───────────────────────────────────────────────────────────────────
    
    checkCookie() {
        if (!this.cookieU || this.cookieU.trim() === '') throw new AuthCookieError('Cookie _U is not set. Please fill in BingCreate.COOKIE_U in bing.js.');
    }

    async setup() {
        this.checkCookie();
        
        this.jar = new CookieJar();
        this.fetch = makeFetchCookie(nodeFetch, this.jar);
        this.jar.setCookieSync(
            `_U=${this.cookieU}; Domain=.bing.com; Path=/`,
            'https://www.bing.com'
        );
        
        const res = await this.fetch(BASE_URL, { headers: this.headers });
        const html = await res.text();
        
        if (!html.includes(AUTH_MARKER)) throw new AuthCookieError('Authentication failed. _U cookie is invalid or expired.');
        
        const igMatch = RE_IG.exec(html);
        const saltMatch = RE_SALT.exec(html);
        if (igMatch) this.IG = igMatch[1];
        if (saltMatch) this.salt = saltMatch[1];
        
        const srchhpgusr = `SRCHLANG=ru&HV=${Math.floor(Date.now() / 1000)}&HVE=${this.salt || ''}&IG=${this.IG || ''}`;
        this.jar.setCookieSync(
            `SRCHHPGUSR=${encodeURIComponent(srchhpgusr)}; Domain=.bing.com; Path=/`,
            'https://www.bing.com'
        );
    }
    
    // ─── Submit ─────────────────────────────────────────────────────────────────
    
    async submit(params, payload, referer) {
        const url = `${BASE_URL}?${params.toString()}`;
        const res = await this.fetch(url, {
            method: 'POST',
            headers: { ...this.headers, referer },
            body: payload.toString(),
            redirect: 'manual',
        });
        
        const html = await res.text();
        this.checkRejected(html);
        
        let redirectUrl = res.headers.get('location') || html;
        if (redirectUrl.startsWith('/')) redirectUrl = `${BING_ORIGIN}${redirectUrl}`;
        
        const idMatch = RE_ID.exec(redirectUrl);
        if (!idMatch) throw new AuthCookieError('Auth failed or generic error.');
        
        if (res.headers.get('location')) {
            const rRes = await this.fetch(redirectUrl, { headers: this.headers });
            this.checkRejected(await rRes.text());
        }
        
        return idMatch[1];
    }
    
    // ─── Poll ───────────────────────────────────────────────────────────────────
    
    async pollImages(query, requestId, modelValue) {
        const interval = modelValue === MODEL_MAP.GPT4O ? POLL_INTERVAL_GPT4O : POLL_INTERVAL;
        const encoded = new URLSearchParams({ q: query }).toString();
        
        while (true) {
            const url = `${BASE_URL}/async/results/${requestId}?${encoded}&IG=${this.IG}&IID=images.as`;
            const res = await this.fetch(url, { headers: this.headers });
            const html = await res.text();
            this.checkRejected(html);
            
            if (!html.includes('text/css')) {
                await this.sleep(interval);
                continue;
            }
            
            if (modelValue === MODEL_MAP.GPT4O && html.includes(GPT4O_STREAMING_MARKER)) {
                await this.sleep(interval);
                continue;
            }
            
            const images = this.parseImageUrls(html, modelValue);
            if (images.length) return { images, enhancedPrompt: this.parseEnhancedPrompt(html) };
            
            await this.sleep(interval);
        }
    }
    
    async pollVideoOnce(query, requestId) {
        const encoded = new URLSearchParams({ q: query }).toString();
        const url = `${BASE_URL}/async/results/${requestId}?${encoded}&IG=${this.IG}&ctype=video&sm=1&girftp=1`;
        const res = await this.fetch(url, { headers: this.headers });
        const html = await res.text();
        this.checkRejected(html);
        
        if (html.includes('errorMessage') && html.includes('Pending')) {
            return { status: 'processing' };
        }
        
        if (html.includes('showContent')) {
            try {
                const data = JSON.parse(html);
                if (data?.showContent) return { status: 'completed', video: data.showContent };
            } catch (_) {}
        }
        
        const m = RE_VIDEO_URL.exec(html);
        if (m) return { status: 'completed', video: m[1] };
        
        return { status: 'processing' };
    }
    
    async pollVideo(query, requestId) {
        const encoded = new URLSearchParams({ q: query }).toString();
        
        while (true) {
            const url = `${BASE_URL}/async/results/${requestId}?${encoded}&IG=${this.IG}&ctype=video&sm=1&girftp=1`;
            const res = await this.fetch(url, { headers: this.headers });
            const html = await res.text();
            this.checkRejected(html);
            
            if (html.includes('errorMessage') && html.includes('Pending')) {
                await this.sleep(POLL_INTERVAL);
                continue;
            }
            
            if (html.includes('showContent')) {
                try {
                    const data = JSON.parse(html);
                    if (data?.showContent) return data.showContent;
                } catch (_) {}
            }
            
            const m = RE_VIDEO_URL.exec(html);
            if (m) return m[1];
            
            await this.sleep(POLL_INTERVAL);
        }
    }
    
    // ─── Task Management ────────────────────────────────────────────────────────
    
    createVideoTask(query, requestId) {
        const taskId = crypto.randomUUID();
        this.videoTasks.set(taskId, {
            id: taskId,
            query,
            requestId,
            status: 'processing',
            createdAt: new Date().toISOString(),
            video: null,
            error: null,
        });
        
        this.pollVideoTask(taskId, query, requestId);
        
        return taskId;
    }
    
    async pollVideoTask(taskId, query, requestId) {
        try {
            const video = await this.pollVideo(query, requestId);
            const task = this.videoTasks.get(taskId);
            if (task) {
                task.status = 'completed';
                task.video = video;
                task.completedAt = new Date().toISOString();
            }
        } catch (error) {
            const task = this.videoTasks.get(taskId);
            if (task) {
                task.status = 'failed';
                task.error = error.message;
                task.completedAt = new Date().toISOString();
            }
        }
    }
    
    getVideoTask(taskId) {
        return this.videoTasks.get(taskId) || null;
    }
    
    // ─── Create ─────────────────────────────────────────────────────────────────
    
    async createImage(query, { model = 'DALLE', aspect = 'SQUARE' } = {}) {
        this.checkCookie();
        if (!this.IG) await this.setup();
        
        const mdlValue = this.resolveModel(model);
        const arValue = this.resolveAspect(aspect);
        
        const { params, payload, referer } = this.buildImageRequest(query, mdlValue, arValue);
        const requestId = await this.submit(params, payload, referer);
        
        const result = await this.pollImages(query, requestId, mdlValue);
        return {
            images: result.images,
            prompt: result.enhancedPrompt || query,
            model: this.resolveModelName(mdlValue),
            aspect: this.resolveAspectName(arValue),
        };
    }
    
    async createVideo(query) {
        this.checkCookie();
        if (!this.IG) await this.setup();
        
        const { params, payload, referer } = this.buildVideoRequest(query);
        const requestId = await this.submit(params, payload, referer);
        const taskId = this.createVideoTask(query, requestId);
        
        return {
            taskId,
            prompt: query,
        };
    }
    
    async create(query, { model = 'DALLE', aspect = 'SQUARE', type = 'image' } = {}) {
        this.checkCookie();
        if (!this.IG) await this.setup();
        
        const mdlValue = this.resolveModel(model);
        const arValue = this.resolveAspect(aspect);
        
        const { params, payload, referer } = this.buildRequest(query, mdlValue, arValue, type);
        const requestId = await this.submit(params, payload, referer);
        
        if (type === 'video') {
            const result = await this.pollVideo(query, requestId);
            return { type: 'video', video: result, prompt: query };
        }
        
        const result = await this.pollImages(query, requestId, mdlValue);
        return {
            type: 'image',
            images: result.images,
            prompt: result.enhancedPrompt || query,
            model: this.resolveModelName(mdlValue),
            aspect: this.resolveAspectName(arValue),
        };
    }
    
    // ─── Helpers ────────────────────────────────────────────────────────────────
    
    buildImageRequest(query, mdlValue, arValue) {
        const params = new URLSearchParams({ q: query, FORM: 'GENCRE' });
        if (this.IG) params.set('IG', this.IG);
        
        params.set('rt', mdlValue === 0 ? '3' : '4');
        params.set('mdl', String(mdlValue));
        params.set('ar', String(arValue));
        
        const payload = new URLSearchParams({
            q: query,
            model: MODEL_BODY_MAP[mdlValue] || 'dalle',
            aspectRatio: ASPECT_BODY_MAP[arValue] || '1:1',
        });
        
        return { params, payload, referer: BASE_URL };
    }
    
    buildVideoRequest(query) {
        const params = new URLSearchParams({ q: query, FORM: 'GENCRE' });
        if (this.IG) params.set('IG', this.IG);
        
        params.set('rt', '3');
        params.set('mdl', '0');
        params.set('ar', '1');
        params.set('ctype', 'video');
        params.set('pt', '3');
        params.set('sm', '0');
        
        const payload = new URLSearchParams({ 
            q: query, 
            model: 'dalle', 
            aspectRatio: '1:1' 
        });
        
        return { params, payload, referer: `${BASE_URL}?ctype=video` };
    }
    
    buildRequest(query, mdlValue, arValue, type) {
        const params = new URLSearchParams({ q: query, FORM: 'GENCRE' });
        if (this.IG) params.set('IG', this.IG);
        
        let payload, referer;
        
        if (type === 'video') {
            referer = `${BASE_URL}?ctype=video`;
            params.set('rt', '3');
            params.set('mdl', '0');
            params.set('ar', '1');
            params.set('ctype', 'video');
            params.set('pt', '3');
            params.set('sm', '0');
            payload = new URLSearchParams({ q: query, model: 'dalle', aspectRatio: '1:1' });
        } else {
            referer = BASE_URL;
            params.set('rt', mdlValue === 0 ? '3' : '4');
            params.set('mdl', String(mdlValue));
            params.set('ar', String(arValue));
            payload = new URLSearchParams({
                q: query,
                model: MODEL_BODY_MAP[mdlValue] || 'dalle',
                aspectRatio: ASPECT_BODY_MAP[arValue] || '1:1',
            });
        }
        
        return { params, payload, referer };
    }

    resolveModel(model) {
        if (typeof model === 'number') return model;
        const key = String(model).toUpperCase();
        if (!(key in MODEL_MAP)) throw new Error(`Invalid model: ${model}. Use DALLE, GPT4O, MAI1 or 0,1,4.`);
        return MODEL_MAP[key];
    }
    
    resolveAspect(aspect) {
        if (typeof aspect === 'number') return aspect;
        const key = String(aspect).toUpperCase();
        if (!(key in ASPECT_MAP)) throw new Error(`Invalid aspect: ${aspect}. Use SQUARE, LANDSCAPE, PORTRAIT or 1,2,3.`);
        return ASPECT_MAP[key];
    }
    
    resolveModelName(value) {
        return Object.keys(MODEL_MAP).find((k) => MODEL_MAP[k] === value) || String(value);
    }
    
    resolveAspectName(value) {
        return Object.keys(ASPECT_MAP).find((k) => ASPECT_MAP[k] === value) || String(value);
    }
    
    parseEnhancedPrompt(html) {
        const m = RE_SELCAP.exec(html) || RE_ALT.exec(html);
        return m ? m[1] : null;
    }
    
    parseImageUrls(html, modelValue) {
        const srcUrls = [];
        
        let m;
        const r = new RegExp(RE_SRC_ANY.source, 'g');
        while ((m = r.exec(html))) srcUrls.push(m[1]);
        
        return srcUrls
            .map((src) => {
                const full = src.startsWith('/') ? `${IMAGE_HOST}${src}` : src;
                if (!full.includes('?') && !full.includes('/th/id/')) return null;
                const base = full.includes('?') ? full.split('?')[0] : full;
                return `${base}?pid=ImgGn`;
            })
            .filter(Boolean);
    }
    
    checkRejected(html) {
        if (REJECTION_MARKERS.some((m) => html.includes(m))) throw new PromptRejectedError('Prompt rejected for content policy.');
    }
    
    sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
}

module.exports = { BingCreate, AuthCookieError, PromptRejectedError };