const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const BOTS = [
    { id: 'bot1', name: 'BotAccount1', status: 'idle' },
    { id: 'bot2', name: 'BotAccount2', status: 'idle' }
];

app.use(express.json());

// Player requests bot
app.post('/request-bot', (req, res) => {
    const { placeId, jobId, requester } = req.body;
    const availableBot = BOTS.find(b => b.status === 'idle');
    
    if (!availableBot) {
        return res.status(503).json({ error: 'No bots available' });
    }
    
    availableBot.status = 'busy';
    
    // Send to connected PC/VPS runner
    io.emit('bot-job', {
        botId: availableBot.id,
        botName: availableBot.name,
        placeId,
        jobId,
        requester
    });
    
    res.json({ 
        success: true, 
        message: `${availableBot.name} joining...`,
        eta: '30 seconds'
    });
    
    // Auto-free after 2 minutes
    setTimeout(() => {
        availableBot.status = 'idle';
        io.emit('bot-freed', availableBot.id);
    }, 120000);
});

// PC runner connects here
io.on('connection', (socket) => {
    console.log('Bot runner connected:', socket.id);
    
    socket.on('task-complete', (data) => {
        const bot = BOTS.find(b => b.id === data.botId);
        if (bot) bot.status = 'idle';
    });
});

// Health check
app.get('/ping', (req, res) => res.json({ 
    status: 'online',
    bots: BOTS.map(b => ({ name: b.name, status: b.status }))
}));

server.listen(PORT, () => console.log(`Controller on port ${PORT}`));
