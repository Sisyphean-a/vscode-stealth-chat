const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ================= 配置区 =================
// 你的 Gotify 地址 (注意：如果是本机 Docker，用 localhost 即可)
const GOTIFY_URL = 'http://localhost:8080/message';
// 刚才获取的 Token
const GOTIFY_TOKEN = 'Ahc7pv3uyv4rtv9'; 
const CHAT_SECRET = 'MySecretKey2026';
// =========================================

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token === CHAT_SECRET) {
    next(); // 密码正确，放行
  } else {
    console.log(`拦截到一个非法连接: ${socket.id}`);
    next(new Error("你是谁？暗号不对！")); // 密码错误，踢掉
  }
});

// 提供一个最简单的手机端网页
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: sans-serif; padding: 20px; background: #222; color: #fff; }
            #messages { list-style-type: none; padding: 0; height: 300px; overflow-y: scroll; border: 1px solid #444; }
            #messages li { padding: 5px 10px; margin-bottom: 5px; background: #333; border-radius: 5px; }
            input { width: 70%; padding: 10px; border: none; }
            button { width: 25%; padding: 10px; background: #007acc; border: none; color: white; }
        </style>
      </head>
      <body>
        <h3>隐蔽聊天室</h3>
        <ul id="messages"></ul>
        <form id="form" action="">
          <input id="input" autocomplete="off" /><button>发送</button>
        </form>
        <script src="/socket.io/socket.io.js"></script>
        <script>
          var socket = io({
 	 	auth: {
    			token: "MySecretKey2026" // 必须和服务器一致
  		}
	  });
          var form = document.getElementById('form');
          var input = document.getElementById('input');
          var messages = document.getElementById('messages');

          form.addEventListener('submit', function(e) {
            e.preventDefault();
            if (input.value) {
              // 手机发出的消息标记为 'mobile'
              socket.emit('chat message', { text: input.value, source: 'mobile' });
              input.value = '';
            }
          });

          socket.on('chat message', function(msg) {
            var item = document.createElement('li');
            // 显示消息来源
            item.textContent = (msg.source === 'mobile' ? '我: ' : 'VSCode: ') + msg.text;
            messages.appendChild(item);
            window.scrollTo(0, document.body.scrollHeight);
          });
        </script>
      </body>
    </html>
  `);
});

// WebSocket 连接处理
io.on('connection', (socket) => {
  console.log('有设备连接进来了');

  socket.on('chat message', (msg) => {
    // 1. 广播给所有人（VS Code 和 手机网页 都能收到）
    io.emit('chat message', msg);

    // 2. 如果消息是 VSCode 发来的，不仅要广播，还要推送到 Gotify
    // 这样手机锁屏时也能收到震动提醒
    if (msg.source === 'vscode') {
        console.log("检测到 VSCode 消息，正在推送给 Gotify...");
        axios.post(`${GOTIFY_URL}?token=${GOTIFY_TOKEN}`, {
            title: "新回复",
            message: msg.text,
            priority: 8, // 强提醒
            extras: {
                "android::action": {
                    // 点击通知直接跳转到这个网页
                    "onReceive": { "intentUrl": "http://你的服务器IP:3000" } 
                }
            }
        }).catch(err => console.error("Gotify 推送失败:", err.message));
    }
  });
});

server.listen(3000, () => {
  console.log('聊天服务器已启动: http://localhost:3000');
});