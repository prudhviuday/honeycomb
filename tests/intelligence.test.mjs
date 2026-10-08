import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  reportingRange,
  analyticsHeatmap,
  rankedLocations,
} from "../src/modules/analytics/logic/analyticsLogic.ts";

test("India reporting dates use an exclusive end and reject reversed ranges", () => {
  assert.deepEqual(reportingRange("2026-10-01", "2026-10-01"), {
    from: "2026-09-30T18:30:00.000Z",
    to: "2026-10-01T18:30:00.000Z",
  });
  assert.throws(() => reportingRange("2026-10-02", "2026-10-01"));
  assert.throws(() => reportingRange("", "2026-10-01"));
  assert.throws(() => reportingRange("2020-01-01", "2026-10-01"));
});
test("map metric selection excludes zero/malformed points and ranking does not mutate input", () => {
  const locations = [
    {
      id: "a",
      name: "A",
      latitude: 13,
      longitude: 80,
      scans: 2,
      engagement_rate: 50,
    },
    {
      id: "b",
      name: "B",
      latitude: 12,
      longitude: 79,
      scans: 8,
      engagement_rate: 0,
    },
  ];
  assert.deepEqual(analyticsHeatmap(locations, "engagement_rate"), [
    { latitude: 13, longitude: 80, weight: 20 },
  ]);
  assert.equal(rankedLocations(locations, "scans")[0].id, "b");
  assert.equal(locations[0].id, "a");
});

test("PostgreSQL migration, event idempotency, attribution, access boundaries and analytics", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth, public TO authenticated,anon,service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon,service_role;`);
    for (const name of [
      "20261003152644_create_campaign_schema.sql",
      "20261006034800_add_user_location_heatmaps.sql",
      "20261006034900_harden_location_heatmap_rpc.sql",
      "20261006035000_extend_location_heatmaps_to_campaign_events.sql",
      "20261007090000_location_intelligence.sql",
    ]) {
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    }
    const user = "10000000-0000-0000-0000-000000000001";
    const other = "10000000-0000-0000-0000-000000000002";
    const campaign = "20000000-0000-0000-0000-000000000001";
    const otherCampaign = "20000000-0000-0000-0000-000000000002";
    const location = "30000000-0000-0000-0000-000000000001";
    const source = "40000000-0000-0000-0000-000000000001";
    const mission = "50000000-0000-0000-0000-000000000001";
    await db.exec(`INSERT INTO auth.users VALUES ('${user}'),('${other}');
      INSERT INTO campaigns(id,title) VALUES ('${campaign}','Campaign A'),('${otherCampaign}','Campaign B');
      INSERT INTO locations(id,campaign_id,name,latitude,longitude) VALUES ('${location}','${campaign}','Venue',13,80);
      INSERT INTO interaction_sources(id,campaign_id,name,location_id) VALUES ('${source}','${campaign}','Standee','${location}');
      INSERT INTO analytics_members VALUES ('${campaign}','${user}');
      SELECT set_config('request.jwt.claim.sub','${user}',false);
      INSERT INTO scans(campaign_id,user_id,interaction_source_id) VALUES ('${campaign}','${user}','${source}');
      INSERT INTO missions(id,campaign_id,title) VALUES ('${mission}','${campaign}','Scan');
      INSERT INTO mission_progress(campaign_id,user_id,mission_id,completed) VALUES ('${campaign}','${user}','${mission}',true);
      UPDATE mission_progress SET progress=3 WHERE mission_id='${mission}';
      INSERT INTO campaign_users(campaign_id,user_id) VALUES ('${campaign}','${user}');`);
    const get = async (c = campaign) =>
      (
        await db.query(
          "SELECT get_campaign_analytics($1, now()-interval '1 day', now()+interval '1 minute') AS data",
          [c],
        )
      ).rows[0].data;
    const nearby = await db.query("SELECT * FROM get_nearby_campaign_locations(13,80,5)");
    assert.equal(nearby.rows.length, 1);
    assert.equal(nearby.rows[0].id, location);
    assert.ok(nearby.rows[0].distance_km < 0.001);
    await assert.rejects(() => db.query("SELECT * FROM get_nearby_campaign_locations(91,80,5)"), /Invalid nearby search/);
    let data = await get();
    assert.equal(data.summary.scans, 1);
    assert.equal(
      data.summary.task_completions,
      1,
      "updating completed task must not count twice",
    );
    assert.equal(data.summary.unique_users, 1);
    assert.equal(data.summary.engagement_rate, 100);
    assert.equal(data.locations[0].scans, 1);
    assert.equal(data.unattributed_interactions, 2);
    await db.exec(`SET ROLE authenticated;`);
    assert.equal((await get()).summary.scans, 1);
    await assert.rejects(() => get(otherCampaign), /access required/);
    await assert.rejects(
      () =>
        db.exec(
          `INSERT INTO analytics_members VALUES ('${otherCampaign}','${user}')`,
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query("SELECT record_campaign_event($1,$2,$3,$4)", [
          campaign,
          user,
          "QR_SCANNED",
          "forged",
        ]),
      /permission denied/,
    );
    await db.exec(
      "RESET ROLE; GRANT INSERT,SELECT ON activity_events TO authenticated; SET ROLE authenticated;",
    );
    await db.query(
      "INSERT INTO activity_events(campaign_id,user_id,event_type,origin,event_key) VALUES($1,$2,'QR_SCANNED','server','forged')",
      [campaign, user],
    );
    assert.equal(
      (await get()).summary.scans,
      1,
      "client cannot forge trusted events",
    );
    await db.exec(
      `SELECT set_config('request.jwt.claim.sub','${other}',false)`,
    );
    await assert.rejects(() => get(), /access required/);
    await db.exec("RESET ROLE;");
    await assert.rejects(
      () =>
        db.query("SELECT record_campaign_event($1,$2,$3,$4,$5,$6)", [
          otherCampaign,
          user,
          "QR_SCANNED",
          "wrong-campaign",
          location,
          source,
        ]),
      /Source does not belong/,
    );
    for (let i = 0; i < 2; i++)
      await db.query("SELECT record_campaign_event($1,$2,$3,$4,$5,$6)", [
        campaign,
        other,
        "QR_SCANNED",
        "second-scan",
        location,
        source,
      ]);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${user}',false)`);
    data = await get();
    assert.equal(data.summary.scans, 2, "idempotent server event key");
    assert.equal(data.summary.unique_users, 2);
    assert.equal(data.summary.engagement_rate, 50);
    assert.equal(
      (await db.query("SELECT * FROM get_location_heatmap(NULL)")).rows.length,
      0,
      "no cross-campaign GPS feed",
    );
    assert.equal(
      Number(
        (await db.query("SELECT * FROM get_location_heatmap($1)", [campaign]))
          .rows[0].latitude,
      ),
      13,
    );
    await assert.rejects(
      () => db.query("SELECT record_user_location($1,$2)", [91, 80]),
      /Invalid location/,
    );
  } finally {
    await db.close();
  }
});
