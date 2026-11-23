# Security Policy

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report security issues privately using **GitHub Private Vulnerability Reporting** under the **Security** tab of this repository.

Please include:
- A clear description of the vulnerability
- Steps to reproduce
- Potential impact and any suggested remediation

We appreciate responsible disclosure and will respond as quickly as possible.

## Deployment Security Checklist

- Always change `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD`, and `SESSION_SECRET` in `.env` before exposing Vidoza to a network.
- Set `NODE_ENV=production` and serve behind HTTPS (e.g. Nginx/Caddy reverse proxy) so session cookies use the `Secure` flag.
- Never commit `.env`, SQLite `.db` files, or OAuth token files.
