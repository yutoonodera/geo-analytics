FROM node:20-alpine

WORKDIR /app

# nuxi を使えるようにする
RUN npm install -g nuxi

# 起動時にNuxtが無ければ作る
CMD sh -c "\
  if [ ! -f package.json ]; then \
    nuxi init . && npm install; \
  fi && \
  npm run dev \
"

