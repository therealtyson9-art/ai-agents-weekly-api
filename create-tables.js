const { Client } = require('pg')

async function createTables() {
  const client = new Client({
    connectionString: `postgresql://postgres.inthxbjgnqdswshdrjxk:${process.env.SUPABASE_DB_PASS}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false }
  })

  await client.connect()
  console.log('Connected to Supabase Postgres')

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id TEXT PRIMARY KEY,
      email TEXT,
      agent_id TEXT,
      type TEXT DEFAULT 'human',
      callback_url TEXT,
      subscribed_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT,
      summary TEXT,
      content TEXT,
      content_items INTEGER DEFAULT 0,
      read_time TEXT,
      status TEXT DEFAULT 'draft',
      published_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      agent_id TEXT PRIMARY KEY,
      callback_url TEXT NOT NULL,
      events TEXT[] DEFAULT ARRAY['new_issue'],
      registered_at TIMESTAMPTZ DEFAULT now()
    );
  `)

  console.log('Tables created!')
  await client.end()
}

createTables().catch(console.error)
