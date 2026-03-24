require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const cookieParser = require('cookie-parser');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.set('view engine', 'ejs');

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set true only in HTTPS
}));

// OAuth Client
function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage'
];

// Home
app.get('/', (req, res) => {
  if (req.session.tokens) {
    return res.render('index', { authenticated: true });
  }

  const client = createOAuth2Client();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  res.render('index', { authenticated: false, authUrl: url });
});

// OAuth callback
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);

    req.session.tokens = tokens;
    res.redirect('/');
  } catch (error) {
    console.error('OAuth Error:', error.message);
    res.status(500).send('Authentication failed');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Accounts
app.get('/accounts', async (req, res) => {
  if (!req.session.tokens) return res.redirect('/');

  const client = createOAuth2Client();
  client.setCredentials(req.session.tokens);

  try {
    const mybusiness = google.mybusinessaccountmanagement('v1');

    const response = await mybusiness.accounts.list({ auth: client });
    const accounts = response?.data?.accounts || [];

    res.render('accounts', { accounts });
  } catch (error) {
    console.error('Accounts Error:', error.message);
    res.status(500).send('Error fetching accounts');
  }
});

// Locations
app.get('/locations', async (req, res) => {
  if (!req.session.tokens) return res.redirect('/');

  const accountName = req.query.account;
  if (!accountName) {
    return res.status(400).send('Missing account parameter');
  }

  const client = createOAuth2Client();
  client.setCredentials(req.session.tokens);

  try {
    const mybusiness = google.mybusinessbusinessinformation('v1');

    const response = await mybusiness.accounts.locations.list({
      parent: accountName,
      readMask: 'name,title',
      auth: client
    });

    const locations = response?.data?.locations || [];

    res.render('locations', { locations, accountName });
  } catch (error) {
    console.error('Locations Error:', error.message);
    res.status(500).send('Error fetching locations');
  }
});

// Reviews
app.get('/reviews', async (req, res) => {
  if (!req.session.tokens) return res.redirect('/');

  const locationName = req.query.location;
  if (!locationName) {
    return res.status(400).send('Missing location parameter');
  }

  const client = createOAuth2Client();
  client.setCredentials(req.session.tokens);

  try {
    const url = `https://mybusiness.googleapis.com/v4/${locationName}/reviews`;

    const response = await client.request({ url });
    const reviews = response?.data?.reviews || [];

    res.render('reviews', { reviews, locationName });
  } catch (error) {
    console.error('Reviews Error:', error.message);
    res.status(500).send('Error fetching reviews');
  }
});

// Auto Reply
app.post('/auto-reply', async (req, res) => {
  if (!req.session.tokens) return res.redirect('/');

  const { location } = req.body;
  if (!location) {
    return res.status(400).send('Missing location');
  }

  const client = createOAuth2Client();
  client.setCredentials(req.session.tokens);

  try {
    const listUrl = `https://mybusiness.googleapis.com/v4/${location}/reviews`;
    const response = await client.request({ url: listUrl });

    const reviews = response?.data?.reviews || [];

    for (const review of reviews) {
      if (review.starRating === 'FIVE' && !review.reviewReply) {
        const replyUrl = `https://mybusiness.googleapis.com/v4/${review.name}/reply`;

        await client.request({
          url: replyUrl,
          method: 'PUT',
          data: {
            comment: 'Thank you for your 5-star review! We appreciate your feedback.'
          }
        });
      }
    }

    res.redirect(`/reviews?location=${location}`);
  } catch (error) {
    console.error('Auto Reply Error:', error.message);
    res.status(500).send('Error in auto-reply');
  }
});

// Manual Reply
app.post('/reply', async (req, res) => {
  if (!req.session.tokens) return res.redirect('/');

  const { location, review, comment } = req.body;

  if (!location || !review || !comment) {
    return res.status(400).send('Missing required fields');
  }

  const client = createOAuth2Client();
  client.setCredentials(req.session.tokens);

  try {
    const url = `https://mybusiness.googleapis.com/v4/${review}/reply`;

    await client.request({
      url,
      method: 'PUT',
      data: { comment }
    });

    res.redirect(`/reviews?location=${location}`);
  } catch (error) {
    console.error('Reply Error:', error.message);
    res.status(500).send('Error posting reply');
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
