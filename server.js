const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const axios = require('axios');
const { JWT } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store data
let repliesHistory = [];
let webhookLogs = [];
let accessToken = null;
let tokenExpiry = null;

// Google Connection Status
let googleConnectionStatus = {
    connected: false,
    lastCheck: null,
    error: null,
    accountInfo: null
};

// Reply Counters
let replyStats = {
    totalRepliesGenerated: 0,
    totalAutoReplies: 0,
    totalManualReplies: 0,
    totalPosted: 0,
    byRating: { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 },
    byBranch: {},
    last24Hours: []
};

// Load branches
let branches = [];
try {
    const branchesData = fs.readFileSync('./branches.json', 'utf8');
    branches = JSON.parse(branchesData);
    console.log(`✅ Loaded ${branches.length} branches`);
    
    branches.forEach(branch => {
        replyStats.byBranch[branch.id] = {
            name: branch.name,
            total: 0,
            positive: 0,
            negative: 0,
            lastReply: null
        };
    });
} catch (error) {
    console.error('Error loading branches:', error);
    branches = [];
}

// ============= GET GOOGLE ACCESS TOKEN =============
async function getGoogleAccessToken() {
    try {
        if (!process.env.GOOGLE_CREDENTIALS) {
            throw new Error('GOOGLE_CREDENTIALS not set');
        }
        
        // Check if token is still valid
        if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
            return accessToken;
        }
        
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        
        const client = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/business.manage']
        });
        
        const response = await client.authorize();
        accessToken = response.access_token;
        tokenExpiry = Date.now() + (response.expiry_date || 3600000);
        
        console.log('✅ Google Access Token obtained');
        return accessToken;
        
    } catch (error) {
        console.error('❌ Failed to get token:', error.message);
        throw error;
    }
}

// ============= INITIALIZE GOOGLE CONNECTION =============
async function initializeGoogleAPI() {
    try {
        console.log('📡 Testing Google Business API connection...');
        
        const token = await getGoogleAccessToken();
        
        // Test by listing accounts
        const response = await axios.get(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    }
);
        
        const accounts = response.data.accounts || [];
        console.log(`✅ Found ${accounts.length} Google Business accounts`);
        
        googleConnectionStatus = {
            connected: true,
            lastCheck: new Date().toISOString(),
            error: null,
            accountInfo: {
                accountCount: accounts.length,
                accounts: accounts.map(a => ({ name: a.accountName, type: a.type }))
            }
        };
        
        return true;
        
    } catch (error) {
        console.error('❌ Google API connection failed:', error.response?.data || error.message);
        googleConnectionStatus = {
            connected: false,
            lastCheck: new Date().toISOString(),
            error: error.response?.data?.error?.message || error.message,
            accountInfo: null
        };
        return false;
    }
}

