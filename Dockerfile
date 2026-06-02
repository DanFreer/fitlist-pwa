FROM node:20-alpine

# bcrypt needs native build tools on Alpine
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .
RUN node scripts/generate-icons.js

RUN test -d node_modules/dotenv

EXPOSE 4173

CMD ["npm", "start"]
