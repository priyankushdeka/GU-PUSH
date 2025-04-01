const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');

// Load environment variables
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const TOKENS_FILE = path.join(__dirname, 'tokens.txt');
let expoPushTokens = [];
let sentNotifications = [];

// Load tokens from file on startup
const loadTokens = async () => {
  try {
    const data = await fs.readFile(TOKENS_FILE, 'utf8');
    let lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const uniqueTokens = [...new Set(lines)];
    expoPushTokens = uniqueTokens;
    // Overwrite the file with unique tokens to prevent duplicates
    await fs.writeFile(TOKENS_FILE, uniqueTokens.join('\n') + '\n');
  } catch (err) {
    console.error('Error loading tokens, starting with empty array:', err);
    expoPushTokens = [];
  }
};

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Push Notifications is working !');
});

app.post("/save-token", async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).send("Token is required");

    if (!expoPushTokens.includes(token)) {
        expoPushTokens.push(token);
        try {
            await fs.appendFile(TOKENS_FILE, token + '\n');
            res.status(201).send("Token saved successfully");
        } catch (err) {
            console.error('Failed to save token to file:', err);
            res.status(500).send('Failed to save token');
        }
    } else {
        res.status(200).send("Token already exists");
    }
});

const fetchLatestNotices = async () => {
    try {
        const response = await axios.get('https://gauhati.ac.in/');
        if (typeof response.data === 'string') {
            const $ = cheerio.load(response.data);
            const latestNotices = [];
            $('.latestnotifications .sidebar_post ul li').each((index, element) => {
                const title = $(element).find('.title a').text().trim();
                const url = $(element).find('.title a').attr('href');
                const date = $(element).find('.date').text().trim();
                latestNotices.push({ title, url, date });
            });
            return latestNotices;
        } else {
            throw new Error('Unexpected response format');
        }
    } catch (error) {
        console.error('Failed to fetch latest notices:', error.message);
        return [];
    }
};

const sendPushNotification = async (notice) => {
    try {
        const messages = expoPushTokens.map((token) => ({
            to: token,
            sound: "default",
            title: "New Notice Published 😊!",
            body: notice.title,
            data: { url: notice.url },
        }));
        const response = await axios.post("https://exp.host/--/api/v2/push/send", messages);
        console.log(`Notifications sent for notice: ${notice.title}`, response.data);
    } catch (error) {
        console.error('Failed to send push notification:', error.message);
    }
};

const checkForNewNotices = async () => {
    const latestNotices = await fetchLatestNotices();

    const currentDate = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
    const testDate = '03/03/2025';

    for (const notice of latestNotices) {
        console.log('Checking notice:', notice);
        if (notice.date === currentDate && !sentNotifications.some(n => n.title === notice.title)) {
            await sendPushNotification(notice);
            sentNotifications.push({ title: notice.title, date: new Date() });
            console.log('Notification sent for:', notice.title);
        }
    }

    // Remove notifications older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    sentNotifications = sentNotifications.filter(notification => notification.date > oneDayAgo);
};

// Initialize tokens and start server
(async () => {
  await loadTokens();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    setInterval(checkForNewNotices, 5 * 60 * 1000);
  });
})();
