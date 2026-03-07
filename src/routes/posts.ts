import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getPostsHandler, createPostHandler, deletePostHandler } from '../handlers/postHandler'
import { adminAuth } from '../middleware/adminAuth'
import { recaptcha } from '../middleware/recaptcha'

const posts = new Hono<AppEnv>()

posts.get('/', getPostsHandler)
posts.post('/', recaptcha, createPostHandler)
posts.delete('/:postId', adminAuth, deletePostHandler)

export default posts
