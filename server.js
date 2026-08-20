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

  const clientIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || 'Unknown';

  socket.on('find_partner', (data) => {
    socket.isCEO = Boolean(data && data.isCEO);

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
    if (socket.currentRoom && data && data.message) {
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
    for (let i = 0; i < liveLogs.length; i++) {
      const u = liveLogs[i];
      const roleBadge = u.isCEO ? '<span class="badge ceo">👑 CEO</span>' : '<span class="badge user">Stranger User</span>';
      tableRows += '<tr><td>#' + (liveLogs.length - i) + '</td><td><code>' + u.ip + '</code></td><td>' + roleBadge + '</td><td>' + u.connectedAt + '</td></tr>';
    }
  } else {
    tableRows = '<tr><td colspan="4" style="text-align:center; color:#9CA3AF;">No active connections logged yet</td></tr>';
  }

  res.send(`<!DOCTYPE html><html><head><title>Frendo Admin</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>*{box-sizing:border-box;font-family:sans-serif;}body{background:#0B0F19;color:#fff;padding:20px;margin:0;}.container{max-width:800px;margin:0 auto;}h2{color:#D4AF37;text-align:center;}.stats-grid{display:flex;gap:15px;margin-bottom:20px;justify-content:center;}.card{background:#111827;padding:15px;border-radius:10px;text-align:center;flex:1;}.card h4{margin:0;color:#9CA3AF;font-size:12px;}.card p{margin:5px 0 0;font-size:24px;font-weight:bold;color:#10B981;}.btn-clear{background:#ef4444;color:#fff;padding:8px 15px;border-radius:6px;text-decoration:none;font-size:13px;float:right;margin-bottom:10px;}table{width:100%;border-collapse:collapse;background:#111827;border-radius:8px;overflow:hidden;}th,td{padding:12px;text-align:left;border-bottom:1px solid #1F2937;font-size:13px;}th{background:#1F2937;color:#D4AF37;}code{background:#0B0F19;padding:3px 6px;border-radius:4px;color:#60A5FA;}.badge{padding:4px 8px;border-radius:4px;font-size:11px;font-weight:bold;}.badge.ceo{background:#D4AF37;color:#000;}.badge.user{background:#374151;color:#D1D5DB;}</style></head><body><div class="container"><h2>📊 Frendo Live Monitor</h2><div class="stats-grid"><div class="card"><h4>Online</h4><p>${activeUsersCount}</p></div><div class="card"><h4>Logs</h4><p>${liveLogs.length}</p></div><div class="card"><h4>Queue</h4><p>${waitingQueue.length}</p></div></div><a href="/admin-clear-logs-secret" class="btn-clear" onclick="return confirm('Clear logs?')">🗑️ Clear Logs</a><table><thead><tr><th>ID</th><th>IP Address</th><th>Role</th><th>Time</th></tr></thead><tbody>${tableRows}</tbody></table></div></body></html>`);
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><title>Frendo Chat</title><script src="/socket.io/socket.io.js"></script><style>*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',sans-serif;}html,body{height:100dvh;width:100vw;overflow:hidden;background-color:#0B0F19;color:#fff;}body.ceo-mode{background-color:#0D0B08;}.app-landing{width:100vw;height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:40px 20px;background:radial-gradient(circle at top, #1E1B4B 0%, #0B0F19 80%);text-align:center;position:absolute;top:0;left:0;z-index:10;transition:transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);}.app-landing.hide{transform:translateY(-100%);}.logo-circle{width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg, #FACC15, #EC4899);padding:4px;box-shadow:0 0 30px rgba(236,72,153,0.5);display:flex;align-items:center;justify-content:center;margin-top:20px;}.logo-inner{width:100%;height:100%;background:#0B0F19;border-radius:50%;display:flex;align-items:center;justify-content:center;}.logo-text{font-size:20px;font-weight:900;letter-spacing:2px;background:linear-gradient(135deg, #FACC15, #EC4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:blinkText 1.8s infinite alternate;}@keyframes blinkText{0%{opacity:0.6;transform:scale(0.96);}100%{opacity:1;transform:scale(1.05);}}.app-title-section h1{font-size:26px;font-weight:800;color:#fff;margin-bottom:8px;}.app-title-section p{font-size:13px;color:#9CA3AF;max-width:280px;margin:0 auto;line-height:1.5;}.details-box{background:rgba(17,24,39,0.7);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:18px;width:100%;max-width:320px;display:flex;flex-direction:column;gap:10px;}.detail-item{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#D1D5DB;}.detail-item span.val{font-weight:bold;color:#10B981;}.btn-text-tab{width:100%;max-width:320px;background:linear-gradient(135deg, #2563EB, #1D4ED8);color:#fff;border:none;padding:15px;border-radius:14px;font-size:16px;font-weight:bold;cursor:pointer;box-shadow:0 8px 20px rgba(37,99,235,0.4);}.btn-text-tab:active{transform:scale(0.97);}.chat-card{width:100vw;height:100dvh;background:#0B0F19;display:flex;flex-direction:column;position:relative;}.toast-notify{position:fixed;top:-60px;left:50%;transform:translateX(-50%);background:rgba(239,68,68,0.9);backdrop-filter:blur(8px);color:#fff;padding:8px 18px;border-radius:30px;font-size:12px;font-weight:bold;z-index:9999;transition:top 0.4s ease;}.toast-notify.show{top:20px;}.header{padding:12px 15px;background:#111827;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;}.header h3{font-size:15px;color:#fff;}.btn-back{background:#1F2937;border:1px solid #374151;color:#9CA3AF;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;margin-right:6px;}.online-badge{display:flex;align-items:center;gap:6px;background:rgba(16,185,129,0.15);padding:4px 10px;border-radius:20px;font-size:12px;color:#10B981;font-weight:bold;}.pulse-dot{width:8px;height:8px;background-color:#10B981;border-radius:50%;}.message-area{flex:1;padding:15px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;background:#0B0F19;}.msg{padding:10px 14px;border-radius:14px;max-width:80%;word-break:break-word;font-size:14px;}.msg.me{align-self:flex-end;background:#2563EB;color:#fff;border-bottom-right-radius:2px;}.msg.stranger{align-self:flex-start;background:#1F2937;color:#fff;border-bottom-left-radius:2px;}.msg.stranger.ceo-sender{background:linear-gradient(135deg, #BF953F, #FCF6BA, #B38728)!important;color:#000!important;font-weight:bold;}audio{max-width:180px;height:35px;}.typing-indicator{display:none;padding:4px 15px;font-size:11px;color:#aaa;font-style:italic;}.action-bar{padding:8px 15px;background:#111827;display:flex;gap:8px;}.btn-action{flex:1;border:none;padding:10px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:13px;}.btn-skip{background:#f59e0b;color:#000;}.btn-end{background:#ef4444;color:#fff;}.btn-start{background:#10b981;color:#fff;width:100%;}.input-area{padding:10px 15px;background:#111827;border-top:1px solid rgba(255,255,255,0.1);display:flex;gap:8px;align-items:center;}.input-area input{flex:1;background:#1F2937;border:1px solid #374151;border-radius:10px;padding:10px;color:#fff;outline:none;font-size:15px;}.mic-btn{border:none;padding:10px;border-radius:10px;cursor:pointer;background:#374151;color:#fff;}.mic-btn.recording{background:#EF4444;}.send-btn{border:none;padding:10px 14px;border-radius:10px;font-weight:bold;cursor:pointer;background:#2563EB;color:#fff;}</style></head><body id="bodyNode"><div id="landingScreen" class="app-landing"><div><div class="logo-circle"><div class="logo-inner"><span class="logo-text">FRENDO</span></div></div></div><div class="app-title-section"><h1>Welcome to Frendo</h1><p>Connect with random strangers anonymously.</p></div><div class="details-box"><div class="detail-item"><span>Server Status</span><span class="val">🟢 Online</span></div><div class="detail-item"><span>Active Users</span><span class="val" id="landingOnlineCount">0 Online</span></div><div class="detail-item"><span>Privacy</span><span style="color:#60A5FA;">100% Anonymous</span></div></div><button class="btn-text-tab" onclick="openChatScreen()">💬 TEXT CHAT</button></div><div id="toast" class="toast-notify"><span>🚫</span> <span id="toastMsg">Stranger disconnected</span></div><div class="chat-card" id="chatCard"><div class="header"><div style="display:flex;align-items:center;"><button class="btn-back" onclick="closeChatScreen()">⬅ Back</button><div><h3 id="panelTitle">Frendo</h3><span id="statusText" style="font-size:11px;color:#9CA3AF;">Offline</span></div></div><div class="online-badge"><span class="pulse-dot"></span><span id="onlineCountText">0 Online</span></div></div><div class="message-area" id="messageArea"></div><div class="typing-indicator" id="typingIndicator">Stranger is typing...</div><div class="action-bar" id="actionBar"><button id="startBtn" class="btn-action btn-start" onclick="handleConnect()">Start New Chat</button><button id="skipBtn" class="btn-action btn-skip" onclick="handleSkip()" style="display:none;">⏩ Skip</button><button id="endBtn" class="btn-action btn-end" onclick="handleEndChat()" style="display:none;">❌ End</button></div><div class="input-area"><button id="micBtn" class="mic-btn" onclick="toggleRecord()" disabled>🎙️</button><input type="text" id="msgInput" placeholder="Connect first..." disabled oninput="handleTyping()"/><button id="sendBtn" class="send-btn" onclick="sendMessage()" disabled>Send</button></div></div><script>const socket=io();const urlParams=new URLSearchParams(window.location.search);const isCEO=urlParams.get('secret')==='ceo123';let isConnected=false;let typingTimeout;let mediaRecorder;let audioChunks=[];let isRecording=false;const landingScreen=document.getElementById('landingScreen');const landingOnlineCount=document.getElementById('landingOnlineCount');const statusText=document.getElementById('statusText');const onlineCountText=document.getElementById('onlineCountText');const startBtn=document.getElementById('startBtn');const skipBtn=document.getElementById('skipBtn');const endBtn=document.getElementById('endBtn');const messageArea=document.getElementById('messageArea');const msgInput=document.getElementById('msgInput');const sendBtn=document.getElementById('sendBtn');const micBtn=document.getElementById('micBtn');const typingIndicator=document.getElementById('typingIndicator');function openChatScreen(){landingScreen.classList.add('hide');}function closeChatScreen(){if(isConnected)handleEndChat();landingScreen.classList.remove('hide');}socket.on('update_online_count',(c)=>{onlineCountText.innerText=c+' Online';landingOnlineCount.innerText=c+' Online';});function showToast(t){document.getElementById('toastMsg').innerText=t;document.getElementById('toast').classList.add('show');setTimeout(()=>{document.getElementById('toast').classList.remove('show');},2500);}if(isCEO){document.body.classList.add('ceo-mode');document.getElementById('panelTitle').innerHTML='👑 CEO DOMINANT';}function handleConnect(){socket.emit('find_partner',{isCEO});statusText.innerText='Searching...';startBtn.style.display='none';skipBtn.style.display='inline-block';endBtn.style.display='inline-block';}function handleSkip(){socket.emit('skip_chat');resetState();handleConnect();}function handleEndChat(){socket.emit('skip_chat');resetState();}function resetState(){isConnected=false;statusText.innerText='Offline';startBtn.style.display='block';skipBtn.style.display='none';endBtn.style.display='none';msgInput.disabled=true;sendBtn.disabled=true;micBtn.disabled=true;msgInput.placeholder='Connect first...';typingIndicator.style.display='none';}function handleTyping(){if(!isConnected)return;socket.emit('typing');clearTimeout(typingTimeout);typingTimeout=setTimeout(()=>{socket.emit('stop_typing');},1500);}async function toggleRecord(){if(!isConnected)return;if(!isRecording){try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});mediaRecorder=new MediaRecorder(stream);audioChunks=[];mediaRecorder.ondataavailable=e=>audioChunks.push(e.data);mediaRecorder.onstop=()=>{const blob=new Blob(audioChunks,{type:'audio/webm'});socket.emit('send_audio',blob);addAudioMessage(URL.createObjectURL(blob),'me');};mediaRecorder.start();isRecording=true;micBtn.classList.add('recording');}catch(err){alert('Mic access denied');}}else{mediaRecorder.stop();isRecording=false;micBtn.classList.remove('recording');}}socket.on('waiting',()=>{statusText.innerText='Searching...';});socket.on('chat_start',()=>{isConnected=true;statusText.innerText='Connected';msgInput.disabled=false;sendBtn.disabled=false;micBtn.disabled=false;msgInput.placeholder='Type a message...';messageArea.innerHTML='';});socket.on('partner_typing',()=>{typingIndicator.style.display='block';});socket.on('partner_stop_typing',()=>{typingIndicator.style.display='none';});socket.on('receive_message',(d)=>{addMessage(d.message,'stranger',d.isCEO);typingIndicator.style.display='none';});socket.on('receive_audio',(d)=>{const blob=new Blob([d.blob],{type:'audio/webm'});addAudioMessage(URL.createObjectURL(blob),'stranger',d.isCEO);});socket.on('stranger_left',()=>{showToast('Stranger left!');resetState();});function sendMessage(){const text=msgInput.value.trim();if(text&&isConnected){socket.emit('send_message',{message:text});socket.emit('stop_typing');addMessage(text,'me');msgInput.value='';}}function addMessage(text,type,isCEO=false){const div=document.createElement('div');div.className='msg '+type;if(isCEO){div.classList.add('ceo-sender');div.innerText='👑 CEO: '+text;}else{div.innerText=text;}messageArea.appendChild(div);messageArea.scrollTop=messageArea.scrollHeight;}function addAudioMessage(url,type,isCEO=false){const div=document.createElement('div');div.className='msg '+type;if(isCEO)div.classList.add('ceo-sender');const audio=document.createElement('audio');audio.controls=true;audio.src=url;div.appendChild(audio);messageArea.appendChild(div);messageArea.scrollTop=messageArea.scrollHeight;}</script></body></html>`);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});