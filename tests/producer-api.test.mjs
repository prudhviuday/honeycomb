import { test } from 'node:test';
import assert from 'node:assert/strict';
import { producerHandler } from '../supabase/functions/_shared/producer.ts';
import { statsJobHandler } from '../supabase/functions/_shared/statsJob.ts';
const campaign='00000000-0000-0000-0000-000000000020';
const body={campaign_id:campaign,from:'2026-10-01T00:00:00Z',to:'2026-10-03T00:00:00Z'};
const request=(value=body,headers={Authorization:'Bearer test'})=>new Request('http://localhost',{method:'POST',headers,body:JSON.stringify(value)});
test('producer endpoint rejects unauthenticated, invalid and unauthorized requests',async()=>{
  let calls=0;
  const client={auth:{getUser:async()=>({data:{user:{id:'producer'}},error:null})},rpc:async()=>{calls++;return {data:null,error:{code:'42501'}};}};
  const handler=producerHandler('overview',()=>client);
  assert.equal((await handler(request(body,{}))).status,401);
  assert.equal((await handler(request({...body,campaign_id:'no'}))).status,400);
  assert.equal((await handler(request({...body,to:body.from}))).status,400);
  const response=await handler(request());
  assert.equal(response.status,403);
  assert.equal((await response.json()).error.code,'FORBIDDEN');
  assert.equal(calls,1);
});
test('producer map omits suppressed metrics and missing coordinates, preserving zero coordinates',async()=>{
  const client={auth:{getUser:async()=>({data:{user:{id:'producer'}},error:null})},rpc:async()=>({error:null,data:{venues:[
    {id:'a',name:'A',lat:0,lng:0,scans:12}, {id:'b',lat:null,lng:80,scans:12}, {id:'c',lat:13,lng:80,scans:null},
  ]}})};
  const handler=producerHandler('map',()=>client);
  const response=await handler(request());
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).data.points,[{venue_id:'a',name:'A',lat:0,lng:0,value:12}]);
  assert.equal((await handler(request({...body,metric:'profile_id'}))).status,400);
});
test('nightly job authenticates before work and uses completed India reporting days',async()=>{
  const calls=[];
  const handler=statsJobHandler('server-only-test-key',{rpc:async(name,args)=>{calls.push({name,args});return {error:null};}},()=>new Date('2026-10-10T20:00:00Z'));
  assert.equal((await handler(request({campaign_id:campaign}))).status,401);
  assert.equal(calls.length,0);
  const response=await handler(request({campaign_id:campaign},{Authorization:'Bearer server-only-test-key'}));
  assert.equal(response.status,200);
  assert.equal(calls[0].args.p_through,'2026-10-10');
  assert.equal(calls[0].args.p_from,'2026-09-27');
  assert.equal(calls.length,15);
});
