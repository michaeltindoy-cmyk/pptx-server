FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y libreoffice libreoffice-impress fonts-liberation fonts-dejavu fonts-noto --no-install-recommends && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY server.js ./

EXPOSE 3001

CMD ["node", "server.js"]
