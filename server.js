const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let branchesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'branches.json'), 'utf8'));
config.initBranchCounters(branchesData.branches);

let reviewReplies = [];

// API to get reply
app.post('/api/get-reply', (req, res) => {
  const { rating, branchId, customerName } = req.body;
  
  if (!rating || !branchId) {
    return res.status(400).json({ error: 'Rating and Branch ID are required' });
  }
  
  const branch = branchesData.branches.find(b => b.id === parseInt(branchId));
  if (!branch) {
    return res.status(404).json({ error: 'Branch not found' });
  }
  
  const ratingNum = parseInt(rating);
  const reply = config.getNextReply(ratingNum, branch.id);
  
  let finalReply = reply;
  if (customerName && customerName.trim()) {
    finalReply = `Dear ${customerName.trim()}, ${reply.charAt(0).toLowerCase() + reply.slice(1)}`;
  }
  
  const replyRecord = {
    id: reviewReplies.length + 1,
    branchId: branch.id,
    branchName: branch.name,
    rating: ratingNum,
    customerName: customerName || 'Anonymous',
    reply: finalReply,
    timestamp: new Date().toISOString()
  };
  
  reviewReplies.push(replyRecord);
  
  res.json({
    success: true,
    reply: finalReply,
    branch: branch.name,
    recordId: replyRecord.id
  });
});

// Get all replies
app.get('/api/replies', (req, res) => {
  res.json({
    total: reviewReplies.length,
    replies: reviewReplies.slice(-20).reverse()
  });
});

// Get all branches
app.get('/api/branches', (req, res) => {
  res.json(branchesData);
});

// Get round-robin status
app.get('/api/status', (req, res) => {
  res.json(config.getRoundRobinStatus());
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    branches: branchesData.branches.length,
    totalReplies: reviewReplies.length
  });
});

