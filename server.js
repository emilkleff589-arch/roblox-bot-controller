const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: '*' },
    transports: ['websocket', 'polling']
});

// BOT CONFIG - Add your bot names here
const BOTS = [
    { id: 'bot1', name: 'BotAccount1', status: 'offline', lastUsed: 0 },
    { id: 'bot2', name: 'BotAccount2', status: 'offline', lastUsed: 0 },
    { id: 'bot3', name: 'BotAccount3', status: 'offline', lastUsed: 0 }
];

let currentBotIndex = -1; // Tracks last used bot
let isProcessing = false; // Only 1 bot at a time

// Middleware
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// GET next bot (rotation logic)
function getNextBot() {
    // Find available bots (online + idle)
    const available = BOTS.filter(b => 
        b.status === 'online' && 
        b.status !== 'busy'
    );
    
    if (available.length === 0) return null;
    
    // Sort by last used (oldest first)
    available.sort((a, b) => a.lastUsed - b.lastUsed);
    
    // Pick the one used longest ago
    const selected = available[0];
    selected.status = 'busy';
    selected.lastUsed = Date.now();
    currentBotIndex = BOTS.findIndex(b => b.id === selected.id);
    
    return selected;
}

// Player requests bot
app.post('/request-bot', (req, res) => {
    const { placeId, jobId, requester, username } = req.body;
    
    // Check if bot already running
    if (isProcessing) {
        const busyBot = BOTS.find(b => b.status === 'busy');
        return res.status(503).json({ 
            error: `Bot ${busyBot?.name || 'unknown'} is currently busy`,
            retryAfter: 30
        });
    }
    
    const bot = getNextBot();
    if (!bot) {
        return res.status(503).json({ 
            error: 'No bots available. Make sure your PC is running the bot script.',
            botsStatus: BOTS.map(b => ({ name: b.name, status: b.status }))
        });
    }
    
    isProcessing = true;
    
    // Send to PC runner
    io.emit('bot-job', {
        botId: bot.id,
        botName: bot.name,
        placeId,
        jobId,
        requester,
        username: username || 'Unknown'
    });
    
    // Auto-release after 3 minutes (safety)
    setTimeout(() => {
        if (bot.status === 'busy') {
            bot.status = 'online';
            isProcessing = false;
            io.emit('bot-timeout', bot.id);
        }
    }, 180000);
    
    res.json({ 
        success: true, 
        message: `${bot.name} is joining your game...`,
        botName: bot.name,
        eta: '20-30 seconds'
    });
});

// Health check
app.get('/status', (req, res) => {
    res.json({ 
        online: true,
        isProcessing,
        bots: BOTS.map(b => ({
            name: b.name,
            status: b.status,
            lastUsed: b.lastUsed ? new Date(b.lastUsed).toLocaleTimeString() : 'Never'
        })),
        lastBot: currentBotIndex >= 0 ? BOTS[currentBotIndex].name : 'None'
    });
});

app.get('/ping', (req, res) => res.send('OK'));

// Socket.IO handling
io.on('connection', (socket) => {
    console.log('Bot runner connected:', socket.id);
    
    // Runner tells us which bots it has
    socket.on('register-bots', (botIds) => {
        botIds.forEach(id => {
            const bot = BOTS.find(b => b.id === id);
            if (bot) {
                bot.status = 'online';
                console.log(`[+] ${bot.name} registered`);
            }
        });
        io.emit('status-update', BOTS);
    });
    
    // Task completed
    socket.on('task-complete', (data) => {
        const bot = BOTS.find(b => b.id === data.botId);
        if (bot) {
            bot.status = 'online';
            console.log(`[+] ${bot.name} completed task`);
        }
        isProcessing = false;
        io.emit('status-update', BOTS);
    });
    
    // Task failed
    socket.on('task-failed', (data) => {
        const bot = BOTS.find(b => b.id === data.botId);
        if (bot) {
            bot.status = 'online';
            console.log(`[-] ${bot.name} failed: ${data.error}`);
        }
        isProcessing = false;
        io.emit('status-update', BOTS);
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        console.log('[-] Runner disconnected');
        BOTS.forEach(b => b.status = 'offline');
        isProcessing = false;
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[+] Bot Controller on port ${PORT}`);
    console.log(`[+] Waiting for PC runner to connect...`);
});
