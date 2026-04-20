# Dar Jellaba

Static storefront ready for deployment on Northflank or Koyeb.

## Deploy on Northflank

1. Push this repository to GitHub.
2. In Northflank, create a new service from GitHub repository.
3. Select Dockerfile deployment (auto-detected from `Dockerfile`).
4. Set region (for example Europe West).
5. Deploy.

Suggested onboarding answers for Northflank are in `northflank-answers.txt`.

## Deploy on Koyeb

1. Create a new App from GitHub repository.
2. Choose Dockerfile deployment.
3. Keep default `PORT` (or set one manually).
4. Deploy.

## Runtime details

- Static files are served by Caddy.
- App listens on `PORT` provided by platform (fallback: `8080`).# thebeldishop
