import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { logEvent } from '../supabase/functions/_shared/logEvent.ts';

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration = await readFile(new URL('../supabase/blueprint/location_analytics.sql',import.meta.url),'utf8');
async function fixture() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
    CREATE TABLE profiles(id uuid PRIMARY KEY,role text);
    CREATE TABLE movies(id uuid PRIMARY KEY,title text);
    CREATE TABLE campaigns(id uuid PRIMARY KEY,movie_id uuid REFERENCES movies,name text);
    CREATE TABLE campaign_members(campaign_id uuid REFERENCES campaigns,profile_id uuid REFERENCES profiles,member_role text,PRIMARY KEY(campaign_id,profile_id));
    CREATE TABLE venues(id uuid PRIMARY KEY,name text,address text,city text,phone text,created_at timestamptz DEFAULT now());
    CREATE TABLE qr_codes(id uuid PRIMARY KEY,campaign_id uuid REFERENCES campaigns,venue_id uuid REFERENCES venues);
    CREATE TABLE hunts(id uuid PRIMARY KEY,campaign_id uuid REFERENCES campaigns);
    CREATE TABLE tasks(id uuid PRIMARY KEY,hunt_id uuid REFERENCES hunts);
    CREATE TABLE rewards(id uuid PRIMARY KEY,campaign_id uuid REFERENCES campaigns);
    CREATE TABLE enrollments(profile_id uuid REFERENCES profiles,campaign_id uuid REFERENCES campaigns,first_venue_id uuid REFERENCES venues,joined_at timestamptz DEFAULT now(),PRIMARY KEY(profile_id,campaign_id));
    CREATE TABLE hunt_progress(profile_id uuid REFERENCES profiles,hunt_id uuid REFERENCES hunts,status text,completed_at timestamptz,UNIQUE(profile_id,hunt_id));`);
  await db.exec(migration);
  await db.exec(`INSERT INTO profiles VALUES('${id(1)}','producer'),('${id(2)}','fan'),('${id(3)}','admin'),('${id(4)}','field_promoter');
    INSERT INTO movies VALUES('${id(10)}','Synthetic film');
    INSERT INTO campaigns VALUES('${id(20)}','${id(10)}','A'),('${id(21)}','${id(10)}','B');
    INSERT INTO venues(id,name,lat,lng,phone) VALUES('${id(30)}','A',13,80,'private'),('${id(31)}','B',NULL,NULL,'private');
    INSERT INTO campaign_venues(campaign_id,venue_id) VALUES('${id(20)}','${id(30)}'),('${id(21)}','${id(31)}');
    INSERT INTO campaign_members VALUES('${id(20)}','${id(1)}','producer'),('${id(20)}','${id(4)}','promoter');
    INSERT INTO qr_codes VALUES('${id(40)}','${id(20)}','${id(30)}'),('${id(41)}','${id(21)}','${id(31)}');
    INSERT INTO hunts VALUES('${id(50)}','${id(20)}'),('${id(51)}','${id(21)}');
    INSERT INTO tasks VALUES('${id(60)}','${id(50)}'),('${id(61)}','${id(51)}');
    INSERT INTO rewards VALUES('${id(70)}','${id(20)}'),('${id(71)}','${id(21)}');`);
  return db;
}
async function login(db,n,role='authenticated') {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${id(n)}',false); SET ROLE ${role};`);
}
async function report(db) {
  return (await db.query(`SELECT blueprint_report('${id(20)}','2026-10-01T00:00:00+05:30','2026-10-04T00:00:00+05:30') data`)).rows[0].data;
}
async function event(db,n,key,type='QR_SCANNED',options={}) {
  const client = { async rpc(name,args) {
    const keys=Object.keys(args);
    const result=await db.query(`SELECT ${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) id`,Object.values(args));
    return {data:result.rows[0].id,error:null};
  }};
  return logEvent(client,{campaignId:id(20),profileId:n==null?null:id(n),eventType:type,eventKey:key,
    qrId:id(40),metadata:type==='QR_SCANNED'?{is_valid:true,source:'scan'}:{},occurredAt:'2026-10-02T12:00:00+05:30',...options});
}

test('blueprint prerequisites fail closed on the old schema',async()=>{
  const db=new PGlite();
  try { await assert.rejects(()=>db.exec(migration),/Blueprint core schema/); }
  finally { await db.close(); }
});

