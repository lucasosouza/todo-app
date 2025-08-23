const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Validate and sanitize hash
function sanitizeHash(hash) {
    if (!hash || typeof hash !== 'string') {
        return null;
    }
    // Allow only alphanumeric characters, convert to lowercase
    const sanitized = hash.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Ensure hash is between 6 and 20 characters
    if (sanitized.length < 6 || sanitized.length > 20) {
        return null;
    }
    return sanitized;
}

// Health check endpoint
app.get('/api/sync/status', (req, res) => {
    res.json({ 
        status: 'online', 
        serverTime: Date.now(),
        version: '2.0.0' // Updated version for multi-user support
    });
});

// Check if hash exists
app.get('/api/sync/check/:hash', async (req, res) => {
    try {
        const hash = sanitizeHash(req.params.hash);
        
        if (!hash) {
            return res.status(400).json({ 
                exists: false, 
                error: 'Invalid hash format' 
            });
        }
        
        const dataPath = path.join(DATA_DIR, `${hash}.json`);
        const exists = await fs.pathExists(dataPath);
        
        res.json({ 
            exists,
            hash 
        });
    } catch (error) {
        console.error('Error checking hash:', error);
        res.status(500).json({ error: 'Failed to check hash' });
    }
});

// Get sync data for specific hash
app.get('/api/sync/data/:hash', async (req, res) => {
    try {
        const hash = sanitizeHash(req.params.hash);
        
        if (!hash) {
            return res.status(400).json({ error: 'Invalid hash format' });
        }
        
        const dataPath = path.join(DATA_DIR, `${hash}.json`);
        
        // Check if file exists
        if (!await fs.pathExists(dataPath)) {
            // Return empty data with zero timestamp
            return res.json({
                timestamp: 0,
                hash,
                data: {
                    workspaceSettings: null,
                    boards: [],
                    cards: {}
                }
            });
        }
        
        // Read and return existing data
        const syncData = await fs.readJson(dataPath);
        syncData.hash = hash; // Include hash in response
        res.json(syncData);
    } catch (error) {
        console.error('Error reading sync data:', error);
        res.status(500).json({ error: 'Failed to read sync data' });
    }
});

// Update sync data for specific hash
app.post('/api/sync/data/:hash', async (req, res) => {
    try {
        const hash = sanitizeHash(req.params.hash);
        
        if (!hash) {
            return res.status(400).json({ error: 'Invalid hash format' });
        }
        
        const { timestamp, data } = req.body;
        
        // Validate request
        if (!timestamp || !data) {
            return res.status(400).json({ error: 'Missing timestamp or data' });
        }
        
        const dataPath = path.join(DATA_DIR, `${hash}.json`);
        
        // Check if existing data is newer
        if (await fs.pathExists(dataPath)) {
            const existingData = await fs.readJson(dataPath);
            
            if (existingData.timestamp > timestamp) {
                // Server data is newer, don't update
                return res.json({
                    success: false,
                    message: 'Server data is newer',
                    serverTimestamp: existingData.timestamp,
                    clientTimestamp: timestamp
                });
            }
        }
        
        // Save new data
        const syncData = {
            timestamp,
            data,
            hash,
            lastUpdated: new Date().toISOString()
        };
        
        await fs.writeJson(dataPath, syncData, { spaces: 2 });
        
        res.json({
            success: true,
            message: 'Data synced successfully',
            timestamp,
            hash
        });
    } catch (error) {
        console.error('Error saving sync data:', error);
        res.status(500).json({ error: 'Failed to save sync data' });
    }
});

// Legacy endpoints for backward compatibility (redirect to default hash)
app.get('/api/sync/data', async (req, res) => {
    res.status(400).json({ 
        error: 'Hash required. Please update your client to version 2.0' 
    });
});

app.post('/api/sync/data', async (req, res) => {
    res.status(400).json({ 
        error: 'Hash required. Please update your client to version 2.0' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Sync server running on http://localhost:${PORT}`);
    console.log(`📁 Data directory: ${DATA_DIR}`);
    console.log(`🔐 Multi-user mode enabled with hash-based isolation`);
});