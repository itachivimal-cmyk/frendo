const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

const PORT = process.env.PORT || 3000;

let liveLogs = [];
let waitingQueue = [];
let activeUsersCount = 0;

io.on('connection', (socket) => {
  activeUsersCount++;
  io.emit('update_online_count', activeUsersCount);

  const clientIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  socket.on('find_partner', (data) => {
    socket.isCEO = data?.isCEO || false;

    const userDetail = {
      ip: clientIP,
      isCEO: socket.isCEO,
      connectedAt: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
    };
    liveLogs.unshift(userDetail);
    if (liveLogs.length > 50) liveLogs.pop();

    if (waitingQueue.length > 0) {
      const partnerSocket = waitingQueue.pop();
      const room = `room_${socket.id}_${partnerSocket.id}`;

      socket.join(room);
      partnerSocket.join(room);

      socket.currentRoom = room;
      partnerSocket.currentRoom = room;

      socket.emit('chat_start', { partnerIsCEO: partnerSocket.isCEO });
      partnerSocket.emit('chat_start', { partnerIsCEO: socket.isCEO });
    } else {
      waitingQueue.push(socket);
      socket.emit('waiting');
    }
  });

  socket.on('send_message', (data) => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('receive_message', {
        message: data.message,
        isCEO: socket.isCEO
      });
    }
  });

  socket.on('send_audio', (audioBlob) => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('receive_audio', {
        blob: audioBlob,
        isCEO: socket.isCEO
      });
    }
  });

  socket.on('typing', () => {
    if (socket.currentRoom) socket.to(socket.currentRoom).emit('partner_typing');
  });

  socket.on('stop_typing', () => {
    if (socket.currentRoom) socket.to(socket.currentRoom).emit('partner_stop_typing');
  });

  socket.on('skip_chat', () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('stranger_left');
      socket.leave(socket.currentRoom);
      socket.currentRoom = null;
    }
  });

  socket.on('disconnect', () => {
    activeUsersCount = Math.max(0, activeUsersCount - 1);
    io.emit('update_online_count', activeUsersCount);

    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('stranger_left');
    }
  });
});

app.get('/admin-clear-logs-secret', (req, res) => {
  liveLogs = [];
  res.redirect('/admin-logs-secret');
});

