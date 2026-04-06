# AutoShorts 🎥

AutoShorts is an automated platform designed to create, manage, and schedule short-form video content for YouTube Shorts, TikTok, and Instagram. It leverages AI for script generation and integrates with multiple media APIs to produce professional-quality videos with minimal effort.

## 🚀 Features

- **AI-Powered Scripting**: Automatically generates video scripts using Google Gemini AI.
- **Multi-Platform Support**: Upload directly to YouTube, TikTok, and Instagram.
- **Smart Scheduling**: Built-in calendar for scheduling posts with automated publishing.
- **Asset Integration**: Automatically fetches relevant media from Pixabay and Pexels.
- **Dynamic TTS**: High-quality Text-to-Speech with subtitle generation.
- **Customizable Pipelines**: Control video orientation, outro, background music, and more per task.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (using `better-sqlite3`)
- **Video Engine**: FFmpeg (via `fluent-ffmpeg`)
- **AI**: Google Gemini API
- **Templates**: EJS

## 📦 Setup & Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd autoshorts
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   - Copy `.env.example` to `.env`
   - Fill in your API keys and OAuth credentials.
   ```bash
   cp .env.example .env
   ```

4. **Start the server**:
   ```bash
   npm start
   # For development:
   npm run dev
   ```

5. **Access the Dashboard**:
   - Open `http://localhost:3000` in your browser.
   - Default login (can be changed in `.env`):
     - Username: `admin`
     - Password: `admin123`

## 🛡️ Security

- All dashboard routes are protected by session-based authentication.
- API endpoints are secured with `requireLogin` middleware.
- Environment variables are used for all sensitive credentials.

## 📝 License

This project is for internal use and development. Ensure you comply with the Terms of Service of all integrated APIs (YouTube, TikTok, Facebook/Meta).
