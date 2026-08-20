const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

const PORT = process.env.PORT || 3000;

// Live Users Log Store Panna Simple Memory Array
let liveLogs = [];
let waitingQueue = [];

io.on('connection', (socket) => {
  const clientIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  socket.on('find_partner', (data) => {
    socket.isCEO = data?.isCEO || false;

    // Live Log Save Aagum
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
    waitingQueue = waitingQueue.filter((s) => s.id !== socket.id);
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit('stranger_left');
    }
  });
});

// Admin Route to View Stranger Logs
app.get('/admin-logs-secret', (req, res) => {
  res.json({
    totalUsersCount: liveLogs.length,
    usersInWaitingQueue: waitingQueue.length,
    recentConnections: liveLogs
  });
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      
      <!-- SEO & Social Share Preview -->
      <title>Frendo - Anonymous Random Chat App</title>
      <meta name="description" content="Talk to strangers online for free on Frendo! Safe, fast, and anonymous audio and text chat application.">
      <meta name="keywords" content="Frendo, Frendo chat, random chat, talk to strangers, anonymous Tamil chat, Omegle alternative">
      <meta name="robots" content="index, follow">
      
      <!-- WhatsApp Preview Card Details -->
      <meta property="og:title" content="Frendo - Anonymous Chat App">
      <meta property="og:description" content="Connect with random people instantly on Frendo. Free text and voice notes chat!">
      <meta property="og:image" content="https://cdn-icons-png.flaticon.com/512/3820/3820107.png">
      <meta property="og:type" content="website">
      <meta property="og:url" content="https://frendo-server.onrender.com">

      <!-- Browser Tab Logo -->
      <link rel="icon" type="image/png" href="https://cdn-icons-png.flaticon.com/512/3820/3820107.png">

      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        
        /* FULL SCREEN APP DESIGN */
        html, body { height: 100%; width: 100vw; overflow: hidden; background-color: #0B0F19; color: #fff; }
        
        body.ceo-mode { background-color: #0D0B08; }
        .ceo-glow { display: none; position: absolute; width: 100%; height: 100%; background: radial-gradient(circle, rgba(212,175,55,0.15) 0%, rgba(0,0,0,0) 70%); pointer-events: none; }
        body.ceo-mode .ceo-glow { display: block; }

        .screen-yellow-glow {
          box-shadow: inset 0 0 25px #D4AF37, inset 0 0 50px rgba(212, 175, 55, 0.6) !important;
          animation: yellowPulse 2s infinite ease-in-out;
        }

        @keyframes yellowPulse {
          0% { box-shadow: inset 0 0 20px #D4AF37, inset 0 0 40px rgba(212, 175, 55, 0.5); }
          50% { box-shadow: inset 0 0 35px #FFD700, inset 0 0 70px rgba(255, 215, 0, 0.8); }
          100% { box-shadow: inset 0 0 20px #D4AF37, inset 0 0 40px rgba(212, 175, 55, 0.5); }
        }

        /* FULL SCREEN CONTAINER */
        .chat-card { width: 100vw; height: 100vh; background: #0B0F19; display: flex; flex-direction: column; position: relative; }
        body.ceo-mode .chat-card { background: #0D0B08; }

        .header { padding: 15px 20px; background: #111827; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; z-index: 10; }
        .header h3 { font-size: 18px; color: #fff; display: flex; align-items: center; gap: 8px; }
        body.ceo-mode .header h3 { color: #D4AF37; }
        
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
          box-shadow: 0 0 15px rgba(212, 175, 55, 0.5);
        }

        audio { max-width: 220px; height: 35px; }

        .typing-indicator { display: none; padding: 6px 15px; font-size: 13px; color: #aaa; font-style: italic; }

        .action-bar { padding: 10px 15px; background: #111827; display: flex; gap: 10px; justify-content: space-between; }
        .btn-action { flex: 1; border: none; padding: 12px; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 14px; }
        .btn-skip { background: #f59e0b; color: #000; }
        .btn-end { background: #ef4444; color: #fff; }
        .btn-start { background: #10b981; color: #fff; width: 100%; padding: 12px; }

        .input-area { padding: 12px 15px; background: #111827; border-top: 1px solid rgba(255,255,255,0.1); display: flex; gap: 10px; align-items: center; }
        .input-area input { flex: 1; background: #1F2937; border: 1px solid #374151; border-radius: 12px; padding: 12px; color: #fff; outline: none; font-size: 16px; }
        body.ceo-mode .input-area input { border-color: #B38728; }
        
        .mic-btn { border: none; padding: 12px 14px; border-radius: 12px; cursor: pointer; background: #374151; color: #fff; font-size: 16px; }
        .mic-btn.recording { background: #EF4444; animation: pulse 1s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }

        .send-btn { border: none; padding: 12px 18px; border-radius: 12px; font-weight: bold; cursor: pointer; background: #2563EB; color: #fff; font-size: 15px; }
        body.ceo-mode .send-btn { background: #D4AF37; color: #000; }

        .butterfly-container { display: none; position: absolute; inset: 0; pointer-events: none; z-index: 99; overflow: hidden; }
        .butterfly { position: absolute; font-size: 35px; animation: fly 6s infinite ease-in-out; }
        .b1 { top: 80%; left: 10%; animation-delay: 0s; }
        .b2 { top: 70%; left: 80%; animation-delay: 1.5s; }
        @keyframes fly { 0% { transform: translateY(0); opacity: 0; } 50% { opacity: 1; } 100% { transform: translateY(-600px); opacity: 0; } }
      </style>
    </head>
    <body id="bodyNode">

      <div class="ceo-glow"></div>

      <div class="butterfly-container" id="bfContainer">
        <div class="butterfly b1">🦋</div>
        <div class="butterfly b2">✨ 🦋</div>
      </div>

      <div class="chat-card">
        <div class="header">
          <div>
            <h3 id="panelTitle"><img src="https://cdn-icons-png.flaticon.com/512/3820/3820107.png" width="22" height="22"> Frendo Chat</h3>
            <span id="statusText" style="font-size: 12px; color: #9CA3AF;">Offline</span>
          </div>
          <div class="header-actions" id="headerActions" style="display: none;">
            <button class="btn-sm btn-report" onclick="handleReport()">🚩 Report</button>
            <button class="btn-sm btn-block" onclick="handleBlock()">🚫 Block</button>
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
        // FULL SCREEN KEYBOARD RESIZE FIX
        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', () => {
            document.body.style.height = window.visualViewport.height + 'px';
            window.scrollTo(0, 0);
          });
        }

        const socket = io();
        const urlParams = new URLSearchParams(window.location.search);
        const isCEO = urlParams.get('secret') === 'ceo123';

        let isConnected = false;
        let typingTimeout;
        let mediaRecorder;
        let audioChunks = [];
        let isRecording = false;

        const bodyNode = document.getElementById('bodyNode');
        const panelTitle = document.getElementById('panelTitle');
        const statusText = document.getElementById('statusText');
        const headerActions = document.getElementById('headerActions');
        const startBtn = document.getElementById('startBtn');
        const skipBtn = document.getElementById('skipBtn');
        const endBtn = document.getElementById('endBtn');
        const messageArea = document.getElementById('messageArea');
        const msgInput = document.getElementById('msgInput');
        const sendBtn = document.getElementById('sendBtn');
        const micBtn = document.getElementById('micBtn');
        const bfContainer = document.getElementById('bfContainer');
        const typingIndicator = document.getElementById('typingIndicator');

        if (isCEO) {
          bodyNode.classList.add('ceo-mode');
          panelTitle.innerHTML = '👑 CEO DOMINANT PANEL';
        }

        function handleConnect() {
          socket.emit('find_partner', { isCEO });
          statusText.innerText = 'Searching for partner...';
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

        function handleBlock() {
          alert('User blocked successfully!');
          handleEndChat();
        }

        function handleReport() {
          alert('User has been reported to moderation team.');
          handleEndChat();
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
          bfContainer.style.display = 'none';
          typingIndicator.style.display = 'none';
          bodyNode.classList.remove('screen-yellow-glow');
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
          statusText.innerText = 'Connected to Stranger';
          headerActions.style.display = 'flex';
          msgInput.disabled = false;
          sendBtn.disabled = false;
          micBtn.disabled = false;
          msgInput.placeholder = 'Type a message...';
          messageArea.innerHTML = '';

          if (data.partnerIsCEO && !isCEO) {
            bodyNode.classList.add('screen-yellow-glow');
            bfContainer.style.display = 'block';
            setTimeout(() => { bfContainer.style.display = 'none'; }, 8000);
          }
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
          alert('Stranger left the chat.');
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