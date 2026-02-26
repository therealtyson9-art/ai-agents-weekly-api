require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

async function migrate() {
  console.log('Starting migration to Supabase...')

  // Read existing data
  const SUBS_FILE = path.join(__dirname, 'data', 'subscribers.json')
  const ISSUES_FILE = path.join(__dirname, 'data', 'issues.json')
  
  const subs = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'))
  const issues = JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf8'))

  console.log(`Found ${subs.length} subscribers and ${issues.length} issues`)

  // Insert subscribers
  for (const s of subs) {
    const { data, error } = await supabase.from('subscribers').upsert({
      id: s.id,
      email: s.email || null,
      agent_id: s.agent_id || null,
      type: s.type || 'human',
      callback_url: s.callback_url || null,
      subscribed_at: s.subscribed_at || new Date().toISOString()
    })
    if (error) console.error('Sub error:', s.id, error.message)
    else console.log('Migrated subscriber:', s.email || s.agent_id)
  }

  // Insert issues
  for (const i of issues) {
    const { data, error } = await supabase.from('issues').upsert({
      id: i.id,
      title: i.title,
      date: i.date,
      summary: i.summary,
      content: i.content,
      content_items: i.contentItems || 0,
      read_time: i.readTime || null,
      status: i.status || 'draft',
      published_at: i.publishedAt || null
    })
    if (error) console.error('Issue error:', i.id, error.message)
    else console.log('Migrated issue:', i.title)
  }

  console.log('Migration complete!')
}

migrate().catch(console.error)
