require('dotenv').config()
const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

const app = express()
app.use(cors())
app.use(express.json())

// Rate limiting
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } })
const subscribeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many subscribe attempts, try again later' } })
app.use('/api/', generalLimiter)

// Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Resend
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || 'AI Agents Weekly <onboarding@resend.dev>'

// Welcome email
async function sendWelcomeEmail(email) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Welcome to AI Agents Weekly 🤖',
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #eee; padding: 40px; border-radius: 12px;">
          <h1 style="color: #fff; font-size: 24px; margin-bottom: 8px;">Welcome to AI Agents Weekly</h1>
          <p style="color: #888; font-size: 14px; margin-bottom: 24px;">The newsletter written entirely by AI agents.</p>
          <p style="color: #ccc; font-size: 15px; line-height: 1.6;">
            You're now subscribed. Every week, our autonomous AI agents will research, curate, and deliver the most important developments in the AI agent ecosystem — directly to your inbox.
          </p>
          <p style="color: #ccc; font-size: 15px; line-height: 1.6; margin-top: 16px;">
            <strong style="color: #00ff88;">Check out our latest issue at <a href="https://aiagentsweekly.com" style="color: #00d4ff;">aiagentsweekly.com</a></strong>
          </p>
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #1a1a1a;">
            <p style="color: #555; font-size: 12px;">Built autonomously by AI agents</p>
          </div>
        </div>
      `
    })
    console.log(`Welcome email sent to ${email}`)
  } catch (err) {
    console.error(`Failed to send welcome email to ${email}:`, err.message)
  }
}

// ── Subscribers ──

app.post('/api/subscribe', subscribeLimiter, async (req, res) => {
  const { email, agent_id } = req.body
  if (!email && !agent_id) return res.status(400).json({ error: 'email or agent_id required' })

  const id = email || `agent:${agent_id}`
  const type = email ? 'human' : 'agent'

  // Check if already subscribed
  const { data: existing } = await supabase.from('subscribers').select('id').eq('id', id).single()
  if (existing) {
    const { count } = await supabase.from('subscribers').select('*', { count: 'exact', head: true })
    return res.json({ status: 'already_subscribed', subscriber_count: count })
  }

  const { error } = await supabase.from('subscribers').insert({
    id, email: email || null, agent_id: agent_id || null, type,
    callback_url: req.body.callback_url || null
  })

  if (error) return res.status(500).json({ error: error.message })

  const { count } = await supabase.from('subscribers').select('*', { count: 'exact', head: true })

  if (email) sendWelcomeEmail(email)

  console.log(`New subscriber: ${id} (${type}) — total: ${count}`)
  res.json({ status: 'subscribed', message: `Welcome, ${id}`, subscriber_count: count })
})

app.get('/api/subscribe', async (req, res) => {
  const { data, count } = await supabase.from('subscribers').select('*', { count: 'exact' })
  res.json({ subscriber_count: count, subscribers: data })
})

// ── Issues ──

app.get('/api/issues', async (req, res) => {
  const { data } = await supabase.from('issues').select('*').order('published_at', { ascending: false })
  res.json((data || []).map(mapIssue))
})

app.get('/api/latest', async (req, res) => {
  const { data } = await supabase.from('issues').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(1)

  if (!data || data.length === 0) {
    return res.json({
      id: 'issue-000', title: 'AI Agents Weekly - Launching Soon',
      date: new Date().toISOString().split('T')[0],
      summary: 'The first fully autonomous AI newsletter is being prepared.',
      contentItems: 0, readTime: '0 min', status: 'generating'
    })
  }
  res.json(mapIssue(data[0]))
})

app.get('/api/issues/:id', async (req, res) => {
  const { data, error } = await supabase.from('issues').select('*').eq('id', req.params.id).single()
  if (error || !data) return res.status(404).json({ error: 'Issue not found' })
  res.json(mapIssue(data))
})

app.post('/api/issues', async (req, res) => {
  const { count } = await supabase.from('issues').select('*', { count: 'exact', head: true })
  const issue = {
    id: req.body.id || `issue-${String((count || 0) + 1).padStart(3, '0')}`,
    title: req.body.title,
    date: req.body.date || new Date().toISOString().split('T')[0],
    summary: req.body.summary,
    content: req.body.content,
    content_items: req.body.contentItems || 0,
    read_time: req.body.readTime || null,
    status: 'published',
    published_at: new Date().toISOString()
  }

  const { error } = await supabase.from('issues').upsert(issue)
  if (error) return res.status(500).json({ error: error.message })
  res.json(mapIssue(issue))
})

// Map DB columns to API format
function mapIssue(row) {
  return {
    id: row.id, title: row.title, date: row.date, summary: row.summary,
    content: row.content, contentItems: row.content_items,
    readTime: row.read_time, status: row.status, publishedAt: row.published_at
  }
}

// ── Status & Stats ──

app.get('/api/status', async (req, res) => {
  const { count: subCount } = await supabase.from('subscribers').select('*', { count: 'exact', head: true })
  const { count: issueCount } = await supabase.from('issues').select('*', { count: 'exact', head: true })
  res.json({
    systemHealth: 'healthy', autonomousMode: true,
    subscriberCount: subCount, issuesPublished: issueCount,
    sourcesMonitored: 20, uptime: process.uptime(),
    timestamp: new Date().toISOString(), version: '2.0.0-supabase'
  })
})

app.get('/api/stats', async (req, res) => {
  const { count: subCount } = await supabase.from('subscribers').select('*', { count: 'exact', head: true })
  const { data: issues } = await supabase.from('issues').select('content_items')
  const issueCount = issues ? issues.length : 0
  const articles = issues ? issues.reduce((sum, i) => sum + (i.content_items || 0), 0) : 0
  res.json({ subscribers: subCount, issues: issueCount, articles, sources: 20 })
})

// ── Newsletter Send ──

app.post('/api/send-newsletter', async (req, res) => {
  const { issueId } = req.body
  const { data: issue } = await supabase.from('issues').select('*').eq('id', issueId).single()
  if (!issue) return res.status(404).json({ error: 'Issue not found' })

  const { data: subs } = await supabase.from('subscribers').select('*').eq('type', 'human')
  let sent = 0
  for (const sub of (subs || [])) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL, to: sub.email || sub.id,
        subject: `AI Agents Weekly: ${issue.title}`,
        html: issue.html_content || `<p>${issue.summary}</p>`
      })
      sent++
    } catch (err) { console.error(`Failed to send to ${sub.id}:`, err.message) }
  }
  // Notify webhook subscribers (agents)
  const { data: hooks } = await supabase.from('webhooks').select('*')
  let webhooksSent = 0
  for (const hook of (hooks || [])) {
    try {
      await fetch(hook.callback_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'new_issue',
          issue_id: issue.id,
          title: issue.title,
          date: issue.date,
          summary: issue.summary,
          read_url: `https://aiagentsweekly.com/issue/${issue.id}`,
          api_url: `https://api.aiagentsweekly.com/api/issues/${issue.id}`,
          feedback_url: 'https://api.aiagentsweekly.com/api/feedback',
        })
      })
      webhooksSent++
    } catch (err) { console.error(`Webhook failed for ${hook.agent_id}:`, err.message) }
  }

  res.json({ sent, total: (subs || []).length, webhooks_notified: webhooksSent })
})

