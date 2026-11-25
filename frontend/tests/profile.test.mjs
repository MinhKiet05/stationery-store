import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let vite, profiles, orders, guest, cache, auth;
const original={fetch:globalThis.fetch,storage:globalThis.localStorage,window:globalThis.window};
let token='session-A'; const events=new EventTarget();
before(async()=>{
  process.env.VITE_API_BASE_URL = "";
  globalThis.localStorage={getItem:key=>key==='accessToken'?token:null,removeItem:key=>{if(key==='accessToken')token=null;}};
  globalThis.window=events;
  vite=await createServer({server:{middlewareMode:true}});
  profiles=await vite.ssrLoadModule('/src/services/userService.ts');
  auth=await vite.ssrLoadModule('/src/services/authService.ts');
  orders=await vite.ssrLoadModule('/src/services/orderService.ts');
  guest=await vite.ssrLoadModule('/src/utils/guestCart.ts');
  cache=await vite.ssrLoadModule('/src/services/queryCache.js');
});
afterEach(()=>{cache.queryClient.clear();globalThis.fetch=original.fetch;token='session-A';});
after(async()=>{await vite?.close();globalThis.fetch=original.fetch;globalThis.localStorage=original.storage;globalThis.window=original.window;});
test('profile reads the authenticated self endpoint and saves only the submitted profile contract',async()=>{
  const body={email:'self@example.test',fullName:'Customer',phoneNumber:'0900000000',address:'Address'},calls=[];
  globalThis.fetch=async(path,options)=>{calls.push({path,options});return Response.json({userID:3,...body});};
  assert.equal((await profiles.getMyProfile()).userID,3);
  const updated=await profiles.updateMyProfile(body);
  assert.equal(updated.email,body.email);assert.ok(calls.every(c=>c.path==='/api/users/me'));
  assert.equal(new Headers(calls[0].options.headers).get('Authorization'),'Bearer session-A');
  assert.equal(calls[1].options.method,'PUT');assert.deepEqual(JSON.parse(calls[1].options.body),body);
});
test('order history sends page, size, search and status to backend; summary never downloads the legacy list',async()=>{
  const calls=[];globalThis.fetch=async(path)=>{calls.push(path);return Response.json({content:[],totalElements:30,totalPages:8,statusCounts:{SHIPPED:3}});};
  const result=await orders.getMyOrderHistory({page:2,size:4,search:'but gel',status:'SHIPPED'});
  const url=new URL(calls[0],'http://test');assert.equal(url.searchParams.get('page'),'2');assert.equal(url.searchParams.get('size'),'4');
  assert.equal(url.searchParams.get('search'),'but gel');assert.equal(url.searchParams.get('status'),'SHIPPED');assert.equal(result.totalElements,30);
  await orders.getMyOrderHistory({summary:true});assert.equal(new URL(calls[1],'http://test').searchParams.get('summary'),'true');
});
test('late self-profile read from another session is rejected without clearing the new login',async()=>{
  globalThis.fetch=async()=>{token='session-B';return Response.json({fullName:'old private profile'});};
  await assert.rejects(profiles.getMyProfile(),{name:'AbortError'});assert.equal(token,'session-B');
});
test('expired session is cleared and profile cannot be reused as a successful response',async()=>{
  globalThis.fetch=async()=>Response.json({}, {status:401});
  await assert.rejects(profiles.getMyProfile(),error=>error.status===401);assert.equal(token,null);
});
test('malformed guest cart storage cannot break the shared header',()=>{
  const saved=globalThis.localStorage;
  for(const value of ['{}','null','invalid','[{"variantID":1,"quantity":-1}]']) {
    globalThis.localStorage={getItem:()=>value};assert.deepEqual(guest.getGuestCart(),[]);
  }
  globalThis.localStorage=saved;
});
test('session changes while decoding response bodies cannot return old private data',async()=>{
  const response=()=>({ok:true,status:200,json:async()=>{token='session-B';return {fullName:'Old private profile'};}});
  globalThis.fetch=async()=>response();
  await assert.rejects(profiles.getMyProfile(),{name:'AbortError'});
  token='session-A';cache.sessionScope();
  await assert.rejects(auth.getCurrentUser('http://test'),{name:'AbortError'});
  assert.equal(token,'session-B');
});
test('a late 401 cannot log out a newly established session even if its token string is reused',async()=>{
  globalThis.fetch=async()=>{
    token=null;cache.sessionScope();token='session-A';cache.sessionScope();
    return Response.json({}, {status:401});
  };
  await assert.rejects(profiles.getMyProfile(),error=>error.status===401);
  assert.equal(token,'session-A');
});
