FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

EXPOSE 4000
ENV PORT=4000

CMD ["node", "./bin/cli.mjs", "--no-open"]
