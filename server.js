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
let adminLogs = {};

let analytics = {
  date: new Date().toDateString(),
  todayTotal: 0,
  mobileUsers: 0,
  desktopUsers: 0,
  textModeUsers: 0,
  videoModeUsers: 0,
  visitedIPs: new Set()
};

function checkDailyReset() {
  const currentDate = new Date().toDateString();
  if (analytics.date !== currentDate) {
    analytics.date = currentDate;
    analytics.todayTotal = 0;
    analytics.mobileUsers = 0;
    analytics.desktopUsers = 0;
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
      <title>Frendo - Live Chat & Video</title>
      <script src="/socket.io/socket.io.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        html, body { height: 100dvh; width: 100vw; overflow: hidden; background: #0F172A; color: #F8FAFC; }

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
          padding: 40px 24px; background: linear-gradient(180deg, #1E293B 0%, #0F172A 100%); text-align: center;
          position: absolute; top: 0; left: 0; z-index: 10; transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .app-landing.hide { transform: translateY(-100%); }

        .logo-glow {
          width: 90px; height: 90px; border-radius: 50%;
          background: linear-gradient(135deg, #2563EB, #4F46E5); padding: 3px;
          box-shadow: 0 10px 30px rgba(37, 99, 235, 0.25); display: flex; align-items: center; justify-content: center; margin-top: 10px;
        }
        .logo-inner { width: 100%; height: 100%; background: #0F172A; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .logo-text { font-size: 18px; font-weight: 900; letter-spacing: 2px; background: linear-gradient(135deg, #38BDF8, #818CF8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

        .app-title-section h1 { font-size: 24px; font-weight: 800; color: #F8FAFC; margin-bottom: 6px; }
        .app-title-section p { font-size: 13px; color: #94A3B8; max-width: 280px; margin: 0 auto; }

        .mode-container { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 320px; }
        .btn-mode {
          width: 100%; padding: 16px; border-radius: 16px; border: 1px solid #334155; font-size: 15px; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px; transition: transform 0.2s; color: #FFF;
        }
        .btn-mode-text { background: linear-gradient(135deg, #2563EB, #1D4ED8); box-shadow: 0 8px 20px rgba(37, 99, 235, 0.3); }
        .btn-mode-video { background: linear-gradient(135deg, #7C3AED, #6D28D9); box-shadow: 0 8px 20px rgba(124, 58, 237, 0.3); }
        .btn-mode:active { transform: scale(0.98); }

        .chat-card { width: 100vw; height: 100dvh; background: #0F172A; display: flex; flex-direction: column; position: relative; }
        .header { padding: 12px 18px; background: #1E293B; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; z-index: 5; }
        .btn-back { background: #334155; border: none; color: #F8FAFC; padding: 6px 12px; border-radius: 10px; font-size: 12px; cursor: pointer; font-weight: 600; }
        
        .video-wrapper { flex: 1; position: relative; background: #020617; display: none; width: 100%; height: 100%; overflow: hidden; }
        .video-wrapper.active { display: flex; }
        #remoteVideo { width: 100%; height: 100%; object-fit: cover; }
        #localVideo { position: absolute; bottom: 15px; right: 15px; width: 110px; height: 150px; object-fit: cover; border-radius: 12px; border: 2px solid #38BDF8; box-shadow: 0 8px 20px rgba(0,0,0,0.5); background: #1E293B; }
        
        .video-controls { position: absolute; top: 15px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; z-index: 20; }
        .icon-btn { background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.2); color: #FFF; padding: 8px 12px; border-radius: 20px; font-size: 12px; cursor: pointer; backdrop-filter: blur(5px); }

        .message-area { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; background: #0F172A; }
        .msg { padding: 10px 14px; border-radius: 16px; max-width: 80%; word-break: break-word; font-size: 14px; }
        .msg.me { align-self: flex-end; background: #2563EB; color: #fff; border-bottom-right-radius: 4px; }
        .msg.me-ceo { align-self: flex-end; background: #D97706; color: #FFF; font-weight: bold; border-bottom-right-radius: 4px; }
        .msg.stranger { align-self: flex-start; background: #1E293B; color: #F8FAFC; border: 1px solid #334155; border-bottom-left-radius: 4px; }
        .msg.ceo-msg { align-self: flex-start; background: #D97706; color: #FFF; font-weight: bold; border-bottom-left-radius: 4px; }

        .action-bar { padding: 10px 18px; background: #1E293B; border-top: 1px solid #334155; display: flex; gap: 10px; }
        .btn-action { flex: 1; border: none; padding: 12px; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 13px; }
        .btn-skip { background: #F59E0B; color: #FFF; }
        .btn-end { background: #EF4444; color: #FFF; }
        .btn-start { background: #10B981; color: #FFF; width: 100%; }

        .input-area { padding: 10px 18px; background: #1E293B; border-top: 1px solid #334155; display: flex; gap: 10px; }
        .input-area input { flex: 1; background: #0F172A; border: 1px solid #334155; border-radius: 12px; padding: 10px 14px; color: #FFF; outline: none; font-size: 14px; }
        .send-btn { border: none; padding: 10px 16px; border-radius: 12px; font-weight: 700; cursor: pointer; background: #2563EB; color: #fff; }
        .send-btn:disabled { opacity: 0.5; }
      </style>
    </head>
    <body>

      <div id="customToast"><span>⚠️ Stranger Disconnected!</span></div>
      <div id="ceoToast"><span>👑 Connected with CEO! 👑</span></div>

      <div id="landingScreen" class="app-landing">
        <div class="logo-glow"><div class="logo-inner"><span class="logo-text">FRENDO</span></div></div>
        <div class="app-title-section">
          <h1>Connect & Live Chat</h1>
          <p>Choose your preferred mode to connect anonymously.</p>
        </div>
        
        <div class="mode-container">
          <button class="btn-mode btn-mode-text" onclick="selectMode('text')">💬 TEXT CHAT MODE</button>
          <button class="btn-mode btn-mode-video" onclick="selectMode('video')">📹 LIVE VIDEO CHAT</button>
        </div>

        <div style="font-size: 12px; color: #64748B;">🟢 Live Server Connected</div>
      </div>

      <div class="chat-card">
        <div class="header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <button class="btn-back" onclick="closeChatScreen()">⬅ Back</button>
            <div>
              <h3 id="modeTitle" style="font-size:14px; font-weight:700;">Frendo Chat ${isCEO ? '<span style="font-size:10px; background:#F59E0B; color:#FFF; padding:2px 6px; border-radius:4px; font-weight:900;">👑 CEO</span>' : ''}</h3>
              <span id="statusText" style="font-size: 11px; color: #94A3B8;">Offline</span>
            </div>
          </div>
          <div style="font-size: 12px; color: #10B981; font-weight: bold;" id="onlineCountText">0 Online</div>
        </div>

        <div class="video-wrapper" id="videoWrapper">
          <div class="video-controls">
            <button class="icon-btn" onclick="toggleMuteAudio()" id="micBtn">🎙️ Mic On</button>
            <button class="icon-btn" onclick="toggleMuteVideo()" id="camBtn">📹 Cam On</button>
          </div>
          <video id="remoteVideo" autoplay playsinline></video>
          <video id="localVideo" autoplay playsinline muted></video>
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
        let currentMode = 'text';
        let isConnected = false;
        
        let localStream = null;
        let peerConnection = null;
        const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        socket.emit('device_type', { isMobile: isMobileDevice });

        const landingScreen = document.getElementById('landingScreen');
        const statusText = document.getElementById('statusText');
        const onlineCountText = document.getElementById('onlineCountText');
        const modeTitle = document.getElementById('modeTitle');
        const videoWrapper = document.getElementById('videoWrapper');
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        const startBtn = document.getElementById('startBtn');
        const skipBtn = document.getElementById('skipBtn');
        const endBtn = document.getElementById('endBtn');
        const messageArea = document.getElementById('messageArea');
        const msgInput = document.getElementById('msgInput');
        const sendBtn = document.getElementById('sendBtn');
        const customToast = document.getElementById('customToast');
        const ceoToast = document.getElementById('ceoToast');

        function selectMode(mode) {
          currentMode = mode;
          modeTitle.innerText = mode === 'video' ? '📹 Video Chat Mode' : '💬 Text Chat Mode';
          landingScreen.classList.add('hide'); 
          socket.emit('set_user_mode', { mode });

          if (mode === 'video') {
            videoWrapper.classList.add('active');
            initCamera();
          } else {
            videoWrapper.classList.remove('active');
          }
          resetState();
        }

        async function initCamera() {
          try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
          } catch (err) {
            alert('Camera & Mic permissions required for Video mode.');
          }
        }

        function closeChatScreen() { 
          stopVideoTracks();
          socket.emit('leave_queue');
          if(isConnected) handleEndChat(); 
          else resetState();
          landingScreen.classList.remove('hide'); 
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
          onlineCountText.innerText = count + ' Online';
        });

        function handleConnect() {
          clearChatHistory();
          socket.emit('find_partner', { isCEO: IS_CEO, mode: currentMode });
          statusText.innerText = 'Searching...';
          startBtn.style.display = 'none';
          skipBtn.style.display = 'inline-block';
          endBtn.style.display = 'inline-block';
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
          statusText.innerText = 'Offline';
          startBtn.style.display = 'block';
          skipBtn.style.display = 'none';
          endBtn.style.display = 'none';
          msgInput.disabled = true;
          sendBtn.disabled = true;
          msgInput.placeholder = 'Connect first to message...';
          clearChatHistory();
          if(remoteVideo) remoteVideo.srcObject = null;
        }

        function clearChatHistory() { messageArea.innerHTML = ''; }

        socket.on('chat_start', async (data) => {
          isConnected = true;
          statusText.innerText = 'Connected';
          msgInput.disabled = false;
          sendBtn.disabled = false;
          msgInput.placeholder = 'Type a message...';

          if (data && data.hasCEO && !IS_CEO) {
            ceoToast.classList.add('show');
            setTimeout(() => { ceoToast.classList.remove('show'); }, 4000);
          }

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
            remoteVideo.srcObject = event.streams[0];
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
          const msgType = data.isCEO ? 'ceo-msg' : 'stranger';
          addMessage(data.message, msgType); 
        });

        socket.on('stranger_left', () => { 
          if(peerConnection) peerConnection.close();
          customToast.classList.add('show');
          setTimeout(() => { customToast.classList.remove('show'); }, 3000);
          resetState(); 
        });

        function sendMessage() {
          const text = msgInput.value.trim();
          if (text && isConnected) {
            socket.emit('send_message', { message: text, isCEO: IS_CEO });
            addMessage(text, IS_CEO ? 'me-ceo' : 'me');
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

        function toggleMuteAudio() {
          if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            document.getElementById('micBtn').innerText = audioTrack.enabled ? '🎙️ Mic On' : '🎙️ Mic Off';
          }
        }

        function toggleMuteVideo() {
          if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            videoTrack.enabled = !videoTrack.enabled;
            document.getElementById('camBtn').innerText = videoTrack.enabled ? '📹 Cam On' : '📹 Cam Off';
          }
        }

        msgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
      </script>
    </body>
    </html>
  `;
  res.send(htmlContent);
}

// Full Admin Control Dashboard
app.get('/admin', (req, res) => {
  const key = req.query.key;
  if (key !== SECRET_PASS) return res.status(403).send("Forbidden");

  const adminHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Frendo Admin Dashboard</title>
      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; }
        body { background: #0F172A; color: #FFF; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
        .stats { display: flex; gap: 15px; flex-wrap: wrap; }
        .card { background: #1E293B; padding: 15px 20px; border-radius: 10px; flex: 1; min-width: 160px; border: 1px solid #334155; }
        .card h4 { color: #94A3B8; font-size: 11px; text-transform: uppercase; }
        .card p { font-size: 24px; font-weight: bold; color: #38BDF8; margin-top: 4px; }
        
        .main-container { display: flex; gap: 20px; height: 420px; }
        .box { flex: 1; background: #1E293B; border-radius: 10px; padding: 15px; overflow-y: auto; border: 1px solid #334155; }
        .spy-box { flex: 2; background: #020617; color: #FFF; border-radius: 10px; padding: 15px; display: flex; flex-direction: column; border: 1px solid #1E293B; }
        
        .room-item { background: #0F172A; padding: 12px; border-radius: 8px; margin-bottom: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border: 1px solid #334155; }
        .room-item:hover { background: #2563EB; }
        .room-item.active { background: #2563EB; font-weight: bold; }
        .btn-delete { background: #EF4444; border: none; color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: bold; }
        
        #chatStream { flex: 1; overflow-y: auto; font-family: monospace; font-size: 13px; color: #38BDF8; margin-top: 10px; border-top: 1px solid #334155; padding-top: 10px; }
      </style>
    </head>
    <body>
      <h2>⚡ Live Monitoring Dashboard</h2>
      
      <div class="stats">
        <div class="card"><h4>ONLINE USERS</h4><p id="uCount">0</p></div>
        <div class="card"><h4>TODAY VISITORS</h4><p id="tVisitors" style="color:#10B981;">0</p></div>
        <div class="card"><h4>💬 TEXT CHAT USERS</h4><p id="textUsers" style="color:#3B82F6;">0</p></div>
        <div class="card"><h4>📹 VIDEO CHAT USERS</h4><p id="videoUsers" style="color:#A855F7;">0</p></div>
        <div class="card"><h4>📱 MOBILE / 💻 DESK</h4><p id="devUsers" style="color:#F59E0B;">0 / 0</p></div>
        <div class="card"><h4>ACTIVE ROOMS</h4><p id="rCount">0</p></div>
      </div>

      <div class="main-container">
        <div class="box">
          <h3 style="margin-bottom:12px; font-size: 14px; color:#38BDF8;">Active Live Chat Rooms</h3>
          <div id="roomContainer"><i>No active rooms...</i></div>
        </div>

        <div class="spy-box">
          <h3 id="spyTitle" style="font-size:14px; color:#FBBF24;">Target Room Monitor: None Selected</h3>
          <div id="chatStream">Select an active room to monitor live messages...</div>
        </div>
      </div>

      <script>
        const socket = io();
        let selectedRoom = null;

        socket.on('connect', () => {
          socket.emit('admin_auth', { pass: "${SECRET_PASS}" });
        });

        socket.on('admin_stats_update', (data) => {
          document.getElementById('uCount').innerText = data.activeUsers;
          document.getElementById('tVisitors').innerText = data.analytics.todayTotal;
          document.getElementById('textUsers').innerText = data.analytics.textModeUsers;
          document.getElementById('videoUsers').innerText = data.analytics.videoModeUsers;
          document.getElementById('devUsers').innerText = data.analytics.mobileUsers + ' / ' + data.analytics.desktopUsers;
          document.getElementById('rCount').innerText = data.roomCount;
          renderRooms(data.rooms);
        });

        function renderRooms(rooms) {
          const container = document.getElementById('roomContainer');
          if (!rooms || rooms.length === 0) { 
            container.innerHTML = '<i>No active rooms...</i>'; 
            return; 
          }
          container.innerHTML = '';
          rooms.forEach(room => {
            const div = document.createElement('div');
            div.className = 'room-item ' + (selectedRoom === room.id ? 'active' : '');
            div.innerHTML = '<span>' + (room.mode === 'video' ? '📹' : '💬') + ' ' + room.id + '</span> <button class="btn-delete" onclick="deleteRoom(\\'' + room.id + '\\', event)">Disconnect</button>';
            div.onclick = () => selectRoom(room.id);
            container.appendChild(div);
          });
        }

        function deleteRoom(roomId, event) {
          event.stopPropagation();
          socket.emit('admin_close_room', roomId);
        }

        function selectRoom(roomId) {
          selectedRoom = roomId;
          document.getElementById('spyTitle').innerText = 'Monitoring Room: ' + roomId;
          socket.emit('get_room_history', roomId);
        }

        socket.on('admin_chat_history', (data) => {
          if (data.roomId === selectedRoom) {
            const stream = document.getElementById('chatStream');
            stream.innerHTML = '<i>-- Connected Stream: ' + data.roomId + ' --</i><br>';
            data.history.forEach(log => appendLog(log));
          }
        });

        socket.on('admin_chat_log', (data) => {
          if (data.roomId === selectedRoom) appendLog(data);
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

  socket.on('device_type', (data) => {
    if (data.isMobile) analytics.mobileUsers++;
    else analytics.desktopUsers++;
    broadcastAdminStats();
  });

  socket.on('set_user_mode', (data) => {
    socket.userMode = data.mode;
    recalculateModeCounts();
    broadcastAdminStats();
  });

  socket.on('admin_auth', (data) => {
    if (data.pass === SECRET_PASS) {
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

  socket.on('leave_queue', () => {
    waitingQueueText = waitingQueueText.filter((id) => id !== socket.id);
    waitingQueueVideo = waitingQueueVideo.filter((id) => id !== socket.id);
    broadcastAdminStats();
  });

  socket.on('find_partner', (data) => {
    socket.isCEO = data && data.isCEO;
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
        const hasCEO = socket.isCEO || partner.isCEO;

        socket.join(roomId);
        partner.join(roomId);
        socket.currentRoom = roomId;
        partner.currentRoom = roomId;

        let user1Label = socket.isCEO ? "👑 CEO" : "Stranger 1";
        let user2Label = partner.isCEO ? "👑 CEO" : (socket.isCEO ? "Stranger 1" : "Stranger 2");

        activeRooms[roomId] = {
          mode,
          users: [
            { id: socket.id, label: user1Label },
            { id: partner.id, label: user2Label }
          ]
        };
        adminLogs[roomId] = [];

        socket.emit('chat_start', { initiator: true, hasCEO });
        partner.emit('chat_start', { initiator: false, hasCEO });
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
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('signal', data);
    }
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
  });

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
  let text = 0;
  let video = 0;
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
    delete adminLogs[socket.currentRoom];
    socket.currentRoom = null;
    broadcastAdminStats();
  }
}

function broadcastAdminStats() {
  const roomList = Object.keys(activeRooms).map(id => ({ id, mode: activeRooms[id].mode }));

  io.to('admin_room').emit('admin_stats_update', {
    activeUsers,
    analytics: {
      todayTotal: analytics.todayTotal,
      mobileUsers: analytics.mobileUsers,
      desktopUsers: analytics.desktopUsers,
      textModeUsers: analytics.textModeUsers,
      videoModeUsers: analytics.videoModeUsers
    },
    roomCount: roomList.length,
    rooms: roomList
  });
}

server.listen(PORT, HOST, () => console.log(`Server listening live on http://${HOST}:${PORT}`));