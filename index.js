require('dotenv').config()

const express = require('express')
const nunjucks = require('nunjucks')
const https = require('https')
const axios = require('axios')
var dateFilter = require('nunjucks-date-filter')
var markdown = require('nunjucks-markdown')
var marked = require('marked')
var Recaptcha = require('express-recaptcha').RecaptchaV3
const bodyParser = require('body-parser')
const lunr = require('lunr')
const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const config = require('./app/config')
const puppeteer = require('puppeteer');
const glob = require('glob');
const forceHttps = require('express-force-https');
const compression = require('compression');

const airtable = require('airtable');
const base = new airtable({ apiKey: process.env.airtableFeedbackKey }).base(process.env.airtableFeedbackBase);

const helmet = require('helmet');

const favicon = require('serve-favicon');

const PageIndex = require('./middleware/pageIndex')
const pageIndex = new PageIndex(config)

var NotifyClient = require('notifications-node-client').NotifyClient


const app = express()
app.use(compression());

const notify = new NotifyClient(process.env.notifyKey)
const recaptcha = new Recaptcha(
  process.env.recaptchaPublic,
  process.env.recaptchaSecret,
  { callback: 'cb' },
)



app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(favicon(path.join(__dirname, 'public/assets/images', 'favicon.ico')));

app.set('view engine', 'html')

app.locals.serviceName = config.serviceName
app.locals.recaptchaPublic = process.env.recaptchaPublic



// Set up Nunjucks as the template engine
var nunjuckEnv = nunjucks.configure(
  [
    'app/views',
    'node_modules/govuk-frontend',
    'node_modules/dfe-frontend-alpha/packages/components',
  ],
  {
    autoescape: true,
    express: app,
  },
)

nunjuckEnv.addFilter('date', dateFilter)
markdown.register(nunjuckEnv, marked.parse)

nunjuckEnv.addFilter('formatNumber', function (number) {
  return number.toLocaleString();
});

app.use(forceHttps);

// Set up static file serving for the app's assets
app.use('/assets', express.static('public/assets'))

app.use((req, res, next) => {
  if (req.url.endsWith('/') && req.url.length > 1) {
    const canonicalUrl = req.url.slice(0, -1);
    res.set('Link', `<${canonicalUrl}>; rel="canonical"`);
  }
  next();
});

// Render sitemap.xml in XML format
app.get('/sitemap.xml', (_, res) => {
  res.set({ 'Content-Type': 'application/xml' });
  res.render('sitemap.xml');
});

app.get('/robots.txt', (_, res) => {
  res.set({ 'Content-Type': 'text/plain' });
  res.render('robots.txt');
});

app.get('/downloads/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "/app/assets/downloads/" + filename);
  // Set appropriate headers
  //  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  // Send the file
  res.sendFile(filePath);
});

app.get('/search', (req, res) => {
  console.log(req.query['searchterm'])
  const query = req.query['searchterm'] || ''
  const resultsPerPage = 10
  let currentPage = parseInt(req.query.page, 10)
  const results = pageIndex.search(query)
  console.log('Results: ' + results)
  console.log('Query: ' + query)

  const maxPage = Math.ceil(results.length / resultsPerPage)
  if (!Number.isInteger(currentPage)) {
    currentPage = 1
  } else if (currentPage > maxPage || currentPage < 1) {
    currentPage = 1
  }

  const startingIndex = resultsPerPage * (currentPage - 1)
  const endingIndex = startingIndex + resultsPerPage

  res.render('search.html', {
    currentPage,
    maxPage,
    query,
    results: results.slice(startingIndex, endingIndex),
    resultsLen: results.length,
  })
})

if (config.env !== 'development') {
  setTimeout(() => {
    pageIndex.init()
  }, 2000)
}

// Route for handling Yes/No feedback submissions
app.post('/form-response/helpful', (req, res) => {
  const { response } = req.body;
  const service = "User research manual";
  const pageURL = req.headers.referer || 'Unknown';
  const date = new Date().toISOString();

  base('Data').create([
      {
          "fields": {
              "Response": response,
              "Service": service,
              "URL": pageURL
          }
      }
  ], function(err) {
      if (err) {
          console.error(err);
          return res.status(500).send('Error saving to Airtable');
      }
      res.json({ success: true, message: 'Feedback submitted successfully' });
  });
});

// New route for handling detailed feedback submissions
app.post('/form-response/feedback', (req, res) => {
  const { response } = req.body;
  
  const service = "User research manual"; // Example service name
  const pageURL = req.headers.referer || 'Unknown'; // Attempt to capture the referrer URL
  const date = new Date().toISOString();

  base('Feedback').create([{
      "fields": {
          "Feedback": response,
          "Service": service,
          "URL": pageURL
      }
  }], function(err) {
      if (err) {
          console.error(err);
          return res.status(500).send('Error saving to Airtable');
      }
      res.json({ success: true, message: 'Feedback submitted successfully' });
  });
});


app.get(/\.html?$/i, function (req, res) {
  var path = req.path
  var parts = path.split('.')
  parts.pop()
  path = parts.join('.')
  res.redirect(path)
})

app.get(/^([^.]+)$/, function (req, res, next) {
  matchRoutes(req, res, next)
})

// Handle 404 errors
app.use(function (req, res, next) {
  res.status(404).render('error.html')
})

// Handle 500 errors
app.use(function (err, req, res, next) {
  console.error(err.stack)
  res.status(500).render('error.html')
})

// Try to match a request to a template, for example a request for /test
// would look for /app/views/test.html
// and /app/views/test/index.html

function renderPath(path, res, next) {
  // Try to render the path
  res.render(path, function (error, html) {
    if (!error) {
      // Success - send the response
      res.set({ 'Content-type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (!error.message.startsWith('template not found')) {
      // We got an error other than template not found - call next with the error
      next(error)
      return
    }
    if (!path.endsWith('/index')) {
      // Maybe it's a folder - try to render [path]/index.html
      renderPath(path + '/index', res, next)
      return
    }
    // We got template not found both times - call next to trigger the 404 page
    next()
  })
}

matchRoutes = function (req, res, next) {
  var path = req.path

  // Remove the first slash, render won't work with it
  path = path.substr(1)

  // If it's blank, render the root index
  if (path === '') {
    path = 'index'
  }

  renderPath(path, res, next)
}

// Start the server

// // Run application on configured port
// if (config.env === 'development') {
//   app.listen(config.port - 50, () => {
//   });
// } else {
//   app.listen(config.port);
// }

app.listen(config.port)
