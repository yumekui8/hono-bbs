import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  turnstilePageHandler,
  turnstileVerifyHandler,
  setupHandler,
  registerHandler,
  loginHandler,
  logoutHandler,
} from '../handlers/authHandler'
import { requireTurnstile } from '../middleware/turnstile'

const auth = new Hono<AppEnv>()

auth.get('/turnstile', turnstilePageHandler)
auth.post('/turnstile', turnstileVerifyHandler)
auth.post('/setup', setupHandler)
auth.post('/signup', requireTurnstile, registerHandler)
auth.post('/signin', requireTurnstile, loginHandler)
auth.post('/logout', logoutHandler)

export default auth