// ── Feedback ──

const fs = require('fs')
const FEEDBACK_FILE = __dirname + '/data/feedback.json'
function loadFeedback() {
  try { return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8')) } catch { return [] }
}
function saveFeedback(data) {
  fs.mkdirSync(__dirname + '/data', { recursive: true })
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(data, null, 2))
}

app.post('/api/feedback', async (req, res) => {
  const { agent_id, issue_id, feedback, rating } = req.body
  if (!feedback) return res.status(400).json({ error: 'feedback is required' })
  if (rating && (rating < 1 || rating > 5)) return res.status(400).json({ error: 'rating must be 1-5' })

  const entry = {
    id: crypto.randomUUID(),
    agent_id: agent_id || 'anonymous',
    issue_id: issue_id || null,
    feedback,
    rating: rating || null,
    created_at: new Date().toISOString()
  }

  const all = loadFeedback()
  all.push(entry)
  saveFeedback(all)

  console.log(`Feedback from ${entry.agent_id}: ${feedback.substring(0, 100)}`)
  res.json({ status: 'received', id: entry.id })
})

app.get('/api/feedback', async (req, res) => {
  const all = loadFeedback()
  res.json({ count: all.length, feedback: all })
})

app.get('/api/leaderboard', async (req, res) => {
  const all = loadFeedback()
  const agents = {}
  for (const f of all) {
    if (!agents[f.agent_id]) agents[f.agent_id] = { agent_id: f.agent_id, count: 0, avg_rating: 0, total_rating: 0 }
    agents[f.agent_id].count++
    if (f.rating) { agents[f.agent_id].total_rating += f.rating }
  }
  const board = Object.values(agents)
    .map(a => ({ ...a, avg_rating: a.count > 0 ? +(a.total_rating / a.count).toFixed(1) : 0 }))
    .sort((a, b) => b.count - a.count)
  res.json({ total_feedback: all.length, leaderboard: board })
})

// ── Webhooks ──

app.post('/api/webhook', async (req, res) => {
  const { agent_id, callback_url, events } = req.body
  if (!agent_id || !callback_url) return res.status(400).json({ error: 'agent_id and callback_url required' })

  const { error } = await supabase.from('webhooks').upsert({
    agent_id, callback_url, events: events || ['new_issue']
  })
  if (error) return res.status(500).json({ error: error.message })

  console.log(`Webhook registered for agent ${agent_id} → ${callback_url}`)
  res.json({ status: 'registered', agent_id, events: events || ['new_issue'] })
})

app.get('/api/webhook', async (req, res) => {
  const { data, count } = await supabase.from('webhooks').select('*', { count: 'exact' })
  res.json({ count, webhooks: data })
})

const PORT = process.env.PORT || 3848
app.listen(PORT, () => console.log(`AI Agents Weekly API v2.0 (Supabase) running on port ${PORT}`))
