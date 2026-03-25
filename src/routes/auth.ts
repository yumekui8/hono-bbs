import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  setupHandler,
  loginHandler,
  logoutHandler,
} from '../handlers/authHandler'
import { requireLogin } from '../middleware/auth'

const auth = new Hono<AppEnv>()

auth.post('/setup', setupHandler)
auth.post('/login', loginHandler)
auth.post('/logout', requireLogin, logoutHandler)

export default auth
