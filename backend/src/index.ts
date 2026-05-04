import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import pool from './config/db'
import path from 'path'
import fs from 'fs'

import authRoutes from './routes/auth'
import applicationRoutes from './routes/applications'
import adminRoutes from './routes/admin'
import enrollmentRoutes from './routes/enrollment'
import { requireAuth } from './middleware/auth'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

const corsOptions = {
    origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:13000',
    'http://localhost:13001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}

// ✅ OPTIONS ต้องอยู่ก่อน — ให้ตอบ preflight ได้
app.options('*', cors(corsOptions))
app.use(cors(corsOptions))

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/applications', applicationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/enrollments', enrollmentRoutes) 

app.use('/uploads', async (req, res, next) => {
  try {
    const uploadsDir = path.resolve(__dirname, '../uploads')

    // Strip to basename only — prevents any directory traversal
    const requestedFile = path.basename(decodeURIComponent(req.path))

    // Reject filenames with path separators or suspicious patterns after basename extraction
    if (!requestedFile || requestedFile === '.' || requestedFile === '..') {
      return res.status(400).json({ success: false, message: 'Invalid filename' })
    }

    // Serve exact match first
    const exactPath = path.join(uploadsDir, requestedFile)
    if (exactPath.startsWith(uploadsDir) && fs.existsSync(exactPath)) {
      return res.sendFile(exactPath)
    }

    // Fallback: look up in database by filename to handle Thai filename encoding issues
    try {
      const result = await pool.query(
        `SELECT file_name FROM documents WHERE file_name = $1 LIMIT 1`,
        [requestedFile]
      )

      if (result.rows.length > 0) {
        const dbFileName = result.rows[0].file_name
        const dbFilePath = path.join(uploadsDir, path.basename(dbFileName))
        if (dbFilePath.startsWith(uploadsDir) && fs.existsSync(dbFilePath)) {
          return res.sendFile(dbFilePath)
        }
      }
    } catch (dbError: any) {
      console.log('DB lookup failed for file:', requestedFile, dbError.message)
    }

    res.status(404).json({ success: false, message: 'File not found' })
  } catch (error) {
    console.error('Upload middleware error:', error)
    next(error)
  }
})

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ success: true, message: 'Server running', db: 'connected' })
  } catch {
    res.status(500).json({ success: false, message: 'DB connection failed' })
  }
})


app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})