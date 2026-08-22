const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// Secret Passwords
const SECRET_PASS = "xiaoqi143@";

let activeUsers = 0;
let waitingQueue = [];
let activeRooms = {}; 

app.use(express.json());

// Main App Route (Normal User)
app.get('/', (req, res) => { renderApp(res, false); });

// Secret CEO Entrance Route (Protected with Password)
app.get('/ceo', (req, res) => { 
  const pass = req.query.pass;
  if (pass === SECRET_PASS) {
    renderApp(res, true); 
  } else {
    renderApp(res, false); // Wrong/No pass means Normal User Mode
  }
});

function renderApp(res, isCEO) {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>Frendo - Anonymous Chat</title>
      <script src="/socket.io/socket.io.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        html, body { height: 100dvh; width: 100vw; overflow: hidden; background-color: #0B0F19; color: #fff; }

        body.ceo-entrance-active {
          box-shadow: inset 0 0 35px #EAB308, inset 0 0 15px #EAB308;
          transition: box-shadow 0.5s ease-in-out;
        }

        #fadeOverlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh;
          background: rgba(5, 7, 12, 0.88); z-index: 999; display: none;
          pointer-events: none; opacity: 0; transition: opacity 0.5s ease;
        }
        #fadeOverlay.active { display: block; opacity: 1; }

        #customToast {
          position: fixed; top: -70px; left: 50%; transform: translateX(-50%);
          background: rgba(239, 68, 68, 0.95); backdrop-filter: blur(8px);
          color: white; padding: 12px 24px; border-radius: 30px; font-weight: bold;
          font-size: 13px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 1000;
          transition: top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.2);
        }
        #customToast.show { top: 20px; }
        
        .app-landing {
          width: 100vw; height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
          padding: 40px 20px; background: radial-gradient(circle at top, #1E1B4B 0%, #0B0F19 80%); text-align: center;
          position: absolute; top: 0; left: 0; z-index: 10; transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .app-landing.hide { transform: translateY(-100%); }

        .logo-circle {
          width: 110px; height: 110px; border-radius: 50%; background: linear-gradient(135deg, #FACC15, #EC4899);
          padding: 4px; box-shadow: 0 0 30px rgba(236, 72, 153, 0.5); display: flex; align-items: center; justify-content: center; margin-top: 10px;
        }
        .logo-inner { width: 100%; height: 100%; background: #0B0F19; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .logo-text { font-size: 18px; font-weight: 900; letter-spacing: 2px; background: linear-gradient(135deg, #FACC15, #EC4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

        .app-title-section h1 { font-size: 24px; font-weight: 800; color: #fff; margin-bottom: 6px; }
        .app-title-section p { font-size: 13px; color: #9CA3AF; max-width: 280px; margin: 0 auto; }

        .details-box {
          background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 18px; padding: 16px; width: 100%; max-width: 320px; display: flex; flex-direction: column; gap: 10px;
        }
        .detail-item { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #D1D5DB; }
        .detail-item span.val { font-weight: bold; color: #10B981; }

        .btn-text-tab {
          width: 100%; max-width: 320px; background: linear-gradient(135deg, #2563EB, #1D4ED8); color: #fff; border: none;
          padding: 15px; border-radius: 14px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 8px 20px rgba(37, 99, 235, 0.4);
        }

        .chat-card { width: 100vw; height: 100dvh; background: #0B0F19; display: flex; flex-direction: column; position: relative; }
        .header { padding: 12px 15px; background: #111827; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; }
        .btn-back { background: #1F2937; border: 1px solid #374151; color: #9CA3AF; padding: 5px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; margin-right: 6px; }
        
        .online-badge { display: flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.15); padding: 4px 10px; border-radius: 20px; font-size: 12px; color: #10B981; font-weight: bold; }
        .pulse-dot { width: 8px; height: 8px; background-color: #10B981; border-radius: 50%; }

        .message-area { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; background: #0B0F19; }
        .msg { padding: 10px 14px; border-radius: 14px; max-width: 80%; word-break: break-word; font-size: 14px; }
        .msg.me { align-self: flex-end; background: #2563EB; color: #fff; border-bottom-right-radius: 2px; }
        .msg.stranger { align-self: flex-start; background: #1F2937; color: #fff; border-bottom-left-radius: 2px; }

        .action-bar { padding: 8px 15px; background: #111827; display: flex; gap: 8px; }
        .btn-action { flex: 1; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; }
        .btn-skip { background: #f59e0b; color: #000; }
        .btn-end { background: #ef4444; color: #fff; }
        .btn-start { background: #10b981; color: #fff; width: 100%; }

        .input-area { padding: 10px 15px; background: #111827; border-top: 1px solid rgba(255,255,255,0.1); display: flex; gap: 8px; align-items: center; }
        .input-area input { flex: 1; background: #1F2937; border: 1px solid #374151; border-radius: 10px; padding: 10px; color: #fff; outline: none; font-size: 15px; }
        .send-btn { border: none; padding: 10px 14px; border-radius: 10px; font-weight: bold; cursor: pointer; background: #2563EB; color: #fff; }
      </style>
    </head>
    <body>

      <div id="fadeOverlay"></div>
      <div id="customToast"><span>⚠️ Stranger Disconnected!</span></div>

      <div id="landingScreen" class="app-landing">
        <div>
          <div class="logo-circle"><div class="logo-inner"><span class="logo-text">FRENDO</span></div></div>
        </div>
        <div class="app-title-section">
          <h1>Welcome to Frendo</h1>
          <p>Connect with random strangers anonymously.</p>
        </div>
        <div class="details-box">
          <div class="detail-item"><span>Security</span><span class="val" style="color:#60A5FA;">🔒 Encrypted P2P</span></div>
          <div class="detail-item"><span>Server Status</span><span class="val">🟢 Live</span></div>
          <div class="detail-item"><span>Active Users</span><span class="val" id="landingOnlineCount">0 Online</span></div>
        </div>
        <button class="btn-text-tab" onclick="openChatScreen()">💬 START CHATTING</button>
      </div>

      <div class="chat-card">
        <div class="header">
          <div style="display: flex; align-items: center;">
            <button class="btn-back" onclick="closeChatScreen()">⬅ Back</button>
            <div>
              <h3>Frendo Chat ${isCEO ? '<span style="font-size:10px; background:#EAB308; color:#000; padding:2px 6px; border-radius:4px; margin-left:4px;">👑 CEO</span>' : ''}</h3>
              <span id="statusText" style="font-size: 11px; color: #9CA3AF;">Offline</span>
            </div>
          </div>
          <div class="online-badge"><span class="pulse-dot"></span><span id="onlineCountText">0 Online</span></div>
        </div>

        <div class="message-area" id="messageArea"></div>

        <div class="action-bar">
          <button id="startBtn" class="btn-action btn-start" onclick="handleConnect()">Start New Chat</button>
          <button id="skipBtn" class="btn-action btn-skip" onclick="handleSkip()" style="display: none;">⏩ Skip</button>
          <button id="endBtn" class="btn-action btn-end" onclick="handleEndChat()" style="display: none;">❌ End</button>
        </div>

        <div class="input-area">
          <input type="text" id="msgInput" placeholder="Connect first..." disabled />
          <button id="sendBtn" class="send-btn" onclick="sendMessage()" disabled>Send</button>
        </div>
      </div>

      <script>
        const socket = io();
        const IS_CEO = ${isCEO};
        let isConnected = false;

        const landingScreen = document.getElementById('landingScreen');
        const landingOnlineCount = document.getElementById('landingOnlineCount');
        const statusText = document.getElementById('statusText');
        const onlineCountText = document.getElementById('onlineCountText');
        const startBtn = document.getElementById('startBtn');
        const skipBtn = document.getElementById('skipBtn');
        const endBtn = document.getElementById('endBtn');
        const messageArea = document.getElementById('messageArea');
        const msgInput = document.getElementById('msgInput');
        const sendBtn = document.getElementById('sendBtn');
        const customToast = document.getElementById('customToast');
        const fadeOverlay = document.getElementById('fadeOverlay');

        function openChatScreen() { landingScreen.classList.add('hide'); }
        function closeChatScreen() { if(isConnected) handleEndChat(); landingScreen.classList.remove('hide'); }

        socket.on('update_online_count', (count) => {
          onlineCountText.innerText = count + ' Online';
          landingOnlineCount.innerText = count + ' Online';
        });

        function handleConnect() {
          socket.emit('find_partner', { isCEO: IS_CEO });
          statusText.innerText = 'Searching...';
          startBtn.style.display = 'none';
          skipBtn.style.display = 'inline-block';
          endBtn.style.display = 'inline-block';
        }

        function handleSkip() { socket.emit('skip_chat'); resetState(); handleConnect(); }
        function handleEndChat() { socket.emit('skip_chat'); resetState(); }

        function showToast(msg) {
          customToast.querySelector('span').innerText = msg;
          customToast.classList.add('show');
          setTimeout(() => { customToast.classList.remove('show'); }, 3000);
        }

        function resetState() {
          isConnected = false;
          statusText.innerText = 'Offline';
          startBtn.style.display = 'block';
          skipBtn.style.display = 'none';
          endBtn.style.display = 'none';
          msgInput.disabled = true;
          sendBtn.disabled = true;
          msgInput.placeholder = 'Connect first...';
          document.body.classList.remove('ceo-entrance-active');
          fadeOverlay.classList.remove('active');
        }

        socket.on('waiting', () => { statusText.innerText = 'Searching...'; });

        socket.on('chat_start', (data) => {
          isConnected = true;
          statusText.innerText = 'Connected';
          msgInput.disabled = false;
          sendBtn.disabled = false;
          msgInput.placeholder = 'Type a message...';
          messageArea.innerHTML = '';

          if (data && data.hasCEO) {
            triggerCEOEntrance();
          }
        });

        function triggerCEOEntrance() {
          document.body.classList.add('ceo-entrance-active');
          fadeOverlay.classList.add('active');

          const duration = 8 * 1000;
          const animationEnd = Date.now() + duration;

          const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) {
              clearInterval(interval);
              fadeOverlay.classList.remove('active');
              document.body.classList.remove('ceo-entrance-active');
              return;
            }

            confetti({
              particleCount: 12,
              startVelocity: 45,
              spread: 360,
              origin: { x: Math.random(), y: Math.random() * 0.4 + 0.6 },
              colors: ['#EAB308', '#EC4899', '#38BDF8', '#ffffff']
            });
          }, 300);
        }

        socket.on('receive_message', (data) => { addMessage(data.message, 'stranger'); });
        
        socket.on('stranger_left', () => { 
          showToast('⚠️ Stranger disconnected!'); 
          resetState(); 
        });

        function sendMessage() {
          const text = msgInput.value.trim();
          if (text && isConnected) {
            socket.emit('send_message', { message: text });
            addMessage(text, 'me');
            msgInput.value = '';
          }
        }

        function addMessage(text, type) {
          const div = document.createElement('div');
          div.className = 'msg ' + type;
          div.innerText = text;
          messageArea.appendChild(div);
          messageArea.scrollTop = messageArea.scrollHeight;
        }
      </script>
    </body>
    </html>
  `);
}

// Protected Admin Route
app.get('/admin', (req, res) => {
  const key = req.query.key;
  if (key !== SECRET_PASS) return res.status(403).send("Forbidden: Invalid Password");

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Frendo Admin Control Center</title>
      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: sans-serif; }
        body { background: #0f172a; color: #fff; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
        .stats { display: flex; gap: 15px; }
        .card { background: #1e293b; padding: 15px 25px; border-radius: 10px; border: 1px solid #334155; }
        .card h4 { color: #94a3b8; font-size: 12px; }
        .card p { font-size: 24px; font-weight: bold; color: #38bdf8; }
        
        .main-container { display: flex; gap: 20px; height: 420px; }
        .box { flex: 1; background: #1e293b; border-radius: 10px; padding: 15px; overflow-y: auto; border: 1px solid #334155; }
        .spy-box { flex: 2; background: #000; border-radius: 10px; padding: 15px; display: flex; flex-direction: column; border: 1px solid #334155; }
        
        .room-item { background: #334155; padding: 10px; border-radius: 6px; margin-bottom: 8px; cursor: pointer; display: flex; justify-content: space-between; }
        .room-item:hover { background: #0284c7; }
        .room-item.active { background: #0284c7; font-weight: bold; }
        
        #chatStream { flex: 1; overflow-y: auto; font-family: monospace; font-size: 13px; color: #22c55e; margin-top: 10px; border-top: 1px solid #222; padding-top: 10px; }
        
        table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
        th, td { padding: 8px 10px; border-bottom: 1px solid #334155; }
        th { color: #94a3b8; }
      </style>
    </head>
    <body>
      <h2>⚡ Scalable Admin Control Center</h2>
      
      <div class="stats">
        <div class="card"><h4>ONLINE USERS</h4><p id="uCount">0</p></div>
        <div class="card"><h4>ACTIVE ROOMS</h4><p id="rCount">0</p></div>
        <div class="card"><h4>WAITING IN QUEUE</h4><p id="qCount" style="color:#EAB308;">0</p></div>
      </div>

      <div class="main-container">
        <div class="box">
          <h3 style="margin-bottom:12px; font-size: 14px;">Active Chat Rooms (Spy)</h3>
          <div id="roomContainer"><i>No active rooms...</i></div>
        </div>

        <div class="spy-box">
          <h3 id="spyTitle" style="font-size:14px;">Target: None Selected</h3>
          <div id="chatStream">Select a room from left side to monitor...</div>
        </div>
      </div>

      <div class="box" style="height:200px;">
        <h3 style="margin-bottom:10px; font-size: 14px; color:#EAB308;">⏳ Waiting for Connection Queue</h3>
        <table>
          <thead>
            <tr>
              <th>Socket ID</th>
              <th>Status</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody id="queueTableBody">
            <tr><td colspan="3"><i>No users waiting in queue...</i></td></tr>
          </tbody>
        </table>
      </div>

      <script>
        const socket = io();
        socket.emit('admin_auth', { pass: "${SECRET_PASS}" });

        let selectedRoom = null;

        socket.on('admin_stats_update', (data) => {
          document.getElementById('uCount').innerText = data.activeUsers;
          document.getElementById('rCount').innerText = data.roomCount;
          document.getElementById('qCount').innerText = data.queue.length;
          renderRooms(data.rooms);
          renderQueue(data.queue);
        });

        function renderRooms(rooms) {
          const container = document.getElementById('roomContainer');
          if (rooms.length === 0) { container.innerHTML = '<i>No active rooms...</i>'; return; }
          container.innerHTML = '';
          rooms.forEach(roomId => {
            const div = document.createElement('div');
            div.className = 'room-item ' + (selectedRoom === roomId ? 'active' : '');
            div.innerText = '🔒 ' + roomId;
            div.onclick = () => selectRoom(roomId);
            container.appendChild(div);
          });
        }

        function renderQueue(queue) {
          const tbody = document.getElementById('queueTableBody');
          if (queue.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3"><i>No users waiting in queue...</i></td></tr>';
            return;
          }
          tbody.innerHTML = '';
          queue.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + item.id + '</td><td><span style="color:#EAB308">Searching...</span></td><td>' + (item.isCEO ? '👑 CEO' : 'User') + '</td>';
            tbody.appendChild(tr);
          });
        }

        function selectRoom(roomId) {
          selectedRoom = roomId;
          document.getElementById('spyTitle').innerText = 'Spying Target: ' + roomId;
          document.getElementById('chatStream').innerHTML = '<i>-- Connected to ' + roomId + ' --</i><br>';
          socket.emit('set_spy_target', roomId);
        }

        socket.on('admin_chat_log', (data) => {
          if (data.roomId === selectedRoom) {
            const stream = document.getElementById('chatStream');
            stream.innerHTML += '<div><b>[' + data.roomId + ']:</b> ' + data.msg + '</div>';
            stream.scrollTop = stream.scrollHeight;
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Socket logic
io.on('connection', (socket) => {
  activeUsers++;
  io.emit('update_online_count', activeUsers);
  broadcastAdminStats();

  socket.on('admin_auth', (data) => {
    if (data.pass === SECRET_PASS) {
      socket.isAdmin = true;
      socket.join('admin_room');
    }
  });

  socket.on('find_partner', (data) => {
    socket.isCEO = data && data.isCEO;

    if (waitingQueue.length > 0) {
      const partner = waitingQueue.pop();
      const roomId = `room_${socket.id.substring(0, 4)}_${partner.id.substring(0, 4)}`;
      const hasCEO = socket.isCEO || partner.isCEO;

      socket.join(roomId);
      partner.join(roomId);
      socket.currentRoom = roomId;
      partner.currentRoom = roomId;

      activeRooms[roomId] = true;

      socket.emit('chat_start', { hasCEO });
      partner.emit('chat_start', { hasCEO });
    } else {
      waitingQueue.push({ id: socket.id, socket: socket, isCEO: socket.isCEO });
      socket.emit('waiting');
    }
    broadcastAdminStats();
  });

  socket.on('send_message', (data) => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('receive_message', data);
      
      io.to('admin_room').emit('admin_chat_log', {
        roomId: socket.currentRoom,
        msg: data.message
      });
    }
  });

  socket.on('skip_chat', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('stranger_left');
      socket.leave(socket.currentRoom);
      delete activeRooms[socket.currentRoom];
      socket.currentRoom = null;
    }
    broadcastAdminStats();
  });

  socket.on('disconnect', () => {
    activeUsers = Math.max(0, activeUsers - 1);
    io.emit('update_online_count', activeUsers);
    waitingQueue = waitingQueue.filter((item) => item.id !== socket.id);
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('stranger_left');
      delete activeRooms[socket.currentRoom];
    }
    broadcastAdminStats();
  });
});

function broadcastAdminStats() {
  io.to('admin_room').emit('admin_stats_update', {
    activeUsers,
    roomCount: Object.keys(activeRooms).length,
    rooms: Object.keys(activeRooms),
    queue: waitingQueue.map(item => ({ id: item.id, isCEO: item.isCEO }))
  });
}

server.listen(PORT, HOST, () => console.log(`Server listening live on http://${HOST}:${PORT}`));