// Web Dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Usmanpura Imaging Centre - Review Bot</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Arial, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }
            .container {
                max-width: 1200px;
                margin: auto;
                background: white;
                border-radius: 20px;
                padding: 30px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            h1 { color: #2c3e50; margin-bottom: 10px; }
            .subtitle { color: #7f8c8d; margin-bottom: 20px; }
            .branch-list {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 8px;
                margin: 20px 0;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 10px;
                max-height: 300px;
                overflow-y: auto;
            }
            .branch-item {
                padding: 8px;
                background: white;
                border-radius: 5px;
                font-size: 12px;
                border-left: 3px solid #4CAF50;
            }
            .form-group {
                margin: 20px 0;
            }
            label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: #2c3e50;
            }
            select, input {
                width: 100%;
                padding: 12px;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                font-size: 14px;
            }
            select:focus, input:focus {
                outline: none;
                border-color: #4CAF50;
            }
            button {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 30px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                width: 100%;
            }
            button:hover { transform: translateY(-2px); }
            .result {
                margin-top: 20px;
                padding: 15px;
                background: #e8f5e9;
                border-radius: 8px;
                display: none;
                border-left: 4px solid #4CAF50;
            }
            .reply-item {
                background: #f9f9f9;
                padding: 15px;
                margin: 10px 0;
                border-radius: 8px;
                border-left: 4px solid #4CAF50;
            }
            .reply-branch { font-weight: bold; color: #2c3e50; }
            .reply-text { margin: 10px 0; color: #555; font-style: italic; }
            .reply-meta { font-size: 11px; color: #999; margin-top: 8px; }
            h3 { color: #2c3e50; margin: 20px 0 10px 0; }
            .badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
                margin-left: 10px;
            }
            .badge-positive { background: #d4edda; color: #155724; }
            .badge-negative { background: #f8d7da; color: #721c24; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🏥 Usmanpura Imaging Centre</h1>
            <div class="subtitle">Google Review Reply System | ${branchesData.branches.length} Branches Across Gujarat</div>
            
            <div style="background: #e3f2fd; padding: 15px; border-radius: 10px; margin: 20px 0;">
                <strong>🔄 Round-Robin Active:</strong> Each branch gets replies in rotation | 10 Positive + 10 Negative Templates
            </div>
            
            <details>
                <summary style="cursor: pointer; font-weight: bold;">📋 View All ${branchesData.branches.length} Branches</summary>
                <div class="branch-list">
                    ${branchesData.branches.map(b => `<div class="branch-item"><strong>${b.id}.</strong> ${b.name} <span style="color:#999;">(${b.city})</span></div>`).join('')}
                </div>
            </details>
            
            <h3>✍️ Generate Review Reply</h3>
            <form id="replyForm">
                <div class="form-group">
                    <label>🏢 Select Branch:</label>
                    <select id="branchId" required>
                        <option value="">-- Select a branch --</option>
                        ${branchesData.branches.map(b => `<option value="${b.id}">${b.id}. ${b.name}</option>`).join('')}
                    </select>
                </div>
                
                <div class="form-group">
                    <label>⭐ Rating:</label>
                    <select id="rating" required>
                        <option value="">-- Select rating --</option>
                        <option value="5">⭐⭐⭐⭐⭐ 5 Stars (Excellent)</option>
                        <option value="4">⭐⭐⭐⭐ 4 Stars (Good)</option>
                        <option value="3">⭐⭐⭐ 3 Stars (Average)</option>
                        <option value="2">⭐⭐ 2 Stars (Poor)</option>
                        <option value="1">⭐ 1 Star (Very Poor)</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>👤 Customer Name (Optional):</label>
                    <input type="text" id="customerName" placeholder="Enter customer name">
                </div>
                
                <button type="submit">🚀 Generate Reply (Round-Robin)</button>
            </form>
            
            <div id="result" class="result"></div>
            
            <h3>📝 Recent Replies</h3>
            <div id="recentReplies">Loading...</div>
        </div>
        
        <script>
            async function loadReplies() {
                try {
                    const response = await fetch('/api/replies');
                    const data = await response.json();
                    const repliesDiv = document.getElementById('recentReplies');
                    
                    if(data.replies.length === 0) {
                        repliesDiv.innerHTML = '<p style="text-align:center; color:#999;">No replies yet. Generate your first reply above!</p>';
                        return;
                    }
                    
                    repliesDiv.innerHTML = data.replies.map(reply => {
                        const ratingClass = reply.rating >= 4 ? 'badge-positive' : 'badge-negative';
                        return \`
                            <div class="reply-item">
                                <div class="reply-branch">
                                    🏥 \${reply.branchName}
                                    <span class="badge \${ratingClass}">\${reply.rating} ⭐</span>
                                </div>
                                <div class="reply-text">"\${reply.reply}"</div>
                                <div class="reply-meta">👤 \${reply.customerName} | 📅 \${new Date(reply.timestamp).toLocaleString('en-IN')}</div>
                            </div>
                        \`;
                    }).join('');
                } catch(e) {
                    console.error('Error:', e);
                }
            }
            
            document.getElementById('replyForm').onsubmit = async (e) => {
                e.preventDefault();
                
                const branchId = document.getElementById('branchId').value;
                const rating = document.getElementById('rating').value;
                const customerName = document.getElementById('customerName').value;
                
                const resultDiv = document.getElementById('result');
                resultDiv.style.display = 'block';
                resultDiv.innerHTML = '⏳ Generating reply using round-robin system...';
                resultDiv.style.background = '#fff3cd';
                
                try {
                    const response = await fetch('/api/get-reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ branchId, rating, customerName })
                    });
                    
                    const data = await response.json();
                    
                    if(data.success) {
                        resultDiv.style.background = '#e8f5e9';
                        resultDiv.innerHTML = \`
                            <strong>✅ Reply Generated Successfully!</strong><br><br>
                            <strong>Branch:</strong> \${data.branch}<br>
                            <strong>Rating:</strong> \${rating} ⭐<br><br>
                            <strong>Generated Reply:</strong><br>
                            <em>"\${data.reply}"</em><br><br>
                            <small>🔄 Round-robin template automatically selected | Record ID: \${data.recordId}</small>
                        \`;
                        loadReplies();
                        document.getElementById('customerName').value = '';
                    } else {
                        resultDiv.style.background = '#f8d7da';
                        resultDiv.innerHTML = \`<strong>❌ Error:</strong> \${data.error}\`;
                    }
                } catch(error) {
                    resultDiv.style.background = '#f8d7da';
                    resultDiv.innerHTML = \`<strong>❌ Error:</strong> \${error.message}\`;
                }
            };
            
            loadReplies();
            setInterval(loadReplies, 15000);
        </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🏥 Usmanpura Imaging Centre Review Bot');
  console.log('='.repeat(50));
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 Managing ${branchesData.branches.length} branches`);
  console.log(`🔄 Round-robin system active`);
  console.log('='.repeat(50));
});
