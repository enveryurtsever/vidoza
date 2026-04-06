const axios = require("axios");
const { google } = require("googleapis");
const config = require("../config");
const { setSocialConnection, updateSocialConnection } = require("../database");

class AuthService {
    // ── YouTube ──

    getYouTubeOAuth2Client() {
        return new google.auth.OAuth2(
            config.YOUTUBE_CLIENT_ID,
            config.YOUTUBE_CLIENT_SECRET,
            config.YOUTUBE_REDIRECT_URI
        );
    }

    getYouTubeAuthUrl() {
        const oauth2Client = this.getYouTubeOAuth2Client();
        return oauth2Client.generateAuthUrl({
            access_type: "offline",
            scope: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
            prompt: "consent",
        });
    }

    async handleYouTubeCallback(code) {
        const oauth2Client = this.getYouTubeOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const youtube = google.youtube({ version: "v3", auth: oauth2Client });
        const channelRes = await youtube.channels.list({ part: "snippet", mine: true });

        if (!channelRes.data.items || channelRes.data.items.length === 0) {
            throw new Error("Bu Google hesabına bağlı bir YouTube kanalı bulunamadı. Lütfen bir kanal oluşturup tekrar deneyin.");
        }

        const channel = channelRes.data.items[0];
        console.log(`Kanal bulundu: ${channel.snippet.title} (${channel.id})`);

        const accountId = setSocialConnection(
            "youtube",
            channel.id,
            channel.snippet.title,
            tokens.access_token,
            tokens.refresh_token,
            tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
            JSON.stringify(channel.snippet)
        );

        return accountId;
    }


    async refreshYouTubeToken(account) {
        const oauth2Client = this.getYouTubeOAuth2Client();
        oauth2Client.setCredentials({
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expiry_date: account.expires_at ? new Date(account.expires_at).getTime() : null
        });

        if (oauth2Client.isTokenExpiring()) {
            const { credentials } = await oauth2Client.refreshAccessToken();
            setSocialConnection(
                "youtube",
                account.platform_account_id,
                account.account_name,
                credentials.access_token,
                credentials.refresh_token || account.refresh_token,
                credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
                account.additional_data
            );
            return credentials.access_token;
        }
        return account.access_token;
    }

    // ── TikTok ──

    getTikTokAuthUrl() {
        const params = new URLSearchParams({
            client_key: config.TIKTOK_CLIENT_KEY,
            response_type: "code",
            scope: "video.upload,video.publish,user.info.basic",
            redirect_uri: config.TIKTOK_REDIRECT_URI,
            state: "autoshorts",
        });
        return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
    }

    async handleTikTokCallback(code) {
        const resp = await axios.post("https://open.tiktokapis.com/v2/oauth/token/", {
            client_key: config.TIKTOK_CLIENT_KEY,
            client_secret: config.TIKTOK_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: config.TIKTOK_REDIRECT_URI,
        }, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });

        const tokens = resp.data;

        // Get user info to get account name and ID
        const infoResp = await axios.get("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        const user = infoResp.data.data.user;

        const accountId = setSocialConnection(
            "tiktok",
            user.open_id,
            user.display_name,
            tokens.access_token,
            tokens.refresh_token,
            new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            JSON.stringify(user)
        );

        return accountId;
    }

    async refreshTikTokToken(account) {
        const expiresAt = new Date(account.expires_at).getTime();
        if (Date.now() > expiresAt - 60000) { // 1 dakikadan az kaldıysa
            const resp = await axios.post("https://open.tiktokapis.com/v2/oauth/token/", {
                client_key: config.TIKTOK_CLIENT_KEY,
                client_secret: config.TIKTOK_CLIENT_SECRET,
                grant_type: "refresh_token",
                refresh_token: account.refresh_token,
            }, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });

            const tokens = resp.data;
            setSocialConnection(
                "tiktok",
                account.platform_account_id,
                account.account_name,
                tokens.access_token,
                tokens.refresh_token,
                new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
                account.additional_data
            );
            return tokens.access_token;
        }
        return account.access_token;
    }

    // ── Instagram ──
    // Note: Instagram requires a multi-step flow or uses the Facebook Login.
    // This is a simplified version for IG Graph API.

    getInstagramAuthUrl() {
        const params = new URLSearchParams({
            client_id: config.INSTAGRAM_CLIENT_ID || config.FACEBOOK_APP_ID,
            redirect_uri: config.INSTAGRAM_REDIRECT_URI,
            scope: "instagram_basic,instagram_content_publish,pages_read_engagement,pages_show_list",
            response_type: "code",
        });
        return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    }

    async handleInstagramCallback(code) {
        // 1. Get user access token
        const tokenResp = await axios.get(`https://graph.facebook.com/v18.0/oauth/access_token`, {
            params: {
                client_id: config.INSTAGRAM_CLIENT_ID || config.FACEBOOK_APP_ID,
                client_secret: config.INSTAGRAM_CLIENT_SECRET || config.FACEBOOK_APP_SECRET,
                redirect_uri: config.INSTAGRAM_REDIRECT_URI,
                code: code
            }
        });
        const userToken = tokenResp.data.access_token;

        // 2. Get Long-Lived Token
        const longTokenResp = await axios.get(`https://graph.facebook.com/v18.0/oauth/access_token`, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: config.INSTAGRAM_CLIENT_ID || config.FACEBOOK_APP_ID,
                client_secret: config.INSTAGRAM_CLIENT_SECRET || config.FACEBOOK_APP_SECRET,
                fb_exchange_token: userToken
            }
        });
        const longToken = longTokenResp.data.access_token;

        // 3. Find Instagram Business accounts linked to Pages
        const pagesResp = await axios.get(`https://graph.facebook.com/v18.0/me/accounts`, {
            params: { access_token: longToken, fields: "instagram_business_account,name" }
        });

        const pages = pagesResp.data.data;
        const accounts = [];

        for (const page of pages) {
            if (page.instagram_business_account) {
                const igId = page.instagram_business_account.id;
                const igInfoResp = await axios.get(`https://graph.facebook.com/v18.0/${igId}`, {
                    params: { access_token: longToken, fields: "username,name" }
                });

                const igInfo = igInfoResp.data;
                const accountId = setSocialConnection(
                    "instagram",
                    igId,
                    igInfo.username || igInfo.name,
                    longToken,
                    null, // No refresh token for long-lived FB tokens (they last 60 days)
                    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                    JSON.stringify({ page_id: page.id, page_name: page.name })
                );
                accounts.push(accountId);
            }
        }

        return accounts;
    }
}

module.exports = new AuthService();
