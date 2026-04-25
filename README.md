# AITD Backend

Express + Node.js backend for AITD frontend/admin content management.

## Tech

- Node.js + Express
- MySQL (`mysql2`)
- Cloudinary (image storage)

## Setup

1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:
   - `npm install`
3. Run:
   - `npm run dev`

The API runs on `http://localhost:5000` by default.

## Endpoints

- `GET /api/health`
- `GET /api/sections`
- `GET /api/content/:section`
- `POST /api/content/:section`
- `POST /api/uploads/image`

Allowed sections:

- `events`
- `placements`
- `latest-news`
- `testimonials`
- `faculty`
