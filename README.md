![Banner](https://nc-cdn.oss-accelerate.aliyuncs.com/nx/4622c0b17cff.png)

# Bing Create

A REST API wrapper for Bing Image Creator (DALL-E, GPT-4o, MAI Image 1) built with Node.js + Express.

## Requirements

- Node.js 18+
- A Microsoft account logged in to [Bing Image Creator](https://www.bing.com/images/create)

## Installation

```bash
git clone https://github.com/rynn-k/bing-create.git
cd bing-create
npm install
```

## Configuration

Open `bing.js` and fill in your `_U` cookie:

```js
static COOKIE_U = 'your_cookie_U_here';
```

### How to get the `_U` cookie

1. Open [https://www.bing.com/images/create](https://www.bing.com/images/create) in your browser
2. Sign in with your Microsoft account
3. Open DevTools → **Application** tab → **Cookies** → `https://www.bing.com`
4. Find the cookie named `_U` and copy its value

## Running

```bash
node index.js
```

Server runs at `http://localhost:7860`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | API info |
| `GET` | `/health` | Server & session status |
| `GET` | `/options` | Available models and aspects |
| `POST` | `/create/image` | Generate images |
| `POST` | `/create/video` | Generate video (async task) |
| `GET` | `/task/:taskId` | Get video task status |

---

## API Reference

### `GET /`

Get API information and available endpoints.

```bash
curl http://localhost:7860/
```

**Response:**
```json
{
  "success": true,
  "author": "rynn-k (Randyyyyy)",
  "repository": "https://github.com/rynn-k/Bing-Create",
  "endpoints": {
    "info": "GET /",
    "health": "GET /health",
    "create_image": "POST /create/image",
    "create_video": "POST /create/video",
    "get_task": "GET /task/:taskId",
    "options": "GET /options"
  }
}
```

---

### `GET /health`

Check server health and session status.

```bash
curl http://localhost:7860/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "cookie": "set",
    "session": "active",
    "activeTasks": 2
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### `GET /options`

Get available models and aspect ratios.

```bash
curl http://localhost:7860/options
```

**Response:**
```json
{
  "success": true,
  "data": {
    "models": [
      { "id": "DALLE", "value": 0, "description": "DALL-E — fast, general purpose" },
      { "id": "GPT4O", "value": 1, "description": "GPT-4o — higher quality, slower" },
      { "id": "MAI1",  "value": 4, "description": "MAI Image 1 — Microsoft model" }
    ],
    "aspects": [
      { "id": "SQUARE",    "value": 1, "ratio": "1:1" },
      { "id": "LANDSCAPE", "value": 2, "ratio": "7:4" },
      { "id": "PORTRAIT",  "value": 3, "ratio": "4:7" }
    ]
  }
}
```

---

### `POST /create/image`

Generate images synchronously. Returns image URLs immediately after generation completes.

**Request body:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | `string` | required | Prompt text |
| `model` | `string\|number` | `DALLE` | `DALLE`, `GPT4O`, `MAI1` or `0`, `1`, `4` |
| `aspect` | `string\|number` | `SQUARE` | `SQUARE`, `LANDSCAPE`, `PORTRAIT` or `1`, `2`, `3` |

**Example:**

```bash
curl -X POST http://localhost:7860/create/image \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "a futuristic city at sunset",
    "model": "DALLE",
    "aspect": "LANDSCAPE"
  }'
```

**Success response:**
```json
{
  "success": true,
  "data": {
    "images": [
      "https://th.bing.com/th/id/OIG...",
      "https://th.bing.com/th/id/OIG...",
      "https://th.bing.com/th/id/OIG...",
      "https://th.bing.com/th/id/OIG..."
    ],
    "prompt": "a futuristic city at sunset with neon lights and flying cars",
    "model": "DALLE",
    "aspect": "LANDSCAPE"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**With different model:**
```bash
curl -X POST http://localhost:7860/create/image \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "cyberpunk street scene",
    "model": "GPT4O",
    "aspect": "PORTRAIT"
  }'
```

---

### `POST /create/video`

Generate video asynchronously. Returns a task ID to check the status later.

**Request body:**

| Field | Type | Description |
|-------|------|-------------|
| `query` | `string` | Prompt text (required) |

**Example:**

```bash
curl -X POST http://localhost:7860/create/video \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "ocean waves at sunset"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "taskId": "123e4567-e89b-12d3-a456-426614174000",
    "prompt": "ocean waves at sunset"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### `GET /task/:taskId`

Check the status of a video generation task.

**Example:**

```bash
curl http://localhost:7860/task/123e4567-e89b-12d3-a456-426614174000
```

**Response (Processing):**
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "status": "processing",
    "prompt": "ocean waves at sunset",
    "video": null,
    "error": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "completedAt": null
  },
  "timestamp": "2024-01-01T00:00:05.000Z"
}
```

**Response (Completed):**
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "status": "completed",
    "prompt": "ocean waves at sunset",
    "video": "https://example.com/video.mp4",
    "error": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "completedAt": "2024-01-01T00:01:30.000Z"
  },
  "timestamp": "2024-01-01T00:01:35.000Z"
}
```

**Response (Failed):**
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "status": "failed",
    "prompt": "ocean waves at sunset",
    "video": null,
    "error": "Prompt rejected for content policy.",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "completedAt": "2024-01-01T00:00:10.000Z"
  },
  "timestamp": "2024-01-01T00:00:15.000Z"
}
```

**Response (Not Found):**
```json
{
  "error": {
    "message": "Task not found.",
    "type": "invalid_request_error"
  }
}
```

---

## Usage Examples

### Minimal Image Generation

```bash
curl -X POST http://localhost:7860/create/image \
  -H 'Content-Type: application/json' \
  -d '{"query": "beautiful sunset"}'
```

### High-Quality Image with GPT-4o

```bash
curl -X POST http://localhost:7860/create/image \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "detailed fantasy landscape",
    "model": "GPT4O",
    "aspect": "LANDSCAPE"
  }'
```

### Video Generation Workflow

```bash
# 1. Start video generation
TASK_ID=$(curl -s -X POST http://localhost:7860/create/video \
  -H 'Content-Type: application/json' \
  -d '{"query": "dancing flames"}' | jq -r '.data.taskId')

# 2. Check status periodically
curl http://localhost:7860/task/$TASK_ID

# 3. Keep checking until status is "completed" or "failed"
```

---

## Error Types

| Type | HTTP | Description |
|------|------|-------------|
| `invalid_request_error` | 400 | Missing or invalid parameters |
| `auth_error` | 401 | `_U` cookie is not set or has expired |
| `prompt_rejected_error` | 422 | Prompt violates Bing's content policy |
| `api_error` | 500 | Internal server error |

### Error Response Format

```json
{
  "error": {
    "message": "Error description",
    "type": "error_type"
  }
}
```

---

## Task Status Flow

```
POST /create/video
    ↓
  taskId returned
    ↓
GET /task/:taskId (status: "processing")
    ↓
    ... polling ...
    ↓
GET /task/:taskId (status: "completed" or "failed")
```

---

## Notes

- **Image generation** is synchronous and returns results immediately
- **Video generation** is asynchronous and requires polling the task endpoint
- Video tasks are stored in memory and will be lost if the server restarts
- Tasks remain in memory until the server is restarted (no automatic cleanup)
- The `_U` cookie must be valid and have access to Bing Image Creator

---

## License

[MIT](LICENSE)
