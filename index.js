const express = require('express');
const cors = require('cors');
const { BingCreate, AuthCookieError, PromptRejectedError } = require('./lib/bing');

const app = express();
const PORT = process.env.PORT || 7860;

app.set('json spaces', 2);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

const bing = new BingCreate();

// ─── Routes ────────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
    res.json({
        success: true,
        author: 'rynn-k (Randyyyyy)',
        repository: 'https://github.com/rynn-k/Bing-Create',
        endpoints: {
            info: 'GET /',
            health: 'GET /health',
            create_image: 'POST /create/image',
            create_video: 'POST /create/video',
            get_task: 'GET /task/:taskId',
            options: 'GET /options'
        },
        timestamp: new Date().toISOString(),
    });
});

app.get('/health', (_req, res) => {
    const cookieSet = !!bing.cookieU && bing.cookieU.trim() !== '';
    res.json({
        success: true,
        data: {
            status: 'ok',
            cookie: cookieSet ? 'set' : 'not set',
            session: bing.IG ? 'active' : 'inactive',
            activeTasks: bing.videoTasks.size,
        },
        timestamp: new Date().toISOString(),
    });
});

app.get('/options', (_req, res) => {
    res.json({
        success: true,
        data: {
            models: [
                { id: 'DALLE',  value: 0, description: 'DALL-E — fast, general purpose' },
                { id: 'GPT4O',  value: 1, description: 'GPT-4o — higher quality, slower' },
                { id: 'MAI1',   value: 4, description: 'MAI Image 1 — Microsoft model' },
            ],
            aspects: [
                { id: 'SQUARE',    value: 1, ratio: '1:1' },
                { id: 'LANDSCAPE', value: 2, ratio: '7:4' },
                { id: 'PORTRAIT',  value: 3, ratio: '4:7' },
            ],
        },
        timestamp: new Date().toISOString(),
    });
});

// ─── Create Image ──────────────────────────────────────────────────────────────

app.post('/create/image', async (req, res) => {
    const { query, model, aspect } = req.body;
    
    if (!query || typeof query !== 'string') {
        return res.status(400).json({
            error: {
                message: 'query is required and must be a string.',
                type: 'invalid_request_error',
            },
        });
    }
    
    try {
        const result = await bing.createImage(query, { model, aspect });
        return res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        return handleError(err, res);
    }
});

// ─── Create Video ──────────────────────────────────────────────────────────────

app.post('/create/video', async (req, res) => {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
        return res.status(400).json({
            error: {
                message: 'query is required and must be a string.',
                type: 'invalid_request_error',
            },
        });
    }
    
    try {
        const result = await bing.createVideo(query);
        return res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        return handleError(err, res);
    }
});

// ─── Get Task Status ───────────────────────────────────────────────────────────

app.get('/task/:taskId', (req, res) => {
    const { taskId } = req.params;
    const task = bing.getVideoTask(taskId);
    
    if (!task) {
        return res.status(404).json({
            error: {
                message: 'Task not found.',
                type: 'invalid_request_error',
            },
        });
    }
    
    const response = {
        success: true,
        data: {
            id: task.id,
            status: task.status,
            prompt: task.query,
            video: null,
            error: null,
            createdAt: task.createdAt,
            completedAt: null
        },
        timestamp: new Date().toISOString(),
    };
    
    if (task.status === 'completed') {
        response.data.video = task.video;
        response.data.completedAt = task.completedAt;
    } else if (task.status === 'failed') {
        response.data.error = task.error;
        response.data.completedAt = task.completedAt;
    }
    
    return res.json(response);
});

// ─── Helper Functions ──────────────────────────────────────────────────────────

function handleError(err, res) {
    if (err instanceof AuthCookieError) {
        bing.IG = null;
        return res.status(401).json({
            error: {
                message: err.message,
                type: 'auth_error',
            },
        });
    }
    if (err instanceof PromptRejectedError) {
        return res.status(422).json({
            error: {
                message: err.message,
                type: 'prompt_rejected_error',
            },
        });
    }
    if (err.message.startsWith('Invalid model') || err.message.startsWith('Invalid aspect')) {
        return res.status(400).json({
            error: {
                message: err.message,
                type: 'invalid_request_error',
            },
        });
    }
    console.error('[Error]', err);
    return res.status(500).json({
        error: {
            message: err.message,
            type: 'api_error',
        },
    });
}

// ─── Fallback ──────────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
    console.error('[Error]', err.message);
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal server error',
            type: 'api_error',
        },
    });
});

app.use((_req, res) => {
    res.status(404).json({
        error: {
            message: 'Not found',
            type: 'invalid_request_error',
        },
    });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

async function startServer() {
    const cookieSet = !!bing.cookieU && bing.cookieU.trim() !== '';
    
    if (!cookieSet) {
        console.warn('[BingCreate] WARNING: COOKIE_U is not set in bing.js.');
        console.warn('[BingCreate] Please fill in BingCreate.COOKIE_U before using the API.');
    } else {
        try {
            await bing.setup();
            console.log('[BingCreate] Session ready.');
        } catch (e) {
            console.warn('[BingCreate] Setup failed:', e.message);
        }
    }

    app.listen(PORT, () => {
        console.log(`[Server] Running on http://localhost:${PORT}`);
    });
}

process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    process.exit(0);
});

startServer();