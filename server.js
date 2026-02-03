const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
const cooldowns = new Map();

app.post('/request-bot', async (req, res) => {
    const { placeId, jobId, requester, username } = req.body;
    const now = Date.now();
    
    if (cooldowns.has(requester) && now - cooldowns.get(requester) < 300000) {
        return res.status(429).json({ error: 'Wait 5 minutes' });
    }
    
    await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
            timestamp: new Date().toISOString(),
            placeId, jobId, requester, username,
            status: 'PENDING'
        }),
        headers: { 'Content-Type': 'application/json' }
    });
    
    cooldowns.set(requester, now);
    res.json({ success: true });
});

app.get('/ping', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
