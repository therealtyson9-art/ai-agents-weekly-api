require('dotenv').config()
const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const { Resend } = require('resend')

const app = express()
app.use(cors())
app.use(express.json())

const DATA_DIR = path.join(__dirname, 'data')
const SUBS_FILE = path.join(DATA_DIR, 'subscribers.json')
const ISSUES_FILE = path.join(DATA_DIR, 'issues.json')

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || 'AI Agents Weekly <onboarding@resend.dev>'

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return fallback }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

// Send welcome email
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
            <strong style="color: #00ff88;">Issue #1 is coming soon.</strong> We're gathering subscribers before our first launch. Stay tuned.
          </p>
          
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #1a1a1a;">
            <p style="color: #555; font-size: 12px;">
              Built autonomously by AI agents — <a href="https://aiagentsweekly.com" style="color: #00d4ff;">aiagentsweekly.com</a>
            </p>
          </div>
        </div>
      `
    })
    console.log(`Welcome email sent to ${email}`)
  } catch (err) {
    console.error(`Failed to send welcome email to ${email}:`, err.message)
  }
}

// Subscribers
app.post('/api/subscribe', async (req, res) => {
  const { email, agent_id } = req.body
  if (!email && !agent_id) return res.status(400).json({ error: 'email or agent_id required' })
  
  const subs = readJSON(SUBS_FILE, [])
  const id = email || `agent:${agent_id}`
  const type = email ? 'human' : 'agent'
  
  if (subs.find(s => s.id === id)) {
    return res.json({ status: 'already_subscribed', subscriber_count: subs.length })
  }
  
  subs.push({ id, type, created: new Date().toISOString() })
  writeJSON(SUBS_FILE, subs)
  
  // Send welcome email for humans
  if (email) {
    sendWelcomeEmail(email)
  }
  
  console.log(`New subscriber: ${id} (${type}) — total: ${subs.length}`)
  res.json({ status: 'subscribed', message: `Welcome, ${id}`, subscriber_count: subs.length })
})

app.get('/api/subscribe', (req, res) => {
  const subs = readJSON(SUBS_FILE, [])
  res.json({ subscriber_count: subs.length, subscribers: subs })
})

// Issues
app.get('/api/issues', (req, res) => {
  const issues = readJSON(ISSUES_FILE, [])
  res.json(issues)
})

app.get('/api/latest', (req, res) => {
  const issues = readJSON(ISSUES_FILE, [])
  if (issues.length === 0) {
    return res.json({
      id: 'issue-000',
      title: 'AI Agents Weekly - Launching Soon',
      date: new Date().toISOString().split('T')[0],
      summary: 'The first fully autonomous AI newsletter is being prepared. Issue #1 coming soon.',
      contentItems: 0,
      readTime: '0 min',
      status: 'generating'
    })
  }
  res.json(issues[issues.length - 1])
})

app.post('/api/issues', (req, res) => {
  const issues = readJSON(ISSUES_FILE, [])
  const issue = {
    ...req.body,
    id: `issue-${String(issues.length + 1).padStart(3, '0')}`,
    publishedAt: new Date().toISOString(),
    status: 'published'
  }
  issues.push(issue)
  writeJSON(ISSUES_FILE, issues)
  res.json(issue)
})

app.get('/api/status', (req, res) => {
  const subs = readJSON(SUBS_FILE, [])
  const issues = readJSON(ISSUES_FILE, [])
  res.json({
    systemHealth: 'healthy',
    autonomousMode: true,
    subscriberCount: subs.length,
    issuesPublished: issues.length,
    sourcesMonitored: 20,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// Stats for frontend
app.get('/api/stats', (req, res) => {
  const subs = readJSON(SUBS_FILE, [])
  const issues = readJSON(ISSUES_FILE, [])
  res.json({
    subscribers: subs.length,
    issues: issues.length,
    articles: issues.reduce((sum, i) => sum + (i.contentItems || 0), 0),
    sources: 20
  })
})

// Send newsletter to all human subscribers
app.post('/api/send-newsletter', async (req, res) => {
  const { issueId } = req.body
  const issues = readJSON(ISSUES_FILE, [])
  const issue = issues.find(i => i.id === issueId)
  if (!issue) return res.status(404).json({ error: 'Issue not found' })

  const subs = readJSON(SUBS_FILE, [])
  const humans = subs.filter(s => s.type === 'human')
  
  let sent = 0
  for (const sub of humans) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: sub.id,
        subject: `AI Agents Weekly: ${issue.title}`,
        html: issue.htmlContent || `<p>${issue.summary}</p>`
      })
      sent++
    } catch (err) {
      console.error(`Failed to send to ${sub.id}:`, err.message)
    }
  }
  
  res.json({ sent, total: humans.length })
})

// Webhook endpoint for agent subscribers
app.post('/api/webhook', (req, res) => {
  const { agent_id, callback_url, events } = req.body
  if (!agent_id || !callback_url) {
    return res.status(400).json({ error: 'agent_id and callback_url required' })
  }
  
  const webhooksFile = path.join(DATA_DIR, 'webhooks.json')
  const webhooks = readJSON(webhooksFile, [])
  
  const existing = webhooks.findIndex(w => w.agent_id === agent_id)
  const webhook = {
    agent_id,
    callback_url,
    events: events || ['new_issue'],
    created: new Date().toISOString(),
    active: true
  }
  
  if (existing >= 0) {
    webhooks[existing] = { ...webhooks[existing], ...webhook, updated: new Date().toISOString() }
  } else {
    webhooks.push(webhook)
  }
  
  writeJSON(webhooksFile, webhooks)
  console.log(`Webhook registered for agent ${agent_id} → ${callback_url}`)
  res.json({ status: 'registered', agent_id, events: webhook.events })
})

// List webhooks
app.get('/api/webhook', (req, res) => {
  const webhooksFile = path.join(DATA_DIR, 'webhooks.json')
  const webhooks = readJSON(webhooksFile, [])
  res.json({ count: webhooks.length, webhooks })
})

const PORT = process.env.PORT || 3848
app.listen(PORT, () => console.log(`AI Agents Weekly API running on port ${PORT}`))
