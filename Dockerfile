# ─────────────────────────────────────────────────────────────────────────────
# Dockerfile — PPTX Conversion Server
# Installs Node.js + LibreOffice on Ubuntu
# Deploy to Railway / Render / any Docker host
# ─────────────────────────────────────────────────────────────────────────────

FROM ubuntu:22.04

# Avoid interactive prompts during apt install
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

# 1. Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    libreoffice \
    libreoffice-impress \
    fonts-liberation \
    fonts-dejavu \
    fonts-noto \
    fonts-noto-cjk \
    --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 2. Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean

# 3. Set working directory
WORKDIR /app

# 4. Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# 5. Copy server code
COPY server.js ./

# 6. Expose port
EXPOSE 3001

# 7. Start server
CMD ["node", "server.js"]