// ============= POST REPLY TO GOOGLE =============
async function postReplyToGoogle(reviewName, replyText) {
    try {
        const token = await getGoogleAccessToken();
        
        // reviewName format: accounts/{accountId}/locations/{locationId}/reviews/{reviewId}
        const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${reviewName}/reply`;

const response = await axios.put(
    url,
    { comment: replyText },
    {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    }
);
        
        console.log(`✅ Reply posted to ${reviewName}`);
        return response.data;
        
    } catch (error) {
        console.error('❌ Failed to post reply:', error.response?.data || error.message);
        throw error;
    }
}

// ============= PROCESS REVIEW =============
async function processReviewAutomatically(reviewData) {
    try {
        const { reviewId, reviewerName, starRating, comment, locationName, reviewName } = reviewData;
        
        let branchId = findBranchId(locationName);
        if (!branchId) branchId = 1;
        
        const branch = branches.find(b => b.id === branchId);
        const rating = starRating || 5;
        const isPositive = rating >= 4;
        
        let reply = isPositive ? config.getPositiveReply(branchId) : config.getNegativeReply(branchId);
        
        if (reviewerName && reviewerName !== 'Anonymous') {
            reply = `Dear ${reviewerName}, ${reply}`;
        }
        
        let posted = false;
        
        // Try to post automatically
        if (reviewName && !reviewId?.startsWith('test_')) {
            try {
                await postReplyToGoogle(reviewName, reply);
                posted = true;
                console.log(`✅ Auto-reply posted`);
            } catch (error) {
                console.log(`⚠️ Auto-post failed, manual reply generated`);
            }
        }
        
        const replyRecord = {
            id: Date.now(),
            reviewId: reviewId,
            branchId: branchId,
            branchName: branch ? branch.name : locationName,
            rating: rating,
            reviewText: comment,
            reply: reply,
            timestamp: new Date().toISOString(),
            replyType: isPositive ? 'positive' : 'negative',
            autoGenerated: true,
            posted: posted
        };
        
        repliesHistory.unshift(replyRecord);
        if (repliesHistory.length > 1000) repliesHistory = repliesHistory.slice(0, 1000);
        
        updateReplyStats(replyRecord);
        
        return { branchId, branchName: branch?.name, rating, reply, posted };
        
    } catch (error) {
        console.error('Error processing:', error);
        throw error;
    }
}

// ============= UPDATE STATS =============
function updateReplyStats(replyRecord) {
    replyStats.totalRepliesGenerated++;
    if (replyRecord.autoGenerated) replyStats.totalAutoReplies++;
    else replyStats.totalManualReplies++;
    if (replyRecord.posted) replyStats.totalPosted++;
    
    const ratingKey = replyRecord.rating.toString();
    if (replyStats.byRating[ratingKey]) replyStats.byRating[ratingKey]++;
    
    if (replyStats.byBranch[replyRecord.branchId]) {
        replyStats.byBranch[replyRecord.branchId].total++;
        if (replyRecord.rating >= 4) replyStats.byBranch[replyRecord.branchId].positive++;
        else replyStats.byBranch[replyRecord.branchId].negative++;
        replyStats.byBranch[replyRecord.branchId].lastReply = replyRecord.timestamp;
    }
    
    replyStats.last24Hours.unshift({
        timestamp: replyRecord.timestamp,
        branchName: replyRecord.branchName,
        rating: replyRecord.rating,
        autoGenerated: replyRecord.autoGenerated,
        posted: replyRecord.posted
    });
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    replyStats.last24Hours = replyStats.last24Hours.filter(r => new Date(r.timestamp) > oneDayAgo);
}

// ============= HELPER =============
function findBranchId(locationName) {
    if (!locationName) return null;
    const branchMapping = {
        'Mavdi': 1, 'Rajkot': 1, 'Nadiad': 2, 'Anand': 3, 'Changodar': 4,
        'Bareja': 5, 'Morbi': 6, 'Usmanpura': 7, 'Satellite': 8, 'Juhapura': 9,
        'Vadaj': 10, 'Sabarmati': 11, 'Naroda': 12, 'Maninagar': 13,
        'Gandhinagar': 14, 'Bapunagar': 15
    };
    for (const [key, id] of Object.entries(branchMapping)) {
        if (locationName.toLowerCase().includes(key.toLowerCase())) return id;
    }
    return null;
}

// ============= API ENDPOINTS =============
app.get('/api/google-status', (req, res) => {
    res.json({ success: true, status: googleConnectionStatus });
});

app.get('/api/reply-stats', (req, res) => {
    res.json({ success: true, stats: replyStats });
});

app.post('/api/get-reply', (req, res) => {
    try {
        const { branchId, reviewText, rating } = req.body;
        if (!branchId || !rating) {
            return res.status(400).json({ error: 'Missing branchId or rating' });
        }
        
        const branch = branches.find(b => b.id === parseInt(branchId));
        if (!branch) return res.status(404).json({ error: 'Branch not found' });
        
        const isPositive = rating >= 4;
        let reply = isPositive ? config.getPositiveReply(branchId) : config.getNegativeReply(branchId);
        
        const replyRecord = {
            id: Date.now(),
            branchId: branch.id,
            branchName: branch.name,
            rating: rating,
            reviewText: reviewText || '',
            reply: reply,
            timestamp: new Date().toISOString(),
            replyType: isPositive ? 'positive' : 'negative',
            autoGenerated: false,
            posted: false
        };
        
        repliesHistory.unshift(replyRecord);
        if (repliesHistory.length > 1000) repliesHistory = repliesHistory.slice(0, 1000);
        updateReplyStats(replyRecord);
        
        res.json({ success: true, reply: reply, branch: branch.name, rating: rating });
        
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/replies', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({ success: true, replies: repliesHistory.slice(0, limit), total: repliesHistory.length });
});

app.get('/api/webhook-logs', (req, res) => {
    res.json({ success: true, logs: webhookLogs.slice(0, 50), total: webhookLogs.length });
});

app.get('/api/branches', (req, res) => {
    res.json({ success: true, branches: branches });
});

app.get('/api/templates', (req, res) => {
    res.json({
        success: true,
        positiveTemplates: config.positiveReplies,
        negativeTemplates: config.negativeReplies,
        counters: config.getCounters()
    });
});

app.post('/api/test-webhook', async (req, res) => {
    const testReview = {
        reviewId: `test_${Date.now()}`,
        reviewerName: "Test Customer",
        starRating: req.body.rating || 5,
        comment: req.body.comment || "Test review comment",
        locationName: req.body.locationName || "Usmanpura Imaging Centre Mavdi, Rajkot",
        reviewName: "test_review_name",
        createTime: new Date().toISOString()
    };
    
    const result = await processReviewAutomatically(testReview);
    res.json({ success: true, message: "Test webhook triggered", result });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        branches: branches.length,
        repliesGenerated: replyStats.totalRepliesGenerated,
        googleConnected: googleConnectionStatus.connected,
        timestamp: new Date().toISOString()
    });
});

// ============= START SERVER =============
async function startServer() {
    await initializeGoogleAPI();
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 Dashboard: https://usmanpura-imaging-review-bot.onrender.com`);
        console.log(`🤖 Google API: ${googleConnectionStatus.connected ? '✅ Connected' : '⚠️ Not connected'}`);
    });
}

startServer();
