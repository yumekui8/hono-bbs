import { Hono } from 'hono'
import type { AppEnv } from '../types'
import {
  getProfileHandler,
  updateProfileHandler,
  deleteProfileHandler,
} from '../handlers/profileHandler'
import { requireLogin } from '../middleware/auth'
import { requireTurnstile } from '../middleware/turnstile'

const profile = new Hono<AppEnv>()

profile.get('/', requireLogin, getProfileHandler)
profile.put('/', requireLogin, requireTurnstile, updateProfileHandler)
profile.delete('/', requireLogin, requireTurnstile, deleteProfileHandler)

export default profile
