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
| `GET` | `/generate/options` | Available models, aspects, and types |
| `POST` | `/generate` | Generate an image or video |

---

### `GET /`

```bash
curl http://localhost:7860/
```

---

### `GET /health`

```bash
curl http://localhost:7860/health
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "cookie": "set",
    "session": "active"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### `GET /generate/options`

```bash
curl http://localhost:7860/generate/options
```

Response:
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
    ],
    "types": ["image", "video"]
  }
}
```

---

### `POST /generate`

**Request body:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | `string` | required | Prompt text |
| `model` | `string\|number` | `DALLE` | `DALLE`, `GPT4O`, `MAI1` or `0`, `1`, `4` |
| `aspect` | `string\|number` | `SQUARE` | `SQUARE`, `LANDSCAPE`, `PORTRAIT` or `1`, `2`, `3` |
| `type` | `string` | `image` | `image` or `video` |

**Minimal:**
```bash
curl -X POST http://localhost:7860/generate \
  -H 'Content-Type: application/json' \
  -d '{"query": "a futuristic city at sunset"}'
```

**Full options:**
```bash
curl -X POST http://localhost:7860/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "a futuristic city at sunset",
    "model": "DALLE",
    "aspect": "LANDSCAPE",
    "type": "image"
  }'
```

**Video:**
```bash
curl -X POST http://localhost:7860/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "ocean waves at sunset",
    "type": "video"
  }'
```

**Success response:**
```json
{
  "success": true,
  "data": {
    "type": "image",
    "images": [
      "https://th.bing.com/th/id/OIG...",
      "https://th.bing.com/th/id/OIG..."
    ],
    "prompt": "a futuristic city at sunset",
    "model": "DALLE",
    "aspect": "LANDSCAPE"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Error response:**
```json
{
  "error": {
    "message": "Prompt rejected for content policy.",
    "type": "prompt_rejected_error"
  }
}
```

## Error Types

| Type | HTTP | Description |
|------|------|-------------|
| `invalid_request_error` | 400 | Missing or invalid parameters |
| `auth_error` | 401 | `_U` cookie is not set or has expired |
| `prompt_rejected_error` | 422 | Prompt violates Bing's content policy |
| `api_error` | 500 | Internal server error |

## License

[MIT](LICENSE)
