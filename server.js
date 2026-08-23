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
let waitingQueueText = [];
let waitingQueueVideo = [];
let activeRooms = {};
let reportsList = [];

let analytics = {
  date: new Date().toDateString(),
  todayTotal: 0,
  textModeUsers: 0,
  videoModeUsers: 0,
  visitedIPs: new Set()
};

function checkDailyReset() {
  const currentDate = new Date().toDateString();
  if (analytics.date !== currentDate) {
    analytics.date = currentDate;
    analytics.todayTotal = 0;
    analytics.visitedIPs.clear();
  }
}

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
      <title>Frendo - 1-on-1 Chat & Video</title>
      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        
        :root {
          --bg-color: #0F172A;
          --card-bg: #1E293B;
          --text-color: #F8FAFC;
          --subtext-color: #94A3B8;
          --border-color: #334155;
          --input-bg: #0F172A;
        }

        body.light-theme {
          --bg-color: #F8FAFC;
          --card-bg: #FFFFFF;
          --text-color: #0F172A;
          --subtext-color: #64748B;
          --border-color: #E2E8F0;
          --input-bg: #F1F5F9;
        }

        html, body { height: 100dvh; width: 100vw; overflow: hidden; background: var(--bg-color); color: var(--text-color); }

        .theme-toggle {
          background: var(--card-bg); border: 1px solid var(--border-color); color: var(--text-color);
          width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-size: 14px; flex-shrink: 0;
        }

        .app-landing {
          width: 100vw; height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
          padding: 40px 24px; background: var(--bg-color); text-align: center;
          position: fixed; top: 0; left: 0; z-index: 100; transition: opacity 0.3s ease;
        }
        .app-landing.hide { opacity: 0; pointer-events: none; }

        .logo-glow {
          width: 85px; height: 85px; border-radius: 50%;
          background: linear-gradient(135deg, #2563EB, #4F46E5); padding: 3px;
          box-shadow: 0 10px 25px rgba(37, 99, 235, 0.25); display: flex; align-items: center; justify-content: center; margin-top: 10px;
        }
        .logo-inner { width: 100%; height: 100%; background: var(--bg-color); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .logo-text { font-size: 16px; font-weight: 900; letter-spacing: 2px; background: linear-gradient(135deg, #38BDF8, #818CF8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

        .mode-container { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 320px; }
        .btn-mode {
          width: 100%; padding: 16px; border-radius: 14px; border: none; font-size: 15px; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px; color: #FFF;
        }
        .btn-mode-text { background: linear-gradient(135deg, #2563EB, #1D4ED8); }
        .btn-mode-video { background: linear-gradient(135deg, #7C3AED, #6D28D9); }

        .chat-card { width: 100vw; height: 100dvh; background: var(--bg-color); display: flex; flex-direction: column; position: relative; }
        .header { padding: 10px 14px; background: var(--card-bg); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; z-index: 5; }
        .btn-back { background: var(--border-color); border: none; color: var(--text-color); padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; font-weight: 600; }
        
        .video-wrapper { flex: 1; position: relative; background: #000; display: none; width: 100%; height: 100%; overflow: hidden; }
        .video-wrapper.active { display: flex; align-items: center; justify-content: center; }
        #remoteVideo { width: 100%; height: 100%; object-fit: cover; }
        #localVideo { position: absolute; bottom: 12px; right: 12px; width: 100px; height: 140px; object-fit: cover; border-radius: 12px; border: 2px solid #38BDF8; background: #1E293B; z-index: 10; }
        
        .video-controls { position: absolute; top: 10px; left: 10px; display: flex; gap: 6px; z-index: 20; }
        .icon-btn { background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); color: #FFF; padding: 6px 10px; border-radius: 15px; font-size: 11px; cursor: pointer; }

        .message-area { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; background: var(--bg-color); }
        .msg { padding: 8px 12px; border-radius: 12px; max-width: 80%; word-break: break-word; font-size: 13px; }
        .msg.me { align-self: flex-end; background: #2563EB; color: #fff; border-bottom-right-radius: 2px; }
        .msg.stranger { align-self: flex-start; background: var(--card-bg); color: var(--text-color); border: 1px solid var(--border-color); border-bottom-left-radius: 2px; }

        .action-bar { padding: 10px 14px; background: var(--card-bg); border-top: 1px solid var(--border-color); display: flex; gap: 8px; }
        .btn-action { flex: 1; border: none; padding: 12px; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 13px; color: #FFF; }
        .btn-skip { background: #F59E0B; }
        .btn-end { background: #EF4444; }
        .btn-start { background: #10B981; width: 100%; }

        .input-area { padding: 10px 14px; background: var(--card-bg); border-top: 1px solid var(--border-color); display: flex; gap: 8px; }
        .input-area input { flex: 1; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; color: var(--text-color); outline: none; font-size: 13px; }
        .send-btn { border: none; padding: 10px 14px; border-radius: 10px; font-weight: 700; cursor: pointer; background: #2563EB; color: #fff; }
        
        .report-link { font-size: 11px; color: #EF4444; cursor: pointer; text-decoration: underline; margin-left: 6px; }
      </style>
    </head>
    <body>

      <!-- LANDING PAGE -->
      <div id="landingScreen" class="app-landing">
        <div style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 12px; font-weight: bold; color: #10B981;">🟢 Live 1-on-1 Chat</span>
          <button class="theme-toggle" onclick="toggleTheme()" id="themeBtnLanding">☀️</button>
        </div>

        <div>
          <div class="logo-glow" style="margin: 0 auto 12px;"><div class="logo-inner"><span class="logo-text">FRENDO</span></div></div>
          <h1 style="font-size: 22px; font-weight: 800;">Connect & Talk</h1>
          <p style="font-size: 12px; color: var(--subtext-color); margin-top: 4px;">Talk to strangers anonymously</p>
        </div>
        
        <div class="mode-container">
          <button class="btn-mode btn-mode-text" onclick="selectMode('text')">💬 TEXT CHAT</button>
          <button class="btn-mode btn-mode-video" onclick="selectMode('video')">📹 LIVE VIDEO CHAT</button>
        </div>

        <div style="font-size: 12px; color: var(--subtext-color);" id="landingOnlineText">0 Users Online</div>
      </div>

      <!-- CHAT INTERFACE -->
      <div class="chat-card">
        <div class="header">
          <button class="btn-back" onclick="closeChatScreen()">⬅ Back</button>
          <div style="text-align: center;">
            <h3 id="modeTitle" style="font-size:13px; font-weight:700;">Frendo Chat</h3>
            <span id="statusText" style="font-size: 11px; color: var(--subtext-color);">Offline</span>
            <span id="reportBtnHeader" class="report-link" onclick="handleReport()" style="display:none;">Report</span>
          </div>
          <button class="theme-toggle" onclick="toggleTheme()" id="themeBtnChat">☀️</button>
        </div>

        <div class="video-wrapper" id="videoWrapper">
          <div class="video-controls">
            <button class="icon-btn" onclick="toggleMuteAudio()" id="micBtn">🎙️ Mic</button>
            <button class="icon-btn" onclick="toggleMuteVideo()" id="camBtn">📹 Cam</button>
          </div>
          <video id="remoteVideo" autoplay playsinline></video>
          <video id="localVideo" autoplay playsinline muted></video>
        </div>

        <div class="message-area" id="messageArea"></div>

        <div class="action-bar">
          <button id="startBtn" class="btn-action btn-start" onclick="handleConnect()">Start Chat</button>
          <button id="skipBtn" class="btn-action btn-skip" onclick="handleSkip()" style="display: none;">⏩ Next</button>
          <button id="endBtn" class="btn-action btn-end" onclick="handleEndChat()" style="display: none;">❌ Stop</button>
        </div>

        <div class="input-area">
          <input type="text" id="msgInput" placeholder="Connect first..." disabled />
          <button id="sendBtn" class="send-btn" onclick="sendMessage()" disabled>Send</button>
        </div>
      </div>

      <script>
        const socket = io();
        const IS_CEO = ${isCEO};
        let currentMode = 'text';
        let isConnected = false;
        
        let localStream = null;
        let peerConnection = null;
        const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

        function toggleTheme() {
          document.body.classList.toggle('light-theme');
          const isLight = document.body.classList.contains('light-theme');
          document.getElementById('themeBtnLanding').innerText = isLight ? '🌙' : '☀️';
          document.getElementById('themeBtnChat').innerText = isLight ? '🌙' : '☀️';
        }

        function selectMode(mode) {
          currentMode = mode;
          document.getElementById('modeTitle').innerText = mode === 'video' ? '📹 Video Mode' : '💬 Text Mode';
          document.getElementById('landingScreen').classList.add('hide'); 
          socket.emit('set_user_mode', { mode });

          if (mode === 'video') {
            document.getElementById('videoWrapper').classList.add('active');
            initCamera();
          } else {
            document.getElementById('videoWrapper').classList.remove('active');
            stopVideoTracks();
          }
          resetState();
        }

        async function initCamera() {
          try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('localVideo').srcObject = localStream;
          } catch (err) {
            alert('Camera & Mic access required.');
          }
        }

        function closeChatScreen() { 
          stopVideoTracks();
          socket.emit('leave_queue');
          if(isConnected) handleEndChat(); 
          else resetState();
          document.getElementById('landingScreen').classList.remove('hide'); 
        }

        function stopVideoTracks() {
          if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
          }
          if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
          }
        }

        socket.on('update_online_count', (count) => {
          document.getElementById('landingOnlineText').innerText = count + ' Users Online';
        });

        function handleConnect() {
          clearChatHistory();
          socket.emit('find_partner', { isCEO: IS_CEO, mode: currentMode });
          document.getElementById('statusText').innerText = 'Searching...';
          document.getElementById('startBtn').style.display = 'none';
          document.getElementById('skipBtn').style.display = 'inline-block';
          document.getElementById('endBtn').style.display = 'inline-block';
          document.getElementById('reportBtnHeader').style.display = 'none';
        }

        function handleReport() {
          if (confirm('Report/Block partner?')) {
            socket.emit('report_or_block', { type: 'REPORT' });
            alert('User reported.');
            handleSkip();
          }
        }

        function handleSkip() { 
          if(peerConnection) peerConnection.close();
          socket.emit('skip_chat'); 
          resetState(); 
          handleConnect(); 
        }
        
        function handleEndChat() { 
          if(peerConnection) peerConnection.close();
          socket.emit('skip_chat'); 
          resetState(); 
        }

        function resetState() {
          isConnected = false;
          document.getElementById('statusText').innerText = 'Offline';
          document.getElementById('startBtn').style.display = 'block';
          document.getElementById('skipBtn').style.display = 'none';
          document.getElementById('endBtn').style.display = 'none';
          document.getElementById('reportBtnHeader').style.display = 'none';
          document.getElementById('msgInput').disabled = true;
          document.getElementById('sendBtn').disabled = true;
          document.getElementById('msgInput').placeholder = 'Connect first...';
          clearChatHistory();
          if(document.getElementById('remoteVideo')) document.getElementById('remoteVideo').srcObject = null;
        }

        function clearChatHistory() { document.getElementById('messageArea').innerHTML = ''; }

        socket.on('chat_start', async (data) => {
          isConnected = true;
          document.getElementById('statusText').innerText = 'Connected';
          document.getElementById('reportBtnHeader').style.display = 'inline';
          document.getElementById('msgInput').disabled = false;
          document.getElementById('sendBtn').disabled = false;
          document.getElementById('msgInput').placeholder = 'Type a message...';

          if (currentMode === 'video' && localStream) {
            createPeerConnection();
            if (data.initiator) {
              const offer = await peerConnection.createOffer();
              await peerConnection.setLocalDescription(offer);
              socket.emit('signal', { offer });
            }
          }
        });

        function createPeerConnection() {
          peerConnection = new RTCPeerConnection(rtcConfig);
          localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

          peerConnection.ontrack = (event) => {
            document.getElementById('remoteVideo').srcObject = event.streams[0];
          };

          peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit('signal', { candidate: event.candidate });
            }
          };
        }

        socket.on('signal', async (data) => {
          if (!peerConnection) createPeerConnection();

          if (data.offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { answer });
          } else if (data.answer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          } else if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        });

        socket.on('receive_message', (data) => { 
          addMessage(data.message, 'stranger'); 
        });

        socket.on('stranger_left', () => { 
          if(peerConnection) peerConnection.close();
          alert('Stranger left chat.');
          resetState(); 
        });

        function sendMessage() {
          const input = document.getElementById('msgInput');
          const text = input.value.trim();
          if (text && isConnected) {
            socket.emit('send_message', { message: text });
            addMessage(text, 'me');
            input.value = '';
          }
        }

        function addMessage(text, type) {
          const area = document.getElementById('messageArea');
          const div = document.createElement('div');
          div.className = 'msg ' + type;
          div.innerText = text;
          area.appendChild(div);
          area.scrollTop = area.scrollHeight;
        }

        function toggleMuteAudio() {
          if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            document.getElementById('micBtn').innerText = audioTrack.enabled ? '🎙️ Mic' : '🎙️ Muted';
          }
        }

        function toggleMuteVideo() {
          if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            videoTrack.enabled = !videoTrack.enabled;
            document.getElementById('camBtn').innerText = videoTrack.enabled ? '📹 Cam' : '📹 Off';
          }
        }
      </script>
    </body>
    </html>
  `;
  res.send(htmlContent);
}

// Admin Control Dashboard
app.get('/admin', (req, res) => {
  const key = req.query.key;
  if (key !== SECRET_PASS) return res.status(403).send("Forbidden");

  const adminHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Frendo Dashboard</title>
      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: sans-serif; }
        body { background: #0F172A; color: #FFF; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
        .stats { display: flex; gap: 10px; flex-wrap: wrap; }
        .card { background: #1E293B; padding: 12px; border-radius: 8px; flex: 1; border: 1px solid #334155; }
        .card h4 { color: #94A3B8; font-size: 11px; }
        .card p { font-size: 20px; font-weight: bold; color: #38BDF8; margin-top: 4px; }
      </style>
    </head>
    <body>
      <h2>⚡ Live System Status</h2>
      <div class="stats">
        <div class="card"><h4>ONLINE</h4><p id="uCount">0</p></div>
        <div class="card"><h4>VISITORS</h4><p id="tVisitors" style="color:#10B981;">0</p></div>
        <div class="card"><h4>TEXT MODE</h4><p id="textUsers" style="color:#3B82F6;">0</p></div>
        <div class="card"><h4>VIDEO MODE</h4><p id="videoUsers" style="color:#A855F7;">0</p></div>
      </div>
      <script>
        const socket = io();
        socket.on('connect', () => { socket.emit('admin_auth', { pass: "${SECRET_PASS}" }); });
        socket.on('admin_stats_update', (data) => {
          document.getElementById('uCount').innerText = data.activeUsers;
          document.getElementById('tVisitors').innerText = data.analytics.todayTotal;
          document.getElementById('textUsers').innerText = data.analytics.textModeUsers;
          document.getElementById('videoUsers').innerText = data.analytics.videoModeUsers;
        });
      </script>
    </body>
    </html>
  `;
  res.send(adminHtml);
});

// Socket.io Realtime Engine
io.on('connection', (socket) => {
  checkDailyReset();
  activeUsers++;

  const userIP = socket.handshake.address;
  if (!analytics.visitedIPs.has(userIP)) {
    analytics.visitedIPs.add(userIP);
    analytics.todayTotal++;
  }

  io.emit('update_online_count', activeUsers);
  broadcastAdminStats();

  socket.on('set_user_mode', (data) => {
    socket.userMode = data.mode;
    recalculateModeCounts();
    broadcastAdminStats();
  });

  socket.on('admin_auth', (data) => {
    if (data.pass === SECRET_PASS) socket.join('admin_room');
    broadcastAdminStats();
  });

  socket.on('report_or_block', (data) => {
    reportsList.push({ type: data.type, room: socket.currentRoom || 'N/A' });
    broadcastAdminStats();
  });

  socket.on('leave_queue', () => {
    waitingQueueText = waitingQueueText.filter((id) => id !== socket.id);
    waitingQueueVideo = waitingQueueVideo.filter((id) => id !== socket.id);
    broadcastAdminStats();
  });

  socket.on('find_partner', (data) => {
    const mode = data.mode || 'text';
    socket.userMode = mode;
    recalculateModeCounts();

    let queue = mode === 'video' ? waitingQueueVideo : waitingQueueText;
    queue = queue.filter(id => id !== socket.id);

    if (queue.length > 0) {
      const partnerId = queue.shift();
      const partner = io.sockets.sockets.get(partnerId);

      if (partner && partner.connected) {
        const roomId = `Room_${Math.floor(1000 + Math.random() * 9000)}`;

        socket.join(roomId);
        partner.join(roomId);
        socket.currentRoom = roomId;
        partner.currentRoom = roomId;

        activeRooms[roomId] = { mode, users: [socket.id, partner.id] };

        socket.emit('chat_start', { initiator: true });
        partner.emit('chat_start', { initiator: false });
      } else {
        queue.push(socket.id);
      }
    } else {
      queue.push(socket.id);
    }

    if (mode === 'video') waitingQueueVideo = queue;
    else waitingQueueText = queue;

    broadcastAdminStats();
  });

  socket.on('signal', (data) => {
    if (socket.currentRoom) socket.to(socket.currentRoom).emit('signal', data);
  });

  socket.on('send_message', (data) => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('receive_message', { message: data.message });
    }
  });

  socket.on('skip_chat', () => { removeFromRoom(socket); });

  socket.on('disconnect', () => {
    activeUsers = Math.max(0, activeUsers - 1);
    io.emit('update_online_count', activeUsers);
    waitingQueueText = waitingQueueText.filter((id) => id !== socket.id);
    waitingQueueVideo = waitingQueueVideo.filter((id) => id !== socket.id);
    removeFromRoom(socket);
    recalculateModeCounts();
  });
});

function recalculateModeCounts() {
  let text = 0; let video = 0;
  for (let [id, socket] of io.sockets.sockets) {
    if (socket.userMode === 'video') video++;
    else if (socket.userMode === 'text') text++;
  }
  analytics.textModeUsers = text;
  analytics.videoModeUsers = video;
}

function removeFromRoom(socket) {
  if (socket.currentRoom) {
    socket.to(socket.currentRoom).emit('stranger_left');
    socket.leave(socket.currentRoom);
    delete activeRooms[socket.currentRoom];
    socket.currentRoom = null;
    broadcastAdminStats();
  }
}

function broadcastAdminStats() {
  io.to('admin_room').emit('admin_stats_update', {
    activeUsers,
    analytics: {
      todayTotal: analytics.todayTotal,
      textModeUsers: analytics.textModeUsers,
      videoModeUsers: analytics.videoModeUsers
    }
  });
}

server.listen(PORT, HOST, () => console.log(`Server listening live on http://${HOST}:${PORT}`));