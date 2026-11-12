const session = require('express-session')
const MongoStore = require('connect-mongo')
require('dotenv').config()

const options = {
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URL }),
  name: process.env.SESSION_COLLECTION,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
  },
}

const initSession = (app) => {
  app.use(session(options))
}

module.exports = {
  initSession,
}
