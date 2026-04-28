FROM oven/bun:1-alpine

WORKDIR /app

# 复制 shared 包（作为本地依赖）
COPY packages/shared packages/shared

# 复制 server 包
COPY packages/server packages/server

WORKDIR /app/packages/server

# 把 workspace 引用改为相对路径后安装
RUN sed -i 's/"shared": "workspace:\*"/"shared": "file:..\/shared"/' package.json && bun install

EXPOSE 9527

CMD ["bun", "run", "start"]
