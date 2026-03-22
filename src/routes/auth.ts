import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getSetupInfoHandler,
  setupHandler,
  getLoginInfoHandler,
  loginHandler,
  getLogoutInfoHandler,
  logoutHandler,
} from '../handlers/authHandler'

const auth = new Hono<AppEnv>()

auth.get('/setup', getSetupInfoHandler)
auth.post('/setup', setupHandler)

auth.get('/login', getLoginInfoHandler)
auth.post('/login', loginHandler)

auth.get('/logout', getLogoutInfoHandler)
auth.post('/logout', logoutHandler)

export default auth