app.get('/admin-logs-secret', (req, res) => {
  let tableRows = '';
  if (liveLogs.length > 0) {
    tableRows = liveLogs.map((user, index) => {
      return '<tr>' +
        '<td>#' + (liveLogs.length - index) + '</td>' +
        '<td><code>' + user.ip + '</code></td>' +
        '<td>' + (user.isCEO ? '<span class="badge ceo">👑 CEO</span>' : '<span class="badge user">Stranger User</span>') + '</td>' +
        '<td>' + user.connectedAt + '</td>' +
      '</tr>';
    }).join('');
  } else {
    tableRows = '<tr><td colspan="4" style="text-align:center; color:#9CA3AF;">No active connections logged yet</td></tr>';
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Frendo Admin Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: #0B0F19; color: #fff; padding: 25px 15px; margin: 0; }
        .container { max-width: 850px; margin: 0 auto; }
        h2 { color: #D4AF37; margin-bottom: 20px; text-align: center; font-size: 24px; }
        .stats-grid { display: flex; gap: 15px; margin-bottom: 20px; justify-content: center; }
        .card { background: #111827; padding: 18px 25px; border-radius: 12px; border: 1px solid #374151; text-align: center; flex: 1; max-width: 200px; }
        .card h4 { margin: 0 0 6px 0; color: #9CA3AF; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
        .card p { margin: 0; font-size: 26px; font-weight: bold; color: #10B981; }
        .action-container { text-align: right; margin-bottom: 15px; }
        .btn-clear { background: #ef4444; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; text-decoration: none; font-size: 13px; display: inline-block; }
        table { width: 100%; border-collapse: collapse; background: #111827; border-radius: 12px; overflow: hidden; border: 1px solid #1F2937; }
        th, td { padding: 14px 16px; text-align: left; border-bottom: 1px solid #1F2937; font-size: 14px; }
        th { background: #1F2937; color: #D4AF37; font-size: 13px; text-transform: uppercase; }
        code { background: #0B0F19; padding: 4px 8px; border-radius: 6px; color: #60A5FA; font-size: 13px; }
        .badge { padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; }
        .badge.ceo { background: #D4AF37; color: #000; }
        .badge.user { background: #374151; color: #D1D5DB; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>📊 Frendo Live Monitor Dashboard</h2>
        <div class="stats-grid">
          <div class="card"><h4>Active Online</h4><p>${activeUsersCount}</p></div>
          <div class="card"><h4>Total Logs</h4><p>${liveLogs.length}</p></div>
          <div class="card"><h4>Waiting Queue</h4><p>${waitingQueue.length}</p></div>
        </div>
        <div class="action-container">
          <a href="/admin-clear-logs-secret" class="btn-clear" onclick="return confirm('Clear logs?')">🗑️ Clear All Logs</a>
        </div>
        <table>
          <thead>
            <tr><th>ID</th><th>IP Address</th><th>Role</th><th>Connected Time</th></tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `);
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>Frendo - Anonymous Random Chat App</title>
      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        html, body { height: 100dvh; width: 100vw; overflow: hidden; background-color: #0B0F19; color: #fff; }
        body.ceo-mode { background-color: #0D0B08; }

        .app-landing {
          width: 100vw;
          height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 40px 20px;
          background: radial-gradient(circle at top, #1E1B4B 0%, #0B0F19 80%);
          text-align: center;
          position: absolute;
          top: 0;
          left: 0;
          z-index: 10;
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .app-landing.hide { transform: translateY(-100%); }

        .logo-circle {
          width: 130px;
          height: 130px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FACC15, #EC4899);
          padding: 5px;
          box-shadow: 0 0 35px rgba(236, 72, 153, 0.5), 0 0 15px rgba(250, 204, 21, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 20px;
        }
        .logo-inner {
          width: 100%;
          height: 100%;
          background: #0B0F19;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .logo-text {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 2px;
          background: linear-gradient(135deg, #FACC15, #EC4899);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: blinkText 1.8s infinite alternate;
        }
        @keyframes blinkText {
          0% { opacity: 0.6; transform: scale(0.96); }
          100% { opacity: 1; transform: scale(1.05); }
        }

        .app-title-section h1 { font-size: 28px; font-weight: 800; color: #fff; margin-bottom: 8px; }
        .app-title-section p { font-size: 14px; color: #9CA3AF; max-width: 300px; margin: 0 auto; line-height: 1.5; }

        .details-box {
          background: rgba(17, 24, 39, 0.7);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 20px;
          width: 100%;
          max-width: 340px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .detail-item { display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: #D1D5DB; }
        .detail-item span.val { font-weight: bold; color: #10B981; }

        .btn-text-tab {
          width: 100%;
          max-width: 340px;
          background: linear-gradient(135deg, #2563EB, #1D4ED8);
          color: #fff;
          border: none;
          padding: 16px;
          border-radius: 16px;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          box-shadow: 0 10px 25px rgba(37, 99, 235, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: transform 0.2s;
        }
        .btn-text-tab:active { transform: scale(0.97); }

        .chat-card { width: 100vw; height: 100dvh; background: #0B0F19; display: flex; flex-direction: column; position: relative; transition: transform 0.2s ease; }
        body.ceo-mode .chat-card { background: #0D0B08; }

        .toast-notify {
          position: fixed;
          top: -60px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(239, 68, 68, 0.9);
          backdrop-filter: blur(8px);
          color: #fff;
          padding: 10px 20px;
          border-radius: 30px;
          font-size: 13px;
          font-weight: bold;
          box-shadow: 0 10px 25px rgba(239, 68, 68, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 9999;
          transition: top 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
        }
        .toast-notify.show { top: 20px; }

        @keyframes shakeAlert {
          0% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
          100% { transform: translateX(0); }
        }
        .shake { animation: shakeAlert 0.4s ease-in-out; }

        .header { padding: 12px 15px; background: #111827; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
        .header h3 { font-size: 15px; color: #fff; display: flex; align-items: center; gap: 8px; }
        body.ceo-mode .header h3 { color: #D4AF37; }
        
        .btn-back { background: #1F2937; border: 1px solid #374151; color: #9CA3AF; padding: 5px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; margin-right: 6px; }

        .online-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.3);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          color: #10B981;
          font-weight: bold;
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          background-color: #10B981;
          border-radius: 50%;
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          animation: pulse 1.6s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        .header-actions { display: flex; gap: 8px; }
        .btn-sm { border: none; padding: 6px 12px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px; }
        .btn-report { background: #374151; color: #f87171; }
        .btn-block { background: #991b1b; color: #fff; }

        .message-area { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; background: #0B0F19; }
        body.ceo-mode .message-area { background: #0D0B08; }

        .msg { padding: 12px 16px; border-radius: 16px; max-width: 80%; word-break: break-word; font-size: 15px; line-height: 1.4; }
        .msg.me { align-self: flex-end; background: #2563EB; color: #fff; border-bottom-right-radius: 4px; }
        body.ceo-mode .msg.me { background: linear-gradient(135deg, #B38728, #BF953F); color: #000; font-weight: bold; }
        
        .msg.stranger { align-self: flex-start; background: #1F2937; color: #fff; border-bottom-left-radius: 4px; }
        .msg.stranger.ceo-sender {
          background: linear-gradient(135deg, #BF953F, #FCF6BA, #B38728) !important;
          color: #000 !important;
          font-weight: bold;
          border: 1px solid #D4AF37;
        }

        audio { max-width: 200px; height: 35px; }
        .typing-indicator { display: none; padding: 4px 15px; font-size: 12px; color: #aaa; font-style: italic; flex-shrink: 0; }

        .action-bar { padding: 8px 15px; background: #111827; display: flex; gap: 10px; flex-shrink: 0; }
        .btn-action { flex: 1; border: none; padding: 10px; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 14px; }
        .btn-skip { background: #f59e0b; color: #000; }
        .btn-end { background: #ef4444; color: #fff; }
        .btn-start { background: #10b981; color: #fff; width: 100%; padding: 10px; }

        .input-area { padding: 10px 15px; background: #111827; border-top: 1px solid rgba(255,255,255,0.1); display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
        .input-area input { flex: 1; background: #1F2937; border: 1px solid #374151; border-radius: 12px; padding: 12px; color: #fff; outline: none; font-size: 16px; }
        
        .mic-btn { border: none; padding: 12px; border-radius: 12px; cursor: pointer; background: #374151; color: #fff; font-size: 16px; }
        .mic-btn.recording { background: #EF4444; }
        .send-btn { border: none; padding: 12px 16px; border-radius: 12px; font-weight: bold; cursor: pointer; background: #2563EB; color: #fff; font-size: 15px; }
        body.ceo-mode .send-btn { background: #D4AF37; color: #000; }
      </style>
    </head>
    <body id="bodyNode">

      <div id="landingScreen" class="app-landing">
        <div>
          <div class="logo-circle">
            <div class="logo-inner">
              <span class="logo-text">FRENDO</span>
            </div>
          </div>
        </div>

        <div class="app-title-section">
          <h1>Welcome to Frendo</h1>
          <p>Connect with random strangers anonymously. Safe, fast & private audio/text chat.</p>
        </div>

        <div class="details-box">
          <div class="detail-item">
            <span>Server Status</span>
            <span class="val" style="color: #10B981;">🟢 Online</span>
          </div>
          <div class="detail-item">
            <span>Active Users</span>
            <span class="val" id="landingOnlineCount">0 Online</span>
          </div>
          <div class="detail-item">
            <span>Privacy</span>
            <span style="color: #60A5FA;">100% Anonymous</span>
          </div>
        </div>

        <button class="btn-text-tab" onclick="openChatScreen()">
          💬 TEXT CHAT
        </button>
      </div>

      <div id="toast" class="toast-notify">
        <span>🚫</span> <span id="toastMsg">Stranger disconnected</span>
      </div>

      <div class="chat-card" id="chatCard">
        <div class="header">
          <div style="display: flex; align-items: center;">
            <button class="btn-back" onclick="closeChatScreen()">⬅ Back</button>
            <div>
              <h3 id="panelTitle"><img src="https://cdn-icons-png.flaticon.com/512/3820/3820107.png" width="20" height="20"> Frendo</h3>
              <span id="statusText" style="font-size: 11px; color: #9CA3AF;">Offline</span>
            </div>
          </div>

          <div class="online-badge">
            <span class="pulse-dot"></span>
            <span id="onlineCountText">0 Online</span>
          </div>

          <div class="header-actions" id="headerActions" style="display: none;">
            <button class="btn-sm btn-report" onclick="handleReport()">🚩</button>
            <button class="btn-sm btn-block" onclick="handleBlock()">🚫</button>
          </div>
        </div>

        <div class="message-area" id="messageArea"></div>
        <div class="typing-indicator" id="typingIndicator">Stranger is typing...</div>

        <div class="action-bar" id="actionBar">
          <button id="startBtn" class="btn-action btn-start" onclick="handleConnect()">Start New Chat</button>
          <button id="skipBtn" class="btn-action btn-skip" onclick="handleSkip()" style="display: none;">⏩ Skip Chat</button>
          <button id="endBtn" class="btn-action btn-end" onclick="handleEndChat()" style="display: none;">❌ End Chat</button>
        </div>

        <div class="input-area">
          <button id="micBtn" class="mic-btn" onclick="toggleRecord()" disabled>🎙️</button>
          <input type="text" id="msgInput" placeholder="Connect first..." disabled oninput="handleTyping()" />
          <button id="sendBtn" class="send-btn" onclick="sendMessage()" disabled>Send</button>
        </div>
      </div>

      <script>
        const socket = io();
        const urlParams = new URLSearchParams(window.location.search);
        const isCEO = urlParams.get('secret') === 'ceo123';

        let isConnected = false;
        let typingTimeout;
        let mediaRecorder;
        let audioChunks = [];
        let isRecording = false;

        const landingScreen = document.getElementById('landingScreen');
        const landingOnlineCount = document.getElementById('landingOnlineCount');
        const bodyNode = document.getElementById('bodyNode');
        const chatCard = document.getElementById('chatCard');
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toastMsg');
        const panelTitle = document.getElementById('panelTitle');
        const statusText = document.getElementById('statusText');
        const onlineCountText = document.getElementById('onlineCountText');
        const headerActions = document.getElementById('headerActions');
        const startBtn = document.getElementById('startBtn');
        const skipBtn = document.getElementById('skipBtn');
        const endBtn = document.getElementById('endBtn');
        const messageArea = document.getElementById('messageArea');
        const msgInput = document.getElementById('msgInput');
        const sendBtn = document.getElementById('sendBtn');
        const micBtn = document.getElementById('micBtn');
        const typingIndicator = document.getElementById('typingIndicator');

        function openChatScreen() {
          landingScreen.classList.add('hide');
        }

        function closeChatScreen() {
          if(isConnected) handleEndChat();
          landingScreen.classList.remove('hide');
        }

        socket.on('update_online_count', (count) => {
          onlineCountText.innerText = count + ' Online';
          landingOnlineCount.innerText = count + ' Online';
        });

        function showToast(text) {
          toastMsg.innerText = text;
          toast.classList.add('show');
          chatCard.classList.add('shake');
          setTimeout(() => { chatCard.classList.remove('shake'); }, 400);
          setTimeout(() => { toast.classList.remove('show'); }, 2500);
        }

        msgInput.addEventListener('focus', () => {
          setTimeout(() => {
            msgInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        });

        if (isCEO) {
          bodyNode.classList.add('ceo-mode');
          panelTitle.innerHTML = '👑 CEO DOMINANT';
        }

        function handleConnect() {
          socket.emit('find_partner', { isCEO });
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

        function resetState() {
          isConnected = false;
          statusText.innerText = 'Offline';
          startBtn.style.display = 'block';
          skipBtn.style.display = 'none';
          endBtn.style.display = 'none';
          headerActions.style.display = 'none';
          msgInput.disabled = true;
          sendBtn.disabled = true;
          micBtn.disabled = true;
          msgInput.placeholder = 'Connect first...';
          typingIndicator.style.display = 'none';
        }

        function handleTyping() {
          if (!isConnected) return;
          socket.emit('typing');
          clearTimeout(typingTimeout);
          typingTimeout = setTimeout(() => { socket.emit('stop_typing'); }, 1500);
        }

        async function toggleRecord() {
          if (!isConnected) return;
          if (!isRecording) {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              mediaRecorder = new MediaRecorder(stream);
              audioChunks = [];
              mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
              mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                socket.emit('send_audio', audioBlob);
                addAudioMessage(URL.createObjectURL(audioBlob), 'me');
              };
              mediaRecorder.start();
              isRecording = true;
              micBtn.classList.add('recording');
            } catch (err) { alert('Microphone access denied!'); }
          } else {
            mediaRecorder.stop();
            isRecording = false;
            micBtn.classList.remove('recording');
          }
        }

        socket.on('waiting', () => { statusText.innerText = 'Searching...'; });

        socket.on('chat_start', (data) => {
          isConnected = true;
          statusText.innerText = 'Connected';
          headerActions.style.display = 'flex';
          msgInput.disabled = false;
          sendBtn.disabled = false;
          micBtn.disabled = false;
          msgInput.placeholder = 'Type a message...';
          messageArea.innerHTML = '';
        });

        socket.on('partner_typing', () => { typingIndicator.style.display = 'block'; });
        socket.on('partner_stop_typing', () => { typingIndicator.style.display = 'none'; });

        socket.on('receive_message', (data) => {
          addMessage(data.message, 'stranger', data.isCEO);
          typingIndicator.style.display = 'none';
        });

        socket.on('receive_audio', (data) => {
          const blob = new Blob([data.blob], { type: 'audio/webm' });
          addAudioMessage(URL.createObjectURL(blob), 'stranger', data.isCEO);
        });

        socket.on('stranger_left', () => {
          showToast('Stranger left the chat!');
          resetState();
        });

        function sendMessage() {
          const text = msgInput.value.trim();
          if (text && isConnected) {
            socket.emit('send_message', { message: text });
            socket.emit('stop_typing');
            addMessage(text, 'me');
            msgInput.value = '';
          }
        }

        function addMessage(text, type, isSenderCEO = false) {
          const div = document.createElement('div');
          div.className = 'msg ' + type;

          if (isSenderCEO) {
            div.classList.add('ceo-sender');
            div.innerText = '👑 CEO: ' + text;
          } else {
            div.innerText = text;
          }

          messageArea.appendChild(div);
          messageArea.scrollTop = messageArea.scrollHeight;
        }

        function addAudioMessage(url, type, isSenderCEO = false) {
          const div = document.createElement('div');
          div.className = 'msg ' + type;

          if (isSenderCEO) {
            div.classList.add('ceo-sender');
            const label = document.createElement('div');
            label.innerText = '👑 CEO Voice Note:';
            div.appendChild(label);
          }

          const audio = document.createElement('audio');
          audio.controls = true;
          audio.src = url;
          div.appendChild(audio);

          messageArea.appendChild(div);
          messageArea.scrollTop = messageArea.scrollHeight;
        }
      </script>
    </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});