test('blueprint event boundary, privacy, roles, valid scans and retry-safe daily totals',async()=>{
  const db=await fixture();
  try {
    await login(db,1);
    await assert.rejects(()=>event(db,2,'forged'),/permission denied/);
    await assert.rejects(()=>db.query('SELECT * FROM events'),/permission denied/);
    await assert.rejects(()=>db.query('SELECT * FROM campaign_daily_stats'),/permission denied/);
    await login(db,2); await assert.rejects(()=>report(db),/access required/);
    await login(db,4); await assert.rejects(()=>report(db),/access required/);
    await login(db,1); await assert.rejects(()=>db.query(`SELECT blueprint_report('${id(21)}',now()-interval '1 day',now())`),/access required/);
    await login(db,3); assert.equal((await report(db)).summary.scans,0);
    await db.exec('RESET ROLE');
    for(let n=100;n<110;n++) await db.query(`INSERT INTO profiles VALUES($1,'fan');`,[id(n)]);
    await db.exec('SET ROLE service_role');
    const first=await event(db,100,'scan-100');
    assert.equal(await event(db,100,'scan-100'),first);
    await assert.rejects(()=>event(db,101,'scan-100'),/different operation/);
    await assert.rejects(()=>event(db,100,'bad-qr','QR_SCANNED',{qrId:id(41)}),/mismatch/);
    await assert.rejects(()=>event(db,100,'bad-task','TASK_COMPLETED',{taskId:id(61)}),/mismatch/);
    await assert.rejects(()=>event(db,100,'bad-reward','REWARD_CLAIMED',{rewardId:id(71)}),/mismatch/);
    await assert.rejects(()=>event(db,100,'pii','TASK_STARTED',{metadata:{phone:'secret'}}),/Unsupported metadata/);
    await assert.rejects(()=>db.query(`UPDATE events SET metadata='{}'`),/permission denied/);
    await login(db,1);
    let data=await report(db); assert.equal(data.summary.scans,null); assert.equal(data.venues[0].scans,null);
    assert.equal(JSON.stringify(data).includes('private'),false);
    await db.exec('RESET ROLE; SET ROLE service_role');
    for(let n=101;n<110;n++) await event(db,n,`scan-${n}`);
    await event(db,100,'invalid','QR_SCANNED',{metadata:{is_valid:false,source:'scan'}});
    await event(db,100,'link','QR_SCANNED',{metadata:{is_valid:true,source:'direct_link'}});
    await event(db,null,'anonymous');
    await event(db,100,'task','TASK_COMPLETED',{taskId:id(60)});
    await event(db,100,'next-day','TASK_STARTED',{occurredAt:'2026-10-02T19:00:00Z'});
    await login(db,1);
    data=await report(db);
    assert.equal(data.summary.scans,11); assert.equal(data.summary.unique_users,10);
    assert.equal(data.summary.task_completions,null); assert.equal(data.summary.engagement_rate,null);
    assert.equal(data.summary.repeat_users,null); assert.equal(data.daily.length,2);
    assert.equal(data.daily[1].unique_users,null); assert.equal(data.venues[0].lat,13);
    assert.equal(data.exposure,null); assert.equal(data.hype,null);
    await db.exec(`RESET ROLE; SET ROLE service_role; SELECT blueprint_compute_stats('${id(20)}','2026-10-02','2026-10-03'); SELECT blueprint_compute_stats('${id(20)}','2026-10-02','2026-10-03');`);
    const stats=await db.query(`SELECT * FROM campaign_daily_stats ORDER BY stat_date,venue_id NULLS FIRST`);
    assert.equal(stats.rows.length,4); assert.equal(Number(stats.rows[0].scans),11);
    assert.equal(Number(stats.rows[0].unique_users),10);
    await db.exec('RESET ROLE');
    for(let n=100;n<110;n++) {
      await db.query(`INSERT INTO enrollments VALUES($1,$2,$3,'2026-10-01T00:00:00Z')`,[id(n),id(20),id(30)]);
      await db.query(`INSERT INTO hunt_progress VALUES($1,$2,'completed','2026-10-02T12:00:00Z')`,[id(n),id(50)]);
    }
    await login(db,1);
    data=await report(db);
    assert.equal(data.summary.total_users,10);
    assert.equal(data.summary.hunt_completions,10);
    assert.equal(data.venues[0].hunt_completions,10);
    assert.equal(data.venues[0].conversion_rate,90.9);
    assert.equal(data.funnel.find(s=>s.event_type==='HUNT_COMPLETED').users,10);
    await db.exec('RESET ROLE');
    await db.query(`DELETE FROM enrollments WHERE profile_id=$1`,[id(109)]);
    await db.query(`DELETE FROM hunt_progress WHERE profile_id=$1`,[id(109)]);
    await db.query(`DELETE FROM profiles WHERE id=$1`,[id(109)]);
    assert.equal((await db.query(`SELECT count(*) n FROM events WHERE profile_id IS NULL`)).rows[0].n,2);
  } finally { await db.close(); }
});

test('hype requires targets, protects small cohorts, and recomputes a bounded snapshot',async()=>{
  const db=await fixture();
  try {
    await db.exec(`SELECT blueprint_compute_hype('${id(20)}','2026-10-03');`);
    assert.equal((await db.query('SELECT * FROM hype_snapshots')).rows.length,0);
    await db.exec(`INSERT INTO hype_config(campaign_id,targets) VALUES('${id(20)}','{"S":10,"G":1,"C":1,"R":1,"H":1,"W":1}');`);
    await db.exec(`SELECT blueprint_compute_hype('${id(20)}','2026-10-03');`);
    assert.equal((await db.query('SELECT * FROM hype_snapshots')).rows.length,0);
    for(let n=100;n<110;n++) {
      await db.query(`INSERT INTO profiles VALUES($1,'fan')`,[id(n)]);
      await event(db,n,`prior-${n}`,'TASK_STARTED',{occurredAt:'2026-09-23T12:00:00+05:30'});
      await event(db,n,`now-${n}`,'QR_SCANNED',{occurredAt:'2026-10-03T12:00:00+05:30'});
    }
    await db.exec(`SELECT blueprint_compute_hype('${id(20)}','2026-10-03'); SELECT blueprint_compute_hype('${id(20)}','2026-10-03');`);
    let rows=(await db.query('SELECT * FROM hype_snapshots')).rows;
    assert.equal(rows.length,1); assert.equal(rows[0].score,25);
    await db.exec(`UPDATE hype_config SET weights='{"S":1,"G":1,"C":1,"R":1,"H":1,"W":1}'`);
    await assert.rejects(()=>db.exec(`SELECT blueprint_compute_hype('${id(20)}','2026-10-03')`),/sum to one/);
    rows=(await db.query('SELECT * FROM hype_snapshots')).rows;
    assert.equal(rows.length,1); // failed job rolled back, preserving the prior snapshot
  } finally { await db.close(); }
});
