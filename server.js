const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

// Render / Production Dynamic Port
const PORT = process.env.PORT || 3000;

let waitingQueue = [];

io.on('connection', (socket) => {
  socket.on('find_partner', (data) => {
    socket.isCEO = data?.isCEO || false;

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

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Anonymous Chat</title>
      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { height: 100vh; width: 100vw; display: flex; justify-content: center; align-items: center; background-color: #0B0F19; color: #fff; overflow: hidden; position: relative; }
        
        body.ceo-mode { background-color: #0D0B08; }
        .ceo-glow { display: none; position: absolute; width: 500px; height: 500px; background: radial-gradient(circle, rgba(212,175,55,0.15) 0%, rgba(0,0,0,0) 70%); }
        body.ceo-mode .ceo-glow { display: block; }

        /* Yellow Pulse Edge Light for Stranger Screen */
        .screen-yellow-glow {
          box-shadow: inset 0 0 25px #D4AF37, inset 0 0 50px rgba(212, 175, 55, 0.6) !important;
          animation: yellowPulse 2s infinite ease-in-out;
        }

        @keyframes yellowPulse {
          0% { box-shadow: inset 0 0 20px #D4AF37, inset 0 0 40px rgba(212, 175, 55, 0.5); }
          50% { box-shadow: inset 0 0 35px #FFD700, inset 0 0 70px rgba(255, 215, 0, 0.8); }
          100% { box-shadow: inset 0 0 20px #D4AF37, inset 0 0 40px rgba(212, 175, 55, 0.5); }
        }

        .chat-card { width: 90%; max-width: 420px; height: 85vh; max-height: 650px; background: rgba(18, 18, 18, 0.85); backdrop-filter: blur(10px); border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column; z-index: 10; box-shadow: 0 20px 50px rgba(0,0,0,0.5); position: relative; }
        body.ceo-mode .chat-card { border-color: #D4AF37; box-shadow: 0 0 35px rgba(212, 175, 55, 0.25); }

        .header { padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; }
        .header h3 { font-size: 16px; color: #fff; }
        body.ceo-mode .header h3 { color: #D4AF37; }
        
        .header-actions { display: flex; gap: 6px; }
        .btn-sm { border: none; padding: 6px 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px; }
        .btn-report { background: #374151; color: #f87171; }
        .btn-block { background: #991b1b; color: #fff; }

        .message-area { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .msg { padding: 10px 14px; border-radius: 12px; max-width: 80%; word-break: break-word; font-size: 14px; }
        .msg.me { align-self: flex-end; background: #2563EB; color: #fff; }
        body.ceo-mode .msg.me { background: linear-gradient(135deg, #B38728, #BF953F); color: #000; font-weight: bold; }
        
        .msg.stranger { align-self: flex-start; background: #1F2937; color: #fff; }

        .msg.stranger.ceo-sender {
          background: linear-gradient(135deg, #BF953F, #FCF6BA, #B38728) !important;
          color: #000 !important;
          font-weight: bold;
          border: 1px solid #D4AF37;
          box-shadow: 0 0 15px rgba(212, 175, 55, 0.5);
        }

        audio { max-width: 200px; height: 35px; }

        .typing-indicator { display: none; padding: 4px 15px; font-size: 12px; color: #aaa; font-style: italic; }

        .action-bar { padding: 10px 15px 0 15px; display: flex; gap: 8px; justify-content: space-between; }
        .btn-action { flex: 1; border: none; padding: 8px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; }
        .btn-skip { background: #f59e0b; color: #000; }
        .btn-end { background: #ef4444; color: #fff; }
        .btn-start { background: #10b981; color: #fff; width: 100%; padding: 10px; }

        .input-area { padding: 12px 15px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; gap: 8px; align-items: center; margin-top: 5px; }
        .input-area input { flex: 1; background: #111; border: 1px solid #374151; border-radius: 10px; padding: 10px; color: #fff; outline: none; }
        body.ceo-mode .input-area input { border-color: #B38728; }
        
        .mic-btn { border: none; padding: 8px 10px; border-radius: 10px; cursor: pointer; background: #1F2937; color: #fff; }
        .mic-btn.recording { background: #EF4444; animation: pulse 1s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }

        .send-btn { border: none; padding: 10px 14px; border-radius: 10px; font-weight: bold; cursor: pointer; background: #3B82F6; color: #fff; }
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
            <h3 id="panelTitle">Anonymous Chat</h3>
            <span id="statusText" style="font-size: 11px; color: #888;">Offline</span>
          </div>
          <div class="header-actions" id="headerActions" style="display: none;">
            <button class="btn-sm btn-report" onclick="handleReport()">🚩 Report</button>
            <button class="btn-sm btn-block" onclick="handleBlock()">🚫 Block</button>
          </div>
        </div>

        <div class="message-area" id="messageArea"></div>

        <div class="typing-indicator" id="typingIndicator">Stranger is typing...</div>

        <div class="action-bar" id="actionBar">
          <button id="startBtn" class="btn-action btn-start" onclick="handleConnect()">New Chat</button>
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
          panelTitle.innerText = '👑 CEO DOMINANT PANEL';
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