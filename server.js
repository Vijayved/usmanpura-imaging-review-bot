const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store replies in memory (for demo - use database in production)
let repliesHistory = [];

// Load branches
let branches = [];
try {
    const branchesData = fs.readFileSync('./branches.json', 'utf8');
    branches = JSON.parse(branchesData);
    console.log(`✅ Loaded ${branches.length} branches`);
} catch (error) {
    console.error('Error loading branches:', error);
    branches = [];
}

// API: Generate Reply
app.post('/api/get-reply', (req, res) => {
    try {
        const { branchId, reviewText, rating } = req.body;
        
        if (!branchId || !rating) {
            return res.status(400).json({ 
                error: 'Missing required fields: branchId and rating are required' 
            });
        }
        
        // Find branch
        const branch = branches.find(b => b.id === parseInt(branchId));
        if (!branch) {
            return res.status(404).json({ error: 'Branch not found' });
        }
        
        // Determine reply type based on rating
        const isPositive = rating >= 4;
        
        // Get reply using round-robin
        let reply;
        if (isPositive) {
            reply = config.getPositiveReply(branchId);
        } else {
            reply = config.getNegativeReply(branchId);
        }
        
        // Store in history
        const replyRecord = {
            id: Date.now(),
            branchId: branch.id,
            branchName: branch.name,
            rating: rating,
            reviewText: reviewText || '',
            reply: reply,
            timestamp: new Date().toISOString(),
            replyType: isPositive ? 'positive' : 'negative'
        };
        
        repliesHistory.unshift(replyRecord);
        
        // Keep only last 1000 records
        if (repliesHistory.length > 1000) {
            repliesHistory = repliesHistory.slice(0, 1000);
        }
        
        res.json({
            success: true,
            reply: reply,
            branch: branch.name,
            rating: rating,
            templateUsed: isPositive ? 'positive' : 'negative'
        });
        
    } catch (error) {
        console.error('Error generating reply:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API: Get Reply History
app.get('/api/replies', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({
        success: true,
        replies: repliesHistory.slice(0, limit),
        total: repliesHistory.length
    });
});

// API: Get All Branches
app.get('/api/branches', (req, res) => {
    res.json({
        success: true,
        branches: branches
    });
});

// API: Get Templates
app.get('/api/templates', (req, res) => {
    res.json({
        success: true,
        positiveTemplates: config.positiveReplies,
        negativeTemplates: config.negativeReplies,
        counters: config.getCounters()
    });
});

// API: Reset Counters (for testing)
app.post('/api/reset-counters', (req, res) => {
    try {
        config.resetCounters();
        res.json({ success: true, message: 'Counters reset successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset counters' });
    }
});

// Serve Dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        branches: branches.length,
        repliesGenerated: repliesHistory.length,
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🏥 Branches loaded: ${branches.length}`);
    console.log(`💬 Positive templates: ${config.positiveReplies.length}`);
    console.log(`💬 Negative templates: ${config.negativeReplies.length}`);
});
