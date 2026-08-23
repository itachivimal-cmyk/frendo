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
let reportsList = [];

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
          --bg-color: #F1F5F9;
          --card-bg: #FFFFFF;
          --text-color: #0F172A;
          --subtext-color: #64748B;
          --border-color: #E2E8F0;
          --input-bg: #F8FAFC;
        }

        html, body { height: 100dvh; width: 100vw; overflow: hidden; background: var(--bg-color); color: var(--text-color); transition: background 0.3s, color 0.3s; }

        #customToast {
          position: fixed; top: -70px; left: 50%; transform: translateX(-50%);
          background: #EF4444; color: white; padding: 12px 24px; border-radius: 30px; font-weight: bold;
          font-size: 13px; box-shadow: 0 10px 25px rgba(239, 68, 68, 0.3); z-index: 1000;
          transition: top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.4);
        }
        #customToast.show { top: 20px; }

        .theme-toggle {
          position: absolute; top: 15px; right: 15px; z-index: 100;
          background: var(--card-bg); border: 1px solid var(--border-color); color: var(--text-color);
          width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-size: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .app-landing {
          width: 100vw; height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
          padding: 50px 24px; background: var(--bg-color); text-align: center;
          position: absolute; top: 0; left: 0; z-index: 10; transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .app-landing.hide { transform: translateY(-100%); }

        .logo-glow {
          width: 90px; height: 90px; border-radius: 50%;
          background: linear-gradient(135deg, #2563EB, #4F46E5); padding: 3px;
          box-shadow: 0 10px 30px rgba(37, 99, 235, 0.25); display: flex; align-items: center; justify-content: center; margin-top: 10px;
        }
        .logo-inner { width: 100%; height: 100%; background: var(--bg-color); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
        .logo-text { font-size: 18px; font-weight: 900; letter-spacing: 2px; background: linear-gradient(135deg, #38BDF8, #818CF8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

        .app-title-section h1 { font-size: 24px; font-weight: 800; color: var(--text-color); margin-bottom: 6px; }
        .app-title-section p { font-size: 13px; color: var(--subtext-color); max-width: 280px; margin: 0 auto; }

        .mode-container { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 320px; }
        .btn-mode {
          width: 100%; padding: 16px; border-radius: 16px; border: 1px solid var(--border-color); font-size: 15px; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px; transition: transform 0.2s; color: #FFF;
        }
        .btn-mode-text { background: linear-gradient(135deg, #2563EB, #1D4ED8); box-shadow: 0 8px 20px rgba(37, 99, 235, 0.3); }
        .btn-mode-video { background: linear-gradient(135deg, #7C3AED, #6D28D9); box-shadow: 0 8px 20px rgba(124, 58, 237, 0.3); }

        .chat-card { width: 100vw; height: 100dvh; background: var(--bg-color); display: flex; flex-direction: column; position: relative; }
        .header { padding: 12px 18px; background: var(--card-bg); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; z-index: 5; }
        .btn-back { background: var(--border-color); border: none; color: var(--text-color); padding: 6px 12px; border-radius: 10px; font-size: 12px; cursor: pointer; font-weight: 600; }
        
        .video-wrapper { flex: 1; position: relative; background: #020617; display: none; width: 100%; height: 100%; overflow: hidden; }
        .video-wrapper.active { display: flex; }
        #remoteVideo { width: 100%; height: 100%; object-fit: cover; }
        #localVideo { position: absolute; bottom: 15px; right: 15px; width: 100px; height: 140px; object-fit: cover; border-radius: 12px; border: 2px solid #38BDF8; background: #1E293B; z-index: 10; }
        
        .video-controls { position: absolute; top: 15px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 20; }
        .icon-btn { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.2); color: #FFF; padding: 6px 12px; border-radius: 20px; font-size: 11px; cursor: pointer; backdrop-filter: blur(5px); }

        .message-area { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; background: var(--bg-color); }
        .msg { padding: 10px 14px; border-radius: 16px; max-width: 80%; word-break: break-word; font-size: 14px; }
        .msg.me { align-self: flex-end; background: #2563EB; color: #fff; border-bottom-right-radius: 4px; }
        .msg.stranger { align-self: flex-start; background: var(--card-bg); color: var(--text-color); border: 1px solid var(--border-color); border-bottom-left-radius: 4px; }

        .action-bar { padding: 10px 18px; background: var(--card-bg); border-top: 1px solid var(--border-color); display: flex; gap: 8px; }
        .btn-action { flex: 1; border: none; padding: 10px; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 12px; color: #FFF; }
        .btn-skip { background: #F59E0B; }
        .btn-end { background: #64748B; }
        .btn-block { background: #000000; border: 1px solid #334155; }
        .btn-report { background: #EF4444; }
        .btn-start { background: #10B981; width: 100%; padding: 12px; font-size: 14px; }

        .input-area { padding: 10px 18px; background: var(--card-bg); border-top: 1px solid var(--border-color); display: flex; gap: 10px; }
        .input-area input { flex: 1; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 10px 14px; color: var(--text-color); outline: none; font-size: 14px; }
        .send-btn { border: none; padding: 10px 16px; border-radius: 12px; font-weight: 700; cursor: pointer; background: #2563EB; color: #fff; }
      </style>
    </head>
    <body>

      <button class="theme-toggle" onclick="toggleTheme()" id="themeBtn">☀️</button>
      <div id="customToast"><span id="toastMsg">⚠️ Stranger Disconnected!</span></div>

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

        <div style="font-size: 12px; color: var(--subtext-color);">🟢 Live Server Connected</div>
      </div>

      <div class="chat-card">
        <div class="header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <button class="btn-back" onclick="closeChatScreen()">⬅ Back</button>
            <div>
              <h3 id="modeTitle" style="font-size:14px; font-weight:700;">Frendo Chat</h3>
              <span id="statusText" style="font-size: 11px; color: var(--subtext-color);">Offline</span>
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
          <button id="blockBtn" class="btn-action btn-block" onclick="handleBlock()" style="display: none;">🚫 Block</button>
          <button id="reportBtn" class="btn-action btn-report" onclick="handleReport()" style="display: none;">⚠️ Report</button>
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

        function toggleTheme() {
          document.body.classList.toggle('light-theme');
          const isLight = document.body.classList.contains('light-theme');
          document.getElementById('themeBtn').innerText = isLight ? '🌙' : '☀️';
        }

        function selectMode(mode) {
          currentMode = mode;
          document.getElementById('modeTitle').innerText = mode === 'video' ? '📹 Video Chat Mode' : '💬 Text Chat Mode';
          document.getElementById('landingScreen').classList.add('hide'); 
          socket.emit('set_user_mode', { mode });

          if (mode === 'video') {
            document.getElementById('videoWrapper').classList.add('active');
            initCamera();
          } else {
            document.getElementById('videoWrapper').classList.remove('active');
          }
          resetState();
        }

        async function initCamera() {
          try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('localVideo').srcObject = localStream;
          } catch (err) {
            alert('Camera & Mic permissions required for Video mode.');
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
          document.getElementById('onlineCountText').innerText = count + ' Online';
        });

        function handleConnect() {
          clearChatHistory();
          socket.emit('find_partner', { isCEO: IS_CEO, mode: currentMode });
          document.getElementById('statusText').innerText = 'Searching...';
          document.getElementById('startBtn').style.display = 'none';
          document.getElementById('skipBtn').style.display = 'inline-block';
          document.getElementById('blockBtn').style.display = 'inline-block';
          document.getElementById('reportBtn').style.display = 'inline-block';
          document.getElementById('endBtn').style.display = 'inline-block';
        }

        function handleBlock() {
          if (confirm('Block this user and disconnect?')) {
            socket.emit('report_or_block', { type: 'BLOCK' });
            showToast('🚫 User Blocked!');
            handleSkip();
          }
        }

        function handleReport() {
          const reason = prompt('Specify report reason (e.g., Abuse, Nudity):');
          if (reason) {
            socket.emit('report_or_block', { type: 'REPORT', reason });
            showToast('⚠️ User Reported to Admin!');
            handleSkip();
          }
        }

        function showToast(text) {
          const toast = document.getElementById('customToast');
          document.getElementById('toastMsg').innerText = text;
          toast.classList.add('show');
          setTimeout(() => { toast.classList.remove('show'); }, 3000);
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
          document.getElementById('blockBtn').style.display = 'none';
          document.getElementById('reportBtn').style.display = 'none';
          document.getElementById('endBtn').style.display = 'none';
          document.getElementById('msgInput').disabled = true;
          document.getElementById('sendBtn').disabled = true;
          document.getElementById('msgInput').placeholder = 'Connect first to message...';
          clearChatHistory();
          if(document.getElementById('remoteVideo')) document.getElementById('remoteVideo').srcObject = null;
        }

        function clearChatHistory() { document.getElementById('messageArea').innerHTML = ''; }

        socket.on('chat_start', async (data) => {
          isConnected = true;
          document.getElementById('statusText').innerText = 'Connected';
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
          showToast('⚠️ Stranger Disconnected!');
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
      </script>
    </body>
    </html>
  `;
  res.send(htmlContent);
}

// Admin Control Dashboard with Reports Log
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
        
        .main-container { display: flex; gap: 20px; height: 400px; }
        .box { flex: 1; background: #1E293B; border-radius: 10px; padding: 15px; overflow-y: auto; border: 1px solid #334155; }
        
        .report-item { background: #7F1D1D; color: #FCA5A5; padding: 8px 12px; border-radius: 6px; margin-bottom: 8px; font-size: 12px; }
        .room-item { background: #0F172A; padding: 10px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #334155; }
      </style>
    </head>
    <body>
      <h2>⚡ CEO Control Center</h2>
      
      <div class="stats">
        <div class="card"><h4>ONLINE USERS</h4><p id="uCount">0</p></div>
        <div class="card"><h4>TODAY VISITORS</h4><p id="tVisitors" style="color:#10B981;">0</p></div>
        <div class="card"><h4>💬 TEXT CHAT</h4><p id="textUsers" style="color:#3B82F6;">0</p></div>
        <div class="card"><h4>📹 VIDEO CHAT</h4><p id="videoUsers" style="color:#A855F7;">0</p></div>
        <div class="card"><h4>TOTAL REPORTS</h4><p id="repCount" style="color:#EF4444;">0</p></div>
      </div>

      <div class="main-container">
        <div class="box">
          <h3 style="margin-bottom:12px; font-size: 14px; color:#38BDF8;">Active Rooms</h3>
          <div id="roomContainer"><i>No active rooms...</i></div>
        </div>

        <div class="box">
          <h3 style="margin-bottom:12px; font-size: 14px; color:#EF4444;">🚨 Abuse Reports & Blocks</h3>
          <div id="reportsContainer"><i>No reports yet...</i></div>
        </div>
      </div>

      <script>
        const socket = io();

        socket.on('connect', () => {
          socket.emit('admin_auth', { pass: "${SECRET_PASS}" });
        });

        socket.on('admin_stats_update', (data) => {
          document.getElementById('uCount').innerText = data.activeUsers;
          document.getElementById('tVisitors').innerText = data.analytics.todayTotal;
          document.getElementById('textUsers').innerText = data.analytics.textModeUsers;
          document.getElementById('videoUsers').innerText = data.analytics.videoModeUsers;
          document.getElementById('repCount').innerText = data.reports.length;
          
          renderRooms(data.rooms);
          renderReports(data.reports);
        });

        function renderRooms(rooms) {
          const container = document.getElementById('roomContainer');
          if (!rooms || rooms.length === 0) { container.innerHTML = '<i>No active rooms...</i>'; return; }
          container.innerHTML = '';
          rooms.forEach(room => {
            container.innerHTML += '<div class="room-item"><span>' + (room.mode === 'video' ? '📹' : '💬') + ' ' + room.id + '</span></div>';
          });
        }

        function renderReports(reports) {
          const container = document.getElementById('reportsContainer');
          if (!reports || reports.length === 0) { container.innerHTML = '<i>No reports...</i>'; return; }
          container.innerHTML = '';
          reports.forEach(r => {
            container.innerHTML += '<div class="report-item"><b>[' + r.type + ']</b> Room: ' + r.room + ' | Reason: ' + (r.reason || 'Blocked by user') + '</div>';
          });
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
    reportsList.push({
      type: data.type,
      reason: data.reason || 'User Blocked',
      room: socket.currentRoom || 'N/A',
      time: new Date().toLocaleTimeString()
    });
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
  const roomList = Object.keys(activeRooms).map(id => ({ id, mode: activeRooms[id].mode }));

  io.to('admin_room').emit('admin_stats_update', {
    activeUsers,
    analytics: {
      todayTotal: analytics.todayTotal,
      textModeUsers: analytics.textModeUsers,
      videoModeUsers: analytics.videoModeUsers
    },
    rooms: roomList,
    reports: reportsList
  });
}

server.listen(PORT, HOST, () => console.log(`Server listening live on http://${HOST}:${PORT}`));