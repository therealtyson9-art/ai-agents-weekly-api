require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

async function setup() {
  console.log('Testing Supabase connection...')
  
  // Test if tables exist by trying to query them
  const { data: subTest, error: subErr } = await supabase.from('subscribers').select('id').limit(1)
  if (subErr && subErr.code === '42P01') {
    console.log('Tables do not exist yet. Please create them in Supabase SQL Editor.')
    console.log('Run the SQL from the Discord message, then re-run this script.')
    process.exit(1)
  }
  
  if (subErr) {
    console.error('Unexpected error:', subErr)
    process.exit(1)
  }

  console.log('Tables exist! Starting data migration...')

  // Read existing JSON data
  const subs = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'subscribers.json'), 'utf8'))
  const issues = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'issues.json'), 'utf8'))

  console.log(`Migrating ${subs.length} subscribers...`)
  for (const s of subs) {
    const { error } = await supabase.from('subscribers').upsert({
      id: s.id,
      email: s.email || null,
      agent_id: s.agent_id || null,
      type: s.type || 'human',
      callback_url: s.callback_url || null,
      subscribed_at: s.subscribed_at || new Date().toISOString()
    })
    if (error) console.error(`  ✗ ${s.email || s.agent_id}: ${error.message}`)
    else console.log(`  ✓ ${s.email || s.agent_id}`)
  }

  console.log(`Migrating ${issues.length} issues...`)
  for (const i of issues) {
    const { error } = await supabase.from('issues').upsert({
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
    if (error) console.error(`  ✗ ${i.id}: ${error.message}`)
    else console.log(`  ✓ ${i.title}`)
  }

  // Verify
  const { count: subCount } = await supabase.from('subscribers').select('*', { count: 'exact', head: true })
  const { count: issueCount } = await supabase.from('issues').select('*', { count: 'exact', head: true })
  console.log(`\nMigration complete! Subscribers: ${subCount}, Issues: ${issueCount}`)
}

setup().catch(console.error)
